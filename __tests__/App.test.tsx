/**
 * App startup tests
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const appState = {
  setDeviceInfo: jest.fn(),
  setModelRecommendation: jest.fn(),
  setDownloadedModels: jest.fn(),
  setDownloadedImageModels: jest.fn(),
  clearImageModelDownloading: jest.fn(),
  setBackgroundDownload: jest.fn(),
  addDownloadedModel: jest.fn(),
  setDownloadProgress: jest.fn(),
  activeBackgroundDownloads: {
    42: {
      modelId: 'test/model',
      fileName: 'model.gguf',
      quantization: 'Q4_K_M',
      author: 'test',
      totalBytes: 1000,
    },
  },
};

const authState = {
  isEnabled: false,
  isLocked: false,
  setLocked: jest.fn(),
  setLastBackgroundTime: jest.fn(),
};

const mockUseAppStore = Object.assign(
  (selector?: (state: typeof appState) => unknown) => (selector ? selector(appState) : appState),
  {
    getState: () => appState,
    persist: { hasHydrated: () => true, rehydrate: jest.fn() },
  },
);

const mockUseAuthStore = Object.assign(
  (selector?: (state: typeof authState) => unknown) => (selector ? selector(authState) : authState),
  {
    getState: () => authState,
  },
);

const mockUseRemoteServerStore = Object.assign(
  () => ({}),
  {
    persist: { hasHydrated: () => true, rehydrate: jest.fn() },
  },
);

const mockModelManager = {
  initialize: jest.fn(() => Promise.resolve()),
  cleanupMMProjEntries: jest.fn(() => Promise.resolve()),
  setBackgroundDownloadMetadataCallback: jest.fn(),
  syncBackgroundDownloads: jest.fn(() => Promise.resolve([])),
  syncCompletedImageDownloads: jest.fn(() => Promise.resolve([])),
  restoreInProgressDownloads: jest.fn((_persisted, onProgress?: (progress: any) => void) => {
    onProgress?.({
      downloadId: 42,
      modelId: 'test/model',
      fileName: 'model.gguf',
      bytesDownloaded: 600,
      totalBytes: 1000,
      progress: 0.6,
    });
    return Promise.resolve([]);
  }),
  refreshModelLists: jest.fn(() => Promise.resolve({ textModels: [], imageModels: [] })),
  watchDownload: jest.fn(),
};

jest.mock('../src/navigation', () => ({
  AppNavigator: () => null,
}));

jest.mock('../src/screens', () => ({
  LockScreen: () => null,
}));

jest.mock('../src/theme', () => ({
  useTheme: () => ({
    colors: { background: '#fff', primary: '#000' },
    isDark: false,
  }),
}));

jest.mock('../src/hooks/useAppState', () => ({
  useAppState: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../src/stores', () => ({
  useAppStore: mockUseAppStore,
  useAuthStore: mockUseAuthStore,
  useRemoteServerStore: mockUseRemoteServerStore,
}));

jest.mock('../src/services', () => ({
  hardwareService: {
    getDeviceInfo: jest.fn(() => Promise.resolve({ totalMemory: 8 * 1024 * 1024 * 1024 })),
    getModelRecommendation: jest.fn(() => ({ maxParameters: 7, recommendedQuantization: 'Q4_K_M' })),
  },
  modelManager: mockModelManager,
  authService: {
    hasPassphrase: jest.fn(() => Promise.resolve(false)),
  },
  ragService: {
    ensureReady: jest.fn(() => Promise.resolve()),
  },
  remoteServerManager: {
    initializeProviders: jest.fn(() => Promise.resolve()),
  },
}));

import App from '../App';

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tags restored download progress with ownerDownloadId during startup restore', async () => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockModelManager.restoreInProgressDownloads).toHaveBeenCalledWith(
      appState.activeBackgroundDownloads,
      expect.any(Function),
    );
    expect(appState.setDownloadProgress).toHaveBeenCalledWith('test/model/model.gguf', {
      progress: 0.6,
      bytesDownloaded: 600,
      totalBytes: 1000,
      ownerDownloadId: 42,
    });
  });
});
