/**
 * AG1 — isolated Git task worktree (primary checkout must remain untouched).
 */

import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { resolveCheckoutRoot } from "../paths.mjs";

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 * @param {{ timeoutMs?: number }} [opts]
 */
function git(cwd, args, opts = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 60_000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trimEnd(),
    stderr: (result.stderr || "").trimEnd(),
    error: result.error ?? null,
  };
}

/**
 * @param {string} repoRoot
 */
export function capturePrimaryFingerprint(repoRoot) {
  const head = git(repoRoot, ["rev-parse", "HEAD"]);
  const status = git(repoRoot, ["status", "--porcelain=v1", "-uall"]);
  const branch = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    head: head.status === 0 ? head.stdout.trim() : null,
    branch: branch.status === 0 ? branch.stdout.trim() : null,
    porcelain: status.status === 0 ? status.stdout : null,
    ok: head.status === 0 && status.status === 0,
  };
}

/**
 * @param {{ head: string | null, porcelain: string | null }} before
 * @param {{ head: string | null, porcelain: string | null }} after
 */
export function primaryUntouched(before, after) {
  return (
    before.ok !== false &&
    after.ok !== false &&
    before.head === after.head &&
    before.porcelain === after.porcelain
  );
}

/**
 * Create an isolated linked worktree for one engineering task.
 *
 * @param {{
 *   primaryRoot: string,
 *   taskId?: string,
 *   tasksParent?: string,
 *   checkoutRoot?: string,
 * }} input
 */
export function createTaskWorktree(input) {
  const primaryRoot = resolve(input.primaryRoot);
  const checkoutRoot = input.checkoutRoot ?? resolveCheckoutRoot();
  const taskId = input.taskId ?? randomUUID();
  const tasksParent =
    input.tasksParent ??
    join(checkoutRoot, ".path-code-tmp", "ag1-tasks");

  mkdirSync(tasksParent, { recursive: true });
  const worktreePath = join(tasksParent, taskId);

  if (existsSync(worktreePath)) {
    return {
      ok: false,
      code: "AG1_WORKTREE_EXISTS",
      message: `Task worktree path already exists: ${worktreePath}`,
    };
  }

  const before = capturePrimaryFingerprint(primaryRoot);
  if (!before.ok || !before.head) {
    return {
      ok: false,
      code: "AG1_PRIMARY_GIT_UNAVAILABLE",
      message: `Cannot read primary Git state under ${primaryRoot}`,
    };
  }

  // Detached worktree at the primary HEAD — isolate all agent edits.
  const add = git(primaryRoot, [
    "worktree",
    "add",
    "--detach",
    worktreePath,
    before.head,
  ]);
  if (add.status !== 0) {
    return {
      ok: false,
      code: "AG1_WORKTREE_ADD_FAILED",
      message: add.stderr || add.stdout || "git worktree add failed",
    };
  }

  const after = capturePrimaryFingerprint(primaryRoot);
  if (!primaryUntouched(before, after)) {
    // Best-effort cleanup
    git(primaryRoot, ["worktree", "remove", "--force", worktreePath]);
    return {
      ok: false,
      code: "AG1_PRIMARY_TOUCHED",
      message: "Primary checkout changed while creating the task worktree.",
    };
  }

  return {
    ok: true,
    taskId,
    worktreePath: resolve(worktreePath),
    baseline: {
      head: before.head,
      branch: before.branch,
      porcelain: before.porcelain,
    },
    primaryBefore: before,
  };
}

/**
 * Collect final Git evidence from the task worktree.
 * @param {string} worktreePath
 * @param {string} baselineHead
 */
export function collectWorktreeResult(worktreePath, baselineHead) {
  const status = git(worktreePath, ["status", "--porcelain=v1", "-uall"]);
  const diff = git(worktreePath, ["diff", "--no-ext-diff", baselineHead]);
  const diffStat = git(worktreePath, [
    "diff",
    "--stat",
    "--no-ext-diff",
    baselineHead,
  ]);
  const nameOnly = git(worktreePath, [
    "diff",
    "--name-only",
    "--no-ext-diff",
    baselineHead,
  ]);
  const untracked = git(worktreePath, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);

  const changedFiles = [
    ...new Set([
      ...(nameOnly.status === 0
        ? nameOnly.stdout.split("\n").filter(Boolean)
        : []),
      ...(untracked.status === 0
        ? untracked.stdout.split("\n").filter(Boolean)
        : []),
    ]),
  ].sort();

  return {
    ok: status.status === 0,
    porcelain: status.status === 0 ? status.stdout : "",
    diff: diff.status === 0 ? diff.stdout : "",
    diffStat: diffStat.status === 0 ? diffStat.stdout : "",
    changedFiles,
  };
}

/**
 * Remove a task worktree (best effort). Leaves primary untouched.
 * @param {string} primaryRoot
 * @param {string} worktreePath
 */
export function removeTaskWorktree(primaryRoot, worktreePath) {
  const before = capturePrimaryFingerprint(primaryRoot);
  const rm = git(primaryRoot, ["worktree", "remove", "--force", worktreePath]);
  if (rm.status !== 0 && existsSync(worktreePath)) {
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      // leave inspectable
    }
    git(primaryRoot, ["worktree", "prune"]);
  }
  const after = capturePrimaryFingerprint(primaryRoot);
  return {
    ok: rm.status === 0 || !existsSync(worktreePath),
    primaryUntouched: primaryUntouched(before, after),
  };
}
