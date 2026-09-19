/**
 * S5 — adopt an engineer task result into the authoritative Build product revision.
 * Uses git merge of path/task-* into path-build/<buildId> (same pattern as PATH Code /merge).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { markTaskMerged } from "../result-lifecycle.mjs";
import { resolveGitIdentity } from "../ag1/task-commit.mjs";

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
function git(cwd, args, opts = {}) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    env: {
      ...process.env,
      ...(opts.env || {}),
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
}

/**
 * Identity for Build-origin empty commits. Prefer local git config; else Build-local.
 * @param {string} root
 */
function buildCommitEnv(root) {
  const id = resolveGitIdentity(root);
  if (id.ok) {
    return {
      GIT_AUTHOR_NAME: id.name,
      GIT_AUTHOR_EMAIL: id.email,
      GIT_COMMITTER_NAME: id.name,
      GIT_COMMITTER_EMAIL: id.email,
    };
  }
  return {
    GIT_AUTHOR_NAME: "PATH Build",
    GIT_AUTHOR_EMAIL: "path-build@localhost",
    GIT_COMMITTER_NAME: "PATH Build",
    GIT_COMMITTER_EMAIL: "path-build@localhost",
  };
}

/**
 * @param {string} cwd
 */
export function gitHeadSha(cwd) {
  const r = git(cwd, ["rev-parse", "HEAD"]);
  if (r.status !== 0) return null;
  return String(r.stdout || "").trim() || null;
}

/**
 * @param {string} cwd
 */
export function gitBranch(cwd) {
  const r = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (r.status !== 0) return null;
  const b = String(r.stdout || "").trim();
  return b && b !== "HEAD" ? b : null;
}

/**
 * Ensure Build product branch exists and is checked out on projectRoot.
 * Creates an initial empty commit when the repo has no HEAD yet.
 *
 * @param {{
 *   projectRoot: string,
 *   productBranch: string,
 * }} input
 */
export function ensureBuildProductBranch(input) {
  const root = resolve(input.projectRoot);
  const branch = String(input.productBranch || "").trim();
  if (!root || !existsSync(root) || !branch) {
    return {
      ok: false,
      code: "ADOPT_ARGS",
      message: "projectRoot and productBranch required",
    };
  }
  if (!existsSync(resolve(root, ".git"))) {
    return {
      ok: false,
      code: "NOT_A_GIT_REPO",
      message: "Build product root is not a git repository",
    };
  }

  const head = git(root, ["rev-parse", "--verify", "HEAD"]);
  if (head.status !== 0) {
    // Empty repo — seed so worktrees and merges work.
    git(root, ["checkout", "-B", branch]);
    const commit = git(
      root,
      ["commit", "--allow-empty", "-m", `PATH Build origin ${branch}`],
      { env: buildCommitEnv(root) },
    );
    if (commit.status !== 0) {
      return {
        ok: false,
        code: "ORIGIN_EMPTY_COMMIT_FAILED",
        message: (commit.stderr || commit.stdout || "empty commit failed").trim(),
      };
    }
    return {
      ok: true,
      projectRoot: root,
      productBranch: branch,
      authoritativeSha: gitHeadSha(root),
      seeded: true,
    };
  }

  const current = gitBranch(root);
  const hasBranch = git(root, ["show-ref", "--verify", `refs/heads/${branch}`]);
  if (hasBranch.status !== 0) {
    const create = git(root, ["branch", branch]);
    if (create.status !== 0) {
      return {
        ok: false,
        code: "BRANCH_CREATE_FAILED",
        message: (create.stderr || create.stdout || "branch create failed").trim(),
      };
    }
  }
  if (current !== branch) {
    const dirty = git(root, ["status", "--porcelain=v1", "-uall"]);
    if (dirty.status === 0 && String(dirty.stdout || "").trim()) {
      // Prefer staying on dirty tree only if already on product branch; otherwise refuse.
      return {
        ok: false,
        code: "PRIMARY_DIRTY",
        message: `Cannot switch to ${branch}: working tree dirty`,
      };
    }
    const co = git(root, ["checkout", branch]);
    if (co.status !== 0) {
      return {
        ok: false,
        code: "CHECKOUT_FAILED",
        message: (co.stderr || co.stdout || "checkout failed").trim(),
      };
    }
  }

  return {
    ok: true,
    projectRoot: root,
    productBranch: branch,
    authoritativeSha: gitHeadSha(root),
    seeded: false,
  };
}

