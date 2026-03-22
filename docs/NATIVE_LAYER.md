# Native Layer Documentation

This document is the contract between the future Jetpack Compose shell and all on-device native capabilities. It was produced during **Phase 1 — Native Layer Audit** (read-only pass over the repo).

## Repository snapshot vs. fork target (important)

`CLAUDE.md` describes a **target** layout (`android/app/src/main/cpp/`, `LlamaModule.kt`, `StableDiffusionModule.kt`, `WhisperModule.kt`, `ModelManagerModule.kt`). **Those paths do not exist in this workspace snapshot.**

What **does** exist under `android/app/src/main/java/ai/offgridmobile/`:

| Component | Role |
|-----------|------|
| `localdream/LocalDreamModule.kt` | Stable Diffusion–class image generation via **subprocess** `libstable_diffusion_core.so` + localhost HTTP (QNN NPU or MNN CPU/OpenCL) |
| `download/DownloadManagerModule.kt` | Hugging Face–oriented downloads via `DownloadManager`, polling, SSRF-safe redirects |
| `pdf/PDFExtractorModule.kt` | PDF text extraction via **Pdfium** (`io.legere:pdfiumandroid`) |
| `SafePromise.kt` | RN `Promise` NPE guard when the bridge is torn down |
| `MainApplication.kt` / `MainActivity.kt` | RN entry + manual packages |

On-device **LLM** and **Whisper** inference are delivered by **autolinked npm libraries** (`llama.rn`, `whisper.rn` in `package.json`). Their JNI/C++ sources live under `node_modules/` when dependencies are installed (not committed here). Exact `JNIEXPORT` names should be taken from those packages after `npm install`, or from their upstream repos.

---

## Audit status table

| Area | Location | Status |
|------|----------|--------|
| llama.cpp / CMake JNI bridge | `android/app/src/main/cpp/` | **Absent in-repo** — provided by `llama.rn` autolinking |
| LLM RN bridge | `LlamaModule.kt` | **Absent** — use `llama.rn` JS API / future direct JNI wrapper |
| Image generation (this fork) | `localdream/LocalDreamModule.kt` | Audited |
| Image gen (legacy name in JS) | `ImageGeneratorModule` | **No Android Kotlin implementation** — see § Legacy `ImageGeneratorModule` |
| Whisper | `WhisperModule.kt` | **Absent** — use `whisper.rn` |
| Model lifecycle Kotlin | `ModelManagerModule.kt` | **Absent** — model RAM strategy lives in TS (`llm.ts`, stores) + native contexts inside `llama.rn` |
| Downloads | `download/DownloadManagerModule.kt` | Audited |
| PDF | `pdf/PDFExtractorModule.kt` | Audited |
| Download completion (system) | `download/DownloadCompleteBroadcastReceiver.kt` | Audited |
| App entry | `MainApplication.kt`, `MainActivity.kt` | Audited |
| Gradle / packaging | `android/app/build.gradle` | Audited (notes only) |

---

## `android/app/build.gradle` (inference-relevant notes)

- **`android:extractNativeLibs="true"`** (manifest) plus **`packaging.jniLibs.useLegacyPackaging = true`**: ensures `.so` files are extracted to the filesystem so **`ProcessBuilder` can exec** `libstable_diffusion_core.so`. Without this, exec from APK zip entries fails (`EACCES`).
- **`aaptOptions.noCompress 'gguf'`**: GGUF models must not be compressed in the APK when bundled.
- **NDK**: `ndkVersion` is set from root ext; native code for LLM comes from linked AARs, not this app module’s `cpp/`.
- **Dependencies**: `kotlinx-coroutines-android` (LocalDream), `pdfiumandroid` (PDF).

---

## LocalDreamModule (`localdream/LocalDreamModule.kt`)

**Module name (RN):** `LocalDreamModule` (`getName()` → `MODULE_NAME`).

**JNI:** None in this module. Inference runs in a **separate process** started with `ProcessBuilder`; the binary is `libstable_diffusion_core.so` loaded from `applicationInfo.nativeLibraryDir` or `filesDir/runtime_libs/`.

### QNN vs MNN code paths

