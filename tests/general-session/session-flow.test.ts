/**
 * Phase 5G — the session flow itself (§B steps 4–14, §C, §I, §J).
 *
 * 5G-M  START gates every provider call; declining costs nothing
 * 5G-N  the model budget is disclosed, capped at three calls, and never retried
 * 5G-O  the scope call sees inventory and metadata only — no file bodies, and
 *       no path the sensitive-path policy withholds
 * 5G-P  SCOPE is a separate approval; declining reads no file for the model
 * 5G-Q  currentness is rechecked after the scope approval
 * 5G-R  Phase 2 observations are earned for approved paths only
 * 5G-S  the edit call is grounded, reviewed byte-for-byte, and APPLY-gated
 * 5G-T  post-mutation reobservation drives a full command disclosure, and CHECK
 *       is a separate approval
 * 5G-U  a General Session always opens mutation with recoveryProtection REQUIRED
 * 5G-V  no store, no session: there is no downgrade path
 * 5G-AI final currentness runs before the checkpoint and before the write;
 *       drift means MUTATION_STALE and zero writes
 * 5G-AJ the checkpoint preimage is the final fresh observation, so a stale
 *       review mints no checkpoint at all
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  CHALLENGES,
  CHECKOUT_ROOT,
  FIXED_SOURCE,
  SEED_SOURCE,
  cleanupTrackedRoots,
  fullApprovalScript,
  git,
  importHost,
  loadOwners,
  newAdapterState,
  provisionProject,
  runSession,
  writeFile,
} from "./helpers.js";

afterAll(() => {
  cleanupTrackedRoots();
});

function sourceOf(projectRoot: string): string {
  return readFileSync(join(projectRoot, "src/answer.ts"), "utf8");
}

/** Every file the recovery store has actually persisted. */
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

