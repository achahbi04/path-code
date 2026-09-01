import { mkdir, rm, utimes } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inventory } from "../../src/inventory/index.js";
import { searchRepository } from "../../src/search/index.js";
import {
  buildRepositorySnapshot,
  MAX_ENTRY_VERIFICATIONS_PER_OPERATION,
  verifyRepositorySnapshot,
} from "../../src/snapshot/index.js";
import { validateVerificationOptions } from "../../src/snapshot/verify.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import {
  admittedEntry,
  createCanonicalTempRoot,
  resolvedConfigAt,
  snapshotAt,
  writeDenyConfig,
  writePackageJson,
  writeRelative,
} from "./helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

function entryResult(
  assessment: Awaited<ReturnType<typeof verifyRepositorySnapshot>>,
  relativePath: string,
) {
  expect(assessment.ok).toBe(true);
  if (!assessment.ok) {
    throw new Error("expected assessment");
  }
  return assessment.value.entryResults.find((item) => item.relativePath === relativePath);
}

function contentResult(
  assessment: Awaited<ReturnType<typeof verifyRepositorySnapshot>>,
  relativePath: string,
) {
  expect(assessment.ok).toBe(true);
  if (!assessment.ok) {
    throw new Error("expected assessment");
  }
  return assessment.value.contentResults.find((item) => item.relativePath === relativePath);
}

describe("buildRepositorySnapshot", () => {
  it("binds compatible earned artifacts without filesystem access", async () => {
    const root = await createCanonicalTempRoot("snap-bind-");
    await writeRelative(root, "alpha.txt", "alpha\n");
    const fixture = await snapshotAt(root, { extraContentPaths: ["alpha.txt"] });
    expect(fixture.snapshot.inventory).toBe(fixture.inventory);
    expect(fixture.snapshot.generation).toBeDefined();
    expect(fixture.snapshot.assembledAt).toBeGreaterThan(0);
    expect(fixture.snapshot.gitBaseline).toBeUndefined();
  });

  it("rejects incompatible map inventory reference identity", async () => {
    const root = await createCanonicalTempRoot("snap-incompat-");
    await writeRelative(root, "one.txt", "one\n");
    const first = await snapshotAt(root);
    const secondInv = await inventory(first.workspace, first.config);
    expect(secondInv.ok).toBe(true);
    if (!secondInv.ok) {
      return;
    }
    const result = buildRepositorySnapshot({
      workspace: first.workspace,
      config: first.config,
      inventory: secondInv.value,
      repositoryMap: first.map,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SNAPSHOT_ARTIFACTS_INCOMPATIBLE");
    }
  });

  it("rejects duplicate baseline ContentObservation for one entry", async () => {
    const root = await createCanonicalTempRoot("snap-dup-");
    await writeRelative(root, "dup.txt", "dup\n");
    const fixture = await snapshotAt(root, { extraContentPaths: ["dup.txt"] });
    const entry = admittedEntry(fixture.inventory, "dup.txt");
    const dupObservation = fixture.contentObservations.find(
      (item) => item.entry === entry,
    );
    expect(dupObservation).toBeDefined();
    const result = buildRepositorySnapshot({
      workspace: fixture.workspace,
      config: fixture.config,
      inventory: fixture.inventory,
      contentObservations: [dupObservation!, dupObservation!],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SNAPSHOT_ARTIFACTS_INCOMPATIBLE");
    }
  });
});

describe("entry verification", () => {
  it("reports CURRENT_IDENTITY for unchanged files", async () => {
    const root = await createCanonicalTempRoot("snap-entry-current-");
    await writeRelative(root, "stable.txt", "stable\n");
    const fixture = await snapshotAt(root);
    const entry = admittedEntry(fixture.inventory, "stable.txt");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: "NONE" },
    );
    expect(entryResult(assessment, "stable.txt")?.state).toBe("CURRENT_IDENTITY");
  });

  it("reports STALE_DELETED when a file is removed", async () => {
    const root = await createCanonicalTempRoot("snap-entry-deleted-");
    await writeRelative(root, "gone.txt", "gone\n");
    const fixture = await snapshotAt(root);
    const entry = admittedEntry(fixture.inventory, "gone.txt");
    await rm(path.join(root, "gone.txt"));
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: "NONE" },
    );
    expect(entryResult(assessment, "gone.txt")?.state).toBe("STALE_DELETED");
  });

  it("reports STALE_TYPE_CHANGED when a file becomes a directory", async () => {
    const root = await createCanonicalTempRoot("snap-entry-type-");
    await writeRelative(root, "flip.txt", "flip\n");
    const fixture = await snapshotAt(root);
    const entry = admittedEntry(fixture.inventory, "flip.txt");
    await rm(path.join(root, "flip.txt"));
    await mkdir(path.join(root, "flip.txt"));
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: "NONE" },
    );
    expect(entryResult(assessment, "flip.txt")?.state).toBe("STALE_TYPE_CHANGED");
  });

  it("reports STALE_TARGET_CHANGED when dev/ino differ with identical bytes", async () => {
    const root = await createCanonicalTempRoot("snap-entry-inode-");
    await writeRelative(root, "inode.txt", "same-bytes\n");
    const fixture = await snapshotAt(root, { extraContentPaths: ["inode.txt"] });
    const entry = admittedEntry(fixture.inventory, "inode.txt");
    await rm(path.join(root, "inode.txt"));
    await writeRelative(root, "inode.txt", "same-bytes\n");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: "NONE" },
    );
    expect(entryResult(assessment, "inode.txt")?.state).toBe("STALE_TARGET_CHANGED");
  });

  it("reports DENIED when config introduces a deny-path before stat", async () => {
    const root = await createCanonicalTempRoot("snap-entry-denied-");
    await writeRelative(root, "secret/note.txt", "secret\n");
    const fixture = await snapshotAt(root);
    const entry = admittedEntry(fixture.inventory, "secret/note.txt");
    await writeDenyConfig(root, ["secret"]);
    const config = await resolvedConfigAt(root);
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      config,
      { entries: [entry], content: "NONE" },
    );
    expect(entryResult(assessment, "secret/note.txt")?.state).toBe("DENIED");
  });
});

