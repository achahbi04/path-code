/**
 * Structured per-task engineering trace (observability + operator /log).
 */

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolvePathRuntimeRoot } from "./paths.mjs";

/**
 * @param {string} taskId
 * @param {string} [runtimeRoot]
 */
export function resolveTaskTracePath(taskId, runtimeRoot) {
  const root = runtimeRoot || resolvePathRuntimeRoot();
  return join(root, "metadata", "tasks", `${taskId}.trace.ndjson`);
}

/**
 * @param {string} taskId
 * @param {string} [runtimeRoot]
 */
export function resolveTaskTimingPath(taskId, runtimeRoot) {
  const root = runtimeRoot || resolvePathRuntimeRoot();
  return join(root, "metadata", "tasks", `${taskId}.timing.json`);
}

/**
 * @param {{
 *   taskId: string,
 *   runtimeRoot?: string,
 *   type: string,
 *   engine?: string,
 *   phase?: string,
 *   tool?: string,
 *   path?: string,
 *   command?: string,
 *   exitCode?: number | null,
 *   durationMs?: number,
 *   detail?: string,
 *   meta?: Record<string, unknown>,
 * }} entry
 */
export function appendTaskTrace(entry) {
  const taskId = String(entry.taskId || "").trim();
  if (!taskId) return null;
  const path = resolveTaskTracePath(taskId, entry.runtimeRoot);
  mkdirSync(join(path, ".."), { recursive: true });
  const row = {
    t: new Date().toISOString(),
    taskId,
    type: entry.type,
    engine: entry.engine || null,
    phase: entry.phase || null,
    tool: entry.tool || null,
    path: entry.path || null,
    command: entry.command || null,
    exitCode: entry.exitCode ?? null,
    durationMs: entry.durationMs ?? null,
    detail: typeof entry.detail === "string" ? entry.detail.slice(0, 500) : null,
    meta: sanitizeMeta(entry.meta),
  };
  appendFileSync(path, `${JSON.stringify(row)}\n`, "utf8");
  return path;
}

/**
 * @param {Record<string, unknown> | undefined} meta
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = k.toLowerCase();
    if (
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("password") ||
      key.includes("authorization") ||
      key.includes("credential") ||
      key.includes("api_key") ||
      key.includes("apikey")
    ) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && v.length > 2000) {
      out[k] = `${v.slice(0, 2000)}…`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @param {string} taskId
 * @param {Record<string, number>} stages
 * @param {string} [runtimeRoot]
 */
export function writeTaskTiming(taskId, stages, runtimeRoot) {
  const path = resolveTaskTimingPath(taskId, runtimeRoot);
  mkdirSync(join(path, ".."), { recursive: true });
  const total = Object.values(stages).reduce(
    (a, b) => a + (typeof b === "number" ? b : 0),
    0,
  );
  writeFileSync(
    path,
    `${JSON.stringify({ taskId, stages, totalMs: total, at: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  return path;
}

/**
 * @param {string} taskId
 * @param {string} [runtimeRoot]
 * @param {number} [maxLines]
 */
export function readTaskTrace(taskId, runtimeRoot, maxLines = 500) {
  const path = resolveTaskTracePath(taskId, runtimeRoot);
  if (!existsSync(path)) return { path, lines: [] };
  const raw = readFileSync(path, "utf8");
  const lines = raw
    .split("\n")
    .filter(Boolean)
    .slice(-Math.max(1, maxLines))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  return { path, lines };
}
