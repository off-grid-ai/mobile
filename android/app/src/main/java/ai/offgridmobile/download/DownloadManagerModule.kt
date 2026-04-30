package ai.offgridmobile.download

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.provider.Settings
import androidx.lifecycle.Observer
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import ai.offgridmobile.SafePromise

class DownloadManagerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val downloadDao = DownloadDatabase.getInstance(reactContext).downloadDao()
    private val workManager = WorkManager.getInstance(reactContext)

    // LiveData observers keyed by downloadId — enables real-time progress tracking
    // Future: integrate with device connectivity service to enforce WiFi-only downloads
    // when requested, allowing models to resume over cellular if necessary.
    private val workObservers = mutableMapOf<Long, Observer<List<WorkInfo>>>()

    init {
        DownloadEventBridge.attach(reactContext)
    }

    override fun getName(): String = NAME

    override fun onCatalystInstanceDestroy() {
        workObservers.keys.toList().forEach { removeWorkObserver(it) }
        workObservers.clear()
        super.onCatalystInstanceDestroy()
        scope.cancel()
    }

    // -------------------------------------------------------------------------
    // React methods
    // -------------------------------------------------------------------------

    @ReactMethod
    fun startDownload(params: ReadableMap, promise: Promise) {
        scope.launch {
            try {
                val url = params.getString("url")
                    ?: return@launch SafePromise(promise, NAME).reject("DOWNLOAD_ERROR", "URL is required")
                val fileName = params.getString("fileName")?.let { File(it).name }
                    ?: return@launch SafePromise(promise, NAME).reject("DOWNLOAD_ERROR", "fileName is required")

                // SSRF: validate host against allowlist
                if (!WorkerDownload.isHostAllowed(url)) {
                    return@launch SafePromise(promise, NAME).reject("DOWNLOAD_ERROR", "Download URL host not allowed")
                }

                val modelId = params.getString("modelId") ?: ""
                val title = params.getString("title") ?: fileName
                val totalBytes = if (params.hasKey("totalBytes")) params.getDouble("totalBytes").toLong() else 0L
                val expectedSha256 = params.getString("sha256")?.lowercase()?.takeIf { it.length == 64 }
                val downloadId = System.currentTimeMillis()
                val destination = File(
                    reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    "${downloadId}_${fileName}",
                ).absolutePath

                val entity = DownloadEntity(
                    id = downloadId,
                    url = url,
                    fileName = fileName,
                    modelId = modelId,
                    title = title,
                    destination = destination,
                    totalBytes = totalBytes,
                    downloadedBytes = 0L,
                    status = DownloadStatus.QUEUED,
                    createdAt = System.currentTimeMillis(),
                    expectedSha256 = expectedSha256,
                )

                withContext(Dispatchers.IO) {
                    downloadDao.insertDownload(entity)
                }
                registerObserver(downloadId)
                WorkerDownload.enqueue(reactApplicationContext, downloadId)

                val result = Arguments.createMap().apply {
                    putDouble("downloadId", downloadId.toDouble())
                    putString("fileName", fileName)
                    putString("modelId", modelId)
                }
                SafePromise(promise, NAME).resolve(result)
            } catch (e: Exception) {
                SafePromise(promise, NAME).reject("DOWNLOAD_ERROR", "Failed to start download: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun cancelDownload(downloadId: Double, promise: Promise) {
        scope.launch {
            try {
                val id = downloadId.toLong()
                withContext(Dispatchers.IO) {
                    val download = downloadDao.getDownload(id)
                    if (download != null) {
                        downloadDao.updateStatus(id, DownloadStatus.CANCELLED, DownloadReason.USER_CANCELLED)
                        val file = File(download.destination)
                        if (file.exists()) file.delete()
                    }
                }
                WorkerDownload.cancel(reactApplicationContext, id)
                workManager.pruneWork()
                removeWorkObserver(id)
                SafePromise(promise, NAME).resolve(true)
            } catch (e: Exception) {
                SafePromise(promise, NAME).reject("CANCEL_ERROR", "Failed to cancel download: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun pauseDownload(downloadId: Double, promise: Promise) {
        scope.launch {
            try {
                val id = downloadId.toLong()
                withContext(Dispatchers.IO) {
                    downloadDao.updateStatus(id, DownloadStatus.PAUSED)
                }
                SafePromise(promise, NAME).resolve(true)
            } catch (e: Exception) {
                SafePromise(promise, NAME).reject("PAUSE_ERROR", "Failed to pause download: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun resumeDownload(downloadId: Double, promise: Promise) {
        scope.launch {
            try {
                val id = downloadId.toLong()
                withContext(Dispatchers.IO) {
                    downloadDao.getDownload(id) ?: return@withContext
                    downloadDao.updateStatus(id, DownloadStatus.QUEUED)
                    // KEEP policy: leave running work untouched, restart only if finished/missing
                    WorkerDownload.enqueueResume(reactApplicationContext, id)
                }
                registerObserver(id)
                SafePromise(promise, NAME).resolve(true)
            } catch (e: Exception) {
                SafePromise(promise, NAME).reject("RESUME_ERROR", "Failed to resume download: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun getActiveDownloads(promise: Promise) {
        scope.launch {
            try {
                val downloads = withContext(Dispatchers.IO) {
                    downloadDao.getAllDownloads().first().filter {
                        it.status != DownloadStatus.COMPLETED &&
                        it.status != DownloadStatus.CANCELLED
                    }
                }
                val result = Arguments.createArray()
                downloads.forEach { d ->
                    val uiState = DownloadReason.toUiState(d.status, d.error)
                    result.pushMap(Arguments.createMap().apply {
                        putDouble("downloadId", d.id.toDouble())
                        putString("fileName", d.fileName)
                        putString("modelId", d.modelId)
                        putString("title", d.title)
                        putDouble("totalBytes", d.totalBytes.toDouble())
                        putDouble("bytesDownloaded", d.downloadedBytes.toDouble())
                        putString("status", uiState.status)
                        putString("localUri", Uri.fromFile(File(d.destination)).toString())
                        putString("reason", uiState.reason ?: "")
                        putString("reasonCode", uiState.reasonCode ?: "")
                        putDouble("startedAt", d.createdAt.toDouble())
                    })
                }
                SafePromise(promise, NAME).resolve(result)
            } catch (e: Exception) {
                SafePromise(promise, NAME).reject("QUERY_ERROR", "Failed to get active downloads: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun getDownloadProgress(downloadId: Double, promise: Promise) {
        scope.launch {
            try {
                val id = downloadId.toLong()
                val d = withContext(Dispatchers.IO) { downloadDao.getDownload(id) }
                if (d == null) {
                    SafePromise(promise, NAME).reject("QUERY_ERROR", "Download not found")
                    return@launch
                }
                val uiState = DownloadReason.toUiState(d.status, d.error)
                val result = Arguments.createMap().apply {
                    putDouble("downloadId", d.id.toDouble())
                    putDouble("bytesDownloaded", d.downloadedBytes.toDouble())
                    putDouble("totalBytes", d.totalBytes.toDouble())
                    putString("status", uiState.status)
                    putString("localUri", Uri.fromFile(File(d.destination)).toString())
                    putString("reason", uiState.reason ?: "")
                    putString("reasonCode", uiState.reasonCode ?: "")
                }
                SafePromise(promise, NAME).resolve(result)
            } catch (e: Exception) {
                SafePromise(promise, NAME).reject("PROGRESS_ERROR", "Failed to get progress: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun moveCompletedDownload(downloadId: Double, targetPath: String, promise: Promise) {
        scope.launch {
            try {
                val id = downloadId.toLong()

                // Validate target path against app sandbox directories to prevent path traversal.
                if (targetPath.isNotEmpty()) {
                    val targetFile = File(targetPath)
                    val allowedDirs = listOfNotNull(
                        reactApplicationContext.filesDir?.canonicalPath,
                        reactApplicationContext.cacheDir?.canonicalPath,
                        reactApplicationContext.getExternalFilesDir(null)?.canonicalPath,
                    )
                    if (allowedDirs.none { targetFile.canonicalPath.startsWith(it) }) {
                        SafePromise(promise, NAME).reject("MOVE_ERROR", "Target path is outside the app sandbox.")
                        return@launch
                    }
                }

                val d = withContext(Dispatchers.IO) { downloadDao.getDownload(id) }
                    ?: run {
                        SafePromise(promise, NAME).reject("MOVE_ERROR", "Download info not found")
                        return@launch
                    }

                val sourceFile = File(d.destination)

                if (targetPath.isEmpty()) {
                    // Cleanup-only — delete DB entry, no move needed
                    withContext(Dispatchers.IO) { downloadDao.deleteDownload(d) }
                    SafePromise(promise, NAME).resolve(sourceFile.absolutePath)
                    return@launch
                }

                if (!sourceFile.exists()) {
                    val targetFile = File(targetPath)
                    if (targetFile.exists()) {
                        withContext(Dispatchers.IO) { downloadDao.deleteDownload(d) }
                        SafePromise(promise, NAME).resolve(targetPath)
                        return@launch
                    }
                    SafePromise(promise, NAME).reject("MOVE_ERROR", "Downloaded file not found: ${sourceFile.absolutePath}")
                    return@launch
                }

                val targetFile = File(targetPath)
                targetFile.parentFile?.mkdirs()

                val movedPath = withContext(Dispatchers.IO) {
                    if (sourceFile.renameTo(targetFile)) {
                        targetFile.absolutePath
                    } else {
                        sourceFile.copyTo(targetFile, overwrite = true)
                        sourceFile.delete()
                        targetFile.absolutePath
                    }
                }

                withContext(Dispatchers.IO) { downloadDao.deleteDownload(d) }
                SafePromise(promise, NAME).resolve(movedPath)
            } catch (e: Exception) {
                SafePromise(promise, NAME).reject("MOVE_ERROR", "Failed to move completed download: ${e.message}", e)
            }
        }
    }

    /**
     * Re-attaches WorkInfo LiveData observers for any downloads still active in the DB.
     * Called by JS on app resume — covers the case where the app was killed while a
     * download was running and WorkManager continued in the background.
     */
    @ReactMethod
    fun startProgressPolling() {
        scope.launch {
            val active = withContext(Dispatchers.IO) {
                downloadDao.getAllDownloads().first().filter {
                    it.status == DownloadStatus.QUEUED ||
                    it.status == DownloadStatus.RUNNING ||
                    it.status == DownloadStatus.PAUSED
                }
            }
            active.forEach { registerObserver(it.id) }
        }
    }

    @ReactMethod
    fun stopProgressPolling() {
        workObservers.keys.toList().forEach { removeWorkObserver(it) }
        workObservers.clear()
    }

    /**
     * Update foreground notification with combined progress for vision models.
     * This shows combined GGUF + mmproj progress in a single notification.
     */
    @ReactMethod
    fun updateCombinedProgress(
        modelId: String,
        fileName: String,
        mmprojFileName: String,
        mainBytes: Double,
        mainTotal: Double,
        mmprojBytes: Double,
        mmprojTotal: Double,
    ) {
        val mainBytesL = mainBytes.toLong()
        val mainTotalL = mainTotal.toLong()
        val mmprojBytesL = mmprojBytes.toLong()
        val mmprojTotalL = mmprojTotal.toLong()

        // Combined progress tracking is handled in the JS layer.
    }

    @ReactMethod
    fun addListener(eventName: String) { /* required for RN event emitter */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* required for RN event emitter */ }

    /**
     * Returns true if the app is already excluded from battery optimisation.
     * Always returns true on Android < M.
     */
    @ReactMethod
    fun isBatteryOptimizationIgnored(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true)
                return
            }
            val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            promise.resolve(pm.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
        } catch (e: Exception) {
            promise.resolve(true) // fail open — don't block downloads
        }
    }

    /**
     * Opens the system dialog asking the user to exempt this app from battery optimisation.
     * No-op on Android < M.
     */
    @ReactMethod
    fun requestBatteryOptimizationIgnore() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactApplicationContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
        } catch (_: Exception) {
            // no-op: device may not have a Settings app to handle this intent
        }
    }

    // -------------------------------------------------------------------------
    // WorkInfo observer management
    // -------------------------------------------------------------------------

    private fun registerObserver(downloadId: Long) {
        // Remove stale observer if present
        workObservers[downloadId]?.let { old ->
            workManager.getWorkInfosForUniqueWorkLiveData(WorkerDownload.workName(downloadId))
                .removeObserver(old)
        }

        val observer = Observer<List<WorkInfo>> { workInfos ->
            val info = workInfos.firstOrNull() ?: return@Observer
            when (info.state) {
                WorkInfo.State.RUNNING -> {
                    val bytes = info.progress.getLong(WorkerDownload.KEY_PROGRESS, 0L)
                    val total = info.progress.getLong(WorkerDownload.KEY_TOTAL, 0L)
                    scope.launch {
                        val d = withContext(Dispatchers.IO) { downloadDao.getDownload(downloadId) }
                            ?: return@launch
                        DownloadEventBridge.progress(
                            downloadId, d.fileName, d.modelId, bytes, total,
                            DownloadStatus.RUNNING.name.lowercase(),
                        )
                    }
                }
                WorkInfo.State.ENQUEUED,
                WorkInfo.State.BLOCKED,
                -> {
                    scope.launch {
                        val d = withContext(Dispatchers.IO) { downloadDao.getDownload(downloadId) }
                            ?: return@launch
                        val uiState = DownloadReason.toUiState(d.status, d.error)
                        if (uiState.status == "pending" || uiState.status == "retrying" || uiState.status == "waiting_for_network" || uiState.status == "paused") {
                            DownloadEventBridge.progress(
                                downloadId,
                                d.fileName,
                                d.modelId,
                                d.downloadedBytes,
                                d.totalBytes,
                                uiState.status,
                                uiState.reason,
                                uiState.reasonCode,
                            )
                        }
                    }
                }
                WorkInfo.State.SUCCEEDED -> {
                    scope.launch {
                        val d = withContext(Dispatchers.IO) { downloadDao.getDownload(downloadId) }
                        if (d != null) {
                            DownloadEventBridge.complete(
                                downloadId, d.fileName, d.modelId,
                                Uri.fromFile(File(d.destination)).toString(),
                                d.downloadedBytes, d.totalBytes,
                            )
                        }
                        removeWorkObserver(downloadId)
                    }
                }
                WorkInfo.State.FAILED -> {
                    scope.launch {
                        val d = withContext(Dispatchers.IO) { downloadDao.getDownload(downloadId) }
                        val uiState = DownloadReason.toUiState(d?.status ?: DownloadStatus.FAILED, d?.error)
                        DownloadEventBridge.error(
                            downloadId,
                            d?.fileName ?: "",
                            d?.modelId ?: "",
                            uiState.reason ?: "Something went wrong while downloading.",
                            uiState.reasonCode,
                        )
                        removeWorkObserver(downloadId)
                    }
                }
                WorkInfo.State.CANCELLED -> {
                    scope.launch {
                        removeWorkObserver(downloadId)
                    }
                }
                else -> Unit
            }
        }

        workObservers[downloadId] = observer
        workManager.getWorkInfosForUniqueWorkLiveData(WorkerDownload.workName(downloadId))
            .observeForever(observer)
    }

    private fun removeWorkObserver(downloadId: Long) {
        workObservers.remove(downloadId)?.let { observer ->
            workManager.getWorkInfosForUniqueWorkLiveData(WorkerDownload.workName(downloadId))
                .removeObserver(observer)
        }
    }

    // -------------------------------------------------------------------------

    companion object {
        const val NAME = "DownloadManagerModule"

        // Legacy SharedPreferences constants — retained so WorkerDownloadStore compiles
        // during the transition period while both download paths coexist.
        const val PREFS_NAME = "OffgridMobileDownloads"
        const val DOWNLOADS_KEY = "active_downloads"
        const val STATUS_PENDING = "pending"
        const val STATUS_RUNNING = "running"
        const val STATUS_PAUSED = "paused"
        const val STATUS_COMPLETED = "completed"
        const val STATUS_FAILED = "failed"
        const val STATUS_UNKNOWN = "unknown"
    }
}
