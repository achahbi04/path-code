/** S2 Git product adoption mechanics, independent of task lifecycle. */

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";

function git(root, args) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  const result = spawnSync("git", args, {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000, env,
  });
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

/**
 * Move a clean product checkout to a prepared Git source. Callers validate
 * their own source authority; this primitive never writes a task checkpoint.
 * Normal task adoption retains Git's existing merge behavior. Historical
 * restore requires an exact expected HEAD and a fast-forward candidate.
 */
export function adoptProductCommit({ projectRoot, sourceRef, expectedHeadSha = null,
  expectedBranch = null, expectedTreeSha = null, fastForwardOnly = false }) {
  const top = git(projectRoot, ["rev-parse", "--show-toplevel"]);
  let canonicalRoot;
  let canonicalTop;
  try { canonicalRoot = realpathSync(projectRoot); canonicalTop = realpathSync(top.stdout); }
  catch { return { ok: false, code: "PROJECT_GIT_UNAVAILABLE" }; }
  if (top.status !== 0 || canonicalTop !== canonicalRoot) {
    return { ok: false, code: "PROJECT_BINDING_MISMATCH" };
  }
  const current = git(projectRoot, ["rev-parse", "HEAD"]);
  if (current.status !== 0) return { ok: false, code: "GIT_HEAD_FAILED" };
  if (expectedHeadSha && current.stdout !== expectedHeadSha) {
    return { ok: false, code: "STALE_AUTHORITY", beforeSha: current.stdout };
  }
  if (expectedBranch) {
    const branch = git(projectRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    if (branch.status !== 0 || branch.stdout !== expectedBranch) {
      return { ok: false, code: "PRODUCT_BRANCH_MISMATCH" };
    }
  }
  const dirty = git(projectRoot, ["status", "--porcelain=v1", "-uall"]);
  if (dirty.status !== 0) return { ok: false, code: "GIT_STATUS_FAILED", message: dirty.stderr || dirty.stdout };
  if (dirty.stdout) return { ok: false, code: "PRIMARY_DIRTY" };

  const merged = git(projectRoot, fastForwardOnly
    ? ["merge", "--ff-only", sourceRef]
    : ["merge", "--no-edit", sourceRef]);
  if (merged.status !== 0) {
    if (!fastForwardOnly) git(projectRoot, ["merge", "--abort"]);
    return { ok: false, code: "MERGE_FAILED", message: merged.stderr || merged.stdout,
      beforeSha: current.stdout };
  }
  const after = git(projectRoot, ["rev-parse", "HEAD"]);
  if (after.status !== 0) return { ok: false, code: "GIT_HEAD_FAILED", beforeSha: current.stdout };
  if (fastForwardOnly && after.stdout !== sourceRef) {
    return { ok: false, code: "ADOPTION_HEAD_MISMATCH", beforeSha: current.stdout };
  }
  if (expectedTreeSha) {
    const tree = git(projectRoot, ["rev-parse", "HEAD^{tree}"]);
    const clean = git(projectRoot, ["status", "--porcelain=v1", "-uall"]);
    if (tree.status !== 0 || tree.stdout !== expectedTreeSha || clean.status !== 0 || clean.stdout) {
      return { ok: false, code: "ADOPTION_TREE_MISMATCH", beforeSha: current.stdout,
        adoptedSha: after.stdout };
    }
  }
  return { ok: true, beforeSha: current.stdout, adoptedSha: after.stdout };
}
