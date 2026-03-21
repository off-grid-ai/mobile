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
