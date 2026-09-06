import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  checkEngineeringRunApplicability,
  executeEngineeringRun,
  summarizeEngineeringRun,
} from "../../src/engineering-run/index.js";
import {
  lookupEngineeringRun,
  resetEngineeringRunRegistryForTests,
} from "../../src/engineering-run/internal/registry.js";
import { explicitLocalProcessApproval } from "../../src/execution/index.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import { lookupRunEvidence } from "../../src/run-evidence/internal/registry.js";
import { resetRunEvidenceRegistryForTests } from "../../src/run-evidence/internal/registry.js";
import {
  authorizeValidationPlan,
  prepareValidationPlan,
} from "../../src/validation/index.js";
import { resetValidationRegistryForTests } from "../../src/validation/internal/registry.js";
import type {
  PreparedValidationPlan,
  ValidationAuthorization,
  ValidationCheckSpec,
} from "../../src/validation/types.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import {
  createCanonicalTempRoot,
  snapshotAt,
  writeRelative,
} from "../snapshot/helpers.js";

afterEach(async () => {
  resetEngineeringRunRegistryForTests();
  resetRunEvidenceRegistryForTests();
  resetValidationRegistryForTests();
  resetLocalProcessRegistryForTests();
  await cleanupInventoryFixtures();
});

function nodeRequest(root: string, scriptPath: string) {
  return {
    executable: process.execPath,
    argv: [scriptPath],
    cwd: root,
  };
}

async function writeScript(
  root: string,
  name: string,
  source: string,
): Promise<string> {
  const path = join(root, name);
  await writeFile(path, source, "utf8");
  return path;
}

async function subjectFixture(root: string, paths: readonly string[]) {
  for (const relative of paths) {
    await writeRelative(root, relative, `${relative}-content\n`);
  }
  const fixture = await snapshotAt(root, { extraContentPaths: paths });
  const declaredObservations = fixture.contentObservations.filter((observation) =>
    paths.includes(observation.entry.relativePath),
  );
  expect(declaredObservations.length).toBe(paths.length);
  return { ...fixture, declaredObservations };
}

function approvalsFor(
  checks: readonly { id: string }[],
): Map<string, ReturnType<typeof explicitLocalProcessApproval>> {
  const map = new Map<string, ReturnType<typeof explicitLocalProcessApproval>>();
  for (const check of checks) {
    map.set(check.id, explicitLocalProcessApproval());
  }
  return map;
}

async function prepareAuthorized(
  root: string,
  paths: readonly string[],
  checks: ValidationCheckSpec[],
): Promise<{
  subject: Awaited<ReturnType<typeof subjectFixture>>;
  plan: PreparedValidationPlan;
  authorization: ValidationAuthorization;
}> {
  const subject = await subjectFixture(root, paths);
  const prepared = await prepareValidationPlan(
    checks,
    {
      snapshot: subject.snapshot,
      declaredObservations: subject.declaredObservations,
    },
    subject.workspace,
    subject.config,
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error("prepare failed");
  }
  const auth = await authorizeValidationPlan(
    prepared.value,
    approvalsFor(checks),
  );
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error("authorize failed");
  }
  return {
    subject,
    plan: prepared.value,
    authorization: auth.value,
  };
}

