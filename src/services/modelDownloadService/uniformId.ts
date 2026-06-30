import type { ModelType } from '../../stores/downloadStore';

/**
 * The ONE rule for the uniform id the ModelDownloadService routes cancel/retry/remove
 * on. Both sides MUST derive the id through this function so they can never diverge:
 *
 *  - the providers' `list()` assigns each download this id, and
 *  - the Download Manager's action dispatch (`idOf`) re-derives it to route on.
 *
 * The bug this prevents: STT store rows are keyed `whisper-<id>` (e.g.
 * `whisper-medium.en`), but `whisperService` keys models by the bare id
 * (`medium.en`). The provider stripped the prefix when listing (`stt:medium.en`)
 * while the View re-derived `stt:whisper-medium.en` from the raw store modelId — so
 * the service's lookup missed and Remove/Cancel/Retry silently no-opped
 * (`[DL-SM] … REFUSED: not found`). Every other type passes the modelId through
 * unchanged; only STT normalizes, and it normalizes HERE, once.
 */
export function uniformDownloadId(modelType: ModelType, modelId: string): string {
  // Per-type canonicalization, owned HERE so the providers' list() and the View's
  // dispatch can't drift. Both are idempotent (safe whether given the bare id or the
  // prefixed store id): STT store rows are `whisper-<id>` but whisperService keys by
  // the bare id; image store rows carry an `image:` prefix the provider strips.
  let canonical = modelId;
  if (modelType === 'stt') canonical = modelId.replace(/^whisper-/, '');
  else if (modelType === 'image') canonical = modelId.replace(/^image:/, '');
  return `${modelType}:${canonical}`;
}
