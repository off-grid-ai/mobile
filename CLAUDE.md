# Off Grid → Necessity Labs Fork — Claude Code Project Memory

## Project Identity
This is a **Path A fork** of `alichherawalla/off-grid-mobile`.
Goal: Replace the React Native UI shell with a native Kotlin + Jetpack Compose
shell while keeping 100% of the proven Android native inference layer intact.

This is a **personal daily-driver build** for a Samsung Galaxy S23 Ultra
(Snapdragon 8 Gen 2, Adreno 740, Hexagon 780 NPU, 12GB RAM, 6.8" AMOLED,
S Pen). Later it may become a Necessity Labs product — keep the architecture
clean with that in mind.

## Owner Context
- Developer: Evan / Necessity Labs (solo)
- Primary dev tools: Claude Code CLI, Cursor IDE, VS Code, Antigravity IDE
- Build method: GitHub Actions (local machine has limited RAM — no Android Studio builds)
- Device workflow: Termux on S23 Ultra for git operations and lightweight edits

## ⚠️ SACRED — DO NOT MODIFY WITHOUT EXPLICIT INSTRUCTION
The following native Android modules are proven, working, and must be
preserved exactly as-is unless a task explicitly targets them:

```
android/app/src/main/cpp/                   # llama.cpp JNI bridge + CMakeLists
android/app/src/main/java/ai/offgridmobile/
  ├── download/DownloadManagerModule.kt      # Model downloader (race-condition fix inside)
  ├── inference/LlamaModule.kt               # llama.cpp JNI wrapper
  ├── inference/StableDiffusionModule.kt     # QNN/MNN image gen pipeline
  ├── whisper/WhisperModule.kt               # On-device Whisper STT
  └── modelmanager/ModelManagerModule.kt     # Model lifecycle + RAM management
```

**Never touch these unless the task is specifically**:
- Adding Vulkan text backend to llama.cpp
- Adding QNN text offload to llama.cpp
- Wiring a new context source (AETHER, OODA) as a tool

## Current Phase
**PHASE 1 — Environment Audit & Dependency Map**
See docs/ROADMAP.md for all phases.

## Architecture Target
```
UI:            Jetpack Compose (Material3, OLED black #000000, teal #00BCD4)
DI:            Hilt
Async:         Kotlin Coroutines + Flow
Persistence:   Room (conversations, model metadata, settings)
Inference:     Existing llama.cpp JNI (DO NOT REWRITE)
               └── Enable Vulkan backend (Phase 3)
               └── Add QNN text offload (Phase 4)
Image Gen:     Existing QNN/MNN Stable Diffusion (DO NOT REWRITE)
Voice:         Existing Whisper JNI (DO NOT REWRITE)
S Pen:         New Kotlin native module (Phase 2)
AETHER Bridge: New Kotlin IPC module (Phase 3)
CODEX Tool:    New tool calling integration (Phase 4)
```

## Tech Stack (new Compose shell)
- Kotlin 1.9+
- Jetpack Compose BOM latest stable
- Hilt 2.51+
- Room 2.6+
- Kotlin Coroutines 1.8+
- DataStore Preferences (replace AsyncStorage)
- Coil3 (image loading)
- Accompanist (permissions, system UI)
- Samsung S Pen SDK (spen-sdk via Maven)

## What Gets REMOVED
- All `src/` TypeScript/React Native UI code
- `node_modules/` and `package.json` dependencies (after native extraction complete)
- The React Native bridge boilerplate in MainApplication.kt / MainActivity.kt
- Hermes JS engine dependency

## What Gets KEPT
- Entire `android/` directory (minus RN bridge wiring in MainApplication)
- All JNI/NDK build files
- All Kotlin native modules listed above
- `.github/workflows/` (our new ones)

## Coding Standards
- Kotlin idioms only — no Java in new code
- Composables must be stateless where possible; state hoisted to ViewModel
- Every new feature gets a corresponding ViewModel + Repository
- OLED theme: background always #000000, never #121212 or #1C1C1C
- Teal accent: #00BCD4 primary, #00ACC1 dark variant
- All strings in `res/values/strings.xml` — no hardcoded strings in composables
- Coroutines scope: viewModelScope for UI-bound, lifecycleScope never in VM

## Key Docs
- docs/ROADMAP.md       — Phased plan, current phase highlighted
- docs/ARCHITECTURE.md  — Full target architecture diagram
- docs/NATIVE_LAYER.md  — Every native module: what it does, JNI method signatures
- docs/hardware/S23_ULTRA.md — Hardware specs and optimization targets

## GitHub Actions
- Push to `main` or `dev/*` triggers debug APK build
- APK uploaded as artifact, downloadable from Actions tab
- Do NOT add local signing configs — use debug keystore only until Phase 5

## Common Tasks Reference
| Task | Where to work |
|------|--------------|
| New UI screen | app/src/main/java/ai/offgridmobile/ui/screens/ |
| New ViewModel | app/src/main/java/ai/offgridmobile/ui/viewmodels/ |
| New repository | app/src/main/java/ai/offgridmobile/data/repository/ |
| New Room entity | app/src/main/java/ai/offgridmobile/data/local/entities/ |
| New tool call | app/src/main/java/ai/offgridmobile/tools/ |
| Native module | android/app/src/main/java/ai/offgridmobile/[module]/ |
| Hilt modules | app/src/main/java/ai/offgridmobile/di/ |
