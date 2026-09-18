/**
 * G10 — crash-safe durable PATH task checkpoint (continuity state, not memory).
 *
 * Atomic write via temp + rename. Never stores credentials or full transcripts.
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
import { ensureAg9RuntimeDirs } from "../ag9/layout.mjs";

/**
 * @typedef {object} G10TaskCheckpoint
 * @property {string} schema
 * @property {string} taskId
 * @property {string} sessionId
 * @property {string} [repoRoot]
 * @property {string} worktreePath
 * @property {string} [objective]
 * @property {string} [headSha]
 * @property {string} [diffFingerprint]
 * @property {string} [agSessionMode] NATIVE_RESUME | REHYDRATED_SESSION | ACTIVE | NONE
 * @property {string} [agTaskId]
 * @property {string} [copilotSessionId]
 * @property {'native_sdk'|'cli_fallback'|'auth_required'|'none'} [copilotMode]
 * @property {string} [cursorSessionId]
 * @property {'native_sdk'|'auth_required'|'unavailable'|'none'} [cursorMode]
 * @property {string} [latestEngineTurn]
 * @property {string[]} [preparedCapabilities]
 * @property {object} [validation]
 * @property {object[]} [backgroundOps]
 * @property {object[]} [pendingSteering]
 * @property {object} [collaboration]
 * @property {object} [usage]
 * @property {string} [finalState]
 * @property {string} [branch] Task branch (path/task-…)
 * @property {string} [sha] Result commit SHA
 * @property {string} [baseline] Baseline commit SHA
 * @property {string[]} [changedFiles] Authoritative result file list
 * @property {string} [preferredEngine]
 * @property {string} [continuityDisposition] interrupted | resumable | …
 * @property {string} [interruptedAt] ISO timestamp when Gateway/process loss was recorded
 * @property {string} [continuityReason]
 * @property {string} updatedAt
 */

/**
 * @param {string} runtimeRoot
 * @param {string} taskId
 */
export function resolveCheckpointPath(runtimeRoot, taskId) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const safe = String(taskId || "task")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  return join(dirs.metadata, "tasks", `${safe}.checkpoint.json`);
}

/**
 * @param {string} runtimeRoot
 * @returns {string}
 */
export function resolveCheckpointIndexPath(runtimeRoot) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  return join(dirs.metadata, "tasks", "index.json");
}

/**
 * @param {Partial<G10TaskCheckpoint> & { taskId: string, worktreePath: string }} partial
 * @returns {G10TaskCheckpoint}
 */
