/**
 * S5 — reconcile Build children against authoritative PATH task reality.
 * Build cached "dispatched" must never override a terminal checkpoint/report.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readTaskCheckpoint } from "../ag10/task-checkpoint.mjs";
import {
  engineeringReportExists,
  resolveEngineeringReportPath,
} from "../engineering-report.mjs";

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
  const provider =
    (typeof cp?.selectedEngine === "string" && cp.selectedEngine) ||
    (typeof cp?.provider === "string" && cp.provider) ||
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

/**
 * Pure reconciliation decisions for one child (no I/O side effects).
 * @param {{
 *   child: any,
 *   cp: any,
 *   snap: any,
 *   reportText?: string,
 *   nowMs?: number,
 * }} input
 */
export function decideChildReconciliation(input) {
  const { child, cp, snap, reportText = "" } = input;
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
  return { cp, snap, reportText };
}
