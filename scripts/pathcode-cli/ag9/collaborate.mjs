/**
 * G9 — collaborative engineering shared state + exclusive turn leases.
 *
 * Antigravity and Copilot take turns on the same worktree. Leases prevent
 * concurrent writers; the journal carries handoff context between engines.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { withToolLock } from "./locks.mjs";
import { ensureAg9RuntimeDirs } from "./layout.mjs";
import { selectEngineForTurn } from "../ag10/engine-contract.mjs";

/** @typedef {'antigravity'|'copilot'|'cursor'} CollabEngine */
/**
 * @param {string} runtimeRoot
 * @param {string} taskId
 */
export function resolveCollabPaths(runtimeRoot, taskId) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const safeTask = String(taskId || "task")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  return {
    lockDir: dirs.locks,
    lockKey: `collab-${safeTask}`,
    journalPath: join(dirs.metadata, `collab-${safeTask}.jsonl`),
    statePath: join(dirs.metadata, `collab-${safeTask}.state.json`),
  };
}

/**
 * Append one journal event (best-effort).
 *
 * @param {{
 *   runtimeRoot: string,
 *   taskId: string,
 *   engine: CollabEngine,
 *   phase: string,
 *   detail?: string,
 *   changedFiles?: string[],
 *   ok?: boolean,
 * }} input
 */
export function appendCollabJournal(input) {
  const { journalPath } = resolveCollabPaths(input.runtimeRoot, input.taskId);
  mkdirSync(join(journalPath, ".."), { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    engine: input.engine,
    phase: String(input.phase || ""),
    detail: typeof input.detail === "string" ? input.detail.slice(0, 400) : "",
    changedFiles: Array.isArray(input.changedFiles)
      ? input.changedFiles.slice(0, 40)
      : [],
    ok: input.ok !== false,
  };
  appendFileSync(journalPath, `${JSON.stringify(entry)}\n`, "utf8");
  writeFileSync(
    resolveCollabPaths(input.runtimeRoot, input.taskId).statePath,
    `${JSON.stringify({ last: entry }, null, 2)}\n`,
    "utf8",
  );
}

/**
 * Read recent journal lines for handoff prompts.
 *
 * @param {{ runtimeRoot: string, taskId: string, limit?: number }} input
 * @returns {object[]}
 */
export function readCollabJournal({ runtimeRoot, taskId, limit = 12 }) {
  const { journalPath } = resolveCollabPaths(runtimeRoot, taskId);
  if (!existsSync(journalPath)) return [];
  try {
    const lines = readFileSync(journalPath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const slice = lines.slice(-Math.max(1, Math.min(limit, 40)));
    /** @type {object[]} */
    const out = [];
    for (const line of slice) {
      try {
        out.push(JSON.parse(line));
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Format journal as compact handoff text for the next engine.
 *
 * @param {object[]} entries
 * @returns {string}
 */
export function formatCollabHandoff(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "";
  }
  const lines = ["Shared engineering journal (prior turns):"];
  for (const e of entries.slice(-8)) {
    const eng = typeof e.engine === "string" ? e.engine : "?";
    const phase = typeof e.phase === "string" ? e.phase : "";
    const detail = typeof e.detail === "string" ? e.detail : "";
    const files =
      Array.isArray(e.changedFiles) && e.changedFiles.length
        ? ` files=${e.changedFiles.slice(0, 6).join(",")}`
        : "";
    lines.push(
      `- [${eng}] ${phase}${detail ? `: ${detail.slice(0, 160)}` : ""}${files}`,
    );
  }
  return lines.join("\n");
}

/**
 * Run `fn` while holding the exclusive collab turn lease for this task.
 *
 * @template T
 * @param {{
 *   runtimeRoot: string,
 *   taskId: string,
 *   engine: CollabEngine,
 *   timeoutMs?: number,
 * }} input
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withCollabTurn(input, fn) {
  const { lockDir, lockKey } = resolveCollabPaths(
    input.runtimeRoot,
    input.taskId,
  );
  appendCollabJournal({
    runtimeRoot: input.runtimeRoot,
    taskId: input.taskId,
    engine: input.engine,
    phase: "lease_acquire",
    detail: `engine=${input.engine}`,
  });
  try {
    return await withToolLock(
      lockDir,
      lockKey,
      async () => {
        appendCollabJournal({
          runtimeRoot: input.runtimeRoot,
          taskId: input.taskId,
          engine: input.engine,
          phase: "turn_start",
        });
        const result = await fn();
        appendCollabJournal({
          runtimeRoot: input.runtimeRoot,
          taskId: input.taskId,
          engine: input.engine,
          phase: "turn_end",
          ok: true,
          detail:
            result && typeof result === "object" && "detail" in result
              ? String(/** @type {any} */ (result).detail || "").slice(0, 200)
              : "",
          changedFiles:
            result &&
            typeof result === "object" &&
            Array.isArray(/** @type {any} */ (result).changedFiles)
              ? /** @type {any} */ (result).changedFiles
              : [],
        });
        return result;
      },
      {
        timeoutMs:
          typeof input.timeoutMs === "number" && input.timeoutMs > 0
            ? input.timeoutMs
            : 180_000,
      },
    );
  } catch (err) {
    appendCollabJournal({
      runtimeRoot: input.runtimeRoot,
      taskId: input.taskId,
      engine: input.engine,
      phase: "turn_error",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Choose which engine should take the next collaborative repair turn.
 * Capability-aware rotation via the S3 engine contract — no permanent hierarchy.
 *
 * @param {{
 *   attempt: number,
 *   copilotReady: boolean,
 *   cursorReady?: boolean,
 *   prefer?: string | null,
 *   lastEngine?: string | null,
 * }} input
 * @returns {CollabEngine}
 */
export function chooseCollabEngine({
  attempt,
  copilotReady,
  cursorReady,
  prefer,
  lastEngine,
}) {
  return selectEngineForTurn({
    role: "repair",
    attempt,
    ready: {
      antigravity: true,
      copilot: Boolean(copilotReady),
      cursor: Boolean(cursorReady),
    },
    prefer,
    lastEngine,
    preferContinuity: false,
  });
}