/**
 * Merge a task branch/SHA into the Build product branch at projectRoot.
 *
 * @param {{
 *   runtimeRoot: string,
 *   buildId: string,
 *   projectRoot: string,
 *   productBranch: string,
 *   taskId: string,
 *   taskBranch?: string | null,
 *   sourceSha?: string | null,
 *   worktreePath?: string | null,
 * }} input
 */
export function adoptEngineerResultIntoBuild(input) {
  const root = resolve(input.projectRoot);
  const productBranch = String(input.productBranch || "").trim();
  const taskId = String(input.taskId || "").trim();
  const taskBranch =
    typeof input.taskBranch === "string" && input.taskBranch.trim()
      ? input.taskBranch.trim()
      : null;
  const sourceSha =
    typeof input.sourceSha === "string" && input.sourceSha.trim()
      ? input.sourceSha.trim()
      : null;

  const ensured = ensureBuildProductBranch({
    projectRoot: root,
    productBranch,
  });
  if (!ensured.ok) return ensured;

  // In-place / unversioned engineering: already on product tree — record adoption of HEAD.
  if (
    (!taskBranch || taskBranch === productBranch) &&
    (!input.worktreePath || resolve(input.worktreePath) === root)
  ) {
    const sha = gitHeadSha(root);
    return {
      ok: true,
      mode: "inplace",
      buildId: input.buildId,
      taskId,
      sourceSha: sourceSha || sha,
      adoptedSha: sha,
      productBranch,
      projectRoot: root,
      adoptedAt: new Date().toISOString(),
    };
  }

  if (!taskBranch || !/^path\/task-/.test(taskBranch)) {
    // No task branch — if sourceSha exists on primary, still record HEAD as adopted.
    if (sourceSha) {
      return {
        ok: true,
        mode: "sha_recorded",
        buildId: input.buildId,
        taskId,
        sourceSha,
        adoptedSha: gitHeadSha(root),
        productBranch,
        projectRoot: root,
        adoptedAt: new Date().toISOString(),
        note: "no path/task-* branch; recorded current HEAD",
      };
    }
    return {
      ok: false,
      code: "NO_TASK_BRANCH",
      message: "Engineer result has no adoptable path/task-* branch",
    };
  }

  const dirty = git(root, ["status", "--porcelain=v1", "-uall"]);
  if (dirty.status === 0 && String(dirty.stdout || "").trim()) {
    return {
      ok: false,
      code: "PRIMARY_DIRTY",
      message: "Cannot adopt: Build product tree is dirty",
    };
  }

  const beforeSha = gitHeadSha(root);
  const merged = git(root, ["merge", "--no-edit", taskBranch]);
  if (merged.status !== 0) {
    // Attempt abort to leave tree clean
    git(root, ["merge", "--abort"]);
    return {
      ok: false,
      code: "MERGE_FAILED",
      message: (merged.stderr || merged.stdout || "git merge failed").trim(),
      beforeSha,
    };
  }

  const adoptedSha = gitHeadSha(root);
  try {
    markTaskMerged({
      runtimeRoot: input.runtimeRoot,
      projectRoot: root,
      entry: {
        taskId,
        branch: taskBranch,
        sha: sourceSha || adoptedSha,
        worktreePath: input.worktreePath || null,
      },
    });
  } catch {
    /* best-effort lifecycle mark */
  }

  return {
    ok: true,
    mode: "merge",
    buildId: input.buildId,
    taskId,
    sourceSha: sourceSha || null,
    adoptedSha,
    beforeSha,
    productBranch,
    projectRoot: root,
    taskBranch,
    adoptedAt: new Date().toISOString(),
  };
}
