#!/usr/bin/env bash
# =============================================================================
# OFF GRID → NECESSITY LABS BOOTSTRAP KIT
# Run this ONCE from the root of your forked off-grid-mobile repo.
# Creates all AI agent guidance files, rules, roadmap, and CI/CD pipeline.
# Compatible with: Claude Code, Cursor IDE, VS Code + Copilot, Antigravity
# =============================================================================

set -e

echo "🚀 Seeding repo with agent guidance files..."

# Create directory structure
mkdir -p .github/workflows
mkdir -p .cursor
mkdir -p docs/specs
mkdir -p docs/hardware

# =============================================================================
# 1. CLAUDE.md — Claude Code project memory (auto-loaded by `claude` CLI)
# =============================================================================
cat > CLAUDE.md << 'CLAUDE_EOF'
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
CLAUDE_EOF

echo "✅ CLAUDE.md created"

# =============================================================================
# 2. .cursor/rules — Cursor IDE agent rules
# =============================================================================
cat > .cursor/rules << 'CURSOR_EOF'
# Cursor Rules — Off Grid Necessity Labs Fork

## Project Type
React Native → Kotlin/Jetpack Compose migration. The native Android inference
layer (llama.cpp, Stable Diffusion, Whisper) is PRESERVED. Only the UI shell
is being replaced.

## Always Read First
Before any task, read:
1. CLAUDE.md (project memory and constraints)
2. docs/ROADMAP.md (current phase)
3. docs/NATIVE_LAYER.md (what native modules exist and do)

## Hard Rules
- NEVER modify files under `android/app/src/main/cpp/` unless task is "Add Vulkan backend" or "Add QNN text backend"
- NEVER modify the 5 sacred Kotlin native modules listed in CLAUDE.md
- NEVER add new npm/JS dependencies — we are moving AWAY from React Native
- NEVER use `runOnUiThread` or Java in new Kotlin code
- NEVER hardcode strings in Composables
- ALWAYS use Hilt for dependency injection in new code
- ALWAYS use Flow/StateFlow for reactive state, never LiveData in new code
- ALWAYS prefer Composable over XML layouts for any new UI

## Code Style
- Kotlin: 4-space indent, trailing commas in function params
- Composables: PascalCase, parameters with default values where sensible
- ViewModels: suffix `ViewModel`, expose `UiState` sealed class
- Repositories: suffix `Repository`, return `Flow<Result<T>>`

## OLED Theme
- Background: #000000 (true black, not #121212)
- Primary accent: #00BCD4 (teal)
- Surface: #0A0A0A
- On-surface: #E0E0E0
- Error: #CF6679

## Build
Do NOT run `./gradlew` locally — push to `dev/your-branch` and let
GitHub Actions build the APK. See .github/workflows/build-debug-apk.yml.

## Current Phase
Check docs/ROADMAP.md → look for [ CURRENT PHASE ] marker.
Only work on tasks within the current phase unless explicitly told otherwise.
CURSOR_EOF

echo "✅ .cursor/rules created"

# =============================================================================
# 3. AGENTS.md — Universal agent brief (Antigravity, any agent runner)
# =============================================================================
cat > AGENTS.md << 'AGENTS_EOF'
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
AGENTS_EOF

echo "✅ AGENTS.md created"

# =============================================================================
# 4. docs/ROADMAP.md — Phased transformation plan
# =============================================================================
cat > docs/ROADMAP.md << 'ROADMAP_EOF'
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
ROADMAP_EOF

echo "✅ docs/ROADMAP.md created"

# =============================================================================
# 5. docs/ARCHITECTURE.md — Target architecture
# =============================================================================
cat > docs/ARCHITECTURE.md << 'ARCH_EOF'
# Target Architecture

## Layered Stack

