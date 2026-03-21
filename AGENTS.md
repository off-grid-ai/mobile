# Agent Brief — Off Grid Necessity Labs Fork

## Mission
Transform the `alichherawalla/off-grid-mobile` React Native app into a
native Kotlin + Jetpack Compose Android application while preserving 100%
of the working on-device AI inference capabilities. The target device is a
Samsung Galaxy S23 Ultra running Android 14.

## What This Project Is
An offline AI suite running LLMs (llama.cpp/GGUF), Stable Diffusion, and
Whisper entirely on-device. The inference engine is written in C++ and
bridged to Android via JNI. The current UI shell is React Native — we are
replacing that shell with native Kotlin while keeping the C++/JNI core.

## Your Operating Constraints
1. **Read CLAUDE.md before every session.** It contains the sacred file list,
   current phase, architecture target, and coding standards.
2. **Read docs/ROADMAP.md.** Work within the current phase only.
3. **Never modify native inference modules** unless the task explicitly names them.
4. **Never add JS/npm dependencies.** We are eliminating the React Native layer.
5. **Build via GitHub Actions only.** Do not attempt local Gradle builds.
6. **Always write complete files.** No stubs, no `// TODO: implement`, no placeholders.
7. **If uncertain about scope**, stop and ask before modifying sacred files.

## Phase Execution Pattern
For any task within the current phase:
1. Read relevant docs listed in CLAUDE.md
2. Identify exact files to create/modify (list them before starting)
3. Write complete implementations
4. Update docs/ROADMAP.md to mark task complete
5. Commit with message: `feat(phase-N): description`

## Output Quality Bar
- Code must compile. If you cannot verify compilation, note it explicitly.
- New Composables must handle loading, error, and empty states.
- New ViewModels must expose a sealed `UiState`.
- New repositories must return `Flow<Result<T>>`.
- Hilt must wire every new dependency — no manual instantiation.

## Hardware Context (for optimization decisions)
- SoC: Snapdragon 8 Gen 2 (Cortex-X3 prime core @ 3.36GHz)
- GPU: Adreno 740 (Vulkan 1.3, OpenCL 3.0)
- NPU: Hexagon 780 (QNN SDK target, 26 TOPS)
- RAM: 12GB LPDDR5X
- Display: 6.8" Dynamic AMOLED 2X, 3088×1440, 120Hz, true black OLED
- S Pen: Samsung S Pen with BLE, 4096 pressure levels, tilt support
- Storage: UFS 3.1

## New Features Being Added (by phase)
- Phase 2: S Pen handwriting input → chat
- Phase 3: AETHER RF context tool (IPC to AETHER app)
- Phase 3: Vulkan text inference backend in llama.cpp
- Phase 4: CODEX knowledge base tool (Supabase query)
- Phase 4: OODA Loop situational awareness tool
- Phase 5: QNN NPU text offload in llama.cpp

## Repo Structure After Migration
```
/
├── CLAUDE.md                    # This project's memory for Claude Code
├── AGENTS.md                    # This file
├── docs/
│   ├── ROADMAP.md
│   ├── ARCHITECTURE.md
│   ├── NATIVE_LAYER.md
│   └── hardware/S23_ULTRA.md
├── .github/workflows/
│   ├── build-debug-apk.yml
│   └── build-release-apk.yml
├── android/                     # THE SACRED LAYER — inference lives here
│   └── app/src/main/
│       ├── cpp/                 # llama.cpp JNI + CMakeLists
│       └── java/ai/offgridmobile/
│           ├── inference/       # LlamaModule, StableDiffusionModule
│           ├── whisper/         # WhisperModule
│           ├── download/        # DownloadManagerModule
│           └── modelmanager/    # ModelManagerModule
└── app/src/main/java/ai/offgridmobile/   # NEW Compose shell lives here
    ├── ui/
    │   ├── screens/
    │   ├── components/
    │   ├── viewmodels/
    │   └── theme/
    ├── data/
    │   ├── local/
    │   └── repository/
    ├── tools/
    ├── spen/
    └── di/
```
