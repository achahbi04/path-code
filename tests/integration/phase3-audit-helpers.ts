/**
 * Shared helpers for Phase 3 Safe Editing Engine integration audit tests.
 *
 * All trusted artifacts are earned through the real public pipeline.
 * Temporary Git workspaces are bootstrapped without writing `.git/config`
 * (sandbox environments may EPERM that path); identity is supplied via `-c`.
 */

import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "vitest";

import { loadProjectConfig } from "../../src/config/loader.js";
import type { ResolvedProjectConfig } from "../../src/config/types.js";
import type { WorkspaceBoundary } from "../../src/domain/workspace.js";
import {
  authorizePreparedChange,
  createFile,
  createMultiFilePlan,
  executeMultiFilePlan,
  explicitEditApproval,
  prepareCreateFile,
  prepareModifyExistingFile,
  replaceExistingFile,
} from "../../src/editing/index.js";
import type {
  EditAuthorization,
  PreparedCreation,
  PreparedMutation,
} from "../../src/editing/index.js";
import { collectGitStateBaseline } from "../../src/git/index.js";
import type { GitStateBaseline } from "../../src/git/types.js";
import { inventory } from "../../src/inventory/index.js";
import type { RepositoryEntry, RepositoryInventory } from "../../src/inventory/types.js";
import { buildRepositoryMap } from "../../src/metadata/index.js";
import { readRepositoryContent } from "../../src/reader/index.js";
import type { ContentObservation } from "../../src/reader/types.js";
import { buildRepositorySearchCorpus } from "../../src/search/index.js";
import {
  buildRepositorySnapshot,
  verifyRepositorySnapshot,
} from "../../src/snapshot/index.js";
import {
  boundaryFor,
  createCanonicalTempRoot,
  writeRelative,
} from "../inventory/fixture-helpers.js";
import { fixtureGit } from "../git/fixture-helpers.js";

export type AuditFixture = {
  readonly root: string;
  readonly workspace: WorkspaceBoundary;
  readonly config: ResolvedProjectConfig;
};

const GIT_IDENTITY_ARGS = [
  "-c",
  "user.email=pathcode-audit@example.com",
  "-c",
  "user.name=Path Code Audit",
  "-c",
  "commit.gpgsign=false",
] as const;

/**
 * Bootstrap a disposable Git worktree without writing `.git/config`.
 * Cursor sandboxes often EPERM `.git/config`; `-c` flags supply identity.
 */
export async function initAuditGitWorktree(root: string): Promise<void> {
  await mkdir(join(root, ".git/objects/info"), { recursive: true });
  await mkdir(join(root, ".git/objects/pack"), { recursive: true });
  await mkdir(join(root, ".git/refs/heads"), { recursive: true });
  await mkdir(join(root, ".git/refs/tags"), { recursive: true });
  await writeFile(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
  await writeFile(join(root, "README.md"), "audit-init\n");
  await fixtureGit(root, [...GIT_IDENTITY_ARGS, "add", "README.md"]);
  await fixtureGit(root, [
    ...GIT_IDENTITY_ARGS,
    "commit",
    "--no-gpg-sign",
    "-m",
    "audit-init",
  ]);
}

export async function writePathcodeConfig(
  root: string,
  fenceBody: string,
): Promise<void> {
  await writeFile(
    join(root, "PATHCODE.md"),
    `# Config\n\n\`\`\`pathcode-config\n${fenceBody}\n\`\`\`\n`,
    "utf8",
  );
}

export async function openAuditFixture(root: string): Promise<AuditFixture> {
  const workspace = await boundaryFor(root);
  const loaded = await loadProjectConfig(workspace);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) {
    throw new Error(`config load failed: ${loaded.error.code}`);
  }
  return { root, workspace, config: loaded.value };
}

export async function withAuditFixture(prefix: string): Promise<AuditFixture> {
  const root = await createCanonicalTempRoot(prefix);
  await writePathcodeConfig(root, "");
  return openAuditFixture(root);
}

export async function withGitAuditFixture(prefix: string): Promise<AuditFixture> {
  const root = await createCanonicalTempRoot(prefix);
  await writePathcodeConfig(root, "");
  await initAuditGitWorktree(root);
  return openAuditFixture(root);
}

