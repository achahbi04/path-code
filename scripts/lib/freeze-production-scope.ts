/**
 * Pass-scoped TWO_COMMIT_FREEZE production surface validation.
 */

import type { CapabilityRecord } from "../../src/selfobs/capability-types.js";
import type { TwoCommitFreezeEvidence } from "../../src/selfobs/types.js";
import { MAX_PRODUCTION_SCOPES_PER_FREEZE } from "../../src/selfobs/capability-types.js";

import { gitDiffNameOnlyUnderPrefix } from "./git-readonly.js";
import { assertExactFullSha, assertSafeRepoRelativePath } from "./path-safety.js";

export type ScopeContaminationFailure = Readonly<{
  readonly code: string;
  readonly message: string;
}>;

export const MAX_PRODUCTION_SCOPE_LENGTH = 256;

export function normalizeProductionScope(scope: string): string {
  const trimmed = scope.trim();
  if (trimmed.length === 0) {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function assertProductionScope(scope: string, label: string): string {
  const normalized = normalizeProductionScope(scope);
  if (normalized.length === 0) {
    throw new Error(`${label}: empty production scope`);
  }
  if (normalized.length > MAX_PRODUCTION_SCOPE_LENGTH) {
    throw new Error(`${label}: production scope too long`);
  }
  if (normalized.includes("\0")) {
    throw new Error(`${label}: NUL byte in production scope`);
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`${label}: absolute production scope rejected`);
  }
  const withoutTrailing = normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
  assertSafeRepoRelativePath(withoutTrailing, label);
  if (!normalized.startsWith("src/")) {
    throw new Error(`${label}: production scope must be under src/`);
  }
  return normalized;
}

export function assertProductionScopes(
  scopes: readonly string[],
  label = "productionScopes",
): readonly string[] {
  if (scopes.length === 0) {
    throw new Error(`${label}: at least one production scope is required`);
  }
  if (scopes.length > MAX_PRODUCTION_SCOPES_PER_FREEZE) {
    throw new Error(`${label}: exceeds maximum scope count`);
  }
  return scopes.map((scope, index) =>
    assertProductionScope(scope, `${label}[${index}]`),
  );
}

export function modulePathUnderProductionScope(
  modulePath: string,
  scope: string,
): boolean {
  assertSafeRepoRelativePath(modulePath, "modulePath");
  const normalizedScope = normalizeProductionScope(scope);
  if (normalizedScope.length === 0) {
    return false;
  }
  const exactDir = normalizedScope.slice(0, -1);
  return modulePath === exactDir || modulePath.startsWith(normalizedScope);
}

export function modulePathUnderAnyProductionScope(
  modulePath: string,
  scopes: readonly string[],
): boolean {
  return scopes.some((scope) => modulePathUnderProductionScope(modulePath, scope));
}

export function validateImplementationModulesUnderProductionScopes(
  record: CapabilityRecord,
  freeze: TwoCommitFreezeEvidence,
  scopes: readonly string[],
): string | undefined {
  assertExactFullSha(freeze.implementationCommit, "implementationCommit");
  for (const citation of record.implementationEvidence) {
    if (citation.atCommit !== freeze.implementationCommit) {
      return `${record.capabilityId}: implementation module ${citation.path} cites ${citation.atCommit}, expected ${freeze.implementationCommit}`;
    }
    if (!modulePathUnderAnyProductionScope(citation.path, scopes)) {
      return `${record.capabilityId}: implementation module ${citation.path} is outside declared productionScopes`;
    }
  }
  return undefined;
}

export async function verifyProductionScopeContamination(
  repoRoot: string,
  implementationCommit: string,
  evidenceCommit: string,
  scopes: readonly string[],
  capabilityId: string,
): Promise<ScopeContaminationFailure | undefined> {
  assertExactFullSha(implementationCommit, "implementationCommit");
  assertExactFullSha(evidenceCommit, "evidenceCommit");

  for (const scope of scopes) {
    const changedPaths = await gitDiffNameOnlyUnderPrefix(
      repoRoot,
      implementationCommit,
      evidenceCommit,
      scope,
    );
    if (changedPaths.length > 0) {
      return {
        code: "FREEZE_PRODUCTION_SCOPE_CHANGED",
        message: `${capabilityId}: production scope ${scope} changed between ${implementationCommit} and ${evidenceCommit}: ${changedPaths.join(", ")}`,
      };
    }
  }
  return undefined;
}
