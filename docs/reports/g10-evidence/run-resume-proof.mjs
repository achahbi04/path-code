/**
 * G10 — resume reconciliation + reopen worktree proof (no provider required).
 */

import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(ROOT, "docs/reports/g10-evidence/live");
const TMP = join(ROOT, "docs/reports/g10-evidence/tmp");

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(TMP, { recursive: true });
  const ag10 = await import(join(ROOT, "scripts/pathcode-cli/ag10/index.mjs"));
  const { reopenTaskWorktree, createTaskWorktree, removeTaskWorktree } =
    await import(join(ROOT, "scripts/pathcode-cli/ag1/task-worktree.mjs"));

  const primary = mkdtempSync(join(TMP, "g10-resume-primary-"));
  const runtimeRoot = mkdtempSync(join(TMP, "g10-resume-rt-"));
  const evidence = {
    schema: "pathcode.g10.resume-proof.v1",
    at: new Date().toISOString(),
  };

  try {
    const init = git(primary, ["init"]);
    if (init.status !== 0) {
      throw new Error(`git init failed: ${init.stderr || init.stdout}`);
    }
    git(primary, ["config", "user.email", "g10@test"]);
    git(primary, ["config", "user.name", "g10"]);
    // Avoid global hooks / template issues in disposable fixtures.
    git(primary, ["config", "commit.gpgsign", "false"]);
    writeFileSync(join(primary, "app.js"), "console.log(1)\n");
    const add = git(primary, ["add", "."]);
    if (add.status !== 0) {
      throw new Error(`git add failed: ${add.stderr || add.stdout}`);
    }
    const commit = git(primary, ["commit", "-m", "init"]);
    if (commit.status !== 0) {
      throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
    }
    const head = git(primary, ["rev-parse", "HEAD"]);
    if (head.status !== 0) {
      throw new Error(`git rev-parse failed: ${head.stderr || head.stdout}`);
    }

    const wt = createTaskWorktree({
      primaryRoot: primary,
      taskId: "resume-demo",
      runtimeRoot,
      tasksParent: join(runtimeRoot, "ag1-tasks"),
    });
    evidence.create = { ok: wt.ok, taskId: wt.taskId, path: wt.worktreePath };
    if (!wt.ok) throw new Error(wt.message);

    writeFileSync(join(wt.worktreePath, "app.js"), "console.log(2)\n");
    const fabric = await ag10.createG10Fabric({
      runtimeRoot,
      taskId: wt.taskId,
      worktreePath: wt.worktreePath,
      objective: "bump log",
      preferCopilotSdk: false,
    });
    fabric.persist({
      latestEngineTurn: "antigravity",
      agSessionMode: "ACTIVE",
      copilotMode: "cli_fallback",
      copilotSessionId: "dead-copilot",
    });
    await fabric.shutdown();

    // Simulate PATH exit then reopen.
    const reopened = reopenTaskWorktree({
      primaryRoot: primary,
      taskId: wt.taskId,
      worktreePath: wt.worktreePath,
      runtimeRoot,
    });
    evidence.reopen = {
      ok: reopened.ok === true && reopened.resumed === true,
      taskId: reopened.taskId,
      path: reopened.worktreePath,
    };

    const fabric2 = await ag10.createG10Fabric({
      runtimeRoot,
      taskId: wt.taskId,
      worktreePath: reopened.worktreePath,
      objective: "bump log",
      preferCopilotSdk: false,
    });
    const rec = fabric2.reconcileResume();
    evidence.reconcile = {
      ok: Boolean(rec.resumeBrief),
      status: rec.status,
      head: rec.reality.headSha,
      objective: rec.objective,
      files: rec.reality.changedFiles,
    };
    // Filesystem shows the edit; checkpoint must not overwrite it.
    evidence.gitOutranks = {
      ok: rec.reality.changedFiles.includes("app.js"),
      changedFiles: rec.reality.changedFiles,
    };
    await fabric2.shutdown();

    // Dead provider handle → rehydration classification
    const { classifyAgSessionContinuity } = await import(
      join(ROOT, "scripts/pathcode-cli/ag10/ag-session.mjs")
    );
    evidence.deadProvider = classifyAgSessionContinuity({
      hadLiveAgent: false,
      continueSucceeded: false,
      restartedBridge: true,
      checkpointAgTaskId: wt.taskId,
      currentTaskId: wt.taskId,
    });

    removeTaskWorktree(primary, wt.worktreePath);
    evidence.verdict =
      evidence.create.ok &&
      evidence.reopen.ok &&
      evidence.reconcile.ok &&
      evidence.gitOutranks.ok &&
      evidence.deadProvider.mode === "REHYDRATED_SESSION"
        ? "PASS"
        : "PARTIAL";

    writeFileSync(
      join(OUT, "resume-proof.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(JSON.stringify({ verdict: evidence.verdict }));
  } finally {
    try {
      rmSync(primary, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      rmSync(runtimeRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
