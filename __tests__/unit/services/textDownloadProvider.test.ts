/**
 * Text download provider — wraps modelManager + downloadStore + appStore under the
 * uniform contract. Verifies list (in-flight + completed), cancel/remove delegate to
 * the working calls, and reconcile strands an interrupted iOS download (resumable
 * false) as a retriable error. (Jest's RN preset reports Platform.OS='ios'.)
 */
jest.mock('../../../src/services/modelManager', () => ({
  modelManager: {
    getDownloadedModels: jest.fn(async () => []),
    cancelBackgroundDownload: jest.fn(async () => {}),
    deleteModel: jest.fn(async () => {}),
    downloadModelBackground: jest.fn(async () => ({ downloadId: 'new-dl' })),
    watchDownload: jest.fn(),
    resetMmProjForRetry: jest.fn(),
  },
}));
jest.mock('../../../src/services/backgroundDownloadService', () => ({
  backgroundDownloadService: { retryDownload: jest.fn(async () => {}), startProgressPolling: jest.fn(), cancelDownload: jest.fn(async () => {}) },
}));
jest.mock('../../../src/services/huggingFace', () => ({ huggingFaceService: { getDownloadUrl: jest.fn(() => 'https://x/f.gguf') } }));
jest.mock('../../../src/services/hardware', () => ({ hardwareService: { getModelTotalSize: jest.fn(() => 4000) } }));
jest.mock('../../../src/utils/logger', () => ({ __esModule: true, default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { textProvider } from '../../../src/services/modelDownloadService/providers/textProvider';
import { useDownloadStore } from '../../../src/stores/downloadStore';
import { useAppStore } from '../../../src/stores';
import { modelManager } from '../../../src/services/modelManager';

const mockMM = modelManager as unknown as { deleteModel: jest.Mock; cancelBackgroundDownload: jest.Mock };

const entry = (over: any = {}) => ({
  modelKey: 'author/m.gguf', downloadId: 'dl-1', modelId: 'author/m', fileName: 'm.gguf',
  quantization: 'Q4', modelType: 'text', status: 'running', bytesDownloaded: 40, totalBytes: 100,
  combinedTotalBytes: 100, progress: 0.4, createdAt: 1, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useDownloadStore.setState({ downloads: {}, downloadIdIndex: {} } as any);
  useAppStore.setState({ downloadedModels: [] } as any);
  useDownloadStore.getState().add(entry());
});

describe('textProvider', () => {
  it('lists an in-flight text download as downloading', async () => {
    const d = (await textProvider.list()).find(x => x.id === 'text:author/m');
    expect(d?.status).toBe('downloading');
    expect(d?.progress).toBe(0.4);
  });

  it('lists completed appStore models, skipping in-flight ones', async () => {
    useAppStore.setState({ downloadedModels: [
      { id: 'author/m', fileName: 'm.gguf', filePath: '/p' },     // dup of in-flight
      { id: 'other/x', fileName: 'x.gguf', filePath: '/p2' },
    ] } as any);
    const list = await textProvider.list();
    expect(list.filter(d => d.id === 'text:author/m')).toHaveLength(1);
    expect(list.find(d => d.id === 'text:other/x')?.status).toBe('completed');
  });

  it('cancel cancels the native download and clears the store row', async () => {
    await textProvider.cancel('text:author/m');
    expect(mockMM.cancelBackgroundDownload).toHaveBeenCalledWith('dl-1');
    expect(useDownloadStore.getState().downloads['author/m.gguf']).toBeUndefined();
  });

  it('remove deletes the model from modelManager + appStore', async () => {
    const removeSpy = jest.spyOn(useAppStore.getState(), 'removeDownloadedModel');
    await textProvider.remove('text:author/m');
    expect(mockMM.deleteModel).toHaveBeenCalledWith('author/m');
    expect(removeSpy).toHaveBeenCalledWith('author/m');
  });

  it('reconcile strands an interrupted iOS download as failed (resumable false)', async () => {
    await textProvider.reconcile!();
    expect(useDownloadStore.getState().downloads['author/m.gguf'].status).toBe('failed');
  });
});
