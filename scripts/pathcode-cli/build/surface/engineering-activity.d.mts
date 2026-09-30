export interface ActivityStep {
  at: string | null;
  label: string;
  path: string | null;
  command: string | null;
}

export function projectEngineeringActivity(
  build: unknown,
  extras?: {
    projectRoot?: string;
    checkpoint?: unknown;
    traceLines?: object[];
    events?: object[];
    revisionDiff?: { sha?: string; summary?: string; files?: string[] };
  },
): {
  engine: string | null;
  steps: ActivityStep[];
  action: string | null;
  phase: string;
  label: string | null;
  adoptedSha: string | null;
  currentTask: { taskId: string | null; files: string[]; adoptedSha: string | null; engine: string | null; model: string };
  latestRevision: { taskId: string | null; sha: string | null; files: string[] } | null;
};
