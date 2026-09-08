/**
 * Phase 6A mutation-session integration proofs.
 *
 * 6A-A  a checkpoint that cannot be established produces ZERO mutation writes
 * 6A-B  recovery restores the OBSERVED pre-state, not Git HEAD
 * 6A-K  an interrupted arc leaves a usable checkpoint for a mixed live state
 * 6A-S  validation failure never triggers automatic recovery
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import { resetEngineeringRunRegistryForTests } from "../../src/engineering-run/internal/registry.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import { disposeReferenceCatalog } from "../../src/reasoning/catalog.js";
import { resetExecutionEvidenceRegistryForTests } from "../../src/reasoning/gate2/registry.js";
import { resetRunEvidenceRegistryForTests } from "../../src/run-evidence/internal/registry.js";
import { resetValidationRegistryForTests } from "../../src/validation/internal/registry.js";
import { openEngineeringMutationSession } from "../../src/orchestrator/mutation/index.js";
import type {
  EngineeringMutationSessionSpec,
  MutationReview,
} from "../../src/orchestrator/mutation/types.js";
import { resetRecoveryRegistryForTests } from "../../src/recovery/internal/registry.js";
import {
  authorizeRecoveryReview,
  executeRecovery,
  explicitRecoveryApproval,
  prepareRecoveryReview,
} from "../../src/recovery/index.js";
import type { RecoveryStore } from "../../src/recovery/types.js";
import { fixtureGit, initCommitWorktree } from "../git/fixture-helpers.js";
import {
  authorizePairs,
  authorizePlan,
  buildDualProfileBrain,
  cleanupReasoningFixtures,
  editEnvelope,
  handleFor,
  mixedReasoning,
  mutationFixture,
  nodeRequest,
  postEditDefinesBehaves,
  replaceReasoning,
  writeScript,
} from "../mutation/helpers.js";
import {
  boundaryFor,
  cleanupRecoveryFixtures,
  freshStore,
  resolvedConfigAt,
  storeAt,
} from "./helpers.js";

afterEach(async () => {
  resetAuthorizationRegistryForTests();
  resetExecutionEvidenceRegistryForTests();
  resetEngineeringRunRegistryForTests();
  resetRunEvidenceRegistryForTests();
  resetValidationRegistryForTests();
  resetLocalProcessRegistryForTests();
  resetRecoveryRegistryForTests();
  await cleanupRecoveryFixtures();
  await cleanupReasoningFixtures();
});

const OBSERVED = "export function hello() { return 2; }\n";
const MUTATED = "export function hello() { return 42; }\n";
const CREATED = "// targeted regression marker\nexport const expectHello = 42;\n";

type Fixture = Awaited<ReturnType<typeof mutationFixture>>;

/** Brain that proposes the replace (and optionally the create) it is given. */
async function proposingBrain(
  fx: Fixture,
  input: { readonly afterText: string; readonly createText?: string },
) {
  const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
  const dirHandle = handleFor(fx.descriptors, "ENTRY", "src");
  return buildDualProfileBrain(async (packet, control) => {
    if (packet.responseProfile.kind === "ENGINEERING_EDIT_PROPOSAL_JSON") {
      const block = packet.context.blocks.find(
        (b) => b.blockId === "permitted-targets",
      );
      const parsed = JSON.parse(block!.text) as {
        permittedTargets: { targetId: string; kind: string }[];
      };
      const replace = parsed.permittedTargets.find(
        (t) => t.kind === "REPLACE_TEXT",
      )!;
      const create = parsed.permittedTargets.find(
        (t) => t.kind === "CREATE_TEXT",
      );
      const changes = [
        {
          changeId: "e1",
          kind: "REPLACE_TEXT" as const,
          targetId: replace.targetId,
          supportingClaimIds: ["source-1"],
          afterText: input.afterText,
        },
      ];
      if (create !== undefined && input.createText !== undefined) {
        changes.push({
          changeId: "e2",
          kind: "CREATE_TEXT" as unknown as "REPLACE_TEXT",
          targetId: create.targetId,
          supportingClaimIds: ["parent-1"],
          afterText: input.createText,
        });
      }
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: editEnvelope({
          reasoningProposalJson:
            create !== undefined && input.createText !== undefined
              ? mixedReasoning(contentHandle, dirHandle)
              : replaceReasoning(contentHandle),
          changes,
        }),
        usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
      };
    }
    const helloRef = packet.context.references.find(
      (r) => r.evidenceKind === "CONTENT" && r.relativePath === "src/hello.ts",
    );
    return {
      kind: "COMPLETE",
      invocationId: control.invocationId,
      text: postEditDefinesBehaves(helloRef?.handle ?? contentHandle),
      usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
    };
  });
}

