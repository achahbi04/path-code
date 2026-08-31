/**
 * Shared helpers for Phase 2D metadata tests.
 */

import { expect } from "vitest";

import type { ResolvedProjectConfig } from "../../src/config/types.js";
import { collectGitStateBaseline } from "../../src/git/index.js";
import type { GitStateBaseline } from "../../src/git/types.js";
import { inventory } from "../../src/inventory/index.js";
import type { RepositoryInventory } from "../../src/inventory/types.js";
import {
  buildRepositoryMap,
  type MetadataOptions,
  type RepositoryMap,
} from "../../src/metadata/index.js";
import type { WorkspaceBoundary } from "../../src/domain/workspace.js";
import {
  boundaryFor,
  createCanonicalTempRoot,
  resolvedConfigAt,
  writeDenyConfig,
  writeRelative,
} from "../inventory/fixture-helpers.js";
import { initCommitWorktree } from "../git/fixture-helpers.js";

export {
  boundaryFor,
  createCanonicalTempRoot,
  resolvedConfigAt,
  writeDenyConfig,
  writeRelative,
  initCommitWorktree,
};

export async function mapAt(
  root: string,
  options?: MetadataOptions,
  inventoryOptions?: Parameters<typeof inventory>[2],
): Promise<{
  root: string;
  workspace: WorkspaceBoundary;
  config: ResolvedProjectConfig;
  inventory: RepositoryInventory;
  map: RepositoryMap;
  gitBaseline?: GitStateBaseline;
}> {
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const inv = await inventory(workspace, config, inventoryOptions);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error(`inventory failed: ${inv.error.code}`);
  }

  let gitBaseline: GitStateBaseline | undefined;
  if (options?.gitBaseline !== undefined) {
    gitBaseline = options.gitBaseline;
  }

  const result = await buildRepositoryMap(workspace, inv.value, config, options);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`map failed: ${result.error.code} ${result.error.message}`);
  }

  return {
    root,
    workspace,
    config,
    inventory: inv.value,
    map: result.value,
    ...(gitBaseline === undefined ? {} : { gitBaseline }),
  };
}

export async function writePackageJson(
  root: string,
  relativePath: string,
  content: Record<string, unknown>,
): Promise<void> {
  await writeRelative(root, relativePath, `${JSON.stringify(content, null, 2)}\n`);
}

export async function initGitRepo(root: string): Promise<void> {
  await initCommitWorktree(root);
}

export function claimsAtScope(map: RepositoryMap, scope: string) {
  return map.scopes.find((item) => item.scopeRelativePath === scope)?.identityClaims ?? [];
}

export function observedDeps(map: RepositoryMap, scope: string, packageName: string) {
  return claimsAtScope(map, scope).find(
    (claim) =>
      claim.confidence === "OBSERVED" &&
      claim.fact.kind === "DECLARED_PACKAGE_DEPENDENCY" &&
      claim.fact.packageName === packageName,
  );
}

export async function gitBaselineFor(
  root: string,
  inventoryOptions?: Parameters<typeof inventory>[2],
): Promise<GitStateBaseline> {
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const inv = await inventory(workspace, config, inventoryOptions);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error("inventory failed");
  }
  const baseline = await collectGitStateBaseline(workspace, inv.value, config);
  expect(baseline.ok).toBe(true);
  if (!baseline.ok) {
    throw new Error(`baseline failed: ${baseline.error.code}`);
  }
  return baseline.value;
}

export async function writePathCodeConfig(
  root: string,
  denyPaths: readonly string[],
): Promise<void> {
  await writeDenyConfig(root, denyPaths);
}