describe("content verification — RI-008", () => {
  it("reports VERIFIED_CURRENT only after a matching full-content SHA-256 read", async () => {
    const root = await createCanonicalTempRoot("snap-content-current-");
    await writeRelative(root, "note.txt", "hello\n");
    const fixture = await snapshotAt(root, { extraContentPaths: ["note.txt"] });
    const entry = admittedEntry(fixture.inventory, "note.txt");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: [entry] },
    );
    expect(contentResult(assessment, "note.txt")?.state).toBe("VERIFIED_CURRENT");
  });

  it("reports STALE_CONTENT when size changes without needing a hash", async () => {
    const root = await createCanonicalTempRoot("snap-content-size-");
    await writeRelative(root, "grow.txt", "short\n");
    const fixture = await snapshotAt(root, { extraContentPaths: ["grow.txt"] });
    const entry = admittedEntry(fixture.inventory, "grow.txt");
    await writeRelative(root, "grow.txt", "much longer content\n");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: [entry] },
    );
    expect(contentResult(assessment, "grow.txt")?.state).toBe("STALE_CONTENT");
  });

  it("detects same-size same-mtime in-place content change as STALE_CONTENT on read", async () => {
    const root = await createCanonicalTempRoot("snap-content-mtime-");
    const original = "ABCDEFGH";
    const replacement = "WXYZABCD";
    expect(original.length).toBe(replacement.length);
    await writeRelative(root, "mtime.txt", original);
    const fixture = await snapshotAt(root, { extraContentPaths: ["mtime.txt"] });
    const entry = admittedEntry(fixture.inventory, "mtime.txt");
    expect(entry.mtimeMs).not.toBeNull();
    const originalMtimeMs = entry.mtimeMs!;
    const originalMtimeSec = Math.floor(originalMtimeMs / 1000);

    await writeRelative(root, "mtime.txt", replacement);
    await utimes(path.join(root, "mtime.txt"), originalMtimeSec, originalMtimeSec);

    const identityOnly = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: "NONE" },
    );
    expect(entryResult(identityOnly, "mtime.txt")?.state).toBe("CURRENT_IDENTITY");
    expect(contentResult(identityOnly, "mtime.txt")?.state).toBe("REVALIDATION_REQUIRED");

    const contentVerify = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: [entry] },
    );
    expect(contentResult(contentVerify, "mtime.txt")?.state).toBe("STALE_CONTENT");
  });

  it("never reports VERIFIED_CURRENT for identity-only verification", async () => {
    const root = await createCanonicalTempRoot("snap-content-none-");
    await writeRelative(root, "plain.txt", "plain\n");
    const fixture = await snapshotAt(root, { extraContentPaths: ["plain.txt"] });
    const entry = admittedEntry(fixture.inventory, "plain.txt");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: "NONE" },
    );
    const content = contentResult(assessment, "plain.txt");
    expect(content?.state).toBe("REVALIDATION_REQUIRED");
    expect(content?.state).not.toBe("VERIFIED_CURRENT");
  });

  it("reports UNVERIFIABLE when no baseline ContentObservation exists", async () => {
    const root = await createCanonicalTempRoot("snap-content-nobase-");
    await writeRelative(root, "nobase.txt", "nobase\n");
    const fixture = await snapshotAt(root);
    const entry = admittedEntry(fixture.inventory, "nobase.txt");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: [entry] },
    );
    expect(contentResult(assessment, "nobase.txt")?.state).toBe("UNVERIFIABLE");
  });
});