describe("5G-M / 5G-N: consent and budget precede every provider call", () => {
  it("5G-M: declining START makes no provider call and reads nothing", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    const run = await runSession(fixture, {
      adapterState,
      answers: { "start-consent": "" },
    });

    expect(run.result.outcome).toBe("START_DECLINED");
    expect(run.result.exitCode).toBe(130);
    expect(adapterState.invocations).toHaveLength(0);
    expect(run.asked).toEqual(["start-consent"]);
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
  });

  it("5G-M: a near-miss phrase is not consent", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    for (const line of ["START", "start", `START ${CHALLENGES.startChallenge}x`, "yes"]) {
      const run = await runSession(fixture, {
        adapterState,
        answers: { "start-consent": line },
      });
      expect(run.result.outcome, line).toBe("START_DECLINED");
    }
    expect(adapterState.invocations).toHaveLength(0);
  });

  it("5G-N: the budget is disclosed before START is solicited", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture, { answers: { "start-consent": "" } });
    const beforePrompt = run.transcript.split("Type exactly: START")[0]!;

    expect(beforePrompt).toContain("at most 3");
    expect(beforePrompt).toContain("no automatic retries");
    expect(beforePrompt).toContain("Recovery:     REQUIRED");
    expect(beforePrompt).toMatch(/Git writes:\s+none/);
    expect(beforePrompt).toContain("outside this project");
    expect(beforePrompt).toContain("Validation candidates discovered");
  });

  it("5G-N: a complete run spends exactly three calls, at the declared ceilings", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    const run = await runSession(fixture, { adapterState });

    expect(run.result.outcome).toBe(
      "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
    );
    expect(adapterState.invocations.map((i) => i.purpose)).toEqual([
      "PROPOSE_SCOPE",
      "PROPOSE_EDIT",
      "PROPOSE_REASONING",
    ]);
    expect(adapterState.invocations.map((i) => i.profile)).toEqual([
      "ENGINEERING_SCOPE_PLAN_JSON",
      "ENGINEERING_EDIT_PROPOSAL_JSON",
      "REASONING_PROPOSAL_JSON",
    ]);
    expect(adapterState.invocations[0]!.maxOutputTokens).toBe(4096);
    expect(adapterState.invocations[1]!.maxOutputTokens).toBe(8192);
    expect(run.result.modelCalls).toBe(3);
  });

  it("5G-N: the declared ceiling is the brain's hard cap, not a larger number", async () => {
    const host = await importHost("general-session.mjs");
    expect(host.GENERAL_SESSION_MAX_PROVIDER_INVOCATIONS).toBe(3);
    expect(host.GENERAL_SESSION_SCOPE_OUTPUT_TOKENS).toBe(4096);
    expect(host.GENERAL_SESSION_EDIT_OUTPUT_TOKENS).toBe(8192);
    expect(host.GENERAL_SESSION_TRANSPORT_ATTEMPTS).toBe(3);

    const { HARD_MAX_OUTPUT_TOKENS } = await import("../../src/brain/bounds.js");
    expect(host.GENERAL_SESSION_EDIT_OUTPUT_TOKENS).toBe(HARD_MAX_OUTPUT_TOKENS);
  });

  it("5G-N: a failed scope call is reported, never retried", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState({ scopePlanText: "not a scope plan" });
    const run = await runSession(fixture, { adapterState });

    expect(adapterState.invocations).toHaveLength(1);
    expect(run.result.outcome).toBe("SCOPE_PLAN_MALFORMED_JSON");
    expect(run.transcript).toContain("Scope plan refused");
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
  });

  it("5G-N: a plan naming a sensitive path is refused without a second call", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState({
      scopePlanText: JSON.stringify({
        schemaVersion: 1,
        taskSummary: "read the environment",
        editableTargets: [
          { relativePath: ".env", changeKind: "REPLACE_TEXT", reason: "secrets" },
        ],
        contextPaths: [],
        validationCandidateIds: [],
        assumptions: [],
        limitations: [],
      }),
    });
    const run = await runSession(fixture, { adapterState });

    expect(adapterState.invocations).toHaveLength(1);
    expect(run.result.outcome).toBe("SCOPE_PATH_SENSITIVE");
    expect(run.transcript).toContain("ENVIRONMENT_SECRET");
  });
});

describe("5G-O / 5G-P: the scope round trip", () => {
  it("5G-O: the scope call carries metadata only, and withholds sensitive paths", async () => {
    const fixture = provisionProject({
      extraFiles: { ".env": "OPENAI_API_KEY=sk-should-never-be-disclosed\n" },
    });
    const adapterState = newAdapterState();
    await runSession(fixture, {
      adapterState,
      answers: { "start-consent": `START ${CHALLENGES.startChallenge}`, scope: "" },
    });

    const scope = adapterState.invocations[0]!;
    const blocks = new Map(scope.blocks.map((b) => [b.blockId, b.text]));
    const inventory = blocks.get("repository-inventory")!;

    expect(inventory).toContain("src/answer.ts");
    // Inventory rows are paths and sizes; no line of any file body appears.
    expect(inventory).not.toContain("return a + b");
    expect(inventory).not.toContain("export function");
    expect(inventory).not.toContain("node_modules");
    expect(inventory).not.toContain(".env");
    expect(inventory).not.toContain("sk-should-never-be-disclosed");
    expect(inventory).toContain("withheld by the sensitive-path policy");

    // Candidate ids are host-minted and disclosed with their real bodies.
    expect(blocks.get("validation-candidates")).toContain("npm-test");
    expect(blocks.get("scope-rules")).toContain("Do not invent commands");

    // Nothing is disclosed as CONTENT evidence at scope time.
    expect(JSON.stringify(scope.blocks)).not.toContain("return a + b");
  });

  it("5G-P: declining SCOPE stops before any file is read for the model", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    const run = await runSession(fixture, {
      adapterState,
      answers: { "start-consent": `START ${CHALLENGES.startChallenge}`, scope: "no" },
    });

    expect(run.result.outcome).toBe("SCOPE_DECLINED");
    expect(run.result.exitCode).toBe(130);
    expect(adapterState.invocations).toHaveLength(1);
    expect(run.asked).toEqual(["start-consent", "scope"]);
    expect(run.transcript).toContain("No file was read for the model");
  });

  it("5G-P: the scope review shows exactly the paths that were admitted", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture, {
      answers: { "start-consent": `START ${CHALLENGES.startChallenge}`, scope: "no" },
    });
    const review = run.transcript.split("— Scope review")[1]!;
    expect(review).toContain("edit   src/answer.ts");
    expect(review).toContain("Files it may read for context: (none)");
    expect(review).toContain("No file has been read for the model yet");
    expect(review).toContain(`SCOPE ${CHALLENGES.scopeChallenge}`);
  });
});

