/**
 * Durable append-only Build event log.
 *
 * Records are NDJSON so a coordinator restart can replay from any monotonic
 * event id without depending on an in-memory publisher.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { ensureAg9RuntimeDirs } from "../ag9/layout.mjs";

const MAX_STRING = 2_000;
const SENSITIVE_KEY = /token|secret|password|authorization|cookie|api[_-]?key/i;

function safeBuildId(buildId) {
  return String(buildId || "build")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
}

export function resolveBuildEventPath(runtimeRoot, buildId) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  return join(dirs.metadata, "build-events", `${safeBuildId(buildId)}.events.ndjson`);
}

/**
 * Durable event records stay bounded. The live Build surface passes
 * surfaceViewSanitizeLimits() so the engineering timeline is not cut to 50.
 *
 * @param {unknown} value
 * @param {number} [depth]
 * @param {{ maxItems?: number, maxKeys?: number, maxDepth?: number }} [limits]
 */
export function sanitizeBuildEventValue(value, depth = 0, limits = undefined) {
  const maxItems = limits?.maxItems ?? 50;
  const maxKeys = limits?.maxKeys ?? 80;
  const maxDepth = limits?.maxDepth ?? 6;
  if (depth > maxDepth) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return value
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(
        /\b(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
        "$1=[redacted]",
      )
      .slice(0, MAX_STRING);
  }
  if (Array.isArray(value)) {
    const items = value.length > maxItems ? value.slice(0, maxItems) : value;
    return items.map((item) => sanitizeBuildEventValue(item, depth + 1, limits));
  }
  if (value && typeof value === "object") {
    const out = {};
    const keys = Object.entries(value);
    const limited = keys.length > maxKeys ? keys.slice(0, maxKeys) : keys;
    for (const [key, item] of limited) {
      out[key] = SENSITIVE_KEY.test(key)
        ? "[redacted]"
        : sanitizeBuildEventValue(item, depth + 1, limits);
    }
    return out;
  }
  return String(value).slice(0, MAX_STRING);
}

/** Limits for the operator surface projection. Not a second event store. */
export function surfaceViewSanitizeLimits() {
  return { maxItems: 1_000_000, maxKeys: 500, maxDepth: 16 };
}

function parseEvents(raw) {
  const events = [];
  for (const line of String(raw || "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (Number.isSafeInteger(event?.id) && event.id > 0) events.push(event);
    } catch {
      // A torn final append is ignored. Earlier append-only records remain valid.
    }
  }
  return events;
}

export function readBuildEvents(runtimeRoot, buildId, options = {}) {
  const path = resolveBuildEventPath(runtimeRoot, buildId);
  if (!existsSync(path)) return [];
  const afterId = Math.max(0, Number(options.afterId) || 0);
  const limit = Math.min(1_000, Math.max(1, Number(options.limit) || 250));
  return parseEvents(readFileSync(path, "utf8"))
    .filter((event) => event.id > afterId)
    .slice(0, limit);
}

export function appendBuildEvent(runtimeRoot, buildId, type, data = {}) {
  const path = resolveBuildEventPath(runtimeRoot, buildId);
  mkdirSync(dirname(path), { recursive: true });
  const previous = existsSync(path)
    ? parseEvents(readFileSync(path, "utf8")).slice(-1)[0]
    : null;
  const event = {
    id: (previous?.id || 0) + 1,
    buildId: String(buildId),
    type: String(type || "build.updated").slice(0, 120),
    at: new Date().toISOString(),
    data: sanitizeBuildEventValue(data),
  };
  appendFileSync(path, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return event;
}

function childState(previous, child) {
  return (previous?.children || []).find((candidate) => candidate.taskId === child.taskId)
    ?.dispatchState;
}

/**
 * Emit authoritative transition events from a before/after Build record pair.
 */
export function appendBuildTransitionEvents(runtimeRoot, previous, next) {
  const emitted = [];
  const emit = (type, data) =>
    emitted.push(appendBuildEvent(runtimeRoot, next.buildId, type, data));

  if (!previous) {
    emit("build.created", {
      intentRevision: next.intent?.outcomeRevision,
      status: next.loop?.status,
      originKind: next.originKind,
    });
  }
  if (
    previous &&
    previous.intent?.outcomeRevision !== next.intent?.outcomeRevision
  ) {
    emit("intent.revised", {
      intentRevision: next.intent?.outcomeRevision,
      previousRevision: previous.intent?.outcomeRevision,
    });
  }
  if (
    JSON.stringify(previous?.coordinator || null) !==
    JSON.stringify(next.coordinator || null)
  ) {
    emit("coordinator.updated", {
      autoRun: next.coordinator?.autoRun,
      owner: next.coordinator?.owner,
    });
  }
  if (
    JSON.stringify(previous?.productBrief || null) !==
    JSON.stringify(next.productBrief || null)
  ) {
    emit(
      next.productBrief?.source === "cognitive" && next.productBrief?.stale !== true
        ? "brief.accepted"
        : "brief.bootstrap",
      {
        intentRevision: next.productBrief?.intentRevision,
        revision: next.productBrief?.revision,
        source: next.productBrief?.source,
        productKind: next.productBrief?.productKind,
      },
    );
  }
  for (const child of next.children || []) {
    const before = childState(previous, child);
    if (before === child.dispatchState) continue;
    const prefix = child.kind || "child";
    emit(`${prefix}.${child.dispatchState}`, {
      taskId: child.taskId,
      actionId: child.actionId,
      kind: child.kind,
      intentRevision: child.intentRevision,
      authoritativeSha: child.authoritativeSha,
    });
  }
  if (
    previous &&
    previous.authoritativeSha !== next.authoritativeSha &&
    next.authoritativeSha
  ) {
    emit("adoption.completed", {
      authoritativeSha: next.authoritativeSha,
      previousSha: previous.authoritativeSha || null,
    });
  }
  if (
    previous &&
    (previous.previewUrl !== next.previewUrl ||
      previous.runtimeHealth !== next.runtimeHealth)
  ) {
    emit("runtime.updated", {
      previewUrl: next.previewUrl || null,
      runtimeHealth: next.runtimeHealth || null,
      authoritativeSha: next.authoritativeSha || null,
    });
  }
  if (
    previous &&
    JSON.stringify(previous.outcomeCriteria || []) !==
      JSON.stringify(next.outcomeCriteria || [])
  ) {
    emit("assessment.updated", {
      criteria: (next.outcomeCriteria || []).map((criterion) => ({
        id: criterion.id,
        status: criterion.status,
      })),
      intentRevision: next.intent?.outcomeRevision,
      authoritativeSha: next.authoritativeSha || null,
    });
  }
  if (
    previous?.loop?.status !== "complete" &&
    next.loop?.status === "complete"
  ) {
    emit("build.completed", {
      intentRevision: next.intent?.outcomeRevision,
      authoritativeSha: next.authoritativeSha || null,
    });
  }
  if (
    emitted.length === 0 &&
    previous?.loop?.status !== next.loop?.status
  ) {
    emit("build.updated", {
      status: next.loop?.status,
      intentRevision: next.intent?.outcomeRevision,
    });
  }
  return emitted;
}
