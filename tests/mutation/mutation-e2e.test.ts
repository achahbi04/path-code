/**
 * Phase 5D3 E2E positive/negative mutation→validation (M28/M29) + P2/P3.
 * Real disposable workspaces; installed local tsc + node regression scripts.
 * 45_000 ms budgets: real prepare/observe/compiler/process work.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import { resetEngineeringRunRegistryForTests } from "../../src/engineering-run/internal/registry.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import {
  createReferenceCatalog,
  describeReferenceCatalog,
  disposeReferenceCatalog,
} from "../../src/reasoning/catalog.js";
import { resetExecutionEvidenceRegistryForTests } from "../../src/reasoning/gate2/registry.js";
import { resetRunEvidenceRegistryForTests } from "../../src/run-evidence/internal/registry.js";
import { resetValidationRegistryForTests } from "../../src/validation/internal/registry.js";
import { openEngineeringMutationSession } from "../../src/orchestrator/mutation/index.js";
import {
  authorizePairs,
  authorizePlan,
  buildDualProfileBrain,
  cleanupReasoningFixtures,
  createReasoning,
  editEnvelope,
  handleFor,
  mixedReasoning,
  mutationFixture,
  nodeRequest,
  postEditDefinesBehaves,
  replaceReasoning,
  tscExecutable,
  writeScript,
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

describe("mutation E2E M28/M29", () => {
  it(
    "M28: positive replace+create → host auth → apply → reobserve → validate accepted",
    async () => {
      const fx = await mutationFixture({
        source: "export function hello() { return 1; }\n",
      });
      const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
      const dirHandle = handleFor(fx.descriptors, "ENTRY", "src");
      const fixedSource =
        "export function hello() { return 42; }\n";
      const createdCheck =
        "// targeted regression marker\nexport const expectHello = 42;\n";

      const checkScript = await writeScript(
        fx.root,
        "check-hello.mjs",
        `import fs from 'node:fs';
const text = fs.readFileSync(new URL('./src/hello.ts', import.meta.url), 'utf8');
const marker = fs.readFileSync(new URL('./src/regression.ts', import.meta.url), 'utf8');
if (!text.includes('return 42')) process.exit(2);
if (!marker.includes('expectHello = 42')) process.exit(3);
process.exit(0);
`,
      );
      const tsc = tscExecutable();
      const typecheckScript = await writeScript(
        fx.root,
        "run-tsc.mjs",
        `import { spawnSync } from 'node:child_process';
const r = spawnSync(${JSON.stringify(tsc.executable)}, ${JSON.stringify([
          ...tsc.argvPrefix,
          "--strict",
          "--noEmit",
          "--target",
          "ES2020",
          "--module",
          "ESNext",
          "--skipLibCheck",
          "src/hello.ts",
          "src/regression.ts",
        ])}, { cwd: new URL('.', import.meta.url).pathname, encoding: 'utf8' });
if (r.status !== 0) {
  process.stderr.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
}
process.exit(r.status === 0 ? 0 : 1);
`,
      );

      let call = 0;
      const brain = await buildDualProfileBrain(async (packet, control) => {
        call += 1;
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
                  afterText: fixedSource,
                },
                {
                  changeId: "e2",
                  kind: "CREATE_TEXT",
                  targetId: create.targetId,
                  supportingClaimIds: ["parent-1"],
                  afterText: createdCheck,
                },
              ],
            }),
            usage: {
              provenance: "TEST_FIXTURE",
              inputTokens: 1,
              outputTokens: 1,
            },
          };
        }
        // Post-edit reasoning: find CONTENT handle for hello.ts from packet refs
        const helloRef = packet.context.references.find(
          (r) =>
            r.evidenceKind === "CONTENT" && r.relativePath === "src/hello.ts",
        );
        const handle = helloRef?.handle ?? contentHandle;
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: postEditDefinesBehaves(handle),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      });

      const sessionOpen = openEngineeringMutationSession({
        workspace: fx.fixture.workspace,
        snapshot: fx.fixture.snapshot,
        catalog: fx.catalog,
        brain,
        permittedTargets: [
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
              id: "typecheck",
              kind: "TYPECHECK",
              request: nodeRequest(fx.root, typecheckScript),
            },
            {
              id: "targeted",
              kind: "TARGETED_TEST",
              request: nodeRequest(fx.root, checkScript),
            },
          ],
          claimCheckAssignments: [
            { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
            { claimId: "behaves-1", selectedCheckIds: ["targeted"] },
          ],
          supportingObservations: [fx.sourceObservation],
          postEditInstructionText: "Confirm hello returns 42 after edit",
          postEditContextBlocks: [
            {
              blockId: "post-instruction",
              role: "REFERENCE_MATERIAL",
              text: "Validate DEFINES/BEHAVES for hello after mutation",
              referenceHandles: [],
            },
          ],
          maxBrainAttempts: 2,
        },
      });
      expect(sessionOpen.ok).toBe(true);
      if (!sessionOpen.ok) throw new Error(sessionOpen.error.message);

      const proposed = await sessionOpen.value.propose({
        correlationId: "m28-propose",
        instructionText: "Fix hello and add a targeted test file",
      });
      expect(proposed.ok).toBe(true);
      if (!proposed.ok) throw new Error(proposed.error.message);

      const pairs = await authorizePairs(proposed.value);
      const validationReview = await sessionOpen.value.apply(
        proposed.value,
        pairs,
      );
      expect(validationReview.ok).toBe(true);
      if (!validationReview.ok) {
        throw new Error(validationReview.error.message);
      }
      expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(
        fixedSource,
      );
      expect(readFileSync(join(fx.root, "src/regression.ts"), "utf8")).toBe(
        createdCheck,
      );

      const auth = await authorizePlan(validationReview.value.view.preparedPlan);
      const outcome = await sessionOpen.value.validate(
        validationReview.value,
        auth,
      );
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error(outcome.error.message);
      if (
        outcome.value.label !==
        "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED"
      ) {
        throw new Error(
          `label=${outcome.value.label} terminal=${outcome.value.artifacts.cycle?.record.terminalState} origin=${outcome.value.artifacts.cycle?.record.originCode}`,
        );
      }
      expect(outcome.value.artifacts.cycle?.record.terminalState).toBe(
        "SUBSTANTIATED",
      );
      expect(call).toBeGreaterThanOrEqual(2);
      disposeReferenceCatalog(validationReview.value.view.postEditCatalog);
    },
    45_000,
  );

  it(
    "M29: defective change stays on disk; validation not accepted; no auto-rollback",
    async () => {
      const fx = await mutationFixture({
        source: "export function hello() { return 1; }\n",
      });
      const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
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

      const brain = await buildDualProfileBrain(async (packet, control) => {
        if (packet.responseProfile.kind === "ENGINEERING_EDIT_PROPOSAL_JSON") {
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
                  afterText: defective,
                },
              ],
            }),
            usage: {
              provenance: "TEST_FIXTURE",
              inputTokens: 1,
              outputTokens: 1,
            },
          };
        }
        const helloRef = packet.context.references.find(
          (r) =>
            r.evidenceKind === "CONTENT" && r.relativePath === "src/hello.ts",
        );
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: postEditDefinesBehaves(helloRef?.handle ?? contentHandle),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      });

      const sessionOpen = openEngineeringMutationSession({
        workspace: fx.fixture.workspace,
        snapshot: fx.fixture.snapshot,
        catalog: fx.catalog,
        brain,
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
              id: "targeted",
              kind: "TARGETED_TEST",
              request: nodeRequest(fx.root, checkScript),
            },
          ],
          claimCheckAssignments: [
            { claimId: "behaves-1", selectedCheckIds: ["targeted"] },
            { claimId: "defines-1", selectedCheckIds: ["targeted"] },
          ],
          supportingObservations: [fx.sourceObservation],
          postEditInstructionText: "Confirm hello returns 42",
          postEditContextBlocks: [],
          maxBrainAttempts: 2,
        },
      });
      expect(sessionOpen.ok).toBe(true);
      if (!sessionOpen.ok) throw new Error(sessionOpen.error.message);

      const proposed = await sessionOpen.value.propose({
        correlationId: "m29-propose",
        instructionText: "break hello",
      });
      expect(proposed.ok).toBe(true);
      if (!proposed.ok) throw new Error(proposed.error.message);
      const pairs = await authorizePairs(proposed.value);
      const validationReview = await sessionOpen.value.apply(
        proposed.value,
        pairs,
      );
      expect(validationReview.ok).toBe(true);
      if (!validationReview.ok) throw new Error(validationReview.error.message);
      expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(
        defective,
      );

      const auth = await authorizePlan(validationReview.value.view.preparedPlan);
      const outcome = await sessionOpen.value.validate(
        validationReview.value,
        auth,
      );
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error(outcome.error.message);
      expect(outcome.value.label).toBe(
        "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED",
      );
      expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(
        defective,
      );
      disposeReferenceCatalog(validationReview.value.view.postEditCatalog);
    },
    45_000,
  );
});

describe("mutation P2/P3 defenses", () => {
  it("P2: after-byte mismatch stops validation review (independent of later gates)", async () => {
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const afterText = "export function hello() { return 7; }\n";
    const third = "export function hello() { return 999; }\n";
    const { __testOnly_setAfterMutationHook } = await import(
      "../../src/orchestrator/mutation/session.js"
    );
    __testOnly_setAfterMutationHook(async () => {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(fx.root, "src/hello.ts"), third, "utf8");
    });
    try {
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
            usage: {
              provenance: "TEST_FIXTURE",
              inputTokens: 1,
              outputTokens: 1,
            },
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
        instructionText: "p2",
      });
      expect(proposed.ok).toBe(true);
      if (!proposed.ok) throw new Error(proposed.error.message);
      const pairs = await authorizePairs(proposed.value);
      const applied = await sessionOpen.value.apply(proposed.value, pairs);
      expect(applied.ok).toBe(false);
      if (!applied.ok) {
        expect(applied.error.code).toBe("REOBSERVATION_FAILED");
      }
      const disk = readFileSync(join(fx.root, "src/hello.ts"), "utf8");
      expect(disk).toBe(third);
    } finally {
      __testOnly_setAfterMutationHook(undefined);
    }
  });

  it("P3: BOUND without SUBSTANTIATED is not strong accepted label", async () => {
    // Covered by M29 when validation fails / not substantiated.
    // Additional explicit: EXISTS-only post-edit reasoning yields BOUND not SUBSTANTIATED.
    const fx = await mutationFixture();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const dirHandle = handleFor(fx.descriptors, "ENTRY", "src");
    const afterText = "export function hello() { return 3; }\n";
    const checkScript = await writeScript(
      fx.root,
      "ok.mjs",
      "process.exit(0);\n",
    );

    const brain = await buildDualProfileBrain(async (packet, control) => {
      if (packet.responseProfile.kind === "ENGINEERING_EDIT_PROPOSAL_JSON") {
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
      }
      // Return EXISTS-only → conductor stays BOUND / no execution evidence
      const entryRef = packet.context.references.find(
        (r) => r.evidenceKind === "ENTRY",
      );
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: createReasoning(entryRef?.handle ?? dirHandle),
        usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
      };
    });

    const sessionOpen = openEngineeringMutationSession({
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
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
            request: nodeRequest(fx.root, checkScript),
          },
        ],
        claimCheckAssignments: [
          { claimId: "defines-1", selectedCheckIds: ["t"] },
        ],
        supportingObservations: [fx.sourceObservation],
        postEditInstructionText: "exists only should not substantiate",
        postEditContextBlocks: [],
        maxBrainAttempts: 1,
      },
    });
    expect(sessionOpen.ok).toBe(true);
    if (!sessionOpen.ok) throw new Error("open");
    const proposed = await sessionOpen.value.propose({
      correlationId: "p3",
      instructionText: "p3",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) throw new Error(proposed.error.message);
    const pairs = await authorizePairs(proposed.value);
    const validationReview = await sessionOpen.value.apply(
      proposed.value,
      pairs,
    );
    expect(validationReview.ok).toBe(true);
    if (!validationReview.ok) throw new Error(validationReview.error.message);
    const auth = await authorizePlan(validationReview.value.view.preparedPlan);
    const outcome = await sessionOpen.value.validate(
      validationReview.value,
      auth,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(outcome.error.message);
    expect(outcome.value.label).not.toBe(
      "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
    );
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(afterText);
    disposeReferenceCatalog(validationReview.value.view.postEditCatalog);
  });
});

void createReferenceCatalog;
void describeReferenceCatalog;
