import { afterEach, describe, expect, it } from "vitest";

import { collectGitStateBaseline } from "../../src/git/index.js";
import { canonicalInventoryEntrySet, inventory, repositoryEntries } from "../../src/inventory/index.js";
import { buildRepositoryMap } from "../../src/metadata/index.js";
import { buildRepositorySearchCorpus } from "../../src/search/corpus.js";
import { buildRepositorySnapshot } from "../../src/snapshot/index.js";
import {
  cleanupGitFixtures,
  fixtureGit,
  initCommitWorktree,
} from "../git/fixture-helpers.js";
import {
  boundaryFor,
  cleanupInventoryFixtures,
  createCanonicalTempRoot,
  resolvedConfigAt,
  writeRelative,
} from "../inventory/fixture-helpers.js";
import { contentObservationsFromMap } from "../snapshot/helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
  await cleanupGitFixtures();
});

async function nestedGitFixture() {
  const root = await createCanonicalTempRoot("h1-nested-");
  await writeRelative(root, "src/example.ts", "export const example = true;\n");
  await initCommitWorktree(root);
  await fixtureGit(root, ["add", "src/example.ts"]);
  await fixtureGit(root, ["commit", "-m", "add nested example"]);

  const workspace = await boundaryFor(root);
  const config = await resolvedConfigAt(root);
  const inv = await inventory(workspace, config);
  expect(inv.ok).toBe(true);
  if (!inv.ok) {
    throw new Error("inventory failed");
  }
  const gitBaseline = await collectGitStateBaseline(workspace, inv.value, config);
  expect(gitBaseline.ok).toBe(true);
  if (!gitBaseline.ok) {
    throw new Error("git baseline failed");
  }
  return {
    root,
    workspace,
    config,
    inventory: inv.value,
    gitBaseline: gitBaseline.value,
  };
}

describe("Phase 2G-H1 cross-component membership", () => {
  it("binds nested Git baseline into snapshot from the same inventory", async () => {
    const fixture = await nestedGitFixture();
    const map = await buildRepositoryMap(
      fixture.workspace,
      fixture.inventory,
      fixture.config,
    );
    expect(map.ok).toBe(true);
    if (!map.ok) {
      return;
    }
    const corpus = buildRepositorySearchCorpus(fixture.inventory, map.value);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) {
      return;
    }
    const snapshot = buildRepositorySnapshot({
      workspace: fixture.workspace,
      config: fixture.config,
      inventory: fixture.inventory,
      repositoryMap: map.value,
      searchCorpus: corpus.value,
      gitBaseline: fixture.gitBaseline,
      contentObservations: contentObservationsFromMap(map.value),
    });
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) {
      throw new Error(`${snapshot.error.code} ${snapshot.error.message}`);
    }
    expect(snapshot.value.gitBaseline).toBe(fixture.gitBaseline);
  });

  it("rejects Git baseline from a foreign inventory even with identical lexical paths", async () => {
    const rootA = await createCanonicalTempRoot("h1-foreign-a-");
    const rootB = await createCanonicalTempRoot("h1-foreign-b-");
    await writeRelative(rootA, "same.txt", "same\n");
    await writeRelative(rootB, "same.txt", "same\n");
    await initCommitWorktree(rootA);
    await initCommitWorktree(rootB);
    await fixtureGit(rootA, ["add", "same.txt"]);
    await fixtureGit(rootA, ["commit", "-m", "a"]);
    await fixtureGit(rootB, ["add", "same.txt"]);
    await fixtureGit(rootB, ["commit", "-m", "b"]);

    const workspaceA = await boundaryFor(rootA);
    const configA = await resolvedConfigAt(rootA);
    const invA = await inventory(workspaceA, configA);
    expect(invA.ok).toBe(true);
    if (!invA.ok) {
      return;
    }

    const workspaceB = await boundaryFor(rootB);
    const configB = await resolvedConfigAt(rootB);
    const invB = await inventory(workspaceB, configB);
    expect(invB.ok).toBe(true);
    if (!invB.ok) {
      return;
    }
    const gitB = await collectGitStateBaseline(workspaceB, invB.value, configB);
    expect(gitB.ok).toBe(true);
    if (!gitB.ok) {
      return;
    }

    const mapA = await buildRepositoryMap(workspaceA, invA.value, configA);
    expect(mapA.ok).toBe(true);
    if (!mapA.ok) {
      return;
    }
    const corpusA = buildRepositorySearchCorpus(invA.value, mapA.value);
    expect(corpusA.ok).toBe(true);
    if (!corpusA.ok) {
      return;
    }

    const snapshot = buildRepositorySnapshot({
      workspace: workspaceA,
      config: configA,
      inventory: invA.value,
      repositoryMap: mapA.value,
      searchCorpus: corpusA.value,
      gitBaseline: gitB.value,
    });
    expect(snapshot.ok).toBe(false);
    if (!snapshot.ok) {
      expect(snapshot.error.code).toBe("SNAPSHOT_ARTIFACTS_INCOMPATIBLE");
    }
  });

  it("uses canonical membership for Git annotations, map entries, and search corpus authority", async () => {
    const fixture = await nestedGitFixture();
    const canonical = canonicalInventoryEntrySet(fixture.inventory);

    for (const annotation of fixture.gitBaseline.annotations) {
      expect(canonical.has(annotation.entry)).toBe(true);
    }

    const map = await buildRepositoryMap(
      fixture.workspace,
      fixture.inventory,
      fixture.config,
    );
    expect(map.ok).toBe(true);
    if (!map.ok) {
      return;
    }
    for (const mapEntry of map.value.entries) {
      expect(canonical.has(mapEntry.entry)).toBe(true);
    }

    const corpus = buildRepositorySearchCorpus(fixture.inventory, map.value);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) {
      return;
    }
    for (const entry of corpus.value.admittedEntries) {
      expect(canonical.has(entry)).toBe(true);
    }
    expect(repositoryEntries(fixture.inventory).length).toBeGreaterThan(0);
  });
});
