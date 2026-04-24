/**
 * Parallel mmproj Download Tests
 *
 * Tests for downloading mmproj (vision projection) files in parallel with the
 * main GGUF model, instead of sequentially blocking before the main download.
 *
 * Covers: parallel start, combined progress, dual completion gating,
 * error handling, cancellation, sync after app kill, and restore.
 */

import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  performBackgroundDownload,
  watchBackgroundDownload,
  syncCompletedBackgroundDownloads,
} from '../../../src/services/modelManager/download';
import { restoreInProgressDownloads } from '../../../src/services/modelManager/restore';
import { backgroundDownloadService } from '../../../src/services/backgroundDownloadService';
import { BackgroundDownloadContext } from '../../../src/services/modelManager/types';
import { createModelFile, createModelFileWithMmProj } from '../../utils/factories';

const mockedRNFS = RNFS as jest.Mocked<typeof RNFS>;
const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

jest.mock('../../../src/services/huggingface', () => ({
  huggingFaceService: {
    getDownloadUrl: jest.fn((modelId: string, fileName: string) =>
      `https://huggingface.co/${modelId}/resolve/main/${fileName}`
    ),
  },
}));

jest.mock('../../../src/services/backgroundDownloadService', () => ({
  backgroundDownloadService: {
    isAvailable: jest.fn(() => true),
    startDownload: jest.fn(),
    cancelDownload: jest.fn(() => Promise.resolve()),
    getActiveDownloads: jest.fn(() => Promise.resolve([])),
    moveCompletedDownload: jest.fn(),
    startProgressPolling: jest.fn(),
    stopProgressPolling: jest.fn(),
    onProgress: jest.fn(() => jest.fn()),
    onComplete: jest.fn(() => jest.fn()),
    onError: jest.fn(() => jest.fn()),
    markSilent: jest.fn(),
    unmarkSilent: jest.fn(),
    excludeFromBackup: jest.fn(() => Promise.resolve(true)),
  },
}));

const mockService = backgroundDownloadService as jest.Mocked<typeof backgroundDownloadService>;

const MODELS_DIR = '/mock/documents/models';

// Helper: create a vision file with specific sizes
function visionFile(mainSize = 4_000_000_000, mmProjSize = 500_000_000) {
  return createModelFileWithMmProj({
    name: 'vision.gguf',
    size: mainSize,
    quantization: 'Q4_K_M',
    mmProjName: 'mmproj.gguf',
    mmProjSize,
    mmProjDownloadUrl: 'https://huggingface.co/test/model/resolve/main/mmproj.gguf',
  });
}

// Helper: stub startDownload to return sequential download IDs
function stubStartDownload(ids: number[]) {
  let idx = 0;
  mockService.startDownload.mockImplementation(async (params: any) => ({
    downloadId: ids[idx++] ?? ids[ids.length - 1],
    fileName: params.fileName,
    modelId: params.modelId,
    status: 'pending',
    bytesDownloaded: 0,
    totalBytes: params.totalBytes || 0,
    startedAt: Date.now(),
  }));
}

// Helper: capture onComplete callbacks keyed by downloadId
function captureCompleteCallbacks(): Record<number, (event: any) => Promise<void>> {
  const cbs: Record<number, any> = {};
  mockService.onComplete.mockImplementation((id: number, cb: any) => {
    cbs[id] = cb;
    return jest.fn();
  });
  return cbs;
}

// Helper: capture onError callbacks keyed by downloadId
function captureErrorCallbacks(): Record<number, (event: any) => void> {
  const cbs: Record<number, any> = {};
  mockService.onError.mockImplementation((id: number, cb: any) => {
    cbs[id] = cb;
    return jest.fn();
  });
  return cbs;
}

// Helper: capture onProgress callbacks keyed by downloadId
function captureProgressCallbacks(): Record<number, (event: any) => void> {
  const cbs: Record<number, any> = {};
  mockService.onProgress.mockImplementation((id: number, cb: any) => {
    cbs[id] = cb;
    return jest.fn();
  });
  return cbs;
}

