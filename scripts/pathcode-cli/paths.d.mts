export const HOME_BINDING_GUARD: { enabled: boolean };

export function looksLikeExistingProject(dir: string): boolean;
export function assertAllowedProjectRoot(
  candidate: string,
  options?: { home?: string },
):
  | { ok: true; projectRoot: string }
  | {
      ok: false;
      code: string;
      message: string;
      projectRoot: string;
    };
export function resolvePathPackageRoot(): string;
export function resolveCheckoutRoot(): string;
export function readPathPackageVersion(packageRoot?: string): string;
export function resolvePathRuntimeRoot(options?: {
  home?: string;
  packageRoot?: string;
}): string;
export function resolveTargetProjectRoot(cwd?: string):
  | {
      ok: true;
      projectRoot: string;
      gitRepositoryRoot: string | null;
      workingSubdir: string;
      invocationCwd: string;
      gitDir: string | null;
      unversioned: boolean;
    }
  | { ok: false; code: string; message: string };
export function resolveEngineeringCwd(
  worktreePath: string,
  workingSubdir?: string,
): string;
export function resolveRuntimePrerequisites(root?: string):
  | {
      ok: true;
      root: string;
      tscJs: string;
      distEntry: string;
    }
  | { ok: false; code: string; message: string };
export function assertPathPackagePresent(root?: string):
  | { ok: true; root: string }
  | { ok: false; code: string; message: string };
export function distHref(relativeFromDist: string, root?: string): string;
