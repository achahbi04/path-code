import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect } from "vitest";

import { loadProjectConfig } from "../../src/config/index.js";
import type { ResolvedProjectConfig } from "../../src/config/types.js";
import { inventory } from "../../src/inventory/index.js";
import type {
  InventoryObservation,
  RepositoryInventory,
} from "../../src/inventory/index.js";
import { createWorkspaceBoundary } from "../../src/workspace/index.js";

const fixtures: string[] = [];

export async function createCanonicalTempRoot(prefix: string): Promise<string> {
  const lexical = await mkdtemp(path.join(tmpdir(), prefix));
  const physical = await realpath(lexical);
  fixtures.push(physical);
  return physical;
}

export async function cleanupInventoryFixtures(): Promise<void> {
  while (fixtures.length > 0) {
    const dir = fixtures.pop();
    if (dir === undefined) {
      continue;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

export async function boundaryFor(root: string) {
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

export function observationPaths(
  observations: readonly InventoryObservation[],
): string[] {
  return observations.map((observation) => observation.relativePath);
}

export function hasDisposition(
  observations: readonly InventoryObservation[],
  relativePath: string,
  disposition: InventoryObservation["disposition"],
): boolean {
  return observations.some(
    (observation) =>
      observation.relativePath === relativePath &&
      observation.disposition === disposition,
  );
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

export async function mkdirp(relativeDir: string, root: string): Promise<string> {
  const absolute = path.join(root, relativeDir);
  await mkdir(absolute, { recursive: true });
  return absolute;
}

export async function writeRelative(
  root: string,
  relativePath: string,
  content = "content\n",
): Promise<void> {
  const absolute = path.join(root, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

export async function makeUnreadableDir(relativeDir: string, root: string): Promise<void> {
  if (process.getuid?.() === 0) {
    return;
  }
  const absolute = await mkdirp(relativeDir, root);
  await chmod(absolute, 0o000);
}
