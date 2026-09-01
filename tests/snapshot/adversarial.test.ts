import { rm, symlink, utimes } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildRepositorySnapshot,
  MAX_CONTENT_VERIFICATIONS_PER_OPERATION,
  verifyRepositorySnapshot,
} from "../../src/snapshot/index.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import {
  admittedEntry,
  createCanonicalTempRoot,
  resolvedConfigAt,
  snapshotAt,
  writeDenyConfig,
  writeRelative,
} from "./helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

describe("Phase 2F adversarial set", () => {
  it("keeps identity-only REVALIDATION_REQUIRED under same-size same-mtime replacement", async () => {
    const root = await createCanonicalTempRoot("adv-mtime-");
    const left = "12345678";
    const right = "87654321";
    await writeRelative(root, "fixed.txt", left);
    const fixture = await snapshotAt(root, { extraContentPaths: ["fixed.txt"] });
    const entry = admittedEntry(fixture.inventory, "fixed.txt");
    const sec = Math.floor(entry.mtimeMs! / 1000);
    await writeRelative(root, "fixed.txt", right);
    await utimes(path.join(root, "fixed.txt"), sec, sec);

    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: "NONE" },
    );
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }
    const content = assessment.value.contentResults.find(
      (item) => item.relativePath === "fixed.txt",
    );
    expect(content?.state).toBe("REVALIDATION_REQUIRED");
  });

  it("detects symlink retarget outside workspace as STALE_OUTSIDE_WORKSPACE", async () => {
    const root = await createCanonicalTempRoot("adv-symlink-out-");
    const outside = await createCanonicalTempRoot("adv-outside-");
    await writeRelative(outside, "target.txt", "outside\n");
    await writeRelative(root, "link.txt", "inside\n");
    const fixture = await snapshotAt(root);
    const entry = admittedEntry(fixture.inventory, "link.txt");
    await rm(path.join(root, "link.txt"));
    await symlink(path.join(outside, "target.txt"), path.join(root, "link.txt"));
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: "NONE" },
    );
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }
    expect(
      assessment.value.entryResults.find((item) => item.relativePath === "link.txt")?.state,
    ).toBe("STALE_OUTSIDE_WORKSPACE");
  });

  it("rejects budget widening before filesystem access", async () => {
    const root = await createCanonicalTempRoot("adv-budget-");
    await writeRelative(root, "one.txt", "one\n");
    const fixture = await snapshotAt(root);
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      {
        entries: "ALL",
        content: "NONE",
        options: {
          maxContentVerifications: MAX_CONTENT_VERIFICATIONS_PER_OPERATION + 1,
        },
      },
    );
    expect(assessment.ok).toBe(false);
    if (!assessment.ok) {
      expect(assessment.error.code).toBe("INVALID_VERIFICATION_OPTIONS");
    }
  });

  it("rejects artifacts from different inventory generations in one snapshot", async () => {
    const root = await createCanonicalTempRoot("adv-gen-");
    await writeRelative(root, "x.txt", "x\n");
    const first = await snapshotAt(root);
    const second = await snapshotAt(root);
    const result = buildRepositorySnapshot({
      workspace: first.workspace,
      config: first.config,
      inventory: first.inventory,
      repositoryMap: second.map,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SNAPSHOT_ARTIFACTS_INCOMPATIBLE");
    }
  });

  it("does not mutate the input snapshot when content is stale", async () => {
    const root = await createCanonicalTempRoot("adv-no-heal-");
    await writeRelative(root, "mut.txt", "before\n");
    const fixture = await snapshotAt(root, { extraContentPaths: ["mut.txt"] });
    const beforeObservations = fixture.snapshot.contentObservations.length;
    const entry = admittedEntry(fixture.inventory, "mut.txt");
    await writeRelative(root, "mut.txt", "after\n");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: [entry] },
    );
    expect(assessment.ok).toBe(true);
    expect(fixture.snapshot.contentObservations.length).toBe(beforeObservations);
  });

  it("introduces denial between snapshot and verification without performing stat", async () => {
    const root = await createCanonicalTempRoot("adv-deny-");
    await writeRelative(root, "blocked/file.txt", "blocked\n");
    const fixture = await snapshotAt(root);
    const entry = admittedEntry(fixture.inventory, "blocked/file.txt");
    await writeDenyConfig(root, ["blocked"]);
    const config = await resolvedConfigAt(root);
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      config,
      { entries: [entry], content: [entry] },
    );
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }
    expect(
      assessment.value.entryResults.find((item) => item.relativePath === "blocked/file.txt")
        ?.state,
    ).toBe("DENIED");
    expect(
      assessment.value.contentResults.find((item) => item.relativePath === "blocked/file.txt")
        ?.state,
    ).toBe("DENIED");
  });
});
