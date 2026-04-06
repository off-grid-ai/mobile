import RNFS from 'react-native-fs';
import { Alert } from 'react-native';
import { modelManager } from '../../services';
import { showAlert, AlertState } from '../../components/CustomAlert';
import { DownloadedModel } from '../../types';

export type GgufFileRef = { uri: string; name: string; size: number };

export type GgufImportDeps = {
  setAlertState: (s: AlertState) => void;
  setImportProgress: (p: { fraction: number; fileName: string } | null) => void;
  addDownloadedModel: (model: DownloadedModel) => void;
};

export function isMmProj(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes('mmproj') ||
    lower.includes('projector') ||
    (lower.includes('clip') && lower.endsWith('.gguf'))
  );
}

export function classifyGgufPair(
  file1: GgufFileRef,
  file2: GgufFileRef,
): { mainFile: GgufFileRef; mmProjFile: GgufFileRef } {
  if (isMmProj(file1.name)) return { mainFile: file2, mmProjFile: file1 };
  if (isMmProj(file2.name)) return { mainFile: file1, mmProjFile: file2 };
  if (file1.size > 0 && file2.size > 0) {
    return file1.size >= file2.size
      ? { mainFile: file1, mmProjFile: file2 }
      : { mainFile: file2, mmProjFile: file1 };
  }
  return { mainFile: file1, mmProjFile: file2 };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export async function importGgufFiles(
  files: Array<{ uri: string; name: string | null; size: number | null }>,
  deps: GgufImportDeps,
): Promise<void> {
  const { setAlertState, setImportProgress, addDownloadedModel } = deps;
  console.log('[IMPORT] importGgufFiles called with', files.length, 'file(s)');

  if (files.length === 1) {
    const resolvedFileName = files[0].name ?? 'unknown';
    console.log('[IMPORT] Single file import. uri:', files[0].uri, '| name:', JSON.stringify(files[0].name), '| resolvedFileName:', resolvedFileName, '| size:', files[0].size);
    const model = await modelManager.importLocalModel({
      sourceUri: files[0].uri,
      fileName: resolvedFileName,
      sourceSize: files[0].size,
      onProgress: p => {
        console.log(`[IMPORT] Progress: ${(p.fraction * 100).toFixed(1)}% — ${p.fileName}`);
        setImportProgress(p);
      },
    });
    console.log('[IMPORT] Single file import complete. model.name:', model.name, '| model.id:', model.id);
    addDownloadedModel(model);
    setAlertState(showAlert('Success', `${model.name} imported successfully!`));
    return;
  }

  const file1: GgufFileRef = { uri: files[0].uri, name: files[0].name ?? '', size: files[0].size ?? 0 };
  const file2: GgufFileRef = { uri: files[1].uri, name: files[1].name ?? '', size: files[1].size ?? 0 };
  console.log('[IMPORT] Two-file (vision) import.');
  console.log('[IMPORT] file1 — name:', JSON.stringify(file1.name), '| size:', file1.size, '| uri:', file1.uri);
  console.log('[IMPORT] file2 — name:', JSON.stringify(file2.name), '| size:', file2.size, '| uri:', file2.uri);
  console.log('[IMPORT] isMmProj(file1.name):', isMmProj(file1.name), '| isMmProj(file2.name):', isMmProj(file2.name));

  // Check if files exist RIGHT AFTER picker returns — before any dialog
  const file1ExistsBefore = await RNFS.exists(file1.uri.replace('file://', ''));
  const file2ExistsBefore = await RNFS.exists(file2.uri.replace('file://', ''));
  console.log('[IMPORT] FILE EXISTS CHECK (before dialog) — file1:', file1ExistsBefore, '| file2:', file2ExistsBefore);
  console.log('[IMPORT] file1 decoded path:', decodeURIComponent(file1.uri.replace('file://', '')));
  console.log('[IMPORT] file2 decoded path:', decodeURIComponent(file2.uri.replace('file://', '')));

  const { mainFile, mmProjFile } = classifyGgufPair(file1, file2);
  console.log('[IMPORT] Classification — mainFile:', mainFile.name, '| mmProjFile:', mmProjFile.name);

  const dialogOpenTime = Date.now();
  console.log('[IMPORT] Showing confirmation dialog at t=0ms');

  const confirmed = await new Promise<boolean>(resolve => {
    Alert.alert(
      'Import Vision Model?',
      `Main model:  ${mainFile.name}\nProjector:    ${mmProjFile.name}\n\nIf these look wrong, cancel and rename your files.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Import', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });

  const dialogDurationMs = Date.now() - dialogOpenTime;
  console.log('[IMPORT] Dialog closed after', dialogDurationMs, 'ms. confirmed:', confirmed);

  if (!confirmed) {
    console.log('[IMPORT] User cancelled vision model import confirmation.');
    return;
  }

  // Check if files STILL exist after dialog was dismissed — key check
  const mainExistsAfter = await RNFS.exists(decodeURIComponent(mainFile.uri.replace('file://', '')));
  const mmProjExistsAfter = await RNFS.exists(decodeURIComponent(mmProjFile.uri.replace('file://', '')));
  console.log('[IMPORT] FILE EXISTS CHECK (after dialog, before copy) — mainFile:', mainExistsAfter, '| mmProjFile:', mmProjExistsAfter);
  console.log('[IMPORT] mainFile path:', decodeURIComponent(mainFile.uri.replace('file://', '')));
  console.log('[IMPORT] mmProjFile path:', decodeURIComponent(mmProjFile.uri.replace('file://', '')));

  if (!mainExistsAfter || !mmProjExistsAfter) {
    console.log('[IMPORT] ⚠️ FILES GONE after dialog! iOS deleted temp inbox files during the', dialogDurationMs, 'ms dialog wait.');
    console.log('[IMPORT] This confirms the temp file eviction bug. Need keepLocalCopy() before dialog.');
  }

  console.log('[IMPORT] Vision import confirmed. Starting importLocalModel...');
  const model = await modelManager.importLocalModel({
    sourceUri: mainFile.uri,
    fileName: mainFile.name,
    sourceSize: mainFile.size,
    onProgress: p => {
      console.log(`[IMPORT] Vision progress: ${(p.fraction * 100).toFixed(1)}% — ${p.fileName}`);
      setImportProgress(p);
    },
    mmProjSourceUri: mmProjFile.uri,
    mmProjFileName: mmProjFile.name,
    mmProjSourceSize: mmProjFile.size,
  });
  console.log('[IMPORT] Vision import complete. model.name:', model.name, '| isVisionModel:', model.isVisionModel, '| mmProjPath:', model.mmProjPath);
  addDownloadedModel(model);
  setAlertState(showAlert('Success', `${model.name} imported with vision projector!`));
}
