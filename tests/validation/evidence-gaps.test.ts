/**
 * Focused Phase 4B acceptance gaps closed during Phase 4C evidence-map work.
 * These tests did not exist at 106b3a9; they prove already-implemented Validation behavior.
 */

import { utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { explicitLocalProcessApproval } from "../../src/execution/index.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import type { LocalProcessResult } from "../../src/execution/types.js";
import {
  authorizeValidationPlan,
  checkValidationResultApplicability,
  classifyLocalProcessForValidation,
  executeValidationPlan,
  MAX_VALIDATION_PLAN_TIMEOUT_SUM_MS,
  prepareValidationPlan,
  resolveRegisteredValidationBinding,
} from "../../src/validation/index.js";
import {
  lookupValidationResult,
  resetValidationRegistryForTests,
} from "../../src/validation/internal/registry.js";
import type { ValidationCheckSpec } from "../../src/validation/types.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
import {
  createCanonicalTempRoot,
  snapshotAt,
  writeRelative,
} from "../snapshot/helpers.js";

afterEach(async () => {
  resetValidationRegistryForTests();
  resetLocalProcessRegistryForTests();
  await cleanupInventoryFixtures();
});

function nodeRequest(
  root: string,
  scriptPath: string,
  extraArgs: string[] = [],
  options?: {
    timeoutMs?: number;
    maxStdoutBytes?: number;
    env?: Record<string, string>;
  },
) {
  const request: {
    executable: string;
    argv: string[];
    cwd: string;
    timeoutMs?: number;
    maxStdoutBytes?: number;
    maxStderrBytes?: number;
    env?: Readonly<Record<string, string>>;
  } = {
    executable: process.execPath,
    argv: [scriptPath, ...extraArgs],
    cwd: root,
  };
  if (options?.timeoutMs !== undefined) {
    request.timeoutMs = options.timeoutMs;
  }
  if (options?.maxStdoutBytes !== undefined) {
    request.maxStdoutBytes = options.maxStdoutBytes;
  }
  if (options?.env !== undefined) {
    request.env = options.env;
  }
  return request;
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

function synthetic(overrides: Partial<LocalProcessResult>): LocalProcessResult {
  const stream = {
    capturedBytes: 0,
    truncated: false,
    discardedAfterLimitBytes: 0,
    complete: true,
    streamError: null,
    text: "",
  };
  const base = {
    resultId: "r1",
    outcome: "EXITED" as const,
    preparedId: "p",
    authorizationId: "a",
    workspaceRoot: "/tmp",
    executable: "/bin/true",
    executableIdentity: null,
    argv: [] as string[],
    cwd: "/tmp",
    envPolicyId: "e",
    startedAtMs: 1,
    finishedAtMs: 2,
    durationMs: 1,
    pid: 1,
    exitCode: 0,
    signal: null,
    timedOut: false,
    overflow: false,
    terminationRequested: false,
    terminationObserved: true,
    stdout: { ...stream },
    stderr: { ...stream },
    spawnError: null,
    cleanup: {
      terminationRequested: false,
      terminationObserved: true,
      terminationNotConfirmed: false,
      descendantMayRemainAlive: false,
      signalsAttempted: [] as string[],
    },
  };
  return { ...base, ...overrides } as LocalProcessResult;
}

describe("validation evidence-map gap coverage", () => {
  it("caller mutations of checks/env/subject arrays cannot alter prepared plan", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-mut-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const env: Record<string, string> = { PC_SECRET: "keep" };
    const checks: ValidationCheckSpec[] = [
      {
        id: "first",
        kind: "TYPECHECK",
        request: nodeRequest(root, script, ["a"], { env }),
      },
      {
        id: "second",
        kind: "LINT",
        request: nodeRequest(root, script, ["b"]),
      },
    ];
    const observations = [...subject.declaredObservations];
    const prepared = await prepareValidationPlan(
      checks,
      {
        snapshot: subject.snapshot,
        declaredObservations: observations,
      },
      subject.workspace,
      subject.config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    checks.reverse();
    env.PC_SECRET = "mutated";
    observations.splice(0, observations.length);
    expect(prepared.value.checks.map((item) => item.id)).toEqual([
      "first",
      "second",
    ]);
    expect(prepared.value.checks[0]?.preparedProcess.argv).toEqual([script, "a"]);
    expect(prepared.value.declaredObservations.length).toBe(1);
  });

  it("rejects timeout sum exceeding plan ceiling before execution", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-to-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const half = Math.floor(MAX_VALIDATION_PLAN_TIMEOUT_SUM_MS / 2) + 1;
    const prepared = await prepareValidationPlan(
      [
        {
          id: "a",
          kind: "TYPECHECK",
          request: nodeRequest(root, script, [], { timeoutMs: half }),
        },
        {
          id: "b",
          kind: "LINT",
          request: nodeRequest(root, script, [], { timeoutMs: half }),
        },
      ],
      {
        snapshot: subject.snapshot,
        declaredObservations: subject.declaredObservations,
      },
      subject.workspace,
      subject.config,
    );
    expect(prepared.ok).toBe(false);
    if (prepared.ok) {
      return;
    }
    expect(prepared.error.code).toBe("TIMEOUT_SUM_EXCEEDED");
  });

  it("refuses foreign workspace and fabricated observations", async () => {
    const rootA = await createCanonicalTempRoot("pc-4b-gap-wa-");
    const rootB = await createCanonicalTempRoot("pc-4b-gap-wb-");
    const subjectA = await subjectFixture(rootA, ["src/a.ts"]);
    const subjectB = await subjectFixture(rootB, ["src/b.ts"]);
    const script = await writeScript(rootA, "ok.mjs", "process.exit(0);\n");
    const foreign = await prepareValidationPlan(
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(rootA, script) }],
      {
        snapshot: subjectA.snapshot,
        declaredObservations: subjectA.declaredObservations,
      },
      subjectB.workspace,
      subjectA.config,
    );
    expect(foreign.ok).toBe(false);

    const fabricated = await prepareValidationPlan(
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(rootA, script) }],
      {
        snapshot: subjectA.snapshot,
        declaredObservations: subjectB.declaredObservations,
      },
      subjectA.workspace,
      subjectA.config,
    );
    expect(fabricated.ok).toBe(false);
  });

  it("refuses invalid approval objects without spawning", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-appr-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(root, script) },
    ];
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
      return;
    }
    const wrong = await authorizeValidationPlan(
      prepared.value,
      new Map([["t", { kind: "NOT_APPROVAL" } as never]]),
    );
    expect(wrong.ok).toBe(false);
  });

  it("concurrent executeValidationPlan starts at most one run", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-conc-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(root, script) },
    ];
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
      return;
    }
    const auth = await authorizeValidationPlan(prepared.value, approvalsFor(checks));
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const [a, b] = await Promise.all([
      executeValidationPlan(prepared.value, auth.value),
      executeValidationPlan(prepared.value, auth.value),
    ]);
    const oks = [a.ok, b.ok].filter(Boolean).length;
    expect(oks).toBe(1);
  });

  it("honors EXECUTE_PROCESS and LINT disable; disable after authorize refuses spawn", async () => {
    const rootExec = await createCanonicalTempRoot("pc-4b-gap-exdis-");
    await writeFile(
      join(rootExec, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = EXECUTE_PROCESS\n```\n",
      "utf8",
    );
    const subjectExec = await subjectFixture(rootExec, ["src/a.ts"]);
    const scriptExec = await writeScript(rootExec, "ok.mjs", "process.exit(0);\n");
    const preparedExec = await prepareValidationPlan(
      [{ id: "t", kind: "BUILD", request: nodeRequest(rootExec, scriptExec) }],
      {
        snapshot: subjectExec.snapshot,
        declaredObservations: subjectExec.declaredObservations,
      },
      subjectExec.workspace,
      subjectExec.config,
    );
    expect(preparedExec.ok).toBe(false);

    const rootLint = await createCanonicalTempRoot("pc-4b-gap-lint-");
    await writeFile(
      join(rootLint, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = LINT\n```\n",
      "utf8",
    );
    const subjectLint = await subjectFixture(rootLint, ["src/a.ts"]);
    const scriptLint = await writeScript(rootLint, "ok.mjs", "process.exit(0);\n");
    const preparedLint = await prepareValidationPlan(
      [{ id: "t", kind: "LINT", request: nodeRequest(rootLint, scriptLint) }],
      {
        snapshot: subjectLint.snapshot,
        declaredObservations: subjectLint.declaredObservations,
      },
      subjectLint.workspace,
      subjectLint.config,
    );
    expect(preparedLint.ok).toBe(false);

    const rootLater = await createCanonicalTempRoot("pc-4b-gap-postdis-");
    const subjectLater = await subjectFixture(rootLater, ["src/a.ts"]);
    const scriptLater = await writeScript(rootLater, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(rootLater, scriptLater) },
    ];
    const preparedLater = await prepareValidationPlan(
      checks,
      {
        snapshot: subjectLater.snapshot,
        declaredObservations: subjectLater.declaredObservations,
      },
      subjectLater.workspace,
      subjectLater.config,
    );
    expect(preparedLater.ok).toBe(true);
    if (!preparedLater.ok) {
      return;
    }
    const auth = await authorizeValidationPlan(
      preparedLater.value,
      approvalsFor(checks),
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    await writeFile(
      join(rootLater, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = TYPECHECK\n```\n",
      "utf8",
    );
    const executed = await executeValidationPlan(preparedLater.value, auth.value);
    expect(executed.ok).toBe(true);
    if (!executed.ok) {
      return;
    }
    expect(executed.value.checkResults[0]?.verdict).toBe("REFUSED");
    expect(executed.value.checkResults[0]?.refusalCode).toBe("ACTION_DISABLED");
    expect(executed.value.checkResults[0]?.processResult).toBeNull();
  });

  it("same-size same-mtime declared change fails applicability", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-mtime-");
    const relative = "src/a.ts";
    const original = "AAAA\n";
    const replacement = "BBBB\n";
    expect(original.length).toBe(replacement.length);
    await writeRelative(root, relative, original);
    const fixture = await snapshotAt(root, { extraContentPaths: [relative] });
    const declaredObservations = fixture.contentObservations.filter(
      (observation) => observation.entry.relativePath === relative,
    );
    const script = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(root, script) },
    ];
    const prepared = await prepareValidationPlan(
      checks,
      { snapshot: fixture.snapshot, declaredObservations },
      fixture.workspace,
      fixture.config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    const auth = await authorizeValidationPlan(prepared.value, approvalsFor(checks));
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const result = await executeValidationPlan(prepared.value, auth.value);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const entry = declaredObservations[0]!.entry;
    const mtimeSec = Math.floor(entry.mtimeMs! / 1000);
    await writeRelative(root, relative, replacement);
    await utimes(join(root, relative), mtimeSec, mtimeSec);
    const stale = await checkValidationResultApplicability(
      result.value,
      prepared.value,
      fixture.workspace,
    );
    expect(stale.ok).toBe(false);
  });

  it("changed declared configuration bytes invalidate applicability", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-cfg-");
    await writeRelative(root, "src/a.ts", "src/a.ts-content\n");
    await writeFile(
      join(root, "PATHCODE.md"),
      "# Config\n\n```pathcode-config\ndisable-action = GIT_PUSH\n```\n",
      "utf8",
    );
    const fixture = await snapshotAt(root, {
      extraContentPaths: ["PATHCODE.md", "src/a.ts"],
    });
    const declaredObservations = fixture.contentObservations.filter((observation) =>
      ["PATHCODE.md", "src/a.ts"].includes(observation.entry.relativePath),
    );
    expect(declaredObservations.length).toBe(2);
    const script = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(root, script) },
    ];
    const prepared = await prepareValidationPlan(
      checks,
      {
        snapshot: fixture.snapshot,
        declaredObservations,
      },
      fixture.workspace,
      fixture.config,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    const auth = await authorizeValidationPlan(prepared.value, approvalsFor(checks));
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const result = await executeValidationPlan(prepared.value, auth.value);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    await writeFile(
      join(root, "PATHCODE.md"),
      "# Config\n\n```pathcode-config\ndisable-action = GIT_COMMIT\n```\n",
      "utf8",
    );
    const stale = await checkValidationResultApplicability(
      result.value,
      prepared.value,
      fixture.workspace,
    );
    expect(stale.ok).toBe(false);
  });

  it("runs all four kinds preserving order and argv", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-kinds-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(
      root,
      "echo-argv.mjs",
      "process.stdout.write(JSON.stringify(process.argv.slice(2))); process.exit(0);\n",
    );
    const checks: ValidationCheckSpec[] = [
      {
        id: "tc",
        kind: "TYPECHECK",
        request: nodeRequest(root, script, ["typecheck"]),
      },
      { id: "li", kind: "LINT", request: nodeRequest(root, script, ["lint"]) },
      { id: "bu", kind: "BUILD", request: nodeRequest(root, script, ["build"]) },
      {
        id: "tt",
        kind: "TARGETED_TEST",
        request: nodeRequest(root, script, ["test"]),
      },
    ];
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
      return;
    }
    expect(prepared.value.checks.map((item) => item.kind)).toEqual([
      "TYPECHECK",
      "LINT",
      "BUILD",
      "TARGETED_TEST",
    ]);
    const auth = await authorizeValidationPlan(prepared.value, approvalsFor(checks));
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const result = await executeValidationPlan(prepared.value, auth.value);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.checkResults.map((item) => item.verdict)).toEqual([
      "PASS",
      "PASS",
      "PASS",
      "PASS",
    ]);
    expect(result.value.checkResults[0]?.processResult?.argv.slice(-1)).toEqual([
      "typecheck",
    ]);
    expect(result.value.checkResults[3]?.processResult?.argv.slice(-1)).toEqual([
      "test",
    ]);
  });

  it("real nonzero exit with stdout PASS is FAIL", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-stdout-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(
      root,
      "pass-text.mjs",
      'process.stdout.write("PASS\\n"); process.exit(1);\n',
    );
    const checks: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(root, script) },
    ];
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
      return;
    }
    const auth = await authorizeValidationPlan(prepared.value, approvalsFor(checks));
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const result = await executeValidationPlan(prepared.value, auth.value);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.checkResults[0]?.verdict).toBe("FAIL");
    expect(result.value.checkResults[0]?.processResult?.exitCode).toBe(1);
    expect(result.value.checkResults[0]?.processResult?.stdout.text).toContain("PASS");
  });

  it("classifier treats incomplete capture and signaled outcomes as inconclusive", () => {
    expect(
      classifyLocalProcessForValidation(
        synthetic({
          stdout: {
            capturedBytes: 1,
            truncated: false,
            discardedAfterLimitBytes: 0,
            complete: false,
            streamError: null,
            text: "x",
          },
        }),
      ),
    ).toBe("EXECUTION_INCONCLUSIVE");
    expect(
      classifyLocalProcessForValidation(
        synthetic({
          outcome: "SIGNALED",
          exitCode: null,
          signal: "SIGTERM",
          terminationRequested: true,
          terminationObserved: true,
        }),
      ),
    ).toBe("EXECUTION_INCONCLUSIVE");
  });

  it("command mutation of declared input keeps process result but invalidates applicability", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-mutate-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(
      root,
      "mutate.mjs",
      `import { writeFileSync } from "node:fs";
writeFileSync(new URL("./src/a.ts", import.meta.url), "mutated-by-check\\n");
process.exit(0);
`,
    );
    const checks: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(root, script) },
    ];
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
      return;
    }
    const generation = prepared.value.snapshot.generation;
    const auth = await authorizeValidationPlan(prepared.value, approvalsFor(checks));
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const result = await executeValidationPlan(prepared.value, auth.value);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.checkResults[0]?.verdict).toBe("PASS");
    expect(result.value.checkResults[0]?.processResult).not.toBeNull();
    expect(result.value.checkResults[0]?.subjectVerifiedAfter).toBe(false);
    expect(result.value.applicabilityValid).toBe(false);
    expect(result.value.planCriterionSatisfied).toBe(false);
    expect(result.value.aggregateOutcome).not.toBe("PROVEN");
    expect(result.value.snapshotGeneration).toBe(generation);
    const applicable = await checkValidationResultApplicability(
      result.value,
      prepared.value,
      subject.workspace,
    );
    expect(applicable.ok).toBe(false);
  });

  it("refuses cross-plan and cross-workspace applicability reassignment", async () => {
    const rootA = await createCanonicalTempRoot("pc-4b-gap-xa-");
    const rootB = await createCanonicalTempRoot("pc-4b-gap-xb-");
    const subjectA = await subjectFixture(rootA, ["src/a.ts"]);
    const subjectB = await subjectFixture(rootB, ["src/b.ts"]);
    const scriptA = await writeScript(rootA, "ok.mjs", "process.exit(0);\n");
    const scriptB = await writeScript(rootB, "ok.mjs", "process.exit(0);\n");
    const checksA: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(rootA, scriptA) },
    ];
    const checksB: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(rootB, scriptB) },
    ];
    const preparedA = await prepareValidationPlan(
      checksA,
      {
        snapshot: subjectA.snapshot,
        declaredObservations: subjectA.declaredObservations,
      },
      subjectA.workspace,
      subjectA.config,
    );
    const preparedB = await prepareValidationPlan(
      checksB,
      {
        snapshot: subjectB.snapshot,
        declaredObservations: subjectB.declaredObservations,
      },
      subjectB.workspace,
      subjectB.config,
    );
    expect(preparedA.ok && preparedB.ok).toBe(true);
    if (!preparedA.ok || !preparedB.ok) {
      return;
    }
    const authA = await authorizeValidationPlan(preparedA.value, approvalsFor(checksA));
    expect(authA.ok).toBe(true);
    if (!authA.ok) {
      return;
    }
    const resultA = await executeValidationPlan(preparedA.value, authA.value);
    expect(resultA.ok).toBe(true);
    if (!resultA.ok) {
      return;
    }
    const crossPlan = await checkValidationResultApplicability(
      resultA.value,
      preparedB.value,
      subjectA.workspace,
    );
    expect(crossPlan.ok).toBe(false);
    const crossWs = await checkValidationResultApplicability(
      resultA.value,
      preparedA.value,
      subjectB.workspace,
    );
    expect(crossWs.ok).toBe(false);
  });

  it("unobserved new file does not widen scope or claim full-repo seal", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-unobs-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(root, script) },
    ];
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
      return;
    }
    const auth = await authorizeValidationPlan(prepared.value, approvalsFor(checks));
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const result = await executeValidationPlan(prepared.value, auth.value);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.scopeId).toBe("DECLARED_OBSERVED_INPUTS");
    await writeRelative(root, "unobserved.txt", "new\n");
    const applicable = await checkValidationResultApplicability(
      result.value,
      prepared.value,
      subject.workspace,
    );
    expect(applicable.ok).toBe(true);
    expect(result.value.scopeId).toBe("DECLARED_OBSERVED_INPUTS");
    expect(
      Object.prototype.hasOwnProperty.call(result.value, "fullRepositoryCurrent"),
    ).toBe(false);
  });

  it("retains processResult object identity and rejects fabricated result ingestion", async () => {
    const root = await createCanonicalTempRoot("pc-4b-gap-id-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "t", kind: "TYPECHECK", request: nodeRequest(root, script) },
    ];
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
      return;
    }
    const auth = await authorizeValidationPlan(prepared.value, approvalsFor(checks));
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const result = await executeValidationPlan(prepared.value, auth.value);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const processResult = result.value.checkResults[0]?.processResult;
    expect(processResult).not.toBeNull();
    const binding = resolveRegisteredValidationBinding(result.value, prepared.value);
    expect(binding.ok).toBe(true);
    if (!binding.ok) {
      return;
    }
    expect(binding.value.result.checkResults[0]?.processResult).toBe(processResult);
    expect(lookupValidationResult(result.value)?.result).toBe(result.value);

    const fabricated = {
      ...result.value,
      resultId: result.value.resultId,
      checkResults: result.value.checkResults,
    } as typeof result.value;
    const fakeBinding = resolveRegisteredValidationBinding(
      fabricated,
      prepared.value,
    );
    expect(fakeBinding.ok).toBe(false);
    expect(lookupValidationResult(fabricated)).toBeUndefined();
  });
});
