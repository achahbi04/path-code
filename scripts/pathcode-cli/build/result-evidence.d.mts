export function gitCommitExists(projectRoot: string, rev: string): boolean;
export function listGitTreePaths(
  projectRoot: string,
  rev: string,
): string[] | null;
export function decideEngineerProductAdoption(input: {
  record?: object;
  child?: object;
  checkpoint?: object;
  projectRoot?: string;
  classification?: string;
  originSha?: string;
  reportText?: string;
}): {
  adopt: boolean;
  code: string;
  reason: string | null;
  capability: string;
  capabilitySource: string;
  sourceSha: string | null;
  taskBranch: string | null;
  fingerprint: string | null;
  recoveredProviderClose?: boolean;
  recoveredEmptyDiscovery?: boolean;
};
