/**
 * PATH-owned subprocess registry — lifecycle metadata for Stop / audit / cleanup.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { captureProcessIdentity, processMatchesIdentity } from "./process-identity.mjs";
import { upsertTaskProcess } from "./task-processes.mjs";
import { resolvePathRuntimeRoot } from "./paths.mjs";

/** @type {AsyncLocalStorage<{ taskId: string | null }>} */
const taskContext = new AsyncLocalStorage();

/**
 * Run work with an owning task id so spawned children inherit ownership.
 * @template T
 * @param {string | null | undefined} taskId
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithTaskContext(taskId, fn) {
  const id =
    typeof taskId === "string" && taskId.trim() ? taskId.trim() : null;
  return taskContext.run({ taskId: id }, fn);
}

/** @returns {string | null} */
export function getCurrentTaskId() {
  return taskContext.getStore()?.taskId ?? null;
}

/**
 * Kill a child and its process group when detached.
 * @param {import('node:child_process').ChildProcess | null | undefined} child
 * @param {NodeJS.Signals | number} signal
 */
export function killProcessTree(child, signal = "SIGTERM") {
  if (!child) return false;
  const pid = typeof child.pid === "number" ? child.pid : null;
  if (pid != null && process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
      return true;
    } catch {
      // fall through to direct kill
    }
  }
  try {
    child.kill(signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * @typedef {{
 *   id: string,
 *   taskId: string | null,
 *   kind: string,
 *   command: string,
 *   pid: number | null,
 *   pgid: number | null,
 *   startKey: string,
 *   startedAt: string,
 *   endedAt: string | null,
 *   exitCode: number | null,
 *   signal: string | null,
 *   cancelled: boolean,
 *   cleanup: 'pending'|'ok'|'failed'|'n/a',
 *   child: import('node:child_process').ChildProcess | null,
 * }} ProcessRecord
 */

/** @type {Map<string, ProcessRecord>} */
const byId = new Map();
/** @type {Map<string, Set<string>>} */
const byTask = new Map();

/**
 * @param {{
 *   taskId?: string | null,
 *   kind: string,
 *   command?: string,
 *   child?: import('node:child_process').ChildProcess | null,
 *   pid?: number | null,
 *   runtimeRoot?: string,
 * }} opts
 */
export function registerProcess(opts) {
  const id = randomUUID();
  const child = opts.child && typeof opts.child === "object" ? opts.child : null;
  const pid =
    typeof opts.pid === "number"
      ? opts.pid
      : typeof child?.pid === "number"
        ? child.pid
        : null;
  const identity = typeof pid === "number" ? captureProcessIdentity(pid) : null;
  const ctxTask = getCurrentTaskId();
  /** @type {ProcessRecord} */
  const rec = {
    id,
    taskId:
      typeof opts.taskId === "string"
        ? opts.taskId
        : ctxTask,
    kind: String(opts.kind || "process"),
    command: typeof opts.command === "string" ? opts.command.slice(0, 500) : "",
    pid,
    pgid: pid,
    startKey: identity?.startKey || "",
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    signal: null,
    cancelled: false,
    cleanup: "pending",
    child,
  };
  byId.set(id, rec);
  if (rec.taskId) {
    if (!byTask.has(rec.taskId)) byTask.set(rec.taskId, new Set());
    byTask.get(rec.taskId)?.add(id);
    try {
      const runtimeRoot =
        typeof opts.runtimeRoot === "string" && opts.runtimeRoot
          ? opts.runtimeRoot
          : resolvePathRuntimeRoot();
      upsertTaskProcess(runtimeRoot, rec.taskId, {
        id: rec.id,
        kind: rec.kind,
        pid: rec.pid,
        startKey: rec.startKey,
        command: rec.command,
        startedAt: rec.startedAt,
        status: "live",
      });
      // Stash for close handler durable update
      rec._runtimeRoot = runtimeRoot;
    } catch {
      /* durable sidecar is best-effort */
    }
  }
  if (child) {
    child.once("close", (code, signal) => {
      rec.endedAt = new Date().toISOString();
      rec.exitCode = typeof code === "number" ? code : null;
      rec.signal = typeof signal === "string" ? signal : null;
      if (rec.cleanup === "pending") rec.cleanup = "ok";
      rec.child = null;
      if (rec.taskId) {
        try {
          upsertTaskProcess(
            rec._runtimeRoot || resolvePathRuntimeRoot(),
            rec.taskId,
            {
            id: rec.id,
            kind: rec.kind,
            pid: rec.pid,
            startKey: rec.startKey,
            command: rec.command,
            startedAt: rec.startedAt,
            endedAt: rec.endedAt,
            status: "ended",
          },
          );
        } catch {
          /* ignore */
        }
      }
    });
    child.once("error", () => {
      rec.endedAt = new Date().toISOString();
      if (rec.cleanup === "pending") rec.cleanup = "failed";
      rec.child = null;
    });
  }
  return rec;
}

/**
 * @param {string} id
 * @param {{ exitCode?: number | null, signal?: string | null, cleanup?: ProcessRecord['cleanup'] }} [extra]
 */
export function markProcessEnded(id, extra = {}) {
  const rec = byId.get(id);
  if (!rec) return null;
  rec.endedAt = new Date().toISOString();
  if ("exitCode" in extra) rec.exitCode = extra.exitCode ?? null;
  if ("signal" in extra) rec.signal = extra.signal ?? null;
  if (extra.cleanup) rec.cleanup = extra.cleanup;
  else if (rec.cleanup === "pending") rec.cleanup = "ok";
  rec.child = null;
  return snapshotProcess(rec);
}

/**
 * @param {ProcessRecord} rec
 */
function snapshotProcess(rec) {
  return {
    id: rec.id,
    taskId: rec.taskId,
    kind: rec.kind,
    command: rec.command,
    pid: rec.pid,
    pgid: rec.pgid,
    startKey: rec.startKey || "",
    startedAt: rec.startedAt,
    endedAt: rec.endedAt,
    exitCode: rec.exitCode,
    signal: rec.signal,
    cancelled: rec.cancelled,
    cleanup: rec.cleanup,
    alive: isProcessRecordAlive(rec),
  };
}

/**
 * @param {ProcessRecord} rec
 */
export function isProcessRecordAlive(rec) {
  if (!rec || rec.endedAt) return false;
  if (rec.child && typeof rec.child.killed === "boolean" && !rec.child.killed) {
    return true;
  }
  if (typeof rec.pid !== "number") return false;
  return processMatchesIdentity(rec.pid, rec.startKey);
}

/**
 * @param {string} [taskId]
 */
export function listProcesses(taskId) {
  if (taskId) {
    const ids = byTask.get(taskId);
    if (!ids) return [];
    return [...ids]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((r) => snapshotProcess(/** @type {ProcessRecord} */ (r)));
  }
  return [...byId.values()].map(snapshotProcess);
}

/**
 * Cancel and kill all live processes for a task.
 * @param {string} taskId
 * @param {{ signal?: NodeJS.Signals }} [opts]
 */
export function cancelTaskProcesses(taskId, opts = {}) {
  const signal = opts.signal || "SIGTERM";
  const ids = byTask.get(taskId);
  /** @type {ReturnType<typeof snapshotProcess>[]} */
  const results = [];
  if (!ids) return results;
  for (const id of [...ids]) {
    const rec = byId.get(id);
    if (!rec) continue;
    rec.cancelled = true;
    if (rec.endedAt) {
      results.push(snapshotProcess(rec));
      continue;
    }
    try {
      if (rec.child && !rec.child.killed) {
        killProcessTree(rec.child, signal);
        rec.cleanup = "ok";
      } else if (
        typeof rec.pid === "number" &&
        processMatchesIdentity(rec.pid, rec.startKey)
      ) {
        // Only signal bare PIDs that still match recorded start identity —
        // never kill a reused PID that is not PATH-owned.
        try {
          if (process.platform !== "win32") process.kill(-rec.pid, signal);
          else process.kill(rec.pid, signal);
          rec.cleanup = "ok";
        } catch {
          try {
            process.kill(rec.pid, signal);
            rec.cleanup = "ok";
          } catch {
            rec.cleanup = "failed";
          }
        }
      } else {
        rec.cleanup = rec.pid != null ? "n/a" : "n/a";
      }
    } catch {
      rec.cleanup = "failed";
    }
    if (!rec.endedAt) {
      rec.endedAt = new Date().toISOString();
      rec.signal = signal;
    }
    rec.child = null;
    results.push(snapshotProcess(rec));
  }
  return results;
}

/** Test helper */
export function resetProcessRegistryForTests() {
  byId.clear();
  byTask.clear();
}
