/**
 * Phase 6A review classification proofs.
 *
 * 6A-F  external modification of a replaced file is a conflict
 * 6A-G  external modification of a created file is a conflict
 * 6A-H  identical size and mtime with different content is still a conflict
 * 6A-O  symlink / outside-workspace resolution refuses the entry
 */

import { rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resetRecoveryRegistryForTests } from "../../src/recovery/internal/registry.js";
import {
  authorizeRecoveryReview,
  explicitRecoveryApproval,
  prepareRecoveryReview,
} from "../../src/recovery/index.js";
import type { CheckpointTargetInput } from "../../src/recovery/types.js";
import {
  bytesOf,
  canonicalPathOf,
  checkpointWith,
  cleanupRecoveryFixtures,
  createCanonicalTempRoot,
  recoveryFixture,
  writeRelative,
  type RecoveryFixture,
} from "./helpers.js";

afterEach(async () => {
  resetRecoveryRegistryForTests();
  await cleanupRecoveryFixtures();
});

const PRE = "export function hello() { return 1; }\n";
const POST = "export function hello() { return 42; }\n";
const CREATED = "export const marker = 1;\n";

async function replaceTarget(
  fx: RecoveryFixture,
  relativePath = "src/hello.ts",
  pre = PRE,
  post = POST,
): Promise<CheckpointTargetInput> {
  return {
    kind: "REPLACE_TEXT",
    relativePath,
    targetCanonicalPath: (await canonicalPathOf(
      fx.workspace,
      relativePath,
    )) as never,
    preBytes: bytesOf(pre),
    intendedPostBytes: bytesOf(post),
  };
}

async function createTarget(
  fx: RecoveryFixture,
  parentRelative: string,
  leafName: string,
  post = CREATED,
): Promise<CheckpointTargetInput> {
  return {
    kind: "CREATE_TEXT",
    relativePath: parentRelative === "." ? leafName : `${parentRelative}/${leafName}`,
    parentCanonicalPath: (await canonicalPathOf(
      fx.workspace,
      parentRelative,
    )) as never,
    leafName,
    intendedPostBytes: bytesOf(post),
  };
}

