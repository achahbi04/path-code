/**
 * Phase 6A recovery execution proofs.
 *
 * 6A-D  authorized replace recovery restores the exact pre-bytes
 * 6A-E  authorized create recovery removes exactly the created file
 * 6A-I  a change landing between review and execution becomes a conflict
 * 6A-J  mixed multi-file outcomes report RECOVERY_PARTIAL
 * 6A-P  no authorization, forged authorization and reuse are all refused
 * 6A-Q  recovery is idempotent: a second pass has nothing eligible to do
 * 6A-R  byte fidelity across CRLF, tabs, unicode and missing trailing newline
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resetRecoveryRegistryForTests } from "../../src/recovery/internal/registry.js";
import {
  authorizeRecoveryReview,
  executeRecovery,
  explicitRecoveryApproval,
  inspectRecoveryAuthorizationCompatibility,
  prepareRecoveryReview,
} from "../../src/recovery/index.js";
import type {
  CheckpointTargetInput,
  RecoveryAuthorization,
  RecoveryReview,
} from "../../src/recovery/types.js";
import {
  bytesOf,
  canonicalPathOf,
  checkpointWith,
  cleanupRecoveryFixtures,
  recoveryFixture,
  reopenCheckpoint,
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
  relativePath: string,
  pre: string,
  post: string,
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
): Promise<CheckpointTargetInput> {
  return {
    kind: "CREATE_TEXT",
    relativePath:
      parentRelative === "." ? leafName : `${parentRelative}/${leafName}`,
    parentCanonicalPath: (await canonicalPathOf(
      fx.workspace,
      parentRelative,
    )) as never,
    leafName,
    intendedPostBytes: bytesOf(CREATED),
  };
}

async function reviewOf(
  fx: RecoveryFixture,
  targets: readonly CheckpointTargetInput[],
): Promise<{ review: RecoveryReview; checkpointId: string }> {
  const checkpoint = await checkpointWith({
    workspace: fx.workspace,
    store: fx.store,
    targets,
  });
  const review = await prepareRecoveryReview(
    checkpoint,
    fx.workspace,
    fx.config,
  );
  expect(review.ok).toBe(true);
  if (!review.ok) throw new Error(review.error.message);
  return { review: review.value, checkpointId: checkpoint.checkpointId };
}

function authorizeAll(review: RecoveryReview): RecoveryAuthorization {
  const eligible = review.view.entries
    .filter((entry) => entry.disposition === "ELIGIBLE_RESTORE")
    .map((entry) => entry.entryId);
  const authorized = authorizeRecoveryReview(
    review,
    eligible,
    explicitRecoveryApproval(),
  );
  expect(authorized.ok).toBe(true);
  if (!authorized.ok) throw new Error(authorized.error.message);
  return authorized.value;
}

describe("6A-D authorized replace recovery", () => {
  it("restores the exact captured pre-bytes and proves them on disk", async () => {
    const fx = await recoveryFixture();
    const target = join(fx.root, "src/hello.ts");
    const originalMode = statSync(target).mode & 0o777;

    const checkpointTargets = [
      await replaceTarget(fx, "src/hello.ts", PRE, POST),
    ];
    writeFileSync(target, POST, "utf8");

    const { review } = await reviewOf(fx, checkpointTargets);
    expect(review.view.entries[0]!.disposition).toBe("ELIGIBLE_RESTORE");
    const authorization = authorizeAll(review);

    const executed = await executeRecovery(
      authorization,
      review,
      fx.workspace,
      fx.config,
    );
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);
    expect(executed.value.disposition).toBe("RECOVERY_COMPLETE");
    expect(executed.value.restoredCount).toBe(1);
    expect(executed.value.entries[0]!.disposition).toBe("RESTORED");
    expect(executed.value.noGitRecovery).toBe(true);
    expect(executed.value.notValidationEvidence).toBe(true);
    expect(executed.value.automaticRollback).toBe(false);

    expect(readFileSync(target)).toEqual(Buffer.from(bytesOf(PRE)));
    expect(statSync(target).mode & 0o777).toBe(originalMode);
  });
});

describe("6A-E authorized create recovery", () => {
  it("removes exactly the created file and leaves its directory intact", async () => {
    const fx = await recoveryFixture();
    const targets = [await createTarget(fx, "src", "marker.ts")];
    writeFileSync(join(fx.root, "src/marker.ts"), CREATED, "utf8");

    const { review } = await reviewOf(fx, targets);
    const authorization = authorizeAll(review);
    const executed = await executeRecovery(
      authorization,
      review,
      fx.workspace,
      fx.config,
    );
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);
    expect(executed.value.disposition).toBe("RECOVERY_COMPLETE");
    expect(executed.value.entries[0]!.verifiedAbsent).toBe(true);

    expect(existsSync(join(fx.root, "src/marker.ts"))).toBe(false);
    // The directory and its siblings survive: recovery never removes directories.
    expect(statSync(join(fx.root, "src")).isDirectory()).toBe(true);
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(PRE);
  });
});

describe("6A-I TOCTOU between review and execution", () => {
  it("refuses to overwrite a target that changed after the review", async () => {
    const fx = await recoveryFixture();
    const target = join(fx.root, "src/hello.ts");
    const targets = [await replaceTarget(fx, "src/hello.ts", PRE, POST)];
    writeFileSync(target, POST, "utf8");

    const { review } = await reviewOf(fx, targets);
    const authorization = authorizeAll(review);

    // A human edits the file after approving the review.
    const humanEdit = "export function hello() { return 'human'; }\n";
    writeFileSync(target, humanEdit, "utf8");

    const executed = await executeRecovery(
      authorization,
      review,
      fx.workspace,
      fx.config,
    );
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);
    expect(executed.value.entries[0]!.disposition).toBe("RECOVERY_CONFLICT");
    expect(executed.value.disposition).toBe("RECOVERY_NONE");
    expect(readFileSync(target, "utf8")).toBe(humanEdit);
  });

  it("refuses to remove a created file that changed after the review", async () => {
    const fx = await recoveryFixture();
    const created = join(fx.root, "src/marker.ts");
    const targets = [await createTarget(fx, "src", "marker.ts")];
    writeFileSync(created, CREATED, "utf8");

    const { review } = await reviewOf(fx, targets);
    const authorization = authorizeAll(review);
    writeFileSync(created, `${CREATED}// human\n`, "utf8");

    const executed = await executeRecovery(
      authorization,
      review,
      fx.workspace,
      fx.config,
    );
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);
    expect(executed.value.entries[0]!.disposition).toBe("RECOVERY_CONFLICT");
    expect(existsSync(created)).toBe(true);
  });
});

describe("6A-J multi-file recovery", () => {
  it("reports RECOVERY_PARTIAL when only some authorized entries restore", async () => {
    const fx = await recoveryFixture({
      files: [
        { path: "src/a.ts", content: PRE },
        { path: "src/b.ts", content: PRE },
        { path: "src/c.ts", content: PRE },
      ],
    });
    const targets = [
      await replaceTarget(fx, "src/a.ts", PRE, POST),
      await replaceTarget(fx, "src/b.ts", PRE, POST),
      await replaceTarget(fx, "src/c.ts", PRE, POST),
    ];
    writeFileSync(join(fx.root, "src/a.ts"), POST, "utf8");
    writeFileSync(join(fx.root, "src/b.ts"), POST, "utf8");
    // c.ts was never applied, so it is already in its pre-state.

    const { review } = await reviewOf(fx, targets);
    const byPath = new Map(
      review.view.entries.map((entry) => [entry.relativePath, entry] as const),
    );
    expect(byPath.get("src/a.ts")!.disposition).toBe("ELIGIBLE_RESTORE");
    expect(byPath.get("src/b.ts")!.disposition).toBe("ELIGIBLE_RESTORE");
    expect(byPath.get("src/c.ts")!.disposition).toBe("ALREADY_PRE_STATE");

    const authorization = authorizeAll(review);
    // b.ts changes after approval; a.ts is still restorable.
    const humanEdit = "export function hello() { return 'b'; }\n";
    writeFileSync(join(fx.root, "src/b.ts"), humanEdit, "utf8");

    const executed = await executeRecovery(
      authorization,
      review,
      fx.workspace,
      fx.config,
    );
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);
    expect(executed.value.disposition).toBe("RECOVERY_PARTIAL");
    expect(executed.value.authorizedCount).toBe(2);
    expect(executed.value.restoredCount).toBe(1);

    const outcomes = new Map(
      executed.value.entries.map((e) => [e.relativePath, e] as const),
    );
    expect(outcomes.get("src/a.ts")!.disposition).toBe("RESTORED");
    expect(outcomes.get("src/b.ts")!.disposition).toBe("RECOVERY_CONFLICT");
    expect(outcomes.get("src/c.ts")!.disposition).toBe("ALREADY_PRE_STATE");
    expect(outcomes.get("src/c.ts")!.authorized).toBe(false);

    expect(readFileSync(join(fx.root, "src/a.ts"), "utf8")).toBe(PRE);
    expect(readFileSync(join(fx.root, "src/b.ts"), "utf8")).toBe(humanEdit);
    expect(readFileSync(join(fx.root, "src/c.ts"), "utf8")).toBe(PRE);
  });

  it("leaves an eligible but unselected entry untouched", async () => {
    const fx = await recoveryFixture({
      files: [
        { path: "src/a.ts", content: PRE },
        { path: "src/b.ts", content: PRE },
      ],
    });
    const targets = [
      await replaceTarget(fx, "src/a.ts", PRE, POST),
      await replaceTarget(fx, "src/b.ts", PRE, POST),
    ];
    writeFileSync(join(fx.root, "src/a.ts"), POST, "utf8");
    writeFileSync(join(fx.root, "src/b.ts"), POST, "utf8");

    const { review } = await reviewOf(fx, targets);
    const selected = review.view.entries.find(
      (entry) => entry.relativePath === "src/a.ts",
    )!;
    const authorized = authorizeRecoveryReview(
      review,
      [selected.entryId],
      explicitRecoveryApproval(),
    );
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) throw new Error(authorized.error.message);

    const executed = await executeRecovery(
      authorized.value,
      review,
      fx.workspace,
      fx.config,
    );
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);
    expect(executed.value.disposition).toBe("RECOVERY_COMPLETE");
    const outcomes = new Map(
      executed.value.entries.map((e) => [e.relativePath, e] as const),
    );
    expect(outcomes.get("src/b.ts")!.disposition).toBe(
      "SKIPPED_NOT_AUTHORIZED",
    );
    expect(readFileSync(join(fx.root, "src/a.ts"), "utf8")).toBe(PRE);
    expect(readFileSync(join(fx.root, "src/b.ts"), "utf8")).toBe(POST);
  });
});

describe("6A-P authorization is required, unforgeable and one-shot", () => {
  it("refuses a forged authorization and never writes", async () => {
    const fx = await recoveryFixture();
    const target = join(fx.root, "src/hello.ts");
    const targets = [await replaceTarget(fx, "src/hello.ts", PRE, POST)];
    writeFileSync(target, POST, "utf8");
    const { review, checkpointId } = await reviewOf(fx, targets);

    // Exactly what a model could produce: a plain object of the right shape.
    const forged = {
      authorizationId: "recovery-auth-forged",
      reviewId: review.reviewId,
      checkpointId,
      authorizedEntryIds: [review.view.entries[0]!.entryId],
      issuedAtMs: Date.now(),
    } as unknown as RecoveryAuthorization;

    expect(
      inspectRecoveryAuthorizationCompatibility(forged, review).ok,
    ).toBe(false);
    const executed = await executeRecovery(
      forged,
      review,
      fx.workspace,
      fx.config,
    );
    expect(executed.ok).toBe(false);
    if (!executed.ok) {
      expect(executed.error.code).toBe("AUTHORIZATION_NOT_REGISTERED");
    }
    expect(readFileSync(target, "utf8")).toBe(POST);
  });

  it("refuses approval tokens that were not minted by the host constructor", async () => {
    const fx = await recoveryFixture();
    writeFileSync(join(fx.root, "src/hello.ts"), POST, "utf8");
    const { review } = await reviewOf(fx, [
      await replaceTarget(fx, "src/hello.ts", PRE, POST),
    ]);
    const fabricated = { kind: "APPROVED" } as unknown as ReturnType<
      typeof explicitRecoveryApproval
    >;
    const authorized = authorizeRecoveryReview(
      review,
      [review.view.entries[0]!.entryId],
      fabricated,
    );
    expect(authorized.ok).toBe(false);
    if (!authorized.ok) {
      expect(authorized.error.code).toBe("APPROVAL_REQUIRED");
    }
  });

  it("refuses reuse of a consumed authorization", async () => {
    const fx = await recoveryFixture();
    const target = join(fx.root, "src/hello.ts");
    writeFileSync(target, POST, "utf8");
    const { review } = await reviewOf(fx, [
      await replaceTarget(fx, "src/hello.ts", PRE, POST),
    ]);
    const authorization = authorizeAll(review);

    const first = await executeRecovery(
      authorization,
      review,
      fx.workspace,
      fx.config,
    );
    expect(first.ok).toBe(true);
    const second = await executeRecovery(
      authorization,
      review,
      fx.workspace,
      fx.config,
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("AUTHORIZATION_ALREADY_CONSUMED");
    }
    expect(readFileSync(target, "utf8")).toBe(PRE);
  });

  it("refuses an authorization bound to a different review", async () => {
    const fx = await recoveryFixture();
    writeFileSync(join(fx.root, "src/hello.ts"), POST, "utf8");
    const targets = [await replaceTarget(fx, "src/hello.ts", PRE, POST)];
    const first = await reviewOf(fx, targets);
    const authorization = authorizeAll(first.review);

    const second = await prepareRecoveryReview(
      await reopenCheckpoint(fx.storeRoot, first.checkpointId),
      fx.workspace,
      fx.config,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error(second.error.message);

    const executed = await executeRecovery(
      authorization,
      second.value,
      fx.workspace,
      fx.config,
    );
    expect(executed.ok).toBe(false);
    if (!executed.ok) {
      expect(executed.error.code).toBe("AUTHORIZATION_REVIEW_MISMATCH");
    }
  });
});

describe("6A-Q recovery idempotence", () => {
  it("has nothing eligible to do on a second pass", async () => {
    const fx = await recoveryFixture();
    const target = join(fx.root, "src/hello.ts");
    const created = join(fx.root, "src/marker.ts");
    const targets = [
      await replaceTarget(fx, "src/hello.ts", PRE, POST),
      await createTarget(fx, "src", "marker.ts"),
    ];
    writeFileSync(target, POST, "utf8");
    writeFileSync(created, CREATED, "utf8");

    const { review, checkpointId } = await reviewOf(fx, targets);
    const executed = await executeRecovery(
      authorizeAll(review),
      review,
      fx.workspace,
      fx.config,
    );
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);
    expect(executed.value.disposition).toBe("RECOVERY_COMPLETE");

    const secondReview = await prepareRecoveryReview(
      await reopenCheckpoint(fx.storeRoot, checkpointId),
      fx.workspace,
      fx.config,
    );
    expect(secondReview.ok).toBe(true);
    if (!secondReview.ok) throw new Error(secondReview.error.message);
    const dispositions = secondReview.value.view.entries.map(
      (entry) => entry.disposition,
    );
    expect(dispositions).toEqual(["ALREADY_PRE_STATE", "NOT_APPLIED"]);

    const authorized = authorizeRecoveryReview(
      secondReview.value,
      secondReview.value.view.entries.map((entry) => entry.entryId),
      explicitRecoveryApproval(),
    );
    expect(authorized.ok).toBe(false);
    if (!authorized.ok) {
      expect(authorized.error.code).toBe("ENTRY_NOT_ELIGIBLE");
    }
    expect(readFileSync(target, "utf8")).toBe(PRE);
    expect(existsSync(created)).toBe(false);
  });

  it("refuses an empty selection", async () => {
    const fx = await recoveryFixture();
    writeFileSync(join(fx.root, "src/hello.ts"), POST, "utf8");
    const { review } = await reviewOf(fx, [
      await replaceTarget(fx, "src/hello.ts", PRE, POST),
    ]);
    const authorized = authorizeRecoveryReview(
      review,
      [],
      explicitRecoveryApproval(),
    );
    expect(authorized.ok).toBe(false);
    if (!authorized.ok) {
      expect(authorized.error.code).toBe("NO_ELIGIBLE_ENTRY_SELECTED");
    }
  });
});

describe("6A-R byte fidelity", () => {
  const AWKWARD =
    "\uFEFFexport const s = 'héllo — ünïcode 👋';\r\n\tconst tabbed = 1;\r\n\nconst trailing = 'no newline at eof';";

  it("restores CRLF, tabs, BOM, unicode and a missing trailing newline exactly", async () => {
    const fx = await recoveryFixture({
      files: [{ path: "src/awkward.ts", content: AWKWARD }],
    });
    const target = join(fx.root, "src/awkward.ts");
    const originalBytes = readFileSync(target);
    expect(originalBytes).toEqual(Buffer.from(bytesOf(AWKWARD)));

    const rewritten = `${AWKWARD}\n// appended by Path Code\r\n`;
    const targets = [
      await replaceTarget(fx, "src/awkward.ts", AWKWARD, rewritten),
    ];
    writeFileSync(target, rewritten, "utf8");

    const { review } = await reviewOf(fx, targets);
    expect(review.view.entries[0]!.disposition).toBe("ELIGIBLE_RESTORE");
    const executed = await executeRecovery(
      authorizeAll(review),
      review,
      fx.workspace,
      fx.config,
    );
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);
    expect(executed.value.disposition).toBe("RECOVERY_COMPLETE");

    const restored = readFileSync(target);
    expect(restored).toEqual(originalBytes);
    expect(restored.byteLength).toBe(originalBytes.byteLength);
  });
});
