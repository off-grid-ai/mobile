/**
 * Unit tests for generationServiceHelpers.ts
 * Focuses on vision guard and buildGenerationMetaImpl LiteRT branches.
 */

import { buildGenerationMetaImpl, FLUSH_INTERVAL_MS as _FLUSH_INTERVAL_MS } from '../../../src/services/generationServiceHelpers';

jest.mock('../../../src/services/llm', () => ({
  llmService: {
    isModelLoaded: jest.fn(() => false),
    isCurrentlyGenerating: jest.fn(() => false),
    getGpuInfo: jest.fn(() => ({ gpu: false, gpuBackend: 'CPU', gpuLayers: 0 })),
    getPerformanceStats: jest.fn(() => ({
      lastTokensPerSecond: 10,
      lastDecodeTokensPerSecond: 12,
      lastTimeToFirstToken: 0.4,
      lastGenerationTime: 2,
      lastTokenCount: 40,
    })),
  },
}));

jest.mock('../../../src/services/litert', () => ({
  liteRTService: {
    isModelLoaded: jest.fn(() => false),
    getActiveBackend: jest.fn(() => 'cpu'),
    prepareConversation: jest.fn(() => Promise.resolve()),
    sendMessage: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../../src/stores', () => ({
  useAppStore: {
    getState: jest.fn(),
  },
  useChatStore: {
    getState: jest.fn(() => ({
      startStreaming: jest.fn(),
      clearStreamingMessage: jest.fn(),
      appendToStreamingMessage: jest.fn(),
      finalizeStreamingMessage: jest.fn(),
    })),
  },
  useRemoteServerStore: {
    getState: jest.fn(() => ({
      getActiveServer: jest.fn(() => null),
      activeServerId: null,
      updateServerHealth: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/stores/debugLogsStore', () => ({
  useDebugLogsStore: {
    getState: jest.fn(() => ({ addLog: jest.fn() })),
  },
}));

jest.mock('../../../src/services/generationToolLoop', () => ({
  runToolLoop: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../src/utils/logger', () => ({
  default: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { useAppStore } from '../../../src/stores';
import { liteRTService } from '../../../src/services/litert';

const mockedGetState = useAppStore.getState as jest.Mock;
const mockedLiteRT = liteRTService as jest.Mocked<typeof liteRTService>;

function makeLiteRTAppState(overrides: any = {}) {
  return {
    downloadedModels: [{ id: 'litert-1', name: 'LiteRT Model', engine: 'litert', ...overrides.modelProps }],
    activeModelId: 'litert-1',
    downloadedImageModels: [],
    activeImageModelId: null,
    settings: { temperature: 0.7, topP: 0.9, cacheType: 'ram', maxTokens: 512, thinkingEnabled: false },
    ...overrides.storeProps,
  };
}

describe('buildGenerationMetaImpl — remote provider path', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns remote meta with estimated token count', () => {
    const { useRemoteServerStore } = require('../../../src/stores');
    useRemoteServerStore.getState.mockReturnValue({
      getActiveServer: () => ({ name: 'My Server' }),
      activeServerId: 'srv-1',
      updateServerHealth: jest.fn(),
    });

    const svc = {
      isUsingRemoteProvider: () => true,
      state: { streamingContent: 'hello world test', startTime: Date.now() - 2000 },
      totalReasoningLength: 8,
      remoteTimeToFirstToken: 0.3,
    };

    const meta = buildGenerationMetaImpl(svc);
    expect(meta.gpuBackend).toBe('Remote');
    expect(meta.modelName).toBe('My Server');
    expect(meta.gpu).toBe(false);
    expect(meta.tokenCount).toBeGreaterThan(0);
    expect(meta.timeToFirstToken).toBe(0.3);
  });

  it('uses fallback name when no active server', () => {
    const { useRemoteServerStore } = require('../../../src/stores');
    useRemoteServerStore.getState.mockReturnValue({
      getActiveServer: () => null,
      activeServerId: null,
      updateServerHealth: jest.fn(),
    });

    const svc = {
      isUsingRemoteProvider: () => true,
      state: { streamingContent: 'tokens', startTime: null },
      totalReasoningLength: 0,
      remoteTimeToFirstToken: undefined,
    };

    const meta = buildGenerationMetaImpl(svc);
    expect(meta.modelName).toBe('Remote Model');
    expect(meta.tokensPerSecond).toBeUndefined();
  });
});

describe('buildGenerationMetaImpl — llama.cpp path', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns llama.cpp perf stats when model engine is not litert', () => {
    const { llmService } = require('../../../src/services/llm');
    llmService.getGpuInfo.mockReturnValue({ gpu: true, gpuBackend: 'Metal', gpuLayers: 32 });
    llmService.getPerformanceStats.mockReturnValue({
      lastTokensPerSecond: 25,
      lastDecodeTokensPerSecond: 28,
      lastTimeToFirstToken: 0.6,
      lastGenerationTime: 3,
      lastTokenCount: 75,
    });

    mockedGetState.mockReturnValue({
      downloadedModels: [{ id: 'llm-1', name: 'Llama-3', engine: 'ggml' }],
      activeModelId: 'llm-1',
      downloadedImageModels: [],
      activeImageModelId: null,
      settings: { cacheType: 'flash', temperature: 0.7, topP: 0.9, maxTokens: 512, thinkingEnabled: false },
    });

    const svc = {
      isUsingRemoteProvider: () => false,
      liteRTBenchmarkStats: null,
      state: { streamingContent: '', startTime: Date.now() },
    };

    const meta = buildGenerationMetaImpl(svc);
    expect(meta.gpu).toBe(true);
    expect(meta.gpuBackend).toBe('Metal');
    expect(meta.tokensPerSecond).toBe(25);
    expect(meta.tokenCount).toBe(75);
    expect(meta.cacheType).toBe('flash');
  });
});

describe('buildGenerationMetaImpl — LiteRT path', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns real benchmark stats when liteRTBenchmarkStats is set', () => {
    mockedGetState.mockReturnValue(makeLiteRTAppState());
    mockedLiteRT.getActiveBackend.mockReturnValue('gpu');

    const svc = {
      isUsingRemoteProvider: () => false,
      liteRTBenchmarkStats: {
        decodeTokensPerSecond: 42,
        ttft: 0.12,
        prefillTokenCount: 128,
      },
      state: { streamingContent: 'hello world', startTime: Date.now() - 2000 },
    };

    const meta = buildGenerationMetaImpl(svc);

    expect(meta.tokensPerSecond).toBe(42);
    expect(meta.timeToFirstToken).toBeCloseTo(120, 0);
    expect(meta.tokenCount).toBe(128);
    expect(meta.gpu).toBe(true);
    expect(meta.gpuBackend).toBe('GPU');
  });

  it('falls back to estimate when liteRTBenchmarkStats is null', () => {
    mockedGetState.mockReturnValue(makeLiteRTAppState());
    mockedLiteRT.getActiveBackend.mockReturnValue('cpu');

    const startTime = Date.now() - 4000;
    const svc = {
      isUsingRemoteProvider: () => false,
      liteRTBenchmarkStats: null,
      state: { streamingContent: 'abcd'.repeat(50), startTime },
    };

    const meta = buildGenerationMetaImpl(svc);

    expect(meta.tokenCount).toBe(Math.ceil(svc.state.streamingContent.length / 4));
    expect(meta.tokensPerSecond).toBeGreaterThan(0);
    expect(meta.gpu).toBe(false);
  });

  it('sets gpu=true when backend is npu', () => {
    mockedGetState.mockReturnValue(makeLiteRTAppState());
    mockedLiteRT.getActiveBackend.mockReturnValue('npu');

    const svc = {
      isUsingRemoteProvider: () => false,
      liteRTBenchmarkStats: { decodeTokensPerSecond: 30, ttft: 0.2, prefillTokenCount: 64 },
      state: { streamingContent: '', startTime: Date.now() },
    };

    const meta = buildGenerationMetaImpl(svc);
    expect(meta.gpu).toBe(true);
    expect(meta.gpuBackend).toBe('NPU');
  });

  it('returns model name from downloadedModels', () => {
    mockedGetState.mockReturnValue(makeLiteRTAppState({ modelProps: { name: 'Gemma-3' } }));
    mockedLiteRT.getActiveBackend.mockReturnValue('cpu');

    const svc = {
      isUsingRemoteProvider: () => false,
      liteRTBenchmarkStats: { decodeTokensPerSecond: 20, ttft: 0.1, prefillTokenCount: 64 },
      state: { streamingContent: '', startTime: Date.now() },
    };

    const meta = buildGenerationMetaImpl(svc);
    expect(meta.modelName).toBe('Gemma-3');
  });

  it('returns undefined tokensPerSecond when startTime is null (fallback path)', () => {
    mockedGetState.mockReturnValue(makeLiteRTAppState());
    mockedLiteRT.getActiveBackend.mockReturnValue('cpu');

    const svc = {
      isUsingRemoteProvider: () => false,
      liteRTBenchmarkStats: null,
      state: { streamingContent: 'some text', startTime: null },
    };

    const meta = buildGenerationMetaImpl(svc);
    expect(meta.tokensPerSecond).toBeUndefined();
  });
});
