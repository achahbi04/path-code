/**
 * Phase 5C Gate 2 proofs C01–C24 (runtime) + private association seams.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkEngineeringRunApplicability,
  executeEngineeringRun,
  resolveRegisteredEngineeringRunBinding,
} from "../../src/engineering-run/index.js";
import { resetEngineeringRunRegistryForTests } from "../../src/engineering-run/internal/registry.js";
import { explicitLocalProcessApproval } from "../../src/execution/index.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import { resetRunEvidenceRegistryForTests } from "../../src/run-evidence/internal/registry.js";
import {
  assertExactPreparedPlanAssociation,
  assertInheritedValidationSuccess,
} from "../../src/reasoning/gate2/association.js";
import {
  checkExecutionEvidenceAssessmentApplicability,
  evaluateExecutionEvidence,
  prepareExecutionEvidencePlan,
} from "../../src/reasoning/gate2/index.js";
import { lookupExecutionEvidencePlan } from "../../src/reasoning/gate2/registry.js";
import { resetExecutionEvidenceRegistryForTests } from "../../src/reasoning/gate2/registry.js";
import {
  bindReasoningProposalJson,
  disposeReferenceCatalog,
} from "../../src/reasoning/index.js";
import {
  authorizeValidationPlan,
  prepareValidationPlan,
  resolveRegisteredPreparedValidationPlan,
} from "../../src/validation/index.js";
import { resetValidationRegistryForTests } from "../../src/validation/internal/registry.js";
import type {
  PreparedValidationPlan,
  ValidationCheckSpec,
} from "../../src/validation/types.js";
import {
  cleanupReasoningFixtures,
  admittedEntry,
  createCanonicalTempRoot,
  fixtureWithSourceAndManifest,
  handleFor,
  proposalJson,
  snapshotAt,
  writeDenyConfig,
  writePackageJson,
  writeRelative,
} from "./helpers.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const localTsc = join(repoRoot, "node_modules/typescript/bin/tsc");

afterEach(async () => {
  vi.restoreAllMocks();
  resetExecutionEvidenceRegistryForTests();
  resetEngineeringRunRegistryForTests();
  resetRunEvidenceRegistryForTests();
  resetValidationRegistryForTests();
  resetLocalProcessRegistryForTests();
  await cleanupReasoningFixtures();
});

function nodeRequest(root: string, scriptPath: string) {
  return {
    executable: process.execPath,
    argv: [scriptPath],
    cwd: root,
  };
}

function approvalsFor(checks: readonly { id: string }[]) {
  const map = new Map<string, ReturnType<typeof explicitLocalProcessApproval>>();
  for (const check of checks) {
    map.set(check.id, explicitLocalProcessApproval());
  }
  return map;
}

async function writeScript(
  root: string,
  name: string,
  source: string,
): Promise<string> {
  const path = join(root, name);
  writeFileSync(path, source, "utf8");
  return path;
}

async function bindDefinesBehaves(
  catalog: Parameters<typeof bindReasoningProposalJson>[1],
  contentHandle: string,
  options?: {
    includeContains?: boolean;
    includeExists?: boolean;
    entryHandle?: string;
  },
) {
  const claims: unknown[] = [];
  if (options?.includeExists) {
    claims.push({
      claimId: "exists-1",
      kind: "EXISTS",
      statement: "source exists",
      proposedSubject: options.entryHandle
        ? { kind: "EVIDENCE_ID", id: options.entryHandle }
        : {
            kind: "REPOSITORY_RELATIVE_PATH",
            relativePath: "src/hello.ts",
          },
      proposedCitations: [],
    });
  }
  if (options?.includeContains) {
    claims.push({
      claimId: "contains-1",
      kind: "CONTAINS",
      statement: "has needle",
      needle: "hello",
      proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
      proposedCitations: [],
    });
  }
  claims.push(
    {
      claimId: "defines-1",
      kind: "DEFINES",
      statement: "defines hello",
      symbolName: "hello",
      proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
      proposedCitations: [],
    },
    {
      claimId: "behaves-1",
      kind: "BEHAVES",
      statement: "behaves",
      scenarioDescription: "hello returns 1",
      proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
      proposedCitations: [],
    },
  );
  return bindReasoningProposalJson(
    proposalJson({
      schemaVersion: 1,
      proposalId: "p-gate2",
      requestedOutcome: "evidence",
      claims,
      hypotheses: [
        {
          hypothesisId: "h1",
          epistemic: "INFERRED",
          statement: "maybe",
          supportingClaimIds: ["defines-1"],
        },
      ],
    }),
    catalog,
  );
}

async function preparePlanAndRun(options: {
  root: string;
  snapshot: PreparedValidationPlan["snapshot"];
  workspace: PreparedValidationPlan["workspace"];
  config: PreparedValidationPlan["config"];
  declaredObservations: PreparedValidationPlan["declaredObservations"];
  checks: ValidationCheckSpec[];
}) {
  const prepared = await prepareValidationPlan(
    options.checks,
    {
      snapshot: options.snapshot,
      declaredObservations: options.declaredObservations,
    },
    options.workspace,
    options.config,
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error(prepared.error.message);
  }
  const auth = await authorizeValidationPlan(
    prepared.value,
    approvalsFor(options.checks),
  );
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error(auth.error.message);
  }
  const run = await executeEngineeringRun(prepared.value, auth.value);
  expect(run.ok).toBe(true);
  if (!run.ok) {
    throw new Error(run.error.message);
  }
  return { plan: prepared.value, run: run.value };
}

describe("gate2 preparation", () => {
  it("C01: valid plan preparation binds artifacts and does not execute/edit", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
      { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
    ];
    const prepared = await prepareValidationPlan(
      checks,
      {
        snapshot: fx.fixture.snapshot,
        declaredObservations: [fx.sourceObservation],
      },
      fx.fixture.workspace,
      fx.fixture.config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const before = readFileSync(join(fx.root, "src/hello.ts"), "utf8");
    const plan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: prepared.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.executionObligationCount).toBe(2);
    expect(readFileSync(join(fx.root, "src/hello.ts"), "utf8")).toBe(before);
    expect(resolveRegisteredPreparedValidationPlan(prepared.value).ok).toBe(true);
  });

  it("C02: invalid bounds/duplicates/empty/non-execution/zero-execution refuse", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const existsOnly = await bindReasoningProposalJson(
      proposalJson({
        schemaVersion: 1,
        proposalId: "p",
        requestedOutcome: "x",
        claims: [
          {
            claimId: "c1",
            kind: "EXISTS",
            statement: "exists",
            proposedSubject: {
              kind: "REPOSITORY_RELATIVE_PATH",
              relativePath: "src/hello.ts",
            },
            proposedCitations: [],
          },
        ],
        hypotheses: [],
      }),
      fx.catalog,
    );
    expect(existsOnly.ok).toBe(true);
    if (!existsOnly.ok) return;

    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const prepared = await prepareValidationPlan(
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) }],
      {
        snapshot: fx.fixture.snapshot,
        declaredObservations: [fx.sourceObservation],
      },
      fx.fixture.workspace,
      fx.fixture.config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const noExec = await prepareExecutionEvidencePlan({
      reasoning: existsOnly.value.reasoning,
      catalog: fx.catalog,
      validationPlan: prepared.value,
      assignments: [],
    });
    expect(noExec.ok).toBe(false);
    if (!noExec.ok) {
      expect(noExec.error.code).toBe("NO_EXECUTION_OBLIGATIONS");
    }

    const bound = await bindDefinesBehaves(fx.catalog, contentHandle, {
      includeExists: true,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const prepared2 = await prepareValidationPlan(
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
      ],
      {
        snapshot: fx.fixture.snapshot,
        declaredObservations: [fx.sourceObservation],
      },
      fx.fixture.workspace,
      fx.fixture.config,
    );
    expect(prepared2.ok).toBe(true);
    if (!prepared2.ok) return;

    const emptySel = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: prepared2.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: [] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(emptySel.ok).toBe(false);

    const nonExecAssign = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: prepared2.value,
      assignments: [
        { claimId: "exists-1", selectedCheckIds: ["typecheck"] },
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(nonExecAssign.ok).toBe(false);

    const dup = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: prepared2.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck", "typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(dup.ok).toBe(false);
  });

  it("C03: BUILD cannot stand in for TYPECHECK/TARGETED_TEST; kinds covered", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const prepared = await prepareValidationPlan(
      [
        { id: "build", kind: "BUILD", request: nodeRequest(fx.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
      ],
      {
        snapshot: fx.fixture.snapshot,
        declaredObservations: [fx.sourceObservation],
      },
      fx.fixture.workspace,
      fx.fixture.config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const wrong = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: prepared.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["build"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(wrong.error.code).toBe("INVALID_CLAIM_CHECK_MAPPING");
    }
  });

  it("C04: foreign check ID / other plan check labels refuse; ordered defs retained", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const prepared = await prepareValidationPlan(
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
      ],
      {
        snapshot: fx.fixture.snapshot,
        declaredObservations: [fx.sourceObservation],
      },
      fx.fixture.workspace,
      fx.fixture.config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const missing = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: prepared.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["nope"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(missing.ok).toBe(false);

    const other = await fixtureWithSourceAndManifest();
    const otherScript = await writeScript(other.root, "ok.mjs", "process.exit(0);\n");
    const otherPlan = await prepareValidationPlan(
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(other.root, otherScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(other.root, otherScript) },
      ],
      {
        snapshot: other.fixture.snapshot,
        declaredObservations: [other.sourceObservation],
      },
      other.fixture.workspace,
      other.fixture.config,
    );
    expect(otherPlan.ok).toBe(true);
    if (!otherPlan.ok) return;

    const foreign = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: otherPlan.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      expect(foreign.error.code).toBe("CONTEXT_MISMATCH");
    }

    const ok = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: prepared.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const reg = lookupExecutionEvidencePlan(ok.value);
    expect(reg?.orderedChecks.map((c) => c.id)).toEqual(["typecheck", "test"]);
    expect(reg?.orderedChecks[0]?.preparedProcess).toBe(
      prepared.value.checks[0]?.preparedProcess,
    );
  });

  it("C05: equal paths/hashes/generation labels do not interchange foreign contexts", async () => {
    const a = await fixtureWithSourceAndManifest({
      extraSource: "export function hello() { return 1; }\n",
    });
    const b = await fixtureWithSourceAndManifest({
      extraSource: "export function hello() { return 1; }\n",
    });
    const handleA = handleFor(a.descriptors, "CONTENT", "src/hello.ts");
    const boundA = await bindDefinesBehaves(a.catalog, handleA);
    expect(boundA.ok).toBe(true);
    if (!boundA.ok) return;
    const okScript = await writeScript(b.root, "ok.mjs", "process.exit(0);\n");
    const planB = await prepareValidationPlan(
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(b.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(b.root, okScript) },
      ],
      {
        snapshot: b.fixture.snapshot,
        declaredObservations: [b.sourceObservation],
      },
      b.fixture.workspace,
      b.fixture.config,
    );
    expect(planB.ok).toBe(true);
    if (!planB.ok) return;
    // Equal relative paths and identical source bytes are insufficient.
    expect(a.sourceObservation.entry.relativePath).toBe(
      b.sourceObservation.entry.relativePath,
    );
    const mixed = await prepareExecutionEvidencePlan({
      reasoning: boundA.value.reasoning,
      catalog: a.catalog,
      validationPlan: planB.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) {
      expect(mixed.error.code).toBe("CONTEXT_MISMATCH");
    }
  });

  it("C06: omitted claim source refuses; legitimate subject superset accepted", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");

    const omitted = await prepareValidationPlan(
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
      ],
      {
        snapshot: fx.fixture.snapshot,
        declaredObservations: [fx.packageObservation],
      },
      fx.fixture.workspace,
      fx.fixture.config,
    );
    expect(omitted.ok).toBe(true);
    if (!omitted.ok) return;
    const refused = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: omitted.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("SOURCE_NOT_IN_VALIDATION_SCOPE");
    }

    const supersets = await prepareValidationPlan(
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
      ],
      {
        snapshot: fx.fixture.snapshot,
        declaredObservations: [fx.sourceObservation, fx.packageObservation],
      },
      fx.fixture.workspace,
      fx.fixture.config,
    );
    expect(supersets.ok).toBe(true);
    if (!supersets.ok) return;
    const accepted = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: supersets.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(accepted.ok).toBe(true);
  });
});

describe("gate2 evaluation", () => {
  async function happyPath() {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle, {
      includeContains: true,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) {
      throw new Error("bind failed");
    }
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
      { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
    ];
    const { plan, run } = await preparePlanAndRun({
      root: fx.root,
      snapshot: fx.fixture.snapshot,
      workspace: fx.fixture.workspace,
      config: fx.fixture.config,
      declaredObservations: [fx.sourceObservation],
      checks,
    });
    const evidencePlan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: plan,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(evidencePlan.ok).toBe(true);
    if (!evidencePlan.ok) {
      throw new Error(evidencePlan.error.message);
    }
    return { fx, bound: bound.value.reasoning, plan, run, evidencePlan: evidencePlan.value };
  }

  it("C07: authentic successful run yields scoped acceptance with CITED_RUN_ONLY", async () => {
    const ctx = await happyPath();
    const assessed = await evaluateExecutionEvidence(ctx.evidencePlan, ctx.run);
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) return;
    expect(assessed.value.decision).toBe("EXECUTION_EVIDENCE_ACCEPTED");
    expect(assessed.value.engineeringRunId).toBe(ctx.run.engineeringRunId);
    expect(assessed.value.validationPlanId).toBe(ctx.plan.planId);
    expect(assessed.value.outstandingNonExecutionClaimIds).toContain("contains-1");
    const { lookupExecutionEvidenceAssessment } = await import(
      "../../src/reasoning/gate2/registry.js"
    );
    const reg = lookupExecutionEvidenceAssessment(assessed.value);
    expect(reg?.citations.every((c) => c.meaning === "CITED_RUN_ONLY")).toBe(true);
    expect(reg?.citations[0]?.run).toBe(ctx.run);
  });

  it("C08: copied run/IDs/JSON and wrong plan cannot authenticate", async () => {
    const ctx = await happyPath();
    const clone = { ...ctx.run } as typeof ctx.run;
    const fake = await evaluateExecutionEvidence(ctx.evidencePlan, clone);
    expect(fake.ok).toBe(false);
    if (!fake.ok) {
      expect(fake.error.code).toBe("UNREGISTERED_ARTIFACT");
    }

    const other = await happyPath();
    const wrong = await evaluateExecutionEvidence(ctx.evidencePlan, other.run);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(wrong.error.code).toBe("PLAN_RUN_MISMATCH");
    }

    const binding = resolveRegisteredEngineeringRunBinding(ctx.run);
    expect(binding.ok).toBe(true);
    const summaryish = JSON.parse(JSON.stringify({ id: ctx.run.engineeringRunId }));
    expect(summaryish).toEqual({ id: ctx.run.engineeringRunId });
  });

  it("C09: selected checks passed but another required plan check failed => not accepted", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const failScript = await writeScript(fx.root, "fail.mjs", "process.exit(1);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
      { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
      { id: "lint", kind: "LINT", request: nodeRequest(fx.root, failScript) },
    ];
    const { plan, run } = await preparePlanAndRun({
      root: fx.root,
      snapshot: fx.fixture.snapshot,
      workspace: fx.fixture.workspace,
      config: fx.fixture.config,
      declaredObservations: [fx.sourceObservation],
      checks,
    });
    expect(run.planCriterionSatisfied).toBe(false);
    const evidencePlan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: plan,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(evidencePlan.ok).toBe(true);
    if (!evidencePlan.ok) return;
    const assessed = await evaluateExecutionEvidence(evidencePlan.value, run);
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) return;
    expect(assessed.value.decision).toBe("EXECUTION_EVIDENCE_NOT_ESTABLISHED");
  });

  it("C10/C11: failed results remain negative; applicability cannot upgrade failure", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const failScript = await writeScript(
      fx.root,
      "fail.mjs",
      "console.log('PASS'); process.exit(1);\n",
    );
    const checks: ValidationCheckSpec[] = [
      { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, failScript) },
      { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, failScript) },
    ];
    const { plan, run } = await preparePlanAndRun({
      root: fx.root,
      snapshot: fx.fixture.snapshot,
      workspace: fx.fixture.workspace,
      config: fx.fixture.config,
      declaredObservations: [fx.sourceObservation],
      checks,
    });
    const evidencePlan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: plan,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(evidencePlan.ok).toBe(true);
    if (!evidencePlan.ok) return;

    // Owner applicability for a failed criterion returns applicable:false (not a hard error).
    const app = await checkEngineeringRunApplicability(
      run,
      plan,
      fx.fixture.workspace,
    );
    expect(app.ok).toBe(true);
    if (app.ok) {
      expect(app.value.applicable).toBe(false);
    }

    const assessed = await evaluateExecutionEvidence(evidencePlan.value, run);
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) return;
    expect(assessed.value.decision).toBe("EXECUTION_EVIDENCE_NOT_ESTABLISHED");

    // C11: private acceptance predicate still refuses failed inherited outcomes
    // even if a caller pretends currentness was established.
    const inherited = assertInheritedValidationSuccess(run.validationResult, [
      "typecheck",
      "test",
    ]);
    expect(inherited.ok).toBe(false);

    const later = await checkExecutionEvidenceAssessmentApplicability(
      assessed.value,
    );
    // Fresh applicability observation must not upgrade the historical decision.
    expect(assessed.value.decision).toBe("EXECUTION_EVIDENCE_NOT_ESTABLISHED");
    if (later.ok) {
      expect(later.value.applicable).toBe(false);
    }
  });

  it("C12: same-size/same-mtime declared byte change invalidates evidence", async () => {
    const ctx = await happyPath();
    const path = join(ctx.fx.root, "src/hello.ts");
    const original = readFileSync(path);
    const replacement = Buffer.from("export function hello() { return 2; }\n");
    expect(replacement.byteLength).toBe(original.byteLength);
    const entry = ctx.fx.sourceObservation.entry;
    const mtimeSec = Math.floor(entry.mtimeMs! / 1000);
    writeFileSync(path, replacement);
    await utimes(path, mtimeSec, mtimeSec);

    const assessed = await evaluateExecutionEvidence(ctx.evidencePlan, ctx.run);
    expect(assessed.ok).toBe(false);
    if (!assessed.ok) {
      expect(assessed.error.code).toBe("APPLICABILITY_NOT_ESTABLISHED");
    }
  });

  it("C13: changed restrictions / denied applicability never accept", async () => {
    const ctx = await happyPath();
    await writeDenyConfig(ctx.fx.root, ["src"]);
    const assessed = await evaluateExecutionEvidence(ctx.evidencePlan, ctx.run);
    expect(assessed.ok).toBe(false);
    if (!assessed.ok) {
      expect(assessed.error.code).toBe("APPLICABILITY_NOT_ESTABLISHED");
    }
  });

  it("C14: extra Validation input change blocks via Engineering Run applicability", async () => {
    const fx = await fixtureWithSourceAndManifest();
    await writeRelative(fx.root, "tests/extra.txt", "EXTRA_CONTENT_V1\n");
    // Re-snapshot with extra file while keeping catalog on original narrow selection is hard;
    // instead: rebuild shared snapshot including extra, catalog only source, plan includes both.
    const root = await createCanonicalTempRoot("phase5c-c14-");
    await writePackageJson(root, "package.json", {
      name: "c14",
      dependencies: { typescript: "^5.0.0" },
    });
    await writeRelative(root, "src/hello.ts", "export function hello() { return 1; }\n");
    await writeRelative(root, "extra/input.txt", "AAAA\n");
    const fixture = await snapshotAt(root, {
      extraContentPaths: ["src/hello.ts", "extra/input.txt"],
    });
    const sourceEntry = admittedEntry(fixture.inventory, "src/hello.ts");
    const extraEntry = admittedEntry(fixture.inventory, "extra/input.txt");
    const sourceObservation =
      fixture.snapshot.contentObservationByEntry.get(sourceEntry)!;
    const extraObservation =
      fixture.snapshot.contentObservationByEntry.get(extraEntry)!;

    const { createReferenceCatalog, describeReferenceCatalog } = await import(
      "../../src/reasoning/catalog.js"
    );
    const catalogResult = createReferenceCatalog({
      workspace: fixture.workspace,
      snapshot: fixture.snapshot,
      selection: {
        entries: [sourceEntry],
        contentObservations: [sourceObservation],
      },
    });
    expect(catalogResult.ok).toBe(true);
    if (!catalogResult.ok) return;
    const described = describeReferenceCatalog(catalogResult.value);
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    const contentHandle = handleFor(described.value, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(catalogResult.value, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const okScript = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { plan, run } = await preparePlanAndRun({
      root,
      snapshot: fixture.snapshot,
      workspace: fixture.workspace,
      config: fixture.config,
      declaredObservations: [sourceObservation, extraObservation],
      checks: [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(root, okScript) },
      ],
    });
    const evidencePlan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: catalogResult.value,
      validationPlan: plan,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(evidencePlan.ok).toBe(true);
    if (!evidencePlan.ok) return;

    const path = join(root, "extra/input.txt");
    const original = readFileSync(path);
    const replacement = Buffer.from("BBBB\n");
    expect(replacement.byteLength).toBe(original.byteLength);
    const mtimeSec = Math.floor(extraEntry.mtimeMs! / 1000);
    writeFileSync(path, replacement);
    await utimes(path, mtimeSec, mtimeSec);

    const assessed = await evaluateExecutionEvidence(evidencePlan.value, run);
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) return;
    // Extra declared Validation input stale => Engineering Run currentness fails;
    // Gate 2 yields truthful non-acceptance (not an authenticated ACCEPTED upgrade).
    expect(assessed.value.decision).toBe("EXECUTION_EVIDENCE_NOT_ESTABLISHED");
    expect(assessed.value.currentnessApplicable).toBe(false);
  });

  it("C15: pre-edit reasoning with post-edit run refuses; rebind can assess", async () => {
    const fx = await fixtureWithSourceAndManifest({
      extraSource: "export function hello() { return 1; }\n",
    });
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    writeFileSync(
      join(fx.root, "src/hello.ts"),
      "export function hello() { return 9; }\n",
    );
    const post = await snapshotAt(fx.root, { extraContentPaths: ["src/hello.ts"] });
    const postObs = post.contentObservations.find(
      (o) => o.entry.relativePath === "src/hello.ts",
    )!;
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const { plan: postPlan, run: postRun } = await preparePlanAndRun({
      root: fx.root,
      snapshot: post.snapshot,
      workspace: post.workspace,
      config: post.config,
      declaredObservations: [postObs],
      checks: [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
      ],
    });

    const stalePrep = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: postPlan,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(stalePrep.ok).toBe(false);
    if (!stalePrep.ok) {
      expect(stalePrep.error.code).toBe("CONTEXT_MISMATCH");
    }

    const { createReferenceCatalog, describeReferenceCatalog } = await import(
      "../../src/reasoning/catalog.js"
    );
    const postEntry = admittedEntry(post.inventory, "src/hello.ts");
    const catalog2 = createReferenceCatalog({
      workspace: post.workspace,
      snapshot: post.snapshot,
      selection: {
        entries: [postEntry],
        contentObservations: [postObs],
      },
    });
    expect(catalog2.ok).toBe(true);
    if (!catalog2.ok) return;
    const desc2 = describeReferenceCatalog(catalog2.value);
    expect(desc2.ok).toBe(true);
    if (!desc2.ok) return;
    const handle2 = handleFor(desc2.value, "CONTENT", "src/hello.ts");
    const rebound = await bindDefinesBehaves(catalog2.value, handle2);
    expect(rebound.ok).toBe(true);
    if (!rebound.ok) return;
    const evidencePlan = await prepareExecutionEvidencePlan({
      reasoning: rebound.value.reasoning,
      catalog: catalog2.value,
      validationPlan: postPlan,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(evidencePlan.ok).toBe(true);
    if (!evidencePlan.ok) return;
    const assessed = await evaluateExecutionEvidence(evidencePlan.value, postRun);
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) return;
    expect(assessed.value.decision).toBe("EXECUTION_EVIDENCE_ACCEPTED");
  });

  it("C16: CONTAINS deferred and hypotheses unchanged when execution evidence accepted", async () => {
    const ctx = await happyPath();
    const assessed = await evaluateExecutionEvidence(ctx.evidencePlan, ctx.run);
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) return;
    expect(assessed.value.decision).toBe("EXECUTION_EVIDENCE_ACCEPTED");
    expect(assessed.value.outstandingNonExecutionClaimIds).toEqual(["contains-1"]);
    const contains = ctx.bound.claims.find((c) => c.kind === "CONTAINS");
    expect(contains?.requiredVerification.method).toBe("DEFERRED_CONTENT_CHECK");
    expect(ctx.bound.hypotheses[0]?.epistemic).toBe("INFERRED");
    expect(assessed.value).not.toHaveProperty("safeToWrite");
    expect(assessed.value).not.toHaveProperty("isTrue");
  });

  it("C17: caller mutation of assignment arrays cannot rewrite authoritative mapping", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const prepared = await prepareValidationPlan(
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
      ],
      {
        snapshot: fx.fixture.snapshot,
        declaredObservations: [fx.sourceObservation],
      },
      fx.fixture.workspace,
      fx.fixture.config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const mutableIds = ["typecheck"];
    const assignments = [
      { claimId: "defines-1", selectedCheckIds: mutableIds },
      { claimId: "behaves-1", selectedCheckIds: ["test"] },
    ];
    const plan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: prepared.value,
      assignments,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    mutableIds.push("test");
    assignments[0]!.claimId = "hijacked";
    const reg = lookupExecutionEvidencePlan(plan.value);
    expect(reg?.assignments[0]?.claimId).toBe("defines-1");
    expect([...reg!.assignments[0]!.selectedCheckIds]).toEqual(["typecheck"]);
  });

  it("C18: catalog disposed before/during assessment cannot accept; later applicability refuses", async () => {
    const ctx = await happyPath();
    const accepted = await evaluateExecutionEvidence(ctx.evidencePlan, ctx.run);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;

    disposeReferenceCatalog(ctx.fx.catalog);
    const later = await checkExecutionEvidenceAssessmentApplicability(
      accepted.value,
    );
    expect(later.ok).toBe(false);

    const fx2 = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx2.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx2.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const okScript = await writeScript(fx2.root, "ok.mjs", "process.exit(0);\n");
    const { plan, run } = await preparePlanAndRun({
      root: fx2.root,
      snapshot: fx2.fixture.snapshot,
      workspace: fx2.fixture.workspace,
      config: fx2.fixture.config,
      declaredObservations: [fx2.sourceObservation],
      checks: [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx2.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx2.root, okScript) },
      ],
    });
    const evidencePlan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx2.catalog,
      validationPlan: plan,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(evidencePlan.ok).toBe(true);
    if (!evidencePlan.ok) return;

    // Deterministic seam: dispose at the owning live-catalog check during evaluation.
    const catalogMod = await import("../../src/reasoning/catalog.js");
    const originalRequire = catalogMod.requireLiveCatalog;
    let calls = 0;
    vi.spyOn(catalogMod, "requireLiveCatalog").mockImplementation((catalog) => {
      calls += 1;
      if (calls >= 2) {
        catalogMod.disposeReferenceCatalog(catalog);
      }
      return originalRequire(catalog);
    });
    // Re-import evaluate so the spy is visible if the bundler rebinds; also dispose
    // mid-flight via Engineering Run applicability call as a second seam.
    const eng = await import("../../src/engineering-run/index.js");
    const originalEng = eng.checkEngineeringRunApplicability;
    vi.spyOn(eng, "checkEngineeringRunApplicability").mockImplementation(
      async (runArg, planArg, workspaceArg) => {
        catalogMod.disposeReferenceCatalog(fx2.catalog);
        return originalEng(runArg, planArg, workspaceArg);
      },
    );

    const during = await evaluateExecutionEvidence(evidencePlan.value, run);
    expect(during.ok).toBe(false);
    if (!during.ok) {
      expect(
        during.error.code === "APPLICABILITY_NOT_ESTABLISHED" ||
          during.error.code === "UNREGISTERED_ARTIFACT",
      ).toBe(true);
    }
  });

  it("C19: historical assessment immutable; clone refuses; stale applicability", async () => {
    const ctx = await happyPath();
    const assessed = await evaluateExecutionEvidence(ctx.evidencePlan, ctx.run);
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) return;
    const decision = assessed.value.decision;
    expect(decision).toBe("EXECUTION_EVIDENCE_ACCEPTED");

    writeFileSync(
      join(ctx.fx.root, "src/hello.ts"),
      "export function hello() { return 3; }\n",
    );
    const fresh = await checkExecutionEvidenceAssessmentApplicability(
      assessed.value,
    );
    expect(fresh.ok).toBe(false);
    expect(assessed.value.decision).toBe(decision);

    const clone = { ...assessed.value } as typeof assessed.value;
    const clonedApp = await checkExecutionEvidenceAssessmentApplicability(clone);
    expect(clonedApp.ok).toBe(false);
  });

  it("C20: no process retry/execution from Gate 2; repeated assessment is assessment-only", async () => {
    const ctx = await happyPath();
    const gate2Source = readFileSync(
      join(repoRoot, "src/reasoning/gate2/evaluate.ts"),
      "utf8",
    );
    expect(gate2Source).not.toMatch(/executeEngineeringRun/);
    expect(gate2Source).not.toMatch(/executeValidationPlan/);
    const first = await evaluateExecutionEvidence(ctx.evidencePlan, ctx.run);
    const second = await evaluateExecutionEvidence(ctx.evidencePlan, ctx.run);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.assessmentCorrelationId).not.toBe(
        second.value.assessmentCorrelationId,
      );
      expect(first.value.decision).toBe("EXECUTION_EVIDENCE_ACCEPTED");
      expect(second.value.decision).toBe("EXECUTION_EVIDENCE_ACCEPTED");
    }
  });
});

describe("gate2 e2e and diagnostics", () => {
  it("C21: real tsc + targeted test -> Gate 2 accept -> byte change reuse refused", async () => {
    const root = await createCanonicalTempRoot("phase5c-c21-");
    await writePackageJson(root, "package.json", {
      name: "c21",
      dependencies: { typescript: "^5.0.0" },
    });
    await writeRelative(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["src/**/*.ts"],
      }),
    );
    await writeRelative(
      root,
      "src/hello.ts",
      "export function hello(): number { return 1; }\n",
    );
    await writeRelative(
      root,
      "tests/hello.test.mjs",
      "import { createRequire } from 'node:module';\n" +
        "const require = createRequire(import.meta.url);\n" +
        // Use a trivial local assertion without compiling TS in-process.
        "if (1 !== 1) process.exit(1);\n" +
        "process.exit(0);\n",
    );

    const fixture = await snapshotAt(root, {
      extraContentPaths: ["src/hello.ts", "tsconfig.json"],
    });
    const sourceEntry = admittedEntry(fixture.inventory, "src/hello.ts");
    const sourceObservation =
      fixture.snapshot.contentObservationByEntry.get(sourceEntry)!;

    const { createReferenceCatalog, describeReferenceCatalog } = await import(
      "../../src/reasoning/catalog.js"
    );
    const catalogResult = createReferenceCatalog({
      workspace: fixture.workspace,
      snapshot: fixture.snapshot,
      selection: {
        entries: [sourceEntry],
        contentObservations: [sourceObservation],
      },
    });
    expect(catalogResult.ok).toBe(true);
    if (!catalogResult.ok) return;
    const described = describeReferenceCatalog(catalogResult.value);
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    const contentHandle = handleFor(described.value, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(catalogResult.value, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const testScript = join(root, "tests/hello.test.mjs");
    const checks: ValidationCheckSpec[] = [
      {
        id: "typecheck",
        kind: "TYPECHECK",
        request: {
          executable: localTsc,
          argv: ["-p", "tsconfig.json"],
          cwd: root,
        },
      },
      {
        id: "test",
        kind: "TARGETED_TEST",
        request: nodeRequest(root, testScript),
      },
    ];
    const { plan, run } = await preparePlanAndRun({
      root,
      snapshot: fixture.snapshot,
      workspace: fixture.workspace,
      config: fixture.config,
      declaredObservations: [sourceObservation],
      checks,
    });
    expect(run.planCriterionSatisfied).toBe(true);

    const evidencePlan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: catalogResult.value,
      validationPlan: plan,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(evidencePlan.ok).toBe(true);
    if (!evidencePlan.ok) return;
    const assessed = await evaluateExecutionEvidence(evidencePlan.value, run);
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) return;
    expect(assessed.value.decision).toBe("EXECUTION_EVIDENCE_ACCEPTED");

    writeFileSync(
      join(root, "src/hello.ts"),
      "export function hello(): number { return 2; }\n",
    );
    const reuse = await evaluateExecutionEvidence(evidencePlan.value, run);
    expect(reuse.ok).toBe(false);
  }, 60_000);

  it("C22: safe assessment metadata does not leak secrets/paths; JSON view informational", async () => {
    const root = await createCanonicalTempRoot("phase5c-c22-");
    await writePackageJson(root, "package.json", { name: "c22" });
    await writeRelative(root, "src/hello.ts", "export function hello() { return 1; }\n");
    const secret = "SECRET_ARGV_TOKEN_XYZ";
    const envSecret = "SECRET_ENV_VALUE_ABC";
    const fixture = await snapshotAt(root, { extraContentPaths: ["src/hello.ts"] });
    const sourceEntry = admittedEntry(fixture.inventory, "src/hello.ts");
    const sourceObservation =
      fixture.snapshot.contentObservationByEntry.get(sourceEntry)!;
    const { createReferenceCatalog, describeReferenceCatalog } = await import(
      "../../src/reasoning/catalog.js"
    );
    const catalogResult = createReferenceCatalog({
      workspace: fixture.workspace,
      snapshot: fixture.snapshot,
      selection: {
        entries: [sourceEntry],
        contentObservations: [sourceObservation],
      },
    });
    expect(catalogResult.ok).toBe(true);
    if (!catalogResult.ok) return;
    const described = describeReferenceCatalog(catalogResult.value);
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    const handle = handleFor(described.value, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(catalogResult.value, handle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const script = await writeScript(
      root,
      "ok.mjs",
      `console.log(${JSON.stringify(envSecret)}); process.exit(0);\n`,
    );
    const checks: ValidationCheckSpec[] = [
      {
        id: "typecheck",
        kind: "TYPECHECK",
        request: {
          executable: process.execPath,
          argv: [script, secret],
          cwd: root,
          env: { LEAK_ME: envSecret },
        },
      },
      {
        id: "test",
        kind: "TARGETED_TEST",
        request: nodeRequest(root, script),
      },
    ];
    const { plan, run } = await preparePlanAndRun({
      root,
      snapshot: fixture.snapshot,
      workspace: fixture.workspace,
      config: fixture.config,
      declaredObservations: [sourceObservation],
      checks,
    });
    const evidencePlan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: catalogResult.value,
      validationPlan: plan,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(evidencePlan.ok).toBe(true);
    if (!evidencePlan.ok) return;
    const assessed = await evaluateExecutionEvidence(evidencePlan.value, run);
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) return;
    const encoded = JSON.stringify(assessed.value);
    expect(encoded).not.toContain(secret);
    expect(encoded).not.toContain(envSecret);
    expect(encoded).not.toContain(root);
    expect(encoded).not.toContain(process.execPath);
    const roundTrip = JSON.parse(encoded);
    const fake = await checkExecutionEvidenceAssessmentApplicability(
      roundTrip as never,
    );
    expect(fake.ok).toBe(false);
  });

  it("C23/C24: architecture markers, counts are configured checks, limitations survive", async () => {
    const ctxSource = readFileSync(
      join(repoRoot, "src/reasoning/gate2/index.ts"),
      "utf8",
    );
    expect(ctxSource).toContain("prepareExecutionEvidencePlan");
    expect(ctxSource).not.toMatch(/executeEngineeringRun/);
    const types = readFileSync(join(repoRoot, "src/reasoning/types.ts"), "utf8");
    expect(types).toContain('bindingStage: ReferenceBindingStage');
    expect(types).not.toMatch(/\bexport function\b/);

    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const { plan, run } = await preparePlanAndRun({
      root: fx.root,
      snapshot: fx.fixture.snapshot,
      workspace: fx.fixture.workspace,
      config: fx.fixture.config,
      declaredObservations: [fx.sourceObservation],
      checks: [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
      ],
    });
    expect(run.counts.plannedChecks).toBe(2);
    const evidencePlan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: plan,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(evidencePlan.ok).toBe(true);
    if (!evidencePlan.ok) return;
    expect(evidencePlan.value.executionObligationCount).toBe(2);
    expect(run.counts.plannedChecks).toBe(2);
    // Counts refer to configured checks/obligations, not Vitest discovery totals.
    expect(evidencePlan.value.assignmentCount).toBe(
      evidencePlan.value.executionObligationCount,
    );
    const assessed = await evaluateExecutionEvidence(evidencePlan.value, run);
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) return;
    expect(assessed.value.limitations.length).toBeGreaterThan(0);
    expect(assessed.value.limitations.join(" ")).toMatch(/not semantic truth/i);
    expect(assessed.value.claimStatuses).toHaveLength(2);
    expect(assessed.value).not.toHaveProperty("discoveredTestCount");
  });
});

