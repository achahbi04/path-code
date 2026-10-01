export interface TaskCheckpoint {
  schema?: string;
  taskId: string;
  sessionId?: string;
  repoRoot?: string;
  worktreePath?: string;
  objective?: string;
  creatorReferenceBuildId?: string;
  referenceInputs?: object[];
  finalState?: string;
  validation?: { classification?: string; [key: string]: unknown };
  branch?: string;
  sha?: string;
  baseline?: string;
  changedFiles?: string[];
  modelPreferences?: Partial<Record<"cursor" | "copilot" | "antigravity", string>>;
  resultLifecycle?: {
    status?: string;
    discardedAt?: string | null;
    mergedAt?: string | null;
    prUrl?: string | null;
    prNumber?: number | null;
    prRemote?: string | null;
    prBase?: string | null;
    updatedAt?: string | null;
  };
  updatedAt?: string;
  [key: string]: unknown;
}

export function resolveCheckpointPath(runtimeRoot: string, taskId: string): string;
export function createCheckpointSkeleton(
  partial: TaskCheckpoint & { taskId: string; worktreePath: string },
): TaskCheckpoint;
export function writeTaskCheckpoint(
  runtimeRoot: string,
  checkpoint: TaskCheckpoint,
): string;
export function readTaskCheckpoint(
  runtimeRoot: string,
  taskId: string,
): TaskCheckpoint | null;
export function patchTaskCheckpoint(
  runtimeRoot: string,
  taskId: string,
  patch: Partial<TaskCheckpoint>,
): TaskCheckpoint;
