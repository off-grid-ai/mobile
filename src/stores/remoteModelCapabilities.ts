
/**
 * Remote Model Capabilities
 *
 * Helpers for fetching model metadata (context length, vision support)
 * from Ollama and LM Studio servers.
 */

import logger from '../utils/logger';

export interface RemoteModelInfo {
  contextLength: number;
  supportsVision: boolean;
  supportsToolCalling?: boolean;
  supportsThinking?: boolean;
}

function parseModelInfoKeys(modelInfo: Record<string, unknown>): { contextLength: number; supportsVision: boolean } {
  let contextLength = 0;
  let supportsVision = false;
  for (const key of Object.keys(modelInfo)) {
    if (key.endsWith('.context_length')) {
      const val = modelInfo[key];
      if (typeof val === 'number' && val > 0) contextLength = val;
    }
    if (key.includes('vision') || key.includes('clip')) {
      supportsVision = true;
    }
  }
  return { contextLength, supportsVision };
}

function parseNumCtx(parameters: string): number {
  const match = /num_ctx\s+(\d+)/.exec(parameters);
  if (match) {
    const val = Number.parseInt(match[1], 10);
    if (val > 0) return val;
  }
  return 0;
}

function extractOllamaCapabilities(data: Record<string, unknown>): RemoteModelInfo {
  let contextLength = 4096;
  let supportsVision = false;

  // Newer Ollama versions expose a top-level `capabilities` array (e.g. ["vision", "tools"]).
  // Gemma 4 and similar models use this field instead of model_info keys.
  let supportsToolCalling: boolean | undefined;
  if (Array.isArray(data.capabilities)) {
    const caps = data.capabilities as unknown[];
    supportsVision = caps.includes('vision');
    supportsToolCalling = caps.includes('tools');
  }

  if (data.model_info && typeof data.model_info === 'object') {
    const parsed = parseModelInfoKeys(data.model_info as Record<string, unknown>);
    if (parsed.contextLength > 0) contextLength = parsed.contextLength;
    if (!supportsVision) supportsVision = parsed.supportsVision;
  }

  // projector_info is present for multimodal models when capabilities array is missing.
  if (!supportsVision && data.projector_info && typeof data.projector_info === 'object') {
    const projectorKeys = Object.keys(data.projector_info as Record<string, unknown>);
    supportsVision = projectorKeys.some(k => k.includes('vision') || k.includes('clip'));
  }

  if (contextLength === 4096 && typeof data.parameters === 'string') {
    const numCtx = parseNumCtx(data.parameters);
    if (numCtx > 0) contextLength = numCtx;
  }

  // Thinking support detection:
  // - Older models: template contains .Think / .Thinking / .IsThinkSet
  // - Newer models (qwen3.5+): use RENDERER/PARSER in modelfile instead of template logic
  const template = typeof data.template === 'string' ? data.template : '';
  const modelfile = typeof data.modelfile === 'string' ? data.modelfile : '';
  const supportsThinking =
    /\.Think|\.Thinking|\.IsThinkSet/.test(template) ||
    /^RENDERER\s/m.test(modelfile);

  return { contextLength, supportsVision, supportsToolCalling, supportsThinking };
}

/**
 * Fetches model capabilities for an Ollama model via POST /api/show.
 * Vision is detected by inspecting model_info keys for "vision" or "clip" —
 * Ollama populates these for multimodal models (e.g. clip.vision.block_count).
 * Falls back to contextLength=4096, supportsVision=false on any failure.
 */
export async function fetchRemoteModelInfo(
  endpoint: string,
  modelName: string,
): Promise<RemoteModelInfo> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${endpoint}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return { contextLength: 4096, supportsVision: false };

    const data = await response.json();
    return extractOllamaCapabilities(data);
  } catch {
    // Timeout, network error, parse error
  }

  return { contextLength: 4096, supportsVision: false };
}

/**
 * Fetches model capabilities for an LM Studio server via GET /api/v1/models.
 * LM Studio's native endpoint exposes vision and tool-use capability per model.
 * Falls back to contextLength=4096, supportsVision=false on any failure.
 */
