/**
 * Creator review of an engineer result. The task commit is durable; the
 * product SHA moves only when the creator Applies.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function lastCreatorRequest(record) {
  const revision = record?.intent?.outcomeRevision;
  const last = [...(Array.isArray(record?.conversation) ? record.conversation : [])]
    .reverse()
    .find(
      (message) =>
        message?.role === "user" &&
        (revision == null || message.intentRevision === revision),
    );
  const text = String(last?.text || record?.intent?.outcome || "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function diffSummary(projectRoot, sourceSha) {
  if (!projectRoot || !sourceSha || !existsSync(join(projectRoot, ".git"))) {
    return "";
  }
  const shown = git(projectRoot, ["show", "--stat", "--oneline", "-1", sourceSha]);
  if (shown.status !== 0) return "";
  return String(shown.stdout || "").trim().slice(0, 800);
}

/**
 * @param {{
 *   record: object,
 *   child: object,
 *   checkpoint?: object,
 *   decision: object,
 *   projectRoot?: string | null,
 * }} input
 */
export function makePendingCandidate(input) {
  const { record, child, checkpoint: cp = {}, decision, projectRoot } = input;
  const sourceSha = decision.sourceSha || cp.sha || null;
  return {
    taskId: child.taskId,
    actionId: child.actionId,
    intentRevision: child.intentRevision || record.intent?.outcomeRevision || 1,
    sourceSha,
    taskBranch: decision.taskBranch || cp.branch || null,
    worktreePath: typeof cp.worktreePath === "string" ? cp.worktreePath : null,
    files: Array.isArray(cp.changedFiles) ? cp.changedFiles.slice(0, 40) : [],
    requestText: lastCreatorRequest(record),
    diffSummary: diffSummary(projectRoot, sourceSha),
    capability: decision.capability || null,
    capabilitySource: decision.capabilitySource || null,
    resultFingerprint: decision.fingerprint || null,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
}

/**
 * After an in-place engineer, put the product folder back on the
 * authoritative branch so disk matches the product SHA.
 *
 * @param {{
 *   projectRoot: string,
 *   productBranch?: string | null,
 *   authoritativeSha?: string | null,
 *   worktreePath?: string | null,
 * }} input
 */
export function restoreAuthoritativeCheckout(input) {
  const root = resolve(String(input.projectRoot || ""));
  if (!root || !existsSync(join(root, ".git"))) {
    return { ok: true, skipped: true, reason: "no_git" };
  }
  const worktree = input.worktreePath ? resolve(input.worktreePath) : null;
  if (worktree && worktree !== root) {
    return { ok: true, skipped: true, reason: "separate_worktree" };
  }
  const branch = String(input.productBranch || "").trim();
  const sha = String(input.authoritativeSha || "").trim();
  if (branch) {
    const has = git(root, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    if (has.status !== 0) {
      const origin =
        sha || String(git(root, ["rev-parse", "HEAD~1"]).stdout || "").trim();
      if (!origin) {
        return { ok: true, skipped: true, reason: "no_origin_for_branch" };
      }
      const created = git(root, ["branch", branch, origin]);
      if (created.status !== 0) {
        return {
          ok: false,
          message: String(created.stderr || created.stdout || "branch failed").slice(
            0,
            300,
          ),
        };
      }
    }
    const checked = git(root, ["checkout", "--force", branch]);
    if (checked.status !== 0) {
      return {
        ok: false,
        message: String(checked.stderr || checked.stdout || "checkout failed").slice(
          0,
          300,
        ),
      };
    }
    return { ok: true, target: branch };
  }
  if (sha) {
    const checked = git(root, ["checkout", "--force", sha]);
    if (checked.status !== 0) {
      return {
        ok: false,
        message: String(checked.stderr || checked.stdout || "checkout failed").slice(
          0,
          300,
        ),
      };
    }
    return { ok: true, target: sha };
  }
  return { ok: true, skipped: true, reason: "no_target" };
}

/**
 * Directory whose files are the candidate revision, without moving product HEAD.
 *
 * @param {{
 *   runtimeRoot: string,
 *   buildId: string,
 *   projectRoot?: string | null,
 *   candidate: object,
 * }} input
 */
export function resolveCandidatePreviewRoot(input) {
  const candidate = input.candidate || {};
  const worktree =
    typeof candidate.worktreePath === "string" ? candidate.worktreePath : "";
  const projectRoot = input.projectRoot ? resolve(input.projectRoot) : "";
  if (
    worktree &&
    existsSync(worktree) &&
    (!projectRoot || resolve(worktree) !== projectRoot)
  ) {
    return { ok: true, root: worktree, mode: "worktree" };
  }
  const sha = String(candidate.sourceSha || "").trim();
  if (!sha || !projectRoot || !existsSync(join(projectRoot, ".git"))) {
    return { ok: false, code: "NO_CANDIDATE_TREE" };
  }
  const dest = join(
    input.runtimeRoot,
    "metadata",
    "candidate-previews",
    `${input.buildId}-${sha.slice(0, 12)}`,
  );
  if (existsSync(dest)) {
    try {
      if (readdirSync(dest).length > 0) {
        return { ok: true, root: dest, mode: "archive" };
      }
    } catch {
      /* rematerialize */
    }
  }
  try {
    rmSync(dest, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  mkdirSync(dest, { recursive: true });
  const archive = spawnSync("git", ["archive", sha], {
    cwd: projectRoot,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (archive.status !== 0) {
    return {
      ok: false,
      code: "ARCHIVE_FAILED",
      message: String(archive.stderr || "git archive failed").slice(0, 300),
    };
  }
  const extracted = spawnSync("tar", ["-x", "-C", dest], {
    input: archive.stdout,
    encoding: "buffer",
  });
  if (extracted.status !== 0) {
    return {
      ok: false,
      code: "EXTRACT_FAILED",
      message: String(extracted.stderr || "tar extract failed").slice(0, 300),
    };
  }
  return { ok: true, root: dest, mode: "archive" };
}
