/**
 * Shared helpers for Phase 2F snapshot / freshness tests.
 */

import { lstat } from "node:fs/promises";

import { expect } from "vitest";

import type { ResolvedProjectConfig } from "../../src/config/types.js";
import type { WorkspaceBoundary } from "../../src/domain/workspace.js";
import { collectGitStateBaseline } from "../../src/git/index.js";
import type { GitStateBaseline } from "../../src/git/types.js";
import { inventory } from "../../src/inventory/index.js";
import type { RepositoryEntry, RepositoryInventory } from "../../src/inventory/types.js";
import { buildRepositoryMap } from "../../src/metadata/index.js";
import type { RepositoryMap } from "../../src/metadata/types.js";
import { readRepositoryContent } from "../../src/reader/index.js";
import type { ContentObservation } from "../../src/reader/types.js";
import { buildRepositorySearchCorpus } from "../../src/search/corpus.js";
import type { RepositorySearchCorpus } from "../../src/search/types.js";
import {
  buildRepositorySnapshot,
  type EntryStatIdentity,
  type RepositorySnapshot,
} from "../../src/snapshot/index.js";
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

export function admittedEntry(
  inv: RepositoryInventory,
  relativePath: string,
): RepositoryEntry {
  const observation = inv.observations.find(
    (item) =>
      item.relativePath === relativePath && item.disposition === "ADMITTED",
  );
  if (observation?.disposition !== "ADMITTED") {
    throw new Error(`missing admitted entry: ${relativePath}`);
  }
  return observation.entry;
}

export function contentObservationsFromMap(map: RepositoryMap): ContentObservation[] {
  const observations: ContentObservation[] = [];
  for (const item of map.manifestObservations) {
    if ("observation" in item) {
      observations.push(item.observation);
    }
  }
  return observations;
}

export async function collectEntryStatIdentities(
  entries: readonly RepositoryEntry[],
): Promise<Map<RepositoryEntry, EntryStatIdentity>> {
  const identities = new Map<RepositoryEntry, EntryStatIdentity>();
  for (const entry of entries) {
    const stats = await lstat(entry.canonicalPath);
    identities.set(entry, { dev: stats.dev, ino: stats.ino });
  }
  return identities;
}

export async function readAdmittedContentObservation(
  entry: RepositoryEntry,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): Promise<ContentObservation> {
  const read = await readRepositoryContent(entry, workspace, config);
  expect(read.ok).toBe(true);
  if (!read.ok || read.value.status !== "READ") {
    throw new Error(`expected READ for ${entry.relativePath}`);
  }
  return read.value.observation;
}

export type SnapshotFixture = {
  root: string;
  workspace: WorkspaceBoundary;
  config: ResolvedProjectConfig;
  inventory: RepositoryInventory;
  map: RepositoryMap;
  corpus: RepositorySearchCorpus;
  gitBaseline?: GitStateBaseline;
  snapshot: RepositorySnapshot;
  contentObservations: ContentObservation[];
};

export async function snapshotAt(
  root: string,
  options?: {
    inventoryOptions?: Parameters<typeof inventory>[2];
    withGit?: boolean;
    extraContentPaths?: readonly string[];
    extraContentObservations?: readonly ContentObservation[];
  },
): Promise<SnapshotFixture> {
  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const inv = await inventory(workspace, config, options?.inventoryOptions);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error(`inventory failed: ${inv.error.code}`);
  }

  const mapResult = await buildRepositoryMap(workspace, inv.value, config);
  expect(mapResult.ok).toBe(true);
  if (!mapResult.ok) {
    throw new Error(`map failed: ${mapResult.error.code}`);
  }

  const corpusResult = buildRepositorySearchCorpus(inv.value, mapResult.value);
  expect(corpusResult.ok).toBe(true);
  if (!corpusResult.ok) {
    throw new Error(`corpus failed: ${corpusResult.error.code}`);
  }

  const contentObservations: ContentObservation[] = [
    ...contentObservationsFromMap(mapResult.value),
    ...(options?.extraContentObservations ?? []),
  ];

  const addObservation = (observation: ContentObservation): void => {
    if (!contentObservations.some((item) => item.entry === observation.entry)) {
      contentObservations.push(observation);
    }
  };

  for (const relativePath of options?.extraContentPaths ?? []) {
    const entry = admittedEntry(inv.value, relativePath);
    addObservation(await readAdmittedContentObservation(entry, workspace, config));
  }

  const admitted = inv.value.observations
    .filter((item) => item.disposition === "ADMITTED")
    .map((item) => item.entry);
  const entryStatIdentities = await collectEntryStatIdentities(admitted);

  let gitBaseline: GitStateBaseline | undefined;
  if (options?.withGit) {
    const baseline = await collectGitStateBaseline(workspace, inv.value, config);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) {
      throw new Error(`git baseline failed: ${baseline.error.code}`);
    }
    gitBaseline = baseline.value;
  }

  const snapshotResult = buildRepositorySnapshot({
    workspace,
    config,
    inventory: inv.value,
    repositoryMap: mapResult.value,
    searchCorpus: corpusResult.value,
    contentObservations,
    entryStatIdentities,
    ...(gitBaseline === undefined ? {} : { gitBaseline }),
  });
  expect(snapshotResult.ok).toBe(true);
  if (!snapshotResult.ok) {
    throw new Error(`snapshot failed: ${snapshotResult.error.code}`);
  }

  return {
    root,
    workspace,
    config,
    inventory: inv.value,
    map: mapResult.value,
    corpus: corpusResult.value,
    snapshot: snapshotResult.value,
    contentObservations,
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