```
┌─────────────────────────────────────────────────────────┐
│                   COMPOSE UI LAYER                       │
│  HomeScreen  ChatScreen  ModelsScreen  SettingsScreen   │
│  S Pen Input Overlay    Context Dashboard               │
└──────────────────────────┬──────────────────────────────┘
                           │ Hilt injection
┌──────────────────────────▼──────────────────────────────┐
│                  VIEWMODEL LAYER                         │
│  ChatViewModel  ModelsViewModel  SettingsViewModel       │
│  StateFlow<UiState>  Kotlin Coroutines                  │
└──────────────────────────┬──────────────────────────────┘
                           │ Repository pattern
┌──────────────────────────▼──────────────────────────────┐
│                 REPOSITORY LAYER                         │
│  ConversationRepository  ModelRepository                │
│  SettingsRepository  ContextSourceRepository            │
└────────┬───────────────────────────────┬────────────────┘
         │ Room                          │ Direct JNI call
┌────────▼────────┐          ┌──────────▼────────────────┐
│  LOCAL DATABASE │          │    NATIVE MODULE BRIDGE    │
│  Room + DataStore│         │  LlamaModule (inference)   │
│  Conversations  │          │  StableDiffusionModule     │
│  Model metadata │          │  WhisperModule             │
│  Settings       │          │  DownloadManagerModule     │
└─────────────────┘          │  ModelManagerModule        │
                             │  SpenInputModule (new)     │
                             │  AetherContextBridge (new) │
                             └──────────┬─────────────────┘
                                        │ JNI
                             ┌──────────▼─────────────────┐
                             │     NATIVE C++ LAYER       │
                             │  llama.cpp                 │
                             │  ├── CPU backend           │
                             │  ├── Vulkan/Adreno 740     │
                             │  └── QNN/Hexagon 780 NPU   │
                             │  stable-diffusion.cpp      │
                             │  ├── MNN (CPU)             │
                             │  └── QNN (NPU)             │
                             │  whisper.cpp               │
                             └────────────────────────────┘
```

## Tool Calling Architecture

```
ChatViewModel
    │
    ├── detects tool_use in model response
    │
    └── ToolDispatcher
            ├── WebSearchTool        (existing)
            ├── CalculatorTool       (existing)
            ├── DateTimeTool         (existing)
            ├── DeviceInfoTool       (existing)
            ├── KnowledgeBaseTool    (existing → wire to CODEX)
            ├── AetherTool           (new Phase 3)
            └── OodaTool             (new Phase 4)
```

## Data Flow: User Message → Token Stream

```
User types / S Pen input
    │
    ▼
ChatScreen (Composable)
    │ onSend(message)
    ▼
ChatViewModel.sendMessage(message)
    │ + prepend active context sources
    ▼
ConversationRepository.addMessage()
    │
    ▼
LlamaModule.generate(prompt, params)  ← JNI call
    │
    ▼ streaming callbacks
    │ token by token via Flow
    ▼
ChatViewModel.uiState (StateFlow)
    │
    ▼
ChatScreen recomposes with streaming text
```

## S Pen Input Flow

```
SpenInputModule.kt
    │ listens for INPUT_DEVICE_CHANGE + stylus events
    ▼
HandwritingGesture API / Samsung SpenRemote SDK
    │
    ▼ recognized text string
    ▼
SpenInputCallback → ChatScreen
    │
    ▼
Populates message input field (same path as keyboard)
```

## AETHER Context Flow

```
AetherContextBridge.kt
    │ ContentProvider query to AETHER app (same device IPC)
    ▼
RF environment snapshot: {
  wifi: [...],
  bluetooth: [...],
  cellular: {...},
  anomalies: [...]
}
    │
    ▼
AetherTool.execute() → returns JSON string
    │
    ▼
Injected as tool_result into LLM context
```
ARCH_EOF

echo "✅ docs/ARCHITECTURE.md created"

# =============================================================================
# 6. docs/NATIVE_LAYER.md — Stub (Phase 1 agent fills this in)
# =============================================================================
cat > docs/NATIVE_LAYER.md << 'NATIVE_EOF'
# Native Layer Documentation

> **STATUS: STUB — Phase 1 agent task**
>
> An agent should read each native module file and fill in this document
> with exact JNI signatures, method names, state machines, and notes.
> This document becomes the contract between the Compose shell and the
> C++ inference layer.