| Mode | Marker files | CLI flags | Hardware |
|------|----------------|-----------|----------|
| **MNN (CPU path)** | `unet.mnn` (+ `clip.mnn` / `clip_v2.mnn`, `vae_decoder.mnn`, optional `vae_encoder.mnn`, `tokenizer.json`) | `--cpu`, paths to `.mnn`, `--port`, `--text_embedding_size` | CPU; OpenCL can be requested per request in JSON (`use_opencl` in server body — see native HTTP API) |
| **QNN (NPU path)** | `unet.bin`, `vae_decoder.bin`, optional `vae_encoder.bin`, `tokenizer.json`, `clip.mnn`/`clip_v2.mnn` or `clip.bin` | `--backend` → `libQnnHtp.so`, `--system_library` → `libQnnSystem.so`, optional `--use_cpu_clip` when MNN clip present | Qualcomm Hexagon via QNN HTP |

**Backend selection (`normalizeBackend` + `resolveBackendAndDir`):**

- Request map key `backend`: `"mnn"`, `"cpu"` → MNN; `"qnn"`, `"npu"` → QNN; `"auto"`, null, `""` → auto.
- **Auto:** Prefer QNN if `unet.bin` tree exists **and** `isNpuSupportedInternal()` (Android S+ and `Build.SOC_MODEL` starts with `"SM"`). Else MNN if `unet.mnn` exists; else QNN-only tree if that’s all that exists.
- **`startWithFallback`:** If QNN start fails and MNN assets exist, **`stopServer()`** and retry MNN.

**NPU detection:** `isNpuSupported` / `isNpuSupportedInternal()` — API 31+ `Build.SOC_MODEL` prefix `SM` (Qualcomm-style). This is a coarse gate, not a full QNN capability matrix.

**QNN runtime libs:** Copied from assets `qnnlibs/*` into `filesDir/runtime_libs/`, compared by size for refresh. **Environment:** `LD_LIBRARY_PATH` (runtime + `/system/lib64` + `/vendor/lib64` + …), `DSP_LIBRARY_PATH`, `ADSP_LIBRARY_PATH`, `MNN_OPENCL_TUNING=WIDE`.

**CLIP file naming constraint (documented in code):** Always pass `--clip` ending with **`clip.mnn`** when using MNN clip variants; the binary detects `clip_v2.mnn` beside it. Passing `clip_v2.mnn` directly **segfaults**.

**Model directory resolution:** `resolveModelDir` searches up to depth 3 for marker `unet.mnn` or `unet.bin` to handle zips that extract nested folders.

**Server lifecycle:**

- Port **18081** (`SERVER_PORT`).
- **Health wait:** Poll `GET http://127.0.0.1:18081/health` every 500ms; timeout **120s** (QNN) / **180s** (MNN).
- **Stdout monitor:** Coroutine reads process output; on non-zero exit (except 143 SIGTERM) emits `LocalDreamError`.
- **State fields:** `serverProcess`, `currentModelPath`, `currentBackend`, `isServerReady`, `activeGenerationConnection`, `generationCancelled` (`AtomicBoolean`).

**Constants exposed to JS (`getConstants`):** `DEFAULT_STEPS`, `DEFAULT_GUIDANCE_SCALE`, `DEFAULT_WIDTH`, `DEFAULT_HEIGHT`, `SUPPORTED_WIDTHS`, `SUPPORTED_HEIGHTS`, `SERVER_PORT`.

### React Native bridge methods (`@ReactMethod`)