describe("budgets and scope", () => {
  it("rejects widening verification budgets before filesystem access", () => {
    const result = validateVerificationOptions({
      maxEntryVerifications: MAX_ENTRY_VERIFICATIONS_PER_OPERATION + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_VERIFICATION_OPTIONS");
    }
  });

  it("marks truncated entries NOT_VERIFIED with BUDGET_EXHAUSTED", async () => {
    const root = await createCanonicalTempRoot("snap-budget-");
    await writeRelative(root, "a.txt", "a\n");
    await writeRelative(root, "b.txt", "b\n");
    const fixture = await snapshotAt(root);
    const a = admittedEntry(fixture.inventory, "a.txt");
    const b = admittedEntry(fixture.inventory, "b.txt");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      {
        entries: "ALL",
        content: "NONE",
        options: { maxEntryVerifications: 1 },
      },
    );
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }
    expect(assessment.value.assessmentCompletion.kind).toBe("PARTIAL");
    const verified = assessment.value.entryResults.filter(
      (item) => item.state !== "NOT_VERIFIED",
    );
    const exhausted = assessment.value.entryResults.filter(
      (item) => item.notVerifiedReason === "BUDGET_EXHAUSTED",
    );
    expect(verified.length).toBe(1);
    expect(exhausted.length).toBeGreaterThan(0);
    expect([a.relativePath, b.relativePath]).toContain(verified[0]?.relativePath);
  });

  it("rejects content ALL when entries is not ALL", async () => {
    const root = await createCanonicalTempRoot("snap-scope-");
    await writeRelative(root, "scope.txt", "scope\n");
    const fixture = await snapshotAt(root);
    const entry = admittedEntry(fixture.inventory, "scope.txt");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: "ALL" },
    );
    expect(assessment.ok).toBe(false);
    if (!assessment.ok) {
      expect(assessment.error.code).toBe("INVALID_VERIFICATION_OPTIONS");
    }
  });

  it("rejects foreign RepositoryEntry by reference identity", async () => {
    const rootA = await createCanonicalTempRoot("snap-foreign-a-");
    const rootB = await createCanonicalTempRoot("snap-foreign-b-");
    await writeRelative(rootA, "a.txt", "a\n");
    await writeRelative(rootB, "b.txt", "b\n");
    const fixtureA = await snapshotAt(rootA);
    const fixtureB = await snapshotAt(rootB);
    const foreign = admittedEntry(fixtureB.inventory, "b.txt");
    const assessment = await verifyRepositorySnapshot(
      fixtureA.snapshot,
      fixtureA.workspace,
      fixtureA.config,
      { entries: [foreign], content: "NONE" },
    );
    expect(assessment.ok).toBe(false);
    if (!assessment.ok) {
      expect(assessment.error.code).toBe("ENTRY_NOT_IN_SNAPSHOT");
    }
  });
});