## Files to Audit

| File | Location | Status |
|------|----------|--------|
| llama.cpp JNI | android/app/src/main/cpp/ | [ ] Not audited |
| LlamaModule.kt | android/app/src/main/java/ai/offgridmobile/inference/ | [ ] Not audited |
| StableDiffusionModule.kt | android/app/src/main/java/ai/offgridmobile/inference/ | [ ] Not audited |
| WhisperModule.kt | android/app/src/main/java/ai/offgridmobile/whisper/ | [ ] Not audited |
| DownloadManagerModule.kt | android/app/src/main/java/ai/offgridmobile/download/ | [ ] Not audited |
| ModelManagerModule.kt | android/app/src/main/java/ai/offgridmobile/modelmanager/ | [ ] Not audited |
| MainApplication.kt | android/app/src/main/java/ai/offgridmobile/ | [ ] Not audited |
| MainActivity.kt | android/app/src/main/java/ai/offgridmobile/ | [ ] Not audited |

---

## LlamaModule — PENDING AUDIT

### JNI Methods
<!-- Agent: list every native method signature -->

### React Native Bridge Methods (to be replaced with direct Kotlin calls)
<!-- Agent: list every @ReactMethod -->

### State Machine
<!-- Agent: describe model loading states -->

---

## StableDiffusionModule — PENDING AUDIT

### QNN vs MNN Codepaths
<!-- Agent: describe when QNN is used vs MNN CPU fallback -->

---

## WhisperModule — PENDING AUDIT

### Model Format
<!-- Agent: GGUF? Custom binary? -->

---

## DownloadManagerModule — PENDING AUDIT

### Race Condition Fix
<!-- Agent: document the completedEventSent flag logic -->

---

## ModelManagerModule — PENDING AUDIT

### Performance Mode vs Memory Mode
<!-- Agent: document the two loading strategies -->

---

## MainApplication.kt — RN Bridge Wiring

<!-- Agent: list every ReactPackage registered here — these are the modules
     we need to wire directly in the Compose shell -->

---

## Migration Map

<!-- Agent: for every @ReactMethod found above, add a row to this table -->

| RN Bridge Method | Kotlin Direct Call | Phase |
|------------------|--------------------|-------|
| (pending audit)  | (pending)          |       |
NATIVE_EOF

echo "✅ docs/NATIVE_LAYER.md created (stub for Phase 1 agent)"

# =============================================================================
# 7. docs/hardware/S23_ULTRA.md — Hardware spec for optimization decisions
# =============================================================================
cat > docs/hardware/S23_ULTRA.md << 'HW_EOF'
# Samsung Galaxy S23 Ultra — Hardware Reference

## SoC: Snapdragon 8 Gen 2 (SM8550)

### CPU
| Cluster | Cores | Architecture | Max Freq |
|---------|-------|-------------|----------|
| Prime   | 1     | Cortex-X3   | 3.36 GHz |
| Performance | 2  | Cortex-A715 | 2.8 GHz  |
| Performance | 2  | Cortex-A710 | 2.8 GHz  |
| Efficiency  | 3  | Cortex-A510 | 2.0 GHz  |

**Thread recommendation for llama.cpp:** 6 threads (1 X3 + 2 A715 + 2 A710 + 1 A510)
Avoid all 3 efficiency cores for inference — they hurt throughput.

### GPU: Adreno 740
- Vulkan 1.3 ✅ (use for llama.cpp Vulkan backend)
- OpenCL 3.0 ✅
- OpenGL ES 3.2 ✅
- DirectX FL 12_1 equivalent
- Shader cores: 1536
- FP16: ~3.8 TFLOPS
- FP32: ~1.9 TFLOPS

**Vulkan backend target:** Enable `-DGGML_VULKAN=ON` in Phase 3.
Expected improvement over CPU: 1.5–2.5x tok/s on 7B Q4_K_M.