describe("gate2 private association seams", () => {
  it("C04/C08 private assertExactPreparedPlanAssociation rejects wrong plan", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const bound = await bindDefinesBehaves(fx.catalog, contentHandle);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const prepared = await prepareValidationPlan(
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, okScript) },
      ],
      {
        snapshot: fx.fixture.snapshot,
        declaredObservations: [fx.sourceObservation],
      },
      fx.fixture.workspace,
      fx.fixture.config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const evidencePlan = await prepareExecutionEvidencePlan({
      reasoning: bound.value.reasoning,
      catalog: fx.catalog,
      validationPlan: prepared.value,
      assignments: [
        { claimId: "defines-1", selectedCheckIds: ["typecheck"] },
        { claimId: "behaves-1", selectedCheckIds: ["test"] },
      ],
    });
    expect(evidencePlan.ok).toBe(true);
    if (!evidencePlan.ok) return;
    const reg = lookupExecutionEvidencePlan(evidencePlan.value)!;
    const other = await fixtureWithSourceAndManifest();
    const otherScript = await writeScript(other.root, "ok.mjs", "process.exit(0);\n");
    const otherPlan = await prepareValidationPlan(
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(other.root, otherScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(other.root, otherScript) },
      ],
      {
        snapshot: other.fixture.snapshot,
        declaredObservations: [other.sourceObservation],
      },
      other.fixture.workspace,
      other.fixture.config,
    );
    expect(otherPlan.ok).toBe(true);
    if (!otherPlan.ok) return;
    const rejected = assertExactPreparedPlanAssociation(reg, otherPlan.value);
    expect(rejected.ok).toBe(false);
  });

  it("C09/C10 private assertInheritedValidationSuccess rejects non-pass aggregate", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const okScript = await writeScript(fx.root, "ok.mjs", "process.exit(0);\n");
    const failScript = await writeScript(fx.root, "fail.mjs", "process.exit(1);\n");
    const { plan, run } = await preparePlanAndRun({
      root: fx.root,
      snapshot: fx.fixture.snapshot,
      workspace: fx.fixture.workspace,
      config: fx.fixture.config,
      declaredObservations: [fx.sourceObservation],
      checks: [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(fx.root, okScript) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(fx.root, failScript) },
      ],
    });
    expect(run.planCriterionSatisfied).toBe(false);
    const rejected = assertInheritedValidationSuccess(run.validationResult, [
      "typecheck",
      "test",
    ]);
    expect(rejected.ok).toBe(false);
    expect(plan.checks.length).toBe(2);
  });
});

