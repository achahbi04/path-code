export type RestoreResult = { ok: boolean; code?: string; message?: string; adoptedSha?: string;
  authoritativeSha?: string; operationId?: string; noOp?: boolean; deduped?: boolean;
  aborted?: boolean; skipped?: boolean; build?: object };
export function restoreHistoricalProductVersion(input: { runtimeRoot: string; buildId: string;
  adoptionIndex: number; expectedAuthoritativeSha: string }): RestoreResult;
export function recoverPendingHistoricalRestore(input: { runtimeRoot: string; buildId: string }): RestoreResult;
