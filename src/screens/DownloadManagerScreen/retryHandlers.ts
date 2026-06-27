/**
 * Download retry handlers, extracted from useDownloadManager to keep that hook
 * focused on state + UI wiring. Each platform/model-type has its own retry path
 * (the native retry doesn't cover every case); `runRetryDownload` dispatches to
 * the right one. `parseEntryMetadata` is shared with the hook's item mapping.
 */
import { Platform } from 'react-native';
import { AlertState } from '../../components/CustomAlert';
import { useAppStore } from '../../stores';
import { useDownloadStore, DownloadEntry } from '../../stores/downloadStore';
import {
  modelManager,
  huggingFaceService,
  backgroundDownloadService,
  whisperService,
} from '../../services';
import { DownloadedModel } from '../../types';
import { DownloadItem } from './items';
import logger from '../../utils/logger';
import { proceedWithDownload } from '../ModelsScreen/imageDownloadActions';
import { resumeImageDownload } from '../ModelsScreen/imageDownloadResume';

interface RetryDeps {
  setDownloadedModels: (models: DownloadedModel[]) => void;
  setAlertState: (state: AlertState) => void;
}

export function parseEntryMetadata(entry: DownloadEntry): Record<string, any> | null {
  if (!entry.metadataJson) return null;
  try {
    return JSON.parse(entry.metadataJson);
  } catch {
    return null;
  }
}

async function resumeImageFinalization(
  entry: DownloadEntry,
  setAlertState: (state: AlertState) => void,
): Promise<void> {
  const appState = useAppStore.getState();
  await resumeImageDownload(entry, {
    addDownloadedImageModel: appState.addDownloadedImageModel,
    activeImageModelId: appState.activeImageModelId,
    setActiveImageModelId: appState.setActiveImageModelId,
    setAlertState,
    triedImageGen: appState.onboardingChecklist.triedImageGen,
  });
}

async function reattachRetriedTextDownload(
  item: DownloadItem,
  setDownloadedModels: (models: DownloadedModel[]) => void,
): Promise<void> {
  logger.log('[DownloadDebug] Reattaching text download finalizer after retry', {
    modelId: item.modelId,
    fileName: item.fileName,
    downloadId: item.downloadId,
  });
  modelManager.watchDownload(
    item.downloadId!,
    async () => {
      logger.log('[DownloadDebug] Retried text download finalized', {
        modelId: item.modelId,
        fileName: item.fileName,
        downloadId: item.downloadId,
      });
      const models = await modelManager.getDownloadedModels();
      setDownloadedModels(models);
      const modelKey = useDownloadStore.getState().downloadIdIndex[item.downloadId!] ?? '';
      if (modelKey) {
        useDownloadStore.getState().remove(modelKey);
      }
    },
    (error: Error) => {
      logger.error('[DownloadManager] Retried text download failed:', error);
      useDownloadStore.getState().setStatus(item.downloadId!, 'failed', {
        message: error.message,
      });
    },
  );
}

