// Model size recommendations based on device RAM
export const MODEL_RECOMMENDATIONS = {
  // RAM in GB -> max model parameters in billions
  memoryToParams: [
    { minRam: 3, maxRam: 4, maxParams: 1.5, quantization: 'Q4_K_M' },
    { minRam: 4, maxRam: 6, maxParams: 3, quantization: 'Q4_K_M' },
    { minRam: 6, maxRam: 8, maxParams: 4, quantization: 'Q4_K_M' },
    { minRam: 8, maxRam: 12, maxParams: 8, quantization: 'Q4_K_M' },
    { minRam: 12, maxRam: 16, maxParams: 13, quantization: 'Q4_K_M' },
    { minRam: 16, maxRam: Infinity, maxParams: 30, quantization: 'Q4_K_M' },
  ],
};

// Curated list of recommended models for mobile (updated Apr 2026)
// All IDs use official org repos where available, ggml-org (HuggingFace official) as fallback
export const RECOMMENDED_MODELS = [
  // --- NEW: Gemma 4 (Apr 2026) ---
  {
    id: 'ggml-org/gemma-4-E2B-it-GGUF',
    name: 'Gemma 4 E2B',
    params: 2,
    description: 'Google\'s latest with thinking mode, MoE architecture',
    minRam: 4,
    type: 'text' as const,
    org: 'google',
    isNew: true,
  },
  {
    id: 'ggml-org/gemma-4-E4B-it-GGUF',
    name: 'Gemma 4 E4B',
    params: 4,
    description: 'Google\'s latest, stronger reasoning + vision',
    minRam: 6,
    type: 'vision' as const,
    org: 'google',
    isNew: true,
  },
  // --- Text: Ultra-light (3 GB+) ---
  {
    id: 'unsloth/Qwen3.5-0.8B-GGUF',
    name: 'Qwen 3.5 0.8B',
    params: 0.8,
    description: 'Latest Qwen 3.5 with thinking mode, ultra-light',
    minRam: 3,
    type: 'vision' as const,
    org: 'Qwen',
  },
  {
    id: 'ggml-org/gemma-3-1b-it-GGUF',
    name: 'Gemma 3 1B',
    params: 1,
    description: 'Google\'s tiny model, 128K context',
    minRam: 3,
    type: 'text' as const,
    org: 'google',
  },
  // --- Text: Small (4 GB+) ---
  {
    id: 'bartowski/Llama-3.2-1B-Instruct-GGUF',
    name: 'Llama 3.2 1B',
    params: 1,
    description: 'Meta\'s fastest mobile model, 128K context',
    minRam: 4,
    type: 'text' as const,
    org: 'meta-llama',
  },
  {
    id: 'ggml-org/gemma-3n-E2B-it-GGUF',
    name: 'Gemma 3n E2B',
    params: 2,
    description: 'Google\'s mobile-first with selective activation',
    minRam: 4,
    type: 'text' as const,
    org: 'google',
  },
  {
    id: 'unsloth/Qwen3.5-2B-GGUF',
    name: 'Qwen 3.5 2B',
    params: 2,
    description: 'Qwen 3.5 hybrid architecture, 262K context',
    minRam: 4,
    type: 'text' as const,
    org: 'Qwen',
  },
  // --- Text: Medium (6 GB+) ---
  {
    id: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    name: 'Llama 3.2 3B',
    params: 3,
    description: 'Best quality-to-size ratio for mobile',
    minRam: 6,
    type: 'text' as const,
    org: 'meta-llama',
  },
  {
    id: 'ggml-org/SmolLM3-3B-GGUF',
    name: 'SmolLM3 3B',
    params: 3,
    description: 'Strong reasoning & 128K context',
    minRam: 6,
    type: 'text' as const,
    org: 'HuggingFaceTB',
  },
  {
    id: 'bartowski/microsoft_Phi-4-mini-instruct-GGUF',
    name: 'Phi-4 Mini',
    params: 3.8,
    description: 'Math & reasoning specialist',
    minRam: 6,
    type: 'text' as const,
    org: 'microsoft',
  },
  // --- Vision: Ultra-light (3 GB+) ---
  {
    id: 'ggml-org/SmolVLM-256M-Instruct-GGUF',
    name: 'SmolVLM 256M',
    params: 0.26,
    description: 'Tiny vision model, runs on any device',
    minRam: 3,
    type: 'vision' as const,
    org: 'HuggingFaceTB',
  },
  {
    id: 'ggml-org/SmolVLM2-256M-Video-Instruct-GGUF',
    name: 'SmolVLM2 256M',
    params: 0.26,
    description: 'V2 tiny vision + video understanding',
    minRam: 3,
    type: 'vision' as const,
    org: 'HuggingFaceTB',
  },
  {
    id: 'ggml-org/SmolVLM-500M-Instruct-GGUF',
    name: 'SmolVLM 500M',
    params: 0.5,
    description: 'Compact vision for low-memory devices',
    minRam: 3,
    type: 'vision' as const,
    org: 'HuggingFaceTB',
  },
  {
    id: 'ggml-org/SmolVLM2-500M-Video-Instruct-GGUF',
    name: 'SmolVLM2 500M',
    params: 0.5,
    description: 'V2 compact vision + video understanding',
    minRam: 3,
    type: 'vision' as const,
    org: 'HuggingFaceTB',
  },
  // --- Vision: Small (4 GB+) ---
  {
    id: 'ggml-org/SmolVLM-Instruct-GGUF',
    name: 'SmolVLM 2B',
    params: 2,
    description: 'Mobile-optimized vision-language',
    minRam: 4,
    type: 'vision' as const,
    org: 'HuggingFaceTB',
  },
  {
    id: 'ggml-org/SmolVLM2-2.2B-Instruct-GGUF',
    name: 'SmolVLM2 2.2B',
    params: 2.2,
    description: 'V2 best SmolVLM quality, vision + video',
    minRam: 4,
    type: 'vision' as const,
    org: 'HuggingFaceTB',
  },
  {
    id: 'ggml-org/gemma-3n-E4B-it-GGUF',
    name: 'Gemma 3n E4B',
    params: 4,
    description: 'Vision + audio, built for mobile',
    minRam: 6,
    type: 'vision' as const,
    org: 'google',
  },
  // --- Text: Large (8 GB+) ---
  {
    id: 'unsloth/Qwen3.5-9B-GGUF',
    name: 'Qwen 3.5 9B',
    params: 9,
    description: 'Qwen 3.5 thinking mode, 262K context',
    minRam: 8,
    type: 'text' as const,
    org: 'Qwen',
  }
];

