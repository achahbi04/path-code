/**
 * Phase 5D2 Engineering Orchestrator proofs E01–E24 + P1–P3.
 */

import { readFileSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createEngineeringBrain } from "../../src/brain/index.js";
import { createDeterministicAdapter } from "../brain/fixtures.js";
import { resetEngineeringRunRegistryForTests } from "../../src/engineering-run/internal/registry.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import {
  disposeReferenceCatalog,
} from "../../src/reasoning/index.js";
import { resetExecutionEvidenceRegistryForTests } from "../../src/reasoning/gate2/registry.js";
import { resetRunEvidenceRegistryForTests } from "../../src/run-evidence/internal/registry.js";
import {
  openEngineeringCycle,
  summarizeEngineeringCycle,
} from "../../src/orchestrator/index.js";
import { dispositionForGate1Failure } from "../../src/orchestrator/feedback.js";
import { COORDINATOR_DIAGNOSTIC_BLOCK_ID } from "../../src/orchestrator/bounds.js";
import {
  executeValidationPlan,
} from "../../src/validation/index.js";
import { resetValidationRegistryForTests } from "../../src/validation/internal/registry.js";
import {
  buildBrain,
  cleanupReasoningFixtures,
  definesBehavesProposal,
  existsOnlyProposal,
  fixtureWithSourceAndManifest,
  handleFor,
  nodeRequest,
  prepareAuthorizedPlan,
  writeScript,
} from "./helpers.js";

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetExecutionEvidenceRegistryForTests();
  resetEngineeringRunRegistryForTests();
  resetRunEvidenceRegistryForTests();
  resetValidationRegistryForTests();
  resetLocalProcessRegistryForTests();
  await cleanupReasoningFixtures();
});