async function retryFailedMmProj(entry: DownloadEntry | undefined): Promise<boolean> {
  if (!entry?.mmProjDownloadId || entry.mmProjStatus !== 'failed') return false;
  useDownloadStore.getState().setStatus(entry.mmProjDownloadId, 'pending');
  try {
    logger.log('[DownloadDebug] Retrying failed mmproj sidecar', {
      modelKey: entry.modelKey,
      modelId: entry.modelId,
      mainDownloadId: entry.downloadId,
      mmProjDownloadId: entry.mmProjDownloadId,
    });
    await backgroundDownloadService.retryDownload(entry.mmProjDownloadId);
    return true;
  } catch (error) {
    logger.warn('[DownloadManager] Failed to retry mmproj sidecar:', error);
    useDownloadStore.getState().setStatus(entry.mmProjDownloadId, 'failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function retryAndroidDownload(item: DownloadItem, entry: DownloadEntry | undefined, setDownloadedModels: (models: DownloadedModel[]) => void): Promise<void> {
  const downloadId = item.downloadId as string;
  useDownloadStore.getState().setStatus(downloadId, 'pending');
  await backgroundDownloadService.retryDownload(downloadId);
  if (item.modelType === 'text') {
    const mmProjRetried = await retryFailedMmProj(entry);
    if (mmProjRetried) {
      modelManager.resetMmProjForRetry(downloadId);
    }
    await reattachRetriedTextDownload(item, setDownloadedModels);
  }
}

async function retryIosImageDownload(entry: DownloadEntry, setAlertState: (s: AlertState) => void): Promise<void> {
  const meta = parseEntryMetadata(entry);
  if (!meta) return;
  const isZip = meta.imageDownloadType === 'zip';
  if (isZip && !meta.imageModelDownloadUrl) {
    logger.error('[DownloadManager] retryIosImageDownload: missing imageModelDownloadUrl for zip download', { modelId: entry.modelId });
    return;
  }
  // Cancel the stale native row so it doesn't accumulate in the native DB across
  // retries. proceedWithDownload starts a fresh row — without this the old failed
  // row stays persisted and re-hydrates after the next app kill.
  await backgroundDownloadService.cancelDownload(entry.downloadId).catch(() => {});
  const modelId = entry.modelId.replace('image:', '');
  const appState = useAppStore.getState();
  const deps = {
    addDownloadedImageModel: appState.addDownloadedImageModel,
    activeImageModelId: appState.activeImageModelId,
    setActiveImageModelId: appState.setActiveImageModelId,
    setAlertState,
    triedImageGen: appState.onboardingChecklist.triedImageGen,
  };
  await proceedWithDownload({
    id: modelId,
    name: meta.imageModelName,
    description: meta.imageModelDescription,
    downloadUrl: meta.imageModelDownloadUrl ?? '',
    size: meta.imageModelSize,
    style: meta.imageModelStyle,
    backend: meta.imageModelBackend,
    attentionVariant: meta.imageModelAttentionVariant,
    huggingFaceRepo: meta.imageModelRepo,
    huggingFaceFiles: meta.imageModelHuggingFaceFiles,
    coremlFiles: meta.imageModelCoremlFiles,
    repo: meta.imageModelRepo,
  }, deps);
}

async function retryIosTextDownload(
  item: DownloadItem,
  entry: DownloadEntry,
  setDownloadedModels: (models: DownloadedModel[]) => void,
): Promise<void> {
  const meta = parseEntryMetadata(entry);
  const mmProjFile = entry.mmProjFileName && entry.mmProjFileSize && meta?.mmProjDownloadUrl
    ? { name: entry.mmProjFileName, size: entry.mmProjFileSize, downloadUrl: meta.mmProjDownloadUrl }
    : undefined;
  const file = {
    name: entry.fileName,
    size: entry.totalBytes,
    quantization: entry.quantization,
    downloadUrl: huggingFaceService.getDownloadUrl(entry.modelId, entry.fileName),
    ...(mmProjFile ? { mmProjFile } : {}),
  };
  const info = await modelManager.downloadModelBackground(entry.modelId, file);
  await reattachRetriedTextDownload({ ...item, downloadId: info.downloadId }, setDownloadedModels);
}

/**
 * Retry a failed transcription (Whisper/STT) download on either platform.
 *
 * STT downloads aren't restartable via the native retry: on iOS there was no STT
 * branch at all, and a failed STT row can linger in the store with a dead
 * downloadId (the background promise can hang on failure, so whisperService never
 * removes its entry). whisperService.downloadModel refuses to start while that
 * entry exists, so we cancel the dead native task and clear the stale row, then
 * re-invoke a fresh download.
 */
async function retryWhisperDownload(item: DownloadItem): Promise<void> {
  const modelKey = item.modelKey ?? `${item.modelId}/${item.fileName}`;
  if (item.downloadId) {
    await backgroundDownloadService.cancelDownload(item.downloadId).catch(() => {});
  }
  useDownloadStore.getState().remove(modelKey);
  // The store keys STT models as `whisper-<id>`; downloadModel wants the bare id.
  const whisperId = item.modelId.replace(/^whisper-/, '');
  // Kick off a fresh download but don't block the retry tap on full completion —
  // whisperService re-registers the store row and the global progress listeners
  // drive the UI. Surface a failure via the logger; the row reflects it too.
  whisperService.downloadModel(whisperId).catch((err) => {
    logger.warn('[DownloadManager] STT retry download failed:', err);
  });
}

/**
 * An image download whose bytes are all present (or already 'processing') just
 * needs its post-download finalization re-run, not a fresh download. Returns true
 * when it handled the retry so the caller can stop.
 */
async function tryResumeImageFinalization(
  item: DownloadItem,
  entry: DownloadEntry | undefined,
  setAlertState: (s: AlertState) => void,
): Promise<boolean> {
  if (item.modelType !== 'image' || !entry) return false;
  const hasAllBytes = item.fileSize > 0 && item.bytesDownloaded >= item.fileSize;
  let nativeMainStatus: string | undefined;
  try {
    const activeRows = await backgroundDownloadService.getActiveDownloads();
    nativeMainStatus = activeRows.find(row => row.downloadId === item.downloadId)?.status;
  } catch {
    // Best-effort native state check only.
  }
  if (item.status === 'processing' || hasAllBytes || nativeMainStatus === 'completed') {
    await resumeImageFinalization(entry, setAlertState);
    return true;
  }
  return false;
}

/**
 * Dispatch a manual retry to the right path for this item's platform + model
 * type. Throws on failure so the caller can mark the row failed.
 */
export async function runRetryDownload(
  item: DownloadItem,
  entry: DownloadEntry | undefined,
  deps: RetryDeps,
): Promise<void> {
  logger.log('[DownloadDebug] Manual retry requested', { modelKey: item.modelKey, modelId: item.modelId, fileName: item.fileName, modelType: item.modelType, mainDownloadId: item.downloadId, mmProjDownloadId: entry?.mmProjDownloadId, status: item.status, mmProjStatus: entry?.mmProjStatus });

  if (await tryResumeImageFinalization(item, entry, deps.setAlertState)) return;

  if (item.modelType === 'stt') {
    // Transcription models re-download through whisperService on both platforms
    // (the native retry path doesn't cover STT).
    await retryWhisperDownload(item);
  } else if (Platform.OS === 'android') {
    await retryAndroidDownload(item, entry, deps.setDownloadedModels);
  } else if (Platform.OS === 'ios' && item.modelType === 'image' && entry) {
    await retryIosImageDownload(entry, deps.setAlertState);
  } else if (Platform.OS === 'ios' && item.modelType === 'text' && entry) {
    await retryIosTextDownload(item, entry, deps.setDownloadedModels);
  }
  backgroundDownloadService.startProgressPolling();
}