describe('Parallel mmproj download', () => {
  let bgContext: Map<number, BackgroundDownloadContext>;
  let metadataCallback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    bgContext = new Map();
    metadataCallback = jest.fn();

    mockedRNFS.exists.mockResolvedValue(false);
    mockedAsyncStorage.getItem.mockResolvedValue('[]');
    mockedAsyncStorage.setItem.mockResolvedValue(undefined as any);
  });

  // ========================================================================
  // performBackgroundDownload — parallel start
  // ========================================================================

  describe('performBackgroundDownload', () => {
    it('starts both main and mmproj downloads in parallel', async () => {
      stubStartDownload([42, 43]);

      const info = await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      expect(info.downloadId).toBe(42);
      expect(mockService.startDownload).toHaveBeenCalledTimes(2);
      expect(mockService.startDownload).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'vision.gguf' }),
      );
      expect(mockService.startDownload).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'mmproj.gguf' }),
      );
    });

    it('marks mmproj download as silent', async () => {
      stubStartDownload([42, 43]);

      await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      expect(mockService.markSilent).toHaveBeenCalledWith(43);
    });

    it('persists mmProjDownloadId in metadata callback', async () => {
      stubStartDownload([42, 43]);

      await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      expect(metadataCallback).toHaveBeenCalledWith(42, expect.objectContaining({
        mmProjDownloadId: 43,
        mmProjFileName: 'vision-mmproj.gguf',
      }));
    });

    it('sets mmProjCompleted=false and mainCompleted=false in context', async () => {
      stubStartDownload([42, 43]);

      await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      const ctx = bgContext.get(42) as any;
      expect(ctx.mmProjCompleted).toBe(false);
      expect(ctx.mainCompleted).toBe(false);
      expect(ctx.mmProjDownloadId).toBe(43);
    });

    it('skips mmproj download when mmproj already exists', async () => {
      stubStartDownload([42]);
      mockedRNFS.exists
        .mockResolvedValueOnce(false) // main doesn't exist
        .mockResolvedValueOnce(true); // mmproj exists
      mockedRNFS.stat.mockResolvedValue({ size: 500_000_000 } as any);

      await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      // Only main download started
      expect(mockService.startDownload).toHaveBeenCalledTimes(1);
      expect(mockService.markSilent).not.toHaveBeenCalled();

      const ctx = bgContext.get(42) as any;
      expect(ctx.mmProjCompleted).toBe(true);
    });

    it('only starts main download for non-vision models', async () => {
      stubStartDownload([42]);
      const file = createModelFile({ name: 'model.gguf', size: 4_000_000_000 });

      await performBackgroundDownload({
        modelId: 'test/model',
        file,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      expect(mockService.startDownload).toHaveBeenCalledTimes(1);
      const ctx = bgContext.get(42) as any;
      expect(ctx.mmProjCompleted).toBe(true);
      expect(ctx.mmProjDownloadId).toBeUndefined();
    });

    it('returns immediately when both files already exist', async () => {
      mockedRNFS.exists.mockResolvedValue(true);
      mockedRNFS.stat.mockResolvedValue({ size: 500_000_000 } as any);
      mockedAsyncStorage.getItem.mockResolvedValue('[]');

      const info = await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      expect(info.downloadId).toBe(-1);
      expect(info.status).toBe('completed');
      expect(mockService.startDownload).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Combined progress
  // ========================================================================

  describe('combined progress', () => {
    it('reports combined progress from both downloads', async () => {
      const progressCbs = captureProgressCallbacks();
      stubStartDownload([42, 43]);
      const onProgress = jest.fn();

      await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(4_000_000_000, 1_000_000_000), // 4GB main + 1GB mmproj
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onProgress,
      });

      // Simulate main progress: 2GB downloaded
      progressCbs[42]?.({ downloadId: 42, bytesDownloaded: 2_000_000_000, totalBytes: 4_000_000_000, status: 'running', fileName: 'vision.gguf', modelId: 'test/model' });
      expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
        bytesDownloaded: 2_000_000_000, // main only so far
        totalBytes: 5_000_000_000, // combined
      }));

      // Simulate mmproj progress: 500MB downloaded
      progressCbs[43]?.({ downloadId: 43, bytesDownloaded: 500_000_000, totalBytes: 1_000_000_000, status: 'running', fileName: 'mmproj.gguf', modelId: 'test/model' });
      expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
        bytesDownloaded: 2_500_000_000, // 2GB main + 500MB mmproj
        totalBytes: 5_000_000_000,
        progress: expect.closeTo(0.5, 5),
      }));
    });

    it('includes pre-existing mmproj size in progress when mmproj already downloaded', async () => {
      const progressCbs = captureProgressCallbacks();
      stubStartDownload([42]);
      mockedRNFS.exists
        .mockResolvedValueOnce(false) // main
        .mockResolvedValueOnce(true); // mmproj exists
      mockedRNFS.stat.mockResolvedValue({ size: 1_000_000_000 } as any);
      const onProgress = jest.fn();

      await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(4_000_000_000, 1_000_000_000),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onProgress,
      });

      // Main progress: 2GB
      progressCbs[42]?.({ downloadId: 42, bytesDownloaded: 2_000_000_000, totalBytes: 4_000_000_000, status: 'running', fileName: 'vision.gguf', modelId: 'test/model' });
      expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
        bytesDownloaded: 3_000_000_000, // 2GB main + 1GB existing mmproj
        totalBytes: 5_000_000_000,
      }));
    });
  });

  // ========================================================================
  // watchBackgroundDownload — dual completion gating
  // ========================================================================

  describe('watchBackgroundDownload — completion gating', () => {
    async function setupVisionDownload() {
      stubStartDownload([42, 43]);
      const completeCbs = captureCompleteCallbacks();

      await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      return completeCbs;
    }

    it('does not fire onComplete until both downloads finish (mmproj first)', async () => {
      const completeCbs = await setupVisionDownload();
      const onComplete = jest.fn();

      mockService.moveCompletedDownload.mockResolvedValue('/models/vision.gguf');
      mockedRNFS.exists.mockResolvedValue(true);

      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onComplete,
      });

      // mmproj completes first
      await completeCbs[43]?.({ downloadId: 43, fileName: 'mmproj.gguf' });
      expect(onComplete).not.toHaveBeenCalled();

      // main completes
      await completeCbs[42]?.({ downloadId: 42, fileName: 'vision.gguf' });
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('does not fire onComplete until both downloads finish (main first)', async () => {
      const completeCbs = await setupVisionDownload();
      const onComplete = jest.fn();

      mockService.moveCompletedDownload.mockResolvedValue('/models/vision.gguf');
      mockedRNFS.exists.mockResolvedValue(true);

      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onComplete,
      });

      // main completes first
      await completeCbs[42]?.({ downloadId: 42, fileName: 'vision.gguf' });
      expect(onComplete).not.toHaveBeenCalled();

      // mmproj completes
      await completeCbs[43]?.({ downloadId: 43, fileName: 'mmproj.gguf' });
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('fires onComplete immediately for non-vision model (no mmproj)', async () => {
      stubStartDownload([42]);
      const completeCbs = captureCompleteCallbacks();
      const file = createModelFile({ name: 'model.gguf', size: 4_000_000_000 });

      await performBackgroundDownload({
        modelId: 'test/model',
        file,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      const onComplete = jest.fn();
      mockService.moveCompletedDownload.mockResolvedValue('/models/model.gguf');
      mockedRNFS.exists.mockResolvedValue(true);

      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onComplete,
      });

      await completeCbs[42]?.({ downloadId: 42, fileName: 'model.gguf' });
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('moves mmproj file on mmproj completion', async () => {
      const completeCbs = await setupVisionDownload();

      mockService.moveCompletedDownload.mockResolvedValue('/models/vision.gguf');
      mockedRNFS.exists.mockResolvedValue(true);

      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      await completeCbs[43]?.({ downloadId: 43, fileName: 'mmproj.gguf' });

      expect(mockService.moveCompletedDownload).toHaveBeenCalledWith(
        43, `${MODELS_DIR}/vision-mmproj.gguf`,
      );
    });

    it('clears metadata callback when both complete', async () => {
      const completeCbs = await setupVisionDownload();
      mockService.moveCompletedDownload.mockResolvedValue('/models/vision.gguf');
      mockedRNFS.exists.mockResolvedValue(true);

      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      metadataCallback.mockClear();
      await completeCbs[43]?.({ downloadId: 43 });
      await completeCbs[42]?.({ downloadId: 42 });

      expect(metadataCallback).toHaveBeenCalledWith(42, null);
    });

    it('keeps vision when mmproj move fails but target exists and is a valid GGUF', async () => {
      const completeCbs = await setupVisionDownload();
      const onComplete = jest.fn();

      // Main move succeeds; mmproj move rejects (target already exists because
      // a sibling quant already downloaded it).
      mockService.moveCompletedDownload
        .mockImplementationOnce((id: number) => {
          if (id === 43) return Promise.reject(new Error('target exists'));
          return Promise.resolve(`${MODELS_DIR}/vision.gguf`);
        })
        .mockResolvedValue(`${MODELS_DIR}/vision.gguf`);

      // checkMmProjExists: file exists, size OK, GGUF magic OK
      mockedRNFS.exists.mockResolvedValue(true);
      mockedRNFS.stat.mockResolvedValue({ size: 500_000_000 } as any);
      (mockedRNFS.read as jest.Mock).mockResolvedValue('GGUF');

      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onComplete,
      });

      await completeCbs[43]?.({ downloadId: 43, fileName: 'mmproj.gguf' });
      await completeCbs[42]?.({ downloadId: 42, fileName: 'vision.gguf' });

      expect(onComplete).toHaveBeenCalledTimes(1);
      const savedModel = onComplete.mock.calls[0][0];
      expect(savedModel.mmProjPath).toBeDefined();
    });

    it('downgrades to text-only when mmproj move fails and target has bad magic bytes', async () => {
      const completeCbs = await setupVisionDownload();
      const onComplete = jest.fn();

      mockService.moveCompletedDownload
        .mockImplementationOnce((id: number) => {
          if (id === 43) return Promise.reject(new Error('io error'));
          return Promise.resolve(`${MODELS_DIR}/vision.gguf`);
        })
        .mockResolvedValue(`${MODELS_DIR}/vision.gguf`);

      // File exists + correct size, but magic bytes wrong → invalid, unlink + downgrade
      mockedRNFS.exists.mockResolvedValue(true);
      mockedRNFS.stat.mockResolvedValue({ size: 500_000_000 } as any);
      (mockedRNFS.read as jest.Mock).mockResolvedValue('XXXX');

      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onComplete,
      });

      await completeCbs[43]?.({ downloadId: 43, fileName: 'mmproj.gguf' });
      await completeCbs[42]?.({ downloadId: 42, fileName: 'vision.gguf' });

      expect(onComplete).toHaveBeenCalledTimes(1);
      const savedModel = onComplete.mock.calls[0][0];
      expect(savedModel.mmProjPath).toBeUndefined();
    });

    it('downgrades to text-only when mmproj move fails and target does not exist', async () => {
      const completeCbs = await setupVisionDownload();
      const onComplete = jest.fn();

      mockService.moveCompletedDownload
        .mockImplementationOnce((id: number) => {
          if (id === 43) return Promise.reject(new Error('io error'));
          return Promise.resolve(`${MODELS_DIR}/vision.gguf`);
        })
        .mockResolvedValue(`${MODELS_DIR}/vision.gguf`);

      // Target does not exist anywhere
      mockedRNFS.exists.mockImplementation((p: any) =>
        Promise.resolve(!String(p).includes('mmproj')),
      );

      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onComplete,
      });

      await completeCbs[43]?.({ downloadId: 43, fileName: 'mmproj.gguf' });
      await completeCbs[42]?.({ downloadId: 42, fileName: 'vision.gguf' });

      expect(onComplete).toHaveBeenCalledTimes(1);
      const savedModel = onComplete.mock.calls[0][0];
      expect(savedModel.mmProjPath).toBeUndefined();
    });
  });

  // ========================================================================
  // watchBackgroundDownload — error handling
  // ========================================================================

  describe('watchBackgroundDownload — error handling', () => {
    it('cancels mmproj when main download fails', async () => {
      stubStartDownload([42, 43]);
      const errorCbs = captureErrorCallbacks();
      captureCompleteCallbacks();

      await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      const onError = jest.fn();
      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onError,
      });

      errorCbs[42]?.({ downloadId: 42, fileName: 'vision.gguf', modelId: 'test/model', status: 'failed', reason: 'Network error' });

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Network error' }));
      expect(mockService.cancelDownload).toHaveBeenCalledWith(43);
    });

    it('cancels main when mmproj download fails', async () => {
      stubStartDownload([42, 43]);
      const errorCbs = captureErrorCallbacks();
      captureCompleteCallbacks();

      await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      const onError = jest.fn();
      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onError,
      });

      errorCbs[43]?.({ downloadId: 43, fileName: 'mmproj.gguf', modelId: 'test/model', status: 'failed', reason: 'Storage full' });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Storage full') }),
      );
      expect(mockService.cancelDownload).toHaveBeenCalledWith(42);
    });

    it('unmarks silent on error cleanup', async () => {
      stubStartDownload([42, 43]);
      const errorCbs = captureErrorCallbacks();
      captureCompleteCallbacks();

      await performBackgroundDownload({
        modelId: 'test/model',
        file: visionFile(),
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      watchBackgroundDownload({
        downloadId: 42,
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
        onError: jest.fn(),
      });

      errorCbs[42]?.({ downloadId: 42, fileName: 'vision.gguf', modelId: 'test/model', status: 'failed', reason: 'fail' });

      expect(mockService.unmarkSilent).toHaveBeenCalledWith(43);
    });
  });

  // ========================================================================
  // syncCompletedBackgroundDownloads — mmproj handling
  // ========================================================================

  describe('syncCompletedBackgroundDownloads', () => {
    it('syncs completed model with mmproj download', async () => {
      mockService.getActiveDownloads.mockResolvedValue([
        { downloadId: 42, status: 'completed', fileName: 'vision.gguf', modelId: 'test/model', bytesDownloaded: 4_000_000_000, totalBytes: 4_000_000_000, startedAt: 0 } as any,
        { downloadId: 43, status: 'completed', fileName: 'mmproj.gguf', modelId: 'test/model', bytesDownloaded: 500_000_000, totalBytes: 500_000_000, startedAt: 0 } as any,
      ]);
      mockService.moveCompletedDownload.mockResolvedValue(`${MODELS_DIR}/vision.gguf`);
      mockedRNFS.exists.mockResolvedValue(true);

      const clearCb = jest.fn();
      const models = await syncCompletedBackgroundDownloads({
        persistedDownloads: {
          42: {
            modelId: 'test/model',
            fileName: 'vision.gguf',
            quantization: 'Q4_K_M',
            author: 'test',
            totalBytes: 4_500_000_000,
            mmProjFileName: 'vision-mmproj.gguf',
            mmProjLocalPath: `${MODELS_DIR}/vision-mmproj.gguf`,
            mmProjDownloadId: 43,
          },
        },
        modelsDir: MODELS_DIR,
        clearDownloadCallback: clearCb,
      });

      expect(models.length).toBe(1);
      // Should move both files
      expect(mockService.moveCompletedDownload).toHaveBeenCalledWith(42, `${MODELS_DIR}/vision.gguf`);
      expect(mockService.moveCompletedDownload).toHaveBeenCalledWith(43, `${MODELS_DIR}/vision-mmproj.gguf`);
      expect(clearCb).toHaveBeenCalledWith(42);
    });

    it('skips sync when mmproj download is still running', async () => {
      mockService.getActiveDownloads.mockResolvedValue([
        { downloadId: 42, status: 'completed', fileName: 'vision.gguf', modelId: 'test/model', bytesDownloaded: 4_000_000_000, totalBytes: 4_000_000_000, startedAt: 0 } as any,
        { downloadId: 43, status: 'running', fileName: 'mmproj.gguf', modelId: 'test/model', bytesDownloaded: 200_000_000, totalBytes: 500_000_000, startedAt: 0 } as any,
      ]);

      const clearCb = jest.fn();
      const models = await syncCompletedBackgroundDownloads({
        persistedDownloads: {
          42: {
            modelId: 'test/model',
            fileName: 'vision.gguf',
            quantization: 'Q4_K_M',
            author: 'test',
            totalBytes: 4_500_000_000,
            mmProjDownloadId: 43,
          },
        },
        modelsDir: MODELS_DIR,
        clearDownloadCallback: clearCb,
      });

      // Should skip — mmproj still running
      expect(models.length).toBe(0);
      expect(clearCb).not.toHaveBeenCalled();
    });

    it('cancels mmproj when main download failed', async () => {
      mockService.getActiveDownloads.mockResolvedValue([
        { downloadId: 42, status: 'failed', fileName: 'vision.gguf', modelId: 'test/model', bytesDownloaded: 0, totalBytes: 4_000_000_000, startedAt: 0 } as any,
        { downloadId: 43, status: 'running', fileName: 'mmproj.gguf', modelId: 'test/model', bytesDownloaded: 200_000_000, totalBytes: 500_000_000, startedAt: 0 } as any,
      ]);

      const clearCb = jest.fn();
      await syncCompletedBackgroundDownloads({
        persistedDownloads: {
          42: {
            modelId: 'test/model',
            fileName: 'vision.gguf',
            quantization: 'Q4_K_M',
            author: 'test',
            totalBytes: 4_500_000_000,
            mmProjDownloadId: 43,
          },
        },
        modelsDir: MODELS_DIR,
        clearDownloadCallback: clearCb,
      });

      expect(mockService.cancelDownload).toHaveBeenCalledWith(43);
      expect(clearCb).toHaveBeenCalledWith(42);
    });
  });

  // ========================================================================
  // restoreInProgressDownloads — mmproj recovery
  // ========================================================================

  describe('restoreInProgressDownloads — mmproj recovery', () => {
    it('restores both main and mmproj progress listeners', async () => {
      mockService.getActiveDownloads.mockResolvedValue([
        { downloadId: 42, status: 'running', fileName: 'vision.gguf', modelId: 'test/model', bytesDownloaded: 1_000_000_000, totalBytes: 4_000_000_000, startedAt: 0 } as any,
        { downloadId: 43, status: 'running', fileName: 'mmproj.gguf', modelId: 'test/model', bytesDownloaded: 100_000_000, totalBytes: 500_000_000, startedAt: 0 } as any,
      ]);

      await restoreInProgressDownloads({
        persistedDownloads: {
          42: {
            modelId: 'test/model',
            fileName: 'vision.gguf',
            quantization: 'Q4_K_M',
            author: 'test',
            totalBytes: 4_500_000_000,
            mmProjFileName: 'vision-mmproj.gguf',
            mmProjLocalPath: `${MODELS_DIR}/vision-mmproj.gguf`,
            mmProjDownloadId: 43,
          },
        },
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      expect(bgContext.size).toBe(1);
      const ctx = bgContext.get(42) as any;
      expect(ctx.mmProjDownloadId).toBe(43);
      expect(ctx.mmProjCompleted).toBe(false);
      expect(ctx.mainCompleted).toBe(false);
      // Progress listeners for both
      expect(mockService.onProgress).toHaveBeenCalledWith(42, expect.any(Function));
      expect(mockService.onProgress).toHaveBeenCalledWith(43, expect.any(Function));
      // mmproj should be marked silent
      expect(mockService.markSilent).toHaveBeenCalledWith(43);
    });

    it('handles mmproj completed while app was dead', async () => {
      mockService.getActiveDownloads.mockResolvedValue([
        { downloadId: 42, status: 'running', fileName: 'vision.gguf', modelId: 'test/model', bytesDownloaded: 2_000_000_000, totalBytes: 4_000_000_000, startedAt: 0 } as any,
        { downloadId: 43, status: 'completed', fileName: 'mmproj.gguf', modelId: 'test/model', bytesDownloaded: 500_000_000, totalBytes: 500_000_000, startedAt: 0 } as any,
      ]);
      mockService.moveCompletedDownload.mockResolvedValue(`${MODELS_DIR}/vision-mmproj.gguf`);
      mockedRNFS.exists.mockResolvedValue(true);

      await restoreInProgressDownloads({
        persistedDownloads: {
          42: {
            modelId: 'test/model',
            fileName: 'vision.gguf',
            quantization: 'Q4_K_M',
            author: 'test',
            totalBytes: 4_500_000_000,
            mmProjFileName: 'vision-mmproj.gguf',
            mmProjLocalPath: `${MODELS_DIR}/vision-mmproj.gguf`,
            mmProjDownloadId: 43,
          },
        },
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      const ctx = bgContext.get(42) as any;
      expect(ctx.mmProjCompleted).toBe(true);
      // Should have tried to move the completed mmproj
      expect(mockService.moveCompletedDownload).toHaveBeenCalledWith(43, `${MODELS_DIR}/vision-mmproj.gguf`);
      // Should NOT register mmproj progress listener (already done)
      expect(mockService.markSilent).not.toHaveBeenCalled();
    });

    it('marks mmproj as completed when it failed while app was dead', async () => {
      mockService.getActiveDownloads.mockResolvedValue([
        { downloadId: 42, status: 'running', fileName: 'vision.gguf', modelId: 'test/model', bytesDownloaded: 2_000_000_000, totalBytes: 4_000_000_000, startedAt: 0 } as any,
        { downloadId: 43, status: 'failed', fileName: 'mmproj.gguf', modelId: 'test/model', bytesDownloaded: 0, totalBytes: 500_000_000, startedAt: 0 } as any,
      ]);

      await restoreInProgressDownloads({
        persistedDownloads: {
          42: {
            modelId: 'test/model',
            fileName: 'vision.gguf',
            quantization: 'Q4_K_M',
            author: 'test',
            totalBytes: 4_500_000_000,
            mmProjFileName: 'vision-mmproj.gguf',
            mmProjLocalPath: `${MODELS_DIR}/vision-mmproj.gguf`,
            mmProjDownloadId: 43,
          },
        },
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      const ctx = bgContext.get(42) as any;
      // mmproj failed but treated as done (vision just won't work)
      expect(ctx.mmProjCompleted).toBe(true);
    });

    it('does not create duplicate context for mmproj download ID', async () => {
      mockService.getActiveDownloads.mockResolvedValue([
        { downloadId: 42, status: 'running', fileName: 'vision.gguf', modelId: 'test/model', bytesDownloaded: 0, totalBytes: 4_000_000_000, startedAt: 0 } as any,
        { downloadId: 43, status: 'running', fileName: 'mmproj.gguf', modelId: 'test/model', bytesDownloaded: 0, totalBytes: 500_000_000, startedAt: 0 } as any,
      ]);

      await restoreInProgressDownloads({
        persistedDownloads: {
          42: {
            modelId: 'test/model',
            fileName: 'vision.gguf',
            quantization: 'Q4_K_M',
            author: 'test',
            totalBytes: 4_500_000_000,
            mmProjDownloadId: 43,
          },
        },
        modelsDir: MODELS_DIR,
        backgroundDownloadContext: bgContext,
        backgroundDownloadMetadataCallback: metadataCallback,
      });

      // Only the main download ID should be in the context, not the mmproj
      expect(bgContext.size).toBe(1);
      expect(bgContext.has(42)).toBe(true);
      expect(bgContext.has(43)).toBe(false);
    });
  });
});
