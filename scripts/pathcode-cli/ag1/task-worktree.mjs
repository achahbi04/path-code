/**
 * AG1/AG2 — isolated Git task worktree (primary checkout must remain untouched).
 */

import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  resolveCheckoutRoot,
  resolvePathRuntimeRoot,
} from "../paths.mjs";

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
 * @param {{ head: string | null, porcelain: string | null, ok?: boolean }} before
 * @param {{ head: string | null, porcelain: string | null, ok?: boolean }} after
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
 * Allocate a unique task id + branch name that do not already exist.
 * @param {string} primaryRoot
 * @param {string} [preferredId]
 */
export function allocateTaskIdentity(primaryRoot, preferredId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const taskId = attempt === 0 && preferredId ? preferredId : randomUUID();
    const taskBranch = `path/task-${taskId}`;
    const exists = git(primaryRoot, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${taskBranch}`,
    ]);
    if (exists.status !== 0) {
      return { taskId, taskBranch };
    }
  }
  const taskId = randomUUID();
  return { taskId, taskBranch: `path/task-${taskId}-${Date.now()}` };
}

/**
 * Create an isolated linked worktree for one engineering task.
 *
 * AG2: checks out a unique local branch `path/task-<id>` at baselineCommit
 * (sessionBaseCommit or admitted primary HEAD).
 *
 * @param {{
 *   primaryRoot: string,
 *   taskId?: string,
 *   baselineCommit?: string,
 *   tasksParent?: string,
 *   checkoutRoot?: string,
 *   runtimeRoot?: string,
 * }} input
 */
export function createTaskWorktree(input) {
  const primaryRoot = resolve(input.primaryRoot);
  const checkoutRoot = input.checkoutRoot ?? resolveCheckoutRoot();
  const runtimeRoot =
    input.runtimeRoot ??
    resolvePathRuntimeRoot({ packageRoot: checkoutRoot });
  // AG5: disposable task worktrees live under PATH_RUNTIME_ROOT (never the
  // installed package tree, which must remain a relocatable read-only asset).
  const tasksParent =
    input.tasksParent ?? join(runtimeRoot, "ag1-tasks");

  mkdirSync(tasksParent, { recursive: true });

  const before = capturePrimaryFingerprint(primaryRoot);
  if (!before.ok || !before.head) {
    return {
      ok: false,
      code: "AG1_PRIMARY_GIT_UNAVAILABLE",
      message: `Cannot read primary Git state under ${primaryRoot}`,
    };
  }

  const baselineCommit =
    typeof input.baselineCommit === "string" &&
    /^[0-9a-f]{7,40}$/i.test(input.baselineCommit.trim())
      ? input.baselineCommit.trim()
      : before.head;

  const verify = git(primaryRoot, ["cat-file", "-e", `${baselineCommit}^{commit}`]);
  if (verify.status !== 0) {
    return {
      ok: false,
      code: "AG2_BASELINE_MISSING",
      message: `Session baseline commit is not available: ${baselineCommit}`,
    };
  }

  const { taskId, taskBranch } = allocateTaskIdentity(primaryRoot, input.taskId);
  const worktreePath = join(tasksParent, taskId);

  if (existsSync(worktreePath)) {
    return {
      ok: false,
      code: "AG1_WORKTREE_EXISTS",
      message: `Task worktree path already exists: ${worktreePath}`,
    };
  }

  // Named branch at the session baseline — durable artifact; worktree is ephemeral.
  const add = git(primaryRoot, [
    "worktree",
    "add",
    "-b",
    taskBranch,
    worktreePath,
    baselineCommit,
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
    git(primaryRoot, ["worktree", "remove", "--force", worktreePath]);
    git(primaryRoot, ["branch", "-D", taskBranch]);
    return {
      ok: false,
      code: "AG1_PRIMARY_TOUCHED",
      message: "Primary checkout changed while creating the task worktree.",
    };
  }

  return {
    ok: true,
    taskId,
    taskBranch,
    worktreePath: resolve(worktreePath),
    baseline: {
      head: baselineCommit,
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
 * Task branch is preserved by default.
 *
 * @param {string} primaryRoot
 * @param {string} worktreePath
 * @param {{ prune?: boolean }} [opts]
 */
export function removeTaskWorktree(primaryRoot, worktreePath, opts = {}) {
  const before = capturePrimaryFingerprint(primaryRoot);
  const rm = git(primaryRoot, ["worktree", "remove", "--force", worktreePath]);
  if (rm.status !== 0 && existsSync(worktreePath)) {
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      // leave inspectable
    }
  }
  // AG5: never unconditionally prune — that can drop unrelated user worktrees.
  // Callers that need prune must opt in after proving only PATH-owned stale entries.
  if (opts.prune === true) {
    git(primaryRoot, ["worktree", "prune"]);
  }
  const after = capturePrimaryFingerprint(primaryRoot);
  const gone = !existsSync(worktreePath);
  return {
    ok: gone,
    code: gone ? "CLEANED" : "CLEANUP_INCOMPLETE",
    primaryUntouched: primaryUntouched(before, after),
    worktreePath,
  };
}

/**
 * List registered worktrees under the primary repo.
 * @param {string} primaryRoot
 */
export function listWorktrees(primaryRoot) {
  const listed = git(primaryRoot, ["worktree", "list", "--porcelain"]);
  if (listed.status !== 0) {
    return { ok: false, entries: [], raw: listed.stderr };
  }
  /** @type {{ path: string, head?: string, branch?: string, detached?: boolean }[]} */
  const entries = [];
  /** @type {{ path?: string, head?: string, branch?: string, detached?: boolean }} */
  let cur = {};
  for (const line of listed.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur.path) entries.push(/** @type {any} */ (cur));
      cur = { path: line.slice("worktree ".length) };
    } else if (line.startsWith("HEAD ")) {
      cur.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      cur.branch = line.slice("branch ".length);
    } else if (line === "detached") {
      cur.detached = true;
    } else if (line === "") {
      if (cur.path) entries.push(/** @type {any} */ (cur));
      cur = {};
    }
  }
  if (cur.path) entries.push(/** @type {any} */ (cur));
  return { ok: true, entries, raw: listed.stdout };
}