describe("5G-Q: currentness is rechecked after the scope approval", () => {
  it("5G-Q: a moved HEAD after scope approval refuses before any file is read", async () => {
    const owners = await loadOwners();
    const fixture = provisionProject();
    const { runGeneralSessionPreflight } = await importHost("preflight.mjs");
    const { recheckScopeCurrentness } = await importHost("currentness.mjs");

    const preflight = await runGeneralSessionPreflight(owners, {
      projectRoot: fixture.projectRoot,
      checkoutRoot: CHECKOUT_ROOT,
      env: fixture.env,
    });
    expect(preflight.ok).toBe(true);

    const unchanged = await recheckScopeCurrentness(owners, {
      workspace: preflight.workspace,
      config: preflight.config,
      inventory: preflight.inventory,
      expectedGitPosition: preflight.gitPosition,
    });
    expect(unchanged.ok, JSON.stringify(unchanged)).toBe(true);

    // The operator commits in another terminal while the review is on screen.
    writeFile(fixture.projectRoot, "src/answer.ts", "export const moved = 1;\n");
    git(fixture.projectRoot, ["add", "-A"]);
    git(fixture.projectRoot, ["commit", "--quiet", "-m", "moved"]);

    const moved = await recheckScopeCurrentness(owners, {
      workspace: preflight.workspace,
      config: preflight.config,
      inventory: preflight.inventory,
      expectedGitPosition: preflight.gitPosition,
    });
    expect(moved.ok).toBe(false);
    expect(moved.code).toBe("GIT_POSITION_CHANGED");
  });

  it("5G-Q: a branch switch after scope approval is refused too", async () => {
    const owners = await loadOwners();
    const fixture = provisionProject();
    const { runGeneralSessionPreflight } = await importHost("preflight.mjs");
    const { recheckScopeCurrentness } = await importHost("currentness.mjs");

    const preflight = await runGeneralSessionPreflight(owners, {
      projectRoot: fixture.projectRoot,
      checkoutRoot: CHECKOUT_ROOT,
      env: fixture.env,
    });
    git(fixture.projectRoot, ["checkout", "--quiet", "-b", "other"]);

    const switched = await recheckScopeCurrentness(owners, {
      workspace: preflight.workspace,
      config: preflight.config,
      inventory: preflight.inventory,
      expectedGitPosition: preflight.gitPosition,
    });
    expect(switched.ok).toBe(false);
    expect(switched.code).toBe("GIT_POSITION_CHANGED");
  });
});

