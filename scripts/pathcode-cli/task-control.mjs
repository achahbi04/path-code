/**
 * Task-control phrases that must never enter the steering queue.
 */

import { normalizeObjectiveText } from "./normalize-text.mjs";

const STOP_EXACT = new Set([
  "/stop",
  "stop",
  "■ stop",
  "stop here",
  "stop here and give the report",
  "quit the session",
  "cancel task",
  "cancel",
]);

/**
 * @param {unknown} text
 * @returns {boolean}
 */
export function isTaskStopCommand(text) {
  const normalized = normalizeObjectiveText(text).trim().toLowerCase();
  if (!normalized) return false;
  if (STOP_EXACT.has(normalized)) return true;
  if (normalized === "/cancel") return true;
  // Exact short forms only — do not treat long steering that mentions "stop" as cancel.
  if (/^\/?stop\b/.test(normalized) && normalized.length <= 48) {
    if (
      normalized === "stop" ||
      normalized.startsWith("/stop") ||
      normalized.startsWith("stop here") ||
      normalized.startsWith("stop now")
    ) {
      return true;
    }
  }
  return false;
}