export async function fetchLmStudioModelInfo(
  endpoint: string,
  modelId: string,
): Promise<RemoteModelInfo> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${endpoint}/api/v1/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return { contextLength: 4096, supportsVision: false };

    const data = await response.json();
    // LM Studio /api/v1/models returns { models: [...] } with each entry keyed by "key" field
    const models: unknown[] = Array.isArray(data?.models) ? data.models : [];

    const model = models.find(
      (m): m is Record<string, unknown> =>
        typeof m === 'object' && m !== null && (m as Record<string, unknown>).key === modelId,
    );

    if (!model) return { contextLength: 4096, supportsVision: false };

    // LM Studio capabilities: { vision: bool, trained_for_tool_use: bool }
    // Note: type is always "llm" even for VL models — use capabilities.vision instead
    const caps = typeof model.capabilities === 'object' && model.capabilities !== null
      ? model.capabilities as Record<string, unknown>
      : {};

    const contextLength =
      typeof model.max_context_length === 'number' && model.max_context_length > 0
        ? model.max_context_length
        : 4096;

    // LM Studio doesn't expose thinking capability in /api/v1/models.
    // Probe via a 1-token streaming request — thinking models emit <think> as the first chunk.
    const supportsThinking = await probeLmStudioThinking(endpoint, modelId);

    return {
      contextLength,
      supportsVision: caps.vision === true,
      supportsToolCalling: caps.trained_for_tool_use === true,
      supportsThinking,
    };
  } catch {
    // Timeout, network error, parse error
  }

  return { contextLength: 4096, supportsVision: false };
}

/**
 * Probe an LM Studio model for thinking support by sending a short streaming
 * request and checking if any SSE delta contains thinking content.
 *
 * LM Studio only honours `chat_template_kwargs` in streaming mode.
 * React Native's fetch doesn't support ReadableStream, so the full SSE
 * response is collected with `response.text()` instead.
 *
 * LM Studio may return thinking in different ways:
 * - Inline `<think>` tags in message.content
 * - Separate message.reasoning_content field
 */
function deltaHasThinking(delta: Record<string, unknown>): boolean {
  if (typeof delta.content === 'string' && delta.content.includes('<think>')) return true;
  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) return true;
  if (typeof delta.reasoning === 'string' && delta.reasoning.length > 0) return true;
  if (typeof delta.thinking === 'string' && delta.thinking.length > 0) return true;
  return false;
}

async function probeLmStudioThinking(endpoint: string, modelId: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // Use streaming — LM Studio only honours chat_template_kwargs in streaming mode.
    // Read the full SSE response as text (RN fetch supports .text() but not ReadableStream).
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 2,
        stream: true,
        chat_template_kwargs: { enable_thinking: true },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) return false;

    // response.text() collects the full SSE stream as a string
    const text = await response.text();

    // Check all SSE data lines for thinking indicators
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        const delta = chunk?.choices?.[0]?.delta;
        if (delta && deltaHasThinking(delta)) return true;
      } catch { /* skip malformed lines */ }
    }

    return false;
  } catch (error) {
    // Timeout, network error, model not loaded
    logger.warn('[probeLmStudioThinking] Failed to probe for thinking support:', error);
  }
  return false;
}

function hasRealData(info: RemoteModelInfo): boolean {
  return info.supportsVision || info.contextLength !== 4096 || info.supportsToolCalling === true || info.supportsThinking === true;
}

/**
 * Fetch model capabilities by trying both Ollama and LM Studio APIs in parallel.
 * Falls back to name-based detection when neither API returns real data.
 * Works regardless of the port the server runs on.
 */
export async function fetchModelCapabilities(
  endpoint: string,
  modelId: string,
  nameBasedDetect: { vision: (id: string) => boolean; toolCalling: (id: string) => boolean },
): Promise<RemoteModelInfo> {
  const [ollamaInfo, lmInfo] = await Promise.all([
    fetchRemoteModelInfo(endpoint, modelId),
    fetchLmStudioModelInfo(endpoint, modelId),
  ]);

  if (hasRealData(ollamaInfo)) return ollamaInfo;
  if (hasRealData(lmInfo)) return lmInfo;

  // Neither API returned real data — fall back to name-based detection
  return {
    contextLength: 4096,
    supportsVision: nameBasedDetect.vision(modelId),
    supportsToolCalling: nameBasedDetect.toolCalling(modelId),
  };
}

/** Returns true for models that generate text/images — filters out embedding, reranker, etc. */
export function isGenerativeModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  const nonGenerativePatterns = [
    'embed', 'embedding', 'rerank', 'reranker', 'classifier',
    'bge-', 'e5-', 'gte-', 'minilm', 'arctic-embed',
  ];
  return !nonGenerativePatterns.some(p => id.includes(p));
}