// Model organization filter options
export const MODEL_ORGS = [
  { key: 'Qwen', label: 'Qwen' },
  { key: 'meta-llama', label: 'Llama' },
  { key: 'google', label: 'Google' },
  { key: 'microsoft', label: 'Microsoft' },
  { key: 'mistralai', label: 'Mistral' },
  { key: 'deepseek-ai', label: 'DeepSeek' },
  { key: 'HuggingFaceTB', label: 'HuggingFace' },
  { key: 'nvidia', label: 'NVIDIA' },
];

// Quantization levels and their properties
export const QUANTIZATION_INFO: Record<string, {
  bitsPerWeight: number;
  quality: string;
  description: string;
  recommended: boolean;
}> = {
  'Q2_K': { bitsPerWeight: 2.625, quality: 'Low', description: 'Extreme compression, noticeable quality loss', recommended: false },
  'Q3_K_S': { bitsPerWeight: 3.4375, quality: 'Low-Medium', description: 'High compression, some quality loss', recommended: false },
  'Q3_K_M': { bitsPerWeight: 3.4375, quality: 'Medium', description: 'Good compression with acceptable quality', recommended: false },
  'Q4_0': { bitsPerWeight: 4, quality: 'Medium', description: 'Basic 4-bit quantization', recommended: false },
  'Q4_K_S': { bitsPerWeight: 4.5, quality: 'Medium-Good', description: 'Good balance of size and quality', recommended: true },
  'Q4_K_M': { bitsPerWeight: 4.5, quality: 'Good', description: 'Optimal for mobile - best balance', recommended: true },
  'Q5_K_S': { bitsPerWeight: 5.5, quality: 'Good-High', description: 'Higher quality, larger size', recommended: false },
  'Q5_K_M': { bitsPerWeight: 5.5, quality: 'High', description: 'Near original quality', recommended: false },
  'Q6_K': { bitsPerWeight: 6.5, quality: 'Very High', description: 'Minimal quality loss', recommended: false },
  'Q8_0': { bitsPerWeight: 8, quality: 'Excellent', description: 'Best quality, largest size', recommended: false },
};
