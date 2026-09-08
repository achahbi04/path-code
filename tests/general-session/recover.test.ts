/**
 * Phase 5G — `/recover <checkpoint-id>` (§G).
 *
 * 5G-AF the command contacts no provider, shows every disposition, requires the
 *       RESTORE phrase, and only then mints a RecoveryAuthorization
 * 5G-AG the checkpoint is durable across a process restart: a fresh process,
 *       given only the id, restores the pre-edit bytes exactly
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  CHALLENGES,
  CHECKOUT_ROOT,
  FIXED_SOURCE,
  SEED_SOURCE,
  cleanupTrackedRoots,
  importHost,
  provisionProject,
  runSession,
  scriptedPrompt,
  writeFile,
} from "./helpers.js";

afterAll(() => {
  cleanupTrackedRoots();
});

function sourceOf(projectRoot: string): string {
  return readFileSync(join(projectRoot, "src/answer.ts"), "utf8");
}

async function applyEdit(fixture: ReturnType<typeof provisionProject>) {
  const run = await runSession(fixture);
  expect(run.result.outcome).toBe(
    "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
  );
  expect(sourceOf(fixture.projectRoot)).toBe(FIXED_SOURCE);
  return run.result.checkpointId as string;
}

describe("5G-AF: /recover is a separate, human-authorized act", () => {
  it("5G-AF: parses the command and refuses anything path-like", async () => {
    const { parseRecoverCommand, isWellFormedCheckpointId } =
      await importHost("recover.mjs");

    expect(parseRecoverCommand("/recover abc-123").checkpointId).toBe("abc-123");
    expect(parseRecoverCommand("/recover").code).toBe("CHECKPOINT_ID_REQUIRED");
    expect(parseRecoverCommand("/trial").code).toBe("NOT_RECOVER_COMMAND");
    for (const bad of ["../escape", "a/b", "/abs", "..", ".", "id with space"]) {
      expect(isWellFormedCheckpointId(bad), bad).toBe(false);
    }
  });

  it("5G-AF: shows dispositions, requires RESTORE, and restores the exact bytes", async () => {
    const fixture = provisionProject();
    const checkpointId = await applyEdit(fixture);
    const { runRecoverCommand } = await importHost("recover.mjs");

    const declined = scriptedPrompt({ restore: "yes please" });
    const declinedResult = await runRecoverCommand(declined.prompt, {
      checkpointId,
      projectRoot: fixture.projectRoot,
      checkoutRoot: CHECKOUT_ROOT,
      env: fixture.env,
      restoreChallenge: CHALLENGES.restoreChallenge,
    });
    expect(declinedResult.outcome).toBe("RESTORE_DECLINED");
    expect(declinedResult.exitCode).toBe(130);
    expect(sourceOf(fixture.projectRoot)).toBe(FIXED_SOURCE);
    expect(declined.output()).toContain("ELIGIBLE_RESTORE");
    expect(declined.output()).toContain("src/answer.ts");
    expect(declined.output()).toContain(
      "Path Code does not commit, stash or otherwise touch Git.",
    );
    expect(declined.output()).toContain("Nothing was restored.");

    const approved = scriptedPrompt({
      restore: `RESTORE ${CHALLENGES.restoreChallenge}`,
    });
    const approvedResult = await runRecoverCommand(approved.prompt, {
      checkpointId,
      projectRoot: fixture.projectRoot,
      checkoutRoot: CHECKOUT_ROOT,
      env: fixture.env,
      restoreChallenge: CHALLENGES.restoreChallenge,
    });
    expect(approvedResult.outcome).toBe("RECOVERY_COMPLETE");
    expect(approvedResult.exitCode).toBe(0);
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
    expect(approved.output()).toContain("No Git command was run");
  });

  it("5G-AF: reports a checkpoint that is not in this store, and restores nothing", async () => {
    const fixture = provisionProject();
    const { runRecoverCommand } = await importHost("recover.mjs");
    const scripted = scriptedPrompt({});
    const result = await runRecoverCommand(scripted.prompt, {
      checkpointId: "no-such-checkpoint",
      projectRoot: fixture.projectRoot,
      checkoutRoot: CHECKOUT_ROOT,
      env: fixture.env,
      restoreChallenge: CHALLENGES.restoreChallenge,
    });
    expect(result.exitCode).toBe(1);
    expect(scripted.asked).toEqual([]);
    expect(scripted.output()).toContain("could not be loaded");
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
  });

  it("5G-AF: a file changed since the checkpoint is reported, not silently overwritten", async () => {
    const fixture = provisionProject();
    const checkpointId = await applyEdit(fixture);
    const local = "export const localEdit = true;\n";
    writeFile(fixture.projectRoot, "src/answer.ts", local);

    const { runRecoverCommand } = await importHost("recover.mjs");
    const scripted = scriptedPrompt({
      restore: `RESTORE ${CHALLENGES.restoreChallenge}`,
    });
    const result = await runRecoverCommand(scripted.prompt, {
      checkpointId,
      projectRoot: fixture.projectRoot,
      checkoutRoot: CHECKOUT_ROOT,
      env: fixture.env,
      restoreChallenge: CHALLENGES.restoreChallenge,
    });

    expect(result.outcome).not.toBe("RECOVERY_COMPLETE");
    expect(sourceOf(fixture.projectRoot)).toBe(local);
    expect(scripted.output()).toContain(
      "Only ELIGIBLE_RESTORE entries are restored",
    );
  });

  it("5G-AF: the module contacts no provider and runs no Git command", async () => {
    const source = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/recover.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(/fetch\(|createOpenAIAdapter|createEngineeringBrain/);
    expect(source).not.toMatch(/child_process|spawnSync|OPENAI_API_KEY/);
    expect(source).not.toMatch(/askHiddenCredential/);
    // Authorization is minted after the challenge is accepted, never before.
    const challengeAt = source.indexOf("acceptsRestoreConfirmation");
    const authorizeAt = source.indexOf("authorizeRecoveryReview(");
    expect(challengeAt).toBeGreaterThan(-1);
    expect(authorizeAt).toBeGreaterThan(challengeAt);
  });
});

describe("5G-AG: the checkpoint survives the process that made it", () => {
  it("5G-AG: a fresh process restores from the id alone", async () => {
    const fixture = provisionProject();
    const checkpointId = await applyEdit(fixture);

    // A separate Node process: no shared module state, no shared brain, no
    // session — only the store root and the checkpoint id.
    const runnerPath = join(fixture.projectRoot, "..", `recover-runner-${process.pid}.mjs`);
    writeFileSync(
      runnerPath,
      `import { runRecoverCommand } from ${JSON.stringify(
        pathToFileURL(join(CHECKOUT_ROOT, "scripts/pathcode-cli/recover.mjs")).href,
      )};
const out = [];
const prompt = {
  write: (t) => out.push(t),
  writeErr: (t) => out.push(t),
  askLine: async () => "RESTORE restart-challenge",
  askHiddenCredential: async () => { throw new Error("no credential in recovery"); },
  isStopped: () => false,
  close: () => undefined,
};
const result = await runRecoverCommand(prompt, {
  checkpointId: process.argv[2],
  projectRoot: process.argv[3],
  checkoutRoot: ${JSON.stringify(CHECKOUT_ROOT)},
  restoreChallenge: "restart-challenge",
});
process.stdout.write(JSON.stringify({ ...result, transcript: out.join("") }));
process.exit(result.exitCode === 0 ? 0 : 1);
`,
      "utf8",
    );

    const spawned = spawnSync(
      process.execPath,
      [runnerPath, checkpointId, fixture.projectRoot],
      {
        encoding: "utf8",
        cwd: fixture.projectRoot,
        env: {
          ...process.env,
          PATHCODE_STATE_DIR: fixture.storeRoot,
          OPENAI_API_KEY: "sk-must-not-be-used",
        },
      },
    );

    expect(spawned.status, spawned.stderr).toBe(0);
    const parsed = JSON.parse(spawned.stdout) as {
      outcome: string;
      transcript: string;
    };
    expect(parsed.outcome).toBe("RECOVERY_COMPLETE");
    expect(parsed.transcript).toContain("no model was contacted");
    expect(sourceOf(fixture.projectRoot)).toBe(SEED_SOURCE);
  });
});
