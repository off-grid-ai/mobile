import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { DownloadedModel, ModelFile, ONNXImageModel } from '../../types';
import { buildDownloadedModel, persistDownloadedModel, loadDownloadedModels, saveModelsList } from './storage';

export function isMMProjFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.includes('mmproj') ||
    lower.includes('projector') ||
    (lower.includes('clip') && lower.endsWith('.gguf'));
}

function parseSizeInt(size: string | number): number {
  return typeof size === 'string' ? Number.parseInt(size, 10) : size;
}

async function getDirSize(dirPath: string): Promise<number> {
  try {
    const dirFiles = await RNFS.readDir(dirPath);
    return dirFiles.reduce((total, f) => total + (f.isFile() ? parseSizeInt(f.size) : 0), 0);
  } catch {
    return 0;
  }
}

export async function deleteOrphanedFile(filePath: string): Promise<void> {
  const exists = await RNFS.exists(filePath);
  if (exists) {
    await RNFS.unlink(filePath);
  }
}

function looksLikeVisionModel(model: DownloadedModel): boolean {
  const nameLower = model.name.toLowerCase();
  const fileLower = model.fileName.toLowerCase();
  return nameLower.includes('vl') || nameLower.includes('vision') || nameLower.includes('smolvlm') ||
    fileLower.includes('vl') || fileLower.includes('vision');
}

function extractBaseName(fileName: string): string {
  const match = fileName.match(/^(.+?)[-_](?:Q\d|q\d|F\d|f\d)/i);
  return match ? match[1].toLowerCase() : fileName.toLowerCase().replace('.gguf', '');
}

function findMatchingMmProj(
  baseName: string,
  mmProjFiles: RNFS.ReadDirItem[],
): RNFS.ReadDirItem | undefined {
  const noSeparators = baseName.replaceAll('-', '').replaceAll('_', '');
  return mmProjFiles.find(mf => {
    const lower = mf.name.toLowerCase();
    return lower.includes(noSeparators) || lower.includes(baseName);
  });
}

export async function cleanupMMProjEntries(modelsDir: string): Promise<number> {
  const models = await loadDownloadedModels(modelsDir);
  const cleanedModels = models.filter(m => !isMMProjFile(m.fileName));
  const removedCount = models.length - cleanedModels.length;

  try {
    const dirExists = await RNFS.exists(modelsDir);
    if (dirExists) {
      const files = await RNFS.readDir(modelsDir);
      const mmProjFiles = files.filter(f => f.isFile() && isMMProjFile(f.name));

      for (const model of cleanedModels) {
        if (model.mmProjPath) continue;
        if (!looksLikeVisionModel(model)) continue;

        const baseName = extractBaseName(model.fileName);
        const match = findMatchingMmProj(baseName, mmProjFiles);
        if (match) {
          model.mmProjPath = match.path;
          model.mmProjFileName = match.name;
          model.mmProjFileSize = parseSizeInt(match.size);
          model.isVisionModel = true;
        }
      }
    }
  } catch {
    // Scan errors are non-fatal
  }

  await saveModelsList(cleanedModels);
  return removedCount;
}

function detectBackend(dirName: string): 'mnn' | 'qnn' | 'coreml' {
  if (dirName.includes('qnn') || dirName.includes('8gen')) return 'qnn';
  if (dirName.includes('coreml')) return 'coreml';
  return 'mnn';
}

export interface ScanImageModelsOpts {
  imageModelsDir: string;
  getImageModels: () => Promise<ONNXImageModel[]>;
  addImageModel: (model: ONNXImageModel) => Promise<void>;
}

export async function scanForUntrackedImageModels(opts: ScanImageModelsOpts): Promise<ONNXImageModel[]> {
  const { imageModelsDir, getImageModels, addImageModel } = opts;
  const discoveredModels: ONNXImageModel[] = [];
  const registeredModels = await getImageModels();
  const registeredPaths = new Set(registeredModels.map(m => m.modelPath));

  const dirExists = await RNFS.exists(imageModelsDir);
  if (!dirExists) return discoveredModels;

  const items = await RNFS.readDir(imageModelsDir);

  for (const item of items) {
    if (!item.isDirectory() || registeredPaths.has(item.path)) continue;

    const totalSize = await getDirSize(item.path);
    if (totalSize === 0) continue;

    const newModel: ONNXImageModel = {
      id: `recovered_${item.name}_${Date.now()}`,
      name: item.name.replaceAll('_', ' ').replaceAll(/\.(zip|tar|gz)$/gi, ''),
      description: `Recovered ${item.name} model`,
      modelPath: item.path,
      size: totalSize,
      downloadedAt: new Date().toISOString(),
      backend: detectBackend(item.name),
    };

    await addImageModel(newModel);
    discoveredModels.push(newModel);
  }

  return discoveredModels;
}

