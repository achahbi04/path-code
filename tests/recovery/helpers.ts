/**
 * Shared helpers for Phase 6A recovery-floor tests.
 *
 * Workspaces and checkpoint stores always live in SEPARATE disposable temp
 * directories: a store inside the workspace it protects would be a defect, and
 * these helpers make that impossible to write by accident.
 */

import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect } from "vitest";

import type { ResolvedProjectConfig } from "../../src/config/types.js";
import type { WorkspaceBoundary } from "../../src/domain/workspace.js";
import {
  createRecoveryStore,
  loadCheckpoint,
  persistCheckpoint,
  prepareCheckpoint,
} from "../../src/recovery/index.js";
import type {
  Checkpoint,
  CheckpointTargetInput,
  RecoveryStore,
} from "../../src/recovery/types.js";
import {
  boundaryFor,
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  resolvedConfigAt,
  writeRelative,
} from "../inventory/fixture-helpers.js";

export { boundaryFor, createCanonicalTempRoot, resolvedConfigAt, writeRelative };

const storeRoots: string[] = [];

/** Disposable store root OUTSIDE any workspace fixture. */
export async function createStoreRoot(): Promise<string> {
  const lexical = await mkdtemp(path.join(tmpdir(), "phase6a-store-"));
  const physical = await realpath(lexical);
  storeRoots.push(physical);
  return physical;
}

export async function cleanupRecoveryFixtures(): Promise<void> {
  while (storeRoots.length > 0) {
    const dir = storeRoots.pop();
    if (dir === undefined) {
      continue;
    }
    await rm(dir, { recursive: true, force: true });
  }
  await cleanupInventoryFixtures();
}

export async function storeAt(rootDirectory: string): Promise<RecoveryStore> {
  const created = createRecoveryStore({ rootDirectory });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  return created.value;
}

export async function freshStore(): Promise<{
  store: RecoveryStore;
  rootDirectory: string;
}> {
  const rootDirectory = await createStoreRoot();
  return { store: await storeAt(rootDirectory), rootDirectory };
}

export type RecoveryFixture = {
  readonly root: string;
  readonly workspace: WorkspaceBoundary;
  readonly config: ResolvedProjectConfig;
  readonly store: RecoveryStore;
  readonly storeRoot: string;
};

/** Workspace with `src/hello.ts` plus any extra files, and a separate store. */
export async function recoveryFixture(options?: {
  readonly files?: ReadonlyArray<{ path: string; content: string }>;
}): Promise<RecoveryFixture> {
  const root = await createCanonicalTempRoot("phase6a-ws-");
  const files = options?.files ?? [
    { path: "src/hello.ts", content: "export function hello() { return 1; }\n" },
  ];
  for (const file of files) {
    await writeRelative(root, file.path, file.content);
  }
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const { store, rootDirectory } = await freshStore();
  expect(rootDirectory.startsWith(root)).toBe(false);
  return { root, workspace, config, store, storeRoot: rootDirectory };
}

export async function canonicalPathOf(
  workspace: WorkspaceBoundary,
  relativePath: string,
): Promise<string> {
  const canonical = await workspace.canonicalize(relativePath);
  expect(canonical.ok).toBe(true);
  if (!canonical.ok) {
    throw new Error(canonical.error.message);
  }
  return canonical.value;
}

export function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Persist a checkpoint built from explicit targets. */
export async function checkpointWith(input: {
  readonly workspace: WorkspaceBoundary;
  readonly store: RecoveryStore;
  readonly targets: readonly CheckpointTargetInput[];
  readonly sessionId?: string;
  readonly reviewId?: string;
}): Promise<Checkpoint> {
  const workspaceRoot = await input.workspace.canonicalize(".");
  expect(workspaceRoot.ok).toBe(true);
  if (!workspaceRoot.ok) {
    throw new Error(workspaceRoot.error.message);
  }
  const prepared = prepareCheckpoint({
    workspaceRoot: workspaceRoot.value,
    sessionId: input.sessionId ?? "session-test",
    reviewId: input.reviewId ?? "review-test",
    targets: input.targets,
  });
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error(prepared.error.message);
  }
  const persisted = await persistCheckpoint(prepared.value, input.store);
  expect(persisted.ok).toBe(true);
  if (!persisted.ok) {
    throw new Error(persisted.error.message);
  }
  return persisted.value;
}

/** Reopen a checkpoint through a brand-new store instance. */
export async function reopenCheckpoint(
  storeRoot: string,
  checkpointId: string,
): Promise<Checkpoint> {
  const reopened = await loadCheckpoint(await storeAt(storeRoot), checkpointId);
  expect(reopened.ok).toBe(true);
  if (!reopened.ok) {
    throw new Error(reopened.error.message);
  }
  return reopened.value;
}

export function checkpointDirectory(
  storeRoot: string,
  checkpointId: string,
): string {
  return path.join(storeRoot, "checkpoints", checkpointId);
}