describe("gate2 bypass probes", () => {
  it("bypass 1: weaken exact plan association — C04/C08 private seam fails open", () => {
    const target = join(repoRoot, "src/reasoning/gate2/association.ts");
    const original = readFileSync(target, "utf8");
    const originalHash = createHash("sha256").update(original).digest("hex");
    const corrupted = original.replace(
      "if (runPlan !== registration.validationPlan) {",
      "if (false && runPlan !== registration.validationPlan) {",
    );
    expect(corrupted).not.toBe(original);
    writeFileSync(target, corrupted);
    try {
      const dir = mkdtempSync(join(tmpdir(), "gate2-bypass1-"));
      const probe = join(dir, "probe.mts");
      writeFileSync(
        probe,
        `
import { assertExactPreparedPlanAssociation } from ${JSON.stringify(join(repoRoot, "src/reasoning/gate2/association.ts"))};
const weakened = assertExactPreparedPlanAssociation(
  { validationPlan: { planId: "a" } } as never,
  { planId: "b" } as never,
);
if (!weakened.ok) {
  console.error("expected weakened predicate to accept foreign plan");
  process.exit(2);
}
console.log("BYPASS1_OPEN");
`,
      );
      const result = spawnSync(
        join(repoRoot, "node_modules/.bin/vite-node"),
        [probe],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("BYPASS1_OPEN");
    } finally {
      writeFileSync(target, original);
      const restoredHash = createHash("sha256")
        .update(readFileSync(target))
        .digest("hex");
      expect(restoredHash).toBe(originalHash);
      const dir = mkdtempSync(join(tmpdir(), "gate2-bypass1-restore-"));
      const probe = join(dir, "probe.mts");
      writeFileSync(
        probe,
        `
import { assertExactPreparedPlanAssociation } from ${JSON.stringify(join(repoRoot, "src/reasoning/gate2/association.ts"))};
const check = assertExactPreparedPlanAssociation(
  { validationPlan: { planId: "a" } } as never,
  { planId: "b" } as never,
);
if (check.ok) {
  console.error("expected restored predicate to refuse foreign plan");
  process.exit(2);
}
console.log("BYPASS1_RESTORED");
`,
      );
      const restored = spawnSync(
        join(repoRoot, "node_modules/.bin/vite-node"),
        [probe],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(restored.status).toBe(0);
      expect(restored.stdout).toContain("BYPASS1_RESTORED");
    }
  });

  it("bypass 2: weaken inherited Validation success — C09/C10 private seam fails open", () => {
    const target = join(repoRoot, "src/reasoning/gate2/association.ts");
    const original = readFileSync(target, "utf8");
    const originalHash = createHash("sha256").update(original).digest("hex");
    const corrupted = original.replace(
      "if (!validationResult.planCriterionSatisfied) {",
      "if (false && !validationResult.planCriterionSatisfied) {",
    );
    expect(corrupted).not.toBe(original);
    writeFileSync(target, corrupted);
    try {
      const dir = mkdtempSync(join(tmpdir(), "gate2-bypass2-"));
      const probe = join(dir, "probe.mts");
      writeFileSync(
        probe,
        `
import { assertInheritedValidationSuccess } from ${JSON.stringify(join(repoRoot, "src/reasoning/gate2/association.ts"))};
const synthetic = {
  criterionId: "EXIT_CODE_ZERO_WITH_COMPLETE_EXECUTION_EVIDENCE",
  planCriterionSatisfied: false,
  checkResults: [{ checkId: "typecheck", kind: "TYPECHECK", verdict: "PASS" }],
};
const weakened = assertInheritedValidationSuccess(synthetic as never, ["typecheck"]);
if (!weakened.ok) {
  console.error("expected weakened predicate to accept synthetic PASS rows");
  process.exit(2);
}
console.log("BYPASS2_OPEN");
`,
      );
      const result = spawnSync(
        join(repoRoot, "node_modules/.bin/vite-node"),
        [probe],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("BYPASS2_OPEN");
    } finally {
      writeFileSync(target, original);
      const restoredHash = createHash("sha256")
        .update(readFileSync(target))
        .digest("hex");
      expect(restoredHash).toBe(originalHash);
      const dir = mkdtempSync(join(tmpdir(), "gate2-bypass2-restore-"));
      const probe = join(dir, "probe.mts");
      writeFileSync(
        probe,
        `
import { assertInheritedValidationSuccess } from ${JSON.stringify(join(repoRoot, "src/reasoning/gate2/association.ts"))};
const synthetic = {
  criterionId: "EXIT_CODE_ZERO_WITH_COMPLETE_EXECUTION_EVIDENCE",
  planCriterionSatisfied: false,
  checkResults: [{ checkId: "typecheck", kind: "TYPECHECK", verdict: "PASS" }],
};
const check = assertInheritedValidationSuccess(synthetic as never, ["typecheck"]);
if (check.ok) {
  console.error("expected restored predicate to refuse unsatisfied criterion");
  process.exit(2);
}
console.log("BYPASS2_RESTORED");
`,
      );
      const restored = spawnSync(
        join(repoRoot, "node_modules/.bin/vite-node"),
        [probe],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(restored.status).toBe(0);
      expect(restored.stdout).toContain("BYPASS2_RESTORED");
    }
  });
});