async function openProtectedSession(input: {
  readonly fx: Fixture;
  readonly store?: RecoveryStore;
  readonly protection?: "REQUIRED" | "NONE";
  readonly afterText: string;
  readonly createText?: string;
  readonly checkScriptPath?: string;
}) {
  const { fx } = input;
  const brain = await proposingBrain(fx, {
    afterText: input.afterText,
    ...(input.createText === undefined ? {} : { createText: input.createText }),
  });
  const checkScript =
    input.checkScriptPath ??
    (await writeScript(fx.root, "ok.mjs", "process.exit(0);\n"));

  const spec: EngineeringMutationSessionSpec = {
    workspace: fx.fixture.workspace,
    snapshot: fx.fixture.snapshot,
    catalog: fx.catalog,
    brain,
    permittedTargets:
      input.createText === undefined
        ? [
            {
              kind: "REPLACE_TEXT",
              contentObservation: fx.sourceObservation,
              entry: fx.sourceEntry,
            },
          ]
        : [
            {
              kind: "REPLACE_TEXT",
              contentObservation: fx.sourceObservation,
              entry: fx.sourceEntry,
            },
            {
              kind: "CREATE_TEXT",
              parentDirectory: fx.srcDir,
              leafName: "regression.ts",
            },
          ],
    disclosedObservations: [fx.sourceObservation],
    validationBlueprint: {
      checks: [
        {
          id: "targeted",
          kind: "TARGETED_TEST",
          request: nodeRequest(fx.root, checkScript),
        },
      ],
      claimCheckAssignments: [
        { claimId: "defines-1", selectedCheckIds: ["targeted"] },
        { claimId: "behaves-1", selectedCheckIds: ["targeted"] },
      ],
      supportingObservations: [fx.sourceObservation],
      postEditInstructionText: "confirm the edit",
      postEditContextBlocks: [],
      maxBrainAttempts: 1,
    },
    ...(input.protection === undefined
      ? {}
      : { recoveryProtection: input.protection }),
    ...(input.store === undefined ? {} : { recoveryStore: input.store }),
  };
  return openEngineeringMutationSession(spec);
}

async function proposeOn(
  session: Awaited<ReturnType<typeof openProtectedSession>>,
  correlationId: string,
): Promise<MutationReview> {
  if (!session.ok) {
    throw new Error(session.error.message);
  }
  const proposed = await session.value.propose({
    correlationId,
    instructionText: "apply the reviewed edit",
  });
  expect(proposed.ok).toBe(true);
  if (!proposed.ok) throw new Error(proposed.error.message);
  return proposed.value;
}

