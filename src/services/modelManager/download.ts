import RNFS from 'react-native-fs';
import { ModelFile, BackgroundDownloadInfo } from '../../types';
import { huggingFaceService } from '../huggingface';
import { backgroundDownloadService } from '../backgroundDownloadService';
import {
  DownloadProgressCallback,
  DownloadCompleteCallback,
  DownloadErrorCallback,
  BackgroundDownloadMetadataCallback,
  BackgroundDownloadContext,
} from './types';
import { buildDownloadedModel, persistDownloadedModel, loadDownloadedModels, saveModelsList } from './storage';
import { extractBaseName } from './scan';
import logger from '../../utils/logger';

export {
  getOrphanedTextFiles,
  getOrphanedImageDirs,
  syncCompletedBackgroundDownloads,
} from './downloadHelpers';
export type { SyncDownloadsOpts } from './downloadHelpers';

export interface PerformBackgroundDownloadOpts {
  modelId: string;
  file: ModelFile;
  modelsDir: string;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

export async function performBackgroundDownload(opts: PerformBackgroundDownloadOpts): Promise<BackgroundDownloadInfo> {
  const { modelId, file, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress } = opts;
  const localPath = `${modelsDir}/${file.name}`;
  const mmProjLocalPath = file.mmProjFile
    ? `${modelsDir}/${extractBaseName(file.name)}-${file.mmProjFile.name}`
    : null;

  const mainExists = await RNFS.exists(localPath);
  const mmProjExists = await checkMmProjExists(mmProjLocalPath, file.mmProjFile?.size);

  if (mainExists && mmProjExists) {
    return handleAlreadyDownloaded({ modelId, file, localPath, mmProjLocalPath, backgroundDownloadContext });
  }

  return startBgDownload({
    modelId, file, localPath, mmProjLocalPath, mmProjExists,
    modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress,
  });
}

const GGUF_MAGIC = 'GGUF';

async function hasGgufMagic(path: string): Promise<boolean | null> {
  // Returns true if GGUF magic confirmed, false if confirmed invalid, null if
  // the read itself failed (iOS RNFS.read has a known NSInteger bridging bug;
  // treat as inconclusive rather than invalid in that case).
  try {
    const header = await RNFS.read(path, 4, 0, 'ascii');
    return header.startsWith(GGUF_MAGIC);
  } catch {
    return null;
  }
}

async function checkMmProjExists(path: string | null, expectedSize?: number): Promise<boolean> {
  if (!path) return true;
  const exists = await RNFS.exists(path);
  if (!exists) return false;
  try {
    if (expectedSize) {
      const stat = await RNFS.stat(path);
      const actualSize = typeof stat.size === 'string' ? Number.parseInt(stat.size, 10) : stat.size;
      if (actualSize < expectedSize) {
        logger.warn(`[ModelManager] mmproj partial (${actualSize}/${expectedSize}), re-downloading`);
        await RNFS.unlink(path).catch(() => {});
        return false;
      }
    }
    const magicOk = await hasGgufMagic(path);
    if (magicOk === false) {
      logger.warn(`[ModelManager] mmproj failed GGUF magic check, re-downloading: ${path}`);
      await RNFS.unlink(path).catch(() => {});
      return false;
    }
    // magicOk === true or null (inconclusive): accept — llama.rn validates on load.
    return true;
  } catch {
    await RNFS.unlink(path).catch(() => {});
    return false;
  }
}

interface AlreadyDownloadedOpts {
  modelId: string;
  file: ModelFile;
  localPath: string;
  mmProjLocalPath: string | null;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
}

async function handleAlreadyDownloaded(opts: AlreadyDownloadedOpts): Promise<BackgroundDownloadInfo> {
  const { modelId, file, localPath, mmProjLocalPath, backgroundDownloadContext } = opts;
  const model = await buildDownloadedModel({ modelId, file, resolvedLocalPath: localPath, mmProjPath: mmProjLocalPath || undefined });
  const totalBytes = file.size + (file.mmProjFile?.size || 0);
  const completedInfo: BackgroundDownloadInfo = {
    downloadId: -1, fileName: file.name, modelId, status: 'completed',
    bytesDownloaded: totalBytes, totalBytes, startedAt: Date.now(), completedAt: Date.now(),
  };
  backgroundDownloadContext.set(-1, { model, error: null });
  return completedInfo;
}

interface StartBgDownloadOpts {
  modelId: string;
  file: ModelFile;
  localPath: string;
  mmProjLocalPath: string | null;
  mmProjExists: boolean;
  modelsDir: string;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

async function startBgDownload(opts: StartBgDownloadOpts): Promise<BackgroundDownloadInfo> {
  const { modelId, file, localPath, mmProjLocalPath, mmProjExists, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress } = opts;

  const mmProjSize = file.mmProjFile?.size || 0;
  const combinedTotalBytes = file.size + mmProjSize;
  const downloadUrl = huggingFaceService.getDownloadUrl(modelId, file.name);
  const author = modelId.split('/')[0] || 'Unknown';

  const downloadInfo = await backgroundDownloadService.startDownload({
    url: downloadUrl, fileName: file.name, modelId,
    title: `Downloading ${file.name}`, description: `${modelId} - ${file.quantization}`,
    totalBytes: file.size, sha256: file.sha256,
  });

  // Start mmproj download in parallel if needed
  const needsMmProj = !!(file.mmProjFile && mmProjLocalPath && !mmProjExists);
  let mmProjDownloadId: number | undefined;
  if (needsMmProj) {
    const mmProjFile = file.mmProjFile!;
    const mmProjInfo = await backgroundDownloadService.startDownload({
      url: mmProjFile.downloadUrl, fileName: mmProjFile.name, modelId,
      title: `Downloading ${file.name}`,
      description: `${modelId} - vision projection`, totalBytes: mmProjFile.size,
      sha256: mmProjFile.sha256,
    });
    mmProjDownloadId = mmProjInfo.downloadId;
    backgroundDownloadService.markSilent(mmProjDownloadId);
  }

  backgroundDownloadMetadataCallback?.(downloadInfo.downloadId, {
    modelId, fileName: file.name, quantization: file.quantization, author,
    totalBytes: combinedTotalBytes, mainFileSize: file.size,
    mmProjFileName: mmProjLocalPath ? mmProjLocalPath.split('/').pop() : file.mmProjFile?.name, mmProjFileSize: mmProjSize,
    mmProjLocalPath, mmProjDownloadId,
  });

  // Combined progress tracking
  let mainBytesDownloaded = 0;
  let mmProjBytesDownloaded = mmProjExists ? mmProjSize : 0;
  const mmProjFileName = file.mmProjFile?.name || '';

  const reportProgress = () => {
    const combinedDownloaded = mainBytesDownloaded + mmProjBytesDownloaded;

    // Update Android notification with combined progress for vision models
    if (needsMmProj && mmProjDownloadId) {
      try {
        // @ts-ignore - native module method
        const { DownloadManagerModule } = require('react-native').NativeModules;
        if (DownloadManagerModule?.updateCombinedProgress) {
          DownloadManagerModule.updateCombinedProgress(
            modelId,
            file.name,
            mmProjFileName,
            mainBytesDownloaded,
            file.size,
            mmProjBytesDownloaded,
            mmProjSize,
          );
        }
      } catch {
        // Best-effort notification update only.
      }
    }

    onProgress?.({
      downloadId: downloadInfo.downloadId,
      modelId, fileName: file.name, bytesDownloaded: combinedDownloaded,
      totalBytes: combinedTotalBytes,
      progress: combinedTotalBytes > 0 ? combinedDownloaded / combinedTotalBytes : 0,
    });
  };

  const removeProgressListener = backgroundDownloadService.onProgress(
    downloadInfo.downloadId, (event) => {
      if (event.status === 'retrying' || event.status === 'waiting_for_network') return; // keep existing bytes on transient failure
      mainBytesDownloaded = event.bytesDownloaded; reportProgress();
    },
  );

  let removeMmProjProgressListener: (() => void) | undefined;
  if (mmProjDownloadId) {
    removeMmProjProgressListener = backgroundDownloadService.onProgress(
      mmProjDownloadId, (event) => {
        if (event.status === 'retrying' || event.status === 'waiting_for_network') return;
        mmProjBytesDownloaded = event.bytesDownloaded; reportProgress();
      },
    );
  }

  backgroundDownloadContext.set(downloadInfo.downloadId, {
    modelId, file, localPath, mmProjLocalPath, removeProgressListener,
    mmProjDownloadId, mmProjCompleted: !needsMmProj, mainCompleted: false,
    mainCompleteHandled: false, mmProjCompleteHandled: false, isFinalizing: false,
    removeMmProjProgressListener,
  });

  backgroundDownloadService.startProgressPolling();
  return downloadInfo;
}

export interface WatchDownloadOpts {
  downloadId: number;
  modelsDir: string;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onComplete?: DownloadCompleteCallback;
  onError?: DownloadErrorCallback;
}

export function watchBackgroundDownload(opts: WatchDownloadOpts): void {
  const { downloadId, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onComplete, onError } = opts;
  const ctx = backgroundDownloadContext.get(downloadId);

  if (downloadId === -1 && ctx && 'model' in ctx) {
    if (ctx.model) onComplete?.(ctx.model);
    else if (ctx.error) onError?.(ctx.error);
    backgroundDownloadContext.delete(downloadId);
    return;
  }

  if (!ctx || !('file' in ctx)) return;

  let removeMmProjComplete: (() => void) | undefined;
  let removeMmProjError: (() => void) | undefined;

  const cleanupListeners = () => {
    ctx.removeProgressListener();
    ctx.removeMmProjProgressListener?.();
    removeMainComplete();
    removeMainError();
    removeMmProjComplete?.();
    removeMmProjError?.();
    if (ctx.mmProjDownloadId) backgroundDownloadService.unmarkSilent(ctx.mmProjDownloadId);
  };

  const handleError = (error: Error, cancelDownloadId?: number) => {
    if (cancelDownloadId) backgroundDownloadService.cancelDownload(cancelDownloadId).catch(() => {});
    cleanupListeners();
    backgroundDownloadContext.delete(downloadId);
    onError?.(error);
  };

  const tryFinalize = async () => {
    if (!ctx.mainCompleted || !ctx.mmProjCompleted) return;
    if (ctx.isFinalizing) return;
    ctx.isFinalizing = true;
    cleanupListeners();
    backgroundDownloadContext.delete(downloadId);
    try {
      const finalPath = await backgroundDownloadService.moveCompletedDownload(downloadId, ctx.localPath);
      const mmProjFileExists = ctx.mmProjLocalPath ? await RNFS.exists(ctx.mmProjLocalPath) : false;
      const finalMmProjPath = ctx.mmProjLocalPath && mmProjFileExists ? ctx.mmProjLocalPath : undefined;

      const model = await buildDownloadedModel({
        modelId: ctx.modelId, file: ctx.file, resolvedLocalPath: finalPath, mmProjPath: finalMmProjPath,
      });
      await persistDownloadedModel(model, modelsDir);
      backgroundDownloadMetadataCallback?.(downloadId, null);
      onComplete?.(model);
    } catch (error) {
      ctx.isFinalizing = false;
      onError?.(error as Error);
    }
  };

  const removeMainComplete = backgroundDownloadService.onComplete(downloadId, async () => {
    if (ctx.mainCompleteHandled) return;
    ctx.mainCompleteHandled = true;
    ctx.mainCompleted = true;
    await tryFinalize();
  });
  const removeMainError = backgroundDownloadService.onError(downloadId, (event) => {
    handleError(new Error(event.reason || 'Download failed'), ctx.mmProjDownloadId);
  });

  if (ctx.mmProjDownloadId && !ctx.mmProjCompleted) {
    removeMmProjComplete = backgroundDownloadService.onComplete(ctx.mmProjDownloadId, async (event) => {
      if (ctx.mmProjCompleteHandled) return;
      ctx.mmProjCompleteHandled = true;
      try {
        await backgroundDownloadService.moveCompletedDownload(event.downloadId, ctx.mmProjLocalPath!);
      } catch (moveErr) {
        // Move can fail legitimately if another quant of the same family already
        // placed a valid mmproj at this shared path. Validate the existing file
        // (size + GGUF magic); trust it if valid, discard + downgrade if not.
        const expectedSize = ctx.file.mmProjFile?.size;
        const valid = await checkMmProjExists(ctx.mmProjLocalPath, expectedSize);
        if (!valid) {
          logger.warn('[ModelManager] mmproj move failed and target invalid, continuing without vision:', moveErr);
          ctx.mmProjLocalPath = null;
        } else {
          logger.log('[ModelManager] mmproj move failed but target valid (likely shared with sibling quant):', moveErr);
        }
      }
      ctx.mmProjCompleted = true;
      await tryFinalize();
    });
    removeMmProjError = backgroundDownloadService.onError(ctx.mmProjDownloadId, (event) => {
      handleError(new Error(`Vision projection download failed: ${event.reason || 'Unknown error'}`), downloadId);
    });
  }
}

export { loadDownloadedModels, saveModelsList };
