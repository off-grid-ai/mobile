/**
 * Unit tests for activeModelService/utils.ts
 * Focuses on syncWithNativeState LiteRT branch.
 */

import { syncWithNativeState } from '../../../src/services/activeModelService/utils';

jest.mock('../../../src/services/llm', () => ({
  llmService: { isModelLoaded: jest.fn() },
}));

jest.mock('../../../src/services/litert', () => ({
  liteRTService: { isModelLoaded: jest.fn() },
}));

jest.mock('../../../src/services/localDreamGenerator', () => ({
  localDreamGeneratorService: { isModelLoaded: jest.fn(() => Promise.resolve(false)) },
}));

jest.mock('../../../src/stores', () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      activeModelId: 'model-abc',
      activeImageModelId: null,
      downloadedModels: [],
      downloadedImageModels: [],
    })),
  },
}));

jest.mock('../../../src/services/hardware', () => ({
  hardwareService: {
    refreshMemoryInfo: jest.fn(() =>
      Promise.resolve({ usedMemory: 0, totalMemory: 0, availableMemory: 0 }),
    ),
  },
}));

import { llmService } from '../../../src/services/llm';
import { liteRTService } from '../../../src/services/litert';
import { useAppStore as _useAppStore } from '../../../src/stores';

const mockedLlm = llmService as jest.Mocked<typeof llmService>;
const mockedLiteRT = liteRTService as jest.Mocked<typeof liteRTService>;

function makeTarget(overrides: Partial<{ loadedTextModelId: string | null; loadedImageModelId: string | null }> = {}) {
  const t = {
    loadedTextModelId: overrides.loadedTextModelId ?? null,
    loadedImageModelId: overrides.loadedImageModelId ?? null,
    setLoadedTextModelId: jest.fn((id: string | null) => { t.loadedTextModelId = id; }),
    setLoadedImageModelId: jest.fn((id: string | null) => { t.loadedImageModelId = id; }),
    setLoadedImageModelThreads: jest.fn(),
  };
  return t;
}

describe('syncWithNativeState', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets loadedTextModelId when only liteRTService is loaded and target has no id', async () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(true);
    mockedLlm.isModelLoaded.mockReturnValue(false);

    const target = makeTarget({ loadedTextModelId: null });
    await syncWithNativeState(target);

    expect(target.setLoadedTextModelId).toHaveBeenCalledWith('model-abc');
  });

  it('clears loadedTextModelId when both services are not loaded', async () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(false);
    mockedLlm.isModelLoaded.mockReturnValue(false);

    const target = makeTarget({ loadedTextModelId: 'old-model' });
    await syncWithNativeState(target);

    expect(target.setLoadedTextModelId).toHaveBeenCalledWith(null);
  });

  it('does not overwrite existing loadedTextModelId when liteRTService is loaded', async () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(true);
    mockedLlm.isModelLoaded.mockReturnValue(false);

    const target = makeTarget({ loadedTextModelId: 'already-set' });
    await syncWithNativeState(target);

    expect(target.setLoadedTextModelId).not.toHaveBeenCalled();
  });

  it('sets loadedTextModelId when only llmService is loaded and target has no id', async () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(false);
    mockedLlm.isModelLoaded.mockReturnValue(true);

    const target = makeTarget({ loadedTextModelId: null });
    await syncWithNativeState(target);

    expect(target.setLoadedTextModelId).toHaveBeenCalledWith('model-abc');
  });
});