export async function scanForUntrackedTextModels(
  modelsDir: string,
  getModels: () => Promise<DownloadedModel[]>,
): Promise<DownloadedModel[]> {
  const discoveredModels: DownloadedModel[] = [];

  try {
    return await doScanForUntrackedTextModels(modelsDir, getModels);
  } catch {
    return discoveredModels;
  }
}

async function doScanForUntrackedTextModels(
  modelsDir: string,
  getModels: () => Promise<DownloadedModel[]>,
): Promise<DownloadedModel[]> {
  const discoveredModels: DownloadedModel[] = [];
  const registeredModels = await getModels();
  const registeredPaths = new Set(registeredModels.map(m => m.filePath));

  const dirExists = await RNFS.exists(modelsDir);
  if (!dirExists) return discoveredModels;

  const items = await RNFS.readDir(modelsDir);

  for (const item of items) {
    const lowerName = item.name.toLowerCase();
    const isMmProj = isMMProjFile(lowerName);
    if (!item.isFile() || !item.name.endsWith('.gguf') || registeredPaths.has(item.path) || isMmProj) {
      continue;
    }

    const fileSize = parseSizeInt(item.size);
    if (fileSize < 1_000_000) continue;

    const quantMatch = item.name.match(/[_-](Q\d+[_\w]*|f16|f32)/i);
    const quantization = quantMatch ? quantMatch[1].toUpperCase() : 'Unknown';

    const newModel: DownloadedModel = {
      id: `recovered_${item.name}_${Date.now()}`,
      name: item.name.replace(/\.gguf$/i, '').replace(/[_-]Q\d+.*/i, ''),
      author: 'Unknown',
      filePath: item.path,
      fileName: item.name,
      fileSize,
      quantization,
      downloadedAt: new Date().toISOString(),
      credibility: { source: 'community', isOfficial: false, isVerifiedQuantizer: false },
    };

    const models = await getModels();
    models.push(newModel);
    await saveModelsList(models);
    discoveredModels.push(newModel);
  }

  return discoveredModels;
}

export interface ImportLocalModelOpts {
  sourceUri: string;
  fileName: string;
  modelsDir: string;
  sourceSize?: number | null;
  onProgress?: (progress: { fraction: number; fileName: string }) => void;
  mmProjSourceUri?: string;
  mmProjFileName?: string;
  mmProjSourceSize?: number | null;
}

function resolveUri(uri: string): string {
  // Android content:// URIs are passed directly to RNFS.copyFile — no cache copy needed.
  // iOS file:// URIs need decoding (%20 → space) so RNFS can find the file on disk.
  if (uri.startsWith('content://')) {
    console.log('[IMPORT][scan] resolveUri — Android content:// URI, using as-is');
    console.log('[IMPORT][scan] uri:', uri);
    return uri;
  }
  const decoded = decodeURIComponent(uri);
  console.log('[IMPORT][scan] resolveUri — file URI, decoded');
  console.log('[IMPORT][scan] original:', uri);
  console.log('[IMPORT][scan] decoded: ', decoded);
  return decoded;
}


