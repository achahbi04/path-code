/**
 * Phase 5E1 F29 — real Gate 1 / mutation propose handoffs through Brain +
 * OpenAI adapter with recording fetch. No live network. No approval/apply.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenAIAdapter } from "../../../src/adapters/openai/index.js";
import { createEngineeringBrain } from "../../../src/brain/index.js";
import { openEngineeringMutationSession } from "../../../src/orchestrator/mutation/index.js";
import { bindReasoningProposalJson } from "../../../src/reasoning/bind.js";
import { resetAuthorizationRegistryForTests } from "../../../src/editing/internal/registry.js";
import { resetEngineeringRunRegistryForTests } from "../../../src/engineering-run/internal/registry.js";
import { resetLocalProcessRegistryForTests } from "../../../src/execution/internal/registry.js";
import { resetExecutionEvidenceRegistryForTests } from "../../../src/reasoning/gate2/registry.js";
import { resetRunEvidenceRegistryForTests } from "../../../src/run-evidence/internal/registry.js";
import { resetValidationRegistryForTests } from "../../../src/validation/internal/registry.js";
import {
  cleanupReasoningFixtures,
  editEnvelope,
  handleFor,
  mutationFixture,
  nodeRequest,
  proposalJson,
  replaceReasoning,
} from "../../mutation/helpers.js";
import {
  TEST_CREDENTIAL,
  TEST_MODEL,
  completedResponsesBody,
  getRecordedFetchCalls,
  installRecordingFetch,
  queueFetchResponse,
  uninstallRecordingFetch,
} from "./fixtures.js";

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

describe("openai consumer handoffs F29", () => {
  it(
    "F29: reasoning→Gate1 REFERENCES_ONLY; invented handle refuses; edit→session.propose; malformed unrepaired",
    async () => {
      const fx = await mutationFixture();
      const entryHandle = handleFor(fx.descriptors, "ENTRY", "src/hello.ts");
      const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");

      const goodJson = proposalJson({
        schemaVersion: 1,
        proposalId: "openai-p1",
        requestedOutcome: "document hello",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "hello.ts exists",
            proposedSubject: { kind: "EVIDENCE_ID", id: entryHandle },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      });

      queueFetchResponse({
        status: 200,
        body: completedResponsesBody(goodJson),
      });

      const adapterResult = createOpenAIAdapter(
        { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
        TEST_CREDENTIAL,
        { maxTransportAttempts: 4 },
      );
      expect(adapterResult.ok).toBe(true);
      if (!adapterResult.ok) return;
      const brainResult = createEngineeringBrain(adapterResult.value, {
        maxDispatches: 4,
      });
      expect(brainResult.ok).toBe(true);
      if (!brainResult.ok) return;
      const brain = brainResult.value;

      const descriptors = fx.descriptors.map((d) => ({
        handle: d.handle,
        evidenceKind: d.evidenceKind,
        ...(d.relativePath !== undefined
          ? { relativePath: d.relativePath }
          : {}),
      }));

      const invoked = await brain.invoke({
        correlationId: "f29-reason",
        purpose: "PROPOSE_REASONING",
        taskText: "Propose EXISTS claim for hello.ts",
        context: {
          references: descriptors,
          blocks: [
            {
              blockId: "ref-1",
              role: "REFERENCE_MATERIAL",
              text: "src/hello.ts",
              referenceHandles: [contentHandle, entryHandle],
            },
          ],
        },
        responseProfile: { kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 },
        maxOutputTokens: 256,
      });
      expect(invoked.ok).toBe(true);
      if (!invoked.ok) throw new Error(invoked.error.message);
      expect(invoked.value.response.text).toBe(goodJson);
      const bound = await bindReasoningProposalJson(
        invoked.value.response.text,
        fx.catalog,
      );
      expect(bound.ok).toBe(true);
      if (bound.ok) {
        expect(
          bound.value.reasoning.claims.every(
            (c) => c.bindingStage === "REFERENCES_ONLY",
          ),
        ).toBe(true);
      }

      // Invented handle — invocation complete; Gate 1 refuses.
      const fakeJson = proposalJson({
        schemaVersion: 1,
        proposalId: "fake",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "CONTENT",
            statement: "s",
            proposedSubject: {
              kind: "EVIDENCE_ID",
              id: "00000000-0000-4000-8000-000000000099",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      });
      queueFetchResponse({
        status: 200,
        body: completedResponsesBody(fakeJson),
      });
      const fakeInv = await brain.invoke({
        correlationId: "f29-fake",
        purpose: "PROPOSE_REASONING",
        taskText: "fake",
        context: { references: descriptors, blocks: [] },
        maxOutputTokens: 128,
      });
      expect(fakeInv.ok).toBe(true);
      if (fakeInv.ok) {
        const refused = await bindReasoningProposalJson(
          fakeInv.value.response.text,
          fx.catalog,
        );
        expect(refused.ok).toBe(false);
      }

      // Malformed complete proposal text unrepaired by adapter.
      queueFetchResponse({
        status: 200,
        body: completedResponsesBody("{not-json"),
      });
      const mal = await brain.invoke({
        correlationId: "f29-mal",
        purpose: "PROPOSE_REASONING",
        taskText: "mal",
        context: { references: [], blocks: [] },
        maxOutputTokens: 64,
      });
      expect(mal.ok).toBe(true);
      if (mal.ok) {
        expect(mal.value.response.text).toBe("{not-json");
        const parseRefuse = await bindReasoningProposalJson(
          mal.value.response.text,
          fx.catalog,
        );
        expect(parseRefuse.ok).toBe(false);
      }

      // Edit profile → real session.propose → MutationReview; no approval/apply.
      const afterText = "export function hello() { return 2; }\n";
      const adapter2 = createOpenAIAdapter(
        { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
        TEST_CREDENTIAL,
        { maxTransportAttempts: 2 },
      );
      expect(adapter2.ok).toBe(true);
      if (!adapter2.ok) return;
      const brain2 = createEngineeringBrain(adapter2.value, { maxDispatches: 2 });
      if (!brain2.ok) return;

      queueFetchResponse(async ({ init }) => {
        const bodyText =
          typeof init?.body === "string"
            ? init.body
            : Buffer.isBuffer(init?.body)
              ? init.body.toString("utf8")
              : init?.body instanceof Uint8Array
                ? Buffer.from(init.body).toString("utf8")
                : "";
        expect(bodyText).toContain("ENGINEERING_EDIT_PROPOSAL_JSON");
        // Extract target id from disclosed permitted-targets in input payload.
        const parsedBody = JSON.parse(bodyText) as {
          input: { content: { text: string }[] }[];
        };
        const inputText = parsedBody.input[0]!.content[0]!.text;
        const payload = JSON.parse(inputText) as {
          context: { blocks: { blockId: string; text: string }[] };
        };
        const block = payload.context.blocks.find(
          (b) => b.blockId === "permitted-targets",
        );
        expect(block).toBeDefined();
        const targets = JSON.parse(block!.text) as {
          permittedTargets: { targetId: string }[];
        };
        const targetId = targets.permittedTargets[0]!.targetId;
        const envelope = editEnvelope({
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
        });
        return new Response(completedResponsesBody(envelope), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });

      const sessionOpen = openEngineeringMutationSession({
        workspace: fx.fixture.workspace,
        snapshot: fx.fixture.snapshot,
        catalog: fx.catalog,
        brain: brain2.value,
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
        correlationId: "f29-edit",
        instructionText: "fix hello return",
      });
      expect(proposed.ok).toBe(true);
      if (!proposed.ok) throw new Error(proposed.error.message);
      expect(proposed.value.view.order[0]!.afterText).toBe(afterText);
      expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toContain(
        "return 1",
      );
      expect(getRecordedFetchCalls().length).toBeGreaterThanOrEqual(1);
      for (const call of getRecordedFetchCalls()) {
        expect(call.input).toBe("https://api.openai.com/v1/responses");
      }
    },
    45_000,
  );
});
