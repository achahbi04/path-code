/**
 * Phase GC1-c — minimal task journal outside the repository and workstation.
 * Crash accountability only — not a project-memory platform.
 */

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_JOURNAL_ROOT = join(homedir(), ".pathcode", "gc1c-journal");

export const CLEANUP_PENDING = "CLEANUP_PENDING";
export const CLEANUP_VERIFIED = "CLEANUP_VERIFIED";

/**
 * @param {{ rootDir?: string }} [opts]
 */
export function createTaskJournal(opts = {}) {
  const rootDir = resolveJournalRoot(opts.rootDir);
  mkdirSync(rootDir, { recursive: true });

  function taskPath(taskId) {
    return join(rootDir, `${taskId}.json`);
  }

  function readTask(taskId) {
    const p = taskPath(taskId);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  function writeTask(record) {
    const p = taskPath(record.taskId);
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    renameSync(tmp, p);
    return record;
  }

  /**
   * @param {Partial<{
   *   taskId: string,
   *   snapshotId: string,
   *   manifestDigest: string,
   *   imageDigest: string,
   *   workstationId: string,
   *   checkpointId: string | null,
   * }>} seed
   */
  function beginTask(seed = {}) {
    const taskId = seed.taskId || randomUUID();
    const record = {
      taskId,
      snapshotId: seed.snapshotId ?? null,
      manifestDigest: seed.manifestDigest ?? null,
      imageDigest: seed.imageDigest ?? null,
      workstationId: seed.workstationId ?? null,
      checkpointId: seed.checkpointId ?? null,
      cleanupState: null,
      cleanupResourceIds: [],
      events: [],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      gate2Disposition: null,
      artifacts: {},
      dispatchIntents: [],
      outcomes: [],
    };
    return writeTask(record);
  }

  /**
   * @param {string} taskId
   * @param {string} type
   * @param {Record<string, unknown>} [fields]
   */
  function appendEvent(taskId, type, fields = {}) {
    const record = readTask(taskId);
    if (!record) {
      const err = new Error(`unknown journal task ${taskId}`);
      err.code = "JOURNAL_UNKNOWN_TASK";
      throw err;
    }
    const event = {
      type,
      ts: Date.now(),
      ...fields,
    };
    record.events.push(event);
    if (type === "dispatch.intent") {
      record.dispatchIntents.push(event);
    }
    if (type === "outcome" || type.startsWith("outcome.")) {
      record.outcomes.push(event);
    }
    if (type === "gate2" && fields.disposition != null) {
      record.gate2Disposition = fields.disposition;
    }
    if (fields.checkpointId != null) {
      record.checkpointId = fields.checkpointId;
    }
    if (fields.workstationId != null) {
      record.workstationId = fields.workstationId;
    }
    if (fields.artifacts && typeof fields.artifacts === "object") {
      record.artifacts = { ...record.artifacts, ...fields.artifacts };
    }
    record.updatedAtMs = Date.now();
    return writeTask(record);
  }

  function loadTask(taskId) {
    return readTask(taskId);
  }

  /**
   * @param {string} taskId
   * @param {{ resourceIds?: string[], detail?: string }} [info]
   */
  function markCleanupPending(taskId, info = {}) {
    const record = readTask(taskId) || beginTask({ taskId });
    record.cleanupState = CLEANUP_PENDING;
    record.cleanupResourceIds = [...(info.resourceIds ?? record.cleanupResourceIds ?? [])];
    record.cleanupDetail = info.detail ?? record.cleanupDetail ?? null;
    record.updatedAtMs = Date.now();
    record.events.push({
      type: "cleanup.pending",
      ts: Date.now(),
      resourceIds: record.cleanupResourceIds,
      detail: record.cleanupDetail,
    });
    return writeTask(record);
  }

  /**
   * @param {string} taskId
   */
  function markCleanupVerified(taskId) {
    const record = readTask(taskId);
    if (!record) {
      const err = new Error(`unknown journal task ${taskId}`);
      err.code = "JOURNAL_UNKNOWN_TASK";
      throw err;
    }
    record.cleanupState = CLEANUP_VERIFIED;
    record.updatedAtMs = Date.now();
    record.events.push({ type: "cleanup.verified", ts: Date.now() });
    return writeTask(record);
  }

  /** Crash reconciliation: list CLEANUP_PENDING records. */
  function listCleanupPending() {
    /** @type {object[]} */
    const out = [];
    for (const name of readdirSync(rootDir)) {
      if (!name.endsWith(".json")) continue;
      const record = readTask(name.slice(0, -".json".length));
      if (record && record.cleanupState === CLEANUP_PENDING) {
        out.push(record);
      }
    }
    return out.sort((a, b) => (a.updatedAtMs ?? 0) - (b.updatedAtMs ?? 0));
  }

  function hasCleanupPending() {
    return listCleanupPending().length > 0;
  }

  return {
    rootDir,
    beginTask,
    appendEvent,
    loadTask,
    markCleanupPending,
    markCleanupVerified,
    listCleanupPending,
    hasCleanupPending,
  };
}

function resolveJournalRoot(rootDir) {
  if (typeof rootDir === "string" && rootDir.trim() !== "") {
    return rootDir.trim();
  }
  return DEFAULT_JOURNAL_ROOT;
}
