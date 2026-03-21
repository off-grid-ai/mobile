# Transformation Roadmap — Off Grid → Necessity Labs

## Legend
- [ ] Not started
- [~] In progress  ← [ CURRENT PHASE ] marker lives next to the active phase
- [x] Complete

---

## Phase 0 — Fork & Bootstrap [ COMPLETE ]
- [x] Fork `alichherawalla/off-grid-mobile`
- [x] Run bootstrap script (creates this file and all agent guidance)
- [x] Add GitHub Actions debug APK workflow
- [x] Verify first Actions build passes on upstream code

---

## Phase 1 — Native Layer Audit [ CURRENT PHASE ] [~]

Goal: Fully understand the existing native inference modules before touching anything.
An agent should read each file and produce a summary in docs/NATIVE_LAYER.md.

Tasks:
- [ ] Audit `android/app/src/main/cpp/` — document CMakeLists targets, llama.cpp version, JNI method signatures
- [ ] Audit `LlamaModule.kt` — document all exposed RN bridge methods and their Kotlin signatures
- [ ] Audit `StableDiffusionModule.kt` — document QNN vs MNN codepaths
- [ ] Audit `WhisperModule.kt` — document model format, JNI calls
- [ ] Audit `DownloadManagerModule.kt` — document state machine, race condition fix
- [ ] Audit `ModelManagerModule.kt` — document Performance vs Memory loading strategies
- [ ] Document all findings in `docs/NATIVE_LAYER.md`
- [ ] Identify exact RN bridge wiring in `MainApplication.kt` / `MainActivity.kt`
- [ ] Map every JS-to-native call in `src/` that we need to replicate in Compose

Commit convention: `audit(phase-1): description`

---

## Phase 2 — Compose Shell Scaffold [~]

Goal: Replace React Native entry point with a Kotlin/Compose app that calls
the existing native modules directly (no JS bridge).

Tasks:
- [ ] Add Jetpack Compose + Hilt + Room + DataStore dependencies to `android/app/build.gradle`
- [ ] Remove React Native bridge registration from `MainApplication.kt`
- [ ] Remove React Native renderer from `MainActivity.kt`; replace with `setContent { OffGridApp() }`
- [ ] Create `OffGridApp.kt` — root Compose entry point with NavHost
- [ ] Create `AppTheme.kt` — OLED black (#000000) + teal (#00BCD4) Material3 theme
- [ ] Create `HomeScreen.kt` — conversation list
- [ ] Create `ChatScreen.kt` — chat UI with streaming token display
- [ ] Create `ModelsScreen.kt` — model browser + download manager UI
- [ ] Create `SettingsScreen.kt` — app settings
- [ ] Wire `LlamaModule.kt` directly from `ChatViewModel.kt` (no JS bridge)
- [ ] Wire `DownloadManagerModule.kt` from `ModelsViewModel.kt`
- [ ] Verify full debug build passes in GitHub Actions
- [ ] Verify basic chat works on device via sideload

Commit convention: `feat(phase-2): description`

---

## Phase 3 — S Pen + Vulkan + AETHER

Goal: Add the first Necessity Labs differentiators.

Tasks:
- [ ] Create `SpenInputModule.kt` — Samsung S Pen → text via HandwritingGesture API
- [ ] Wire S Pen input into `ChatScreen.kt` as alternative input method
- [ ] Enable Vulkan backend in llama.cpp CMakeLists (`-DGGML_VULKAN=ON`)
- [ ] Add Vulkan device selection in `LlamaModule.kt`
- [ ] Benchmark: measure tok/s delta CPU vs Vulkan on Adreno 740
- [ ] Create `AetherContextBridge.kt` — IPC client reading AETHER RF environment snapshot
- [ ] Add AETHER as a tool in the tool calling system
- [ ] Update `ChatScreen.kt` to show active context sources indicator

Commit convention: `feat(phase-3): description`

---

## Phase 4 — CODEX + OODA Integration

Goal: Make the inference layer aware of your personal knowledge graph and
physical environment.

Tasks:
- [ ] Create `CodexTool.kt` — queries CODEX Supabase backend (LAN or API)
- [ ] Create `OodaContextTool.kt` — pulls structured snapshot from OODA Loop app
- [ ] Integrate both tools into tool calling dispatch
- [ ] Add `ContextSourceManager.kt` — manages which context sources are active
- [ ] Create `ContextDashboard.kt` composable — shows live active context feeds
- [ ] Add conversation export to CODEX

Commit convention: `feat(phase-4): description`

---

## Phase 5 — QNN NPU Text Offload

Goal: Push tok/s past the CPU/Vulkan ceiling using the Hexagon 780 NPU.

Tasks:
- [ ] Research llama.cpp QNN backend build requirements for Android
- [ ] Add QNN SDK dependency to CMakeLists
- [ ] Add `-DGGML_QNN=ON` build variant
- [ ] Test QNN offload on Q4_K_M quantized models
- [ ] Benchmark: CPU vs Vulkan vs QNN on 3B, 7B, 13B models
- [ ] Add backend selector in Settings (Auto / CPU / Vulkan / QNN)

Commit convention: `feat(phase-5): description`

---

## Phase 6 — Polish + Necessity Labs Branding

Goal: Prepare for potential Necessity Labs public release.

Tasks:
- [ ] Update `applicationId` to `com.necessitylabs.offgrid` (or chosen name)
- [ ] Update app name, icons, splash screen
- [ ] Add S23 Ultra large-screen split-pane layout (landscape mode)
- [ ] Add Veil of Echoes writing mode (system prompt preset manager)
- [ ] Add character memory sidebar for long-form fiction
- [ ] Performance profiling pass (startup time, memory under load)
- [ ] Release signing config + GitHub Actions release workflow
- [ ] Google Play internal test track

Commit convention: `feat(phase-6): description`

---

## Deferred / Future
- RTL-SDR companion input (AETHER hardware tier)
- DeX desktop mode layout
- Gemma 3n E2B/E4B optimized model profile
- Remote CODEX sync (not just LAN)
