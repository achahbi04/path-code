/**
 * Phase 5D3 Authorized Mutation Arc — M01–M27 focused proofs + P1.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createEngineeringBrain } from "../../src/brain/index.js";
import { createDeterministicAdapter } from "../brain/fixtures.js";
import {
  authorizePreparedChange,
  explicitEditApproval,
  prepareModifyExistingFile,
} from "../../src/editing/index.js";
import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import { loadProjectConfig } from "../../src/config/index.js";
import { resetEngineeringRunRegistryForTests } from "../../src/engineering-run/internal/registry.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import { resetExecutionEvidenceRegistryForTests } from "../../src/reasoning/gate2/registry.js";
import { resetRunEvidenceRegistryForTests } from "../../src/run-evidence/internal/registry.js";
import { resetValidationRegistryForTests } from "../../src/validation/internal/registry.js";
import {
  openEngineeringMutationSession,
  summarizeMutationSession,
} from "../../src/orchestrator/mutation/index.js";
import { __testOnly_rebindReviewPrepared } from "../../src/orchestrator/mutation/registry.js";
import { parseEditProposalEnvelope } from "../../src/orchestrator/mutation/envelope.js";
import {
  authorizePairs,
  buildDualProfileBrain,
  cleanupReasoningFixtures,
  createReasoning,
  editEnvelope,
  handleFor,
  mixedReasoning,
  mutationFixture,
  nodeRequest,
  replaceReasoning,
} from "./helpers.js";

afterEach(async () => {
  resetAuthorizationRegistryForTests();
  resetExecutionEvidenceRegistryForTests();
  resetEngineeringRunRegistryForTests();
  resetRunEvidenceRegistryForTests();
  resetValidationRegistryForTests();
  resetLocalProcessRegistryForTests();
  await cleanupReasoningFixtures();
});

describe("mutation M01–M08 session / profile / envelope / review", () => {
  it("M01: refuses empty targets without Brain", async () => {
    const fx = await mutationFixture();
    const brain = await buildDualProfileBrain(async () => {
      throw new Error("brain must not run");
    });
    const bad = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
      permittedTargets: [],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "validate",
        postEditContextBlocks: [],
      },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe("INVALID_TARGETS");
    }
  });

  it("M01: refuses PATHCODE.md policy target", async () => {
    const fx = await mutationFixture({
      extraFiles: [{ path: "PATHCODE.md", content: "# cfg\n" }],
    });
    writeFileSync(join(fx.root, "PATHCODE.md"), "# cfg\n");
    // Rebuild fixture with PATHCODE content observation would be needed for replace;
    // creation of PATHCODE.md leaf is enough for this refusal path.
    const brain = await buildDualProfileBrain(async () => {
      throw new Error("brain must not run");
    });
    const bad = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
      permittedTargets: [
        {
          kind: "CREATE_TEXT",
          parentDirectory: fx.srcDir,
          leafName: "PATHCODE.md",
        },
      ],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "validate",
        postEditContextBlocks: [],
      },
    });
    // leaf under src is src/PATHCODE.md — still forbidden by isPolicyPath suffix rule
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe("POLICY_TARGET_FORBIDDEN");
    }
  });

  it("M02: edit profile via same Brain; legacy default unchanged; unsupported refuses", async () => {
    const reasoningOnly = createDeterministicAdapter({
      providerId: "test",
      modelId: "r-only",
      script: async () => ({
        kind: "COMPLETE",
        invocationId: "x",
        text: "{}",
        usage: { provenance: "TEST_FIXTURE" },
      }),
    });
    const brainOnly = createEngineeringBrain(reasoningOnly);
    expect(brainOnly.ok).toBe(true);
    if (!brainOnly.ok) throw new Error("brain");

    const fx = await mutationFixture();
    const opened = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: brainOnly.value,
      permittedTargets: [
        {
          kind: "REPLACE_TEXT",
          contentObservation: fx.sourceObservation,
          entry: fx.sourceEntry,
        },
      ],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [
          { claimId: "defines-1", selectedCheckIds: ["t"] },
        ],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "validate",
        postEditContextBlocks: [],
      },
    });
    expect(opened.ok).toBe(false);
    if (!opened.ok) {
      expect(opened.error.code).toBe("UNSUPPORTED_CAPABILITY");
    }

    let seenProfile: string | undefined;
    const dual = await buildDualProfileBrain(async (packet, control) => {
      seenProfile = packet.responseProfile.kind;
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: replaceReasoning("unused"),
        usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
      };
    });
    await dual.invoke({
      correlationId: "legacy",
      purpose: "PROPOSE_REASONING",
      taskText: "reason",
      context: { references: [], blocks: [] },
    });
    expect(seenProfile).toBe("REASONING_PROPOSAL_JSON");
  });

  it("M03: strict envelope rejects unknown fields, bad version, NUL", () => {
    expect(
      parseEditProposalEnvelope(
        JSON.stringify({
          schemaVersion: 1,
          proposalId: "p",
          reasoningProposalJson: "{}",
          changes: [],
          approval: true,
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseEditProposalEnvelope(
        JSON.stringify({
          schemaVersion: 2,
          proposalId: "p",
          reasoningProposalJson: "{}",
          changes: [
            {
              changeId: "c",
              kind: "REPLACE_TEXT",
              targetId: "t",
              supportingClaimIds: ["s"],
              afterText: "a",
            },
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseEditProposalEnvelope(
        JSON.stringify({
          schemaVersion: 1,
          proposalId: "p",
          reasoningProposalJson: "{}",
          changes: [
            {
              changeId: "c",
              kind: "REPLACE_TEXT",
              targetId: "t",
              supportingClaimIds: ["s"],
              afterText: "a\u0000b",
            },
          ],
        }),
      ).ok,
    ).toBe(false);
  });

  it("M04–M07: propose binds embedded reasoning, exposes after-bytes, writes nothing", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const afterText = "export function hello() { return 2; }\n";
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (_packet, control) => {
        const block = _packet.context.blocks.find(
          (b) => b.blockId === "permitted-targets",
        );
        const parsed = JSON.parse(block!.text) as {
          permittedTargets: { targetId: string }[];
        };
        const targetId = parsed.permittedTargets[0]!.targetId;
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: replaceReasoning(contentHandle),
            changes: [
              {
                changeId: "edit-1",
                kind: "REPLACE_TEXT",
                targetId,
                supportingClaimIds: ["source-1"],
                afterText,
              },
            ],
          }),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      }),
      permittedTargets: [
        {
          kind: "REPLACE_TEXT",
          contentObservation: fx.sourceObservation,
          entry: fx.sourceEntry,
        },
      ],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "v",
        postEditContextBlocks: [],
      },
    });
    expect(sessionOpen.ok).toBe(true);
    if (!sessionOpen.ok) throw new Error("open");
    const proposed = await sessionOpen.value.propose({
      correlationId: "p1",
      instructionText: "fix hello return",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) throw new Error(proposed.error.message);
    expect(proposed.value.view.order[0]!.afterText).toBe(afterText);
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toContain(
      "return 1",
    );
    const preparedText = Buffer.from(
      proposed.value.view.order[0]!.prepared.proposedBytes,
    ).toString("utf8");
    expect(preparedText).toBe(afterText);
  });

  it("M08: mismatched EditAuthorizations refuse without write", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const afterText = "export function hello() { return 3; }\n";
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const block = packet.context.blocks.find(
          (b) => b.blockId === "permitted-targets",
        );
        const parsed = JSON.parse(block!.text) as {
          permittedTargets: { targetId: string }[];
        };
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: replaceReasoning(contentHandle),
            changes: [
              {
                changeId: "edit-1",
                kind: "REPLACE_TEXT",
                targetId: parsed.permittedTargets[0]!.targetId,
                supportingClaimIds: ["source-1"],
                afterText,
              },
            ],
          }),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      }),
      permittedTargets: [
        {
          kind: "REPLACE_TEXT",
          contentObservation: fx.sourceObservation,
          entry: fx.sourceEntry,
        },
      ],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "v",
        postEditContextBlocks: [],
      },
    });
    expect(sessionOpen.ok).toBe(true);
    if (!sessionOpen.ok) throw new Error("open");
    const proposed = await sessionOpen.value.propose({
      correlationId: "p2",
      instructionText: "edit",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) throw new Error(proposed.error.message);

    const config = await loadProjectConfig(fx.fixture.workspace);
    expect(config.ok).toBe(true);
    if (!config.ok) throw new Error("cfg");
    const other = await prepareModifyExistingFile(
      fx.sourceEntry,
      Buffer.from("other\n"),
      fx.fixture.workspace,
      config.value,
    );
    expect(other.ok).toBe(true);
    if (!other.ok) throw new Error("prep");
    const otherAuth = await authorizePreparedChange(
      other.value,
      explicitEditApproval(),
      config.value,
    );
    expect(otherAuth.ok).toBe(true);
    if (!otherAuth.ok) throw new Error("auth");

    const applied = await sessionOpen.value.apply(proposed.value, [
      {
        prepared: proposed.value.view.order[0]!.prepared,
        authorization: otherAuth.value,
      },
    ]);
    expect(applied.ok).toBe(false);
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toContain(
      "return 1",
    );
  });
});

describe("mutation M09–M15 apply / stop", () => {
  it("M09: authorized replacement applies exact bytes", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const afterText = "export function hello() { return 9; }\n";
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const block = packet.context.blocks.find(
          (b) => b.blockId === "permitted-targets",
        );
        const parsed = JSON.parse(block!.text) as {
          permittedTargets: { targetId: string }[];
        };
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: replaceReasoning(contentHandle),
            changes: [
              {
                changeId: "edit-1",
                kind: "REPLACE_TEXT",
                targetId: parsed.permittedTargets[0]!.targetId,
                supportingClaimIds: ["source-1"],
                afterText,
              },
            ],
          }),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      }),
      permittedTargets: [
        {
          kind: "REPLACE_TEXT",
          contentObservation: fx.sourceObservation,
          entry: fx.sourceEntry,
        },
      ],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "v",
        postEditContextBlocks: [],
      },
    });
    expect(sessionOpen.ok).toBe(true);
    if (!sessionOpen.ok) throw new Error("open");
    const proposed = await sessionOpen.value.propose({
      correlationId: "m9",
      instructionText: "replace",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) throw new Error(proposed.error.message);
    const pairs = await authorizePairs(proposed.value);
    await sessionOpen.value.apply(proposed.value, pairs);
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(afterText);
  });

  it("M10: authorized creation under admitted parent with exact leaf", async () => {
    const fx = await mutationFixture();
    const dirHandle = handleFor(fx.descriptors, "ENTRY", "src");
    const afterText = "export const created = true;\n";
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const block = packet.context.blocks.find(
          (b) => b.blockId === "permitted-targets",
        );
        const parsed = JSON.parse(block!.text) as {
          permittedTargets: { targetId: string; kind: string }[];
        };
        const createTarget = parsed.permittedTargets.find(
          (t) => t.kind === "CREATE_TEXT",
        )!;
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: createReasoning(dirHandle),
            changes: [
              {
                changeId: "edit-1",
                kind: "CREATE_TEXT",
                targetId: createTarget.targetId,
                supportingClaimIds: ["parent-1"],
                afterText,
              },
            ],
          }),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      }),
      permittedTargets: [
        {
          kind: "CREATE_TEXT",
          parentDirectory: fx.srcDir,
          leafName: "created.ts",
        },
      ],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "v",
        postEditContextBlocks: [],
      },
    });
    expect(sessionOpen.ok).toBe(true);
    if (!sessionOpen.ok) throw new Error("open");
    const proposed = await sessionOpen.value.propose({
      correlationId: "m10",
      instructionText: "create",
    });
    if (!proposed.ok) {
      throw new Error(`${proposed.error.code}: ${proposed.error.message}`);
    }
    const pairs = await authorizePairs(proposed.value);
    await sessionOpen.value.apply(proposed.value, pairs);
    expect(readFileSync(join(fx.root, "src/created.ts"), "utf8")).toBe(
      afterText,
    );
  });

  it("M11: two-target mixed batch uses 3D", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const dirHandle = handleFor(fx.descriptors, "ENTRY", "src");
    const replaceText = "export function hello() { return 11; }\n";
    const createText = "export const batch = 1;\n";
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
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
        )!;
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: mixedReasoning(contentHandle, dirHandle),
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: replace.targetId,
                supportingClaimIds: ["source-1"],
                afterText: replaceText,
              },
              {
                changeId: "e2",
                kind: "CREATE_TEXT",
                targetId: create.targetId,
                supportingClaimIds: ["parent-1"],
                afterText: createText,
              },
            ],
          }),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      }),
      permittedTargets: [
        {
          kind: "REPLACE_TEXT",
          contentObservation: fx.sourceObservation,
          entry: fx.sourceEntry,
        },
        {
          kind: "CREATE_TEXT",
          parentDirectory: fx.srcDir,
          leafName: "batch.ts",
        },
      ],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "v",
        postEditContextBlocks: [],
      },
    });
    expect(sessionOpen.ok).toBe(true);
    if (!sessionOpen.ok) throw new Error("open");
    const proposed = await sessionOpen.value.propose({
      correlationId: "m11",
      instructionText: "batch",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) throw new Error(proposed.error.message);
    expect(proposed.value.view.order).toHaveLength(2);
    const pairs = await authorizePairs(proposed.value);
    await sessionOpen.value.apply(proposed.value, pairs);
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(
      replaceText,
    );
    expect(readFileSync(join(fx.root, "src/batch.ts"), "utf8")).toBe(
      createText,
    );
  });

  it("M12: repeated propose refuses", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const block = packet.context.blocks.find(
          (b) => b.blockId === "permitted-targets",
        );
        const parsed = JSON.parse(block!.text) as {
          permittedTargets: { targetId: string }[];
        };
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: replaceReasoning(contentHandle),
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: parsed.permittedTargets[0]!.targetId,
                supportingClaimIds: ["source-1"],
                afterText: "export function hello() { return 12; }\n",
              },
            ],
          }),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      }),
      permittedTargets: [
        {
          kind: "REPLACE_TEXT",
          contentObservation: fx.sourceObservation,
          entry: fx.sourceEntry,
        },
      ],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "v",
        postEditContextBlocks: [],
      },
    });
    expect(sessionOpen.ok).toBe(true);
    if (!sessionOpen.ok) throw new Error("open");
    const first = await sessionOpen.value.propose({
      correlationId: "m12",
      instructionText: "once",
    });
    expect(first.ok).toBe(true);
    const second = await sessionOpen.value.propose({
      correlationId: "m12b",
      instructionText: "twice",
    });
    expect(second.ok).toBe(false);
  });

  it("M24: stop before dispatch writes nothing", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const block = packet.context.blocks.find(
          (b) => b.blockId === "permitted-targets",
        );
        const parsed = JSON.parse(block!.text) as {
          permittedTargets: { targetId: string }[];
        };
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: replaceReasoning(contentHandle),
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: parsed.permittedTargets[0]!.targetId,
                supportingClaimIds: ["source-1"],
                afterText: "export function hello() { return 24; }\n",
              },
            ],
          }),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      }),
      permittedTargets: [
        {
          kind: "REPLACE_TEXT",
          contentObservation: fx.sourceObservation,
          entry: fx.sourceEntry,
        },
      ],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "v",
        postEditContextBlocks: [],
      },
    });
    expect(sessionOpen.ok).toBe(true);
    if (!sessionOpen.ok) throw new Error("open");
    const proposed = await sessionOpen.value.propose({
      correlationId: "m24",
      instructionText: "stop",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) throw new Error(proposed.error.message);
    sessionOpen.value.close();
    const pairs = await authorizePairs(proposed.value);
    const applied = await sessionOpen.value.apply(proposed.value, pairs);
    expect(applied.ok).toBe(false);
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toContain(
      "return 1",
    );
  });
});

describe("mutation M26–M27 / P1", () => {
  it("M26/M27: summary omits code; counts reconcile", () => {
    const record = {
      schemaVersion: 1 as const,
      sessionId: "mut-test",
      phase: "FINALIZED" as const,
      mutationDisposition: "ALL_APPLIED" as const,
      reobservationDisposition: "SUCCEEDED" as const,
      validationDisposition: "ACCEPTED" as const,
      stopRequested: false,
      label: "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED" as const,
      inPlaceNoRollbackPolicy: true as const,
      noGitCommit: true as const,
    };
    const summary = summarizeMutationSession(record, {
      appliedCount: 1,
      plannedCount: 1,
    });
    expect(JSON.stringify(summary)).not.toMatch(/export function/);
    expect(summary.appliedCount).toBe(1);
    expect(summary.inPlaceNoRollbackPolicy).toBe(true);
  });

  it("P1: weakened review-prepared binding refuses apply", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const afterText = "export function hello() { return 101; }\n";
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const block = packet.context.blocks.find(
          (b) => b.blockId === "permitted-targets",
        );
        const parsed = JSON.parse(block!.text) as {
          permittedTargets: { targetId: string }[];
        };
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: replaceReasoning(contentHandle),
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: parsed.permittedTargets[0]!.targetId,
                supportingClaimIds: ["source-1"],
                afterText,
              },
            ],
          }),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      }),
      permittedTargets: [
        {
          kind: "REPLACE_TEXT",
          contentObservation: fx.sourceObservation,
          entry: fx.sourceEntry,
        },
      ],
      disclosedObservations: [fx.sourceObservation],
      validationBlueprint: {
        checks: [
          {
            id: "t",
            kind: "TARGETED_TEST",
            request: nodeRequest(fx.root, "noop.js"),
          },
        ],
        claimCheckAssignments: [],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "v",
        postEditContextBlocks: [],
      },
    });
    expect(sessionOpen.ok).toBe(true);
    if (!sessionOpen.ok) throw new Error("open");
    const proposed = await sessionOpen.value.propose({
      correlationId: "p1",
      instructionText: "p1",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) throw new Error(proposed.error.message);
    const pairs = await authorizePairs(proposed.value);

    const config = await loadProjectConfig(fx.fixture.workspace);
    expect(config.ok).toBe(true);
    if (!config.ok) throw new Error("cfg");
    const foreign = await prepareModifyExistingFile(
      fx.sourceEntry,
      Buffer.from("foreign\n"),
      fx.fixture.workspace,
      config.value,
    );
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) throw new Error("foreign");
    __testOnly_rebindReviewPrepared(proposed.value, [foreign.value]);

    const applied = await sessionOpen.value.apply(proposed.value, pairs);
    expect(applied.ok).toBe(false);
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toContain(
      "return 1",
    );
  });
});