export function createCheckpointSkeleton(partial) {
  return {
    schema: "pathcode.g10.task-checkpoint.v1",
    taskId: String(partial.taskId),
    sessionId: String(partial.sessionId || partial.taskId),
    repoRoot: typeof partial.repoRoot === "string" ? partial.repoRoot : undefined,
    worktreePath: String(partial.worktreePath),
    objective:
      typeof partial.objective === "string"
        ? partial.objective.slice(0, 4_000)
        : undefined,
    headSha: typeof partial.headSha === "string" ? partial.headSha : undefined,
    diffFingerprint:
      typeof partial.diffFingerprint === "string"
        ? partial.diffFingerprint
        : undefined,
    agSessionMode:
      typeof partial.agSessionMode === "string"
        ? /** @type {any} */ (partial.agSessionMode)
        : "NONE",
    agTaskId: typeof partial.agTaskId === "string" ? partial.agTaskId : undefined,
    copilotSessionId:
      typeof partial.copilotSessionId === "string"
        ? partial.copilotSessionId
        : undefined,
    copilotMode: partial.copilotMode || "none",
    cursorSessionId:
      typeof partial.cursorSessionId === "string"
        ? partial.cursorSessionId
        : undefined,
    cursorMode: partial.cursorMode || "none",
    latestEngineTurn:
      typeof partial.latestEngineTurn === "string"
        ? partial.latestEngineTurn
        : undefined,
    preparedCapabilities: Array.isArray(partial.preparedCapabilities)
      ? partial.preparedCapabilities.slice(0, 64).map(String)
      : [],
    validation:
      partial.validation && typeof partial.validation === "object"
        ? partial.validation
        : undefined,
    backgroundOps: Array.isArray(partial.backgroundOps)
      ? partial.backgroundOps.slice(0, 32)
      : [],
    pendingSteering: Array.isArray(partial.pendingSteering)
      ? partial.pendingSteering.slice(0, 16)
      : [],
    collaboration:
      partial.collaboration && typeof partial.collaboration === "object"
        ? partial.collaboration
        : undefined,
    usage:
      partial.usage && typeof partial.usage === "object" ? partial.usage : undefined,
    finalState:
      typeof partial.finalState === "string" ? partial.finalState : undefined,
    branch: typeof partial.branch === "string" ? partial.branch : undefined,
    sha: typeof partial.sha === "string" ? partial.sha : undefined,
    baseline:
      typeof partial.baseline === "string" ? partial.baseline : undefined,
    changedFiles: Array.isArray(partial.changedFiles)
      ? partial.changedFiles
          .filter((f) => typeof f === "string" && f.trim())
          .map((f) => String(f).trim())
          .slice(0, 200)
      : undefined,
    preferredEngine:
      typeof partial.preferredEngine === "string"
        ? partial.preferredEngine
        : undefined,
    continuityDisposition:
      typeof partial.continuityDisposition === "string"
        ? partial.continuityDisposition
        : undefined,
    interruptedAt:
      typeof partial.interruptedAt === "string"
        ? partial.interruptedAt
        : undefined,
    continuityReason:
      typeof partial.continuityReason === "string"
        ? partial.continuityReason.slice(0, 400)
        : undefined,
    inFlightStartedAt:
      typeof partial.inFlightStartedAt === "string"
        ? partial.inFlightStartedAt
        : undefined,
    inFlightEngine:
      typeof partial.inFlightEngine === "string"
        ? partial.inFlightEngine
        : undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Atomically persist a checkpoint.
 * @param {string} runtimeRoot
 * @param {G10TaskCheckpoint} checkpoint
 */
export function writeTaskCheckpoint(runtimeRoot, checkpoint) {
  const path = resolveCheckpointPath(runtimeRoot, checkpoint.taskId);
  mkdirSync(dirname(path), { recursive: true });
  const payload = {
    ...checkpoint,
    schema: "pathcode.g10.task-checkpoint.v1",
    updatedAt: new Date().toISOString(),
  };
  // Strip anything that looks like a secret key.
  const json = JSON.stringify(payload, null, 2);
  if (/(password|secret|token|credential|api[_-]?key)/i.test(json)) {
    // Redact known sensitive field names only — never store raw creds.
    const scrubbed = JSON.parse(json);
    for (const key of Object.keys(scrubbed)) {
      if (/(password|secret|token|credential|api[_-]?key)/i.test(key)) {
        delete scrubbed[key];
      }
    }
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(scrubbed, null, 2)}\n`, "utf8");
    renameSync(tmp, path);
  } else {
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, `${json}\n`, "utf8");
    renameSync(tmp, path);
  }
  updateCheckpointIndex(runtimeRoot, payload.taskId, path);
  return path;
}

/**
 * @param {string} runtimeRoot
 * @param {string} taskId
 * @returns {G10TaskCheckpoint | null}
 */
export function readTaskCheckpoint(runtimeRoot, taskId) {
  const path = resolveCheckpointPath(runtimeRoot, taskId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.taskId !== "string" || typeof raw.worktreePath !== "string") {
      return null;
    }
    return /** @type {G10TaskCheckpoint} */ (raw);
  } catch {
    return null;
  }
}

/**
 * Find the most recently updated resumable checkpoint.
 * @param {string} runtimeRoot
 * @returns {G10TaskCheckpoint | null}
 */
export function findLatestResumableCheckpoint(runtimeRoot) {
  const indexPath = resolveCheckpointIndexPath(runtimeRoot);
  if (!existsSync(indexPath)) return null;
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const entries = Array.isArray(index?.entries) ? index.entries : [];
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const e = entries[i];
      const taskId = typeof e?.taskId === "string" ? e.taskId : "";
      if (!taskId) continue;
      const cp = readTaskCheckpoint(runtimeRoot, taskId);
      if (!cp) continue;
      if (cp.finalState === "VERIFIED" || cp.finalState === "CANCELLED") continue;
      return cp;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {string} runtimeRoot
 * @param {string} taskId
 * @param {string} path
 */
function updateCheckpointIndex(runtimeRoot, taskId, path) {
  const indexPath = resolveCheckpointIndexPath(runtimeRoot);
  mkdirSync(dirname(indexPath), { recursive: true });
  /** @type {{ entries: Array<{ taskId: string, path: string, updatedAt: string }> }} */
  let index = { entries: [] };
  if (existsSync(indexPath)) {
    try {
      index = JSON.parse(readFileSync(indexPath, "utf8"));
      if (!Array.isArray(index.entries)) index.entries = [];
    } catch {
      index = { entries: [] };
    }
  }
  const now = new Date().toISOString();
  index.entries = index.entries.filter((e) => e.taskId !== taskId);
  index.entries.push({ taskId, path, updatedAt: now });
  if (index.entries.length > 40) {
    index.entries = index.entries.slice(-40);
  }
  const tmp = `${indexPath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  renameSync(tmp, indexPath);
}

/**
 * Merge patch into existing checkpoint and write.
 * @param {string} runtimeRoot
 * @param {string} taskId
 * @param {Partial<G10TaskCheckpoint>} patch
 */
export function patchTaskCheckpoint(runtimeRoot, taskId, patch) {
  const existing =
    readTaskCheckpoint(runtimeRoot, taskId) ||
    createCheckpointSkeleton({
      taskId,
      worktreePath: typeof patch.worktreePath === "string" ? patch.worktreePath : "",
      sessionId: typeof patch.sessionId === "string" ? patch.sessionId : taskId,
    });
  const next = createCheckpointSkeleton({
    ...existing,
    ...patch,
    taskId,
    worktreePath:
      typeof patch.worktreePath === "string"
        ? patch.worktreePath
        : existing.worktreePath,
  });
  writeTaskCheckpoint(runtimeRoot, next);
  return next;
}

/**
 * Best-effort remove of a checkpoint file (tests / cleanup).
 * @param {string} runtimeRoot
 * @param {string} taskId
 */
export function deleteTaskCheckpoint(runtimeRoot, taskId) {
  const path = resolveCheckpointPath(runtimeRoot, taskId);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* ignore */
  }
}

/**
 * Record honest interruption on a durable checkpoint (Gateway death, reboot).
 * Preserves extra fields (e.g. resultLifecycle) via full-object write.
 *
 * @param {string} runtimeRoot
 * @param {string} taskId
 * @param {string} [reason]
 * @returns {G10TaskCheckpoint | null}
 */
export function markTaskInterrupted(runtimeRoot, taskId, reason) {
  const existing = readTaskCheckpoint(runtimeRoot, taskId);
  if (!existing) return null;
  if (
    existing.finalState === "VERIFIED" ||
    existing.finalState === "PARTIALLY_VERIFIED" ||
    existing.finalState === "CANCELLED"
  ) {
    return existing;
  }
  const next = {
    ...existing,
    continuityDisposition: "interrupted",
    interruptedAt: new Date().toISOString(),
    continuityReason: String(
      reason || "Gateway or process interruption",
    ).slice(0, 400),
    updatedAt: new Date().toISOString(),
  };
  writeTaskCheckpoint(runtimeRoot, /** @type {G10TaskCheckpoint} */ (next));
  return /** @type {G10TaskCheckpoint} */ (next);
}

/**
 * Mark all incomplete checkpoints interrupted (e.g. after stale Gateway reclaim).
 * @param {string} runtimeRoot
 * @param {string} [reason]
 * @returns {string[]} taskIds marked
 */
export function markIncompleteCheckpointsInterrupted(runtimeRoot, reason) {
  const indexPath = resolveCheckpointIndexPath(runtimeRoot);
  /** @type {string[]} */
  const marked = [];
  if (!existsSync(indexPath)) return marked;
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const entries = Array.isArray(index?.entries) ? index.entries : [];
    for (const e of entries) {
      const taskId = typeof e?.taskId === "string" ? e.taskId : "";
      if (!taskId) continue;
      const cp = readTaskCheckpoint(runtimeRoot, taskId);
      if (!cp) continue;
      if (cp.finalState === "VERIFIED" || cp.finalState === "CANCELLED") continue;
      if (cp.continuityDisposition === "interrupted") continue;
      markTaskInterrupted(runtimeRoot, taskId, reason);
      marked.push(taskId);
    }
  } catch {
    return marked;
  }
  return marked;
}

/**
 * Clear interrupted markers after a successful continuity reconstruct/resume.
 * @param {string} runtimeRoot
 * @param {string} taskId
 * @param {string} [reason]
 */
export function clearTaskInterrupted(runtimeRoot, taskId, reason) {
  const existing = readTaskCheckpoint(runtimeRoot, taskId);
  if (!existing) return null;
  const next = {
    ...existing,
    continuityDisposition: "active",
    continuityReason: String(
      reason || "continuity restored — continuing same PATH task",
    ).slice(0, 400),
    updatedAt: new Date().toISOString(),
  };
  delete next.interruptedAt;
  writeTaskCheckpoint(runtimeRoot, /** @type {G10TaskCheckpoint} */ (next));
  return /** @type {G10TaskCheckpoint} */ (next);
}
