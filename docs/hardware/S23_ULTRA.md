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
