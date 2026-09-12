/**
 * AG4 — push verified branch + create PR (PATH-owned, after approval).
 */

import { spawnSync } from "node:child_process";
import { runGhJson } from "./remote.mjs";
import {
  buildPrBody,
  buildPrTitle,
  cleanupTempPrBodyFile,
  writeTempPrBodyFile,
} from "./pr-body.mjs";

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 */
function git(cwd, args) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    timeout: 120_000,
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
}

/**
 * @param {{
 *   projectRoot: string,
 *   remoteName: string,
 *   taskBranch: string,
 * }} opts
 */
export function inspectRemoteBranchCommit(opts) {
  const ls = git(opts.projectRoot, [
    "ls-remote",
    "--heads",
    opts.remoteName,
    opts.taskBranch,
  ]);
  if (ls.status !== 0) {
    return { ok: false, exists: false, commitSha: null, message: ls.stderr || ls.stdout };
  }
  if (!ls.stdout) return { ok: true, exists: false, commitSha: null };
  const m = ls.stdout.match(/^([0-9a-f]{40})\b/i);
  if (!m) return { ok: true, exists: true, commitSha: null };
  return { ok: true, exists: true, commitSha: m[1].toLowerCase() };
}

/**
 * @param {{
 *   projectRoot: string,
 *   remoteName: string,
 *   taskBranch: string,
 *   verifiedCommitSha: string,
 * }} opts
 */
export function pushVerifiedBranch(opts) {
  const want = opts.verifiedCommitSha.toLowerCase();
  const local = git(opts.projectRoot, ["rev-parse", opts.taskBranch]);
  if (local.status !== 0 || local.stdout.toLowerCase() !== want) {
    return {
      ok: false,
      code: "VERIFIED_RESULT_CHANGED",
      message: "Local task branch no longer points at the VERIFIED commit.",
    };
  }

  const remote = inspectRemoteBranchCommit(opts);
  if (remote.ok && remote.exists && remote.commitSha === want) {
    return {
      ok: true,
      skipped: true,
      remoteCommitSha: remote.commitSha,
      branch: opts.taskBranch,
    };
  }
  if (remote.ok && remote.exists && remote.commitSha && remote.commitSha !== want) {
    return {
      ok: false,
      code: "REMOTE_BRANCH_CONFLICT",
      message: `Remote branch ${opts.taskBranch} exists at ${remote.commitSha}, not ${want}.`,
      remoteCommitSha: remote.commitSha,
    };
  }

  const push = git(opts.projectRoot, [
    "push",
    "-u",
    opts.remoteName,
    `${opts.taskBranch}:${opts.taskBranch}`,
  ]);
  if (push.status !== 0) {
    return {
      ok: false,
      code: "REMOTE_PUSH_FAILED",
      message: (push.stderr || push.stdout || "git push failed").slice(0, 500),
    };
  }

  const after = inspectRemoteBranchCommit(opts);
  if (!after.ok || !after.exists || after.commitSha !== want) {
    return {
      ok: false,
      code: "REMOTE_COMMIT_MISMATCH",
      message: "Remote branch commit does not match the locally VERIFIED SHA.",
      remoteCommitSha: after.commitSha,
    };
  }
  return {
    ok: true,
    skipped: false,
    remoteCommitSha: after.commitSha,
    branch: opts.taskBranch,
  };
}

/**
 * @param {{
 *   projectRoot: string,
 *   nameWithOwner: string,
 *   taskBranch: string,
 *   baseBranch: string,
 * }} opts
 */
export function findOpenPrForBranch(opts) {
  const view = runGhJson(
    [
      "pr",
      "list",
      "--repo",
      opts.nameWithOwner,
      "--head",
      `${opts.nameWithOwner.split("/")[0]}:${opts.taskBranch}`,
      "--state",
      "open",
      "--json",
      "number,url,title,headRefName,baseRefName",
    ],
    { cwd: opts.projectRoot },
  );
  // Also try head as just branch name (same-repo).
  let json = [];
  if (view.status === 0) {
    try {
      json = JSON.parse(view.stdout);
    } catch {
      json = [];
    }
  }
  if (!Array.isArray(json) || json.length === 0) {
    const view2 = runGhJson(
      [
        "pr",
        "list",
        "--repo",
        opts.nameWithOwner,
        "--head",
        opts.taskBranch,
        "--state",
        "open",
        "--json",
        "number,url,title,headRefName,baseRefName",
      ],
      { cwd: opts.projectRoot },
    );
    if (view2.status === 0) {
      try {
        json = JSON.parse(view2.stdout);
      } catch {
        json = [];
      }
    }
  }
  if (!Array.isArray(json) || json.length === 0) return { ok: true, pr: null };
  const hit = json.find((p) => p.headRefName === opts.taskBranch) || json[0];
  return {
    ok: true,
    pr: {
      number: hit.number,
      url: hit.url,
      title: hit.title,
      baseRefName: hit.baseRefName,
    },
  };
}

