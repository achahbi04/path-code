/**
 * Phase 3 Safe Editing Engine — independent integration audit (Stage 2).
 *
 * Covers composition seams B1–B8 using real temporary workspaces and the
 * public pipeline only. Does not fabricate branded authority objects.
 */

import { Buffer } from "node:buffer";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import { inspectAuthorizationReadiness } from "../../src/editing/internal/authorization-readiness.js";
import type { AtomicReplaceFsOps } from "../../src/editing/atomic-fs.js";
import { productionAtomicReplaceFs } from "../../src/editing/atomic-fs.js";
import { replaceExistingFileWithDependencies } from "../../src/editing/replace-existing-file.js";
import { createFileWithDependencies } from "../../src/editing/create-file.js";
import { executeMultiFilePlanWithDependencies } from "../../src/editing/multi-file-execute.js";
import {
  getCanonicalCapabilityLedger,
  getCanonicalGapLedger,
  deriveCapabilityObservation,
  deriveAllCapabilityObservations,
} from "../../src/selfobs/index.js";
import { issueLedgerVerification } from "../../src/selfobs/internal/issue-verification.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import { cleanupGitFixtures } from "../git/fixture-helpers.js";
import { annotationFor } from "../git/baseline-helpers.js";
import {
  admittedDirectoryEntry,
  admittedFileEntry,
  collectBaseline,
  createFile,
  createMultiFilePlan,
  earnCreate,
  earnModify,
  executeMultiFilePlan,
  inventory,
  loadProjectConfig,
  openAuditFixture,
  readContentObservation,
  replaceExistingFile,
  withAuditFixture,
  withGitAuditFixture,
  writePathcodeConfig,
  writeRelative,
  buildRepositoryMap,
  buildRepositorySearchCorpus,
  buildRepositorySnapshot,
  verifyRepositorySnapshot,
} from "./phase3-audit-helpers.js";

afterEach(async () => {
  resetAuthorizationRegistryForTests();
  await cleanupInventoryFixtures();
  await cleanupGitFixtures();
});