describe("5G-R / 5G-S: grounding, the edit review, and the APPLY gate", () => {
  it("5G-R: the edit call is grounded in the approved paths only", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    await runSession(fixture, {
      adapterState,
      answers: {
        "start-consent": `START ${CHALLENGES.startChallenge}`,
        scope: `SCOPE ${CHALLENGES.scopeChallenge}`,
        apply: "",
      },
    });

    const edit = adapterState.invocations[1]!;
    const blocks = new Map(edit.blocks.map((b) => [b.blockId, b.text]));
    const permitted = JSON.parse(blocks.get("permitted-targets")!);
    expect(permitted.permittedTargets).toHaveLength(1);
    expect(permitted.permittedTargets[0].relativePath).toBe("src/answer.ts");
    // The target id is host-minted, not a path the model chose to write to.
    expect(permitted.permittedTargets[0].targetId).toMatch(/^target-/);

    const disclosed = JSON.stringify(edit.blocks);
    expect(disclosed).toContain("return a + b");
    // A file that was never approved is never disclosed as content.
    expect(disclosed).not.toContain("answer() does not return 42");
    expect(disclosed).not.toContain("stub tsc");
  });

  it("5G-S: the edit review shows both sides, and declining writes nothing", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    const run = await runSession(fixture, {
      adapterState,
      answers: {
        "start-consent": `START ${CHALLENGES.startChallenge}`,
        scope: `SCOPE ${CHALLENGES.scopeChallenge}`,
        apply: "APPLY wrong-challenge",
      },
    });

    expect(run.result.outcome).toBe("EDIT_DECLINED");
    expect(run.result.exitCode).toBe(130);
    expect(adapterState.invocations).toHaveLength(2);
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
    expect(storeEntries(fixture.storeRoot)).toEqual([]);

    const review = run.transcript.split("— Edit review")[1]!;
    expect(review).toContain("Target: src/answer.ts (REPLACE_TEXT)");
    expect(review).toContain("return 0;");
    expect(review).toContain("return 42;");
    expect(review).toContain("zero authorizations constructed");
  });

  it("5G-S: a target id the host never minted is refused, with no APPLY prompt", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState({
      editEnvelopeTransform: (envelope) => ({
        ...envelope,
        changes: [
          { ...envelope.changes[0], targetId: "target-9-deadbeefdeadbeef" },
        ],
      }),
    });
    const run = await runSession(fixture, { adapterState, answers: fullApprovalScript() });

    expect(run.result.exitCode).toBe(1);
    expect(run.result.outcome).not.toBe(
      "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
    );
    expect(run.asked).toEqual(["start-consent", "scope"]);
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
    expect(storeEntries(fixture.storeRoot)).toEqual([]);
    expect(run.transcript).toContain("Edit proposal refused");
    expect(run.transcript).toContain("Nothing was written.");
  });

  it("5G-S: an ungrounded claim subject is refused by Gate 1, not written", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState({
      editEnvelopeTransform: (envelope) => ({
        ...envelope,
        reasoningProposalJson: JSON.stringify({
          schemaVersion: 1,
          proposalId: "pre-edit",
          requestedOutcome: "edit",
          claims: [
            {
              claimId: "source-1",
              kind: "CONTENT",
              statement: "invented evidence",
              proposedSubject: {
                kind: "EVIDENCE_ID",
                id: "00000000-0000-4000-8000-000000000000",
              },
              proposedCitations: [],
            },
          ],
          hypotheses: [],
        }),
      }),
    });
    const run = await runSession(fixture, { adapterState, answers: fullApprovalScript() });

    expect(run.result.exitCode).toBe(1);
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
    expect(run.transcript).toContain("Edit proposal refused");
  });
});