export function admittedFileEntry(
  inv: RepositoryInventory,
  relativePath: string,
): RepositoryEntry {
  const observation = inv.observations.find(
    (item) =>
      item.relativePath === relativePath && item.disposition === "ADMITTED",
  );
  if (observation?.disposition !== "ADMITTED") {
    throw new Error(`missing admitted file ${relativePath}`);
  }
  return observation.entry;
}

export function admittedDirectoryEntry(
  inv: RepositoryInventory,
  relativePath: string,
): RepositoryEntry {
  const observation = inv.observations.find((item) => {
    if (item.disposition !== "ADMITTED" && item.disposition !== "DESCENDED") {
      return false;
    }
    return (
      item.relativePath === relativePath &&
      item.entry.physicalKind === "DIRECTORY"
    );
  });
  if (
    observation?.disposition !== "ADMITTED" &&
    observation?.disposition !== "DESCENDED"
  ) {
    throw new Error(`missing admitted directory ${relativePath}`);
  }
  return observation.entry;
}

export async function earnModify(
  fixture: AuditFixture,
  relativePath: string,
  before: string,
  after: string,
): Promise<{
  readonly prepared: PreparedMutation;
  readonly authorization: EditAuthorization;
}> {
  await writeRelative(fixture.root, relativePath, before);
  const inv = await inventory(fixture.workspace, fixture.config);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error(`inventory failed: ${inv.error.code}`);
  }
  const entry = admittedFileEntry(inv.value, relativePath);
  const prepared = await prepareModifyExistingFile(
    entry,
    Buffer.from(after),
    fixture.workspace,
    fixture.config,
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error(`prepare modify failed: ${prepared.error.code}`);
  }
  const auth = await authorizePreparedChange(
    prepared.value,
    explicitEditApproval(),
    fixture.config,
  );
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error(`authorize modify failed: ${auth.error.code}`);
  }
  return { prepared: prepared.value, authorization: auth.value };
}

export async function earnCreate(
  fixture: AuditFixture,
  parentRelative: string,
  leafName: string,
  content: string,
): Promise<{
  readonly prepared: PreparedCreation;
  readonly authorization: EditAuthorization;
}> {
  await mkdir(join(fixture.root, parentRelative), { recursive: true });
  const inv = await inventory(fixture.workspace, fixture.config);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error(`inventory failed: ${inv.error.code}`);
  }
  const parent = admittedDirectoryEntry(inv.value, parentRelative);
  const prepared = await prepareCreateFile(
    parent,
    leafName,
    Buffer.from(content),
    fixture.workspace,
    fixture.config,
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error(`prepare create failed: ${prepared.error.code}`);
  }
  const auth = await authorizePreparedChange(
    prepared.value,
    explicitEditApproval(),
    fixture.config,
  );
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error(`authorize create failed: ${auth.error.code}`);
  }
  return { prepared: prepared.value, authorization: auth.value };
}

export async function readContentObservation(
  entry: RepositoryEntry,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): Promise<ContentObservation> {
  const read = await readRepositoryContent(entry, workspace, config);
  expect(read.ok).toBe(true);
  if (!read.ok || read.value.status !== "READ") {
    throw new Error("expected READ content observation");
  }
  return read.value.observation;
}

export async function collectBaseline(
  fixture: AuditFixture,
  inv: RepositoryInventory,
): Promise<GitStateBaseline> {
  const baseline = await collectGitStateBaseline(
    fixture.workspace,
    inv,
    fixture.config,
  );
  expect(baseline.ok).toBe(true);
  if (!baseline.ok) {
    throw new Error(`git baseline failed: ${baseline.error.code}`);
  }
  return baseline.value;
}

export {
  inventory,
  loadProjectConfig,
  replaceExistingFile,
  createFile,
  createMultiFilePlan,
  executeMultiFilePlan,
  buildRepositoryMap,
  buildRepositorySearchCorpus,
  buildRepositorySnapshot,
  verifyRepositorySnapshot,
  readRepositoryContent,
  writeRelative,
  createCanonicalTempRoot,
};
