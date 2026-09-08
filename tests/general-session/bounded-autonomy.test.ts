/**
 * Phase 5G-R1 — bounded autonomy proofs (R1-D … R1-T).
 *
 * REVIEW keeps START/SCOPE/APPLY/CHECK. BOUNDED asks exactly one RUN, then the
 * trusted host mints Scope/Edit/Validation authority inside the disclosed
 * policy envelope. Scripted adapter only — no network, no credential.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  CHALLENGES,
  CHECKOUT_ROOT,
  FIXED_SOURCE,
  SEED_SOURCE,
  boundedApprovalScript,
  cleanupTrackedRoots,
  fullApprovalScript,
  git,
  importHost,
  newAdapterState,
  provisionProject,
  runSession,
  writeFile,
} from "./helpers.js";

afterAll(() => {
  cleanupTrackedRoots();
});

function sourceOf(projectRoot: string, relativePath = "src/answer.ts"): string {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

function storeEntries(storeRoot: string): string[] {
  const found: string[] = [];
  const walk = (directory: string) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  walk(join(storeRoot, "recovery"));
  return found;
}

const boundedSession = {
  autonomyMode: "bounded" as const,
  runChallenge: CHALLENGES.runChallenge,
};

describe("R1-D: REVIEW mode still solicits the four gates", () => {
  it("R1-D: successful REVIEW asks start-consent, scope, apply, check", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture, { answers: fullApprovalScript() });
    expect(run.result.exitCode).toBe(0);
    expect(run.asked).toEqual([
      "start-consent",
      "scope",
      "apply",
      "check",
    ]);
    expect(run.asked).not.toContain("run-consent");
  });
});

describe("R1-E / R1-R / R1-S / R1-T: BOUNDED success path", () => {
  it("R1-E: BOUNDED success asks only run-consent; source mutates; exit 0", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    const headBefore = git(fixture.projectRoot, ["rev-parse", "HEAD"]).trim();
    const run = await runSession(fixture, {
      adapterState,
      answers: boundedApprovalScript(),
      sessionOptions: boundedSession,
    });

    expect(run.result.outcome).toBe(
      "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
    );
    expect(run.result.exitCode).toBe(0);
    expect(run.result.autonomyMode).toBe("bounded");
    expect(run.asked).toEqual(["run-consent"]);
    expect(run.asked).not.toContain("scope");
    expect(run.asked).not.toContain("apply");
    expect(run.asked).not.toContain("check");
    expect(run.asked).not.toContain("start-consent");
    expect(sourceOf(fixture.projectRoot)).toBe(FIXED_SOURCE);

    // R1-Q: no git commit
    expect(git(fixture.projectRoot, ["rev-parse", "HEAD"]).trim()).toBe(headBefore);

    // R1-R: exactly three model calls, no retry
    expect(adapterState.invocations).toHaveLength(3);
    expect(run.result.modelCalls).toBe(3);

    // R1-S: real progress strings, not fabricated CoT
    expect(run.transcript).toContain("Scope admitted by bounded policy");
    expect(run.transcript).toContain("Reading approved files");
    expect(run.transcript).toMatch(/Recovery checkpoint/);

    // R1-T: success copy stays scoped
    expect(run.transcript).toContain("CONFIGURED VALIDATION ACCEPTED");
    expect(run.transcript).toMatch(
      /Scope: the declared inputs and approved checks — not whole-project correctness/,
    );
    expect(run.transcript).toContain("Git commit:   none");
  });
});

describe("R1-F: declining RUN spends nothing", () => {
  it("R1-F: empty RUN → zero adapter invocations", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    const run = await runSession(fixture, {
      adapterState,
      answers: { "run-consent": "" },
      sessionOptions: boundedSession,
    });
    expect(run.result.outcome).toBe("RUN_DECLINED");
    expect(run.result.exitCode).toBe(130);
    expect(adapterState.invocations).toHaveLength(0);
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
  });
});

describe("R1-G: host mints authority after RUN; model never authorizes", () => {
  it("R1-G: architecture — authorize* follows RUN; model text never calls it", async () => {
    const session = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/general-session.mjs"),
      "utf8",
    );
    const runAt = session.indexOf('askLine("run-consent"');
    const editAuthAt = session.indexOf("authorizePreparedChange(");
    const validationAuthAt = session.indexOf("authorizeValidationPlan(");
    expect(runAt).toBeGreaterThan(-1);
    expect(editAuthAt).toBeGreaterThan(runAt);
    expect(validationAuthAt).toBeGreaterThan(runAt);
    expect(session).not.toMatch(/model\.|response\.text.*authorize/);

    const fixture = provisionProject();
    const run = await runSession(fixture, {
      answers: boundedApprovalScript(),
      sessionOptions: boundedSession,
    });
    expect(run.result.exitCode).toBe(0);
    // No credential prompt on the host-provided brain path.
    expect(run.asked).toEqual(["run-consent"]);
  });
});

describe("R1-H / R1-I / R1-L: policy escalation unit surface", () => {
  it("R1-H: evaluateScopeAgainstPolicy escalates oversize context", async () => {
    const { evaluateScopeAgainstPolicy, buildBoundedSessionPolicy } =
      await importHost("autonomy-policy.mjs");
    const policy = buildBoundedSessionPolicy({
      workspaceId: "/tmp/x",
      taskText: "t",
      projectRoot: "/tmp/x",
      branch: "main",
      headOid: "abc",
      modelId: "m",
      maxEditableTargets: 4,
      maxContextPaths: 2,
      validationCandidateIds: ["npm-test"],
      plannedSummaries: ["npm-test"],
    });
    const oversize = evaluateScopeAgainstPolicy(policy, {
      editableTargets: [
        { relativePath: "a.ts", changeKind: "REPLACE_TEXT" },
      ],
      contextPaths: [
        { relativePath: "b.ts" },
        { relativePath: "c.ts" },
        { relativePath: "d.ts" },
      ],
      validationCandidateIds: ["npm-test"],
    });
    expect(oversize.ok).toBe(false);
    expect(oversize.code).toBe("AUTONOMY_ESCALATION_REQUIRED");

    const fixture = provisionProject({
      extraFiles: {
        "src/a.ts": "export const a = 1;\n",
        "src/b.ts": "export const b = 1;\n",
        "src/c.ts": "export const c = 1;\n",
        "src/d.ts": "export const d = 1;\n",
        "src/e.ts": "export const e = 1;\n",
      },
    });
    const adapterState = newAdapterState({
      scopePlanText: JSON.stringify({
        schemaVersion: 1,
        taskSummary: "too many editable",
        editableTargets: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"].map(
          (relativePath) => ({
            relativePath,
            changeKind: "REPLACE_TEXT",
            reason: "cap probe",
          }),
        ),
        contextPaths: [],
        validationCandidateIds: [],
        assumptions: [],
        limitations: [],
      }),
    });
    const run = await runSession(fixture, {
      adapterState,
      answers: boundedApprovalScript(),
      sessionOptions: boundedSession,
    });
    // Parser bound (MAX_SCOPE_EDITABLE_TARGETS=4) refuses before policy.
    expect(run.result.outcome).toBe("SCOPE_PLAN_BOUNDS_EXCEEDED");
    expect(adapterState.invocations).toHaveLength(1);
  });

  it("R1-I: evaluateEditAgainstPolicy escalates paths outside admitted scope", async () => {
    const { evaluateEditAgainstPolicy, buildBoundedSessionPolicy } =
      await importHost("autonomy-policy.mjs");
    const policy = buildBoundedSessionPolicy({
      workspaceId: "/tmp/x",
      taskText: "t",
      projectRoot: "/tmp/x",
      branch: "main",
      headOid: "abc",
      modelId: "m",
      maxEditableTargets: 4,
      maxContextPaths: 16,
      validationCandidateIds: ["npm-test"],
      plannedSummaries: ["npm-test"],
    });
    const result = evaluateEditAgainstPolicy(
      policy,
      {
        view: {
          order: [
            { relativePath: "src/other.ts", kind: "REPLACE_TEXT" },
          ],
        },
      },
      {
        editableTargets: [{ relativePath: "src/answer.ts", changeKind: "REPLACE_TEXT" }],
      },
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("AUTONOMY_ESCALATION_REQUIRED");
    expect(result.reason).toMatch(/outside the admitted scope/);
  });

  it("R1-L: evaluateValidationAgainstPolicy refuses undeclared checks", async () => {
    const { evaluateValidationAgainstPolicy, buildBoundedSessionPolicy } =
      await importHost("autonomy-policy.mjs");
    const policy = buildBoundedSessionPolicy({
      workspaceId: "/tmp/x",
      taskText: "t",
      projectRoot: "/tmp/x",
      branch: "main",
      headOid: "abc",
      modelId: "m",
      maxEditableTargets: 4,
      maxContextPaths: 16,
      validationCandidateIds: ["npm-test"],
      plannedSummaries: ["npm-test"],
    });
    const result = evaluateValidationAgainstPolicy(policy, {
      checks: [{ id: "npm-test:install" }],
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("AUTONOMY_ESCALATION_REQUIRED");
  });
});

describe("R1-J: recovery REQUIRED after bounded success", () => {
  it("R1-J: GENERAL_SESSION_RECOVERY_PROTECTION + durable checkpoint", async () => {
    const host = await importHost("general-session.mjs");
    expect(host.GENERAL_SESSION_RECOVERY_PROTECTION).toBe("REQUIRED");

    const fixture = provisionProject();
    const run = await runSession(fixture, {
      answers: boundedApprovalScript(),
      sessionOptions: boundedSession,
    });
    expect(run.result.exitCode).toBe(0);
    expect(typeof run.result.checkpointId).toBe("string");
    expect(storeEntries(fixture.storeRoot).join(" ")).toContain(
      run.result.checkpointId,
    );
  });
});

describe("R1-K: currentness drift before write under BOUNDED", () => {
  it("R1-K: afterScopeApproval drift → SCOPE_STALE; zero further calls", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    const run = await runSession(fixture, {
      adapterState,
      answers: boundedApprovalScript(),
      sessionOptions: {
        ...boundedSession,
        afterScopeApproval: async () => {
          writeFile(
            fixture.projectRoot,
            "src/answer.ts",
            "export function answer(): number { return 7; }\n",
          );
        },
      },
    });
    expect(run.result.outcome).toBe("SCOPE_STALE");
    expect(run.result.exitCode).toBe(1);
    expect(adapterState.invocations).toHaveLength(1);
  });

  it("R1-K: disk drift after edit review → MUTATION_STALE; zero writes of model text", async () => {
    const fixture = provisionProject();
    const drifted = "export function answer(): number {\n  return 7;\n}\n";
    const adapterState = newAdapterState();
    const run = await runSession(fixture, {
      adapterState,
      answers: boundedApprovalScript(),
      sessionOptions: {
        ...boundedSession,
        afterEditReview: async () => {
          writeFile(fixture.projectRoot, "src/answer.ts", drifted);
        },
      },
    });
    expect(run.result.outcome).toBe("MUTATION_STALE");
    expect(run.result.exitCode).toBe(1);
    expect(sourceOf(fixture.projectRoot)).toBe(drifted);
    expect(run.transcript).toContain("Zero files were written");
    expect(storeEntries(fixture.storeRoot)).toEqual([]);
    expect(adapterState.invocations).toHaveLength(2);
  });
});

describe("R1-M: model cannot invent validation commands", () => {
  it("R1-M: architecture — host owns candidates; model never spawns", async () => {
    const session = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/general-session.mjs"),
      "utf8",
    );
    expect(session).toContain("discoverValidationCandidates");
    expect(session).toContain("selectPlannedChecks");
    expect(session).not.toMatch(/spawnSync|child_process/);
    const candidates = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/validation-candidates.mjs"),
      "utf8",
    );
    expect(candidates).toMatch(/install|deploy|migrate/);
  });
});

describe("R1-N: prepared env scrubbed under BOUNDED", () => {
  it("R1-N: preparedEnvSnapshots never carry provider secrets", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture, {
      answers: boundedApprovalScript(),
      sessionOptions: {
        ...boundedSession,
        env: {
          ...fixture.env,
          OPENAI_API_KEY: "sk-should-never-reach-child",
          AWS_SECRET_ACCESS_KEY: "aws-secret",
        },
      },
    });
    expect(run.result.exitCode).toBe(0);
    for (const snapshot of run.result.preparedEnvSnapshots ?? []) {
      for (const key of Object.keys(snapshot)) {
        expect(key).not.toMatch(/^OPENAI_|_API_KEY$|^AWS_/);
      }
    }
  });
});

describe("R1-O: validation failure retains mutation + checkpoint", () => {
  it("R1-O: failing check keeps edit, offers recover, no auto-restore", async () => {
    const fixture = provisionProject({
      scripts: {
        pretest: "node -e \"process.exit(0)\"",
        test: "node -e \"process.exit(2)\"",
      },
    });
    const run = await runSession(fixture, {
      answers: boundedApprovalScript(),
      sessionOptions: boundedSession,
    });
    expect(run.result.exitCode).not.toBe(0);
    expect(run.result.outcome).toBe("EDIT_APPLIED_VALIDATION_NOT_ESTABLISHED");
    expect(sourceOf(fixture.projectRoot)).toBe(FIXED_SOURCE);
    expect(typeof run.result.checkpointId).toBe("string");
    expect(run.transcript).toContain(`/recover ${run.result.checkpointId}`);
    expect(run.transcript).toMatch(/will not recover on your behalf/i);
  });
});

describe("R1-P: recover still requires RESTORE before authorize", () => {
  it("R1-P: recover.mjs gates authorizeRecoveryReview on RESTORE", async () => {
    const recover = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/recover.mjs"),
      "utf8",
    );
    expect(recover.indexOf("authorizeRecoveryReview(")).toBeGreaterThan(
      recover.indexOf("acceptsRestoreConfirmation"),
    );
  });
});

describe("R1-Q already covered with R1-E head oid identity", () => {
  it("R1-Q: porcelain dirty, single commit remains", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture, {
      answers: boundedApprovalScript(),
      sessionOptions: boundedSession,
    });
    expect(run.result.exitCode).toBe(0);
    expect(git(fixture.projectRoot, ["status", "--porcelain"])).toContain(
      "src/answer.ts",
    );
    expect(git(fixture.projectRoot, ["rev-list", "--count", "HEAD"]).trim()).toBe(
      "1",
    );
  });
});
