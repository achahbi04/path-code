#!/usr/bin/env node
/**
 * S1 freeze-repair proof — Terminal.app title ownership + read-only setup churn.
 * Cheap, no live provider run.
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { tmpdir } from "node:os";

import {
  formatPathTitle,
  setStablePathTitle,
  getOwnedPathTitle,
  restoreTerminalTitle,
  reclaimTtyForeground,
  stripOscTitleSequences,
  isPathTitleOwned,
} from "../../../../scripts/pathcode-cli/terminal-title.mjs";
import {
  createTaskWorktree,
  removeTaskWorktree,
  collectWorktreeResult,
  restoreIncidentalSetupChurn,
  isReadOnlyAssessmentObjective,
  capturePrimaryFingerprint,
  primaryUntouched,
} from "../../../../scripts/pathcode-cli/ag1/task-worktree.mjs";
import { commitTaskWorktree } from "../../../../scripts/pathcode-cli/ag1/task-commit.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "freeze@example.com"]);
  git(dir, ["config", "user.name", "Freeze Proof"]);
  writeFileSync(join(dir, "README.md"), "klarapp fixture\n", "utf8");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "klarapp", private: true }, null, 2) + "\n",
    "utf8",
  );
  // Minimal lockfile with the churn field operators saw (devOptional → later "dev").
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify(
      {
        name: "klarapp",
        lockfileVersion: 3,
        packages: {
          "": { name: "klarapp" },
          "node_modules/left-pad": {
            version: "1.3.0",
            resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz",
            integrity: "sha512-",
            devOptional: true,
          },
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "init"]);
}

function mutateLockfileDevOptionalToDev(lockPath) {
  const raw = readFileSync(lockPath, "utf8");
  const next = raw.replace(/"devOptional": true/g, '"dev": true');
  if (next === raw) throw new Error("expected devOptional in fixture lockfile");
  writeFileSync(lockPath, next, "utf8");
}

// ─── 1. Title ownership ─────────────────────────────────────────────────────
{
  const product = formatPathTitle("Klarapp");
  checks.push({
    id: "title_format_clean",
    ok:
      product === "Klarapp — PATH Code" &&
      !/copilot|antigravity|node|python|TMPDIR|argv/i.test(product),
    title: product,
  });

  const prevTitle = process.title;
  setStablePathTitle({ projectName: "Klarapp" });
  const owned = getOwnedPathTitle();
  const procTitle = process.title;
  // Zero-width space: Terminal.app "active process name" append is visually empty.
  const inertProcessTitle = procTitle === "\u200b";
  checks.push({
    id: "title_owned_product_string",
    ok: owned === "Klarapp — PATH Code" && isPathTitleOwned(),
    owned,
  });
  checks.push({
    id: "process_title_inert_not_product_or_runtime",
    ok:
      inertProcessTitle &&
      procTitle !== product &&
      !/copilot|python|node|TMPDIR/i.test(procTitle),
    processTitleCodepoints: [...procTitle].map((c) => c.codePointAt(0)),
  });

  // Child OSC leak must be stripped from shared streams.
  const leaked = stripOscTitleSequences(
    "hello\u001b]0;copilot TMPDIR=/var/folders/x\u0007world",
  );
  checks.push({
    id: "osc_child_title_stripped",
    ok: leaked === "helloworld" && !/copilot|TMPDIR/.test(leaked),
    leaked,
  });

  // Representative child lifecycle: spawn short-lived process, reclaim FG, title stays.
  const child = spawn(
    process.execPath,
    [
      "-e",
      "process.title='copilot'; setTimeout(()=>{}, 400);",
    ],
    { stdio: "ignore", detached: false },
  );
  const reclaimOk = reclaimTtyForeground();
  const midOwned = getOwnedPathTitle();
  const midProc = process.title;
  child.kill("SIGTERM");
  try {
    child.unref();
  } catch {
    // ignore
  }
  checks.push({
    id: "child_lifecycle_title_unchanged",
    ok:
      midOwned === "Klarapp — PATH Code" &&
      midProc === "\u200b" &&
      !/copilot|TMPDIR|python/i.test(String(midOwned)),
    midOwned,
    reclaimAttempted: typeof reclaimOk === "boolean",
    reclaimOk,
  });

  restoreTerminalTitle();
  try {
    process.title = prevTitle;
  } catch {
    // ignore
  }
}

// ─── 2. Read-only assessment: lockfile setup churn restored ─────────────────
{
  const scratch = mkdtempSync(join(tmpdir(), "s1-freeze-ro-"));
  const primary = join(scratch, "primary");
  const tasksParent = join(scratch, "tasks");
  try {
    initRepo(primary);
    const before = capturePrimaryFingerprint(primary);
    const wt = createTaskWorktree({
      primaryRoot: primary,
      tasksParent,
      checkoutRoot: join(dirname(fileURLToPath(import.meta.url)), "../../../.."),
    });
    checks.push({ id: "ro_worktree_ok", ok: wt.ok === true, code: wt.code });

    const lockPath = join(wt.worktreePath, "package-lock.json");
    mutateLockfileDevOptionalToDev(lockPath);

    const dirtyBefore = collectWorktreeResult(wt.worktreePath, wt.baseline.head);
    checks.push({
      id: "ro_lockfile_dirty_before_restore",
      ok: dirtyBefore.changedFiles.includes("package-lock.json"),
      changedFiles: dirtyBefore.changedFiles,
    });

    const objective =
      "Assess Klarapp repository health. Do not modify files. Report findings.";
    checks.push({
      id: "ro_objective_classified",
      ok: isReadOnlyAssessmentObjective(objective) === true,
    });

    const restore = restoreIncidentalSetupChurn({
      worktreePath: wt.worktreePath,
      baselineHead: wt.baseline.head,
      objective,
    });
    checks.push({
      id: "ro_restore_applied",
      ok: restore.applied === true && restore.restored.includes("package-lock.json"),
      restore,
    });

    const after = collectWorktreeResult(wt.worktreePath, wt.baseline.head);
    checks.push({
      id: "ro_diff_clean_after_restore",
      ok: after.changedFiles.length === 0 && !after.diff.trim(),
      changedFiles: after.changedFiles,
      diffLen: after.diff.length,
    });

    const committed = commitTaskWorktree({
      worktreePath: wt.worktreePath,
      message: `PATH: verified task ${wt.taskId}`,
    });
    checks.push({
      id: "ro_no_setup_only_task_commit",
      ok:
        committed.ok === true &&
        (committed.skipped === true || !committed.commitSha),
      committed: {
        ok: committed.ok,
        skipped: committed.skipped,
        commitSha: committed.commitSha || null,
        code: committed.code || null,
      },
    });

    const primaryAfter = capturePrimaryFingerprint(primary);
    checks.push({
      id: "ro_primary_untouched",
      ok: primaryUntouched(before, primaryAfter),
    });

    removeTaskWorktree(primary, wt.worktreePath);
  } finally {
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

// ─── 3. Inverse: explicit dependency update keeps lockfile ──────────────────
{
  const scratch = mkdtempSync(join(tmpdir(), "s1-freeze-up-"));
  const primary = join(scratch, "primary");
  const tasksParent = join(scratch, "tasks");
  try {
    initRepo(primary);
    const wt = createTaskWorktree({
      primaryRoot: primary,
      tasksParent,
      checkoutRoot: join(dirname(fileURLToPath(import.meta.url)), "../../../.."),
    });
    mutateLockfileDevOptionalToDev(join(wt.worktreePath, "package-lock.json"));

    const objective =
      "Upgrade dependencies and update package-lock.json to the current npm format.";
    checks.push({
      id: "upgrade_objective_not_read_only",
      ok: isReadOnlyAssessmentObjective(objective) === false,
    });

    const restore = restoreIncidentalSetupChurn({
      worktreePath: wt.worktreePath,
      baselineHead: wt.baseline.head,
      objective,
    });
    checks.push({
      id: "upgrade_no_restore",
      ok: restore.applied === false && restore.reason === "not_read_only",
      restore,
    });

    const result = collectWorktreeResult(wt.worktreePath, wt.baseline.head);
    checks.push({
      id: "upgrade_lockfile_retained",
      ok: result.changedFiles.includes("package-lock.json"),
      changedFiles: result.changedFiles,
    });

    const committed = commitTaskWorktree({
      worktreePath: wt.worktreePath,
      message: `PATH: verified task ${wt.taskId}`,
    });
    checks.push({
      id: "upgrade_task_commit_keeps_lockfile",
      ok:
        committed.ok === true &&
        committed.skipped !== true &&
        typeof committed.commitSha === "string" &&
        committed.commitSha.length >= 7,
      commitSha: committed.commitSha || null,
    });

    removeTaskWorktree(primary, wt.worktreePath);
  } finally {
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

const failed = checks.filter((c) => !c.ok);
const report = {
  phase: "S1_FREEZE_REPAIR",
  ok: failed.length === 0,
  passed: checks.filter((c) => c.ok).length,
  failed: failed.length,
  checks,
  s2: "NOT_STARTED",
};
writeFileSync(
  join(outDir, "s1-freeze-repair-proof.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8",
);
console.log(JSON.stringify({ ok: report.ok, passed: report.passed, failed: report.failed }, null, 2));
if (!report.ok) {
  console.error(failed);
  process.exit(1);
}
