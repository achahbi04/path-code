import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { explicitLocalProcessApproval } from "../../src/execution/index.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import {
  buildRunEvidence,
  checkRunEvidenceApplicability,
  summarizeRunEvidence,
} from "../../src/run-evidence/index.js";
import { lookupRunEvidence, resetRunEvidenceRegistryForTests } from "../../src/run-evidence/internal/registry.js";
import {
  authorizeValidationPlan,
  executeValidationPlan,
  prepareValidationPlan,
} from "../../src/validation/index.js";
import { resetValidationRegistryForTests } from "../../src/validation/internal/registry.js";
import type { ValidationCheckSpec } from "../../src/validation/types.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import {
  createCanonicalTempRoot,
  snapshotAt,
  writeRelative,
} from "../snapshot/helpers.js";

afterEach(async () => {
  resetRunEvidenceRegistryForTests();
  resetValidationRegistryForTests();
  resetLocalProcessRegistryForTests();
  await cleanupInventoryFixtures();
});

function nodeRequest(root: string, scriptPath: string, extraArgs: string[] = []) {
  return {
    executable: process.execPath,
    argv: [scriptPath, ...extraArgs],
    cwd: root,
  };
}

async function writeScript(root: string, name: string, source: string): Promise<string> {
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

async function runPlan(
  root: string,
  paths: readonly string[],
  checks: ValidationCheckSpec[],
) {
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
  const auth = await authorizeValidationPlan(prepared.value, approvalsFor(checks));
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error("authorize failed");
  }
  const result = await executeValidationPlan(prepared.value, auth.value);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("execute failed");
  }
  return { subject, plan: prepared.value, result: result.value };
}