describe("5G-T: post-mutation disclosure and the CHECK gate", () => {
  it("5G-T: the validation review discloses argv, cwd, timeout, env and hooks", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture, {
      answers: {
        "start-consent": `START ${CHALLENGES.startChallenge}`,
        scope: `SCOPE ${CHALLENGES.scopeChallenge}`,
        apply: `APPLY ${CHALLENGES.applyChallenge}`,
        check: "",
      },
    });

    expect(run.result.outcome).toBe("CHECK_DECLINED");
    expect(run.result.exitCode).toBe(130);
    expect(typeof run.result.checkpointId).toBe("string");
    // The edit is applied; the checks are not run.
    expect(sourceOf(fixture.projectRoot)).toBe(FIXED_SOURCE);

    const plan = run.transcript.split("— Validation plan review")[1]!;
    expect(plan).toContain("IMPORTANT");
    expect(plan).toContain("Path Code does not sandbox them");
    expect(plan).toContain("executable:");
    expect(plan).toContain("argv:");
    expect(plan).toContain("cwd:");
    expect(plan).toContain("timeoutMs:");
    expect(plan).toContain("OPENAI_API_KEY in env: no");
    expect(plan).toContain("this runs, in order:");
    expect(plan).toContain("[pre-hook] pretest");
    expect(plan).toContain("Declared subject paths: src/answer.ts");
    expect(run.transcript).toContain("EDIT APPLIED — VALIDATION NOT RUN");
    expect(run.transcript).toContain(`/recover ${run.result.checkpointId}`);
  });

  it("5G-T: an accepted run reports Gate 2, the checkpoint, and no Git commit", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture);

    expect(run.result.outcome).toBe(
      "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
    );
    expect(run.result.exitCode).toBe(0);
    expect(run.transcript).toContain("EDIT APPLIED · CONFIGURED VALIDATION ACCEPTED");
    expect(run.transcript).toContain("Git commit:   none");
    expect(run.transcript).toContain("Path Code will not recover on your behalf");
    expect(run.transcript).toContain(`Restore the pre-edit bytes with:  /recover ${run.result.checkpointId}`);

    // The mutation is a working-tree change only: Git still sees it as dirty.
    const status = git(fixture.projectRoot, ["status", "--porcelain"]);
    expect(status).toContain("src/answer.ts");
    expect(git(fixture.projectRoot, ["rev-list", "--count", "HEAD"]).trim()).toBe(
      "1",
    );
  });
});

describe("5G-U / 5G-V: recovery protection is REQUIRED, with no downgrade", () => {
  it("5G-U: the host opens mutation with the literal REQUIRED and a store", async () => {
    const host = await importHost("general-session.mjs");
    expect(host.GENERAL_SESSION_RECOVERY_PROTECTION).toBe("REQUIRED");

    const source = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/general-session.mjs"),
      "utf8",
    );
    const openCalls = source.match(/openEngineeringMutationSession\(/g) ?? [];
    expect(openCalls).toHaveLength(1);
    expect(source).toContain("recoveryProtection: GENERAL_SESSION_RECOVERY_PROTECTION");
    expect(source).toContain("recoveryStore: storeResult.value");
    expect(source).not.toMatch(/recoveryProtection:\s*"NONE"/);
    expect(source).not.toMatch(/options\.recoveryProtection/);
  });

  it("5G-U: a successful run leaves exactly one durable checkpoint", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture);
    const entries = storeEntries(fixture.storeRoot);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.join(" ")).toContain(run.result.checkpointId);
  });

  it("5G-V: a store that cannot persist refuses the write rather than skipping it", async () => {
    const fixture = provisionProject();
    // A regular file where the state directory should be: the checkpoint can
    // never be written, so the mutation must not happen either.
    const blocker = join(fixture.storeRoot, "blocker");
    writeFileSync(blocker, "not a directory\n", "utf8");

    const adapterState = newAdapterState();
    const run = await runSession(fixture, {
      adapterState,
      sessionOptions: {
        env: { ...fixture.env, PATHCODE_STATE_DIR: join(blocker, "state") },
      },
    });

    expect(run.result.outcome).toBe("RECOVERY_CHECKPOINT_NOT_ESTABLISHED");
    expect(run.result.exitCode).toBe(1);
    expect(run.result.checkpointId ?? null).toBe(null);
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
    expect(run.transcript).toContain(
      "No checkpoint was established, which means nothing was written.",
    );
  });
});

