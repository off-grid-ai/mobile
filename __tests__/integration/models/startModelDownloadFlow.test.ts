/**
 * startModelDownload ↔ real downloadStore ↔ real appStore.
 *
 * The unit test mocks the stores; this exercises the REAL stores so the shared
 * download action's actual mutations are validated: a completed download registers
 * the model in appStore AND clears its in-flight downloadStore entry; the duplicate
 * guard reads the real store; a watch error flips the real entry to 'failed'. Only the
 * native boundary (modelManager.downloadModelBackground/watchDownload) is mocked.
 */
let mockOnComplete: ((m: any) => void) | undefined;
let mockOnError: ((e: Error) => void) | undefined;
const mockDownloadModelBackground = jest.fn();
jest.mock('../../../src/services/modelManager', () => ({
  modelManager: {
    downloadModelBackground: (...a: unknown[]) => mockDownloadModelBackground(...a),
    watchDownload: (_id: string, c: (m: any) => void, e: (err: Error) => void) => { mockOnComplete = c; mockOnError = e; },
  },
}));

import { startModelDownload } from '../../../src/services/startModelDownload';
import { useDownloadStore, DownloadEntry } from '../../../src/stores/downloadStore';
import { useAppStore } from '../../../src/stores';
import { makeModelKey } from '../../../src/utils/modelKey';
import { createDownloadedModel } from '../../utils/factories';

const FILE = { name: 'model.gguf' } as any;
const KEY = makeModelKey('author/model', 'model.gguf');

const inflightEntry = (over: Partial<DownloadEntry> = {}): DownloadEntry => ({
  modelKey: KEY, downloadId: 'dl-1', modelId: 'author/model', fileName: 'model.gguf',
  quantization: 'Q4_K_M', modelType: 'text', status: 'pending',
  bytesDownloaded: 0, totalBytes: 1000, combinedTotalBytes: 1000, progress: 0, createdAt: 1000,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockOnComplete = undefined;
  mockOnError = undefined;
  useDownloadStore.setState({ downloads: {}, downloadIdIndex: {} });
  useAppStore.setState({ downloadedModels: [] });
});

describe('startModelDownload flow (real stores)', () => {
  it('completion registers the model in appStore and clears the in-flight entry', async () => {
    mockDownloadModelBackground.mockResolvedValue({ downloadId: 'dl-1' });
    await startModelDownload('author/model', FILE);
    // downloadModelBackground populates the entry AFTER the guard check — simulate it.
    useDownloadStore.getState().add(inflightEntry());

    mockOnComplete!(createDownloadedModel({ id: 'author/model/model.gguf' }));

    expect(useAppStore.getState().downloadedModels.some(m => m.id === 'author/model/model.gguf')).toBe(true);
    expect(useDownloadStore.getState().downloads[KEY]).toBeUndefined();
  });

  it('does not start a second download when one is already active (real-store guard)', async () => {
    useDownloadStore.getState().add(inflightEntry({ status: 'running' }));
    await startModelDownload('author/model', FILE);
    expect(mockDownloadModelBackground).not.toHaveBeenCalled();
  });

  it('flips the real entry to failed when the watch reports an error', async () => {
    mockDownloadModelBackground.mockResolvedValue({ downloadId: 'dl-1' });
    await startModelDownload('author/model', FILE);
    useDownloadStore.getState().add(inflightEntry({ status: 'running' }));

    mockOnError!(new Error('net'));

    expect(useDownloadStore.getState().downloads[KEY].status).toBe('failed');
  });
});