| Method | Parameters | Returns (via Promise) | Notes |
|--------|------------|------------------------|-------|
| `loadModel` | `ReadableMap`: `modelPath` (required), `backend` (optional) | `boolean` | Ignores unused keys sent from TS (`threads`, `cpuOnly`, `attentionVariant`) — harmless. Idempotent if same path and server already alive + ready. |
| `unloadModel` | — | `boolean` | Stops process, clears state |
| `isModelLoaded` | — | `boolean` | Process alive **and** `isServerReady` |
| `getLoadedModelPath` | — | `String?` | |
| `isGenerating` | — | `boolean` | `activeGenerationConnection != null` |
| `cancelGeneration` | — | `boolean` | Sets cancel flag, disconnects HTTP |
| `generateImage` | `ReadableMap`: `prompt`, `negativePrompt`, `steps`, `guidanceScale`, `seed`, `width`, `height`, `previewInterval` | `WritableMap`: `id`, `imagePath`, `width`, `height`, `seed`, `generationTimeMs` | POST JSON to `/generate`, SSE `progress` / `complete`; previews saved under `cacheDir/preview/`; final PNG under `filesDir/generated_images/{uuid}.png` |
| `saveRgbAsPng` | `base64Rgb`, `width`, `height`, `outputPath` | `boolean` | RGB bytes → PNG |
| `getGeneratedImages` | — | `ReadableArray` of maps | Lists `generated_images/*.png` |
| `deleteGeneratedImage` | `imageId: String` | `boolean` | Deletes `{imageId}.png` |
| `getServerPort` | — | `int` | Fixed 18081 |
| `isNpuSupported` | — | `boolean` | |
| `getSoCModel` | — | `String` | Empty below API 31 |
| `clearOpenCLCache` | `modelPath: String` | `int` | Deletes `*.mnnc` under resolved MNN dir; **path must be under `filesDir`** (canonical check) |
| `hasOpenCLCache` | `modelPath: String` | `boolean` | Same path guard |
| `addListener` / `removeListeners` | RN event emitter contract | — | No-ops |

### Device events (RN → JS)

| Event | Payload keys | When |
|-------|----------------|------|
| `LocalDreamProgress` | `step`, `totalSteps`, `progress`, optional `previewPath` | SSE `progress` from server |
| `LocalDreamError` | `error` | Server process unexpected exit (not 0 / not 143) |

### JNI method signatures (C++)

**None** in app code. The subprocess binary is prebuilt; JNI is not used for generation in this module.

---

## DownloadManagerModule (`download/DownloadManagerModule.kt`)

**Module name:** `DownloadManagerModule`.

**JNI:** None.

### Persistence and coordination

- **SharedPreferences:** `PREFS_NAME` = `OffgridMobileDownloads`, key `DOWNLOADS_KEY` = `active_downloads` (JSON array of objects).
- **BroadcastReceiver:** `DownloadCompleteBroadcastReceiver` updates the same JSON on `ACTION_DOWNLOAD_COMPLETE` (success / failure, `localUri`, `completedAt`, `failureReason`). Exported receiver in manifest.

### SSRF / redirect hardening

- **Allowed hosts:** `huggingface.co`, `cdn-lfs.huggingface.co`, `cas-bridge.xethub.hf.co`, plus subdomains (`endsWith(".$host")`).
- **`resolveRedirects`:** Up to 5 `HEAD` requests, `instanceFollowRedirects = false`; only follows redirects to allowed hosts; on failure returns original URL.
- **Rationale:** OEM `DownloadManager` failures on long Hugging Face 302 chains; pre-resolve gives a direct CDN URL.

### Polling and events

- **`startProgressPolling` / `stopProgressPolling`:** Main-thread `Handler` every **500ms** calls `pollAllDownloads()`.
- **Events** via `RCTDeviceEventEmitter`: `DownloadProgress`, `DownloadComplete`, `DownloadError`.

### Race condition / completion semantics (`completedEventSent` + `moveCompleted`)

1. **`shouldRemoveDownload` (tested, documented in code):** Prune when live status is `unknown`, **or** when stored status is `completed`, **`moveCompleted` is true**, **`completedAt` is positive**, and age is **greater than 5 seconds**.  
   **Critical:** Do **not** drop completed rows on time alone without `moveCompleted` — JS may call `moveCompletedDownload` much later (sleep/background).

2. **`handlePollCompleted`:** Sends **`DownloadComplete` only once** per download: checks persisted `completedEventSent`; if false, emits event and `updateDownloadStatus` sets `status=completed`, `localUri`, `completedAt`, **`completedEventSent=true`**.

3. **`handlePollUnknown`:** If `DownloadManager` loses the row: if file exists in app external downloads dir with **non-zero** size, treat as completed (emit complete once, update prefs); else remove stale entry.

4. **`cleanupStaleDownloads`:** Called at **`startDownload`**; removes stale rows per `shouldRemoveDownload`; logs warning if completed without `completedEventSent` (polling will retry).

