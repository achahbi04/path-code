/**
 * Phase 6A checkpoint durability and integrity proofs.
 *
 * 6A-C  process-restart durability through a brand-new store instance
 * 6A-L  manifest corruption refuses the entire checkpoint
 * 6A-M  blob corruption invalidates exactly one entry; siblings proceed
 * 6A-N  workspace mismatch refuses the entire checkpoint
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resetRecoveryRegistryForTests } from "../../src/recovery/internal/registry.js";
import {
  loadCheckpoint,
  persistCheckpoint,
  prepareCheckpoint,
  prepareRecoveryReview,
  validateCheckpointManifest,
} from "../../src/recovery/index.js";
import {
  boundaryFor,
  bytesOf,
  canonicalPathOf,
  checkpointDirectory,
  checkpointWith,
  cleanupRecoveryFixtures,
  createCanonicalTempRoot,
  recoveryFixture,
  reopenCheckpoint,
  resolvedConfigAt,
  storeAt,
  writeRelative,
} from "./helpers.js";

afterEach(async () => {
  resetRecoveryRegistryForTests();
  await cleanupRecoveryFixtures();
});

const PRE = "export function hello() { return 1; }\n";
const POST = "export function hello() { return 42; }\n";

describe("6A store hygiene", () => {
  it("persists outside the workspace with owner-only modes and no Git", async () => {
    const fx = await recoveryFixture();
    const descriptor = fx.store.describe();
    expect(descriptor.rootDirectory.startsWith(fx.root)).toBe(false);
    expect(descriptor.usesGit).toBe(false);
    expect(descriptor.storesCredentials).toBe(false);
    expect(descriptor.encryptsAtRest).toBe(false);

    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [
        {
          kind: "REPLACE_TEXT",
          relativePath: "src/hello.ts",
          targetCanonicalPath: (await canonicalPathOf(
            fx.workspace,
            "src/hello.ts",
          )) as never,
          preBytes: bytesOf(PRE),
          intendedPostBytes: bytesOf(POST),
        },
      ],
    });

    const directory = checkpointDirectory(fx.storeRoot, checkpoint.checkpointId);
    expect(existsSync(join(directory, "manifest.json"))).toBe(true);
    // Nothing about the checkpoint lives inside the protected workspace.
    expect(existsSync(join(fx.root, "checkpoints"))).toBe(false);

    if (process.platform === "darwin" || process.platform === "linux") {
      expect(statSync(directory).mode & 0o777).toBe(0o700);
      expect(statSync(join(directory, "manifest.json")).mode & 0o777).toBe(
        0o600,
      );
    }
    expect(readFileSync(join(directory, "manifest.json"), "utf8")).not.toMatch(
      /OPENAI|api[_-]?key/i,
    );
  });

  it("refuses a relative store root", async () => {
    const { createRecoveryStore } = await import(
      "../../src/recovery/index.js"
    );
    const created = createRecoveryStore({ rootDirectory: "relative/store" });
    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect(created.error.code).toBe("STORE_ROOT_UNAVAILABLE");
    }
  });
});

describe("6A-C process-restart durability", () => {
  it("reopens a persisted checkpoint through a fresh store instance", async () => {
    const fx = await recoveryFixture();
    const canonical = await canonicalPathOf(fx.workspace, "src/hello.ts");
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [
        {
          kind: "REPLACE_TEXT",
          relativePath: "src/hello.ts",
          targetCanonicalPath: canonical as never,
          preBytes: bytesOf(PRE),
          intendedPostBytes: bytesOf(POST),
        },
      ],
    });

    // A brand-new store object over the same root — what a new process sees.
    const reopened = await reopenCheckpoint(
      fx.storeRoot,
      checkpoint.checkpointId,
    );
    expect(reopened.checkpointId).toBe(checkpoint.checkpointId);
    expect(reopened.manifest.entries).toHaveLength(1);
    expect(reopened.manifest.entries[0]!.relativePath).toBe("src/hello.ts");
    expect(reopened.manifest.workspaceRoot).toBe(
      checkpoint.manifest.workspaceRoot,
    );

    // The reopened checkpoint is usable: it still classifies live state.
    writeFileSync(join(fx.root, "src/hello.ts"), POST, "utf8");
    const review = await prepareRecoveryReview(
      reopened,
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);
    expect(review.value.view.entries[0]!.disposition).toBe("ELIGIBLE_RESTORE");
  });

  it("refuses a checkpoint id that is not in the store", async () => {
    const fx = await recoveryFixture();
    const missing = await loadCheckpoint(fx.store, "no-such-checkpoint");
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe("CHECKPOINT_NOT_FOUND");
    }
  });
});

describe("6A-L manifest corruption refuses the whole checkpoint", () => {
  it("refuses unparseable, mis-versioned and structurally broken manifests", async () => {
    const fx = await recoveryFixture();
    const canonical = await canonicalPathOf(fx.workspace, "src/hello.ts");
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [
        {
          kind: "REPLACE_TEXT",
          relativePath: "src/hello.ts",
          targetCanonicalPath: canonical as never,
          preBytes: bytesOf(PRE),
          intendedPostBytes: bytesOf(POST),
        },
      ],
    });
    const manifestPath = join(
      checkpointDirectory(fx.storeRoot, checkpoint.checkpointId),
      "manifest.json",
    );
    const original = readFileSync(manifestPath, "utf8");

    writeFileSync(manifestPath, "{not json", "utf8");
    const unparseable = await loadCheckpoint(
      await storeAt(fx.storeRoot),
      checkpoint.checkpointId,
    );
    expect(unparseable.ok).toBe(false);
    if (!unparseable.ok) {
      expect(unparseable.error.code).toBe("CHECKPOINT_MANIFEST_INVALID");
    }

    const misVersioned = JSON.parse(original) as Record<string, unknown>;
    misVersioned.schemaVersion = 99;
    writeFileSync(manifestPath, JSON.stringify(misVersioned), "utf8");
    const versioned = await loadCheckpoint(
      await storeAt(fx.storeRoot),
      checkpoint.checkpointId,
    );
    expect(versioned.ok).toBe(false);
    if (!versioned.ok) {
      expect(versioned.error.code).toBe("CHECKPOINT_MANIFEST_INVALID");
    }

    const broken = JSON.parse(original) as {
      entries: { intendedPost: { digest: { hex: string } } }[];
    };
    delete (broken.entries[0]!.intendedPost as { digest?: unknown }).digest;
    writeFileSync(manifestPath, JSON.stringify(broken), "utf8");
    const structural = await loadCheckpoint(
      await storeAt(fx.storeRoot),
      checkpoint.checkpointId,
    );
    expect(structural.ok).toBe(false);
    if (!structural.ok) {
      expect(structural.error.code).toBe("CHECKPOINT_MANIFEST_INVALID");
    }

    // A manifest whose recorded identity no longer matches its location is
    // also refused, so a copied checkpoint cannot masquerade as another.
    const renamed = JSON.parse(original) as Record<string, unknown>;
    renamed.checkpointId = "some-other-checkpoint";
    writeFileSync(manifestPath, JSON.stringify(renamed), "utf8");
    const mismatched = await loadCheckpoint(
      await storeAt(fx.storeRoot),
      checkpoint.checkpointId,
    );
    expect(mismatched.ok).toBe(false);

    // A manifest that drops the no-Git declaration is refused outright.
    const noDeclaration = JSON.parse(original) as Record<string, unknown>;
    delete noDeclaration.noGitRecovery;
    expect(validateCheckpointManifest(noDeclaration).ok).toBe(false);
  });
});

describe("6A-M blob corruption invalidates exactly one entry", () => {
  it("invalidates the corrupt entry and still reviews its sibling", async () => {
    const fx = await recoveryFixture({
      files: [
        { path: "src/hello.ts", content: PRE },
        { path: "src/other.ts", content: PRE },
      ],
    });
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [
        {
          kind: "REPLACE_TEXT",
          relativePath: "src/hello.ts",
          targetCanonicalPath: (await canonicalPathOf(
            fx.workspace,
            "src/hello.ts",
          )) as never,
          preBytes: bytesOf(PRE),
          intendedPostBytes: bytesOf(POST),
        },
        {
          kind: "REPLACE_TEXT",
          relativePath: "src/other.ts",
          targetCanonicalPath: (await canonicalPathOf(
            fx.workspace,
            "src/other.ts",
          )) as never,
          preBytes: bytesOf(PRE),
          intendedPostBytes: bytesOf(POST),
        },
      ],
    });

    // Both files now hold exactly what Path Code "wrote".
    writeFileSync(join(fx.root, "src/hello.ts"), POST, "utf8");
    writeFileSync(join(fx.root, "src/other.ts"), POST, "utf8");

    // Corrupt the first entry's pre-state blob only.
    const blobPath = join(
      checkpointDirectory(fx.storeRoot, checkpoint.checkpointId),
      "blobs",
      "entry-1.pre",
    );
    writeFileSync(blobPath, `${PRE}tampered`, "utf8");

    const reopened = await reopenCheckpoint(
      fx.storeRoot,
      checkpoint.checkpointId,
    );
    const review = await prepareRecoveryReview(
      reopened,
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);
    const [first, second] = review.value.view.entries;
    expect(first!.disposition).toBe("RECOVERY_ENTRY_INVALID");
    expect(first!.proposedAction.kind).toBe("NONE");
    expect(second!.disposition).toBe("ELIGIBLE_RESTORE");
  });

  it("invalidates an entry whose blob is missing entirely", async () => {
    const fx = await recoveryFixture();
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [
        {
          kind: "REPLACE_TEXT",
          relativePath: "src/hello.ts",
          targetCanonicalPath: (await canonicalPathOf(
            fx.workspace,
            "src/hello.ts",
          )) as never,
          preBytes: bytesOf(PRE),
          intendedPostBytes: bytesOf(POST),
        },
      ],
    });
    const { rmSync } = await import("node:fs");
    rmSync(
      join(
        checkpointDirectory(fx.storeRoot, checkpoint.checkpointId),
        "blobs",
        "entry-1.pre",
      ),
    );
    const review = await prepareRecoveryReview(
      await reopenCheckpoint(fx.storeRoot, checkpoint.checkpointId),
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);
    expect(review.value.view.entries[0]!.disposition).toBe(
      "RECOVERY_ENTRY_INVALID",
    );
  });
});

describe("6A-N workspace mismatch refuses the whole checkpoint", () => {
  it("refuses review against a different workspace root", async () => {
    const fx = await recoveryFixture();
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [
        {
          kind: "REPLACE_TEXT",
          relativePath: "src/hello.ts",
          targetCanonicalPath: (await canonicalPathOf(
            fx.workspace,
            "src/hello.ts",
          )) as never,
          preBytes: bytesOf(PRE),
          intendedPostBytes: bytesOf(POST),
        },
      ],
    });

    const otherRoot = await createCanonicalTempRoot("phase6a-other-");
    await writeRelative(otherRoot, "src/hello.ts", POST);
    const otherWorkspace = await boundaryFor(otherRoot);
    const otherConfig = await resolvedConfigAt(otherRoot);

    const review = await prepareRecoveryReview(
      checkpoint,
      otherWorkspace,
      otherConfig,
    );
    expect(review.ok).toBe(false);
    if (!review.ok) {
      expect(review.error.code).toBe("CHECKPOINT_WORKSPACE_MISMATCH");
    }
    // The other workspace was not touched.
    expect(readFileSync(join(otherRoot, "src/hello.ts"), "utf8")).toBe(POST);
  });
});

describe("6A checkpoint construction bounds", () => {
  it("refuses duplicate targets, escaping paths and empty target lists", async () => {
    const fx = await recoveryFixture();
    const workspaceRoot = await canonicalPathOf(fx.workspace, ".");
    const canonical = await canonicalPathOf(fx.workspace, "src/hello.ts");
    const replaceTarget = {
      kind: "REPLACE_TEXT" as const,
      relativePath: "src/hello.ts",
      targetCanonicalPath: canonical as never,
      preBytes: bytesOf(PRE),
      intendedPostBytes: bytesOf(POST),
    };

    const empty = prepareCheckpoint({
      workspaceRoot: workspaceRoot as never,
      sessionId: "s",
      reviewId: "r",
      targets: [],
    });
    expect(empty.ok).toBe(false);

    const duplicate = prepareCheckpoint({
      workspaceRoot: workspaceRoot as never,
      sessionId: "s",
      reviewId: "r",
      targets: [replaceTarget, replaceTarget],
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.code).toBe("INVALID_CHECKPOINT_INPUT");
    }

    const escaping = prepareCheckpoint({
      workspaceRoot: workspaceRoot as never,
      sessionId: "s",
      reviewId: "r",
      targets: [{ ...replaceTarget, relativePath: "../outside.ts" }],
    });
    expect(escaping.ok).toBe(false);
    if (!escaping.ok) {
      expect(escaping.error.code).toBe("INVALID_CHECKPOINT_INPUT");
    }
  });

  it("reports read-back failure when the store cannot return what it wrote", async () => {
    const fx = await recoveryFixture();
    const workspaceRoot = await canonicalPathOf(fx.workspace, ".");
    const prepared = prepareCheckpoint({
      workspaceRoot: workspaceRoot as never,
      sessionId: "s",
      reviewId: "r",
      targets: [
        {
          kind: "REPLACE_TEXT",
          relativePath: "src/hello.ts",
          targetCanonicalPath: (await canonicalPathOf(
            fx.workspace,
            "src/hello.ts",
          )) as never,
          preBytes: bytesOf(PRE),
          intendedPostBytes: bytesOf(POST),
        },
      ],
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error(prepared.error.message);

    const lyingStore = {
      describe: () => fx.store.describe(),
      writeCheckpoint: async () => ({ ok: true as const, value: true as const }),
      readManifestJson: async () => ({
        ok: true as const,
        value: '{"schemaVersion":1}',
      }),
      readBlob: async () => ({
        ok: true as const,
        value: new Uint8Array([1, 2, 3]),
      }),
    };
    const persisted = await persistCheckpoint(prepared.value, lyingStore);
    expect(persisted.ok).toBe(false);
    if (!persisted.ok) {
      expect(persisted.error.code).toBe("CHECKPOINT_READBACK_FAILED");
    }
  });
});
