/**
 * AG2 — primary checkout admission before autonomous engineering.
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
 * Admit a primary checkout for autonomous PATH engineering.
 *
 * @param {string} projectRoot
 * @returns {{
 *   ok: true,
 *   head: string,
 *   branch: string,
 *   porcelain: string,
 * } | {
 *   ok: false,
 *   code: "NOT_A_GIT_REPO" | "DETACHED_HEAD_BLOCKED" | "DIRTY_PRIMARY_TREE" | "HEAD_UNRESOLVED",
 *   message: string,
 * }}
 */
export function admitPrimaryCheckout(projectRoot) {
  const root = resolve(projectRoot);
  const inside = git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout !== "true") {
    return {
      ok: false,
      code: "NOT_A_GIT_REPO",
      message: "PATH requires a Git repository to start an autonomous task.",
    };
  }

  const head = git(root, ["rev-parse", "HEAD"]);
  if (head.status !== 0 || !/^[0-9a-f]{40}$/i.test(head.stdout)) {
    return {
      ok: false,
      code: "HEAD_UNRESOLVED",
      message: "PATH could not resolve HEAD to a commit in this project.",
    };
  }

  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch.status !== 0 || branch.stdout === "HEAD" || branch.stdout === "") {
    return {
      ok: false,
      code: "DETACHED_HEAD_BLOCKED",
      message:
        "PATH requires a checked-out branch before starting an autonomous task.",
    };
  }

  const status = git(root, ["status", "--porcelain=v1", "-uall"]);
  if (status.status !== 0) {
    return {
      ok: false,
      code: "HEAD_UNRESOLVED",
      message: "PATH could not read Git status for this project.",
    };
  }
  if (status.stdout.length > 0) {
    return {
      ok: false,
      code: "DIRTY_PRIMARY_TREE",
      branch: branch.stdout,
      message:
        "PATH found uncommitted work in this project.\n" +
        "Commit or stash those changes before starting an autonomous task.",
    };
  }

  return {
    ok: true,
    head: head.stdout,
    branch: branch.stdout,
    porcelain: "",
  };
}
