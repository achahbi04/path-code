/**
 * AG2 — durable task commits + Git identity (never invents author identity).
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
function git(cwd, args, opts = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      ...(opts.env || {}),
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

/**
 * Resolve usable Git author identity from the worktree/repo config.
 * Does not invent a user identity.
 *
 * @param {string} worktreePath
 * @returns {{ ok: true, name: string, email: string } | { ok: false, code: "GIT_IDENTITY_REQUIRED", message: string }}
 */
export function resolveGitIdentity(worktreePath) {
  const root = resolve(worktreePath);
  const name = git(root, ["config", "--get", "user.name"]);
  const email = git(root, ["config", "--get", "user.email"]);
  const n = name.status === 0 ? name.stdout.trim() : "";
  const e = email.status === 0 ? email.stdout.trim() : "";
  if (!n || !e) {
    return {
      ok: false,
      code: "GIT_IDENTITY_REQUIRED",
      message:
        "PATH needs a local Git identity to commit this task.\n" +
        'Configure with: git config user.name "Your Name" && git config user.email "you@example.com"',
    };
  }
  return { ok: true, name: n, email: e };
}

/**
 * Stage all task-worktree changes and create a local commit.
 *
 * @param {{
 *   worktreePath: string,
 *   message: string,
 *   allowEmpty?: boolean,
 * }} input
 */
export function commitTaskWorktree(input) {
  const worktreePath = resolve(input.worktreePath);
  const identity = resolveGitIdentity(worktreePath);
  if (!identity.ok) return identity;

  const status = git(worktreePath, ["status", "--porcelain=v1", "-uall"]);
  if (status.status !== 0) {
    return {
      ok: false,
      code: "GIT_STATUS_FAILED",
      message: status.stderr || "git status failed in task worktree",
    };
  }
  const dirty = status.stdout.length > 0;
  if (!dirty && !input.allowEmpty) {
    return {
      ok: true,
      skipped: true,
      reason: "clean",
      commitSha: null,
    };
  }

  const add = git(worktreePath, ["add", "-A"]);
  if (add.status !== 0) {
    return {
      ok: false,
      code: "GIT_STAGE_FAILED",
      message: add.stderr || "git add failed",
    };
  }

  const commit = git(
    worktreePath,
    ["commit", "-m", input.message],
    {
      env: {
        GIT_AUTHOR_NAME: identity.name,
        GIT_AUTHOR_EMAIL: identity.email,
        GIT_COMMITTER_NAME: identity.name,
        GIT_COMMITTER_EMAIL: identity.email,
      },
    },
  );
  if (commit.status !== 0) {
    return {
      ok: false,
      code: "GIT_COMMIT_FAILED",
      message: commit.stderr || commit.stdout || "git commit failed",
    };
  }

  const sha = git(worktreePath, ["rev-parse", "HEAD"]);
  const clean = git(worktreePath, ["status", "--porcelain=v1", "-uall"]);
  return {
    ok: true,
    skipped: false,
    commitSha: sha.status === 0 ? sha.stdout : null,
    worktreeClean: clean.status === 0 && clean.stdout === "",
    branch: git(worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout,
  };
}
