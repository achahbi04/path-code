/**
 * S4.3 — Host startup reconciliation after process/machine loss.
 *
 * Reconcile durable checkpoints / process sidecars / Gateway ownership
 * against actual host reality. Never resurrect dead processes; never
 * destroy healthy durable worktrees merely because their owners are gone.
 */

import { existsSync, readFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import {
  markTaskInterrupted,
  readTaskCheckpoint,
  resolveCheckpointIndexPath,
  patchTaskCheckpoint,
} from "./task-checkpoint.mjs";
import {
  assessTaskContinuity,
  formatReopenNotice,
} from "./task-continuity.mjs";
import { reconcileTaskProcesses } from "../task-processes.mjs";
import { captureTaskReality } from "./task-reality.mjs";
import { reclaimStaleGatewayOwnership } from "../gateway/ensure.mjs";
import { resolveGatewaySocketPath } from "../gateway/server.mjs";

/**
 * @param {string} runtimeRoot
 * @returns {string[]}
 */
function listIndexedTaskIds(runtimeRoot) {
  const indexPath = resolveCheckpointIndexPath(runtimeRoot);
  if (!existsSync(indexPath)) return [];
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const entries = Array.isArray(index?.entries) ? index.entries : [];
    /** @type {string[]} */
    const ids = [];
    for (const e of entries) {
      if (typeof e?.taskId === "string" && e.taskId) ids.push(e.taskId);
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
function samePath(a, b) {
  if (!a || !b) return false;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return String(a) === String(b);
  }
}

/**
 * List recoverable durable tasks (interrupted / resumable / recoverable).
 *
 * @param {{
 *   runtimeRoot: string,
 *   projectRoot?: string | null,
 * }} input
 * @returns {import('./task-continuity.mjs').ContinuityAssessment[]}
 */
export function listRecoverableTasks(input) {
  const runtimeRoot = String(input.runtimeRoot || "");
  const projectRoot =
    typeof input.projectRoot === "string" ? input.projectRoot : null;
  /** @type {import('./task-continuity.mjs').ContinuityAssessment[]} */
  const out = [];
  for (const taskId of listIndexedTaskIds(runtimeRoot)) {
    const cp = readTaskCheckpoint(runtimeRoot, taskId);
    if (!cp) continue;
    if (projectRoot && cp.repoRoot && !samePath(cp.repoRoot, projectRoot)) {
      continue;
    }
    const assessment = assessTaskContinuity({
      runtimeRoot,
      taskId,
      checkpoint: cp,
      gatewayPidAlive: false,
    });
    if (
      assessment.disposition === "interrupted" ||
      assessment.disposition === "resumable" ||
      assessment.disposition === "recoverable_from_durable_state" ||
      assessment.disposition === "failed"
    ) {
      // failed with worktree still allows resume per assess nextAction
      if (assessment.nextAction === "resume") out.push(assessment);
    }
  }
  // Newest first by interruptedAt / updatedAt
  out.sort((a, b) => {
    const ta = String(
      a.checkpoint?.interruptedAt || a.checkpoint?.updatedAt || "",
    );
    const tb = String(
      b.checkpoint?.interruptedAt || b.checkpoint?.updatedAt || "",
    );
    return tb.localeCompare(ta);
  });
  return out;
}

/**
 * Full host-startup reconcile: Gateway reclaim + process sidecars +
 * in-flight checkpoints with no surviving owners → interrupted.
 *
 * @param {{
 *   runtimeRoot: string,
 *   projectRoot?: string | null,
 * }} input
 */
export function reconcileHostStartup(input) {
  const runtimeRoot = String(input.runtimeRoot || "");
  const projectRoot =
    typeof input.projectRoot === "string" ? input.projectRoot : null;
  const socketPath = resolveGatewaySocketPath(runtimeRoot);
  const reclaim = reclaimStaleGatewayOwnership(runtimeRoot, socketPath);

  /** @type {string[]} */
  const markedInFlight = [];
  /** @type {object[]} */
  const processReconciles = [];

  for (const taskId of listIndexedTaskIds(runtimeRoot)) {
    const cp = readTaskCheckpoint(runtimeRoot, taskId);
    if (!cp) continue;
    if (projectRoot && cp.repoRoot && !samePath(cp.repoRoot, projectRoot)) {
      continue;
    }
    if (
      cp.finalState === "VERIFIED" ||
      cp.finalState === "CANCELLED" ||
      cp.finalState === "PARTIALLY_VERIFIED"
    ) {
      continue;
    }

    let proc = { liveKinds: [], changed: false, processes: [] };
    try {
      proc = reconcileTaskProcesses(runtimeRoot, taskId);
      processReconciles.push({ taskId, ...proc });
    } catch {
      /* ignore */
    }

    const inFlight =
      typeof cp.latestEngineTurn === "string" &&
      cp.latestEngineTurn.startsWith("in_flight:");
    const noLiveOwners = !Array.isArray(proc.liveKinds) || proc.liveKinds.length === 0;

    // Reconcile Git reality into checkpoint so reopen sees what survived.
    if (typeof cp.worktreePath === "string" && existsSync(cp.worktreePath)) {
      try {
        const reality = captureTaskReality(cp.worktreePath);
        const drift =
          (reality.headSha && reality.headSha !== cp.headSha) ||
          (reality.diffFingerprint &&
            reality.diffFingerprint !== cp.diffFingerprint);
        if (drift || inFlight) {
          patchTaskCheckpoint(runtimeRoot, taskId, {
            headSha: reality.headSha || cp.headSha,
            diffFingerprint: reality.diffFingerprint || cp.diffFingerprint,
            changedFiles:
              Array.isArray(reality.changedFiles) && reality.changedFiles.length
                ? reality.changedFiles
                : cp.changedFiles,
            continuityReason: drift
              ? "worktree/Git advanced relative to last checkpoint — reconciled on host startup"
              : cp.continuityReason,
          });
        }
      } catch {
        /* ignore */
      }
    }

    if (
      inFlight &&
      noLiveOwners &&
      cp.continuityDisposition !== "interrupted"
    ) {
      markTaskInterrupted(
        runtimeRoot,
        taskId,
        "host startup: in-flight turn with no surviving PATH-owned process",
      );
      markedInFlight.push(taskId);
    }
  }

  const recoverable = listRecoverableTasks({ runtimeRoot, projectRoot });
  return {
    ok: true,
    reclaim,
    markedInFlight,
    processReconciles,
    recoverable,
    notices: recoverable.slice(0, 5).map((a) => formatReopenNotice(a)),
  };
}