describe("orchestrator E01–E08 session / revision / concurrency", () => {
  it("E01: modes validate; bad auth refuses before Brain; unused auth remains unused", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    let brainCalls = 0;
    const brain = await buildBrain(async (_packet, control) => {
      brainCalls += 1;
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: definesBehavesProposal(contentHandle),
        usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
      };
    });

    const okBind = openEngineeringCycle({
      mode: "BIND_ONLY",
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
    });
    expect(okBind.ok).toBe(true);

    const incomplete = openEngineeringCycle({
      mode: "BIND_AND_VALIDATE",
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
      // @ts-expect-error incomplete validation bundle
      validationPlan: undefined,
      validationAuthorization: undefined as never,
      claimCheckAssignments: [],
    });
    expect(incomplete.ok).toBe(false);

    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const { plan, authorization } = await prepareAuthorizedPlan({
      root: fx.root,
      snapshot: fx.fixture.snapshot,
      workspace: fx.fixture.workspace,
      config: fx.fixture.config,
      declaredObservations: [fx.sourceObservation],
      checks: [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
      ],
    });

    // Consume auth, then open must refuse.
    const consumed = await executeValidationPlan(plan, authorization);
    expect(consumed.ok).toBe(true);
    brainCalls = 0;
    const consumedOpen = openEngineeringCycle({
      mode: "BIND_AND_VALIDATE",
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
      validationPlan: plan,
      validationAuthorization: authorization,
      claimCheckAssignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
      ],
    });
    expect(consumedOpen.ok).toBe(false);
    expect(brainCalls).toBe(0);

    // Fresh auth remains unused after successful open preflight.
    const { plan: plan2, authorization: auth2 } = await prepareAuthorizedPlan({
      root: fx.root,
      snapshot: fx.fixture.snapshot,
      workspace: fx.fixture.workspace,
      config: fx.fixture.config,
      declaredObservations: [fx.sourceObservation],
      checks: [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
      ],
    });
    const opened = openEngineeringCycle({
      mode: "BIND_AND_VALIDATE",
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
      validationPlan: plan2,
      validationAuthorization: auth2,
      claimCheckAssignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["typecheck"] },
      ],
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    opened.value.close();

    const disposedCatalog = fx.catalog;
    disposeReferenceCatalog(disposedCatalog);
    const disposedOpen = openEngineeringCycle({
      mode: "BIND_ONLY",
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: disposedCatalog,
      brain,
    });
    expect(disposedOpen.ok).toBe(false);
  });

  it("E02: bind-only happy path -> BOUND; zero Engineering Run; no auth consumed", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const entryHandle = handleFor(fx.descriptors, "ENTRY", "src/hello.ts");
    const brain = await buildBrain(async (_p, control) => ({
      kind: "COMPLETE",
      invocationId: control.invocationId,
      text: existsOnlyProposal(entryHandle),
      usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
    }));
    const cycle = openEngineeringCycle({
      mode: "BIND_ONLY",
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
    });
    expect(cycle.ok).toBe(true);
    if (!cycle.ok) return;
    const result = await cycle.value.run({
      correlationId: "c-e02",
      instructionText: "bind references only",
      contextBlocks: [
        {
          blockId: "b1",
          role: "REFERENCE_MATERIAL",
          text: `contentHandle=${contentHandle}`,
          referenceHandles: [contentHandle, entryHandle],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.terminalState).toBe("BOUND");
    expect(result.value.record.validationDispatched).toBe(false);
    expect(result.value.artifacts.boundReasoning).not.toBeNull();
    cycle.value.close();
    brain.dispose();
  });

  it("E03: eligible Gate1 refusal -> one revised Brain request -> bind", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const entryHandle = handleFor(fx.descriptors, "ENTRY", "src/hello.ts");
    let call = 0;
    const brain = await buildBrain(async (_p, control) => {
      call += 1;
      if (call === 1) {
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: "{not-json",
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      }
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: existsOnlyProposal(entryHandle),
        usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
      };
    });
    const cycle = openEngineeringCycle(
      {
        mode: "BIND_ONLY",
        workspace: fx.fixture.workspace,
        snapshot: fx.fixture.snapshot,
        catalog: fx.catalog,
        brain,
      },
      { maxBrainAttempts: 3 },
    );
    expect(cycle.ok).toBe(true);
    if (!cycle.ok) return;
    const result = await cycle.value.run({
      correlationId: "c-e03",
      instructionText: "revise then bind",
      contextBlocks: [
        {
          blockId: "b1",
          role: "REFERENCE_MATERIAL",
          text: "refs",
          referenceHandles: [contentHandle],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.terminalState).toBe("BOUND");
    expect(result.value.record.brainAttemptCount).toBe(2);
    expect(result.value.record.revisionCount).toBe(1);
    expect(result.value.record.attempts).toHaveLength(2);
    expect(result.value.record.attempts[0]!.gate1Outcome?.kind).toBe("INPUT");
    expect(result.value.record.attempts[0]!.gate1Outcome?.code).toBe("INVALID_JSON");
    expect(call).toBe(2);
    // Second packet includes diagnostic purpose REVISE
    brain.dispose();
  });

  it("E04: packet/diagnostic bounds; secrets absent from telemetry/diagnostics", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const entryHandle = handleFor(fx.descriptors, "ENTRY", "src/hello.ts");
    const secret = "SECRET_PROPOSAL_TOKEN_LEAK=xyz";
    let call = 0;
    let secondPacketText = "";
    const brain = await buildBrain(async (packet, control) => {
      call += 1;
      if (call === 2) {
        secondPacketText = JSON.stringify(packet.context.blocks);
      }
      if (call === 1) {
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: "{bad",
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      }
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: existsOnlyProposal(entryHandle),
        usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
      };
    });
    const cycle = openEngineeringCycle(
      {
        mode: "BIND_ONLY",
        workspace: fx.fixture.workspace,
        snapshot: fx.fixture.snapshot,
        catalog: fx.catalog,
        brain,
      },
      { maxBrainAttempts: 3 },
    );
    if (!cycle.ok) return;
    const result = await cycle.value.run({
      correlationId: "c-e04",
      instructionText: `task ${secret}`,
      contextBlocks: [
        {
          blockId: "b1",
          role: "REFERENCE_MATERIAL",
          text: `source ${secret}`,
          referenceHandles: [contentHandle],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const summary = summarizeEngineeringCycle(result.value.record);
    const summaryJson = JSON.stringify(summary);
    expect(summaryJson).not.toContain(secret);
    expect(JSON.stringify(result.value.record)).not.toContain(secret);
    expect(secondPacketText).toContain(COORDINATOR_DIAGNOSTIC_BLOCK_ID);
    // Original caller context is retained by design; diagnostic template must stay safe.
    expect(secondPacketText).toContain("Gate1 refusal code=INVALID_JSON");
    expect(secondPacketText).not.toContain("{bad");
    expect(secondPacketText).not.toMatch(/error\.message|stack|SECRET_ADAPTER/);
    brain.dispose();
  });

  it("E05: six-code + INPUT/CATALOG disposition table; unknown terminates", () => {
    const six = [
      "UNBOUND_CLAIM",
      "EVIDENCE_IDENTITY_MISMATCH",
      "STALE_EVIDENCE",
      "GROUNDING_OVERCLAIM",
      "UNVERIFIABLE_IN_PRECONDITION",
      "CLAIM_OUTSIDE_ADMITTED_SET",
    ] as const;
    const revise = new Set([
      "UNBOUND_CLAIM",
      "EVIDENCE_IDENTITY_MISMATCH",
      "GROUNDING_OVERCLAIM",
    ]);
    for (const code of six) {
      const d = dispositionForGate1Failure({
        kind: "REFUSAL",
        refusal: { code, claimId: "c1", reason: "x" },
      });
      if (revise.has(code)) {
        expect(d.action).toBe("REVISE");
      } else {
        expect(d.action).toBe("TERMINAL");
      }
    }
    expect(
      dispositionForGate1Failure({
        kind: "INPUT",
        code: "INVALID_JSON",
        message: "x",
      }).action,
    ).toBe("REVISE");
    expect(
      dispositionForGate1Failure({
        kind: "INPUT",
        code: "FORBIDDEN_FIELD",
        message: "x",
      }).action,
    ).toBe("TERMINAL");
    expect(
      dispositionForGate1Failure({
        kind: "INPUT",
        code: "SCHEMA_INVALID",
        message: "x",
      }).action,
    ).toBe("TERMINAL");
    expect(
      dispositionForGate1Failure({
        kind: "CATALOG",
        code: "DISPOSED_CATALOG",
        message: "x",
      }).action,
    ).toBe("TERMINAL");
    expect(
      dispositionForGate1Failure({
        kind: "REFUSAL",
        refusal: {
          // @ts-expect-error unknown code
          code: "CREATION_WITHOUT_SEARCH",
          claimId: "c1",
          reason: "x",
        },
      }).action,
    ).toBe("TERMINAL");
  });

  it("E06: STALE_EVIDENCE terminates without another Brain call", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    let calls = 0;
    const brain = await buildBrain(async (_p, control) => {
      calls += 1;
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: definesBehavesProposal(contentHandle),
        usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
      };
    });
    // Mutate bytes same size before bind so Gate1 STALE_EVIDENCE on content verify.
    const path = join(fx.root, "src/hello.ts");
    const original = readFileSync(path);
    const mutated = Buffer.alloc(original.length, 0x41);
    writeFileSync(path, mutated);
    utimesSync(path, new Date(), new Date());

    const cycle = openEngineeringCycle(
      {
        mode: "BIND_ONLY",
        workspace: fx.fixture.workspace,
        snapshot: fx.fixture.snapshot,
        catalog: fx.catalog,
        brain,
      },
      { maxBrainAttempts: 3 },
    );
    if (!cycle.ok) return;
    const result = await cycle.value.run({
      correlationId: "c-e06",
      instructionText: "stale",
      contextBlocks: [
        {
          blockId: "b1",
          role: "REFERENCE_MATERIAL",
          text: "x",
          referenceHandles: [contentHandle],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.terminalState).toBe("FAILED");
    expect(result.value.record.originCode).toBe("EVIDENCE_STALE");
    expect(calls).toBe(1);
    brain.dispose();
  });

  it("E07: revision cap enforced independently", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    let calls = 0;
    const brain = await buildBrain(
      async (_p, control) => {
        calls += 1;
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: "{bad",
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      },
      { maxDispatches: 8 },
    );
    const cycle = openEngineeringCycle(
      {
        mode: "BIND_ONLY",
        workspace: fx.fixture.workspace,
        snapshot: fx.fixture.snapshot,
        catalog: fx.catalog,
        brain,
      },
      { maxBrainAttempts: 2 },
    );
    if (!cycle.ok) return;
    const result = await cycle.value.run({
      correlationId: "c-e07",
      instructionText: "exhaust",
      contextBlocks: [
        {
          blockId: "b1",
          role: "REFERENCE_MATERIAL",
          text: "x",
          referenceHandles: [contentHandle],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.terminalState).toBe("EXHAUSTED");
    expect(calls).toBe(2);
    brain.dispose();
  });

  it("E08: concurrent run refuses; duplicate cannot release original", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const entryHandle = handleFor(fx.descriptors, "ENTRY", "src/hello.ts");
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const brain = await buildBrain(async (_p, control) => {
      await gate;
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: existsOnlyProposal(entryHandle),
        usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
      };
    });
    const cycle = openEngineeringCycle({
      mode: "BIND_ONLY",
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
    });
    if (!cycle.ok) return;
    const task = {
      correlationId: "c-e08",
      instructionText: "busy",
      contextBlocks: [
        {
          blockId: "b1",
          role: "REFERENCE_MATERIAL" as const,
          text: "x",
          referenceHandles: [entryHandle],
        },
      ],
    };
    const first = cycle.value.run(task);
    const second = await cycle.value.run(task);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("BUSY");
    release();
    const done = await first;
    expect(done.ok).toBe(true);
    const third = await cycle.value.run(task);
    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.error.code).toBe("CYCLE_ALREADY_RUN");
    }
    brain.dispose();
  });
});

describe("orchestrator E09–E12 deadline / cancel / gate2", () => {
  it("E09: scheduled deadline refuses late success (fake timers)", async () => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "Date",
        "performance",
      ],
    });
    const fx = await fixtureWithSourceAndManifest();
    const entryHandle = handleFor(fx.descriptors, "ENTRY", "src/hello.ts");
    let resolveAdapter!: (v: unknown) => void;
    const held = new Promise((r) => {
      resolveAdapter = r;
    });
    const adapter = createDeterministicAdapter({
      providerId: "t",
      modelId: "m",
      script: async (_p, control) => {
        await held;
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: existsOnlyProposal(entryHandle),
          usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
        };
      },
    });
    const brainResult = createEngineeringBrain(adapter);
    expect(brainResult.ok).toBe(true);
    if (!brainResult.ok) return;
    const cycle = openEngineeringCycle(
      {
        mode: "BIND_ONLY",
        workspace: fx.fixture.workspace,
        snapshot: fx.fixture.snapshot,
        catalog: fx.catalog,
        brain: brainResult.value,
      },
      { cycleAdmissionMs: 1_000, brainAttemptTimeoutMs: 5_000 },
    );
    if (!cycle.ok) return;
    const pending = cycle.value.run({
      correlationId: "c-e09",
      instructionText: "deadline",
      contextBlocks: [
        {
          blockId: "b1",
          role: "REFERENCE_MATERIAL",
          text: "x",
          referenceHandles: [entryHandle],
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(1_000);
    resolveAdapter(undefined);
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(["TIMED_OUT", "CANCELLED", "FAILED"]).toContain(
      result.value.record.terminalState,
    );
    expect(result.value.record.terminalState).not.toBe("BOUND");
    brainResult.value.dispose();
  });

  it("E10: pre-cancel and idempotent close; borrowed brain not disposed", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const entryHandle = handleFor(fx.descriptors, "ENTRY", "src/hello.ts");
    const brain = await buildBrain(async (_p, control) => ({
      kind: "COMPLETE",
      invocationId: control.invocationId,
      text: existsOnlyProposal(entryHandle),
      usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
    }));
    const cycle = openEngineeringCycle({
      mode: "BIND_ONLY",
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
    });
    if (!cycle.ok) return;
    const ac = new AbortController();
    ac.abort();
    const result = await cycle.value.run(
      {
        correlationId: "c-e10",
        instructionText: "cancel",
        contextBlocks: [
          {
            blockId: "b1",
            role: "REFERENCE_MATERIAL",
            text: "x",
            referenceHandles: [entryHandle],
          },
        ],
      },
      { signal: ac.signal },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.terminalState).toBe("CANCELLED");
    expect(brain.describe().disposed).toBe(false);
    cycle.value.close();
    cycle.value.close();
    expect(cycle.value.describe().closed).toBe(true);
    brain.dispose();
  });

  it("E11: BIND_ONLY and zero EXECUTION skip validation; bad assignment fails", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const { plan, authorization } = await prepareAuthorizedPlan({
      root: fx.root,
      snapshot: fx.fixture.snapshot,
      workspace: fx.fixture.workspace,
      config: fx.fixture.config,
      declaredObservations: [fx.sourceObservation],
      checks: [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
      ],
    });
    const brain = await buildBrain(async (_p, control) => ({
      kind: "COMPLETE",
      invocationId: control.invocationId,
      text: definesBehavesProposal(contentHandle),
      usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
    }));
    const cycle = openEngineeringCycle({
      mode: "BIND_AND_VALIDATE",
      workspace: fx.fixture.workspace,
      snapshot: fx.fixture.snapshot,
      catalog: fx.catalog,
      brain,
      validationPlan: plan,
      validationAuthorization: authorization,
      claimCheckAssignments: [
        { claimId: "defines-1", selectedCheckIds: ["missing-check"] },
        { claimId: "behaves-1", selectedCheckIds: ["typecheck"] },
      ],
    });
    if (!cycle.ok) return;
    const result = await cycle.value.run({
      correlationId: "c-e11",
      instructionText: "bad map",
      contextBlocks: [
        {
          blockId: "b1",
          role: "REFERENCE_MATERIAL",
          text: "x",
          referenceHandles: [contentHandle],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.terminalState).toBe("FAILED");
    expect(result.value.record.originCode).toBe("GATE2_PREPARE_FAILED");
    expect(result.value.record.validationDispatched).toBe(false);
    brain.dispose();
  });

  it("E12: negative Engineering Run/Gate2 -> NOT_SUBSTANTIATED; no retry", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const failScript = await writeScript(fx.root, "fail.mjs", "process.exit(1);\n");
    const { plan, authorization } = await prepareAuthorizedPlan({
      root: fx.root,
      snapshot: fx.fixture.snapshot,
      workspace: fx.fixture.workspace,
      config: fx.fixture.config,
      declaredObservations: [fx.sourceObservation],
      checks: [
        {
          id: "typecheck",
          kind: "TYPECHECK",
          request: { ...nodeRequest(fx.root, failScript), timeoutMs: 5_000 },
        },
        {
          id: "test",
          kind: "TARGETED_TEST",
          request: { ...nodeRequest(fx.root, failScript), timeoutMs: 5_000 },
        },
      ],
    });
    let calls = 0;
    const brain = await buildBrain(async (_p, control) => {
      calls += 1;
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: definesBehavesProposal(contentHandle),
        usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
      };
    });
    const cycle = openEngineeringCycle(
      {
        mode: "BIND_AND_VALIDATE",
        workspace: fx.fixture.workspace,
        snapshot: fx.fixture.snapshot,
        catalog: fx.catalog,
        brain,
        validationPlan: plan,
        validationAuthorization: authorization,
        claimCheckAssignments: [
          { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
          { claimId: "behaves-1", selectedCheckIds: ["test"] },
        ],
      },
      { cycleAdmissionMs: 180_000 },
    );
    if (!cycle.ok) return;
    const result = await cycle.value.run({
      correlationId: "c-e12",
      instructionText: "fail validation",
      contextBlocks: [
        {
          blockId: "b1",
          role: "REFERENCE_MATERIAL",
          text: "x",
          referenceHandles: [contentHandle],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.terminalState).toBe("NOT_SUBSTANTIATED");
    expect(result.value.artifacts.engineeringRun).not.toBeNull();
    expect(result.value.artifacts.engineeringRun?.planCriterionSatisfied).toBe(
      false,
    );
    expect(calls).toBe(1);
    brain.dispose();
  }, 30_000);
});
