/**
 * S5 — reconcile Build children against authoritative PATH task reality.
 * Build cached "dispatched" must never override a terminal checkpoint/report.
 */

import { readFileSync } from "node:fs";
import { readTaskCheckpoint } from "../ag10/task-checkpoint.mjs";
import {
  engineeringReportExists,
  resolveEngineeringReportPath,
} from "../engineering-report.mjs";
import { readTaskTrace } from "../task-trace.mjs";

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function engineNameFromTurn(value) {
  const raw = String(value || "");
  const match = raw.match(/(?:^|:)(cursor|copilot|antigravity)$/i);
  return match ? match[1].toLowerCase() : null;
}

const TERMINAL_FINAL = new Set([
  "completed",
  "failed",
  "interrupted",
  "abandoned",
  "cancelled",
  "canceled",
  "verified",
  "partially_verified",
  "not_verified",
  "blocked",
  "success",
  "error",
]);

/**
 * @param {any} cp
 * @param {any} snap
 * @param {string} [reportText]
 */
export function isTaskTerminal(cp, snap = null, reportText = "") {
  const finalState = String(cp?.finalState || snap?.finalState || snap?.status || "")
    .trim()
    .toLowerCase();
  if (finalState && TERMINAL_FINAL.has(finalState)) return true;
  if (finalState && finalState !== "running" && finalState !== "pending" && finalState !== "starting") {
    // Gateway may use custom terminal strings
    if (!/run|pend|start|prep|active/i.test(finalState)) return true;
  }
  const classification = String(
    (cp?.validation && cp.validation.classification) ||
      cp?.classification ||
      snap?.classification ||
      "",
  );
  if (/VERIFIED|NOT_VERIFIED|BLOCKED|FAIL|SUCCESS|CANCEL/i.test(classification)) {
    return true;
  }
  if (reportText && /Duration\n|Not completed|Type \/report/i.test(reportText)) {
    return true;
  }
  return false;
}

/**
 * @param {string} runtimeRoot
 * @param {string} taskId
 */