### NPU: Hexagon 780 DSP + HTA
- QNN SDK target ✅
- INT8: ~26 TOPS
- INT4: ~45 TOPS (w/ sparse)
- Supported frameworks: QNN SDK, SNPE, LiteRT delegate

**QNN text inference target:** Phase 5.
Key requirement: Model must be quantized to INT8 or INT4 and converted to
QNN binary format (`.serialized.bin`) using Qualcomm AI Hub or local conversion.

### Memory
- Total RAM: 12 GB LPDDR5X @ 4200 MHz
- Available for model: ~7–8 GB in practice (OS + system services ~4 GB)
- Max practical model size: 7B Q4_K_M (~4.1 GB) with headroom
- 13B Q4_K_M (~7.9 GB) is possible but tight

### Storage
- Type: UFS 3.1
- Sequential read: ~3.2 GB/s
- Impact: Fast model loading from storage; not the bottleneck

### Display
- Size: 6.8 inches
- Resolution: 3088 × 1440 (WQHD+)
- Technology: Dynamic AMOLED 2X
- Refresh: 1–120 Hz adaptive
- **OLED pixel behavior: True black (#000000) = pixels OFF = zero power draw**
- Always use #000000 for background, never #121212

### S Pen
- Protocol: Samsung proprietary (Wacom EMR)
- Pressure levels: 4096
- Tilt support: Yes (up to 60°)
- BLE: Yes (remote shutter, Air Actions)
- Samsung SDK: `com.samsung.android.sdk.pen` (PENUP SDK)
- HandwritingGesture: Android 13+ `HandwritingGesture` API
- **Target for Phase 2 input module**

## Expected Inference Benchmarks (Target)

| Model | Backend | Size | Expected tok/s |
|-------|---------|------|----------------|
| Gemma 3n E2B Q4_K_M | CPU (6 threads) | ~1.4 GB | 35–45 |
| Gemma 3n E2B Q4_K_M | Vulkan | ~1.4 GB | 55–75 |
| Llama 3.2 3B Q4_K_M | CPU | ~2.0 GB | 28–38 |
| Llama 3.2 3B Q4_K_M | Vulkan | ~2.0 GB | 45–65 |
| Qwen3 7B Q4_K_M | CPU | ~4.1 GB | 12–18 |
| Qwen3 7B Q4_K_M | Vulkan | ~4.1 GB | 22–35 |
| Phi-4 Mini Q4_K_M | CPU | ~2.3 GB | 25–35 |

*Benchmarks are estimates based on Adreno 740 Vulkan profile comparisons.
Run actual benchmarks in Phase 3 and record results here.*

## Power Thermal Considerations
- Sustained inference at full CPU: ~5–7W CPU package
- Throttling threshold: ~45°C case temp
- Recommendation: For long inference sessions, enable "performance mode" in
  Android Developer Options or use a thermal profile toggle in app settings
- Vulkan on Adreno typically runs cooler than full CPU for equivalent tok/s
HW_EOF

echo "✅ docs/hardware/S23_ULTRA.md created"

# =============================================================================
# 8. .github/workflows/build-debug-apk.yml — GitHub Actions APK builder
# =============================================================================
cat > .github/workflows/build-debug-apk.yml << 'GH_EOF'
name: Build Debug APK

on:
  push:
    branches:
      - main
      - 'dev/**'
      - 'feat/**'
  pull_request:
    branches:
      - main
  workflow_dispatch:
    inputs:
      reason:
        description: 'Reason for manual trigger'
        required: false
        default: 'Manual build'

jobs:
  build:
    name: Build Debug APK
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      # ── Checkout ─────────────────────────────────────────────────────────
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # ── Node.js (for React Native build phase — remove in Phase 2+) ──────
      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # ── JDK ──────────────────────────────────────────────────────────────
      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      # ── Android SDK ───────────────────────────────────────────────────────
      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      # ── NDK (llama.cpp requires specific NDK) ────────────────────────────
      - name: Install NDK r26d
        run: |
          echo "y" | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
            "ndk;26.3.11579264" \
            "cmake;3.22.1" \
            "build-tools;34.0.0" \
            "platforms;android-34"

      # ── Gradle Cache ─────────────────────────────────────────────────────
      - name: Cache Gradle packages
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ runner.os }}-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}
          restore-keys: |
            gradle-${{ runner.os }}-

      # ── npm Cache ────────────────────────────────────────────────────────
      - name: Cache npm packages
        uses: actions/cache@v4
        with:
          path: node_modules
          key: npm-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
          restore-keys: |
            npm-${{ runner.os }}-

      # ── Install JS dependencies ───────────────────────────────────────────
      - name: Install npm dependencies
        run: npm ci

      # ── Set NDK path ─────────────────────────────────────────────────────
      - name: Configure local.properties
        run: |
          echo "sdk.dir=$ANDROID_HOME" > android/local.properties
          echo "ndk.dir=$ANDROID_HOME/ndk/26.3.11579264" >> android/local.properties

      # ── Grant Gradle execute permission ──────────────────────────────────
      - name: Make gradlew executable
        run: chmod +x android/gradlew

      # ── Build ─────────────────────────────────────────────────────────────
      - name: Build Debug APK
        working-directory: android
        run: ./gradlew assembleDebug --no-daemon --stacktrace
        env:
          ANDROID_HOME: ${{ env.ANDROID_HOME }}
          NDK_HOME: ${{ env.ANDROID_HOME }}/ndk/26.3.11579264

      # ── Get version info for artifact naming ─────────────────────────────
      - name: Get build info
        id: build_info
        run: |
          echo "sha_short=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT
          echo "branch=$(echo ${GITHUB_REF#refs/heads/} | sed 's/\//-/g')" >> $GITHUB_OUTPUT
          echo "date=$(date +'%Y%m%d-%H%M')" >> $GITHUB_OUTPUT

      # ── Upload APK artifact ──────────────────────────────────────────────
      - name: Upload Debug APK
        uses: actions/upload-artifact@v4
        with:
          name: offgrid-debug-${{ steps.build_info.outputs.branch }}-${{ steps.build_info.outputs.sha_short }}-${{ steps.build_info.outputs.date }}
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 14

      # ── Post build summary ───────────────────────────────────────────────
      - name: Build summary
        run: |
          echo "## ✅ Debug APK Built" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Property | Value |" >> $GITHUB_STEP_SUMMARY
          echo "|----------|-------|" >> $GITHUB_STEP_SUMMARY
          echo "| Branch | ${{ steps.build_info.outputs.branch }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Commit | ${{ steps.build_info.outputs.sha_short }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Built at | ${{ steps.build_info.outputs.date }} |" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Download the APK from the **Artifacts** section above ↑" >> $GITHUB_STEP_SUMMARY

      # ── On failure: upload logs ───────────────────────────────────────────
      - name: Upload build logs on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: build-logs-${{ steps.build_info.outputs.sha_short }}
          path: |
            android/app/build/reports/
            android/.gradle/
          retention-days: 7
