/**
 * Observe primary checkout Git state for PATH engineering.
 *
 * Repository state is engineering input — not authority to refuse work.
 * Only genuinely unusable repository conditions fail closed.
 * An existing project that is not yet a Git repository is admitted as
 * unversioned bootstrap context.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 */
function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

/**
 * True when an in-progress merge/rebase/cherry-pick leaves the index unusable.
 * @param {string} root
 */
function hasUnrecoverableIndexState(root) {
  const unmerged = git(root, ["diff", "--name-only", "--diff-filter=U"]);
  if (unmerged.status === 0 && unmerged.stdout.length > 0) return true;
  for (const ref of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
    const probe = git(root, ["rev-parse", "-q", "--verify", ref]);
    if (probe.status === 0 && probe.stdout) return true;
  }
  return false;
}

/**
 * Observe a primary checkout for PATH engineering.
 *
 * Detached HEAD and ordinary dirty trees are admitted — the Gateway isolates
 * them into a task worktree. They are never user-facing BLOCKED authority.
 *
 * Unversioned existing projects are admitted for in-place bootstrap so PATH
 * can establish source control as an engineering task.
 *
 * @param {string} projectRoot
 * @returns {{
 *   ok: true,
 *   head: string | null,
 *   branch: string | null,
 *   detached: boolean,
 *   dirty: boolean,
 *   porcelain: string,
 *   unversioned: boolean,
 * } | {
 *   ok: false,
 *   code: "HEAD_UNRESOLVED" | "UNMERGED_INDEX",
 *   message: string,
 * }}
 */
export function admitPrimaryCheckout(projectRoot) {
  const root = resolve(projectRoot);
  const inside = git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout !== "true") {
    // Not-yet-Git is valid PATH project context — not BLOCKED.
    return {
      ok: true,
      head: null,
      branch: null,
      detached: false,
      dirty: true,
      porcelain: "",
      unversioned: true,
    };
  }

  const head = git(root, ["rev-parse", "HEAD"]);
  if (head.status !== 0 || !/^[0-9a-f]{40}$/i.test(head.stdout)) {
    // Unborn repository (git init, no commits yet) — treat as bootstrap.
    const unborn = git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
    if (unborn.status !== 0) {
      return {
        ok: true,
        head: null,
        branch: null,
        detached: false,
        dirty: true,
        porcelain: "",
        unversioned: true,
      };
    }
    return {
      ok: false,
      code: "HEAD_UNRESOLVED",
      message: "PATH could not resolve HEAD to a commit in this project.",
    };
  }

  if (hasUnrecoverableIndexState(root)) {
    return {
      ok: false,
      code: "UNMERGED_INDEX",
      message:
        "PATH found an in-progress merge, rebase, or conflicted index that prevents safe task isolation.",
    };
  }

  const branchProbe = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const detached =
    branchProbe.status !== 0 ||
    branchProbe.stdout === "HEAD" ||
    branchProbe.stdout === "";
  const branch = detached ? null : branchProbe.stdout;

  const status = git(root, ["status", "--porcelain=v1", "-uall"]);
  if (status.status !== 0) {
    return {
      ok: false,
      code: "HEAD_UNRESOLVED",
      message: "PATH could not read Git status for this project.",
    };
  }

  const porcelain = status.stdout;
  return {
    ok: true,
    head: head.stdout,
    branch,
    detached,
    dirty: porcelain.length > 0,
    porcelain,
    unversioned: false,
  };
}
