package ai.offgridmobile.data.repository

import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.util.Base64
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

// ---- event types ----------------------------------------------------------------

sealed class ImageGenEvent {
    data class Progress(
        val step: Int,
        val totalSteps: Int,
        val progress: Float,
        val previewPath: String?,
    ) : ImageGenEvent()

    data class Complete(
        val imagePath: String,
        val width: Int,
        val height: Int,
        val seed: Long,
        val generationTimeMs: Long,
    ) : ImageGenEvent()

    data class Error(val message: String) : ImageGenEvent()
}

data class ImageGenParams(
    val prompt: String,
    val negativePrompt: String = "",
    val steps: Int = 20,
    val guidanceScale: Float = 7.5f,
    val seed: Long = -1L,
    val width: Int = 512,
    val height: Int = 512,
    val previewInterval: Int = 5,
    val useOpenCl: Boolean = false,
)

interface ImageGenRepository {
    val events: SharedFlow<ImageGenEvent>
    val isGenerating: StateFlow<Boolean>
    val isModelLoaded: StateFlow<Boolean>
    suspend fun loadModel(path: String, backend: String = "auto"): Result<Unit>
    suspend fun generate(params: ImageGenParams): Result<Unit>
    suspend fun cancel(): Result<Unit>
    suspend fun unload(): Result<Unit>
}

