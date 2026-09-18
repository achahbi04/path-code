/**
 * S4.2 — Durable per-task process ownership sidecar.
 *
 * Complements the in-memory process-registry so PATH can reconcile PIDs
 * against host reality after engine death (Gateway still alive).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { ensureAg9RuntimeDirs } from "./ag9/layout.mjs";
import {
  captureProcessIdentity,
  isPidAlive,
  processMatchesIdentity,
} from "./process-identity.mjs";

/**
 * @param {string} runtimeRoot
 * @param {string} taskId
 */
export function resolveTaskProcessesPath(runtimeRoot, taskId) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const safe = String(taskId || "task")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  return join(dirs.metadata, "tasks", `${safe}.processes.json`);
}

/**
 * @typedef {{
 *   id?: string,
 *   kind: string,
 *   pid: number | null,
 *   startKey?: string,
 *   command?: string,
 *   startedAt?: string,
 *   endedAt?: string | null,
 *   status: 'live'|'ended'|'stale'|'unknown',
 * }} TaskProcessOwner
 */

/**
 * @param {string} runtimeRoot
 * @param {string} taskId
 * @returns {{ schema: string, taskId: string, updatedAt: string, processes: TaskProcessOwner[] } | null}
 */
export function readTaskProcesses(runtimeRoot, taskId) {
  const path = resolveTaskProcessesPath(runtimeRoot, taskId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Atomic write of process ownership snapshot.
 * @param {string} runtimeRoot
 * @param {string} taskId
 * @param {TaskProcessOwner[]} processes
 */
export function writeTaskProcesses(runtimeRoot, taskId, processes) {
  const path = resolveTaskProcessesPath(runtimeRoot, taskId);
  mkdirSync(dirname(path), { recursive: true });
  const payload = {
    schema: "pathcode.s4.task-processes.v1",
    taskId: String(taskId),
    updatedAt: new Date().toISOString(),
    processes: (Array.isArray(processes) ? processes : [])
      .slice(0, 40)
      .map((p) => ({
        id: typeof p.id === "string" ? p.id : undefined,
        kind: String(p.kind || "process"),
        pid: typeof p.pid === "number" ? p.pid : null,
        startKey: typeof p.startKey === "string" ? p.startKey : "",
        command: typeof p.command === "string" ? p.command.slice(0, 240) : "",
        startedAt: typeof p.startedAt === "string" ? p.startedAt : undefined,
        endedAt: typeof p.endedAt === "string" ? p.endedAt : null,
        status: p.status || "unknown",
      })),
  };
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
  return payload;
}

/**
 * Upsert one live process into the durable sidecar.
 * @param {string} runtimeRoot
 * @param {string} taskId
 * @param {TaskProcessOwner} proc
 */
export function upsertTaskProcess(runtimeRoot, taskId, proc) {
  const existing = readTaskProcesses(runtimeRoot, taskId);
  const list = Array.isArray(existing?.processes) ? [...existing.processes] : [];
  const identity =
    typeof proc.pid === "number" ? captureProcessIdentity(proc.pid) : null;
  const next = {
    ...proc,
    startKey: proc.startKey || identity?.startKey || "",
    status: proc.status || "live",
  };
  const idx = list.findIndex(
    (p) =>
      (next.id && p.id === next.id) ||
      (p.kind === next.kind && p.pid === next.pid && !p.endedAt),
  );
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.push(next);
  return writeTaskProcesses(runtimeRoot, taskId, list);
}

/**
 * Reconcile durable process rows against host reality.
 * Dead or PID-reused rows become stale/ended — never treated as still running.
 *
 * @param {string} runtimeRoot
 * @param {string} taskId
 */
export function reconcileTaskProcesses(runtimeRoot, taskId) {
  const existing = readTaskProcesses(runtimeRoot, taskId);
  if (!existing) {
    return { ok: true, processes: [], changed: false, liveKinds: [] };
  }
  let changed = false;
  const processes = existing.processes.map((p) => {
    if (p.status === "ended") return p;
    const pid = typeof p.pid === "number" ? p.pid : null;
    if (pid == null) {
      if (p.status !== "unknown") changed = true;
      return { ...p, status: "unknown", endedAt: p.endedAt || new Date().toISOString() };
    }
    const match = processMatchesIdentity(pid, p.startKey);
    if (match) {
      if (p.status !== "live") changed = true;
      return { ...p, status: "live" };
    }
    // Pid dead OR reused → not our process anymore.
    changed = true;
    return {
      ...p,
      status: p.startKey && isPidAlive(pid) ? "stale" : "ended",
      endedAt: p.endedAt || new Date().toISOString(),
    };
  });
  if (changed) writeTaskProcesses(runtimeRoot, taskId, processes);
  const liveKinds = processes
    .filter((p) => p.status === "live")
    .map((p) => p.kind);
  return { ok: true, processes, changed, liveKinds };
}

/**
 * @param {string} runtimeRoot
 * @param {string} taskId
 */
export function deleteTaskProcesses(runtimeRoot, taskId) {
  const path = resolveTaskProcessesPath(runtimeRoot, taskId);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* ignore */
  }
}