5. **`markMoveCompleted`:** Sets `moveCompleted` on the JSON entry after a successful move/rename/copy — works with (1) for eventual list cleanup.

### React Native bridge methods

| Method | Parameters | Behavior |
|--------|------------|----------|
| `startDownload` | `ReadableMap`: `url`, `fileName`, `modelId`, optional `title`, `description`, `totalBytes`, `hideNotification` | Validates host; deletes same-name file in external downloads dir; cleanup stale; enqueue `DownloadManager`; persist JSON; resolve `{ downloadId, fileName, modelId }` |
| `cancelDownload` | `downloadId: Double` | `remove()` + delete partial file + remove JSON |
| `getActiveDownloads` | — | Merge persisted JSON with live `queryDownloadStatus` |
| `getDownloadProgress` | `downloadId: Double` | Single status query |
| `moveCompletedDownload` | `downloadId: Double`, `targetPath: String` | Resolve source from `localUri` or external downloads path; `renameTo` or copy+delete; `markMoveCompleted` |
| `startProgressPolling` | — | Start handler loop |
| `stopProgressPolling` | — | Stop handler loop |
| `addListener` / `removeListeners` | | No-ops for RN |

**Executor:** Single-thread `Executors.newSingleThreadExecutor()` for `startDownload` redirect/file work; shut down in `onCatalystInstanceDestroy`.

### JS ↔ Android gap

`src/services/backgroundDownloadService.ts` calls **`DownloadManagerModule.startMultiFileDownload`**. There is **no** `@ReactMethod` with that name in this Android module. Multi-file image model downloads that rely on this API will **fail on Android** until a native implementation exists or the TS layer uses only `startDownload`.

---

## PDFExtractorModule (`pdf/PDFExtractorModule.kt`)

**Module name:** `PDFExtractorModule`.

**JNI:** Not declared here; **Pdfium** native code is inside `io.legere:pdfiumandroid`.

### React Native bridge methods

| Method | Parameters | Behavior |
|--------|------------|----------|
| `extractText` | `filePath: String`, `maxChars: Double` | Background `Thread`: open file with `PdfiumCore`, iterate pages, append text until `maxChars`, resolve string or reject `PDF_ERROR` |

---

## DownloadCompleteBroadcastReceiver (`download/DownloadCompleteBroadcastReceiver.kt`)

- **Trigger:** `android.intent.action.DOWNLOAD_COMPLETE`.
- **Actions:** Locates entry in SharedPreferences JSON by `downloadId`; queries `DownloadManager` cursor; on `STATUS_SUCCESSFUL` sets `status=completed`, `localUri`, `completedAt`; on `STATUS_FAILED` sets `status=failed`, `failureReason`, `completedAt`; writes JSON back.
- **Note:** Does **not** set `completedEventSent` — polling / `pollAllDownloads` still owns duplicate-suppression for the `DownloadComplete` **event** to JS.

---

## MainApplication.kt

- Implements `ReactApplication`.
- **`reactHost`:** `getDefaultReactHost` with `PackageList(this).packages` **plus** manual packages:
  - `DownloadManagerPackage()`
  - `LocalDreamPackage()`
  - `PDFExtractorPackage()`
- **`onCreate`:** `loadReactNative(this)`.

Autolinked packages (e.g. `llama.rn`, `whisper.rn`, `react-native-fs`, etc.) are merged by the RN Gradle plugin — not listed explicitly in this file.

---

## MainActivity.kt

- Extends `ReactActivity`.
- **`getMainComponentName()`:** `"OffgridMobile"`.
- **`createReactActivityDelegate`:** `DefaultReactActivityDelegate(..., fabricEnabled)`.
- **`onCreate`:** Applies `AppTheme`, `enableEdgeToEdge()`, passes `null` to `super.onCreate` (fragment restore workaround for `react-native-screens`).

---

## Legacy `ImageGeneratorModule` (JS only on Android)

`src/services/imageGenerator.ts` expects **`NativeModules.ImageGeneratorModule`** with methods such as `loadModel(modelPath)`, `generateImage`, `ImageGenerationProgress` events, etc.

No Kotlin class registers that name in this project. **Active** Android image generation in-app uses **`LocalDreamModule`** via `localDreamGenerator.ts`. The migration should treat `ImageGeneratorModule` as **dead/legacy** unless a separate module is added.

