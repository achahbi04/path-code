export type ProductVersion = {
  adoptionIndex: number;
  sha: string | null;
  current: boolean;
  git: { resolvable: boolean; reason: "invalid_sha" | "commit_unavailable" | null };
  adoptedAt: string | null;
  taskId: string | null;
  actionId: string | null;
  intentRevision: number | null;
  engine: string | null;
  resultId: string | null;
  sourceSha: string | null;
  parentSha: string | null;
  productBranch: string | null;
  mode: string | null;
  capability: string | null;
  capabilitySource: string | null;
  resultFingerprint: string | null;
  files: string[];
  recordedBuildMatches: boolean | null;
  recordedBindingMatches: boolean | null;
};
type CurrentProductVersion = { sha: string; adoptionIndex: number | null; git: ProductVersion["git"] };
type Failure = { ok: false; code: string; message: string };
export function listProductVersions(input: { runtimeRoot: string; buildId: string }): {
  ok: true; buildId: string; bindingId: string; projectRoot: string;
  current: CurrentProductVersion | null; versions: ProductVersion[];
} | Failure;
export function readProductVersion(input: { runtimeRoot: string; buildId: string; adoptionIndex: number }): {
  ok: true; buildId: string; bindingId: string; current: CurrentProductVersion | null; version: ProductVersion;
} | Failure;
export type ProductVersionSelector = { kind: "current" } | { kind: "adoption"; adoptionIndex: number };
export type ComparedProductVersion = { kind: "current" | "adoption"; adoptionIndex: number | null; sha: string | null; git: ProductVersion["git"] };
export type ProductVersionFileChange = {
  path: string; previousPath: string | null; status: string;
  additions: number | null; deletions: number | null; binary: boolean; statsKnown: boolean;
};
export function compareProductVersions(input: {
  runtimeRoot: string; buildId: string; base: ProductVersionSelector; target: ProductVersionSelector;
}): {
  ok: true; buildId: string; bindingId: string; base: ComparedProductVersion; target: ComparedProductVersion;
  files: ProductVersionFileChange[];
  summary: { changedFiles: number; additions: number | null; deletions: number | null; binaryFiles: number; statsComplete: boolean };
} | (Failure & { side?: "base" | "target"; sha?: string | null; reason?: string | null });