describe("engineering run composition", () => {
  it("composes authentic successful Validation into an EngineeringRunRecord", async () => {
    const root = await createCanonicalTempRoot("pc-4d-ok-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { plan, authorization } = await prepareAuthorized(
      root,
      ["src/a.ts"],
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, ok) }],
    );
    const run = await executeEngineeringRun(plan, authorization);
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    expect(run.value.planId).toBe(plan.planId);
    expect(run.value.planCriterionSatisfied).toBe(true);
    expect(run.value.aggregateOutcome).toBe("PROVEN");
    expect(run.value.validationResult.planCriterionSatisfied).toBe(true);
    expect(run.value.runEvidence.validationResultId).toBe(
      run.value.validationResultId,
    );
    expect(run.value.runEvidenceId).toBe(run.value.runEvidence.evidenceId);
    expect(lookupRunEvidence(run.value.runEvidence)).toBeDefined();
    expect(lookupEngineeringRun(run.value)?.validationResult).toBe(
      run.value.validationResult,
    );
    expect(run.value.scopeId).toBe("DECLARED_OBSERVED_INPUTS");
    expect(run.value.criterionId).toBe(
      "EXIT_CODE_ZERO_WITH_COMPLETE_EXECUTION_EVIDENCE",
    );
  });

  it("preserves authentic Validation failure and NOT_ATTEMPTED without upgrading", async () => {
    const root = await createCanonicalTempRoot("pc-4d-fail-");
    const fail = await writeScript(root, "fail.mjs", "process.exit(2);\n");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { plan, authorization } = await prepareAuthorized(
      root,
      ["src/a.ts"],
      [
        { id: "a", kind: "TYPECHECK", request: nodeRequest(root, fail) },
        { id: "b", kind: "TARGETED_TEST", request: nodeRequest(root, ok) },
      ],
    );
    const run = await executeEngineeringRun(plan, authorization);
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    expect(run.value.planCriterionSatisfied).toBe(false);
    expect(run.value.aggregateOutcome).toBe("FAILED");
    expect(run.value.validationResult.checkResults[0]?.verdict).toBe("FAIL");
    expect(run.value.validationResult.checkResults[1]?.verdict).toBe(
      "NOT_ATTEMPTED",
    );
    expect(run.value.counts.fail).toBe(1);
    expect(run.value.counts.notAttempted).toBe(1);
    expect(run.value.runEvidence.checkRows[0]?.verdict).toBe("FAIL");
    expect(run.value.runEvidence.checkRows[1]?.verdict).toBe("NOT_ATTEMPTED");
  });

  it("refuses foreign plan / consumed authorization and does not invent authority", async () => {
    const rootA = await createCanonicalTempRoot("pc-4d-auth-a-");
    const rootB = await createCanonicalTempRoot("pc-4d-auth-b-");
    const okA = await writeScript(rootA, "ok.mjs", "process.exit(0);\n");
    const okB = await writeScript(rootB, "ok.mjs", "process.exit(0);\n");
    const a = await prepareAuthorized(rootA, ["src/a.ts"], [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(rootA, okA) },
    ]);
    const b = await prepareAuthorized(rootB, ["src/b.ts"], [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(rootB, okB) },
    ]);

    const foreign = await executeEngineeringRun(a.plan, b.authorization);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      expect(foreign.error.code).toBe("PLAN_IDENTITY_MISMATCH");
    }

    const first = await executeEngineeringRun(a.plan, a.authorization);
    expect(first.ok).toBe(true);
    const replay = await executeEngineeringRun(a.plan, a.authorization);
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.error.code).toBe("VALIDATION_EXECUTION_FAILED");
      expect(replay.error.causeCode).toBe("AUTHORIZATION_ALREADY_CONSUMED");
    }
  });

  it("rejects clones/JSON as authentic and keeps Validation result immutable", async () => {
    const root = await createCanonicalTempRoot("pc-4d-clone-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { plan, authorization } = await prepareAuthorized(
      root,
      ["src/a.ts"],
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, ok) }],
    );
    const run = await executeEngineeringRun(plan, authorization);
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    const cloned = { ...run.value } as typeof run.value;
    expect(lookupEngineeringRun(cloned)).toBeUndefined();
    expect(summarizeEngineeringRun(cloned)).toBeNull();
    const fresh = await checkEngineeringRunApplicability(
      cloned,
      plan,
      plan.workspace,
    );
    expect(fresh.ok).toBe(false);

    const json = JSON.parse(JSON.stringify(summarizeEngineeringRun(run.value)));
    expect(json.notAuthority).toBe(true);
    expect(lookupEngineeringRun(json as never)).toBeUndefined();

    const originalOutcome = run.value.validationResult.aggregateOutcome;
    expect(() => {
      (
        run.value.validationResult as unknown as { aggregateOutcome: string }
      ).aggregateOutcome = "FAILED";
    }).toThrow();
    expect(run.value.validationResult.aggregateOutcome).toBe(originalOutcome);
    expect(run.value.runEvidence).toBe(
      lookupEngineeringRun(run.value)?.runEvidence,
    );
  });

  it("delegates applicability; mutation rejects currentness without rewriting history", async () => {
    const root = await createCanonicalTempRoot("pc-4d-app-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { subject, plan, authorization } = await prepareAuthorized(
      root,
      ["src/a.ts"],
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, ok) }],
    );
    const run = await executeEngineeringRun(plan, authorization);
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    const before = await checkEngineeringRunApplicability(
      run.value,
      plan,
      subject.workspace,
    );
    expect(before.ok).toBe(true);
    if (before.ok) {
      expect(before.value.applicable).toBe(true);
    }

    await writeRelative(root, "src/a.ts", "mutated-content\n");
    const after = await checkEngineeringRunApplicability(
      run.value,
      plan,
      subject.workspace,
    );
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.value.applicable).toBe(false);
    }
    expect(run.value.planCriterionSatisfied).toBe(true);
    expect(run.value.aggregateOutcome).toBe("PROVEN");
  });

  it("does not upgrade a historical failed run when inputs remain current", async () => {
    const root = await createCanonicalTempRoot("pc-4d-no-upgrade-");
    const fail = await writeScript(root, "fail.mjs", "process.exit(1);\n");
    const { subject, plan, authorization } = await prepareAuthorized(
      root,
      ["src/a.ts"],
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, fail) }],
    );
    const run = await executeEngineeringRun(plan, authorization);
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    expect(run.value.planCriterionSatisfied).toBe(false);
    expect(run.value.aggregateOutcome).toBe("FAILED");
    const applicability = await checkEngineeringRunApplicability(
      run.value,
      plan,
      subject.workspace,
    );
    // Validation itself marks criterion-unsatisfied results non-applicable.
    // Applicability must never mutate or upgrade the historical failure.
    expect(applicability.ok).toBe(true);
    if (applicability.ok) {
      expect(applicability.value.applicable).toBe(false);
      expect(applicability.value.code).toBe("RESULT_NOT_APPLICABLE");
    }
    expect(run.value.planCriterionSatisfied).toBe(false);
    expect(run.value.aggregateOutcome).toBe("FAILED");
    expect(run.value.validationResult.aggregateOutcome).toBe("FAILED");
  });

  it("summary uses allowlisted fields and omits env/argv/output", async () => {
    const root = await createCanonicalTempRoot("pc-4d-sum-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { plan, authorization } = await prepareAuthorized(
      root,
      ["src/a.ts"],
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, ok) }],
    );
    const run = await executeEngineeringRun(plan, authorization);
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    const summary = summarizeEngineeringRun(run.value);
    expect(summary).not.toBeNull();
    if (summary === null) {
      return;
    }
    expect(summary.historicalInformationalOnly).toBe(true);
    expect(summary.notAuthority).toBe(true);
    expect(summary.engineeringRunId).toBe(run.value.engineeringRunId);
    expect(summary.validationResultId).toBe(run.value.validationResultId);
    expect(summary.runEvidenceId).toBe(run.value.runEvidenceId);
    expect(summary.checkCount).toBe(1);
    expect(summary.criterionId).toBe(run.value.criterionId);
    expect(summary.scopeId).toBe(run.value.scopeId);
    const encoded = JSON.stringify(summary);
    expect(encoded).not.toMatch(/"argv"/);
    expect(encoded).not.toMatch(/"stdout"/);
    expect(encoded).not.toMatch(/"stderr"/);
    expect(encoded).not.toMatch(/"env"/);
    expect(encoded).not.toContain(process.execPath);
    expect(encoded).not.toMatch(/PATH=/);
    expect(encoded).not.toMatch(/HOME=/);
    expect("workspaceRoot" in summary).toBe(false);
    expect("validationResult" in summary).toBe(false);
    expect("runEvidence" in summary).toBe(false);
    expect("authorization" in summary).toBe(false);
  });

  it("end-to-end: Phase 2 subject → Validation → Run Evidence → Engineering Run → stale", async () => {
    const root = await createCanonicalTempRoot("pc-4d-e2e-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { subject, plan, authorization } = await prepareAuthorized(
      root,
      ["src/a.ts", "src/b.ts"],
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(root, ok) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(root, ok) },
      ],
    );
    const composed = await executeEngineeringRun(plan, authorization);
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }
    expect(composed.value.counts.pass).toBe(2);
    expect(composed.value.planCriterionSatisfied).toBe(true);
    expect(composed.value.validationResultId).toBe(
      composed.value.validationResult.resultId,
    );
    expect(composed.value.runEvidenceId).toBe(
      composed.value.runEvidence.evidenceId,
    );
    const summary = summarizeEngineeringRun(composed.value);
    expect(summary?.checkCount).toBe(2);
    expect(summary?.aggregateOutcome).toBe("PROVEN");
    expect(summary?.historicalInformationalOnly).toBe(true);

    const current = await checkEngineeringRunApplicability(
      composed.value,
      plan,
      subject.workspace,
    );
    expect(current.ok).toBe(true);
    if (current.ok) {
      expect(current.value.applicable).toBe(true);
    }

    await writeRelative(root, "src/b.ts", "changed\n");
    const stale = await checkEngineeringRunApplicability(
      composed.value,
      plan,
      subject.workspace,
    );
    expect(stale.ok).toBe(true);
    if (stale.ok) {
      expect(stale.value.applicable).toBe(false);
    }
    expect(composed.value.aggregateOutcome).toBe("PROVEN");
    expect(composed.value.planCriterionSatisfied).toBe(true);
  }, 20_000);
});
