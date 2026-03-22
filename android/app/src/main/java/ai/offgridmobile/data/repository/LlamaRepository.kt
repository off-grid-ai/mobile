package ai.offgridmobile.data.repository

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Parameters mirroring the llama.rn initLlama() surface.
 */
data class LlamaModelParams(
    val nCtx: Int = 2048,
    val nGpuLayers: Int = 0,
    val nThreads: Int = 4,
    val nBatch: Int = 512,
    val useMmap: Boolean = true,
    val useMlock: Boolean = false,
    val flashAttn: Boolean = false,
)

/**
 * TODO(phase-2-llama): Wire into the llama.rn JNI layer directly.
 *
 * The llama.rn package provides on-device LLM inference via a native .so. In the
 * React Native build those symbols are accessed through the RN TurboModule bridge.
 * For the Compose shell we need to call the same JNI methods without JS:
 *
 *   1. After `npm install`, inspect node_modules/llama.rn/android/src/main/java/
 *      and node_modules/llama.rn/android/src/main/cpp/ to locate the exact
 *      JNIEXPORT symbol names (e.g. Java_com_rnllama_LlamaContext_*).
 *   2. Map those symbols to Kotlin `external fun` declarations in a new
 *      LlamaJni.kt wrapper class that loads the same .so.
 *   3. Replace the placeholder implementations below with real JNI calls.
 *   4. Handle the contextMutexPromise serialisation pattern from llm.ts:
 *      use a Mutex (kotlinx.coroutines.sync) to serialise load/unload/reload.
 *
 * Until the above wiring is complete this stub returns placeholder data so the
 * UI compiles, navigates, and displays correctly.
 */
@Singleton
class LlamaRepository @Inject constructor() {

    /**
     * Loads a GGUF model file into the llama.rn native context.
     * Stub: always succeeds without doing any native work.
     */
    suspend fun initModel(
        modelPath: String,
        params: LlamaModelParams = LlamaModelParams(),
    ): Result<Unit> = Result.success(Unit)

    /**
     * Streams assistant tokens for [prompt] into [onToken], then returns the
     * full accumulated response.
     *
     * Stub: emits a single placeholder token so the streaming UI path is exercised.
     */
    suspend fun completion(
        prompt: String,
        params: LlamaModelParams = LlamaModelParams(),
        onToken: (String) -> Unit,
    ): Result<String> {
        val placeholder = "[LLM not wired — see LlamaRepository TODO]"
        onToken(placeholder)
        return Result.success(placeholder)
    }

    /**
     * Token stream as a cold [Flow]. Each emission is a single token string wrapped
     * in [Result] so downstream can distinguish streaming errors.
     *
     * Stub: emits the placeholder token then completes.
     */
    fun tokenStream(prompt: String): Flow<Result<String>> = flow {
        emit(Result.success("[LLM not wired — see LlamaRepository TODO]"))
    }

    /** Signals the active completion to stop at the next safe boundary. */
    fun stopCompletion() { /* no-op until JNI is wired */ }

    /** Releases the native context and frees associated memory. */
    suspend fun release(): Result<Unit> = Result.success(Unit)
}
