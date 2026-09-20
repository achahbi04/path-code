/**
 * S5 — adopt an engineer task result into the authoritative Build product revision.
 * Uses git merge of path/task-* into path-build/<buildId> (same pattern as PATH Code /merge).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { markTaskMerged } from "../result-lifecycle.mjs";
import { resolveGitIdentity } from "../ag1/task-commit.mjs";

/**
 * True when the Build folder has no product files yet (only .git / noise).
 * @param {string} root
 */
export function isEmptyProductTree(root) {
  const dir = resolve(String(root || ""));
  if (!dir || !existsSync(dir)) return true;
  try {
    const entries = readdirSync(dir).filter(
      (n) => n !== ".git" && n !== ".DS_Store" && n !== ".gitignore",
    );
    return entries.length === 0;
  } catch {
    return true;
  }
}

/**
 * @param {string} cwd
 * @param {string} sha
 */
function gitObjectExists(cwd, sha) {
  if (!sha) return false;
  const r = git(cwd, ["cat-file", "-t", sha]);
  return r.status === 0 && Boolean(String(r.stdout || "").trim());
}

/**
 * Recover a missing source commit into the Build repo (handles nested `git init`
 * inside the task worktree — a common greenfield engine mistake).
 * @param {string} root
 * @param {string} sourceSha
 * @param {string | null} worktreePath
 * @param {string | null} taskBranch
 * @returns {{ ok: true, recoveredFrom: string } | { ok: false, code: string, message: string }}
 */
function recoverSourceShaIntoBuild(root, sourceSha, worktreePath, taskBranch) {
  if (gitObjectExists(root, sourceSha)) {
    return { ok: true, recoveredFrom: "already_present" };
  }
  const wt = worktreePath ? resolve(worktreePath) : null;
  if (!wt || !existsSync(wt)) {
    return {
      ok: false,
      code: "SOURCE_SHA_MISSING",
      message: `Engineer commit ${sourceSha.slice(0, 12)} is not in the Build repo and the task worktree is gone.`,
    };
  }

  /** @type {string[]} */
  const remotes = [wt];
  const nestedGit = join(wt, ".git");
  if (existsSync(nestedGit)) remotes.push(nestedGit);

  for (const remote of remotes) {
    const fetched = git(root, ["fetch", "--no-tags", remote, sourceSha]);
    if (fetched.status === 0 && gitObjectExists(root, sourceSha)) {
      if (taskBranch) {
        git(root, ["branch", "-f", taskBranch, sourceSha]);
      }
      return { ok: true, recoveredFrom: remote };
    }
  }

  // Last resort: if worktree has product files but orphaned nested history, stage a
  // commit on the task branch from the worktree tree (without re-init).
  try {
    const entries = readdirSync(wt).filter(
      (n) => n !== ".git" && n !== ".DS_Store",
    );
    if (entries.length > 0 && taskBranch) {
      const add = git(wt, ["--git-dir", join(root, ".git"), "--work-tree", wt, "add", "-A"]);
      if (add.status === 0) {
        const commit = git(
          wt,
          [
            "--git-dir",
            join(root, ".git"),
            "--work-tree",
            wt,
            "commit",
            "-m",
            `PATH Build recover engineer worktree ${taskBranch}`,
            "--allow-empty=false",
          ],
          { env: buildCommitEnv(root) },
        );
        if (commit.status === 0) {
          const head = gitHeadSha(root);
          if (head) {
            git(root, ["branch", "-f", taskBranch, head]);
            return { ok: true, recoveredFrom: "worktree_restage" };
          }
        }
      }
    }
  } catch {
    /* fall through */
  }

  return {
    ok: false,
    code: "SOURCE_SHA_UNREACHABLE",
    message: `Could not recover engineer commit ${sourceSha.slice(0, 12)} into the Build repo.`,
  };
}

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

  if (sourceSha && !gitObjectExists(root, sourceSha)) {
    const recovered = recoverSourceShaIntoBuild(
      root,
      sourceSha,
      typeof input.worktreePath === "string" ? input.worktreePath : null,
      taskBranch,
    );
    if (!recovered.ok) return recovered;
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

  // Honest empty adoption: claimed engineer SHA never landed in the product tree.
  if (
    sourceSha &&
    beforeSha &&
    adoptedSha &&
    beforeSha === adoptedSha &&
    sourceSha !== adoptedSha &&
    !gitObjectExists(root, sourceSha)
  ) {
    return {
      ok: false,
      code: "EMPTY_ADOPTION",
      message:
        "Adoption merge did not advance HEAD and the engineer commit is still missing from the Build repo.",
      beforeSha,
      sourceSha,
      adoptedSha,
    };
  }

  if (isEmptyProductTree(root) && sourceSha && sourceSha !== adoptedSha) {
    return {
      ok: false,
      code: "EMPTY_PRODUCT_TREE",
      message:
        "Adoption left an empty Build product tree (no files beyond .git). Engineer result was not applied.",
      beforeSha,
      sourceSha,
      adoptedSha,
    };
  }

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
