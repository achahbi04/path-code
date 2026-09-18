/**
 * S4 — Task continuity disposition from durable + host evidence.
 *
 * Truthful states only. Never claim native engine resume when PATH is only
 * recovering from its own checkpoint / worktree / history.
 */

import { existsSync } from "node:fs";
import {
  findLatestResumableCheckpoint,
  readTaskCheckpoint,
} from "./task-checkpoint.mjs";

/**
 * @typedef {'still_running'|'reconnectable'|'resumable'|'interrupted'|'recoverable_from_durable_state'|'completed'|'failed'|'abandoned'|'unknown'} ContinuityDisposition
 */

/**
 * @typedef {{
 *   taskId: string,
 *   disposition: ContinuityDisposition,
 *   reason: string,
 *   checkpoint: object | null,
 *   worktreeExists: boolean,
 *   gatewayLive: boolean,
 *   engineNativeHint: {
 *     antigravity: string | null,
 *     copilot: string | null,
 *     cursor: string | null,
 *   },
 *   nextAction: 'attach'|'resume'|'inspect'|'none',
 * }} ContinuityAssessment
 */

/**
 * @param {number | null | undefined} pid
 * @returns {boolean}
 */
export function isPidAlive(pid) {
  if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Classify continuity for one task from durable checkpoint + optional live map.
 *
 * @param {{
 *   runtimeRoot: string,
 *   taskId?: string | null,
 *   liveTask?: { status?: string, result?: object | null } | null,
 *   gatewayPidAlive?: boolean | null,
 *   checkpoint?: object | null,
 * }} input
 * @returns {ContinuityAssessment}
 */
export function assessTaskContinuity(input) {
  const runtimeRoot = String(input.runtimeRoot || "");
  let taskId =
    typeof input.taskId === "string" && input.taskId.trim()
      ? input.taskId.trim()
      : "";
  const live = input.liveTask || null;
  let cp =
    input.checkpoint && typeof input.checkpoint === "object"
      ? input.checkpoint
      : null;

  if (!taskId && cp && typeof cp.taskId === "string") taskId = cp.taskId;
  if (!cp && taskId && runtimeRoot) {
    cp = readTaskCheckpoint(runtimeRoot, taskId);
  }
  if (!taskId && runtimeRoot) {
    const latest = findLatestResumableCheckpoint(runtimeRoot);
    if (latest) {
      cp = latest;
      taskId = latest.taskId;
    }
  }

  if (!taskId) {
    return {
      taskId: "",
      disposition: "unknown",
      reason: "no task id or resumable checkpoint",
      checkpoint: null,
      worktreeExists: false,
      gatewayLive: false,
      engineNativeHint: { antigravity: null, copilot: null, cursor: null },
      nextAction: "none",
    };
  }

  const worktreePath =
    typeof cp?.worktreePath === "string" ? cp.worktreePath : "";
  const worktreeExists = Boolean(worktreePath && existsSync(worktreePath));
  const gatewayLive = input.gatewayPidAlive !== false;
  const finalState =
    typeof cp?.finalState === "string" ? cp.finalState : null;
  const continuityDisposition =
    typeof cp?.continuityDisposition === "string"
      ? cp.continuityDisposition
      : null;
  const engineNativeHint = {
    antigravity:
      typeof cp?.agTaskId === "string" && cp.agTaskId
        ? String(cp.agSessionMode || "NONE")
        : null,
    copilot:
      typeof cp?.copilotSessionId === "string" && cp.copilotSessionId
        ? String(cp.copilotMode || "none")
        : null,
    cursor:
      typeof cp?.cursorSessionId === "string" && cp.cursorSessionId
        ? String(cp.cursorMode || "none")
        : null,
  };

  if (live && live.status === "running") {
    return {
      taskId,
      disposition: "still_running",
      reason: "Gateway still owns a running task — reattach, do not reinvent",
      checkpoint: cp,
      worktreeExists,
      gatewayLive: true,
      engineNativeHint,
      nextAction: "attach",
    };
  }

  if (live && (live.status === "completed" || live.status === "cancelled")) {
    const disposition =
      live.status === "cancelled"
        ? "abandoned"
        : live.result?.classification === "VERIFIED" ||
            live.result?.classification === "PARTIALLY_VERIFIED"
          ? "completed"
          : "failed";
    return {
      taskId,
      disposition,
      reason: `Gateway task status is ${live.status}`,
      checkpoint: cp,
      worktreeExists,
      gatewayLive: true,
      engineNativeHint,
      nextAction: "inspect",
    };
  }

  if (finalState === "VERIFIED" || finalState === "PARTIALLY_VERIFIED") {
    return {
      taskId,
      disposition: "completed",
      reason: `checkpoint finalState=${finalState}`,
      checkpoint: cp,
      worktreeExists,
      gatewayLive,
      engineNativeHint,
      nextAction: "inspect",
    };
  }
  if (finalState === "CANCELLED") {
    return {
      taskId,
      disposition: "abandoned",
      reason: "checkpoint finalState=CANCELLED",
      checkpoint: cp,
      worktreeExists,
      gatewayLive,
      engineNativeHint,
      nextAction: "inspect",
    };
  }
  if (
    finalState === "FAILED" ||
    finalState === "NOT_VERIFIED" ||
    finalState === "BLOCKED"
  ) {
    return {
      taskId,
      disposition: "failed",
      reason: `checkpoint finalState=${finalState}`,
      checkpoint: cp,
      worktreeExists,
      gatewayLive,
      engineNativeHint,
      nextAction: worktreeExists ? "resume" : "inspect",
    };
  }

  if (!cp) {
    return {
      taskId,
      disposition: "unknown",
      reason: "no durable checkpoint for task",
      checkpoint: null,
      worktreeExists: false,
      gatewayLive,
      engineNativeHint,
      nextAction: "none",
    };
  }

  if (!worktreeExists) {
    return {
      taskId,
      disposition: "interrupted",
      reason: "checkpoint present but worktree path missing on disk",
      checkpoint: cp,
      worktreeExists: false,
      gatewayLive,
      engineNativeHint,
      nextAction: "inspect",
    };
  }

  if (
    continuityDisposition === "interrupted" ||
    typeof cp.interruptedAt === "string"
  ) {
    // If Gateway still has a live Map entry, prefer still_running (handled above).
    // Otherwise interrupted remains until clearTaskInterrupted after reconstruct.
    return {
      taskId,
      disposition: "interrupted",
      reason: "durable state marked interrupted after Gateway/process loss",
      checkpoint: cp,
      worktreeExists: true,
      gatewayLive,
      engineNativeHint,
      nextAction: "resume",
    };
  }

  // Incomplete durable task with worktree — recoverable; engine-native resume
  // is only a hint (session ids may or may not still be valid).
  const hasNativeHint = Boolean(
    engineNativeHint.copilot ||
      engineNativeHint.cursor ||
      (engineNativeHint.antigravity &&
        engineNativeHint.antigravity !== "NONE"),
  );
  return {
    taskId,
    disposition: hasNativeHint
      ? "resumable"
      : "recoverable_from_durable_state",
    reason: hasNativeHint
      ? "incomplete checkpoint + worktree; engine session ids present (native resume attempted when supported)"
      : "incomplete checkpoint + worktree; continue from PATH durable reality (no native session claim)",
    checkpoint: cp,
    worktreeExists: true,
    gatewayLive,
    engineNativeHint,
    nextAction: "resume",
  };
}

/**
 * Operator-facing continuity summary lines.
 * @param {ContinuityAssessment} assessment
 * @returns {string}
 */
export function formatContinuityBrief(assessment) {
  const lines = [
    `Task: ${assessment.taskId || "(none)"}`,
    `State: ${assessment.disposition}`,
    `Survived: checkpoint=${assessment.checkpoint ? "yes" : "no"} · worktree=${assessment.worktreeExists ? "yes" : "no"}`,
    `Next: ${assessment.nextAction}`,
    assessment.reason,
  ];
  if (assessment.disposition === "still_running") {
    lines.push("PATH will reconnect to the live Gateway task (/attach).");
  } else if (
    assessment.disposition === "resumable" ||
    assessment.disposition === "interrupted" ||
    assessment.disposition === "recoverable_from_durable_state"
  ) {
    lines.push(
      "PATH will reconstruct ownership from durable state (/resume) — not the same as native engine resume unless the provider session is still valid.",
    );
  }
  return lines.join("\n");
}
