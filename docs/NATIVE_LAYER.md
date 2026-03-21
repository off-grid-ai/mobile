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
