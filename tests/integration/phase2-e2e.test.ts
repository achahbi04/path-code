/**
 * Phase 2G — Repository Intelligence end-to-end integration audit.
 *
 * Proves cross-layer composition using read-only production capabilities.
 * Test-fixture code may mutate the temporary workspace; Path Code production
 * modules perform no repository mutation in this flow.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { utimes } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { loadProjectConfig } from "../../src/config/index.js";
import { collectGitStateBaseline } from "../../src/git/index.js";
import { inventory } from "../../src/inventory/index.js";
import { hasDisposition } from "../inventory/fixture-helpers.js";
import { buildRepositorySearchCorpus, searchRepository } from "../../src/search/index.js";
import {
  buildRepositorySnapshot,
  verifyRepositorySnapshot,
} from "../../src/snapshot/index.js";
import {
  admittedEntry,
  collectEntryStatIdentities,
  contentObservationsFromMap,
  createCanonicalTempRoot,
  readAdmittedContentObservation,
  resolvedConfigAt,
  writeDenyConfig,
  writePackageJson,
  writeRelative,
} from "../snapshot/helpers.js";
import { buildRepositoryMap } from "../../src/metadata/index.js";
import { readRepositoryContent } from "../../src/reader/index.js";
import { boundaryFor, cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import {
  cleanupGitFixtures,
  fixtureGit,
  initCommitWorktree,
} from "../git/fixture-helpers.js";
import { annotationFor } from "../git/baseline-helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
  await cleanupGitFixtures();
});

async function buildIntegratedFixture(): Promise<string> {
  const root = await createCanonicalTempRoot("p2g-e2e-");
  await writeDenyConfig(root, ["denied"]);
  await writePackageJson(root, "package.json", {
    name: "phase2-demo",
    dependencies: { next: "14.0.0" },
  });
  await writeRelative(root, "src/auth.ts", "export const auth = ABCD;\n");
  await writeRelative(root, "denied/secret.txt", "secret\n");
  await writeFile(path.join(root, ".gitignore"), "ignored-but-visible.log\n");
  await writeRelative(root, "ignored-but-visible.log", "inventory-visible\n");
  await writeRelative(root, "tracked.txt", "tracked v1\n");
  await initCommitWorktree(root);
  await fixtureGit(root, ["add", "."]);
  await fixtureGit(root, ["commit", "-m", "add integrated fixture"]);
  await writeRelative(root, "tracked.txt", "tracked v2 modified\n");
  return root;
}

describe("Phase 2G E2E — Repository Intelligence integration", () => {
  it("composes config → inventory → git → reader → metadata → search → snapshot freshness", async () => {
    const root = await buildIntegratedFixture();
    const workspace = await boundaryFor(root);

    const loaded = await loadProjectConfig(workspace);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    const config = loaded.value;

    const inv = await inventory(workspace, config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    const repositoryInventory = inv.value;

    expect(hasDisposition(repositoryInventory.observations, ".git", "SYSTEM_PRUNED")).toBe(true);
    expect(
      hasDisposition(repositoryInventory.observations, "denied", "DENIED_BY_PROJECT_RESTRICTION"),
    ).toBe(true);
    expect(
      repositoryInventory.observations.some(
        (item) =>
          item.relativePath === "denied/secret.txt" && item.disposition === "ADMITTED",
      ),
    ).toBe(false);

    const ignoredEntry = admittedEntry(repositoryInventory, "ignored-but-visible.log");
    expect(ignoredEntry).toBeDefined();

    const gitBaseline = await collectGitStateBaseline(workspace, repositoryInventory, config);
    expect(gitBaseline.ok).toBe(true);
    if (!gitBaseline.ok) {
      return;
    }
    const ignoredAnnotation = annotationFor(gitBaseline.value, "ignored-but-visible.log");
    expect(ignoredAnnotation?.entry).toBe(ignoredEntry);
    expect(ignoredAnnotation?.observation.state).toEqual({ kind: "IGNORED" });
    expect(gitBaseline.value.provenance).toBe("PRE_EXISTING");
    expect(
      gitBaseline.value.annotations.every(
        (item) => item.observation.provenance === "PRE_EXISTING",
      ),
    ).toBe(true);
    expect(
      gitBaseline.value.annotations.some(
        (item) => item.observation.provenance === "PATH_CODE_MODIFIED",
      ),
    ).toBe(false);

    const trackedAnnotation = annotationFor(gitBaseline.value, "tracked.txt");
    expect(trackedAnnotation?.entry).toBe(admittedEntry(repositoryInventory, "tracked.txt"));
    expect(trackedAnnotation?.observation.state.kind).toBe("TRACKED");
    if (trackedAnnotation?.observation.state.kind === "TRACKED") {
      expect(trackedAnnotation.observation.state.worktreeState).toBe("MODIFIED");
    }

    const authEntry = admittedEntry(repositoryInventory, "src/auth.ts");
    const authRead = await readRepositoryContent(authEntry, workspace, config);
    expect(authRead.ok).toBe(true);
    if (!authRead.ok || authRead.value.status !== "READ") {
      return;
    }
    expect(authRead.value.observation.fingerprint.algorithm).toBe("sha256");
    expect(authRead.value.observation.fingerprint.hex).toHaveLength(64);
    expect(authRead.value.observation.entry).toBe(authEntry);

    const mapResult = await buildRepositoryMap(workspace, repositoryInventory, config);
    expect(mapResult.ok).toBe(true);
    if (!mapResult.ok) {
      return;
    }
    const map = mapResult.value;
    const pkgObservation = map.manifestObservations.find(
      (item) => item.relativePath === "package.json" && item.kind === "PARSED_JSON",
    );
    expect(pkgObservation?.kind).toBe("PARSED_JSON");
    if (pkgObservation?.kind !== "PARSED_JSON") {
      return;
    }
    expect(pkgObservation.observation.entry).toBe(admittedEntry(repositoryInventory, "package.json"));
    expect(
      map.scopes.some((scope) =>
        scope.identityClaims.some(
          (claim) =>
            claim.confidence === "OBSERVED" &&
            claim.fact.kind === "DECLARED_PACKAGE_DEPENDENCY" &&
            claim.fact.packageName === "next",
        ),
      ),
    ).toBe(true);
    expect(
      map.scopes.every((scope) =>
        scope.identityClaims.every(
          (claim) =>
            claim.confidence !== "OBSERVED" ||
            claim.evidence.observation === pkgObservation.observation,
        ),
      ),
    ).toBe(true);

    const corpusResult = buildRepositorySearchCorpus(repositoryInventory, map);
    expect(corpusResult.ok).toBe(true);
    if (!corpusResult.ok) {
      return;
    }
    const searchResult = searchRepository(corpusResult.value, { terms: ["auth"] });
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) {
      return;
    }
    expect(searchResult.value.candidates[0]?.entry).toBe(authEntry);
    expect(
      searchResult.value.candidates[0]?.matchReasons.some(
        (reason) =>
          reason.kind === "BASENAME_TOKEN_MATCH" ||
          reason.kind === "PATH_COMPONENT_MATCH",
      ),
    ).toBe(true);

    const contentObservations = [
      ...contentObservationsFromMap(map),
      await readAdmittedContentObservation(authEntry, workspace, config),
    ];
    const admitted = repositoryInventory.observations
      .filter((item) => item.disposition === "ADMITTED")
      .map((item) => item.entry);
    const snapshotResult = buildRepositorySnapshot({
      workspace,
      config,
      inventory: repositoryInventory,
      repositoryMap: map,
      searchCorpus: corpusResult.value,
      contentObservations,
      entryStatIdentities: await collectEntryStatIdentities(admitted),
    });
    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) {
      return;
    }

    const initial = await verifyRepositorySnapshot(snapshotResult.value, workspace, config, {
      entries: [authEntry],
      content: [authEntry],
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) {
      return;
    }
    expect(
      initial.value.contentResults.find((item) => item.entry === authEntry)?.state,
    ).toBe("VERIFIED_CURRENT");

    const original = "export const auth = ABCD;\n";
    const replacement = "export const auth = WXYZ;\n";
    expect(original.length).toBe(replacement.length);
    const authInventoryEntry = admittedEntry(repositoryInventory, "src/auth.ts");
    const mtimeSec = Math.floor(authInventoryEntry.mtimeMs! / 1000);
    await writeRelative(root, "src/auth.ts", replacement);
    await utimes(path.join(root, "src/auth.ts"), mtimeSec, mtimeSec);

    const identityOnly = await verifyRepositorySnapshot(snapshotResult.value, workspace, config, {
      entries: [authEntry],
      content: "NONE",
    });
    expect(identityOnly.ok).toBe(true);
    if (!identityOnly.ok) {
      return;
    }
    expect(
      identityOnly.value.contentResults.find((item) => item.entry === authEntry)?.state,
    ).toBe("REVALIDATION_REQUIRED");

    const stale = await verifyRepositorySnapshot(snapshotResult.value, workspace, config, {
      entries: [authEntry],
      content: [authEntry],
    });
    expect(stale.ok).toBe(true);
    if (!stale.ok) {
      return;
    }
    expect(
      stale.value.contentResults.find((item) => item.entry === authEntry)?.state,
    ).toBe("STALE_CONTENT");
    expect(stale.value.honesty.repositoryUnchangedClaim).toBe(false);
    expect(snapshotResult.value.contentObservations.length).toBe(contentObservations.length);
  });

  it("requires successful loadProjectConfig before inventory traversal", async () => {
    const root = await createCanonicalTempRoot("p2g-config-");
    await writeRelative(root, "note.txt", "note\n");
    const workspace = await boundaryFor(root);
    const loaded = await loadProjectConfig(workspace);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    const inv = await inventory(workspace, loaded.value);
    expect(inv.ok).toBe(true);
  });

  it("guards incompatible inventory/map at search corpus boundary", async () => {
    const rootA = await createCanonicalTempRoot("p2g-corpus-a-");
    const rootB = await createCanonicalTempRoot("p2g-corpus-b-");
    await writeRelative(rootA, "a.txt", "a\n");
    await writeRelative(rootB, "b.txt", "b\n");
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
    const mapB = await buildRepositoryMap(workspaceB, invB.value, configB);
    expect(mapB.ok).toBe(true);
    if (!mapB.ok) {
      return;
    }
    const mismatch = buildRepositorySearchCorpus(invA.value, mapB.value);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error.code).toBe("SEARCH_SOURCE_INCOMPATIBLE");
    }
  });

  it("propagates stale manifest content through derived freshness chain", async () => {
    const root = await createCanonicalTempRoot("p2g-stale-prop-");
    await writePackageJson(root, "package.json", {
      name: "demo",
      dependencies: { next: "14.0.0" },
    });
    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const inv = await inventory(workspace, config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    const mapResult = await buildRepositoryMap(workspace, inv.value, config);
    expect(mapResult.ok).toBe(true);
    if (!mapResult.ok) {
      return;
    }
    const corpusResult = buildRepositorySearchCorpus(inv.value, mapResult.value);
    expect(corpusResult.ok).toBe(true);
    if (!corpusResult.ok) {
      return;
    }
    const contentObservations = contentObservationsFromMap(mapResult.value);
    const snapshotResult = buildRepositorySnapshot({
      workspace,
      config,
      inventory: inv.value,
      repositoryMap: mapResult.value,
      searchCorpus: corpusResult.value,
      contentObservations,
    });
    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) {
      return;
    }
    await writePackageJson(root, "package.json", {
      name: "demo",
      dependencies: { react: "18.0.0" },
    });
    const pkgEntry = admittedEntry(inv.value, "package.json");
    const assessment = await verifyRepositorySnapshot(snapshotResult.value, workspace, config, {
      entries: [pkgEntry],
      content: [pkgEntry],
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }
    expect(
      assessment.value.derivedResults.some(
        (item) =>
          item.kind === "MANIFEST_EVIDENCE" && item.state === "UNSUPPORTED_STALE_EVIDENCE",
      ),
    ).toBe(true);
    expect(
      assessment.value.derivedResults.some(
        (item) => item.kind === "REPOSITORY_MAP" && item.state === "LIMITED",
      ),
    ).toBe(true);
    expect(
      assessment.value.derivedResults.some(
        (item) => item.kind === "SEARCH_CORPUS" && item.state === "SOURCE_STALE",
      ),
    ).toBe(true);
  });

  it("binds Git baseline into snapshot for nested directory inventory entries", async () => {
    const root = await buildIntegratedFixture();
    const workspace = await boundaryFor(root);
    const config = await resolvedConfigAt(root);
    const inv = await inventory(workspace, config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    const gitBaseline = await collectGitStateBaseline(workspace, inv.value, config);
    expect(gitBaseline.ok).toBe(true);
    if (!gitBaseline.ok) {
      return;
    }
    const map = await buildRepositoryMap(workspace, inv.value, config);
    expect(map.ok).toBe(true);
    if (!map.ok) {
      return;
    }
    const corpus = buildRepositorySearchCorpus(inv.value, map.value);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) {
      return;
    }
    const contentObservations = contentObservationsFromMap(map.value);
    const admitted = inv.value.observations
      .filter((item) => item.disposition === "ADMITTED")
      .map((item) => item.entry);
    const snapshotResult = buildRepositorySnapshot({
      workspace,
      config,
      inventory: inv.value,
      repositoryMap: map.value,
      searchCorpus: corpus.value,
      gitBaseline: gitBaseline.value,
      contentObservations,
      entryStatIdentities: await collectEntryStatIdentities(admitted),
    });
    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) {
      throw new Error(`${snapshotResult.error.code}: ${snapshotResult.error.message}`);
    }
    expect(snapshotResult.value.gitBaseline).toBe(gitBaseline.value);
  });
});
