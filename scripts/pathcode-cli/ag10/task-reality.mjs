/**
 * G10 — shared task reality. Filesystem/Git outranks stale model/journal state.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * @typedef {object} TaskGitReality
 * @property {string} worktreePath
 * @property {boolean} exists
 * @property {string | null} headSha
 * @property {string} statusPorcelain
 * @property {string[]} changedFiles
 * @property {string} diffFingerprint
 * @property {string} [branch]
 */

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {Record<string, string | undefined>} [env]
 */
function git(cwd, args, env) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, ...env },
  });
}

/**
 * Capture current Git/worktree reality for a PATH task.
 * @param {string} worktreePath
 * @param {Record<string, string | undefined>} [env]
 * @returns {TaskGitReality}
 */
export function captureTaskReality(worktreePath, env) {
  const path = typeof worktreePath === "string" ? worktreePath : "";
  if (!path || !existsSync(path)) {
    return {
      worktreePath: path,
      exists: false,
      headSha: null,
      statusPorcelain: "",
      changedFiles: [],
      diffFingerprint: "missing",
    };
  }
  const head = git(path, ["rev-parse", "HEAD"], env);
  const headSha =
    head.status === 0 ? String(head.stdout || "").trim() || null : null;
  const status = git(path, ["status", "--porcelain"], env);
  const statusPorcelain =
    status.status === 0 ? String(status.stdout || "") : "";
  const changedFiles = statusPorcelain
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\?\?\s+/, "").replace(/^[ MADRCU?]{1,2}\s+/, ""))
    .filter(Boolean)
    .slice(0, 80);
  const diff = git(path, ["diff", "--stat", "HEAD"], env);
  const diffStat = diff.status === 0 ? String(diff.stdout || "") : "";
  const branchR = git(path, ["rev-parse", "--abbrev-ref", "HEAD"], env);
  const branch =
    branchR.status === 0 ? String(branchR.stdout || "").trim() : undefined;
  const fingerprint = createHash("sha256")
    .update(`${headSha || "none"}\n${statusPorcelain}\n${diffStat}`)
    .digest("hex")
    .slice(0, 24);
  return {
    worktreePath: path,
    exists: true,
    headSha,
    statusPorcelain,
    changedFiles,
    diffFingerprint: fingerprint,
    ...(branch ? { branch } : {}),
  };
}

/**
 * Reconcile durable checkpoint with live Git/worktree.
 * Filesystem/Git wins over stale checkpoint SHA/diff.
 *
 * @param {{
 *   checkpoint: import('./task-checkpoint.mjs').G10TaskCheckpoint | null,
 *   worktreePath?: string,
 *   env?: Record<string, string | undefined>,
 * }} input
 */
export function reconcileTaskReality(input) {
  const cp = input.checkpoint;
  const worktreePath =
    (typeof input.worktreePath === "string" && input.worktreePath) ||
    (cp && typeof cp.worktreePath === "string" ? cp.worktreePath : "");
  const reality = captureTaskReality(worktreePath, input.env);
  const checkpointSha = cp?.headSha || null;
  const checkpointFp = cp?.diffFingerprint || null;
  const gitNewer =
    reality.exists &&
    ((checkpointSha && reality.headSha && checkpointSha !== reality.headSha) ||
      (checkpointFp &&
        reality.diffFingerprint &&
        checkpointFp !== reality.diffFingerprint));

  /** @type {'aligned'|'git_ahead'|'checkpoint_stale'|'worktree_missing'|'no_checkpoint'} */
  let status = "aligned";
  if (!cp) status = "no_checkpoint";
  else if (!reality.exists) status = "worktree_missing";
  else if (gitNewer) status = "git_ahead";
  else if (
    checkpointSha &&
    reality.headSha &&
    checkpointSha === reality.headSha &&
    checkpointFp === reality.diffFingerprint
  ) {
    status = "aligned";
  } else if (cp && reality.exists) {
    status = checkpointFp && checkpointFp !== reality.diffFingerprint
      ? "checkpoint_stale"
      : "aligned";
  }

  return {
    status,
    reality,
    /** Never restore old model snapshot over newer repo reality. */
    authoritative: reality,
    useCheckpointObjective: Boolean(cp?.objective),
    objective: cp?.objective || "",
    agSessionMode: cp?.agSessionMode || "NONE",
    agTaskId: cp?.agTaskId || null,
    copilotSessionId: cp?.copilotSessionId || null,
    copilotMode: cp?.copilotMode || "none",
    pendingSteering: Array.isArray(cp?.pendingSteering) ? cp.pendingSteering : [],
    preparedCapabilities: Array.isArray(cp?.preparedCapabilities)
      ? cp.preparedCapabilities
      : [],
    finalState: cp?.finalState || null,
    /** Truth for resume handoff prompts. */
    resumeBrief: [
      `PATH task reality (filesystem/Git authoritative):`,
      `worktree=${reality.worktreePath}`,
      `exists=${reality.exists}`,
      `HEAD=${reality.headSha || "unknown"}`,
      `branch=${reality.branch || "unknown"}`,
      `diffFingerprint=${reality.diffFingerprint}`,
      `changedFiles=${reality.changedFiles.slice(0, 20).join(",") || "(none)"}`,
      `reconcile=${status}`,
      cp?.objective ? `objective=${String(cp.objective).slice(0, 500)}` : "",
      cp?.copilotMode ? `copilotMode=${cp.copilotMode}` : "",
      cp?.agSessionMode ? `agSessionMode=${cp.agSessionMode}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Detect whether a collaborative handoff produced meaningful progress.
 * @param {{
 *   before: TaskGitReality,
 *   after: TaskGitReality,
 *   failureSignatureBefore?: string,
 *   failureSignatureAfter?: string,
 *   objectiveAdvanced?: boolean,
 *   newEvidence?: boolean,
 *   materiallyNewAction?: boolean,
 * }} input
 */
export function detectProgress(input) {
  const diffChanged =
    input.before.diffFingerprint !== input.after.diffFingerprint;
  const headChanged = input.before.headSha !== input.after.headSha;
  const filesChanged =
    input.before.changedFiles.join("\0") !==
    input.after.changedFiles.join("\0");
  const failureChanged =
    typeof input.failureSignatureBefore === "string" &&
    typeof input.failureSignatureAfter === "string" &&
    input.failureSignatureBefore !== input.failureSignatureAfter;
  const productive =
    diffChanged ||
    headChanged ||
    filesChanged ||
    failureChanged ||
    input.objectiveAdvanced === true ||
    input.newEvidence === true ||
    input.materiallyNewAction === true;
  return {
    productive,
    reasons: {
      diffChanged,
      headChanged,
      filesChanged,
      failureChanged,
      objectiveAdvanced: input.objectiveAdvanced === true,
      newEvidence: input.newEvidence === true,
      materiallyNewAction: input.materiallyNewAction === true,
    },
  };
}
