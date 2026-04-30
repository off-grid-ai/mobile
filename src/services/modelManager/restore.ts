import RNFS from 'react-native-fs';
import { PersistedDownloadInfo, ModelFile, BackgroundDownloadInfo } from '../../types';
import { backgroundDownloadService } from '../backgroundDownloadService';
import {
  BackgroundDownloadContext,
  BackgroundDownloadMetadataCallback,
  DownloadProgressCallback,
} from './types';
import logger from '../../utils/logger';

export interface RestoreDownloadsOpts {
  persistedDownloads: Record<number, PersistedDownloadInfo>;
  modelsDir: string;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

/** Check whether an active download is eligible for restoration. */
function isRestorable(download: BackgroundDownloadInfo): boolean {
  return (
    download.status === 'running' ||
    download.status === 'pending' ||
    download.status === 'paused' ||
    download.status === 'retrying' ||
    download.status === 'waiting_for_network'
  );
}

/** Determine the mmproj completion state from active downloads after app kill. */
async function resolveMmProjState(
  mmProjDownloadId: number,
  mmProjLocalPath: string | null,
  activeDownloads: BackgroundDownloadInfo[],
): Promise<boolean> {
  const mmProjDownload = activeDownloads.find(d => d.downloadId === mmProjDownloadId);

  if (mmProjDownload?.status === 'failed') {
    logger.warn('[ModelManager] mmproj download failed while app was dead, vision will not be available');
    return true; // Treat as done — model will work without vision
  }

  if (!mmProjDownload || mmProjDownload.status === 'completed') {
    // mmproj finished while app was dead — move it if needed
    if (mmProjDownload && mmProjLocalPath) {
      try { await backgroundDownloadService.moveCompletedDownload(mmProjDownloadId, mmProjLocalPath); }
      catch { /* May already be moved */ }
    }
    if (!mmProjLocalPath || !(await RNFS.exists(mmProjLocalPath))) {
      logger.warn('[ModelManager] mmproj download completed but file not found, vision will not be available');
    }
    return true;
  }

  // Still running
  return false;
}

/** Build a ModelFile from persisted metadata. */
function buildFileInfo(metadata: PersistedDownloadInfo): ModelFile {
  const mainFileSize = metadata.mainFileSize ?? metadata.totalBytes;
  const mmProjFileSize = metadata.mmProjFileSize ?? 0;
  return {
    name: metadata.fileName,
    size: mainFileSize,
    quantization: metadata.quantization,
    downloadUrl: '',
    mmProjFile: metadata.mmProjFileName
      ? { name: metadata.mmProjFileName, downloadUrl: '', size: mmProjFileSize }
      : undefined,
  };
}

interface RestoreEntryOpts {
  download: BackgroundDownloadInfo;
  metadata: PersistedDownloadInfo;
  modelsDir: string;
  activeDownloads: BackgroundDownloadInfo[];
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

async function restoreDownloadEntry(opts: RestoreEntryOpts): Promise<void> {
  const {
    download,
    metadata,
    modelsDir,
    activeDownloads,
    backgroundDownloadContext,
    backgroundDownloadMetadataCallback,
    onProgress,
  } = opts;

  const localPath = `${modelsDir}/${metadata.fileName}`;
  const mmProjLocalPath = metadata.mmProjLocalPath ?? null;
  const mainFileSize = metadata.mainFileSize ?? metadata.totalBytes;
  const mmProjFileSize = metadata.mmProjFileSize ?? 0;
  const combinedTotalBytes = metadata.totalBytes > 0
    ? metadata.totalBytes
    : mainFileSize + mmProjFileSize;
  const mmProjDownloadId = metadata.mmProjDownloadId;
  const fileInfo = buildFileInfo(metadata);

  let mmProjCompleted = !mmProjDownloadId;
  if (mmProjDownloadId) {
    mmProjCompleted = await resolveMmProjState(mmProjDownloadId, mmProjLocalPath, activeDownloads);
  }

  const mmProjDownload = mmProjDownloadId
    ? activeDownloads.find(d => d.downloadId === mmProjDownloadId)
    : undefined;
  let mainBytesDownloaded = download.bytesDownloaded;
  let mmProjBytesDownloaded = mmProjCompleted
    ? mmProjFileSize
    : (mmProjDownload?.bytesDownloaded || 0);
  const reportProgress = () => {
    const combinedDownloaded = mainBytesDownloaded + mmProjBytesDownloaded;
    onProgress?.({
      downloadId: download.downloadId,
      modelId: metadata.modelId, fileName: metadata.fileName,
      bytesDownloaded: combinedDownloaded, totalBytes: combinedTotalBytes,
      progress: combinedTotalBytes > 0 ? combinedDownloaded / combinedTotalBytes : 0,
    });
  };

  const removeProgressListener = backgroundDownloadService.onProgress(
    download.downloadId, (event) => {
      if (event.status === 'retrying' || event.status === 'waiting_for_network') return;
      mainBytesDownloaded = event.bytesDownloaded; reportProgress();
    },
  );

  let removeMmProjProgressListener: (() => void) | undefined;
  if (mmProjDownloadId && !mmProjCompleted) {
    backgroundDownloadService.markSilent(mmProjDownloadId);
    removeMmProjProgressListener = backgroundDownloadService.onProgress(
      mmProjDownloadId, (event) => {
        if (event.status === 'retrying' || event.status === 'waiting_for_network') return;
        mmProjBytesDownloaded = event.bytesDownloaded; reportProgress();
      },
    );
  }

  backgroundDownloadContext.set(download.downloadId, {
    modelId: metadata.modelId, file: fileInfo, localPath, mmProjLocalPath,
    removeProgressListener, mmProjDownloadId, mmProjCompleted, mainCompleted: false,
    removeMmProjProgressListener,
  });
  backgroundDownloadMetadataCallback?.(download.downloadId, { ...metadata, mmProjLocalPath });
  reportProgress();
}

/**
 * Re-wires backgroundDownloadContext for downloads that were still running
 * when the app was killed. Called on startup after syncCompletedBackgroundDownloads
 * so that any still-running download fires onComplete/onError correctly.
 */
export async function restoreInProgressDownloads(opts: RestoreDownloadsOpts): Promise<number[]> {
  const { persistedDownloads, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress } = opts;

  if (!backgroundDownloadService.isAvailable()) return [];

  const activeDownloads = await backgroundDownloadService.getActiveDownloads();
  const restoredDownloadIds: number[] = [];

  for (const download of activeDownloads) {
    if (!isRestorable(download)) continue;
    const metadata = persistedDownloads[download.downloadId];
    if (!metadata || backgroundDownloadContext.has(download.downloadId)) continue;
    // Image model restoration is handled by image-specific recovery logic.
    if (metadata.modelId.startsWith('image:')) continue;
    await restoreDownloadEntry({
      download,
      metadata,
      modelsDir,
      activeDownloads,
      backgroundDownloadContext,
      backgroundDownloadMetadataCallback,
      onProgress,
    });
    restoredDownloadIds.push(download.downloadId);
  }

  return restoredDownloadIds;
}
