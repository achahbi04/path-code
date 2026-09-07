/**
 * Phase 5F-H2 — model-facing edit grounding regression proofs (R1–R9).
 * Fixture / recording transport only. No network. No credentials. No writes on propose.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenAIAdapter } from "../../src/adapters/openai/index.js";
import { EDIT_PROFILE_INSTRUCTIONS } from "../../src/adapters/openai/profiles.js";
import { createEngineeringBrain } from "../../src/brain/index.js";
import {
  buildMutationGroundingRequirementsDocument,
  openEngineeringMutationSession,
} from "../../src/orchestrator/mutation/index.js";
import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import { resetEngineeringRunRegistryForTests } from "../../src/engineering-run/internal/registry.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import { resetExecutionEvidenceRegistryForTests } from "../../src/reasoning/gate2/registry.js";
import { resetRunEvidenceRegistryForTests } from "../../src/run-evidence/internal/registry.js";
import { resetValidationRegistryForTests } from "../../src/validation/internal/registry.js";
import {
  TEST_CREDENTIAL,
  TEST_MODEL,
  completedResponsesBody,
  getRecordedFetchCalls,
  installRecordingFetch,
  queueFetchResponse,
  uninstallRecordingFetch,
} from "../adapters/openai/fixtures.js";
import {
  cleanupReasoningFixtures,
  createReasoning,
  editEnvelope,
  handleFor,
  mutationFixture,
  nodeRequest,
  proposalJson,
  replaceReasoning,
  buildDualProfileBrain,
} from "./helpers.js";

afterEach(async () => {
  uninstallRecordingFetch();
  resetAuthorizationRegistryForTests();
  resetExecutionEvidenceRegistryForTests();
  resetEngineeringRunRegistryForTests();
  resetRunEvidenceRegistryForTests();
  resetValidationRegistryForTests();
  resetLocalProcessRegistryForTests();
  await cleanupReasoningFixtures();
});

beforeEach(() => {
  installRecordingFetch();
});

describe("Phase 5F-H2 edit grounding R1–R9", () => {
  it("R1/R7: provider-neutral grounding block for REPLACE_TEXT and CREATE_TEXT", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const parentHandle = handleFor(fx.descriptors, "ENTRY", "src");
    let seenBlocks: { blockId: string; text: string; referenceHandles: readonly string[] }[] =
      [];

    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        seenBlocks = packet.context.blocks.map((b) => ({
          blockId: b.blockId,
          text: b.text,
          referenceHandles: b.referenceHandles,
        }));
        const permitted = packet.context.blocks.find(
          (b) => b.blockId === "permitted-targets",
        );
        const targets = JSON.parse(permitted!.text) as {
          permittedTargets: { targetId: string; kind: string }[];
        };
        const replaceId = targets.permittedTargets.find(
          (t) => t.kind === "REPLACE_TEXT",
        )!.targetId;
        const createId = targets.permittedTargets.find(
          (t) => t.kind === "CREATE_TEXT",
        )!.targetId;
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: proposalJson({
              schemaVersion: 1,
              proposalId: "mixed",
              requestedOutcome: "evidence",
              claims: [
                {
                  claimId: "source-1",
                  kind: "CONTENT",
                  statement: "source",
                  proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
                  proposedCitations: [],
                },
                {
                  claimId: "parent-1",
                  kind: "EXISTS",
                  statement: "parent",
                  proposedSubject: { kind: "EVIDENCE_ID", id: parentHandle },
                  proposedCitations: [],
                },
              ],
              hypotheses: [],
            }),
            changes: [
              {
                changeId: "r1",
                kind: "REPLACE_TEXT",
                targetId: replaceId,
                supportingClaimIds: ["source-1"],
                afterText: "export function hello() { return 2; }\n",
              },
              {
                changeId: "c1",
                kind: "CREATE_TEXT",
                targetId: createId,
                supportingClaimIds: ["parent-1"],
                afterText: "export const x = 1;\n",
              },
            ],
          }),
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
      correlationId: "r1",
      instructionText: "replace and create",
    });
    expect(proposed.ok).toBe(true);

    const grounding = seenBlocks.find((b) => b.blockId === "grounding-requirements");
    expect(grounding).toBeDefined();
    const doc = JSON.parse(grounding!.text) as {
      title: string;
      schemaVersion: number;
      targets: Array<{
        targetId: string;
        mutationKind: string;
        requiredSupportingClaimKind: string;
        requiredEvidenceReference: string;
        requiredRelationship: Record<string, boolean>;
      }>;
    };
    expect(doc.title).toBe("GROUNDING REQUIREMENTS");
    expect(doc.schemaVersion).toBe(1);
    const replaceReq = doc.targets.find((t) => t.mutationKind === "REPLACE_TEXT");
    const createReq = doc.targets.find((t) => t.mutationKind === "CREATE_TEXT");
    expect(replaceReq?.requiredSupportingClaimKind).toBe("CONTENT");
    expect(replaceReq?.requiredEvidenceReference).toBe(contentHandle);
    expect(replaceReq?.requiredRelationship.changeSupportingClaimIdsMustIncludeThatClaimId).toBe(
      true,
    );
    expect(createReq?.requiredSupportingClaimKind).toBe("EXISTS");
    expect(createReq?.requiredEvidenceReference).toBe(parentHandle);
    expect(grounding!.referenceHandles).toEqual(
      expect.arrayContaining([contentHandle, parentHandle]),
    );

    // R1 ownership: helper lives in mutation package, not openai.
    const rebuilt = buildMutationGroundingRequirementsDocument(doc.targets as never);
    expect(rebuilt.title).toBe("GROUNDING REQUIREMENTS");
    expect(EDIT_PROFILE_INSTRUCTIONS).toContain("GROUNDING REQUIREMENTS");
    expect(EDIT_PROFILE_INSTRUCTIONS).not.toMatch(
      /REPLACE_TEXT means CONTENT|REPLACE_TEXT requires a supporting CONTENT/i,
    );
  });

  it("R2: OpenAI request builder carries grounding block unchanged", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const afterText = "export function hello() { return 9; }\n";

    const adapter = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
      { maxTransportAttempts: 2 },
    );
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;
    const brain = createEngineeringBrain(adapter.value, { maxDispatches: 2 });
    expect(brain.ok).toBe(true);
    if (!brain.ok) return;

    queueFetchResponse(async ({ init }) => {
      const bodyText =
        typeof init?.body === "string"
          ? init.body
          : Buffer.isBuffer(init?.body)
            ? init.body.toString("utf8")
            : init?.body instanceof Uint8Array
              ? Buffer.from(init.body).toString("utf8")
              : "";
      expect(bodyText).toContain("GROUNDING REQUIREMENTS");
      expect(bodyText).toContain(contentHandle);
      expect(bodyText).toContain("requiredSupportingClaimKind");
      expect(bodyText).toContain("CONTENT");
      expect(bodyText).not.toContain("EditAuthorization");
      expect(bodyText).not.toContain("authorizePreparedChange");
      const parsedBody = JSON.parse(bodyText) as {
        instructions: string;
        input: { content: { text: string }[] }[];
      };
      expect(parsedBody.instructions).toContain("GROUNDING REQUIREMENTS");
      const payload = JSON.parse(parsedBody.input[0]!.content[0]!.text) as {
        context: { blocks: { blockId: string; text: string }[] };
      };
      const g = payload.context.blocks.find(
        (b) => b.blockId === "grounding-requirements",
      );
      expect(g).toBeDefined();
      const groundingDoc = JSON.parse(g!.text) as {
        targets: { requiredSupportingClaimKind: string; requiredEvidenceReference: string }[];
      };
      expect(groundingDoc.targets[0]!.requiredSupportingClaimKind).toBe("CONTENT");
      expect(groundingDoc.targets[0]!.requiredEvidenceReference).toBe(contentHandle);
      const targets = JSON.parse(
        payload.context.blocks.find((b) => b.blockId === "permitted-targets")!
          .text,
      ) as { permittedTargets: { targetId: string }[] };
      const reasoning = JSON.parse(replaceReasoning(contentHandle));
      return new Response(
        completedResponsesBody(
          JSON.stringify({
            schemaVersion: 1,
            proposalId: "r2",
            reasoningProposal: reasoning,
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: targets.permittedTargets[0]!.targetId,
                supportingClaimIds: ["source-1"],
                afterText,
              },
            ],
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: brain.value,
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
      correlationId: "r2",
      instructionText: "fix",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) {
      throw new Error(proposed.error.message);
    }
    expect(getRecordedFetchCalls()).toHaveLength(1);
  });

  it("R3: compliant CONTENT claim reaches MutationReview without write", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const afterText = "export function hello() { return 4; }\n";
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const g = packet.context.blocks.find(
          (b) => b.blockId === "grounding-requirements",
        );
        const doc = JSON.parse(g!.text) as {
          targets: { requiredEvidenceReference: string; targetId: string }[];
        };
        expect(doc.targets[0]!.requiredEvidenceReference).toBe(contentHandle);
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: replaceReasoning(contentHandle),
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: doc.targets[0]!.targetId,
                supportingClaimIds: ["source-1"],
                afterText,
              },
            ],
          }),
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
      correlationId: "r3",
      instructionText: "fix",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) throw new Error(proposed.error.message);
    expect(proposed.value.view.order[0]!.afterText).toBe(afterText);
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toContain(
      "return 1",
    );
  });

  it("R4: claim-less proposal still refuses with existing reason", async () => {
    const fx = await mutationFixture();
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const g = JSON.parse(
          packet.context.blocks.find((b) => b.blockId === "grounding-requirements")!
            .text,
        ) as { targets: { targetId: string }[] };
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: proposalJson({
              schemaVersion: 1,
              proposalId: "empty-claims-invalid",
              requestedOutcome: "x",
              claims: [
                {
                  claimId: "unrelated",
                  kind: "BEHAVES",
                  statement: "no content",
                  scenarioDescription: "s",
                  proposedSubject: {
                    kind: "EVIDENCE_ID",
                    id: handleFor(fx.descriptors, "CONTENT", "src/hello.ts"),
                  },
                  proposedCitations: [],
                },
              ],
              hypotheses: [],
            }),
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: g.targets[0]!.targetId,
                supportingClaimIds: ["unrelated"],
                afterText: "export function hello() { return 0; }\n",
              },
            ],
          }),
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
      correlationId: "r4",
      instructionText: "no content claim",
    });
    expect(proposed.ok).toBe(false);
    if (proposed.ok) return;
    expect(proposed.error.message).toContain(
      "REPLACE_TEXT requires a supporting CONTENT claim",
    );
  });

  it("R5: wrong claim kind refuses", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const g = JSON.parse(
          packet.context.blocks.find((b) => b.blockId === "grounding-requirements")!
            .text,
        ) as { targets: { targetId: string }[] };
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: proposalJson({
              schemaVersion: 1,
              proposalId: "behaves-wrong",
              requestedOutcome: "x",
              claims: [
                {
                  claimId: "wrong-kind",
                  kind: "BEHAVES",
                  statement: "behaves instead of content",
                  scenarioDescription: "scenario",
                  proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
                  proposedCitations: [],
                },
              ],
              hypotheses: [],
            }),
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: g.targets[0]!.targetId,
                supportingClaimIds: ["wrong-kind"],
                afterText: "export function hello() { return 0; }\n",
              },
            ],
          }),
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
      correlationId: "r5",
      instructionText: "wrong kind",
    });
    expect(proposed.ok).toBe(false);
    if (proposed.ok) return;
    expect(proposed.error.message).toContain(
      "REPLACE_TEXT requires a supporting CONTENT claim",
    );
  });

  it("R6: wrong handle and unlinked claim refuse separately", async () => {
    const fx = await mutationFixture({
      extraFiles: [{ path: "src/other.ts", content: "export const o = 1;\n" }],
    });
    // Re-catalog with both files so a foreign CONTENT handle exists.
    const otherEntry = fx.fixture.inventory.observations.find(
      (o) => o.disposition === "ADMITTED" && o.relativePath === "src/other.ts",
    );
    expect(otherEntry?.disposition).toBe("ADMITTED");
    if (otherEntry?.disposition !== "ADMITTED") return;
    const otherObs = fx.fixture.snapshot.contentObservationByEntry.get(
      otherEntry.entry,
    );
    expect(otherObs).toBeDefined();

    const { createReferenceCatalog, describeReferenceCatalog } = await import(
      "../../src/reasoning/catalog.js"
    );
    const catalogResult = createReferenceCatalog({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      selection: {
        entries: [fx.srcDir, fx.sourceEntry, otherEntry.entry],
        contentObservations: [fx.sourceObservation, otherObs!],
      },
    });
    expect(catalogResult.ok).toBe(true);
    if (!catalogResult.ok) return;
    const described = describeReferenceCatalog(catalogResult.value);
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    const foreignHandle = handleFor(described.value, "CONTENT", "src/other.ts");
    const contentHandle = handleFor(described.value, "CONTENT", "src/hello.ts");

    // Wrong handle
    const openWrong = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: catalogResult.value,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const g = JSON.parse(
          packet.context.blocks.find((b) => b.blockId === "grounding-requirements")!
            .text,
        ) as { targets: { targetId: string }[] };
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: replaceReasoning(foreignHandle),
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: g.targets[0]!.targetId,
                supportingClaimIds: ["source-1"],
                afterText: "export function hello() { return 0; }\n",
              },
            ],
          }),
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
    expect(openWrong.ok).toBe(true);
    if (!openWrong.ok) throw new Error("open");
    const wrong = await openWrong.value.propose({
      correlationId: "r6a",
      instructionText: "foreign handle",
    });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(wrong.error.message).toContain(
        "CONTENT claim is not bound to the selected observation",
      );
    }

    // Valid CONTENT claim not named in supportingClaimIds
    const openUnlinked = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: catalogResult.value,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const g = JSON.parse(
          packet.context.blocks.find((b) => b.blockId === "grounding-requirements")!
            .text,
        ) as { targets: { targetId: string }[] };
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: proposalJson({
              schemaVersion: 1,
              proposalId: "unlinked",
              requestedOutcome: "x",
              claims: [
                {
                  claimId: "source-1",
                  kind: "CONTENT",
                  statement: "right content",
                  proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
                  proposedCitations: [],
                },
                {
                  claimId: "decoy",
                  kind: "EXISTS",
                  statement: "decoy",
                  proposedSubject: {
                    kind: "EVIDENCE_ID",
                    id: handleFor(described.value, "ENTRY", "src"),
                  },
                  proposedCitations: [],
                },
              ],
              hypotheses: [],
            }),
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: g.targets[0]!.targetId,
                supportingClaimIds: ["decoy"],
                afterText: "export function hello() { return 0; }\n",
              },
            ],
          }),
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
    expect(openUnlinked.ok).toBe(true);
    if (!openUnlinked.ok) throw new Error("open");
    const unlinked = await openUnlinked.value.propose({
      correlationId: "r6b",
      instructionText: "unlinked",
    });
    expect(unlinked.ok).toBe(false);
    if (!unlinked.ok) {
      expect(unlinked.error.message).toContain(
        "REPLACE_TEXT requires a supporting CONTENT claim",
      );
    }
  });

  it("R7: CREATE_TEXT compliant fixture prepares; wrong parent/kind refuse", async () => {
    const fx = await mutationFixture();
    const parentHandle = handleFor(fx.descriptors, "ENTRY", "src");
    const openOk = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const g = JSON.parse(
          packet.context.blocks.find((b) => b.blockId === "grounding-requirements")!
            .text,
        ) as {
          targets: {
            targetId: string;
            requiredSupportingClaimKind: string;
            requiredEvidenceReference: string;
          }[];
        };
        expect(g.targets[0]!.requiredSupportingClaimKind).toBe("EXISTS");
        expect(g.targets[0]!.requiredEvidenceReference).toBe(parentHandle);
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: createReasoning(parentHandle),
            changes: [
              {
                changeId: "c1",
                kind: "CREATE_TEXT",
                targetId: g.targets[0]!.targetId,
                supportingClaimIds: ["parent-1"],
                afterText: "export const n = 1;\n",
              },
            ],
          }),
        };
      }),
      permittedTargets: [
        {
          kind: "CREATE_TEXT",
          parentDirectory: fx.srcDir,
          leafName: "new-file.ts",
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
    expect(openOk.ok).toBe(true);
    if (!openOk.ok) throw new Error("open");
    const ok = await openOk.value.propose({
      correlationId: "r7ok",
      instructionText: "create",
    });
    expect(ok.ok).toBe(true);

    const openWrong = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain: await buildDualProfileBrain(async (packet, control) => {
        const g = JSON.parse(
          packet.context.blocks.find((b) => b.blockId === "grounding-requirements")!
            .text,
        ) as { targets: { targetId: string }[] };
        const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: editEnvelope({
            reasoningProposalJson: replaceReasoning(contentHandle),
            changes: [
              {
                changeId: "c1",
                kind: "CREATE_TEXT",
                targetId: g.targets[0]!.targetId,
                supportingClaimIds: ["source-1"],
                afterText: "export const n = 1;\n",
              },
            ],
          }),
        };
      }),
      permittedTargets: [
        {
          kind: "CREATE_TEXT",
          parentDirectory: fx.srcDir,
          leafName: "bad.ts",
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
    expect(openWrong.ok).toBe(true);
    if (!openWrong.ok) throw new Error("open");
    const wrong = await openWrong.value.propose({
      correlationId: "r7bad",
      instructionText: "wrong kind for create",
    });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(wrong.error.message).toContain(
        "CREATE_TEXT requires a supporting EXISTS claim",
      );
    }
  });

  it("R8/R9: H1 nested translation preserved; no fabrication/authority in grounding path", async () => {
    const sessionSrc = readFileSync(
      join(process.cwd(), "src/orchestrator/mutation/session.ts"),
      "utf8",
    );
    expect(sessionSrc).toContain("grounding-requirements");
    expect(sessionSrc).not.toMatch(
      /supportingClaimIds\s*=\s*\[|claims\.push\(|synthesizeClaim|repairClaim/,
    );
    expect(sessionSrc).not.toMatch(
      /explicitEditApproval\s*\(|authorizePreparedChange\s*\(/,
    );
    const openaiProfiles = readFileSync(
      join(process.cwd(), "src/adapters/openai/profiles.ts"),
      "utf8",
    );
    expect(openaiProfiles).not.toMatch(
      /REPLACE_TEXT means CONTENT|requiredSupportingClaimKind:\s*"CONTENT"/,
    );

    // H1 nested → application still works through OpenAI adapter.
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const adapter = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
    );
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;
    const brain = createEngineeringBrain(adapter.value);
    expect(brain.ok).toBe(true);
    if (!brain.ok) return;

    queueFetchResponse({
      status: 200,
      body: completedResponsesBody(
        editEnvelope({
          reasoningProposalJson: replaceReasoning(contentHandle),
          changes: [
            {
              changeId: "bad",
              kind: "REPLACE_TEXT",
              targetId: "t",
              supportingClaimIds: ["source-1"],
              afterText: "x",
            },
          ],
        }),
      ),
    });
    const stringMode = await brain.value.invoke({
      correlationId: "r8-string",
      purpose: "PROPOSE_EDIT",
      taskText: "string mode must fail",
      context: { references: [], blocks: [] },
      responseProfile: {
        kind: "ENGINEERING_EDIT_PROPOSAL_JSON",
        schemaVersion: 1,
      },
      maxOutputTokens: 128,
    });
    expect(stringMode.ok).toBe(false);
    expect(adapter.value.describeOpenAIAdapter().lastSafeReasonCode).toBe(
      "EDIT_ENVELOPE_STRING_MODE_REJECTED",
    );
  });
});