describe("6A-A checkpoint failure produces zero mutation writes", () => {
  it("refuses REQUIRED protection without a recovery store", async () => {
    const fx = await mutationFixture({ source: OBSERVED });
    const session = await openProtectedSession({
      fx,
      protection: "REQUIRED",
      afterText: MUTATED,
    });
    expect(session.ok).toBe(false);
    if (!session.ok) {
      expect(session.error.code).toBe("RECOVERY_CONFIGURATION_INVALID");
    }
    // No downgrade: the session never opened, so nothing could be written.
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(OBSERVED);
  });

  it("stops the mutation when the store cannot persist the checkpoint", async () => {
    const fx = await mutationFixture({ source: OBSERVED });
    const { store } = await freshStore();
    const failingStore: RecoveryStore = {
      describe: () => store.describe(),
      writeCheckpoint: async () => ({
        ok: false as const,
        error: {
          code: "STORE_WRITE_FAILED" as const,
          message: "disk is read-only",
        },
      }),
      readManifestJson: (id) => store.readManifestJson(id),
      readBlob: (id, blobId) => store.readBlob(id, blobId),
    };

    const session = await openProtectedSession({
      fx,
      store: failingStore,
      protection: "REQUIRED",
      afterText: MUTATED,
    });
    expect(session.ok).toBe(true);
    if (!session.ok) throw new Error(session.error.message);
    const review = await proposeOn(session, "6a-a-store");

    const applied = await session.value.apply(
      review,
      await authorizePairs(review),
    );
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect(applied.error.code).toBe("RECOVERY_CHECKPOINT_NOT_ESTABLISHED");
      expect(applied.record.mutationDisposition).toBe("NOT_DISPATCHED");
      expect(applied.record.recoveryProtection).toBe("REQUIRED");
      expect(applied.record.recoveryCheckpointId).toBeNull();
    }
    // ZERO writes: the file is byte-identical to what we observed.
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(OBSERVED);
  });

  /**
   * Gate 1 applicability already detects content drift, so this arc refuses
   * before the checkpoint gate; the capture-time before-state check in
   * `establishRecoveryCheckpoint` is the second line of the same defense. What
   * matters for 6A-A is that a drifted pre-state produces zero writes.
   */
  it("stops the mutation when the pre-state moved after preparation", async () => {
    const fx = await mutationFixture({ source: OBSERVED });
    const { store } = await freshStore();
    const session = await openProtectedSession({
      fx,
      store,
      protection: "REQUIRED",
      afterText: MUTATED,
    });
    expect(session.ok).toBe(true);
    if (!session.ok) throw new Error(session.error.message);
    const review = await proposeOn(session, "6a-a-stale");
    const pairs = await authorizePairs(review);

    const humanEdit = "export function hello() { return 'human'; }\n";
    writeFileSync(join(fx.root, "src/hello.ts"), humanEdit, "utf8");

    const applied = await session.value.apply(review, pairs);
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect([
        "MUTATION_REFUSED",
        "RECOVERY_CHECKPOINT_NOT_ESTABLISHED",
      ]).toContain(applied.error.code);
      expect(applied.record.mutationDisposition).toBe("NOT_DISPATCHED");
    }
    expect(session.value.describe().recoveryCheckpointId).toBeNull();
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(humanEdit);
  });

  it("leaves NONE protection behavior unchanged", async () => {
    const fx = await mutationFixture({ source: OBSERVED });
    const session = await openProtectedSession({
      fx,
      afterText: MUTATED,
    });
    expect(session.ok).toBe(true);
    if (!session.ok) throw new Error(session.error.message);
    const review = await proposeOn(session, "6a-a-none");
    const applied = await session.value.apply(
      review,
      await authorizePairs(review),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error.message);
    expect(session.value.describe().recoveryProtection).toBe("NONE");
    expect(session.value.describe().recoveryCheckpointId).toBeNull();
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(MUTATED);
    disposeReferenceCatalog(applied.value.view.postEditCatalog);
  });
});

