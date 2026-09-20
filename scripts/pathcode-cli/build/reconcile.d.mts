export interface ReconciliationInput {
  child: {
    dispatchState?: string;
    dispatchedAt?: string;
    selectedAt?: string;
    classification?: string;
  } | null;
  cp: unknown;
  snap: unknown;
  reportText?: string;
  nowMs?: number;
  orphanAfterMs?: number;
}

export type ReconciliationDecision =
  | { action: "noop"; reason?: string }
  | { action: "mark_dispatched" }
  | {
      action: "mark_terminal_and_consume";
      classification: string;
      provider: string | null;
      engineMode: string | null;
      orphan?: boolean;
    }
  | { action: "wait"; reason: string };

export function isTaskTerminal(
  checkpoint: unknown,
  snapshot?: unknown,
  reportText?: string,
): boolean;
export function readTaskReportText(runtimeRoot: string, taskId: string): string;
export function extractProviderProvenance(
  checkpoint: unknown,
  snapshot?: unknown,
  reportText?: string,
): { provider: string | null; engineMode: string | null };
export function isOrphanDispatchedChild(input: ReconciliationInput): boolean;
export function decideChildReconciliation(
  input: ReconciliationInput,
): ReconciliationDecision;
export function loadChildTruth(
  runtimeRoot: string,
  taskId: string,
  gateway?: { snapshotTask?: (id: string) => unknown },
): { cp: unknown; snap: unknown; reportText: string };