export function readTaskReportText(runtimeRoot, taskId) {
  try {
    if (!engineeringReportExists(taskId, runtimeRoot)) return "";
    const p = resolveEngineeringReportPath(taskId, runtimeRoot);
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

/**
 * Extract provider provenance from checkpoint / report / snapshot.
 * @param {any} cp
 * @param {any} snap
 * @param {string} [reportText]
 */
export function extractProviderProvenance(cp, snap = null, reportText = "") {
  const turnEngine = engineNameFromTurn(cp?.latestEngineTurn || cp?.inFlightEngine);
  const provider =
    (typeof cp?.selectedEngine === "string" && cp.selectedEngine) ||
    (typeof cp?.provider === "string" && cp.provider) ||
    turnEngine ||
    (typeof snap?.engine === "string" && snap.engine) ||
    (typeof snap?.provider === "string" && snap.provider) ||
    null;
  const engineMode =
    (typeof cp?.cursorMode === "string" && cp.cursorMode) ||
    (typeof cp?.agSessionMode === "string" && cp.agSessionMode) ||
    (typeof cp?.copilotMode === "string" && cp.copilotMode) ||
    (typeof snap?.engineMode === "string" && snap.engineMode) ||
    null;

  let fromReport = null;
  let modeFromReport = null;
  const fabric = String(reportText || "").match(
    /Engine fabric\s*\n\s*(\S+)\s+(\S+)/i,
  );
  if (fabric) {
    fromReport = fabric[1];
    modeFromReport = fabric[2];
  }

  return {
    provider: provider || fromReport || null,
    engineMode: engineMode || modeFromReport || null,
  };
}

/**
 * Orphan: dispatched long ago, no checkpoint, no live running snapshot.
 * @param {{
 *   child: any,
 *   cp: any,
 *   snap: any,
 *   nowMs?: number,
 *   orphanAfterMs?: number,
 * }} input
 */
export function isOrphanDispatchedChild(input) {
  const { child, cp, snap } = input;
  if (!child || child.dispatchState === "consumed") return false;
  if (cp && (cp.finalState || (cp.validation && cp.validation.classification))) {
    return false;
  }
  const snapStatus = String(snap?.status || "").toLowerCase();
  if (snapStatus === "running" || snapStatus === "starting") return false;
  const dispatchedAt = Date.parse(child.dispatchedAt || child.selectedAt || "");
  const now = input.nowMs || Date.now();
  const orphanAfter = input.orphanAfterMs ?? 15 * 60_000;
  if (!Number.isFinite(dispatchedAt)) return Boolean(!cp && snap && snapStatus && snapStatus !== "running");
  return now - dispatchedAt >= orphanAfter && !cp;
}

const TRACE_FAILURE_STATUS = new Set([
  "failed",
  "cancelled",
  "canceled",
  "not_verified",
  "error",
  "interrupted",
  "abandoned",
]);

const TRACE_SUCCESS_STATUS = new Set([
  "completed",
  "verified",
  "success",
  "partially_verified",
]);

/**
 * Durable task-trace reading for terminal FAILURE or CANCELLATION only.
 *
 * Checkpoint, gateway snapshot, and engineering report stay the authority for
 * success and adoption. A trace line that says the task finished successfully
 * is not enough to consume or adopt, because the report may still be in flight.
 * A trace that says the Gateway task failed or was cancelled, with no later
 * live work and no contradictory running snapshot, is enough to stop treating
 * the child as dispatched.
 *
 * @param {object[] | null | undefined} lines
 * @returns {{ kind: "none" | "failure" | "success_unconfirmed", classification?: string }}
 */
export function classifyTraceTerminal(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return { kind: "none" };
  /** @type {{ kind: "failure", classification: string } | null} */
  let failure = null;
  let sawSuccessFinish = false;
  for (const line of lines) {
    const type = String(line?.type || "");
    const status = String(line?.meta?.status || "").toLowerCase();
    const classification = String(line?.meta?.classification || "");
    const isFinish = type === "gateway.task.finished";
    const isCancel =
      type === "session.cancelled" ||
      (type === "task.stop" && /cancel/i.test(String(line?.detail || "")));
    if (isFinish && TRACE_SUCCESS_STATUS.has(status)) {
      sawSuccessFinish = true;
      failure = null;
      continue;
    }
    if (
      isCancel ||
      (isFinish &&
        (TRACE_FAILURE_STATUS.has(status) ||
          /FAIL|CANCEL|NOT_VERIFIED/i.test(classification)))
    ) {
      if (sawSuccessFinish) continue;
      const cancelled =
        isCancel || status === "cancelled" || status === "canceled";
      failure = {
        kind: "failure",
        classification: cancelled ? "CANCELLED" : "FAILED",
      };
      continue;
    }
    if (
      failure &&
      (type === "session.engineering.tool" ||
        type === "session.task.received" ||
        status === "running" ||
        status === "starting")
    ) {
      failure = null;
    }
  }
  if (sawSuccessFinish && !failure) return { kind: "success_unconfirmed" };
  if (failure) return failure;
  return { kind: "none" };
}

/**
 * @param {any} snap
 */
function snapshotLooksLive(snap) {
  const status = String(snap?.status || "").toLowerCase();
  return status === "running" || status === "starting" || status === "pending";
}

/**
 * Pure reconciliation decisions for one child (no I/O side effects).
 * @param {{
 *   child: any,
 *   cp: any,
 *   snap: any,
 *   reportText?: string,
 *   traceLines?: object[],
 *   nowMs?: number,
 * }} input
 */
export function decideChildReconciliation(input) {
  const { child, cp, snap, reportText = "", traceLines = [] } = input;
  if (!child) return { action: "noop" };
  if (child.dispatchState === "consumed") return { action: "noop", reason: "already_consumed" };

  if (child.dispatchState === "selected" && (cp || snap)) {
    return { action: "mark_dispatched" };
  }

  if (isTaskTerminal(cp, snap, reportText)) {
    const classification =
      (cp?.validation && cp.validation.classification) ||
      cp?.finalState ||
      snap?.classification ||
      snap?.finalState ||
      child.classification ||
      "TERMINAL";
    const provenance = extractProviderProvenance(cp, snap, reportText);
    return {
      action: "mark_terminal_and_consume",
      classification: String(classification),
      provider: provenance.provider,
      engineMode: provenance.engineMode,
    };
  }

  // Failure/cancellation only. Success stays on the checkpoint/report path above.
  if (!snapshotLooksLive(snap)) {
    const traced = classifyTraceTerminal(traceLines);
    if (traced.kind === "failure") {
      const provenance = extractProviderProvenance(cp, snap, reportText);
      return {
        action: "mark_terminal_and_consume",
        classification: traced.classification || "NOT_VERIFIED",
        provider: provenance.provider,
        engineMode: provenance.engineMode,
        traceFailure: true,
      };
    }
  }

  if (isOrphanDispatchedChild(input)) {
    return {
      action: "mark_terminal_and_consume",
      classification: "ABANDONED_ORPHAN",
      provider: extractProviderProvenance(cp, snap, reportText).provider,
      engineMode: extractProviderProvenance(cp, snap, reportText).engineMode,
      orphan: true,
    };
  }

  return { action: "wait", reason: "still_active" };
}

/**
 * @param {string} runtimeRoot
 * @param {string} taskId
 * @param {{ snapshotTask?: (id: string) => any }} [gateway]
 */
export function loadChildTruth(runtimeRoot, taskId, gateway = {}) {
  const cp = readTaskCheckpoint(runtimeRoot, taskId);
  let snap = null;
  if (typeof gateway.snapshotTask === "function") {
    try {
      snap = gateway.snapshotTask(taskId);
    } catch {
      snap = null;
    }
  }
  const reportText = readTaskReportText(runtimeRoot, taskId);
  const trace = readTaskTrace(taskId, runtimeRoot, 400);
  return { cp, snap, reportText, traceLines: trace.lines || [] };
}
