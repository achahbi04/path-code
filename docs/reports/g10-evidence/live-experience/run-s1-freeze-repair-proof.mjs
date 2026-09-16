#!/usr/bin/env node
/**
 * S1 freeze-repair proof — Terminal.app title ownership + read-only setup churn.
 * Cheap, no live provider run. Uses plain git repos (no git-worktree add) so
 * the finalization path is exercised without elevated host permissions.
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";

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
  collectWorktreeResult,
  restoreIncidentalSetupChurn,
  isReadOnlyAssessmentObjective,
  capturePrimaryFingerprint,
  primaryUntouched,
} from "../../../../scripts/pathcode-cli/ag1/task-worktree.mjs";
import { commitTaskWorktree } from "../../../../scripts/pathcode-cli/ag1/task-commit.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(outDir, "../../../..");
const SCRATCH_ROOT = join(REPO_ROOT, ".path-code-tmp", "s1-freeze-repair");
mkdirSync(outDir, { recursive: true });
mkdirSync(SCRATCH_ROOT, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

/**
 * Isolated task-workspace stand-in: a normal git repo at baseline HEAD.
 * Mirrors the finalization surface (collectWorktreeResult / restore /
 * commitTaskWorktree) without requiring `git worktree add`.
 */
function initTaskRepo(dir) {
  mkdirSync(dir, { recursive: true });
  const init = git(dir, ["init"]);
  if (init.status !== 0) {
    throw new Error(`git init failed: ${init.stderr || init.stdout}`);
  }
  git(dir, ["config", "user.email", "freeze@example.com"]);
  git(dir, ["config", "user.name", "Freeze Proof"]);
  writeFileSync(join(dir, "README.md"), "klarapp fixture\n", "utf8");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "klarapp", private: true }, null, 2) + "\n",
    "utf8",
  );
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
  const add = git(dir, ["add", "-A"]);
  if (add.status !== 0) {
    throw new Error(`git add failed: ${add.stderr || add.stdout}`);
  }
  const commit = git(dir, ["commit", "-m", "init"]);
  if (commit.status !== 0) {
    throw new Error(`init commit failed: ${commit.stderr || commit.stdout}`);
  }
  const head = git(dir, ["rev-parse", "HEAD"]);
  if (head.status !== 0 || !head.stdout.trim()) {
    throw new Error("rev-parse HEAD failed");
  }
  return head.stdout.trim();
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

  const leaked = stripOscTitleSequences(
    "hello\u001b]0;copilot TMPDIR=/var/folders/x\u0007world",
  );
  checks.push({
    id: "osc_child_title_stripped",
    ok: leaked === "helloworld" && !/copilot|TMPDIR/.test(leaked),
    leaked,
  });

  const child = spawn(
    process.execPath,
    ["-e", "process.title='copilot'; setTimeout(()=>{}, 400);"],
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
  const scratch = mkdtempSync(join(SCRATCH_ROOT, "ro-"));
  const taskWs = join(scratch, "task");
  const primaryProbe = join(scratch, "primary-probe");
  try {
    mkdirSync(primaryProbe, { recursive: true });
    writeFileSync(join(primaryProbe, "KEEP.txt"), "primary\n", "utf8");
    const before = capturePrimaryFingerprint(primaryProbe);

    const baselineHead = initTaskRepo(taskWs);
    const lockPath = join(taskWs, "package-lock.json");
    mutateLockfileDevOptionalToDev(lockPath);

    const dirtyBefore = collectWorktreeResult(taskWs, baselineHead);
    checks.push({
      id: "ro_lockfile_dirty_before_restore",
      ok: dirtyBefore.changedFiles.includes("package-lock.json"),
      changedFiles: dirtyBefore.changedFiles,
      baselineHead,
    });

    const objective =
      "Assess Klarapp repository health. Do not modify files. Report findings.";
    checks.push({
      id: "ro_objective_classified",
      ok: isReadOnlyAssessmentObjective(objective) === true,
    });

    const restore = restoreIncidentalSetupChurn({
      worktreePath: taskWs,
      baselineHead,
      objective,
    });
    checks.push({
      id: "ro_restore_applied",
      ok:
        restore.applied === true &&
        restore.restored.includes("package-lock.json"),
      restore,
    });

    const after = collectWorktreeResult(taskWs, baselineHead);
    checks.push({
      id: "ro_diff_clean_after_restore",
      ok: after.changedFiles.length === 0 && !after.diff.trim(),
      changedFiles: after.changedFiles,
      diffLen: after.diff.length,
    });

    const committed = commitTaskWorktree({
      worktreePath: taskWs,
      message: "PATH: verified task freeze-ro",
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

    const primaryAfter = capturePrimaryFingerprint(primaryProbe);
    checks.push({
      id: "ro_primary_untouched",
      ok: primaryUntouched(before, primaryAfter),
    });
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
  const scratch = mkdtempSync(join(SCRATCH_ROOT, "up-"));
  const taskWs = join(scratch, "task");
  try {
    const baselineHead = initTaskRepo(taskWs);
    mutateLockfileDevOptionalToDev(join(taskWs, "package-lock.json"));

    const objective =
      "Upgrade dependencies and update package-lock.json to the current npm format.";
    checks.push({
      id: "upgrade_objective_not_read_only",
      ok: isReadOnlyAssessmentObjective(objective) === false,
    });

    const restore = restoreIncidentalSetupChurn({
      worktreePath: taskWs,
      baselineHead,
      objective,
    });
    checks.push({
      id: "upgrade_no_restore",
      ok: restore.applied === false && restore.reason === "not_read_only",
      restore,
    });

    const result = collectWorktreeResult(taskWs, baselineHead);
    checks.push({
      id: "upgrade_lockfile_retained",
      ok: result.changedFiles.includes("package-lock.json"),
      changedFiles: result.changedFiles,
    });

    const committed = commitTaskWorktree({
      worktreePath: taskWs,
      message: "PATH: verified task freeze-upgrade",
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
console.log(
  JSON.stringify(
    { ok: report.ok, passed: report.passed, failed: report.failed },
    null,
    2,
  ),
);
if (!report.ok) {
  console.error(failed);
  process.exit(1);
}