export async function importLocalModel(opts: ImportLocalModelOpts): Promise<DownloadedModel> { // NOSONAR
  const { sourceUri, fileName, modelsDir, sourceSize, onProgress, mmProjSourceUri, mmProjFileName, mmProjSourceSize } = opts;
  const importStart = Date.now();
  const elapsed = () => `+${Date.now() - importStart}ms`;

  console.log('[IMPORT][scan] ── importLocalModel START ──────────────────');
  console.log('[IMPORT][scan] Platform.OS:', Platform.OS);
  console.log('[IMPORT][scan] fileName:', fileName);
  console.log('[IMPORT][scan] sourceUri:', sourceUri);
  console.log('[IMPORT][scan] sourceSize:', sourceSize ?? 'unknown');
  console.log('[IMPORT][scan] mmProjFileName:', mmProjFileName ?? 'none');
  console.log('[IMPORT][scan] mmProjSourceUri:', mmProjSourceUri ?? 'none');
  console.log('[IMPORT][scan] mmProjSourceSize:', mmProjSourceSize ?? 'unknown');
  console.log('[IMPORT][scan] modelsDir:', modelsDir);

  // Heartbeat — logs every 3s so we can see exactly where it gets stuck
  let heartbeatStep = 'init';
  const heartbeat = setInterval(() => {
    console.log(`[IMPORT][scan] ⏱ HEARTBEAT — still running at ${elapsed()}, current step: ${heartbeatStep}`);
  }, 3000);

  if (!fileName.toLowerCase().endsWith('.gguf')) {
    clearInterval(heartbeat);
    console.log('[IMPORT][scan] ERROR — fileName does not end with .gguf:', fileName);
    throw new Error('Only .gguf files can be imported');
  }

  heartbeatStep = 'resolving URIs';
  const resolvedSource = resolveUri(sourceUri);
  const resolvedMmProjSource = mmProjSourceUri ? resolveUri(mmProjSourceUri) : undefined;
  console.log(`[IMPORT][scan] ${elapsed()} resolvedSource:`, resolvedSource);
  if (mmProjFileName) {
    console.log(`[IMPORT][scan] ${elapsed()} resolvedMmProjSource:`, resolvedMmProjSource ?? 'none');
  }

  try {
    heartbeatStep = 'checking dest paths';
    const destPath = `${modelsDir}/${fileName}`;
    console.log(`[IMPORT][scan] ${elapsed()} destPath:`, destPath);
    const destExists = await RNFS.exists(destPath);
    console.log(`[IMPORT][scan] ${elapsed()} dest already exists:`, destExists);
    if (destExists) throw new Error(`A model file named "${fileName}" already exists`);
    if (mmProjFileName && await RNFS.exists(`${modelsDir}/${mmProjFileName}`)) {
      throw new Error(`A file named "${mmProjFileName}" already exists`);
    }

    // Copy main model: progress 0→0.5 when mmproj present, 0→1 otherwise
    const mainProgressScale = mmProjFileName ? 0.5 : 1;
    heartbeatStep = 'copying main model';
    console.log(`[IMPORT][scan] ${elapsed()} Starting main model copy. sourceSize: ${sourceSize ?? 'unknown'} mainProgressScale: ${mainProgressScale}`);
    console.log(`[IMPORT][scan] ${elapsed()} copy FROM:`, resolvedSource);
    console.log(`[IMPORT][scan] ${elapsed()} copy TO:  `, destPath);
    const mainCopyStart = Date.now();
    await copyFileWithProgress(
      resolvedSource,
      destPath,
      sourceSize ?? null,
      onProgress ? (fraction) => onProgress({ fraction: fraction * mainProgressScale, fileName }) : undefined,
    );
    console.log(`[IMPORT][scan] ${elapsed()} Main model copy complete in ${Date.now() - mainCopyStart}ms`);

    const quantMatch = fileName.match(/[_-](Q\d+[_\w]*|f16|f32)/i);
    const quantization = quantMatch ? quantMatch[1].toUpperCase() : 'Unknown';
    const modelName = fileName.replace(/\.gguf$/i, '').replace(/[_-]Q\d+.*/i, '');
    const destStat = await RNFS.stat(destPath);
    const fileSize = parseSizeInt(destStat.size);
    console.log('[IMPORT][scan] modelName:', modelName, '| quantization:', quantization, '| fileSize:', fileSize, 'bytes');

    const pseudoFile: ModelFile = { name: fileName, size: fileSize, quantization, downloadUrl: '' };
    const model = await buildDownloadedModel({ modelId: 'local_import', file: pseudoFile, resolvedLocalPath: destPath });
    const builtModel: DownloadedModel = {
      ...model,
      id: `local_import/${fileName}`,
      name: modelName,
      author: 'Local Import',
      credibility: { source: 'community', isOfficial: false, isVerifiedQuantizer: false },
    };

    // Copy mmproj and link it to the model: progress 0.5→1
    if (mmProjFileName && resolvedMmProjSource) {
      const mmProjDestPath = `${modelsDir}/${mmProjFileName}`;
      heartbeatStep = 'copying mmproj';
      console.log(`[IMPORT][scan] ${elapsed()} Starting mmproj copy. mmProjSourceSize: ${mmProjSourceSize ?? 'unknown'}`);
      console.log(`[IMPORT][scan] ${elapsed()} copy FROM:`, resolvedMmProjSource);
      console.log(`[IMPORT][scan] ${elapsed()} copy TO:  `, mmProjDestPath);
      const mmProjCopyStart = Date.now();
      await copyFileWithProgress(
        resolvedMmProjSource,
        mmProjDestPath,
        mmProjSourceSize ?? null,
        onProgress
          ? (fraction) => onProgress({ fraction: 0.5 + fraction * 0.5, fileName: mmProjFileName })
          : undefined,
      );
      console.log(`[IMPORT][scan] ${elapsed()} mmproj copy complete in ${Date.now() - mmProjCopyStart}ms`);
      const mmProjStat = await RNFS.stat(mmProjDestPath);
      builtModel.mmProjPath = mmProjDestPath;
      builtModel.mmProjFileName = mmProjFileName;
      builtModel.mmProjFileSize = parseSizeInt(mmProjStat.size);
      builtModel.isVisionModel = true;
      console.log(`[IMPORT][scan] ${elapsed()} mmproj linked. mmProjFileSize:`, builtModel.mmProjFileSize, 'bytes');
    }

    heartbeatStep = 'persisting metadata';
    console.log(`[IMPORT][scan] ${elapsed()} Persisting model metadata...`);
    await persistDownloadedModel(builtModel, modelsDir);
    console.log(`[IMPORT][scan] ${elapsed()} ── importLocalModel COMPLETE. id: ${builtModel.id} ──`);
    return builtModel;
  } catch (e) {
    console.log(`[IMPORT][scan] ${elapsed()} ❌ importLocalModel ERROR:`, e);
    throw e;
  } finally {
    clearInterval(heartbeat);
  }
}

