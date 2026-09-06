import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadProjectConfig } from "../../src/config/index.js";
import { explicitLocalProcessApproval } from "../../src/execution/index.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import type { LocalProcessResult } from "../../src/execution/types.js";
import {
  authorizeValidationPlan,
  checkValidationResultApplicability,
  classifyLocalProcessForValidation,
  DEFAULT_VALIDATION_CAPTURE_BYTES,
  executeValidationPlan,
  MAX_VALIDATION_CHECKS,
  prepareValidationPlan,
} from "../../src/validation/index.js";
import { resetValidationRegistryForTests } from "../../src/validation/internal/registry.js";
import type { ValidationCheckSpec } from "../../src/validation/types.js";
import { boundaryFor, cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";
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
  options?: { timeoutMs?: number; maxStdoutBytes?: number },
) {
  const request: {
    executable: string;
    argv: string[];
    cwd: string;
    timeoutMs?: number;
    maxStdoutBytes?: number;
    maxStderrBytes?: number;
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

describe("validation classifier (pure)", () => {
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
      stderr: { ...stream, text: "PASS" },
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

  it("passes only on exit 0 with complete evidence", () => {
    expect(classifyLocalProcessForValidation(synthetic({}))).toBe("PASS");
  });

  it("fails on nonzero exit even if stdout says PASS", () => {
    expect(
      classifyLocalProcessForValidation(synthetic({ exitCode: 1 })),
    ).toBe("FAIL");
  });

  it("treats timeout/overflow/incomplete as inconclusive", () => {
    expect(
      classifyLocalProcessForValidation(
        synthetic({ timedOut: true, outcome: "TIMED_OUT" }),
      ),
    ).toBe("EXECUTION_INCONCLUSIVE");
    expect(
      classifyLocalProcessForValidation(
        synthetic({ overflow: true, outcome: "OUTPUT_OVERFLOW" }),
      ),
    ).toBe("EXECUTION_INCONCLUSIVE");
  });
});

describe("validation plan preparation and execution", () => {
  it("prepares without spawning and rejects empty/oversized/duplicate plans", async () => {
    const root = await createCanonicalTempRoot("pc-4b-prep-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const empty = await prepareValidationPlan(
      [],
      {
        snapshot: subject.snapshot,
        declaredObservations: subject.declaredObservations,
      },
      subject.workspace,
      subject.config,
    );
    expect(empty.ok).toBe(false);

    const s1 = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const s2 = await writeScript(root, "ok2.mjs", "process.exit(0);\n");
    const dup = await prepareValidationPlan(
      [
        { id: "t1", kind: "TYPECHECK", request: nodeRequest(root, s1) },
        { id: "t1", kind: "TARGETED_TEST", request: nodeRequest(root, s2) },
      ],
      {
        snapshot: subject.snapshot,
        declaredObservations: subject.declaredObservations,
      },
      subject.workspace,
      subject.config,
    );
    expect(dup.ok).toBe(false);

    const tooMany: ValidationCheckSpec[] = [];
    for (let i = 0; i < MAX_VALIDATION_CHECKS + 1; i += 1) {
      tooMany.push({
        id: `c${i}`,
        kind: "LINT",
        request: nodeRequest(
          root,
          await writeScript(root, `s${i}.mjs`, "process.exit(0);\n"),
        ),
      });
    }
    const oversized = await prepareValidationPlan(
      tooMany,
      {
        snapshot: subject.snapshot,
        declaredObservations: subject.declaredObservations,
      },
      subject.workspace,
      subject.config,
    );
    expect(oversized.ok).toBe(false);
  });

  it("freezes caller argv mutation and rejects aggregate capture widening", async () => {
    const root = await createCanonicalTempRoot("pc-4b-freeze-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(
      root,
      "echo.mjs",
      "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n",
    );
    const argv = [script, "keep"];
    const prepared = await prepareValidationPlan(
      [
        {
          id: "t",
          kind: "TYPECHECK",
          request: {
            executable: process.execPath,
            argv,
            cwd: root,
            maxStdoutBytes: DEFAULT_VALIDATION_CAPTURE_BYTES,
            maxStderrBytes: DEFAULT_VALIDATION_CAPTURE_BYTES,
          },
        },
      ],
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
    argv[1] = "mutated";
    expect(prepared.value.checks[0]?.preparedProcess.argv[1]).toBe("keep");

    const huge = await prepareValidationPlan(
      [
        {
          id: "h",
          kind: "BUILD",
          request: {
            ...nodeRequest(root, script),
            maxStdoutBytes: 20_000_000,
            maxStderrBytes: 20_000_000,
          },
        },
      ],
      {
        snapshot: subject.snapshot,
        declaredObservations: subject.declaredObservations,
      },
      subject.workspace,
      subject.config,
    );
    expect(huge.ok).toBe(false);
  });

  it("requires caller approvals and refuses replay", async () => {
    const root = await createCanonicalTempRoot("pc-4b-auth-");
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
    const missing = await authorizeValidationPlan(prepared.value, new Map());
    expect(missing.ok).toBe(false);

    const auth = await authorizeValidationPlan(
      prepared.value,
      approvalsFor(checks),
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      return;
    }
    const first = await executeValidationPlan(prepared.value, auth.value);
    expect(first.ok).toBe(true);
    const replay = await executeValidationPlan(prepared.value, auth.value);
    expect(replay.ok).toBe(false);
  });

  it("honors TYPECHECK disable-action", async () => {
    const root = await createCanonicalTempRoot("pc-4b-disable-");
    await writeFile(
      join(root, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = TYPECHECK\n```\n",
      "utf8",
    );
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const script = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const prepared = await prepareValidationPlan(
      [{ id: "t", kind: "TYPECHECK", request: nodeRequest(root, script) }],
      {
        snapshot: subject.snapshot,
        declaredObservations: subject.declaredObservations,
      },
      subject.workspace,
      subject.config,
    );
    expect(prepared.ok).toBe(false);
  });

  it("stops after first failure and marks later checks NOT_ATTEMPTED", async () => {
    const root = await createCanonicalTempRoot("pc-4b-stop-");
    const subject = await subjectFixture(root, ["src/a.ts", "tests/t.ts"]);
    const fail = await writeScript(root, "fail.mjs", "process.exit(2);\n");
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "a", kind: "TYPECHECK", request: nodeRequest(root, fail) },
      { id: "b", kind: "TARGETED_TEST", request: nodeRequest(root, ok) },
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
    expect(result.value.checkResults[1]?.verdict).toBe("NOT_ATTEMPTED");
    expect(result.value.checkResults[1]?.processResult).toBeNull();
    expect(result.value.planCriterionSatisfied).toBe(false);
    expect(result.value.aggregateOutcome).not.toBe("PROVEN");
  });

  it("end-to-end scoped result then rejects reuse after declared input change", async () => {
    const root = await createCanonicalTempRoot("pc-4b-e2e-");
    const subject = await subjectFixture(root, ["src/main.ts", "tests/main.test.ts"]);
    const ok = await writeScript(root, "ok.mjs", "process.exit(0);\n");
    const checks: ValidationCheckSpec[] = [
      { id: "typecheck", kind: "TYPECHECK", request: nodeRequest(root, ok) },
      { id: "test", kind: "TARGETED_TEST", request: nodeRequest(root, ok) },
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
    expect(result.value.planCriterionSatisfied).toBe(true);
    expect(result.value.scopeId).toBe("DECLARED_OBSERVED_INPUTS");

    const applicable = await checkValidationResultApplicability(
      result.value,
      prepared.value,
      subject.workspace,
    );
    expect(applicable.ok).toBe(true);

    await writeRelative(root, "src/main.ts", "src/main.ts-content\nCHANGED\n");
    const stale = await checkValidationResultApplicability(
      result.value,
      prepared.value,
      subject.workspace,
    );
    expect(stale.ok).toBe(false);

    const cloned = { ...result.value };
    const fake = await checkValidationResultApplicability(
      cloned as typeof result.value,
      prepared.value,
      subject.workspace,
    );
    expect(fake.ok).toBe(false);
  });

  it("timeout never becomes validation PASS", async () => {
    const root = await createCanonicalTempRoot("pc-4b-to-");
    const subject = await subjectFixture(root, ["src/a.ts"]);
    const sleep = await writeScript(
      root,
      "sleep.mjs",
      "setTimeout(() => process.exit(0), 5000);\n",
    );
    const checks: ValidationCheckSpec[] = [
      {
        id: "slow",
        kind: "LINT",
        request: nodeRequest(root, sleep, [], { timeoutMs: 150 }),
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
    expect(result.value.checkResults[0]?.verdict).toBe("EXECUTION_INCONCLUSIVE");
    expect(result.value.planCriterionSatisfied).toBe(false);
  }, 15_000);

  it("import has no spawn and package root does not export validation", async () => {
    const env = { ...process.env };
    const cwd = process.cwd();
    await import("../../src/validation/index.js");
    expect(process.env).toEqual(env);
    expect(process.cwd()).toBe(cwd);
    const root = await import("../../src/index.js");
    expect(Object.prototype.hasOwnProperty.call(root, "prepareValidationPlan")).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(root, "executeValidationPlan")).toBe(
      false,
    );
  });

  it("malformed disable-action fails closed", async () => {
    const root = await createCanonicalTempRoot("pc-4b-badcfg-");
    await writeFile(
      join(root, "PATHCODE.md"),
      "```pathcode-config\ndisable-action = NOT_A_KIND\n```\n",
      "utf8",
    );
    const loaded = await loadProjectConfig(await boundaryFor(root));
    expect(loaded.ok).toBe(false);
  });
});