describe("6A-B recovery restores the observed pre-state, not Git HEAD", () => {
  it("restores the uncommitted working-tree bytes without touching Git", async () => {
    const committed = "export function hello() { return 1; }\n";
    const fx = await mutationFixture({
      source: committed,
      beforeSnapshot: async (root) => {
        await initCommitWorktree(root);
        await fixtureGit(root, ["add", "src/hello.ts"]);
        await fixtureGit(root, [
          "-c",
          "commit.gpgsign=false",
          "commit",
          "--no-gpg-sign",
          "-m",
          "state A",
        ]);
        // State B: an uncommitted human edit that Git does not know about.
        writeFileSync(join(root, "src/hello.ts"), OBSERVED, "utf8");
      },
    });
    const target = join(fx.root, "src/hello.ts");
    expect(readFileSync(target, "utf8")).toBe(OBSERVED);

    const { store, rootDirectory } = await freshStore();
    const session = await openProtectedSession({
      fx,
      store,
      protection: "REQUIRED",
      afterText: MUTATED,
    });
    expect(session.ok).toBe(true);
    if (!session.ok) throw new Error(session.error.message);
    const review = await proposeOn(session, "6a-b");
    const applied = await session.value.apply(
      review,
      await authorizePairs(review),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error.message);
    // State C is on disk.
    expect(readFileSync(target, "utf8")).toBe(MUTATED);
    const checkpointId = session.value.describe().recoveryCheckpointId;
    expect(typeof checkpointId).toBe("string");
    disposeReferenceCatalog(applied.value.view.postEditCatalog);

    const { loadCheckpoint } = await import("../../src/recovery/index.js");
    const checkpoint = await loadCheckpoint(
      await storeAt(rootDirectory),
      checkpointId as string,
    );
    expect(checkpoint.ok).toBe(true);
    if (!checkpoint.ok) throw new Error(checkpoint.error.message);

    const workspace = await boundaryFor(fx.root);
    const config = await resolvedConfigAt(fx.root);
    const recoveryReview = await prepareRecoveryReview(
      checkpoint.value,
      workspace,
      config,
    );
    expect(recoveryReview.ok).toBe(true);
    if (!recoveryReview.ok) throw new Error(recoveryReview.error.message);
    const entry = recoveryReview.value.view.entries[0]!;
    expect(entry.disposition).toBe("ELIGIBLE_RESTORE");

    const authorization = authorizeRecoveryReview(
      recoveryReview.value,
      [entry.entryId],
      explicitRecoveryApproval(),
    );
    expect(authorization.ok).toBe(true);
    if (!authorization.ok) throw new Error(authorization.error.message);
    const executed = await executeRecovery(
      authorization.value,
      recoveryReview.value,
      workspace,
      config,
    );
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);
    expect(executed.value.disposition).toBe("RECOVERY_COMPLETE");

    // B, not A. Git HEAD still holds A and was never invoked by recovery.
    expect(readFileSync(target, "utf8")).toBe(OBSERVED);
    expect(readFileSync(target, "utf8")).not.toBe(committed);
    const { runGit } = await import("../../src/git/runner.js");
    const show = await runGit({
      cwd: fx.root,
      args: ["show", "HEAD:src/hello.ts"],
    });
    expect(show.ok).toBe(true);
    if (show.ok) {
      expect(show.value.stdout).toBe(committed);
    }
    const status = await runGit({ cwd: fx.root, args: ["status", "--porcelain"] });
    expect(status.ok).toBe(true);
    if (status.ok) {
      // src/hello.ts is still a modified-but-uncommitted file: recovery did
      // not stage, commit, restore or reset anything.
      expect(status.value.stdout).toMatch(/ M src\/hello\.ts/);
    }
  }, 45_000);
});