@Singleton
class ImageGenRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
) : ImageGenRepository {

    private val tag = "ImageGenRepository"
    private val serverPort = 18081
    private val runtimeDirName = "runtime_libs"
    private val executableName = "libstable_diffusion_core.so"

    private val _events = MutableSharedFlow<ImageGenEvent>(replay = 0, extraBufferCapacity = 128)
    override val events: SharedFlow<ImageGenEvent> = _events.asSharedFlow()

    private val _isGenerating = MutableStateFlow(false)
    override val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    private val _isModelLoaded = MutableStateFlow(false)
    override val isModelLoaded: StateFlow<Boolean> = _isModelLoaded.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var serverProcess: Process? = null
    private var monitorJob: Job? = null
    private var currentModelPath: String? = null
    private var currentBackend: String? = null
    private val generationCancelled = AtomicBoolean(false)
    private var activeConnection: HttpURLConnection? = null

    // ---- NPU detection ----------------------------------------------------------

    private fun isNpuSupported(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
        return Build.SOC_MODEL.startsWith("SM")
    }

    // ---- QNN library extraction -------------------------------------------------

    private fun prepareRuntimeDir(): File {
        val runtimeDir = File(context.filesDir, runtimeDirName).also { it.mkdirs() }
        try {
            context.assets.list("qnnlibs")?.forEach { fileName ->
                val target = File(runtimeDir, fileName)
                val needsCopy = !target.exists() || run {
                    context.assets.open("qnnlibs/$fileName").use { it.available().toLong() } != target.length()
                }
                if (needsCopy) {
                    context.assets.open("qnnlibs/$fileName").use { input ->
                        target.outputStream().use { input.copyTo(it) }
                    }
                    Log.d(tag, "Copied QNN lib: $fileName")
                }
                target.setReadable(true, true)
                target.setExecutable(true, true)
            }
        } catch (e: IOException) {
            Log.w(tag, "No QNN libs in assets — CPU-only mode: ${e.message}")
        }
        return runtimeDir
    }

    // ---- model-directory resolution (depth-3 search for unet.mnn / unet.bin) ---

    private fun resolveModelDir(dir: File, isCpu: Boolean): File? {
        val marker = if (isCpu) "unet.mnn" else "unet.bin"
        if (File(dir, marker).exists()) return dir

        fun search(current: File, depth: Int): File? {
            if (depth > 3) return null
            current.listFiles()?.filter { it.isDirectory }?.forEach { sub ->
                if (File(sub, marker).exists()) return sub
                search(sub, depth + 1)?.let { return it }
            }
            return null
        }
        return search(dir, 0)
    }

    // ---- backend selection ------------------------------------------------------

    private fun resolveBackend(requestedBackend: String, modelPath: String): String {
        val dir = File(modelPath)
        return when (requestedBackend.lowercase()) {
            "mnn", "cpu" -> "mnn"
            "qnn", "npu" -> "qnn"
            else -> {
                // auto: prefer QNN when hardware supports it and QNN assets exist
                val qnnDir = resolveModelDir(dir, isCpu = false)
                if (qnnDir != null && isNpuSupported()) "qnn" else "mnn"
            }
        }
    }

    // ---- process environment ----------------------------------------------------

    private fun buildEnvironment(runtimeDir: File): Map<String, String> {
        val paths = mutableListOf(
            runtimeDir.absolutePath,
            "/system/lib64",
            "/vendor/lib64",
            "/vendor/lib64/egl",
        )
        try {
            val mali = File("/system/vendor/lib64/egl/libGLES_mali.so")
            if (mali.exists()) {
                val parts = mali.canonicalPath.split("/")
                val soc = parts.getOrNull(parts.size - 2)
                if (soc != null) {
                    listOf("/vendor/lib64/$soc", "/vendor/lib64/egl/$soc").forEach {
                        if (!paths.contains(it)) paths.add(it)
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(tag, "Mali path resolution failed: ${e.message}")
        }
        return mapOf(
            "LD_LIBRARY_PATH" to paths.joinToString(":"),
            "DSP_LIBRARY_PATH" to runtimeDir.absolutePath,
            "ADSP_LIBRARY_PATH" to runtimeDir.absolutePath,
            "MNN_OPENCL_TUNING" to "WIDE",
        )
    }

    // ---- process command builder ------------------------------------------------

    private fun buildCommand(
        executable: File,
        modelDir: File,
        runtimeDir: File,
        isCpu: Boolean,
    ): List<String> {
        return if (isCpu) {
            // MNN backend — always pass "clip.mnn"; binary auto-detects clip_v2.mnn.
            // Passing clip_v2.mnn directly segfaults the binary.
            mutableListOf(
                executable.absolutePath,
                "--clip", File(modelDir, "clip.mnn").absolutePath,
                "--unet", File(modelDir, "unet.mnn").absolutePath,
                "--vae_decoder", File(modelDir, "vae_decoder.mnn").absolutePath,
                "--tokenizer", File(modelDir, "tokenizer.json").absolutePath,
                "--port", serverPort.toString(),
                "--text_embedding_size", "768",
                "--cpu",
            ).also { cmd ->
                val vaeEncoder = File(modelDir, "vae_encoder.mnn")
                if (vaeEncoder.exists()) cmd.addAll(listOf("--vae_encoder", vaeEncoder.absolutePath))
            }
        } else {
            // QNN NPU backend
            val hasMnnClip = File(modelDir, "clip.mnn").exists() || File(modelDir, "clip_v2.mnn").exists()
            val clipFile = if (hasMnnClip) "clip.mnn" else "clip.bin"
            mutableListOf(
                executable.absolutePath,
                "--clip", File(modelDir, clipFile).absolutePath,
                "--unet", File(modelDir, "unet.bin").absolutePath,
                "--vae_decoder", File(modelDir, "vae_decoder.bin").absolutePath,
                "--tokenizer", File(modelDir, "tokenizer.json").absolutePath,
                "--backend", File(runtimeDir, "libQnnHtp.so").absolutePath,
                "--system_library", File(runtimeDir, "libQnnSystem.so").absolutePath,
                "--port", serverPort.toString(),
                "--text_embedding_size", "768",
            ).also { cmd ->
                if (hasMnnClip) cmd.add("--use_cpu_clip")
                val vaeEncoder = File(modelDir, "vae_encoder.bin")
                if (vaeEncoder.exists()) cmd.addAll(listOf("--vae_encoder", vaeEncoder.absolutePath))
            }
        }
    }

    // ---- server lifecycle -------------------------------------------------------

    override suspend fun loadModel(path: String, backend: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                // Idempotent: skip if same model + backend already running
                if (path == currentModelPath && backend == currentBackend && isServerReady()) {
                    Log.d(tag, "Model already loaded: $path")
                    return@runCatching
                }

                stopServer()

                val resolvedBackend = resolveBackend(backend, path)
                val isCpu = resolvedBackend == "mnn"
                val modelDir = resolveModelDir(File(path), isCpu)
                    ?: throw IOException("Model assets not found in $path")

                val nativeLibDir = context.applicationInfo.nativeLibraryDir
                val executable = listOf(
                    File(nativeLibDir, executableName),
                    File(context.filesDir, "runtime_libs/$executableName"),
                ).firstOrNull { it.exists() && it.canExecute() }
                    ?: throw IOException("$executableName not found in $nativeLibDir")

                val runtimeDir = prepareRuntimeDir()
                val cmd = buildCommand(executable, modelDir, runtimeDir, isCpu)
                val env = buildEnvironment(runtimeDir)

                Log.i(tag, "Starting server — backend=$resolvedBackend cmd=${cmd.first()}")
                val pb = ProcessBuilder(cmd).apply {
                    environment().putAll(env)
                    redirectErrorStream(true)
                }

                val process = pb.start()
                serverProcess = process
                currentModelPath = path
                currentBackend = resolvedBackend

                // Monitor stdout for unexpected exits
                monitorJob?.cancel()
                monitorJob = scope.launch {
                    try {
                        BufferedReader(InputStreamReader(process.inputStream)).useLines { lines ->
                            lines.forEach { Log.v(tag, "server: $it") }
                        }
                    } finally {
                        val code = runCatching { process.exitValue() }.getOrNull()
                        if (code != null && code != 0 && code != 143) {
                            _events.tryEmit(ImageGenEvent.Error("Server process exited with code $code"))
                            _isModelLoaded.value = false
                        }
                    }
                }

                // Health-check poll
                val timeoutMs = if (isCpu) 180_000L else 120_000L
                waitForHealth(timeoutMs)
                _isModelLoaded.value = true
                Log.i(tag, "Server ready on port $serverPort")
            }
        }

    private suspend fun waitForHealth(timeoutMs: Long) = withContext(Dispatchers.IO) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            try {
                val conn = URL("http://127.0.0.1:$serverPort/health")
                    .openConnection() as HttpURLConnection
                conn.connectTimeout = 500
                conn.readTimeout = 500
                val code = conn.responseCode
                conn.disconnect()
                if (code == 200) return@withContext
            } catch (_: Exception) { /* not ready yet */ }
            delay(500)
        }
        throw IOException("Server health check timed out after ${timeoutMs}ms")
    }

    private fun isServerReady(): Boolean {
        return try {
            val conn = URL("http://127.0.0.1:$serverPort/health")
                .openConnection() as HttpURLConnection
            conn.connectTimeout = 1000
            conn.readTimeout = 1000
            val ok = conn.responseCode == 200
            conn.disconnect()
            ok
        } catch (_: Exception) {
            false
        }
    }

    private fun stopServer() {
        monitorJob?.cancel()
        monitorJob = null
        serverProcess?.destroy()
        serverProcess = null
        _isModelLoaded.value = false
        currentModelPath = null
        currentBackend = null
    }

    override suspend fun unload(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching { stopServer() }
    }

    // ---- image generation -------------------------------------------------------

    override suspend fun generate(params: ImageGenParams): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                check(_isModelLoaded.value) { "No model loaded" }
                _isGenerating.value = true
                generationCancelled.set(false)

                val previewDir = File(context.cacheDir, "preview").also { it.mkdirs() }
                val outputDir = File(context.filesDir, "generated_images").also { it.mkdirs() }

                val body = JSONObject().apply {
                    put("prompt", params.prompt)
                    put("negative_prompt", params.negativePrompt)
                    put("steps", params.steps)
                    put("cfg_scale", params.guidanceScale.toDouble())
                    put("seed", params.seed)
                    put("width", params.width)
                    put("height", params.height)
                    put("preview_interval", params.previewInterval)
                    if (params.useOpenCl) put("use_opencl", true)
                }.toString()

                val startMs = System.currentTimeMillis()
                val conn = (URL("http://127.0.0.1:$serverPort/generate")
                    .openConnection() as HttpURLConnection).also { c ->
                    c.requestMethod = "POST"
                    c.setRequestProperty("Content-Type", "application/json")
                    c.doOutput = true
                    c.connectTimeout = 10_000
                    c.readTimeout = 0 // stream indefinitely
                }
                activeConnection = conn

                conn.outputStream.use { it.write(body.toByteArray()) }

                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                var resultId: String? = null
                var resultPath: String? = null
                var resultWidth = params.width
                var resultHeight = params.height
                var resultSeed = params.seed

                reader.use { br ->
                    var line: String?
                    while (br.readLine().also { line = it } != null) {
                        if (generationCancelled.get()) break
                        val l = line ?: continue
                        if (!l.startsWith("data:")) continue
                        val json = runCatching { JSONObject(l.removePrefix("data:").trim()) }
                            .getOrNull() ?: continue

                        when (json.optString("type")) {
                            "progress" -> {
                                val step = json.optInt("step", 0)
                                val total = json.optInt("total_steps", params.steps)
                                val progress = if (total > 0) step.toFloat() / total else 0f
                                val previewBase64 = json.optString("preview", "")
                                var previewPath: String? = null
                                if (previewBase64.isNotEmpty()) {
                                    previewPath = File(previewDir, "preview_${step}.png").absolutePath
                                    runCatching {
                                        saveRgbToPng(previewBase64, params.width, params.height, previewPath)
                                    }
                                }
                                _events.tryEmit(
                                    ImageGenEvent.Progress(step, total, progress, previewPath)
                                )
                            }

                            "complete" -> {
                                resultId = json.optString("id", UUID.randomUUID().toString())
                                val imageBase64 = json.optString("image", "")
                                resultWidth = json.optInt("width", params.width)
                                resultHeight = json.optInt("height", params.height)
                                resultSeed = json.optLong("seed", params.seed)
                                resultPath = File(outputDir, "$resultId.png").absolutePath
                                if (imageBase64.isNotEmpty()) {
                                    saveRgbToPng(imageBase64, resultWidth, resultHeight, resultPath!!)
                                }
                            }
                        }
                    }
                }

                activeConnection = null
                val elapsedMs = System.currentTimeMillis() - startMs

                if (!generationCancelled.get() && resultPath != null) {
                    _events.tryEmit(
                        ImageGenEvent.Complete(resultPath!!, resultWidth, resultHeight, resultSeed, elapsedMs)
                    )
                }
                _isGenerating.value = false
            }.also {
                _isGenerating.value = false
                activeConnection = null
            }
        }

    override suspend fun cancel(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            generationCancelled.set(true)
            activeConnection?.disconnect()
            activeConnection = null
            _isGenerating.value = false
        }
    }

    // ---- utilities --------------------------------------------------------------

    private fun saveRgbToPng(base64Rgb: String, width: Int, height: Int, outputPath: String) {
        val rgb = Base64.decode(base64Rgb, Base64.DEFAULT)
        val expected = width * height * 3
        require(rgb.size == expected) {
            "RGB data size ${rgb.size} ≠ expected $expected (${width}×${height}×3)"
        }
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val pixels = IntArray(width * height) { i ->
            val idx = i * 3
            val r = rgb[idx].toInt() and 0xFF
            val g = rgb[idx + 1].toInt() and 0xFF
            val b = rgb[idx + 2].toInt() and 0xFF
            (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }
        bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
        File(outputPath).parentFile?.mkdirs()
        FileOutputStream(outputPath).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
}