describe("5G-AI / 5G-AJ: final currentness, then the checkpoint, then the write", () => {
  it("5G-AI: drift between the review and the write means zero writes", async () => {
    const fixture = provisionProject();
    const drifted = "export function answer(): number {\n  return 7;\n}\n";
    const adapterState = newAdapterState();

    const run = await runSession(fixture, {
      adapterState,
      answers: {
        "start-consent": `START ${CHALLENGES.startChallenge}`,
        scope: `SCOPE ${CHALLENGES.scopeChallenge}`,
        // Someone edits the file while the review is on screen; the approval
        // arrives after the bytes changed.
        apply: () => {
          writeFile(fixture.projectRoot, "src/answer.ts", drifted);
          return `APPLY ${CHALLENGES.applyChallenge}`;
        },
      },
    });

    expect(run.result.outcome).toBe("MUTATION_STALE");
    expect(run.result.exitCode).toBe(1);
    expect(sourceOf(fixture.projectRoot)).toBe(drifted);
    expect(run.transcript).toContain("MUTATION_STALE");
    expect(run.transcript).toContain("Zero files were written");
    expect(adapterState.invocations).toHaveLength(2);
  });

  it("5G-AJ: a stale review mints no checkpoint at all", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture, {
      answers: {
        "start-consent": `START ${CHALLENGES.startChallenge}`,
        scope: `SCOPE ${CHALLENGES.scopeChallenge}`,
        apply: () => {
          writeFile(fixture.projectRoot, "src/answer.ts", "export const drift = 1;\n");
          return `APPLY ${CHALLENGES.applyChallenge}`;
        },
      },
    });

    expect(run.result.outcome).toBe("MUTATION_STALE");
    expect(run.result.checkpointId ?? null).toBe(null);
    // A checkpoint built from the older planning observation would exist here.
    expect(storeEntries(fixture.storeRoot)).toEqual([]);
  });

  it("5G-AI: a Git move between the review and the write is refused as well", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture, {
      answers: {
        "start-consent": `START ${CHALLENGES.startChallenge}`,
        scope: `SCOPE ${CHALLENGES.scopeChallenge}`,
        apply: () => {
          git(fixture.projectRoot, ["checkout", "--quiet", "-b", "elsewhere"]);
          return `APPLY ${CHALLENGES.applyChallenge}`;
        },
      },
    });

    expect(run.result.outcome).toBe("MUTATION_STALE");
    expect(run.result.staleDetail).toMatch(/branch|HEAD|git/i);
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
    expect(storeEntries(fixture.storeRoot)).toEqual([]);
  });

  it("5G-AJ: the checkpoint that is minted carries the bytes present just before the write", async () => {
    const fixture = provisionProject();
    const run = await runSession(fixture);

    expect(run.result.outcome).toBe(
      "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
    );
    expect(sourceOf(fixture.projectRoot)).toBe(FIXED_SOURCE);

    // Reading the checkpoint back through the owner proves the preimage.
    const owners = await loadOwners();
    const store = owners.createRecoveryStore({
      rootDirectory: join(fixture.storeRoot, "recovery"),
    });
    expect(store.ok).toBe(true);
    const loadedCheckpoint = await owners.loadCheckpoint(
      store.value,
      run.result.checkpointId,
    );
    expect(loadedCheckpoint.ok, JSON.stringify(loadedCheckpoint)).toBe(true);
    // The preimage is the pre-edit text, not the text now on disk.
    const serialized = JSON.stringify(loadedCheckpoint.value);
    expect(serialized).toContain("src/answer.ts");
    expect(serialized).not.toContain("return 42");
  });

  it("5G-AI: the ordering is stated in the host, with the write last", async () => {
    const source = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/general-session.mjs"),
      "utf8",
    );
    const currentnessAt = source.indexOf("verifyFinalCurrentness(");
    const applyAt = source.indexOf("await session.apply(");
    const proposeAt = source.indexOf("await session.propose(");
    expect(currentnessAt).toBeGreaterThan(proposeAt);
    expect(applyAt).toBeGreaterThan(currentnessAt);
  });
});