describe("6A-K interrupted arc leaves a usable checkpoint", () => {
  it("recovers the applied replace and reports the absent create as NOT_APPLIED", async () => {
    const fx = await mutationFixture({ source: OBSERVED });
    const { store, rootDirectory } = await freshStore();
    const session = await openProtectedSession({
      fx,
      store,
      protection: "REQUIRED",
      afterText: MUTATED,
      createText: CREATED,
    });
    expect(session.ok).toBe(true);
    if (!session.ok) throw new Error(session.error.message);
    const review = await proposeOn(session, "6a-k");
    const applied = await session.value.apply(
      review,
      await authorizePairs(review),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error.message);
    const checkpointId = session.value.describe()
      .recoveryCheckpointId as string;
    disposeReferenceCatalog(applied.value.view.postEditCatalog);

    // The arc is abandoned before validation, and the created file is lost —
    // a partially present mutation, which is what an interruption looks like.
    session.value.close();
    const { rmSync } = await import("node:fs");
    rmSync(join(fx.root, "src/regression.ts"));

    // A new store instance stands in for a new process.
    const { loadCheckpoint } = await import("../../src/recovery/index.js");
    const checkpoint = await loadCheckpoint(
      await storeAt(rootDirectory),
      checkpointId,
    );
    expect(checkpoint.ok).toBe(true);
    if (!checkpoint.ok) throw new Error(checkpoint.error.message);

    const workspace = await boundaryFor(fx.root);
    const config = await resolvedConfigAt(fx.root);
    const recoveryReview = await prepareRecoveryReview(
      checkpoint.value,
      workspace,
      config,
    );
    expect(recoveryReview.ok).toBe(true);
    if (!recoveryReview.ok) throw new Error(recoveryReview.error.message);
    const byPath = new Map(
      recoveryReview.value.view.entries.map((e) => [e.relativePath, e] as const),
    );
    expect(byPath.get("src/hello.ts")!.disposition).toBe("ELIGIBLE_RESTORE");
    expect(byPath.get("src/regression.ts")!.disposition).toBe("NOT_APPLIED");

    const authorization = authorizeRecoveryReview(
      recoveryReview.value,
      [byPath.get("src/hello.ts")!.entryId],
      explicitRecoveryApproval(),
    );
    expect(authorization.ok).toBe(true);
    if (!authorization.ok) throw new Error(authorization.error.message);
    const executed = await executeRecovery(
      authorization.value,
      recoveryReview.value,
      workspace,
      config,
    );
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);
    expect(executed.value.disposition).toBe("RECOVERY_COMPLETE");
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(OBSERVED);
    expect(existsSync(join(fx.root, "src/regression.ts"))).toBe(false);
  }, 45_000);
});

describe("6A-S validation failure does not auto-recover", () => {
  it("leaves the defective change on disk with the checkpoint unused", async () => {
    const fx = await mutationFixture({ source: OBSERVED });
    const defective = "export function hello() { return 'bad'; }\n";
    const checkScript = await writeScript(
      fx.root,
      "check-hello.mjs",
      `import fs from 'node:fs';
const text = fs.readFileSync(new URL('./src/hello.ts', import.meta.url), 'utf8');
if (!text.includes('return 42')) process.exit(2);
process.exit(0);
`,
    );
    const { store, rootDirectory } = await freshStore();
    const session = await openProtectedSession({
      fx,
      store,
      protection: "REQUIRED",
      afterText: defective,
      checkScriptPath: checkScript,
    });
    expect(session.ok).toBe(true);
    if (!session.ok) throw new Error(session.error.message);
    const review = await proposeOn(session, "6a-s");
    const applied = await session.value.apply(
      review,
      await authorizePairs(review),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error.message);
    const checkpointId = session.value.describe()
      .recoveryCheckpointId as string;

    const auth = await authorizePlan(applied.value.view.preparedPlan);
    const outcome = await session.value.validate(applied.value, auth);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(outcome.error.message);
    expect(outcome.value.label).not.toBe(
      "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
    );
    expect(outcome.value.record.inPlaceNoRollbackPolicy).toBe(true);

    // No automatic recovery: the defective bytes are still exactly on disk.
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(defective);

    // The checkpoint is still available and still classifies the change as
    // eligible, which is only true because nothing auto-restored it.
    const { loadCheckpoint } = await import("../../src/recovery/index.js");
    const checkpoint = await loadCheckpoint(
      await storeAt(rootDirectory),
      checkpointId,
    );
    expect(checkpoint.ok).toBe(true);
    if (!checkpoint.ok) throw new Error(checkpoint.error.message);
    const recoveryReview = await prepareRecoveryReview(
      checkpoint.value,
      await boundaryFor(fx.root),
      await resolvedConfigAt(fx.root),
    );
    expect(recoveryReview.ok).toBe(true);
    if (!recoveryReview.ok) throw new Error(recoveryReview.error.message);
    expect(recoveryReview.value.view.entries[0]!.disposition).toBe(
      "ELIGIBLE_RESTORE",
    );
    disposeReferenceCatalog(applied.value.view.postEditCatalog);
  }, 45_000);
});