describe("6A review classification", () => {
  it("classifies applied replace as eligible and untouched pre-state as already restored", async () => {
    const fx = await recoveryFixture();
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [await replaceTarget(fx)],
    });

    const beforeApply = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(beforeApply.ok).toBe(true);
    if (!beforeApply.ok) throw new Error(beforeApply.error.message);
    expect(beforeApply.value.view.entries[0]!.disposition).toBe(
      "ALREADY_PRE_STATE",
    );

    writeFileSync(join(fx.root, "src/hello.ts"), POST, "utf8");
    const afterApply = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(afterApply.ok).toBe(true);
    if (!afterApply.ok) throw new Error(afterApply.error.message);
    const entry = afterApply.value.view.entries[0]!;
    expect(entry.disposition).toBe("ELIGIBLE_RESTORE");
    expect(entry.proposedAction).toEqual({
      kind: "WRITE_PRE_BYTES",
      byteLength: bytesOf(PRE).byteLength,
    });
    expect(entry.observation.present).toBe(true);
  });

  it("classifies an unapplied create as NOT_APPLIED and an applied one as eligible", async () => {
    const fx = await recoveryFixture();
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [await createTarget(fx, "src", "marker.ts")],
    });

    const notApplied = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(notApplied.ok).toBe(true);
    if (!notApplied.ok) throw new Error(notApplied.error.message);
    expect(notApplied.value.view.entries[0]!.disposition).toBe("NOT_APPLIED");

    writeFileSync(join(fx.root, "src/marker.ts"), CREATED, "utf8");
    const applied = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error.message);
    expect(applied.value.view.entries[0]!.disposition).toBe("ELIGIBLE_RESTORE");
    expect(applied.value.view.entries[0]!.proposedAction.kind).toBe(
      "REMOVE_CREATED_FILE",
    );
  });

  it("6A-F: an externally modified replace target is a conflict, not a restore", async () => {
    const fx = await recoveryFixture();
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [await replaceTarget(fx)],
    });
    writeFileSync(
      join(fx.root, "src/hello.ts"),
      "export function hello() { return 'human edit'; }\n",
      "utf8",
    );
    const review = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);
    const entry = review.value.view.entries[0]!;
    expect(entry.disposition).toBe("RECOVERY_CONFLICT");
    expect(entry.proposedAction.kind).toBe("NONE");

    const authorized = authorizeRecoveryReview(
      review.value,
      [entry.entryId],
      explicitRecoveryApproval(),
    );
    expect(authorized.ok).toBe(false);
    if (!authorized.ok) {
      expect(authorized.error.code).toBe("ENTRY_NOT_ELIGIBLE");
    }
  });

  it("6A-F: a removed replace target is a conflict; recovery never recreates it", async () => {
    const fx = await recoveryFixture();
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [await replaceTarget(fx)],
    });
    rmSync(join(fx.root, "src/hello.ts"));
    const review = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);
    expect(review.value.view.entries[0]!.disposition).toBe("RECOVERY_CONFLICT");
  });

  it("6A-G: an externally modified created file is a conflict, not a removal", async () => {
    const fx = await recoveryFixture();
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [await createTarget(fx, "src", "marker.ts")],
    });
    writeFileSync(
      join(fx.root, "src/marker.ts"),
      `${CREATED}// a human added this line\n`,
      "utf8",
    );
    const review = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);
    const entry = review.value.view.entries[0]!;
    expect(entry.disposition).toBe("RECOVERY_CONFLICT");
    expect(entry.proposedAction.kind).toBe("NONE");
  });

  it("6A-H: same byte length and mtime with different content is still a conflict", async () => {
    const fx = await recoveryFixture();
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [await replaceTarget(fx)],
    });
    const target = join(fx.root, "src/hello.ts");
    writeFileSync(target, POST, "utf8");
    const applied = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error.message);
    expect(applied.value.view.entries[0]!.disposition).toBe("ELIGIBLE_RESTORE");

    // Same length as POST, one differing byte, and the timestamps forced back.
    const sneaky = POST.replace("42", "43");
    expect(bytesOf(sneaky).byteLength).toBe(bytesOf(POST).byteLength);
    const frozen = new Date(1_700_000_000_000);
    writeFileSync(target, sneaky, "utf8");
    utimesSync(target, frozen, frozen);

    const review = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);
    const entry = review.value.view.entries[0]!;
    expect(entry.disposition).toBe("RECOVERY_CONFLICT");
    expect(entry.observation.byteLength).toBe(bytesOf(POST).byteLength);
  });

  it("6A-O: a target that becomes a symlink outside the workspace is refused", async () => {
    const fx = await recoveryFixture();
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [await replaceTarget(fx)],
    });

    const outside = await createCanonicalTempRoot("phase6a-outside-");
    await writeRelative(outside, "escaped.ts", POST);
    rmSync(join(fx.root, "src/hello.ts"));
    symlinkSync(join(outside, "escaped.ts"), join(fx.root, "src/hello.ts"));

    const review = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);
    const entry = review.value.view.entries[0]!;
    expect(entry.disposition).toBe("RECOVERY_ENTRY_INVALID");
    expect(entry.proposedAction.kind).toBe("NONE");
    // The escape target is untouched.
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(join(outside, "escaped.ts"), "utf8")).toBe(POST);
  });

  it("6A-O: a target that becomes an in-workspace symlink to another file is refused", async () => {
    const fx = await recoveryFixture({
      files: [
        { path: "src/hello.ts", content: PRE },
        { path: "src/real.ts", content: POST },
      ],
    });
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [await replaceTarget(fx)],
    });
    rmSync(join(fx.root, "src/hello.ts"));
    symlinkSync(join(fx.root, "src/real.ts"), join(fx.root, "src/hello.ts"));

    const review = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);
    expect(review.value.view.entries[0]!.disposition).toBe(
      "RECOVERY_ENTRY_INVALID",
    );
  });

  it("6A-O: a create target whose parent becomes a symlink is refused", async () => {
    const fx = await recoveryFixture({
      files: [
        { path: "pkg/keep.ts", content: PRE },
        { path: "other/keep.ts", content: PRE },
      ],
    });
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [await createTarget(fx, "pkg", "marker.ts")],
    });
    rmSync(join(fx.root, "pkg"), { recursive: true });
    symlinkSync(join(fx.root, "other"), join(fx.root, "pkg"));
    writeFileSync(join(fx.root, "other/marker.ts"), CREATED, "utf8");

    const review = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);
    expect(review.value.view.entries[0]!.disposition).toBe(
      "RECOVERY_ENTRY_INVALID",
    );
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(join(fx.root, "other/marker.ts"), "utf8")).toBe(CREATED);
  });

  it("refuses a review that is not registered", async () => {
    const fx = await recoveryFixture();
    const checkpoint = await checkpointWith({
      workspace: fx.workspace,
      store: fx.store,
      targets: [await replaceTarget(fx)],
    });
    writeFileSync(join(fx.root, "src/hello.ts"), POST, "utf8");
    const review = await prepareRecoveryReview(
      checkpoint,
      fx.workspace,
      fx.config,
    );
    expect(review.ok).toBe(true);
    if (!review.ok) throw new Error(review.error.message);

    const forged = {
      reviewId: review.value.reviewId,
      view: review.value.view,
    } as unknown as typeof review.value;
    const authorized = authorizeRecoveryReview(
      forged,
      [review.value.view.entries[0]!.entryId],
      explicitRecoveryApproval(),
    );
    expect(authorized.ok).toBe(false);
    if (!authorized.ok) {
      expect(authorized.error.code).toBe("REVIEW_NOT_REGISTERED");
    }
  });
});