---

## LLM inference — `llama.rn` (autolinked, not `LlamaModule.kt`)

**Primary TS entry:** `initLlama` from `llama.rn`; context type `LlamaContext`.

**There are no `@ReactMethod`s in app Kotlin** — the New Architecture / bridge surface is defined inside the `llama.rn` Android library.

### JS-level API used by this app (from `src/` + contract tests)

Documented for Compose migration planning; **native symbol names** require inspecting `node_modules/llama.rn/android` after install.

| Surface | Usage |
|---------|--------|
| `initLlama(params)` | Model path, `n_ctx`, `n_gpu_layers`, `n_threads`, `n_batch`, `use_mmap`, `use_mlock`, `embedding`, `flash_attn`, `cache_type_k` / `cache_type_v`, `vocab_only`, multimodal-related flags as in `llmHelpers` |
| `context.completion(params, tokenCallback)` | `prompt` or `messages` (incl. multimodal parts), `n_predict`, sampling params, `stop`, tool-related options as used in tool loop |
| `context.stopCompletion()` | Abort streaming |
| `context.release()` | Free native context |
| `context.tokenize(text)` | Returns `{ tokens: number[] }` |
| `context.clearCache(clearData?)` | KV / cache management |
| `context.initMultimodal({ path, use_gpu })` | Vision projector |
| `context.getMultimodalSupport()` | `{ vision, audio }` |
| `(context as any).embedding(text)` | RAG embedding model (`embedding: true` in `initLlama`) — returns `{ embedding: number[] }` |

**RN bridge methods:** Conceptually “every operation above” maps to **direct calls** into a future Kotlin wrapper or retained TurboModule — not enumerated as `@ReactMethod` in this repo.

**State / concurrency (TS, preserve in Compose):**

- `LLMService` uses a **`contextMutexPromise`** chain to serialize `loadModel` / `unload` / `reloadWithSettings` and avoid concurrent native context init (`src/services/llm.ts`).

---

## Whisper — `whisper.rn` (autolinked)

**Primary TS entry:** `initWhisper`, `WhisperContext` from `whisper.rn` (`src/types/whisper.rn.d.ts`, `src/services/whisperService.ts`).

| JS API | Purpose |
|--------|---------|
| `initWhisper({ filePath })` | Load **ggml**-family binary (e.g. `ggml-*.bin` from whisper.cpp distributions) |
| `context.transcribe(filePath, options?)` | Returns `{ stop, promise }`; `TranscribeResult` with `result` |
| `context.transcribeRealtime(options?)` | Real-time mic path with `stop` + `subscribe` |
| `context.release()` | Release context |
| `releaseAllWhisper()` | Global cleanup |

**Model format:** Binary weights compatible with whisper.cpp / whisper.rn (app validates **minimum ~10 MB** before native init to avoid `abort()` — see `WhisperService.validateModelFile`).

**State to preserve:** Serialization of **stop** vs **release** to avoid SIGSEGV (`whisperService` tracks `stopFn`, `transcriptionFullyStopped`, `isReleasingContext`).

---

## StableDiffusionModule / ModelManagerModule / `cpp/`

| Documented target | This repo |
|-------------------|-----------|
| `StableDiffusionModule.kt` | Replaced by **`LocalDreamModule`** architecture (subprocess + HTTP) |
| `ModelManagerModule.kt` | **Not present**; model selection and RAM heuristics live in TypeScript and `llama.rn` context lifecycle |
| `android/app/src/main/cpp/` | **Not present**; LLM JNI is inside **`llama.rn`** AAR/sources |

When merging upstream “sacred” native modules from `alichherawalla/off-grid-mobile`, re-audit and append JNI signatures from those files.

---

## SafePromise (`SafePromise.kt`)

Utility for async native callbacks: **`resolve` / `reject` wrapped in try/catch for `NullPointerException`** when the RN bridge is destroyed before completion. **Preserve** this pattern when adapting modules to Compose (or equivalent “caller gone” guards).

---

## Migration Map — `@ReactMethod` → future direct Kotlin

Maps **only** methods annotated `@ReactMethod` in **this app’s** Kotlin. Third-party RN modules (`llama.rn`, `whisper.rn`) are described qualitatively in sections above.

