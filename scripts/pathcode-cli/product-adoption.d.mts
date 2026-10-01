export function adoptProductCommit(input: { projectRoot: string; sourceRef: string;
  expectedHeadSha?: string | null; expectedBranch?: string | null;
  expectedTreeSha?: string | null; fastForwardOnly?: boolean }): {
    ok: boolean; code?: string; message?: string; beforeSha?: string; adoptedSha?: string;
  };