/**
 * @param {{
 *   projectRoot: string,
 *   nameWithOwner: string,
 *   taskBranch: string,
 *   baseBranch: string,
 *   issueNumber?: number | null,
 *   issueTitle?: string | null,
 *   commitSha: string,
 *   changedFiles?: string[],
 *   validation?: any,
 *   classification: string,
 * }} opts
 */
export function createPullRequest(opts) {
  const existing = findOpenPrForBranch(opts);
  if (existing.ok && existing.pr) {
    return { ok: true, skipped: true, pr: existing.pr };
  }

  const title = buildPrTitle(opts);
  const body = buildPrBody(opts);
  const bodyFile = writeTempPrBodyFile(body);
  try {
    const created = runGhJson(
      [
        "pr",
        "create",
        "--repo",
        opts.nameWithOwner,
        "--base",
        opts.baseBranch,
        "--head",
        opts.taskBranch,
        "--title",
        title,
        "--body-file",
        bodyFile,
      ],
      { cwd: opts.projectRoot, timeoutMs: 120_000 },
    );
    if (created.status !== 0) {
      return {
        ok: false,
        code: "PR_CREATION_FAILED",
        message: (created.stderr || created.stdout || "gh pr create failed").slice(0, 500),
        body,
      };
    }
    // Prefer structured follow-up view.
    const listed = findOpenPrForBranch(opts);
    if (listed.ok && listed.pr) {
      return { ok: true, skipped: false, pr: listed.pr, body, title };
    }
    const url = (created.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop() || "";
    return {
      ok: true,
      skipped: false,
      pr: { number: null, url, title },
      body,
      title,
    };
  } finally {
    cleanupTempPrBodyFile(bodyFile);
  }
}

/**
 * Full publication after approval.
 * @param {{
 *   projectRoot: string,
 *   target: {
 *     remoteName: string,
 *     nameWithOwner: string,
 *     baseBranch: string,
 *   },
 *   taskBranch: string,
 *   verifiedCommitSha: string,
 *   issueNumber?: number | null,
 *   issueTitle?: string | null,
 *   changedFiles?: string[],
 *   validation?: any,
 *   classification: string,
 *   signal?: AbortSignal,
 * }} opts
 */
export function publishVerifiedResult(opts) {
  if (opts.signal?.aborted) {
    return { ok: false, code: "CANCELLED", message: "Publication cancelled." };
  }
  const pushed = pushVerifiedBranch({
    projectRoot: opts.projectRoot,
    remoteName: opts.target.remoteName,
    taskBranch: opts.taskBranch,
    verifiedCommitSha: opts.verifiedCommitSha,
  });
  if (!pushed.ok) return pushed;

  if (opts.signal?.aborted) {
    return {
      ok: false,
      code: "REMOTE_BRANCH_PUBLISHED_PR_FAILED",
      message: "Cancelled after branch publication.",
      push: pushed,
    };
  }

  const pr = createPullRequest({
    projectRoot: opts.projectRoot,
    nameWithOwner: opts.target.nameWithOwner,
    taskBranch: opts.taskBranch,
    baseBranch: opts.target.baseBranch,
    issueNumber: opts.issueNumber,
    issueTitle: opts.issueTitle,
    commitSha: opts.verifiedCommitSha,
    changedFiles: opts.changedFiles,
    validation: opts.validation,
    classification: opts.classification,
  });
  if (!pr.ok) {
    return {
      ok: false,
      code: "REMOTE_BRANCH_PUBLISHED_PR_FAILED",
      message: pr.message,
      push: pushed,
      prError: pr,
    };
  }
  return { ok: true, push: pushed, pr };
}