| RN bridge method | Module | Future Kotlin / Compose equivalent | Suggested phase |
|------------------|--------|-----------------------------------|-----------------|
| `startDownload` | DownloadManagerModule | `DownloadRepository.startDownload(params)` wrapping same logic; suspend / Flow | 2 |
| `cancelDownload` | DownloadManagerModule | `DownloadRepository.cancelDownload(id)` | 2 |
| `getActiveDownloads` | DownloadManagerModule | `Flow` of download list | 2 |
| `getDownloadProgress` | DownloadManagerModule | `suspend fun getProgress(id)` | 2 |
| `moveCompletedDownload` | DownloadManagerModule | `suspend fun moveToModelDir(id, targetPath)` | 2 |
| `startProgressPolling` | DownloadManagerModule | `ModelsViewModel` collects via `callbackFlow` + `DownloadManager` query or WorkManager; avoid JS-specific polling name | 2 |
| `stopProgressPolling` | DownloadManagerModule | Cancel collection job | 2 |
| `addListener` / `removeListeners` | DownloadManagerModule | N/A (use Flow / SharedFlow) | 2 |
| `loadModel` | LocalDreamModule | `ImageGenRepository.loadModel(path, backend)` | 2 |
| `unloadModel` | LocalDreamModule | `ImageGenRepository.unload()` | 2 |
| `isModelLoaded` | LocalDreamModule | Expose as `StateFlow` or suspend | 2 |
| `getLoadedModelPath` | LocalDreamModule | Property / flow | 2 |
| `isGenerating` | LocalDreamModule | `StateFlow` | 2 |
| `cancelGeneration` | LocalDreamModule | `ImageGenRepository.cancel()` | 2 |
| `generateImage` | LocalDreamModule | `suspend fun generate(...): Result` + `SharedFlow` for progress previews | 2 |
| `saveRgbAsPng` | LocalDreamModule | Internal helper or `ImageIo.saveRgbToPng` | 2 |
| `getGeneratedImages` | LocalDreamModule | `suspend fun listGenerated()` | 2 |
| `deleteGeneratedImage` | LocalDreamModule | `suspend fun delete(id)` | 2 |
| `getServerPort` | LocalDreamModule | Constant `18081` or config | 2 |
| `isNpuSupported` | LocalDreamModule | `DeviceCapabilities.isQnnCandidate` (same SOC check or richer) | 2 |
| `getSoCModel` | LocalDreamModule | `Build.SOC_MODEL` wrapper | 2 |
| `clearOpenCLCache` | LocalDreamModule | `MnnRuntime.clearCache(modelPath)` with same path validation | 3 |
| `hasOpenCLCache` | LocalDreamModule | Same | 3 |
| `addListener` / `removeListeners` | LocalDreamModule | Replace with `SharedFlow` events (`Progress`, `Error`) | 2 |
| `extractText` | PDFExtractorModule | `PdfExtractRepository.extractText(path, maxChars)` | 2 |
| `startMultiFileDownload` | *(called from TS only)* | **Implement on Android** or change TS to sequential `startDownload` | 2 |

### JS-native calls without `@ReactMethod` in app Kotlin (must replicate for Compose)

| JS usage | Native origin | Future equivalent |
|----------|---------------|-------------------|
| `initLlama`, `LlamaContext.*` | `llama.rn` | Direct JNI / bundled Kotlin wrapper around same `.so` | 2+ |
| `initWhisper`, `WhisperContext.*` | `whisper.rn` | Same | 2+ |
| `NativeModules.ImageGeneratorModule.*` | **Unimplemented** on Android | Use `LocalDream` pipeline only; delete dead TS path | 2 |

---

## Event map (RN DeviceEventEmitter → Compose)

| Emitter source | Event names | Compose replacement |
|----------------|-------------|---------------------|
| DownloadManagerModule | `DownloadProgress`, `DownloadComplete`, `DownloadError` | `SharedFlow<DownloadUiEvent>` |
| LocalDreamModule | `LocalDreamProgress`, `LocalDreamError` | `SharedFlow<ImageGenEvent>` |

---

*End of Phase 1 native audit for workspace `off-grid-mobile-ai`.*
