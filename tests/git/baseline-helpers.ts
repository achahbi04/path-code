/**
 * Shared helpers for Phase 2C Git state baseline tests.
 *
 * Git fixtures live outside the Path Code worktree via createCanonicalTempRoot.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { expect } from "vitest";

import { loadProjectConfig } from "../../src/config/index.js";
import type { ResolvedProjectConfig } from "../../src/config/types.js";
import {
  collectGitStateBaseline,
  type GitEntryAnnotation,
  type GitStateBaseline,
} from "../../src/git/index.js";
import { inventory } from "../../src/inventory/index.js";
import type { RepositoryInventory } from "../../src/inventory/types.js";
import type { WorkspaceBoundary } from "../../src/domain/workspace.js";
import { createWorkspaceBoundary } from "../../src/workspace/index.js";
import { createCanonicalTempRoot } from "./fixture-helpers.js";

export { createCanonicalTempRoot };

export async function writeRelative(
  root: string,
  relativePath: string,
  content = "content\n",
): Promise<void> {
  const absolute = path.join(root, relativePath);
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(path.dirname(absolute), { recursive: true }),
  );
  await writeFile(absolute, content, "utf8");
}

export async function writeDenyConfig(
  root: string,
  denyPaths: readonly string[],
): Promise<void> {
  const lines = denyPaths.map((value) => `deny-path = ${value}`).join("\n");
  await writeFile(
    path.join(root, "PATHCODE.md"),
    `# Config\n\n\`\`\`pathcode-config\n${lines}\n\`\`\`\n`,
    "utf8",
  );
}

export async function boundaryFor(root: string): Promise<WorkspaceBoundary> {
  const boundary = await createWorkspaceBoundary(root);
  expect(boundary.ok).toBe(true);
  if (!boundary.ok) {
    throw new Error("expected workspace boundary");
  }
  return boundary.value;
}

export async function resolvedConfigAt(root: string): Promise<ResolvedProjectConfig> {
  const loaded = await loadProjectConfig(await boundaryFor(root));
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) {
    throw new Error("expected resolved configuration");
  }
  return loaded.value;
}

export async function inventoryAt(
  root: string,
  config?: ResolvedProjectConfig,
  options?: Parameters<typeof inventory>[2],
): Promise<RepositoryInventory> {
  const resolved = config ?? (await resolvedConfigAt(root));
  const result = await inventory(await boundaryFor(root), resolved, options);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`expected inventory success: ${result.error.code}`);
  }
  return result.value;
}

export type BaselineFixture = {
  readonly root: string;
  readonly workspace: WorkspaceBoundary;
  readonly config: ResolvedProjectConfig;
  readonly inventory: RepositoryInventory;
  readonly baseline: GitStateBaseline;
};

export async function baselineAt(
  root: string,
  options?: Parameters<typeof inventory>[2],
): Promise<BaselineFixture> {
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const inv = await inventoryAt(root, config, options);
  const result = await collectGitStateBaseline(workspace, inv, config);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`expected baseline success: ${result.error.code}`);
  }
  return {
    root,
    workspace,
    config,
    inventory: inv,
    baseline: result.value,
  };
}

export function annotationFor(
  baseline: GitStateBaseline,
  relativePath: string,
): GitEntryAnnotation | undefined {
  return baseline.annotations.find(
    (annotation) => annotation.entry.relativePath === relativePath,
  );
}

export function admittedInventoryEntry(
  inventory: RepositoryInventory,
  relativePath: string,
) {
  const observation = inventory.observations.find(
    (item) =>
      item.relativePath === relativePath &&
      (item.disposition === "ADMITTED" ||
        item.disposition === "DESCENDED" ||
        item.disposition === "DEPTH_LIMIT_REACHED"),
  );
  if (
    observation &&
    (observation.disposition === "ADMITTED" ||
      observation.disposition === "DESCENDED" ||
      observation.disposition === "DEPTH_LIMIT_REACHED")
  ) {
    return observation.entry;
  }
  return undefined;
}

export function allObservations(baseline: GitStateBaseline) {
  return [
    ...baseline.annotations.map((annotation) => annotation.observation),
    ...baseline.unmappedVisibleObservations.map((item) => item.observation),
  ];
}