GH_EOF

echo "✅ .github/workflows/build-debug-apk.yml created"

# =============================================================================
# 9. .github/workflows/build-release-apk.yml — Manual release build
# =============================================================================
cat > .github/workflows/build-release-apk.yml << 'RELEASE_EOF'
name: Build Release APK (Manual)

# Release builds are manual-only until Phase 5 signing config is set up
on:
  workflow_dispatch:
    inputs:
      version_name:
        description: 'Version name (e.g. 1.0.0-alpha)'
        required: true
      release_notes:
        description: 'Brief release notes'
        required: false
        default: 'Internal build'

jobs:
  build-release:
    name: Build Release APK
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Install NDK r26d
        run: |
          echo "y" | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
            "ndk;26.3.11579264" \
            "cmake;3.22.1" \
            "build-tools;34.0.0" \
            "platforms;android-34"

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-release-${{ runner.os }}-${{ hashFiles('**/*.gradle*') }}

      - name: Install npm dependencies
        run: npm ci

      - name: Configure local.properties
        run: |
          echo "sdk.dir=$ANDROID_HOME" > android/local.properties
          echo "ndk.dir=$ANDROID_HOME/ndk/26.3.11579264" >> android/local.properties

      - name: Make gradlew executable
        run: chmod +x android/gradlew

      # NOTE: Using debug signing until Phase 5 release signing is configured
      # Replace with assembleRelease + keystore secrets when ready
      - name: Build Release APK (debug-signed)
        working-directory: android
        run: ./gradlew assembleRelease --no-daemon
        env:
          ANDROID_HOME: ${{ env.ANDROID_HOME }}

      - name: Upload Release APK
        uses: actions/upload-artifact@v4
        with:
          name: offgrid-release-v${{ github.event.inputs.version_name }}
          path: android/app/build/outputs/apk/release/
          retention-days: 30