async function copyFileWithProgress(
  source: string,
  dest: string,
  knownTotalBytes: number | null,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const copyStart = Date.now();
  const copyElapsed = () => `+${Date.now() - copyStart}ms`;
  const totalBytes = knownTotalBytes ?? 0;
  const totalMB = totalBytes > 0 ? (totalBytes / 1024 / 1024).toFixed(1) : '?';

  console.log(`[IMPORT][scan] copyFileWithProgress START — knownTotalBytes: ${knownTotalBytes ?? 'unknown'} (${totalMB} MB)`);
  console.log('[IMPORT][scan] FROM:', source);
  console.log('[IMPORT][scan] TO:  ', dest);
  if (!knownTotalBytes) {
    console.log('[IMPORT][scan] No known size — progress will be indeterminate');
  }

  let polling = true;
  let lastWritten = 0;

  const pollInterval = setInterval(async () => {
    if (!polling) return;
    try {
      const exists = await RNFS.exists(dest);
      if (exists) {
        const stat = await RNFS.stat(dest);
        const written = parseSizeInt(stat.size);
        const writtenMB = (written / 1024 / 1024).toFixed(1);
        const delta = written - lastWritten;
        const speedMBs = ((delta / 1024 / 1024) / 0.5).toFixed(1);
        lastWritten = written;
        if (totalBytes > 0) {
          const pct = Math.min(written / totalBytes, 0.99);
          console.log(`[IMPORT][scan] ${copyElapsed()} copy poll — ${writtenMB}/${totalMB} MB (${(pct * 100).toFixed(1)}%) speed: ${speedMBs} MB/s`);
          onProgress?.(pct);
        } else {
          console.log(`[IMPORT][scan] ${copyElapsed()} copy poll — ${writtenMB} MB written (size unknown) speed: ${speedMBs} MB/s`);
          // No fraction available — don't call onProgress so UI stays indeterminate
        }
      } else {
        console.log(`[IMPORT][scan] ${copyElapsed()} copy poll — dest not created yet`);
      }
    } catch (e) {
      console.log(`[IMPORT][scan] ${copyElapsed()} copy poll error:`, e);
    }
  }, 500);

  try {
    console.log(`[IMPORT][scan] ${copyElapsed()} calling RNFS.copyFile...`);
    await RNFS.copyFile(source, dest);
    polling = false;
    clearInterval(pollInterval);
    console.log(`[IMPORT][scan] ${copyElapsed()} RNFS.copyFile resolved — 100% done`);
    onProgress?.(1);
  } catch (error) {
    polling = false;
    clearInterval(pollInterval);
    console.log(`[IMPORT][scan] ${copyElapsed()} RNFS.copyFile FAILED:`, error);
    await RNFS.unlink(dest).catch(() => {});
    throw error;
  }
}
