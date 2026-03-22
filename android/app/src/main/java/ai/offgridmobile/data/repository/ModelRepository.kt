package ai.offgridmobile.data.repository

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.util.Log
import ai.offgridmobile.data.local.dao.ModelDao
import ai.offgridmobile.data.local.entities.DownloadedModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

sealed class DownloadUiEvent {
    data class Progress(
        val downloadId: Long,
        val modelId: String,
        val bytesDownloaded: Long,
        val totalBytes: Long,
        val percent: Int,
    ) : DownloadUiEvent()

    data class Complete(
        val downloadId: Long,
        val modelId: String,
        val localPath: String,
    ) : DownloadUiEvent()

    data class Error(
        val downloadId: Long,
        val modelId: String,
        val reason: String,
    ) : DownloadUiEvent()
}

interface ModelRepository {
    fun getModels(): Flow<Result<List<DownloadedModel>>>
    val downloadEvents: SharedFlow<DownloadUiEvent>
    suspend fun startDownload(url: String, fileName: String, modelId: String): Result<Long>
    suspend fun cancelDownload(downloadId: Long): Result<Unit>
    suspend fun moveCompletedDownload(downloadId: Long, targetPath: String): Result<Unit>
    suspend fun setActiveModel(model: DownloadedModel): Result<Unit>
    suspend fun deleteModel(model: DownloadedModel): Result<Unit>
}

@Singleton
class ModelRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
    private val modelDao: ModelDao,
) : ModelRepository {

    private val tag = "ModelRepository"
    private val downloadManager =
        context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    private val _downloadEvents = MutableSharedFlow<DownloadUiEvent>(
        replay = 0,
        extraBufferCapacity = 128,
    )
    override val downloadEvents: SharedFlow<DownloadUiEvent> = _downloadEvents.asSharedFlow()

    /** downloadId → modelId for in-flight downloads */
    private val activeDownloadIds = mutableMapOf<Long, String>()
    private val idsLock = Any()

    private val pollingScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var pollingJob: Job? = null

    override fun getModels(): Flow<Result<List<DownloadedModel>>> =
        modelDao.getAll()
            .map { Result.success(it) }
            .catch { emit(Result.failure(it)) }

    override suspend fun startDownload(
        url: String,
        fileName: String,
        modelId: String,
    ): Result<Long> = withContext(Dispatchers.IO) {
        runCatching {
            val downloadsDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: throw IllegalStateException("External storage unavailable")

            // Remove any stale file with the same name before enqueueing
            File(downloadsDir, fileName).takeIf { it.exists() }?.delete()

            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle(fileName)
                setDescription(modelId)
                setDestinationInExternalFilesDir(
                    context,
                    Environment.DIRECTORY_DOWNLOADS,
                    fileName,
                )
                setAllowedNetworkTypes(
                    DownloadManager.Request.NETWORK_WIFI or
                            DownloadManager.Request.NETWORK_MOBILE,
                )
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            }

            val downloadId = downloadManager.enqueue(request)
            synchronized(idsLock) { activeDownloadIds[downloadId] = modelId }
            startPollingIfNeeded()
            downloadId
        }
    }

    override suspend fun cancelDownload(downloadId: Long): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                downloadManager.remove(downloadId)
                synchronized(idsLock) { activeDownloadIds.remove(downloadId) }
            }
        }

    override suspend fun moveCompletedDownload(
        downloadId: Long,
        targetPath: String,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val cursor = downloadManager.query(
                DownloadManager.Query().setFilterById(downloadId),
            )
            val localUri = cursor?.use {
                if (it.moveToFirst()) {
                    it.getString(it.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI))
                } else null
            } ?: throw IllegalStateException("Download $downloadId not found")

            val source = File(Uri.parse(localUri).path!!)
            val dest = File(targetPath).also { it.parentFile?.mkdirs() }

            if (!source.renameTo(dest)) {
                source.copyTo(dest, overwrite = true)
                source.delete()
            }
        }
    }

    override suspend fun setActiveModel(model: DownloadedModel): Result<Unit> = runCatching {
        modelDao.clearActive()
        modelDao.update(model.copy(isActive = true))
    }

    override suspend fun deleteModel(model: DownloadedModel): Result<Unit> = runCatching {
        modelDao.delete(model)
        File(model.path).takeIf { it.exists() }?.delete()
    }

    // ---- polling ----------------------------------------------------------------

    private fun startPollingIfNeeded() {
        if (pollingJob?.isActive == true) return
        pollingJob = pollingScope.launch {
            while (true) {
                val ids = synchronized(idsLock) { activeDownloadIds.toMap() }
                if (ids.isEmpty()) {
                    pollingJob?.cancel()
                    break
                }
                pollDownloads(ids)
                delay(500)
            }
        }
    }

    private suspend fun pollDownloads(ids: Map<Long, String>) = withContext(Dispatchers.IO) {
        val query = DownloadManager.Query().setFilterById(*ids.keys.toLongArray())
        val cursor = downloadManager.query(query)
        val completed = mutableListOf<Long>()

        cursor?.use {
            while (it.moveToNext()) {
                val id = it.getLong(it.getColumnIndexOrThrow(DownloadManager.COLUMN_ID))
                val modelId = ids[id] ?: continue
                val status = it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))

                when (status) {
                    DownloadManager.STATUS_RUNNING,
                    DownloadManager.STATUS_PENDING,
                    DownloadManager.STATUS_PAUSED -> {
                        val downloaded = it.getLong(
                            it.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR),
                        )
                        val total = it.getLong(
                            it.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES),
                        )
                        val percent = if (total > 0) ((downloaded * 100) / total).toInt() else 0
                        _downloadEvents.tryEmit(
                            DownloadUiEvent.Progress(id, modelId, downloaded, total, percent),
                        )
                    }

                    DownloadManager.STATUS_SUCCESSFUL -> {
                        val localUri = it.getString(
                            it.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI),
                        ) ?: ""
                        _downloadEvents.tryEmit(
                            DownloadUiEvent.Complete(id, modelId, localUri),
                        )
                        completed.add(id)
                    }

                    DownloadManager.STATUS_FAILED -> {
                        val reason = it.getInt(
                            it.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON),
                        )
                        _downloadEvents.tryEmit(
                            DownloadUiEvent.Error(id, modelId, "DownloadManager error code: $reason"),
                        )
                        completed.add(id)
                        Log.e(tag, "Download $id for $modelId failed — reason code $reason")
                    }
                }
            }
        }

        synchronized(idsLock) { completed.forEach { activeDownloadIds.remove(it) } }
    }
}