describe("mission 5G-I SCOPE_STALE — approved file drifts after SCOPE", () => {
  it("5G-I: capture + drift + recheck refuses with SCOPE_STALE", async () => {
    const owners = await loadOwners();
    const fixture = provisionProject();
    const { runGeneralSessionPreflight } = await importHost("preflight.mjs");
    const {
      captureScopeFileFingerprints,
      recheckScopeCurrentness,
    } = await importHost("currentness.mjs");

    const preflight = await runGeneralSessionPreflight(owners, {
      projectRoot: fixture.projectRoot,
      checkoutRoot: CHECKOUT_ROOT,
      env: fixture.env,
    });
    expect(preflight.ok).toBe(true);

    const approved = {
      editableTargets: [
        { relativePath: "src/answer.ts", changeKind: "REPLACE_TEXT" },
      ],
    };
    const captured = await captureScopeFileFingerprints(owners, {
      workspace: preflight.workspace,
      config: preflight.config,
      inventory: preflight.inventory,
      approved,
    });
    expect(captured.ok, JSON.stringify(captured)).toBe(true);

    writeFile(
      fixture.projectRoot,
      "src/answer.ts",
      "export function answer(): number { return 7; }\n",
    );

    const drifted = await recheckScopeCurrentness(owners, {
      workspace: preflight.workspace,
      config: preflight.config,
      inventory: preflight.inventory,
      expectedGitPosition: preflight.gitPosition,
      expectedFingerprints: captured.fingerprints,
    });
    expect(drifted.ok).toBe(false);
    expect(drifted.code).toBe("SCOPE_STALE");
  });

  it("5G-I: an approved scoped file changed after SCOPE refuses before the edit call", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    const run = await runSession(fixture, {
      adapterState,
      answers: {
        "start-consent": `START ${CHALLENGES.startChallenge}`,
        scope: `SCOPE ${CHALLENGES.scopeChallenge}`,
      },
      sessionOptions: {
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
    expect(adapterState.invocations.length).toBe(1);
  });
});

describe("mission 5G-T post-edit claim score from selected checks", () => {
  it("5G-T: Call #3 carries POST_EDIT_EXECUTION_CLAIM_REQUIREMENTS derived from the plan", async () => {
    const fixture = provisionProject();
    const adapterState = newAdapterState();
    const run = await runSession(fixture, { adapterState });
    expect(run.result.exitCode).toBe(0);
    expect(adapterState.invocations.length).toBe(3);
    const postEdit = adapterState.invocations[2]!;
    const block = postEdit.blocks.find(
      (b) => b.blockId === "post-edit-execution-claim-requirements",
    );
    expect(block).toBeDefined();
    expect(block!.text).toContain("POST_EDIT_EXECUTION_CLAIM_REQUIREMENTS");
    expect(block!.text).toContain("TYPECHECK");
    expect(block!.text).toMatch(/TARGETED_TEST|DEFINES|BEHAVES/);
  });
});

describe("mission 5G-W validation failure retains mutation and surfaces recovery", () => {
  it("5G-W: a failing check does not auto-recover; checkpoint is offered", async () => {
    const fixture = provisionProject({
      scripts: {
        pretest: "node -e \"process.exit(0)\"",
        test: "node -e \"process.exit(2)\"",
      },
    });
    const run = await runSession(fixture);
    expect(run.result.exitCode).not.toBe(0);
    expect(sourceOf(fixture.projectRoot)).toBe(FIXED_SOURCE);
    expect(typeof run.result.checkpointId).toBe("string");
    expect(run.transcript).toMatch(/VALIDATION NOT|not established|NOT ACCEPTED|FAILED/i);
    expect(run.transcript).toContain(`/recover ${run.result.checkpointId}`);
    expect(run.transcript).toMatch(/will not recover on your behalf|no automatic recovery/i);
  });
});
