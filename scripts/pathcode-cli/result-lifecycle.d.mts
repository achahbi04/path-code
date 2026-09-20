import type { TaskCheckpoint } from "./ag10/task-checkpoint.mjs";

export interface ResultLifecycle {
  status: string | null;
  discardedAt: string | null;
  mergedAt: string | null;
  prUrl: string | null;
  prNumber: number | null;
  prRemote: string | null;
  prBase: string | null;
  updatedAt: string | null;
}

export function readLifecycleFromCheckpoint(
  checkpoint: TaskCheckpoint | null,
): ResultLifecycle;
export function adoptTaskResult(options: {
  runtimeRoot: string;
  projectRoot: string;
  sourceRef?: string;
  requireAdoptable?: boolean;
  entry: {
    taskId: string;
    branch?: string;
    sha?: string;
    changedFiles?: string[];
    worktreePath?: string;
    lifecycleStatus?: string;
  };
}): {
  ok: boolean;
  code?: string;
  message?: string;
  adoptedSha?: string;
  sourceSha?: string;
};
