/**
 * S2.2 — durable task result lifecycle (adopt | discard | PR).
 * Extends checkpoint metadata; never invents a second state store.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  createCheckpointSkeleton,
  readTaskCheckpoint,
  writeTaskCheckpoint,
} from "./ag10/task-checkpoint.mjs";
import {
  capturePrimaryFingerprint,
  primaryUntouched,
  removeTaskWorktree,
} from "./ag1/task-worktree.mjs";
import {
  assertGithubCliReady,
  assertWritePermission,
  resolveGithubRemoteTarget,
} from "./ag4/remote.mjs";
import { publishVerifiedResult } from "./ag4/publish.mjs";

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 */
function git(cwd, args) {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
  };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env,
    timeout: 60_000,
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
}

/**
 * @param {any} checkpoint
 * @returns {{
 *   status: string | null,
 *   discardedAt: string | null,
 *   mergedAt: string | null,
 *   prUrl: string | null,
 *   prNumber: number | null,
 *   prRemote: string | null,
 *   prBase: string | null,
 *   updatedAt: string | null,
 * }}
 */
export function readLifecycleFromCheckpoint(checkpoint) {
  const raw =
    checkpoint &&
    typeof checkpoint === "object" &&
    checkpoint.resultLifecycle &&
    typeof checkpoint.resultLifecycle === "object"
      ? checkpoint.resultLifecycle
      : null;
  if (!raw) {
    return {
      status: null,
      discardedAt: null,
      mergedAt: null,
      prUrl: null,
      prNumber: null,
      prRemote: null,
      prBase: null,
      updatedAt: null,
    };
  }
  return {
    status: typeof raw.status === "string" ? raw.status : null,
    discardedAt: typeof raw.discardedAt === "string" ? raw.discardedAt : null,
    mergedAt: typeof raw.mergedAt === "string" ? raw.mergedAt : null,
    prUrl: typeof raw.prUrl === "string" ? raw.prUrl : null,
    prNumber: typeof raw.prNumber === "number" ? raw.prNumber : null,
    prRemote: typeof raw.prRemote === "string" ? raw.prRemote : null,
    prBase: typeof raw.prBase === "string" ? raw.prBase : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

/**
 * Persist lifecycle onto the durable checkpoint (create skeleton if needed).
 * Preserves report/history; does not delete checkpoint or report files.
 *
 * @param {{
 *   runtimeRoot: string,
 *   taskId: string,
 *   projectRoot?: string | null,
 *   entry?: any,
 *   patch: Record<string, unknown>,
 * }} opts
 */
export function writeResultLifecycle(opts) {
  const taskId = String(opts.taskId || "").trim();
  if (!taskId) {
    return { ok: false, code: "MISSING_TASK", message: "taskId required" };
  }
  const existing = readTaskCheckpoint(opts.runtimeRoot, taskId);
  const entry = opts.entry || {};
  const prev = readLifecycleFromCheckpoint(existing);
  const now = new Date().toISOString();
  const nextLife = {
    ...prev,
    ...opts.patch,
    updatedAt: now,
  };
  if (typeof nextLife.status === "string") {
    nextLife.status = String(nextLife.status).toUpperCase();
  }
  const worktreePath =
    (existing && typeof existing.worktreePath === "string" && existing.worktreePath) ||
    (typeof entry.worktreePath === "string" && entry.worktreePath) ||
    join(opts.runtimeRoot, "ag1-tasks", taskId);
  const base = existing
    ? { ...existing }
    : createCheckpointSkeleton({
        taskId,
        worktreePath,
        repoRoot:
          (typeof opts.projectRoot === "string" && opts.projectRoot) ||
          (typeof entry.repoRoot === "string" ? entry.repoRoot : undefined),
        objective:
          typeof entry.objective === "string" ? entry.objective : undefined,
        finalState:
          typeof entry.finalState === "string" ? entry.finalState : undefined,
      });
  base.resultLifecycle = nextLife;
  if (typeof opts.projectRoot === "string" && opts.projectRoot) {
    base.repoRoot = opts.projectRoot;
  }
  const path = writeTaskCheckpoint(opts.runtimeRoot, base);
  return { ok: true, path, lifecycle: nextLife };
}

/**
 * Delete a local path/task-* branch without checking it out on primary.
 * @param {string} projectRoot
 * @param {string} branch
 */
export function deleteLocalTaskBranch(projectRoot, branch) {
  const name = String(branch || "").trim();
  if (!name || !/^path\/task-/.test(name)) {
    return { ok: false, code: "INVALID_BRANCH", message: "Not a PATH task branch." };
  }
  const current = git(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (current.status === 0 && current.stdout === name) {
    return {
      ok: false,
      code: "BRANCH_CHECKED_OUT",
      message:
        "Task branch is checked out on the primary checkout; refuse to delete.",
    };
  }
  const exists = git(projectRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${name}`,
  ]);
  if (exists.status !== 0) {
    return { ok: true, skipped: true, code: "BRANCH_ABSENT" };
  }
  const del = git(projectRoot, ["branch", "-D", name]);
  if (del.status !== 0) {
    return {
      ok: false,
      code: "BRANCH_DELETE_FAILED",
      message: (del.stderr || del.stdout || "git branch -D failed").slice(0, 400),
    };
  }
  return { ok: true, skipped: false, code: "BRANCH_DELETED" };
}

/**
 * Abandon a durable task result: clean worktree/branch, never touch primary
 * content, preserve report/checkpoint with DISCARDED lifecycle.
 *
 * @param {{
 *   runtimeRoot: string,
 *   projectRoot: string,
 *   entry: NonNullable<any>,
 * }} opts
 */
export function discardTaskResult(opts) {
  const { runtimeRoot, projectRoot, entry } = opts;
  const before = capturePrimaryFingerprint(projectRoot);
  /** @type {string[]} */
  const steps = [];

  const life = readLifecycleFromCheckpoint(
    readTaskCheckpoint(runtimeRoot, entry.taskId),
  );
  if (life.status === "DISCARDED") {
    return {
      ok: true,
      already: true,
      code: "ALREADY_DISCARDED",
      message: "Task result is already marked discarded.",
      primaryUntouched: true,
      steps,
    };
  }
  if (life.status === "MERGED") {
    return {
      ok: false,
      code: "ALREADY_MERGED",
      message:
        "Task result was already merged into primary. Discard refuses to rewrite history.",
      primaryUntouched: true,
      steps,
    };
  }

  const wt =
    typeof entry.worktreePath === "string" && entry.worktreePath.trim()
      ? entry.worktreePath.trim()
      : null;
  if (wt && existsSync(wt)) {
    const cleaned = removeTaskWorktree(projectRoot, wt, { prune: false });
    steps.push(
      cleaned.ok
        ? `worktree cleaned: ${wt}`
        : `worktree cleanup incomplete: ${wt}`,
    );
    if (cleaned.primaryUntouched === false) {
      return {
        ok: false,
        code: "PRIMARY_TOUCHED",
        message: "Discard aborted: primary checkout changed during worktree cleanup.",
        primaryUntouched: false,
        steps,
      };
    }
  } else {
    steps.push("worktree already absent");
  }

  const branch =
    typeof entry.branch === "string" && entry.branch.trim()
      ? entry.branch.trim()
      : null;
  if (branch) {
    const del = deleteLocalTaskBranch(projectRoot, branch);
    if (!del.ok) {
      return {
        ok: false,
        code: del.code,
        message: del.message,
        primaryUntouched: primaryUntouched(
          before,
          capturePrimaryFingerprint(projectRoot),
        ),
        steps,
      };
    }
    steps.push(
      del.skipped
        ? `branch already absent: ${branch}`
        : `local branch deleted: ${branch}`,
    );
  } else {
    steps.push("no local task branch recorded");
  }

  const after = capturePrimaryFingerprint(projectRoot);
  const untouched = primaryUntouched(before, after);
  if (!untouched) {
    return {
      ok: false,
      code: "PRIMARY_TOUCHED",
      message: "Discard refused to finish: primary checkout was modified.",
      primaryUntouched: false,
      steps,
    };
  }

  const marked = writeResultLifecycle({
    runtimeRoot,
    taskId: entry.taskId,
    projectRoot,
    entry,
    patch: {
      status: "DISCARDED",
      discardedAt: new Date().toISOString(),
    },
  });
  if (!marked.ok) {
    return {
      ok: false,
      code: marked.code || "CHECKPOINT_WRITE_FAILED",
      message: marked.message || "Could not persist DISCARDED state.",
      primaryUntouched: true,
      steps,
    };
  }
  steps.push("durable result marked DISCARDED (report retained)");

  return {
    ok: true,
    code: "DISCARDED",
    primaryUntouched: true,
    steps,
    lifecycle: marked.lifecycle,
  };
}

/**
 * Preview GitHub PR publication for a durable task (no remote side effects).
 * @param {{
 *   projectRoot: string,
 *   entry: any,
 * }} opts
 */
export function previewTaskPullRequest(opts) {
  const entry = opts.entry;
  if (!entry) {
    return { ok: false, code: "MISSING_TASK", message: "No task entry." };
  }
  const ready = assertGithubCliReady(opts.projectRoot);
  if (!ready.ok) return ready;
  const target = resolveGithubRemoteTarget(opts.projectRoot);
  if (!target.ok) return target;
  const perm = assertWritePermission(target);
  if (!perm.ok) return perm;

  const branch = entry.branch;
  const sha = entry.sha;
  if (!branch || !/^path\/task-/.test(branch)) {
    return {
      ok: false,
      code: "MISSING_BRANCH",
      message: "No path/task-* branch recorded for this task.",
    };
  }
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) {
    return {
      ok: false,
      code: "MISSING_COMMIT",
      message: "No verified commit SHA recorded for this task.",
    };
  }

  const local = git(opts.projectRoot, ["rev-parse", branch]);
  if (local.status !== 0) {
    return {
      ok: false,
      code: "BRANCH_MISSING_LOCALLY",
      message: `Local branch ${branch} is not available (discarded or cleaned). Cannot publish.`,
    };
  }

  return {
    ok: true,
    target: {
      remoteName: target.remoteName,
      nameWithOwner: target.nameWithOwner,
      baseBranch: target.baseBranch,
      remoteLabel: `${target.remoteName} → ${target.nameWithOwner}`,
    },
    taskBranch: branch,
    commitSha: sha.length >= 40 ? sha.toLowerCase() : local.stdout.toLowerCase(),
    changedFiles: Array.isArray(entry.changedFiles) ? entry.changedFiles : [],
    classification:
      entry.finalState === "VERIFIED" || entry.finalState === "COMPLETE"
        ? "VERIFIED"
        : String(entry.finalState || "VERIFIED"),
  };
}

/**
 * Push task branch + create/reuse PR via AG4 publish helpers.
 * Does not mutate primary checkout content (push uses remote only).
 *
 * @param {{
 *   runtimeRoot: string,
 *   projectRoot: string,
 *   entry: any,
 *   signal?: AbortSignal,
 * }} opts
 */
export function publishTaskPullRequest(opts) {
  const preview = previewTaskPullRequest(opts);
  if (!preview.ok) return preview;

  const published = publishVerifiedResult({
    projectRoot: opts.projectRoot,
    target: {
      remoteName: preview.target.remoteName,
      nameWithOwner: preview.target.nameWithOwner,
      baseBranch: preview.target.baseBranch,
    },
    taskBranch: preview.taskBranch,
    verifiedCommitSha: preview.commitSha,
    issueNumber: null,
    issueTitle: null,
    changedFiles: preview.changedFiles,
    classification: preview.classification,
    signal: opts.signal,
  });
  if (!published.ok) {
    return published;
  }

  const pr = published.pr?.pr || published.pr || null;
  const prUrl = pr && typeof pr.url === "string" ? pr.url : null;
  const prNumber =
    pr && typeof pr.number === "number"
      ? pr.number
      : pr && typeof pr.number === "string" && /^\d+$/.test(pr.number)
        ? Number(pr.number)
        : null;

  const marked = writeResultLifecycle({
    runtimeRoot: opts.runtimeRoot,
    taskId: opts.entry.taskId,
    projectRoot: opts.projectRoot,
    entry: opts.entry,
    patch: {
      status: "PR_OPEN",
      prUrl,
      prNumber,
      prRemote: preview.target.nameWithOwner,
      prBase: preview.target.baseBranch,
    },
  });

  return {
    ok: true,
    published: true,
    reused: published.pr?.skipped === true,
    push: published.push,
    pr: pr
      ? { number: prNumber, url: prUrl, title: pr.title || null }
      : null,
    target: preview.target,
    taskBranch: preview.taskBranch,
    commitSha: preview.commitSha,
    lifecycle: marked.ok ? marked.lifecycle : null,
  };
}

/**
 * Mark a successful local merge into primary.
 * @param {{
 *   runtimeRoot: string,
 *   projectRoot: string,
 *   entry: any,
 * }} opts
 */
export function markTaskMerged(opts) {
  return writeResultLifecycle({
    runtimeRoot: opts.runtimeRoot,
    taskId: opts.entry.taskId,
    projectRoot: opts.projectRoot,
    entry: opts.entry,
    patch: {
      status: "MERGED",
      mergedAt: new Date().toISOString(),
    },
  });
}

/**
 * Format confirmation / preview panels.
 * @param {any} preview
 * @param {any} entry
 */
export function formatPrPreviewPanel(preview, entry) {
  return [
    "GitHub pull request (confirmation required)",
    "",
    `  taskId     ${entry.taskId}`,
    `  branch     ${preview.taskBranch}`,
    `  commit     ${preview.commitSha}`,
    `  remote     ${preview.target.remoteLabel}`,
    `  base       ${preview.target.baseBranch}`,
    `  action     push task branch + create/reuse PR`,
    `  primary    unchanged (push only)`,
    "",
    "This contacts GitHub and may create a remote branch + pull request.",
  ].join("\n");
}

/**
 * @param {any} result
 * @param {any} entry
 */
export function formatPrResultPanel(result, entry) {
  if (!result?.ok) {
    return [
      `PR publication failed for task ${entry.taskId}`,
      "",
      `  code     ${result?.code || "FAILED"}`,
      result?.message ? `  detail   ${String(result.message).slice(0, 300)}` : null,
      result?.push?.ok
        ? `  push     branch published (${result.push.branch || entry.branch})`
        : null,
      "",
      "Durable task/report remain recoverable. Retry with /pr <taskId>.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const pr = result.pr;
  return [
    result.reused
      ? `Existing open PR reused for task ${entry.taskId}`
      : `Pull request published for task ${entry.taskId}`,
    "",
    `  branch    ${result.taskBranch}`,
    `  commit    ${result.commitSha}`,
    result.target
      ? `  remote    ${result.target.remoteLabel || result.target.nameWithOwner}`
      : null,
    result.push?.skipped
      ? "  push      already on remote"
      : result.push?.ok
        ? "  push      published"
        : null,
    pr?.number != null ? `  PR        #${pr.number}` : null,
    pr?.url ? `  url       ${pr.url}` : null,
    "",
    `Inspect: /inspect ${entry.taskId}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {any} result
 * @param {any} entry
 */
export function formatDiscardResultPanel(result, entry) {
  if (!result?.ok) {
    return [
      `Discard failed for task ${entry.taskId}`,
      "",
      `  code     ${result?.code || "FAILED"}`,
      result?.message ? `  detail   ${String(result.message).slice(0, 300)}` : null,
      `  primary  ${result?.primaryUntouched === false ? "CHANGED — inspect git status" : "untouched"}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    result.already
      ? `Task ${entry.taskId} was already discarded.`
      : `Discarded task result ${entry.taskId}`,
    "",
    "  primary   untouched",
    "  history   retained",
    "  report    retained",
    ...(Array.isArray(result.steps)
      ? result.steps.map((s) => `  · ${s}`)
      : []),
    "",
    `Inspect: /inspect ${entry.taskId}`,
  ].join("\n");
}