describe("propagation and honesty", () => {
  it("propagates stale package.json content through the fixed six-link chain", async () => {
    const root = await createCanonicalTempRoot("snap-propagate-");
    await writePackageJson(root, "package.json", {
      name: "demo",
      dependencies: { next: "14.0.0" },
    });
    await writeRelative(root, "src/auth.ts", "export const auth = true;\n");
    const fixture = await snapshotAt(root);
    await writePackageJson(root, "package.json", {
      name: "demo",
      dependencies: { react: "18.0.0" },
    });
    const pkgEntry = admittedEntry(fixture.inventory, "package.json");
    const search = searchRepository(fixture.corpus, { terms: ["auth"] });
    expect(search.ok).toBe(true);

    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [pkgEntry], content: [pkgEntry] },
    );
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }
    expect(
      assessment.value.derivedResults.some(
        (item) =>
          item.kind === "MANIFEST_EVIDENCE" &&
          item.state === "UNSUPPORTED_STALE_EVIDENCE",
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

  it("states that an all-current assessment does not claim the repository is unchanged", async () => {
    const root = await createCanonicalTempRoot("snap-honesty-");
    await writeRelative(root, "ok.txt", "ok\n");
    const fixture = await snapshotAt(root, { extraContentPaths: ["ok.txt"] });
    const entry = admittedEntry(fixture.inventory, "ok.txt");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: [entry] },
    );
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }
    expect(assessment.value.honesty.repositoryUnchangedClaim).toBe(false);
    expect(assessment.value.honesty.newEntriesNotDetectable).toBe(true);
  });

  it("does not detect files created after snapshot assembly", async () => {
    const root = await createCanonicalTempRoot("snap-new-file-");
    await writeRelative(root, "old.txt", "old\n");
    const fixture = await snapshotAt(root, { extraContentPaths: ["old.txt"] });
    await writeRelative(root, "new.txt", "new\n");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: "ALL", content: "NONE" },
    );
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }
    expect(
      assessment.value.entryResults.some((item) => item.relativePath === "new.txt"),
    ).toBe(false);
  });

  it("reports bound Git baseline as POINT_IN_TIME only", async () => {
    const root = await createCanonicalTempRoot("snap-git-");
    await writeRelative(root, "tracked.txt", "tracked\n");
    const { initCommitWorktree } = await import("../git/fixture-helpers.js");
    await initCommitWorktree(root);
    const fixture = await snapshotAt(root, { withGit: true });
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: "ALL", content: "NONE" },
    );
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }
    expect(assessment.value.gitBaselineState).toBe("POINT_IN_TIME");
  });
});

describe("content NONE performs no reads", () => {
  it("does not invoke reader when content scope is NONE", async () => {
    const root = await createCanonicalTempRoot("snap-no-read-");
    await writeRelative(root, "read.txt", "read\n");
    const fixture = await snapshotAt(root);
    const entry = admittedEntry(fixture.inventory, "read.txt");
    await writeRelative(root, "read.txt", "changed\n");
    const assessment = await verifyRepositorySnapshot(
      fixture.snapshot,
      fixture.workspace,
      fixture.config,
      { entries: [entry], content: "NONE" },
    );
    expect(contentResult(assessment, "read.txt")?.state).not.toBe("STALE_CONTENT");
    expect(contentResult(assessment, "read.txt")?.state).toBe("UNVERIFIABLE");
  });
});
