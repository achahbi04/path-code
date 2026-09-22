/**
 * Durable engineering-result evidence for PATH Build adoption.
 *
 * A task worktree is disposable. Adoption reads the sealed Git commit, not
 * the checkout that produced it.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

import {
  adoptionAllowedForIntent,
  capabilityFromChangedFiles,
} from "./objectives.mjs";

/**
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 15_000,
  });
}

/**
 * @param {unknown} value
 */
function shaOf(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return /^[0-9a-f]{7,40}$/i.test(text) ? text : null;
}

/**
 * @param {string} projectRoot
 * @param {string} rev
 */
export function gitCommitExists(projectRoot, rev) {
  if (!projectRoot || !rev) return false;
  return git(projectRoot, ["cat-file", "-e", `${rev}^{commit}`]).status === 0;
}

/**
 * @param {string} projectRoot
 * @param {string} ancestor
 * @param {string} descendant
 */
function isAncestor(projectRoot, ancestor, descendant) {
  return (
    git(projectRoot, ["merge-base", "--is-ancestor", ancestor, descendant])
      .status === 0
  );
}

/**
 * Paths in a commit tree. Null when the revision cannot be read.
 * @param {string} projectRoot
 * @param {string} rev
 * @returns {string[] | null}
 */
export function listGitTreePaths(projectRoot, rev) {
  if (!projectRoot || !rev) return null;
  const listed = git(projectRoot, ["ls-tree", "-r", "--name-only", rev]);
  if (listed.status !== 0) return null;
  return listed.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * @param {object} fields
 */
function decide(fields) {
  return {
    adopt: false,
    code: "REJECTED",
    reason: null,
    capability: "none",
    capabilitySource: "uninspected",
    sourceSha: null,
    taskBranch: null,
    fingerprint: null,
    ...fields,
  };
}

/**
 * Decide whether a finished engineer task may become the Build product.
 *
 * Filesystem absence of the task worktree is not a product classification.
 * A missing checkout with no sealed commit is `EVIDENCE_UNAVAILABLE`.
 * A sealed commit whose tree has no web entry is `NON_WEB`.
 *
 * @param {{
 *   record?: object,
 *   child?: object,
 *   checkpoint?: object,
 *   projectRoot?: string,
 *   classification?: string,
 * }} input
 */
export function decideEngineerProductAdoption(input) {
  const record = input.record || {};
  const child = input.child || {};
  const cp = input.checkpoint || {};
  const projectRoot = String(input.projectRoot || "");
  const evidence =
    cp.productEvidence && typeof cp.productEvidence === "object"
      ? cp.productEvidence
      : {};
  const classification = String(
    input.classification ||
      cp?.validation?.classification ||
      cp?.finalState ||
      "",
  );
  const buildId = String(record.buildId || "");
  const claimedBuild = String(evidence.buildId || "");
  if (claimedBuild && buildId && claimedBuild !== buildId) {
    return decide({
      code: "WRONG_BUILD",
      reason: "Sealed result belongs to a different build.",
    });
  }
  const claimedAction = String(evidence.actionId || "");
  if (claimedAction && child.actionId && claimedAction !== child.actionId) {
    return decide({
      code: "WRONG_ACTION",
      reason: "Sealed result belongs to a different engineer action.",
    });
  }
  const intentNow = Number(record?.intent?.outcomeRevision);
  const intentThen = Number(child.intentRevision);
  if (
    Number.isFinite(intentNow) &&
    Number.isFinite(intentThen) &&
    intentThen !== intentNow
  ) {
    return decide({
      code: "STALE_INTENT",
      reason: "Result was produced for an older intent revision.",
    });
  }

  const finalState = String(cp?.finalState || "");
  const success =
    /^(VERIFIED|SUCCESS)$/i.test(classification) &&
    finalState !== "FAILED" &&
    finalState !== "CANCELLED" &&
    finalState !== "BLOCKED" &&
    finalState !== "NOT_VERIFIED";
  if (!success) {
    const failed = /FAIL|CANCEL|BLOCK|NOT_VERIFIED/i.test(
      `${classification} ${finalState}`,
    );
    return decide({
      code: failed ? "FAILED_TASK" : "UNVERIFIED_RESULT",
      reason: failed
        ? "The engineer task did not finish as a verified result, so it was not adopted."
        : "The engineer task has no verified result to adopt.",
    });
  }

  const taskBranch =
    typeof cp.branch === "string" && cp.branch.trim() ? cp.branch.trim() : null;
  const recordedSha = shaOf(cp.sha) || shaOf(evidence.resultingSha);
  const originSha = shaOf(cp.baseline) || shaOf(input.originSha);
  let sourceSha = recordedSha;
  if (taskBranch && projectRoot && gitCommitExists(projectRoot, taskBranch)) {
    const tipOut = git(projectRoot, ["rev-parse", `${taskBranch}^{commit}`]);
    const tip = tipOut.status === 0 ? shaOf(tipOut.stdout) : null;
    const recordedIsOrigin = Boolean(originSha && recordedSha === originSha);
    if (tip && tip !== originSha && (!sourceSha || recordedIsOrigin)) {
      sourceSha = tip;
    }
  }
  const worktreePath =
    typeof cp.worktreePath === "string" ? cp.worktreePath : "";
  const worktreeExists =
    Boolean(worktreePath) &&
    existsSync(worktreePath) &&
    statSync(worktreePath).isDirectory();

  if (!sourceSha || !projectRoot || !gitCommitExists(projectRoot, sourceSha)) {
    if (worktreePath && !worktreeExists) {
      return decide({
        code: "EVIDENCE_UNAVAILABLE",
        capability: "unavailable",
        capabilitySource: "worktree-missing",
        reason:
          "The task worktree was removed before a durable result commit was sealed. That is not a finding that no website was produced.",
      });
    }
    return decide({
      code: "NO_DURABLE_RESULT",
      reason: "No durable result commit is available for adoption.",
    });
  }

  const origin = shaOf(cp.baseline) || shaOf(input.originSha);
  if (origin && !isAncestor(projectRoot, origin, sourceSha)) {
    return decide({
      code: "WRONG_ORIGIN",
      sourceSha,
      taskBranch,
      reason: "Result commit is not descended from the expected origin.",
    });
  }
  if (taskBranch && gitCommitExists(projectRoot, taskBranch)) {
    if (!isAncestor(projectRoot, sourceSha, taskBranch)) {
      return decide({
        code: "UNRELATED_SHA",
        sourceSha,
        taskBranch,
        reason: "Result commit is not contained in the task branch.",
      });
    }
  } else if (!taskBranch || !/^path\/task-/.test(taskBranch)) {
    return decide({
      code: "UNRELATED_SHA",
      sourceSha,
      reason: "Result commit has no task branch to adopt from.",
    });
  }

  const tree = listGitTreePaths(projectRoot, sourceSha);
  if (!tree) {
    return decide({
      code: "NO_DURABLE_RESULT",
      sourceSha,
      taskBranch,
      reason: "The durable result commit could not be read.",
    });
  }
  const capability = capabilityFromChangedFiles(tree) || "none";
  const intent = adoptionAllowedForIntent(
    record,
    capability === "web" ? "web" : capability,
  );
  const fingerprint = createHash("sha256")
    .update(
      [
        buildId,
        String(child.actionId || ""),
        String(child.taskId || cp.taskId || ""),
        sourceSha,
        tree.join("\n"),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
  if (!intent.ok) {
    return decide({
      code: "NON_WEB",
      reason: intent.reason,
      capability,
      capabilitySource: "git-tree",
      sourceSha,
      taskBranch,
      fingerprint,
    });
  }
  return decide({
    adopt: true,
    code: "ADOPT",
    reason: null,
    capability,
    capabilitySource: "git-tree",
    sourceSha,
    taskBranch,
    fingerprint,
  });
}