describe("Phase 3 integration audit — B1 full read/write/re-observe pipeline", () => {
  it("bridges Phase 3 after-state fingerprints to fresh Phase 2B observations", async () => {
    const fixture = await withGitAuditFixture("pc-p3-b1-");
    await writeRelative(fixture.root, "tracked.txt", "tracked-v1\n");
    await writeRelative(fixture.root, "pkg.json", '{"name":"audit"}\n');
    await writeRelative(fixture.root, "src/keep.txt", "keep\n");

    const inv0 = await inventory(fixture.workspace, fixture.config);
    expect(inv0.ok).toBe(true);
    if (!inv0.ok) {
      return;
    }
    const g0 = await collectBaseline(fixture, inv0.value);

    const trackedEntry = admittedFileEntry(inv0.value, "tracked.txt");
    const trackedObs = await readContentObservation(
      trackedEntry,
      fixture.workspace,
      fixture.config,
    );
    expect(trackedObs.fingerprint.hex).toHaveLength(64);

    const map0 = await buildRepositoryMap(
      fixture.workspace,
      inv0.value,
      fixture.config,
    );
    expect(map0.ok).toBe(true);
    if (!map0.ok) {
      return;
    }
    const corpus0 = buildRepositorySearchCorpus(inv0.value, map0.value);
    expect(corpus0.ok).toBe(true);
    if (!corpus0.ok) {
      return;
    }
    const snap0 = buildRepositorySnapshot({
      workspace: fixture.workspace,
      config: fixture.config,
      inventory: inv0.value,
      repositoryMap: map0.value,
      searchCorpus: corpus0.value,
      contentObservations: [trackedObs],
      gitBaseline: g0,
    });
    expect(snap0.ok).toBe(true);

    const mod = await earnModify(
      fixture,
      "replace-me.txt",
      "before-b1\n",
      "after-b1\n",
    );
    const replaceResult = await replaceExistingFile(
      mod.authorization,
      mod.prepared,
    );
    expect(replaceResult.outcome).toBe("SUCCESS");
    if (replaceResult.outcome !== "SUCCESS") {
      return;
    }

    const create = await earnCreate(fixture, "src", "created-b1.txt", "created-b1\n");
    const createResult = await createFile(create.authorization, create.prepared);
    expect(createResult.outcome).toBe("SUCCESS");
    if (createResult.outcome !== "SUCCESS") {
      return;
    }

    const planMod = await earnModify(
      fixture,
      "plan-mod.txt",
      "plan-before\n",
      "plan-after\n",
    );
    const planCreate = await earnCreate(
      fixture,
      "src",
      "plan-created.txt",
      "plan-created\n",
    );
    const built = createMultiFilePlan([
      { prepared: planMod.prepared, authorization: planMod.authorization },
      { prepared: planCreate.prepared, authorization: planCreate.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const planResult = await executeMultiFilePlan(built.value);
    expect(planResult.planStatus).toBe("ALL_APPLIED");

    const inv1 = await inventory(fixture.workspace, fixture.config);
    expect(inv1.ok).toBe(true);
    if (!inv1.ok) {
      return;
    }
    const inventoryAfter = inv1.value;

    async function bridge(
      relativePath: string,
      expectedHex: string | null | undefined,
    ): Promise<void> {
      expect(expectedHex).toBeTruthy();
      const entry = admittedFileEntry(inventoryAfter, relativePath);
      const obs = await readContentObservation(
        entry,
        fixture.workspace,
        fixture.config,
      );
      expect(obs.fingerprint.hex).toBe(expectedHex);
    }

    await bridge(
      "replace-me.txt",
      replaceResult.editRecord.observedAfterFingerprint?.hex,
    );
    await bridge(
      "src/created-b1.txt",
      createResult.editRecord.observedAfterFingerprint?.hex,
    );

    const planModOutcome = planResult.targetOutcomes[0];
    const planCreateOutcome = planResult.targetOutcomes[1];
    expect(planModOutcome?.kind).toBe("APPLIED");
    expect(planCreateOutcome?.kind).toBe("APPLIED");
    if (planModOutcome?.kind === "APPLIED") {
      await bridge(
        "plan-mod.txt",
        planModOutcome.nestedResult.editRecord.observedAfterFingerprint?.hex,
      );
    }
    if (planCreateOutcome?.kind === "APPLIED") {
      await bridge(
        "src/plan-created.txt",
        planCreateOutcome.nestedResult.editRecord.observedAfterFingerprint?.hex,
      );
    }
  });
});

describe("Phase 3 integration audit — B2 authored then reobserved", () => {
  it("admits created bytes into repository knowledge only after re-observation", async () => {
    const fixture = await withAuditFixture("pc-p3-b2-");
    await writeRelative(fixture.root, "src/.keep", "k\n");

    const invBefore = await inventory(fixture.workspace, fixture.config);
    expect(invBefore.ok).toBe(true);
    if (!invBefore.ok) {
      return;
    }
    expect(
      invBefore.value.observations.some(
        (item) => item.relativePath === "src/authored.txt",
      ),
    ).toBe(false);

    const mapBefore = await buildRepositoryMap(
      fixture.workspace,
      invBefore.value,
      fixture.config,
    );
    expect(mapBefore.ok).toBe(true);
    if (!mapBefore.ok) {
      return;
    }
    const corpusBefore = buildRepositorySearchCorpus(
      invBefore.value,
      mapBefore.value,
    );
    expect(corpusBefore.ok).toBe(true);
    if (!corpusBefore.ok) {
      return;
    }
    expect(
      corpusBefore.value.admittedEntries.some(
        (entry) => entry.relativePath === "src/authored.txt",
      ),
    ).toBe(false);

    const earned = await earnCreate(
      fixture,
      "src",
      "authored.txt",
      "authored-bytes\n",
    );
    const created = await createFile(earned.authorization, earned.prepared);
    expect(created.outcome).toBe("SUCCESS");
    if (created.outcome !== "SUCCESS") {
      return;
    }
    expect(created.editRecord.kind).toBe("CREATION");
    expect(created.editRecord.observedAfterFingerprint?.hex).toHaveLength(64);
    // Mutation evidence exists; old inventory still has no RepositoryEntry.
    expect(
      invBefore.value.observations.some(
        (item) => item.relativePath === "src/authored.txt",
      ),
    ).toBe(false);

    const invAfter = await inventory(fixture.workspace, fixture.config);
    expect(invAfter.ok).toBe(true);
    if (!invAfter.ok) {
      return;
    }
    const entry = admittedFileEntry(invAfter.value, "src/authored.txt");
    const obs = await readContentObservation(
      entry,
      fixture.workspace,
      fixture.config,
    );
    expect(obs.fingerprint.hex).toBe(
      created.editRecord.observedAfterFingerprint?.hex,
    );

    const mapAfter = await buildRepositoryMap(
      fixture.workspace,
      invAfter.value,
      fixture.config,
    );
    expect(mapAfter.ok).toBe(true);
  });
});

describe("Phase 3 integration audit — B3 edit/verify/stale/fresh", () => {
  it("ties Phase 2 STALE_CONTENT to Phase 3 stale refusal, then accepts a fresh edit", async () => {
    const fixture = await withAuditFixture("pc-p3-b3-");
    await writeRelative(fixture.root, "target.txt", "v0\n");

    const inv0 = await inventory(fixture.workspace, fixture.config);
    expect(inv0.ok).toBe(true);
    if (!inv0.ok) {
      return;
    }
    const entry0 = admittedFileEntry(inv0.value, "target.txt");
    const obs0 = await readContentObservation(
      entry0,
      fixture.workspace,
      fixture.config,
    );
    const map0 = await buildRepositoryMap(
      fixture.workspace,
      inv0.value,
      fixture.config,
    );
    expect(map0.ok).toBe(true);
    if (!map0.ok) {
      return;
    }
    const corpus0 = buildRepositorySearchCorpus(inv0.value, map0.value);
    expect(corpus0.ok).toBe(true);
    if (!corpus0.ok) {
      return;
    }
    const snap0 = buildRepositorySnapshot({
      workspace: fixture.workspace,
      config: fixture.config,
      inventory: inv0.value,
      repositoryMap: map0.value,
      searchCorpus: corpus0.value,
      contentObservations: [obs0],
    });
    expect(snap0.ok).toBe(true);
    if (!snap0.ok) {
      return;
    }

    const mutA = await earnModify(fixture, "target.txt", "v0\n", "vA\n");
    // Re-earn before-state for B against the same bytes (fresh prepare).
    resetAuthorizationRegistryForTests();
    const mutB = await earnModify(fixture, "target.txt", "v0\n", "vB\n");

    const resultA = await replaceExistingFile(mutA.authorization, mutA.prepared);
    expect(resultA.outcome).toBe("SUCCESS");

    const stale = await verifyRepositorySnapshot(
      snap0.value,
      fixture.workspace,
      fixture.config,
      { entries: [entry0], content: [entry0] },
    );
    expect(stale.ok).toBe(true);
    if (!stale.ok) {
      return;
    }
    const contentState = stale.value.contentResults.find(
      (item) => item.entry === entry0,
    );
    expect(contentState?.state).toBe("STALE_CONTENT");

    const resultB = await replaceExistingFile(mutB.authorization, mutB.prepared);
    expect(resultB.outcome).toBe("REFUSED_PRECOMMIT");
    if (resultB.outcome === "REFUSED_PRECOMMIT") {
      expect(resultB.refusalReason).toBe("TARGET_STALE");
    }
    expect(await readFile(join(fixture.root, "target.txt"), "utf8")).toBe("vA\n");

    resetAuthorizationRegistryForTests();
    const mutC = await earnModify(fixture, "target.txt", "vA\n", "vC\n");
    const resultC = await replaceExistingFile(mutC.authorization, mutC.prepared);
    expect(resultC.outcome).toBe("SUCCESS");
    expect(await readFile(join(fixture.root, "target.txt"), "utf8")).toBe("vC\n");
  });
});

describe("Phase 3 integration audit — B4 git point-in-time", () => {
  it("keeps G0 immutable while G1 reports worktree modification", async () => {
    const fixture = await withGitAuditFixture("pc-p3-b4-");
    await writeRelative(fixture.root, "tracked.txt", "g0-bytes\n");
    // Stage + commit tracked.txt into the disposable repo.
    const { fixtureGit } = await import("../git/fixture-helpers.js");
    await fixtureGit(fixture.root, [
      "-c",
      "user.email=pathcode-audit@example.com",
      "-c",
      "user.name=Path Code Audit",
      "-c",
      "commit.gpgsign=false",
      "add",
      "tracked.txt",
    ]);
    await fixtureGit(fixture.root, [
      "-c",
      "user.email=pathcode-audit@example.com",
      "-c",
      "user.name=Path Code Audit",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--no-gpg-sign",
      "-m",
      "add tracked",
    ]);

    const inv0 = await inventory(fixture.workspace, fixture.config);
    expect(inv0.ok).toBe(true);
    if (!inv0.ok) {
      return;
    }
    const g0 = await collectBaseline(fixture, inv0.value);
    const tracked0 = annotationFor(g0, "tracked.txt");
    expect(tracked0?.observation.state.kind).toBe("TRACKED");
    if (tracked0?.observation.state.kind === "TRACKED") {
      expect(tracked0.observation.state.worktreeState).toBe("CLEAN");
    }

    const mod = await earnModify(
      fixture,
      "tracked.txt",
      "g0-bytes\n",
      "g1-bytes\n",
    );
    const replaced = await replaceExistingFile(mod.authorization, mod.prepared, {
      gitContext: g0,
    });
    expect(replaced.outcome).toBe("SUCCESS");

    const inv1 = await inventory(fixture.workspace, fixture.config);
    expect(inv1.ok).toBe(true);
    if (!inv1.ok) {
      return;
    }
    const g1 = await collectBaseline(fixture, inv1.value);
    const tracked1 = annotationFor(g1, "tracked.txt");
    expect(tracked1?.observation.state.kind).toBe("TRACKED");
    if (tracked1?.observation.state.kind === "TRACKED") {
      expect(tracked1.observation.state.worktreeState).toBe("MODIFIED");
    }
    // G0 remains the original point-in-time object.
    const tracked0Again = annotationFor(g0, "tracked.txt");
    if (tracked0Again?.observation.state.kind === "TRACKED") {
      expect(tracked0Again.observation.state.worktreeState).toBe("CLEAN");
    }

    // UNMERGED supplied context refuses; absent context does not manufacture refusal.
    resetAuthorizationRegistryForTests();
    const forUnmerged = await earnModify(
      fixture,
      "other.txt",
      "o0\n",
      "o1\n",
    );
    const unmergedContext = {
      ...g1,
      annotations: [
        {
          entry: forUnmerged.prepared.target,
          observation: {
            gitRelativePath: "other.txt",
            workspaceRelativePath: "other.txt",
            state: { kind: "UNMERGED" as const, stages: "UU" },
            provenance: "PRE_EXISTING" as const,
          },
        },
      ],
    };
    const refused = await replaceExistingFile(
      forUnmerged.authorization,
      forUnmerged.prepared,
      { gitContext: unmergedContext },
    );
    expect(refused.outcome).toBe("REFUSED_PRECOMMIT");

    resetAuthorizationRegistryForTests();
    const absentGit = await earnModify(fixture, "nogit.txt", "n0\n", "n1\n");
    const okAbsent = await replaceExistingFile(
      absentGit.authorization,
      absentGit.prepared,
    );
    expect(okAbsent.outcome).toBe("SUCCESS");
  });
});

describe("Phase 3 integration audit — B5 denial across surfaces", () => {
  it("moment 1: deny-path blocks admission, preparation, and search surfaces", async () => {
    const fixture = await withAuditFixture("pc-p3-b5m1-");
    await writePathcodeConfig(fixture.root, "deny-path = secrets");
    const reopened = await openAuditFixture(fixture.root);
    await writeRelative(reopened.root, "secrets/x.txt", "secret\n");
    await writeRelative(reopened.root, "ok.txt", "ok\n");

    const loaded = await loadProjectConfig(reopened.workspace);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }

    const inv = await inventory(reopened.workspace, loaded.value);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    expect(
      inv.value.observations.some(
        (item) =>
          item.relativePath === "secrets" &&
          item.disposition === "DENIED_BY_PROJECT_RESTRICTION",
      ),
    ).toBe(true);
    expect(
      inv.value.observations.some(
        (item) =>
          item.relativePath === "secrets/x.txt" &&
          item.disposition === "ADMITTED",
      ),
    ).toBe(false);

    const map = await buildRepositoryMap(
      reopened.workspace,
      inv.value,
      loaded.value,
    );
    expect(map.ok).toBe(true);
    if (!map.ok) {
      return;
    }
    const corpus = buildRepositorySearchCorpus(inv.value, map.value);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) {
      return;
    }
    expect(
      corpus.value.admittedEntries.some((entry) =>
        entry.relativePath.startsWith("secrets/"),
      ),
    ).toBe(false);

    // No admitted RepositoryEntry ⇒ typed 2B / 3B / 3C preparation cannot be earned.
    expect(() => admittedFileEntry(inv.value, "secrets/x.txt")).toThrow(
      /missing admitted file/,
    );
    expect(() => admittedDirectoryEntry(inv.value, "secrets")).toThrow(
      /missing admitted directory/,
    );
  });

  it("moment 2: deny added after authorization refuses 3B/3C/3D without consuming auth", async () => {
    const fixture = await withAuditFixture("pc-p3-b5m2-");
    const mod = await earnModify(fixture, "will-deny.txt", "w0\n", "w1\n");
    const cre = await earnCreate(fixture, "src", "new.txt", "n\n");

    await writePathcodeConfig(fixture.root, "deny-path = will-deny.txt\ndeny-path = src");

    const refusedMod = await replaceExistingFile(mod.authorization, mod.prepared);
    expect(refusedMod.outcome).toBe("REFUSED_PRECOMMIT");
    if (refusedMod.outcome === "REFUSED_PRECOMMIT") {
      expect(refusedMod.refusalReason).toBe("TARGET_DENIED");
    }

    // Re-earn create under still-permissive prepare path already done; mutation reloads.
    const refusedCre = await createFile(cre.authorization, cre.prepared);
    expect(refusedCre.outcome).toBe("REFUSED_PRECOMMIT");
    if (refusedCre.outcome === "REFUSED_PRECOMMIT") {
      expect(refusedCre.refusalReason).toBe("TARGET_DENIED");
    }

    resetAuthorizationRegistryForTests();
    const permissive = await openAuditFixture(fixture.root);
    // Restore permissive briefly to earn a mixed plan, then deny before execute.
    await writePathcodeConfig(fixture.root, "");
    const open2 = await openAuditFixture(fixture.root);
    const m2 = await earnModify(open2, "plan-a.txt", "a0\n", "a1\n");
    const c2 = await earnCreate(open2, "out", "plan-b.txt", "b\n");
    const built = createMultiFilePlan([
      { prepared: m2.prepared, authorization: m2.authorization },
      { prepared: c2.prepared, authorization: c2.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    await writePathcodeConfig(fixture.root, "deny-path = plan-a.txt\ndeny-path = out");
    const plan = await executeMultiFilePlan(built.value);
    expect(plan.planStatus).toBe("REFUSED_AT_PREFLIGHT");
    for (const outcome of plan.targetOutcomes) {
      expect(outcome.kind).toBe("PREFLIGHT_FAILED");
      if (outcome.kind === "PREFLIGHT_FAILED") {
        expect(outcome.reasons).toContain("TARGET_DENIED");
      }
    }
    expect(inspectAuthorizationReadiness(m2.authorization, m2.prepared).ok).toBe(
      true,
    );
    expect(inspectAuthorizationReadiness(c2.authorization, c2.prepared).ok).toBe(
      true,
    );
    void permissive;
  });
});

describe("Phase 3 integration audit — B6 action-class independence", () => {
  it("EDIT disable blocks modification and mixed plans; CREATE_FILE remains eligible alone", async () => {
    const fixture = await withAuditFixture("pc-p3-b6-edit-");
    const mod = await earnModify(fixture, "m.txt", "m0\n", "m1\n");
    const cre = await earnCreate(fixture, "src", "c.txt", "c\n");
    await writePathcodeConfig(fixture.root, "disable-action = EDIT");

    const refusedMod = await replaceExistingFile(mod.authorization, mod.prepared);
    expect(refusedMod.outcome).toBe("REFUSED_PRECOMMIT");
    if (refusedMod.outcome === "REFUSED_PRECOMMIT") {
      expect(refusedMod.refusalReason).toBe("ACTION_DISABLED");
    }

    const okCre = await createFile(cre.authorization, cre.prepared);
    expect(okCre.outcome).toBe("SUCCESS");

    resetAuthorizationRegistryForTests();
    await writePathcodeConfig(fixture.root, "");
    const open = await openAuditFixture(fixture.root);
    const m2 = await earnModify(open, "m2.txt", "a0\n", "a1\n");
    const c2 = await earnCreate(open, "src", "c2.txt", "x\n");
    const built = createMultiFilePlan([
      { prepared: m2.prepared, authorization: m2.authorization },
      { prepared: c2.prepared, authorization: c2.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    await writePathcodeConfig(fixture.root, "disable-action = EDIT");
    const plan = await executeMultiFilePlan(built.value);
    expect(plan.planStatus).toBe("REFUSED_AT_PREFLIGHT");
    expect(plan.targetOutcomes[0]?.kind).toBe("PREFLIGHT_FAILED");
    if (plan.targetOutcomes[0]?.kind === "PREFLIGHT_FAILED") {
      expect(plan.targetOutcomes[0].reasons).toContain("ACTION_DISABLED");
    }
    expect(plan.targetOutcomes[1]?.kind).toBe(
      "PREFLIGHT_READY_BUT_PLAN_REFUSED",
    );
  });

  it("CREATE_FILE disable blocks creation and mixed plans; EDIT remains eligible alone", async () => {
    const fixture = await withAuditFixture("pc-p3-b6-create-");
    const mod = await earnModify(fixture, "m.txt", "m0\n", "m1\n");
    const cre = await earnCreate(fixture, "src", "c.txt", "c\n");
    await writePathcodeConfig(fixture.root, "disable-action = CREATE_FILE");

    const okMod = await replaceExistingFile(mod.authorization, mod.prepared);
    expect(okMod.outcome).toBe("SUCCESS");

    const refusedCre = await createFile(cre.authorization, cre.prepared);
    expect(refusedCre.outcome).toBe("REFUSED_PRECOMMIT");
    if (refusedCre.outcome === "REFUSED_PRECOMMIT") {
      expect(refusedCre.refusalReason).toBe("ACTION_DISABLED");
    }

    resetAuthorizationRegistryForTests();
    await writePathcodeConfig(fixture.root, "");
    const open = await openAuditFixture(fixture.root);
    const m2 = await earnModify(open, "m2.txt", "a0\n", "a1\n");
    const c2 = await earnCreate(open, "src", "c2.txt", "x\n");
    const built = createMultiFilePlan([
      { prepared: m2.prepared, authorization: m2.authorization },
      { prepared: c2.prepared, authorization: c2.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    await writePathcodeConfig(fixture.root, "disable-action = CREATE_FILE");
    const plan = await executeMultiFilePlan(built.value);
    expect(plan.planStatus).toBe("REFUSED_AT_PREFLIGHT");
    expect(plan.targetOutcomes[1]?.kind).toBe("PREFLIGHT_FAILED");
    if (plan.targetOutcomes[1]?.kind === "PREFLIGHT_FAILED") {
      expect(plan.targetOutcomes[1].reasons).toContain("ACTION_DISABLED");
    }
    expect(plan.targetOutcomes[0]?.kind).toBe(
      "PREFLIGHT_READY_BUT_PLAN_REFUSED",
    );
  });
});

describe("Phase 3 integration audit — B7 config fail-closed and ABSENT", () => {
  it("malformed config fails closed across load/inventory/3B/3C/3D", async () => {
    const fixture = await withAuditFixture("pc-p3-b7-bad-");
    const mod = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const cre = await earnCreate(fixture, "src", "b.txt", "b\n");
    const built = createMultiFilePlan([
      { prepared: mod.prepared, authorization: mod.authorization },
      { prepared: cre.prepared, authorization: cre.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    await writeFile(
      join(fixture.root, "PATHCODE.md"),
      "# Broken\n\n```pathcode-config\ndeny-path = unterminated\n",
      "utf8",
    );

    const loaded = await loadProjectConfig(fixture.workspace);
    expect(loaded.ok).toBe(false);

    // 3D preflight first — must refuse without consuming authorizations.
    const plan = await executeMultiFilePlan(built.value);
    expect(plan.planStatus).toBe("REFUSED_AT_PREFLIGHT");
    for (const outcome of plan.targetOutcomes) {
      expect(outcome.kind).toBe("PREFLIGHT_FAILED");
      if (outcome.kind === "PREFLIGHT_FAILED") {
        expect(outcome.reasons).toEqual(["CONFIG_RELOAD_FAILED"]);
      }
    }
    expect(inspectAuthorizationReadiness(mod.authorization, mod.prepared).ok).toBe(
      true,
    );
    expect(inspectAuthorizationReadiness(cre.authorization, cre.prepared).ok).toBe(
      true,
    );

    const refusedMod = await replaceExistingFile(mod.authorization, mod.prepared);
    expect(refusedMod.outcome).toBe("REFUSED_PRECOMMIT");
    if (refusedMod.outcome === "REFUSED_PRECOMMIT") {
      expect(refusedMod.refusalReason).toBe("CONFIG_RELOAD_FAILED");
    }
    const refusedCre = await createFile(cre.authorization, cre.prepared);
    expect(refusedCre.outcome).toBe("REFUSED_PRECOMMIT");
    if (refusedCre.outcome === "REFUSED_PRECOMMIT") {
      expect(refusedCre.refusalReason).toBe("CONFIG_RELOAD_FAILED");
    }
  });

  it("successful ABSENT permits inventory and 3B/3C/3D", async () => {
    const fixture = await withAuditFixture("pc-p3-b7-abs-");
    await unlink(join(fixture.root, "PATHCODE.md"));
    const open = await openAuditFixture(fixture.root);
    expect(open.config.source.kind).toBe("ABSENT");

    const inv = await inventory(open.workspace, open.config);
    expect(inv.ok).toBe(true);

    const mod = await earnModify(open, "a.txt", "a0\n", "a1\n");
    const cre = await earnCreate(open, "src", "b.txt", "b\n");
    const replaced = await replaceExistingFile(mod.authorization, mod.prepared);
    expect(replaced.outcome).toBe("SUCCESS");
    const created = await createFile(cre.authorization, cre.prepared);
    expect(created.outcome).toBe("SUCCESS");

    resetAuthorizationRegistryForTests();
    const m2 = await earnModify(open, "c.txt", "c0\n", "c1\n");
    const c2 = await earnCreate(open, "src", "d.txt", "d\n");
    const built = createMultiFilePlan([
      { prepared: m2.prepared, authorization: m2.authorization },
      { prepared: c2.prepared, authorization: c2.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const plan = await executeMultiFilePlan(built.value);
    expect(plan.planStatus).toBe("ALL_APPLIED");
  });
});

describe("Phase 3 integration audit — B8 partial plan then reobserve", () => {
  it("records COMMITTED/failed/NOT_ATTEMPTED honestly and matches fresh inventory", async () => {
    const fixture = await withAuditFixture("pc-p3-b8-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const c = await earnModify(fixture, "c.txt", "c0\n", "c1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
      { prepared: c.prepared, authorization: c.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    let call = 0;
    const result = await executeMultiFilePlanWithDependencies(built.value, {
      targetOps: {
        replaceExistingFile: async (authorization, prepared, options) => {
          call += 1;
          if (call === 2) {
            await writeFile(join(fixture.root, "b.txt"), "stale\n", "utf8");
          }
          return replaceExistingFile(authorization, prepared, options);
        },
        createFile: async () => {
          throw new Error("create should not run");
        },
      },
    });
    expect(result.planStatus).toBe("PARTIALLY_COMMITTED");
    expect(result.targetOutcomes[0]?.kind).toBe("APPLIED");
    expect(result.targetOutcomes[1]?.kind).toMatch(
      /REFUSED_PRECOMMIT|FAILED_PRECOMMIT/,
    );
    expect(result.targetOutcomes[2]?.kind).toBe("NOT_ATTEMPTED");
    const notAttempted = result.targetOutcomes[2];
    expect(notAttempted).toEqual({ kind: "NOT_ATTEMPTED" });
    expect(notAttempted).not.toHaveProperty("unchanged");
    expect(await readFile(join(fixture.root, "a.txt"), "utf8")).toBe("a1\n");
    expect(await readFile(join(fixture.root, "c.txt"), "utf8")).toBe("c0\n");

    const inv = await inventory(fixture.workspace, fixture.config);
    expect(inv.ok).toBe(true);
    if (!inv.ok) {
      return;
    }
    const aEntry = admittedFileEntry(inv.value, "a.txt");
    const aObs = await readContentObservation(
      aEntry,
      fixture.workspace,
      fixture.config,
    );
    if (result.targetOutcomes[0]?.kind === "APPLIED") {
      expect(aObs.fingerprint.hex).toBe(
        result.targetOutcomes[0].nestedResult.editRecord.observedAfterFingerprint
          ?.hex,
      );
    }
    const cEntry = admittedFileEntry(inv.value, "c.txt");
    const cObs = await readContentObservation(
      cEntry,
      fixture.workspace,
      fixture.config,
    );
    expect(cObs.fingerprint.hex).toHaveLength(64);
    expect(await readFile(join(fixture.root, "c.txt"), "utf8")).toBe("c0\n");
  });
});

describe("Phase 3 integration audit — recovery shapes (induced)", () => {
  it("3B PRECOMMIT: original intact and temp cleaned", async () => {
    const fixture = await withAuditFixture("pc-p3-rec-3b-pre-");
    const mod = await earnModify(fixture, "t.txt", "keep\n", "new\n");
    const fsOps: AtomicReplaceFsOps = {
      ...productionAtomicReplaceFs,
      createTempExclusive: async () => {
        throw new Error("induced temp create failure");
      },
    };
    const result = await replaceExistingFileWithDependencies(mod.authorization, mod.prepared, {
      fsOps,
    });
    expect(result.outcome).toBe("FAILED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    expect(await readFile(join(fixture.root, "t.txt"), "utf8")).toBe("keep\n");
    const names = await readdir(fixture.root);
    expect(names.some((n) => n.startsWith(".path-code-replace-"))).toBe(false);
  });

  it("3B COMMITTED_FAILURE: commit reached, no rollback", async () => {
    const fixture = await withAuditFixture("pc-p3-rec-3b-cf-");
    const mod = await earnModify(fixture, "t.txt", "before\n", "after\n");
    const fsOps: AtomicReplaceFsOps = {
      ...productionAtomicReplaceFs,
      renameAtomic: async (tempPath, targetPath) => {
        await productionAtomicReplaceFs.renameAtomic(tempPath, targetPath);
        await writeFile(targetPath, "corrupted-after-rename\n", "utf8");
      },
    };
    const result = await replaceExistingFileWithDependencies(mod.authorization, mod.prepared, {
      fsOps,
    });
    expect(result.outcome).toBe("COMMITTED_FAILURE");
    expect(result.commitPointReached).toBe(true);
    expect(await readFile(join(fixture.root, "t.txt"), "utf8")).toBe(
      "corrupted-after-rename\n",
    );
  });

  it("3C PREPUBLICATION: target unpublished and candidate cleaned", async () => {
    const fixture = await withAuditFixture("pc-p3-rec-3c-pre-");
    const cre = await earnCreate(fixture, "src", "f.txt", "data\n");
    const { productionAtomicCreateFs, PATH_CODE_CREATE_TEMP_PREFIX } =
      await import("../../src/editing/atomic-fs.js");
    const result = await createFileWithDependencies(cre.authorization, cre.prepared, {
      fsOps: {
        ...productionAtomicCreateFs,
        writeAll: async () => {
          throw new Error("induced prepublication write failure");
        },
      },
    });
    expect(result.outcome).toBe("FAILED_PRECOMMIT");
    expect(result.commitPointReached).toBe(false);
    const names = await readdir(join(fixture.root, "src"));
    expect(names.includes("f.txt")).toBe(false);
    expect(names.some((n) => n.startsWith(PATH_CODE_CREATE_TEMP_PREFIX))).toBe(
      false,
    );
  });

  it("3C COMMITTED_FAILURE: published target remains without rollback", async () => {
    const fixture = await withAuditFixture("pc-p3-rec-3c-cf-");
    const cre = await earnCreate(fixture, "src", "m.txt", "auth\n");
    const { productionAtomicCreateFs } = await import(
      "../../src/editing/atomic-fs.js"
    );
    const { sha256Hex } = await import("../editing/helpers.js");
    const tampered = Buffer.from("tampered\n");
    const result = await createFileWithDependencies(cre.authorization, cre.prepared, {
      fsOps: {
        ...productionAtomicCreateFs,
        verifyPublishedCreation: async () =>
          Object.freeze({
            kind: "CREATION_AFTER_STATE_EVIDENCE" as const,
            publicationId: "induced-mismatch",
            observedHex: sha256Hex(tampered),
            observedByteLength: tampered.byteLength,
          }),
      },
    });
    expect(result.outcome).toBe("COMMITTED_FAILURE");
    expect(result.commitPointReached).toBe(true);
    expect(await readFile(join(fixture.root, "src/m.txt"), "utf8")).toBe("auth\n");
  });

  it("3D PARTIAL: prior commits remain; later not attempted; no rollback", async () => {
    const fixture = await withAuditFixture("pc-p3-rec-3d-");
    const a = await earnModify(fixture, "a.txt", "a0\n", "a1\n");
    const b = await earnModify(fixture, "b.txt", "b0\n", "b1\n");
    const built = createMultiFilePlan([
      { prepared: a.prepared, authorization: a.authorization },
      { prepared: b.prepared, authorization: b.authorization },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const result = await executeMultiFilePlanWithDependencies(built.value, {
      targetOps: {
        replaceExistingFile: async (authorization, prepared, options) => {
          if (prepared.target.relativePath === "b.txt") {
            await writeFile(join(fixture.root, "b.txt"), "race\n", "utf8");
          }
          return replaceExistingFile(authorization, prepared, options);
        },
        createFile: async () => {
          throw new Error("unused");
        },
      },
    });
    expect(result.planStatus).toBe("PARTIALLY_COMMITTED");
    expect(await readFile(join(fixture.root, "a.txt"), "utf8")).toBe("a1\n");
    expect(await readFile(join(fixture.root, "b.txt"), "utf8")).toBe("race\n");
  });
});

describe("Phase 3 integration audit — D3 safe-editing cannot derive PHASE_VERIFIED", () => {
  it("safe-editing remains DECLARED and never PHASE_VERIFIED at audit HEAD", () => {
    const capabilityLedger = getCanonicalCapabilityLedger();
    const gapLedger = getCanonicalGapLedger();
    const record = capabilityLedger.records.find(
      (r) => r.capabilityId === "safe-editing",
    );
    expect(record).toBeDefined();
    expect(record?.implementationEvidence).toEqual([]);
    expect(record?.freezeEvidence).toBeUndefined();
    expect(record?.phaseAuditEvidence).toBeUndefined();

    const unverified = deriveCapabilityObservation(
      record!,
      undefined,
      capabilityLedger,
      gapLedger,
    );
    expect(unverified).toEqual({
      kind: "UNVERIFIED_DERIVATION",
      capabilityId: "safe-editing",
      candidateState: "DECLARED",
    });

    // Supply only declaration half of a would-be phase audit — still not PHASE_VERIFIED.
    const verification = issueLedgerVerification({
      verifiedAtHead: "a35b42de86c1d22d36bb214cf950f22355da0818",
      capabilityLedger,
      gapLedger,
      citationOutcomes: record!.declarationEvidence.map((c) => ({
        citationKey: `document|${c.path}|${c.atCommit}`,
        resolved: true,
      })),
    });
    const withHalf = deriveCapabilityObservation(
      record!,
      verification,
      capabilityLedger,
      gapLedger,
    );
    expect(withHalf.kind === "VERIFIED_CAPABILITY_STATE"
      ? withHalf.state
      : withHalf.candidateState).toBe("DECLARED");
    expect(
      deriveAllCapabilityObservations(capabilityLedger, gapLedger, verification).some(
        (o) =>
          o.capabilityId === "safe-editing" &&
          ((o.kind === "VERIFIED_CAPABILITY_STATE" &&
            o.state === "PHASE_VERIFIED") ||
            (o.kind === "UNVERIFIED_DERIVATION" &&
              o.candidateState === "PHASE_VERIFIED")),
      ),
    ).toBe(false);
  });

  it("Phase 3 leaf capabilities: edit-contracts and corrected trio PASS_FROZEN", () => {
    const ledger = getCanonicalCapabilityLedger();
    const gaps = getCanonicalGapLedger();

    const editContracts = ledger.records.find(
      (r) => r.capabilityId === "edit-contracts",
    );
    expect(editContracts?.freezeEvidence).toBeDefined();
    const editObs = deriveCapabilityObservation(
      editContracts!,
      undefined,
      ledger,
      gaps,
    );
    expect(editObs.kind).toBe("UNVERIFIED_DERIVATION");
    if (editObs.kind === "UNVERIFIED_DERIVATION") {
      expect(editObs.candidateState).toBe("PASS_FROZEN");
    }

    for (const id of [
      "existing-file-replacement",
      "safe-file-creation",
      "multi-file-coordination",
    ] as const) {
      const record = ledger.records.find((r) => r.capabilityId === id);
      expect(record?.freezeEvidence).toBeDefined();
      expect(record?.freezeEvidence).toMatchObject({
        kind: "sameCommit",
        implementationCommit: "5386f349eccd7c69ff696619ffc426757e3e91d0",
        reportPath:
          "docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md",
      });
      expect(record?.implementationEvidence.length).toBeGreaterThan(0);
      const obs = deriveCapabilityObservation(
        record!,
        undefined,
        ledger,
        gaps,
      );
      expect(obs.kind).toBe("UNVERIFIED_DERIVATION");
      if (obs.kind === "UNVERIFIED_DERIVATION") {
        expect(obs.candidateState).toBe("PASS_FROZEN");
      }
    }
  });
});

describe("Phase 3 integration audit — write boundary mechanical", () => {
  it("names exactly one authorized production write module", async () => {
    const { AUTHORIZED_WRITE_MODULE } = await import(
      "../architecture/write-boundary.test.js"
    );
    expect(AUTHORIZED_WRITE_MODULE).toBe("src/editing/atomic-fs.ts");
  });
});

describe("Phase 3 integration audit — persistence scan helper", () => {
  it("leaves no Path Code residue after a successful replace+create", async () => {
    const fixture = await withAuditFixture("pc-p3-persist-");
    const mod = await earnModify(fixture, "p.txt", "p0\n", "p1\n");
    expect(
      (await replaceExistingFile(mod.authorization, mod.prepared)).outcome,
    ).toBe("SUCCESS");
    const cre = await earnCreate(fixture, "src", "q.txt", "q\n");
    expect((await createFile(cre.authorization, cre.prepared)).outcome).toBe(
      "SUCCESS",
    );

    async function assertClean(dir: string): Promise<void> {
      const names = await readdir(dir, { withFileTypes: true });
      for (const entry of names) {
        expect(entry.name.startsWith(".path-code")).toBe(false);
        expect(entry.name.endsWith(".bak")).toBe(false);
        expect(entry.name.endsWith(".orig")).toBe(false);
        if (entry.isDirectory() && entry.name !== ".git") {
          await assertClean(join(dir, entry.name));
        }
      }
    }
    await assertClean(fixture.root);
  });
});