RELEASE_EOF

echo "✅ .github/workflows/build-release-apk.yml created"

# =============================================================================
# 10. Initial AGENT SESSION PROMPT — paste at start of any AI session
# =============================================================================
cat > docs/AGENT_SESSION_PROMPT.md << 'PROMPT_EOF'
# Agent Session Starter Prompt

Copy-paste this at the beginning of any new AI agent session
(Claude Code, Cursor, Antigravity, VS Code Copilot, etc.)

---

```
You are working on a fork of the `alichherawalla/off-grid-mobile` React Native
Android app. This project is being transformed into a native Kotlin + Jetpack
Compose app while preserving the existing C++/JNI inference layer intact.

Before doing anything else:
1. Read CLAUDE.md in full — it contains the project memory, sacred file list,
   current phase, architecture target, and coding standards.
2. Read docs/ROADMAP.md — identify the [ CURRENT PHASE ] marker and only
   work on tasks in that phase unless told otherwise.
3. If the task involves native module code, read docs/NATIVE_LAYER.md first.
4. If the task involves hardware optimization, read docs/hardware/S23_ULTRA.md.

Operating rules:
- Never modify the sacred native inference modules unless explicitly instructed.
- Never add npm/JS dependencies — we are eliminating the React Native layer.
- Write complete implementations — no stubs, no TODOs, no placeholders.
- Build is done via GitHub Actions, not locally. Do not attempt to run Gradle.
- After completing a task, update docs/ROADMAP.md to mark the task [x] done.
- Commit convention: `type(phase-N): description`

What is the task for this session?
```
PROMPT_EOF

echo "✅ docs/AGENT_SESSION_PROMPT.md created"

# =============================================================================
# 11. .gitignore additions (append if file exists)
# =============================================================================
cat >> .gitignore << 'GITIGNORE_EOF'

# Necessity Labs additions
*.apk
*.aab
android/local.properties
.cursor/
!.cursor/rules
GITIGNORE_EOF

echo "✅ .gitignore updated"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "=============================================="
echo "  Bootstrap complete! Files created:"
echo "=============================================="
echo ""
echo "  CLAUDE.md                              ← Claude Code project memory"
echo "  AGENTS.md                              ← Universal agent brief"
echo "  .cursor/rules                          ← Cursor IDE rules"
echo "  docs/ROADMAP.md                        ← Phased plan"
echo "  docs/ARCHITECTURE.md                   ← Target architecture"
echo "  docs/NATIVE_LAYER.md                   ← Native module map (stub)"
echo "  docs/hardware/S23_ULTRA.md             ← Your hardware spec"
echo "  docs/AGENT_SESSION_PROMPT.md           ← Paste at session start"
echo "  .github/workflows/build-debug-apk.yml  ← Auto-builds on every push"
echo "  .github/workflows/build-release-apk.yml← Manual release build"
echo ""
echo "  NEXT STEPS:"
echo "  1. git add -A"
echo "  2. git commit -m 'chore: add Necessity Labs bootstrap kit'"
echo "  3. git push origin main"
echo "  4. Go to GitHub Actions → verify first build passes"
echo "  5. Open CLAUDE.md or start a session with docs/AGENT_SESSION_PROMPT.md"
echo "     and tell the agent to begin Phase 1."
echo ""
echo "  The AI will handle the rest."
echo ""