describe("run evidence", () => {
  it("builds immutable evidence from an authentic successful Validation run", async () => {
    const root = await createCanonicalTempRoot("pc-4c-ok-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { subject, plan, result } = await runPlan(
      root,
      ["src/a.ts"],
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, ok) }],
    );
    const evidence = buildRunEvidence(result, plan, subject.workspace);
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    expect(evidence.value.planId).toBe(plan.planId);
    expect(evidence.value.validationResultId).toBe(result.resultId);
    expect(evidence.value.aggregateOutcome).toBe(result.aggregateOutcome);
    expect(evidence.value.planCriterionSatisfied).toBe(true);
    expect(evidence.value.checkRows[0]?.verdict).toBe("PASS");
    expect(evidence.value.scopeId).toBe("DECLARED_OBSERVED_INPUTS");
    expect(evidence.value.counts.pass).toBe(1);
    expect(evidence.value.counts.plannedChecks).toBe(1);
    expect(() => {
      (evidence.value.checkRows as { verdict: string }[])[0]!.verdict = "FAIL";
    }).toThrow();
    expect(evidence.value.checkRows[0]?.verdict).toBe("PASS");
  });

  it("preserves failed and NOT_ATTEMPTED rows without fabricating process facts", async () => {
    const root = await createCanonicalTempRoot("pc-4c-fail-");
    const fail = await writeScript(root, "fail.mjs", "process.exit(2);\n");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { subject, plan, result } = await runPlan(
      root,
      ["src/a.ts"],
      [
        { id: "a", kind: "TYPECHECK", request: nodeRequest(root, fail) },
        { id: "b", kind: "TARGETED_TEST", request: nodeRequest(root, ok) },
      ],
    );
    const evidence = buildRunEvidence(result, plan, subject.workspace);
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    expect(evidence.value.checkRows[0]?.verdict).toBe("FAIL");
    expect(evidence.value.checkRows[0]?.process.present).toBe(true);
    expect(evidence.value.checkRows[0]?.process.exitCode).toBe(2);
    expect(evidence.value.checkRows[1]?.verdict).toBe("NOT_ATTEMPTED");
    expect(evidence.value.checkRows[1]?.process.present).toBe(false);
    expect(evidence.value.checkRows[1]?.process.exitCode).toBeNull();
    expect(evidence.value.checkRows[1]?.process.resultId).toBeNull();
    expect(evidence.value.counts.fail).toBe(1);
    expect(evidence.value.counts.notAttempted).toBe(1);
    expect(evidence.value.counts.checksWithProcessResult).toBe(1);
    expect(evidence.value.planCriterionSatisfied).toBe(false);
  });

  it("rejects cloned results, wrong plans, and wrong workspaces", async () => {
    const rootA = await createCanonicalTempRoot("pc-4c-auth-a-");
    const rootB = await createCanonicalTempRoot("pc-4c-auth-b-");
    const okA = await writeScript(rootA, "ok.mjs", "process.exit(0);\n");
    const okB = await writeScript(rootB, "ok.mjs", "process.exit(0);\n");
    const runA = await runPlan(rootA, ["src/a.ts"], [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(rootA, okA) },
    ]);
    const runB = await runPlan(rootB, ["src/b.ts"], [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(rootB, okB) },
    ]);
    const cloned = { ...runA.result } as typeof runA.result;
    expect(buildRunEvidence(cloned, runA.plan, runA.subject.workspace).ok).toBe(
      false,
    );
    expect(buildRunEvidence(runA.result, runB.plan, runA.subject.workspace).ok).toBe(
      false,
    );
    expect(buildRunEvidence(runA.result, runA.plan, runB.subject.workspace).ok).toBe(
      false,
    );
    const evidence = buildRunEvidence(
      runA.result,
      runA.plan,
      runA.subject.workspace,
    );
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    const clonedEvidence = { ...evidence.value } as typeof evidence.value;
    expect(lookupRunEvidence(clonedEvidence)).toBeUndefined();
    const fresh = await checkRunEvidenceApplicability(
      clonedEvidence,
      runA.plan,
      runA.subject.workspace,
    );
    expect(fresh.ok).toBe(false);
  });

  it("derives per-check counts without labeling them as tests or coverage", async () => {
    const root = await createCanonicalTempRoot("pc-4c-counts-");
    const fail = await writeScript(root, "fail.mjs", "process.exit(1);\n");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { subject, plan, result } = await runPlan(
      root,
      ["src/a.ts"],
      [
        { id: "a", kind: "TYPECHECK", request: nodeRequest(root, fail) },
        { id: "b", kind: "LINT", request: nodeRequest(root, ok) },
      ],
    );
    const evidence = buildRunEvidence(result, plan, subject.workspace);
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    expect(evidence.value.counts).toEqual({
      plannedChecks: 2,
      checksWithProcessResult: 1,
      pass: 0,
      fail: 1,
      executionInconclusive: 0,
      refused: 0,
      notAttempted: 1,
    });
    expect(
      Object.prototype.hasOwnProperty.call(evidence.value.counts, "testCount"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(evidence.value.counts, "coverage"),
    ).toBe(false);
  });

  it("fresh applicability fails after subject change while original evidence stays unchanged", async () => {
    const root = await createCanonicalTempRoot("pc-4c-stale-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { subject, plan, result } = await runPlan(
      root,
      ["src/main.ts"],
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, ok) }],
    );
    const evidence = buildRunEvidence(result, plan, subject.workspace);
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    const before = structuredClone({
      aggregateOutcome: evidence.value.aggregateOutcome,
      planCriterionSatisfied: evidence.value.planCriterionSatisfied,
      originalApplicabilityValid: evidence.value.originalApplicabilityValid,
      checkRows: evidence.value.checkRows.map((row) => row.verdict),
    });
    const current = await checkRunEvidenceApplicability(
      evidence.value,
      plan,
      subject.workspace,
    );
    expect(current.ok).toBe(true);
    if (!current.ok) {
      return;
    }
    expect(current.value.applicable).toBe(true);

    await writeRelative(root, "src/main.ts", "src/main.ts-content\nCHANGED\n");
    const stale = await checkRunEvidenceApplicability(
      evidence.value,
      plan,
      subject.workspace,
    );
    expect(stale.ok).toBe(true);
    if (!stale.ok) {
      return;
    }
    expect(stale.value.applicable).toBe(false);
    expect(evidence.value.aggregateOutcome).toBe(before.aggregateOutcome);
    expect(evidence.value.planCriterionSatisfied).toBe(before.planCriterionSatisfied);
    expect(evidence.value.originalApplicabilityValid).toBe(
      before.originalApplicabilityValid,
    );
    expect(evidence.value.checkRows.map((row) => row.verdict)).toEqual(
      before.checkRows,
    );
  });

  it("does not reuse originalApplicabilityValid instead of a fresh check; cannot upgrade failed history", async () => {
    const root = await createCanonicalTempRoot("pc-4c-no-upgrade-");
    const fail = await writeScript(root, "fail.mjs", "process.exit(3);\n");
    const { subject, plan, result } = await runPlan(
      root,
      ["src/a.ts"],
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, fail) }],
    );
    expect(result.planCriterionSatisfied).toBe(false);
    const evidence = buildRunEvidence(result, plan, subject.workspace);
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    expect(evidence.value.checkRows[0]?.verdict).toBe("FAIL");
    const observation = await checkRunEvidenceApplicability(
      evidence.value,
      plan,
      subject.workspace,
    );
    expect(observation.ok).toBe(true);
    if (!observation.ok) {
      return;
    }
    expect(observation.value.applicable).toBe(false);
    expect(evidence.value.checkRows[0]?.verdict).toBe("FAIL");
    expect(evidence.value.planCriterionSatisfied).toBe(false);
  });

  it("mutable caller views cannot change registered association", async () => {
    const root = await createCanonicalTempRoot("pc-4c-immut-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { subject, plan, result } = await runPlan(
      root,
      ["src/a.ts"],
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, ok) }],
    );
    const evidence = buildRunEvidence(result, plan, subject.workspace);
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    const association = lookupRunEvidence(evidence.value);
    expect(association?.result).toBe(result);
    expect(association?.plan).toBe(plan);
    const paths = evidence.value.declaredObservationPaths as string[];
    expect(() => {
      paths.push("hacked.ts");
    }).toThrow();
    const summary = summarizeRunEvidence(evidence.value);
    expect(summary).not.toBeNull();
    expect(() => {
      (summary!.declaredObservationPaths as string[]).push("x");
    }).toThrow();
    expect(evidence.value.declaredObservationPaths).toEqual(["src/a.ts"]);
    expect(lookupRunEvidence(evidence.value)?.result).toBe(result);
  });

  it("summary omits seeded secrets and JSON reconstruction is not registered", async () => {
    const root = await createCanonicalTempRoot("pc-4c-sum-");
    const secret = "SUPER_SECRET_ENV_VALUE_9f3a";
    const script = await writeScript(
      root,
      "env.mjs",
      `process.stdout.write(process.env.PC_SECRET ?? "");
process.stderr.write("ARGV_SECRET_MARKER");
process.exit(0);
`,
    );
    const checks: ValidationCheckSpec[] = [
      {
        id: "t",
        kind: "TYPECHECK",
        request: {
          executable: process.execPath,
          argv: [script, "ARGV_SECRET_MARKER"],
          cwd: root,
          env: { PC_SECRET: secret },
        },
      },
    ];
    const { subject, plan, result } = await runPlan(root, ["src/a.ts"], checks);
    const evidence = buildRunEvidence(result, plan, subject.workspace);
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    const summary = summarizeRunEvidence(evidence.value);
    expect(summary).not.toBeNull();
    const encoded = JSON.stringify(summary);
    expect(encoded).not.toContain(secret);
    expect(encoded).not.toContain("ARGV_SECRET_MARKER");
    expect(encoded).not.toContain(process.execPath);
    expect(summary!.historicalInformationalOnly).toBe(true);
    expect(summary!.notAuthority).toBe(true);
    const revived = JSON.parse(encoded) as typeof evidence.value;
    expect(lookupRunEvidence(revived)).toBeUndefined();
    expect(summarizeRunEvidence(revived)).toBeNull();
  });

  it("assembly does not approve or execute; applicability delegates to Validation", async () => {
    const root = await createCanonicalTempRoot("pc-4c-delegate-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { subject, plan, result } = await runPlan(
      root,
      ["src/a.ts"],
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, ok) }],
    );
    const beforeAuth = result.checkResults[0]?.processResult?.authorizationId;
    const evidence = buildRunEvidence(result, plan, subject.workspace);
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    expect(result.checkResults[0]?.processResult?.authorizationId).toBe(beforeAuth);
    const applicable = await checkRunEvidenceApplicability(
      evidence.value,
      plan,
      subject.workspace,
    );
    expect(applicable.ok).toBe(true);
    if (!applicable.ok) {
      return;
    }
    expect(applicable.value.applicable).toBe(true);
    await writeRelative(root, "src/a.ts", "changed-for-delegate\n");
    const stale = await checkRunEvidenceApplicability(
      evidence.value,
      plan,
      subject.workspace,
    );
    expect(stale.ok).toBe(true);
    if (!stale.ok) {
      return;
    }
    expect(stale.value.applicable).toBe(false);
    expect(stale.value.code).not.toBeNull();
  });

  it("end-to-end: two-check Validation evidence, summarize, then reject reuse after mutation", async () => {
    const root = await createCanonicalTempRoot("pc-4c-e2e-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const { subject, plan, result } = await runPlan(
      root,
      ["src/main.ts", "tests/main.test.ts"],
      [
        { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(root, ok) },
        { id: "test", kind: "TARGETED_TEST", request: nodeRequest(root, ok) },
      ],
    );
    expect(result.checkResults).toHaveLength(2);
    const evidence = buildRunEvidence(result, plan, subject.workspace);
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    const summary = summarizeRunEvidence(evidence.value);
    expect(summary?.counts.pass).toBe(2);
    expect(summary?.scopeId).toBe("DECLARED_OBSERVED_INPUTS");
    await writeRelative(root, "src/main.ts", "changed\n");
    const stale = await checkRunEvidenceApplicability(
      evidence.value,
      plan,
      subject.workspace,
    );
    expect(stale.ok).toBe(true);
    if (!stale.ok) {
      return;
    }
    expect(stale.value.applicable).toBe(false);
    expect(evidence.value.planCriterionSatisfied).toBe(true);
  });

  it("cannot ingest an older process result as a new check; scope limits remain", async () => {
    const root = await createCanonicalTempRoot("pc-4c-ingest-");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const first = await runPlan(root, ["src/a.ts"], [
      { id: "old", kind: "TYPECHECK", request: nodeRequest(root, ok) },
    ]);
    const second = await runPlan(root, ["src/a.ts"], [
      { id: "new", kind: "LINT", request: nodeRequest(root, ok) },
    ]);
    const oldProcess = first.result.checkResults[0]?.processResult;
    expect(oldProcess).not.toBeNull();
    const forged = {
      ...second.result,
      checkResults: [
        {
          ...second.result.checkResults[0]!,
          processResult: oldProcess,
        },
      ],
    } as typeof second.result;
    expect(
      buildRunEvidence(forged, second.plan, second.subject.workspace).ok,
    ).toBe(false);
    const evidence = buildRunEvidence(
      second.result,
      second.plan,
      second.subject.workspace,
    );
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) {
      return;
    }
    expect(evidence.value.limitations.length).toBeGreaterThan(0);
    expect(evidence.value.scopeId).toBe("DECLARED_OBSERVED_INPUTS");
    const association = lookupRunEvidence(evidence.value);
    expect(association?.processResults.get("new")).toBe(
      second.result.checkResults[0]?.processResult,
    );
    expect(association?.processResults.get("new")).not.toBe(oldProcess);
  });
});
