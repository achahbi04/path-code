/**
 * Phase 5G-R2 / PS1 — structured session event stream.
 *
 * Single source of truth for anything that displays a living session.
 * Every event corresponds to an actual host/owner transition. No decorative
 * progress, no fabricated stages, no secrets, no raw model text beyond the
 * existing sanitized disclosure envelopes.
 *
 * PS1: every event carries `sessionId`. Heartbeats prove liveness only
 * (stage + elapsedMs) — never progress, percentage, or ETA.
 */

import { randomUUID } from "node:crypto";
import { escapeForTerminalDisplay } from "./escape.mjs";

/** @typedef {string} SessionEventType */

export const SESSION_EVENT_TYPES = Object.freeze([
  "session.task.received",
  "session.preflight",
  "session.disclosure",
  "session.authority",
  "session.scope.admitted",
  "session.reading",
  "session.reasoning",
  "session.gate1",
  "session.edit.summary",
  "session.recovery.checkpoint",
  "session.applying",
  "session.reobserved",
  "session.validation.plan",
  "session.validation.running",
  "session.validation.result",
  "session.validation.skipped",
  "session.gate2",
  "session.terminal",
  "session.finding",
  "session.cancelled",
  "session.internal_error",
  // PS1 — liveness only (stage + elapsed). Never progress/ETA/percentage.
  "session.heartbeat",
  // GC1-c — truthful cloud lifecycle only (emitted from real host transitions).
  "session.cloud.selected",
  "session.environment.preparing",
  "session.hydration",
  "session.checkpoint.ready",
  "session.artifacts.saving",
  "session.cleanup",
  "session.cleanup.pending",
  "session.workstation.ready",
  "session.workstation.disposed",
  "session.machine.capabilities",
  "session.environment.unavailable",
  "session.infrastructure.failure",
  // AG1 — Antigravity engineering session (product-facing; no engine branding).
  "session.engineering.workspace",
  "session.engineering.activity",
  "session.engineering.tool",
  "session.engineering.result",
  "session.engineering.bridge",
  // AG4 — GitHub delivery (post-VERIFIED; not engineering authority).
  "session.delivery.phase",
  "session.delivery.approval",
  "session.delivery.result",
]);

/** Default heartbeat cadence while a stage await is in flight. */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 2_000;

/**
 * Mint a living-session id (one per pathcode process / Studio selection).
 * @returns {string}
 */
export function mintSessionId() {
  return randomUUID();
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} [fields]
 */
export function createSessionEvent(type, fields = {}) {
  const { type: _ignored, ts: _ignoredTs, ...safeFields } = fields;
  return Object.freeze({
    ...safeFields,
    type,
    ts: Date.now(),
  });
}

/**
 * Create an event sink. The ordered event list is the single source of truth;
 * NDJSON serializes it. Live terminal copy remains the host's real progress
 * writes (same transitions) — renderSessionEventHuman is available for UIs.
 *
 * Every emitted event is stamped with `sessionId` (integrity lock for Studio).
 *
 * @param {{
 *   sessionId: string,
 *   onEvent?: (event: Readonly<Record<string, unknown>>) => void,
 *   writeNdjson?: (line: string) => void,
 *   writeHumanFromEvents?: (text: string) => void,
 *   mode?: "human" | "ndjson" | "both",
 * }} options
 */
export function createSessionEventSink(options) {
  if (!options || typeof options.sessionId !== "string" || options.sessionId.trim() === "") {
    throw new Error("createSessionEventSink requires a non-empty sessionId");
  }
  const sessionId = options.sessionId.trim();
  /** @type {Readonly<Record<string, unknown>>[]} */
  const events = [];
  const mode = options.mode ?? "human";

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [fields]
   */
  function emit(type, fields = {}) {
    const { sessionId: _ignoredSid, ...rest } = fields;
    const event = createSessionEvent(type, { ...rest, sessionId });
    events.push(event);
    if (typeof options.onEvent === "function") {
      options.onEvent(event);
    }
    if (mode === "ndjson" || mode === "both") {
      if (typeof options.writeNdjson === "function") {
        options.writeNdjson(`${JSON.stringify(event)}\n`);
      }
    }
    // Optional structured human mirror (off by default — host owns live copy).
    if (
      (mode === "human" || mode === "both") &&
      typeof options.writeHumanFromEvents === "function"
    ) {
      const line = renderSessionEventHuman(event);
      if (line) options.writeHumanFromEvents(line);
    }
    return event;
  }

  return {
    emit,
    events: () => events.slice(),
    mode,
    sessionId,
  };
}

/**
 * Emit `session.heartbeat` on a fixed interval while a named stage is open.
 * Carries ONLY `{ stage, elapsedMs }` (+ type/ts/sessionId via emit).
 * Must be stopped before cycle end (R2-K: no leaked timers between cycles).
 *
 * @param {{
 *   emit: (type: string, fields?: Record<string, unknown>) => void,
 *   intervalMs?: number,
 *   now?: () => number,
 *   setIntervalFn?: typeof setInterval,
 *   clearIntervalFn?: typeof clearInterval,
 * }} options
 */
export function createHeartbeatController(options) {
  const intervalMs =
    typeof options.intervalMs === "number" && options.intervalMs > 0
      ? options.intervalMs
      : DEFAULT_HEARTBEAT_INTERVAL_MS;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const setIntervalFn =
    typeof options.setIntervalFn === "function" ? options.setIntervalFn : setInterval;
  const clearIntervalFn =
    typeof options.clearIntervalFn === "function"
      ? options.clearIntervalFn
      : clearInterval;

  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  /** @type {string | null} */
  let stage = null;
  /** @type {number | null} */
  let startedAt = null;

  function stop() {
    if (timer !== null) {
      clearIntervalFn(timer);
      timer = null;
    }
    stage = null;
    startedAt = null;
  }

  /**
   * Begin heartbeats for a stage the engine has actually entered.
   * @param {string} stageName
   */
  function begin(stageName) {
    stop();
    if (typeof stageName !== "string" || stageName.trim() === "") return;
    stage = stageName.trim();
    startedAt = now();
    timer = setIntervalFn(() => {
      if (stage === null || startedAt === null) return;
      options.emit("session.heartbeat", {
        stage,
        elapsedMs: Math.max(0, now() - startedAt),
      });
    }, intervalMs);
    // Do not keep the process alive solely for heartbeats.
    if (
      timer &&
      typeof timer === "object" &&
      typeof /** @type {{ unref?: () => void }} */ (timer).unref === "function"
    ) {
      /** @type {{ unref: () => void }} */ (timer).unref();
    }
  }

  return {
    begin,
    stop,
    /** @returns {string | null} */
    activeStage: () => stage,
  };
}

/**
 * Live terminal rendering of one event. Empty string = no extra line
 * (disclosure bodies are still rendered by the host's existing screens).
 *
 * @param {Readonly<Record<string, unknown>>} event
 */
export function renderSessionEventHuman(event) {
  const type = event.type;
  /** Escape every interpolated string so hostile ANSI never reaches the TTY raw. */
  const s = (value, fallback = "") =>
    escapeForTerminalDisplay(typeof value === "string" ? value : fallback);
  switch (type) {
    case "session.task.received":
      return "";
    case "session.preflight": {
      const dirty = s(event.dirtySummary, "unknown");
      const branch = s(event.branch, "(none)");
      const headRaw = typeof event.head === "string" ? event.head : "(unknown)";
      const head = s(shortOid(headRaw), "(unknown)");
      return `Checking the working tree… (${branch} @ ${head}; ${dirty})\n`;
    }
    case "session.disclosure":
      return "";
    case "session.authority": {
      const gate = s(event.gate, "authority");
      const how = s(event.admission, "challenge-required");
      return `Authority: ${gate} — ${how}\n`;
    }
    case "session.scope.admitted": {
      const editable = Array.isArray(event.editable) ? event.editable.length : 0;
      const context = Array.isArray(event.context) ? event.context.length : 0;
      return `Scope admitted: editable: ${editable} context: ${context}\n`;
    }
    case "session.reading": {
      const files = Array.isArray(event.files)
        ? event.files.map((f) => s(typeof f === "string" ? f : String(f)))
        : [];
      return files.length > 0
        ? `Reading approved files… (${files.join(", ")})\n`
        : "Reading approved files…\n";
    }
    case "session.reasoning": {
      const n = typeof event.call === "number" ? event.call : "?";
      const of = typeof event.of === "number" ? event.of : "?";
      return `Reasoning… (call ${n} of ${of})\n`;
    }
    case "session.gate1": {
      if (event.status === "grounded") return "Gate 1: grounded.\n";
      return `Gate 1: refused: ${s(event.code, "unknown")}\n`;
    }
    case "session.edit.summary": {
      const path = s(event.path, "(file)");
      const kind = s(event.kind, "edit");
      const before = typeof event.beforeBytes === "number" ? event.beforeBytes : 0;
      const after = typeof event.afterBytes === "number" ? event.afterBytes : 0;
      return `Edit summary: ${path} (${kind}) ${before} → ${after} bytes\n`;
    }
    case "session.recovery.checkpoint": {
      const id = s(event.id, "(none)");
      return `Recovery checkpoint READY: ${id}\n`;
    }
    case "session.checkpoint.ready": {
      const id = s(event.id, "(none)");
      return `Recovery checkpoint READY: ${id}\n`;
    }
    case "session.cloud.selected": {
      const config = s(event.config, "cloud");
      return `Execution: cloud (${config})\n`;
    }
    case "session.environment.preparing": {
      const config = s(event.config, "workstation");
      return `Preparing cloud environment… (${config})\n`;
    }
    case "session.hydration": {
      const files = typeof event.files === "number" ? event.files : "?";
      return `Hydrating admitted snapshot… (${files} file(s))\n`;
    }
    case "session.artifacts.saving":
      return "Saving task artifacts…\n";
    case "session.cleanup":
      return "Cleaning up workstation…\n";
    case "session.cleanup.pending": {
      const id =
        typeof event.workstationId === "string"
          ? s(event.workstationId)
          : typeof event.count === "number"
            ? `${event.count} resource(s)`
            : "resource";
      return `Cleanup pending — reconcile before next cloud task (${id})\n`;
    }
    case "session.workstation.ready":
      return "Workstation execution-ready.\n";
    case "session.workstation.disposed":
      return "Workstation disposed.\n";
    case "session.machine.capabilities":
      return "Engineering computer capabilities queried.\n";
    case "session.environment.unavailable":
    case "session.infrastructure.failure": {
      const msg =
        typeof event.message === "string"
          ? event.message
          : typeof event.code === "string"
            ? event.code
            : "infrastructure failure";
      return `Infrastructure failure: ${msg}\n`;
    }
    case "session.applying": {
      const files = Array.isArray(event.files) ? event.files : [];
      return files.length > 0
        ? `Applying ${files.length} file(s)…\n`
        : "Applying…\n";
    }
    case "session.reobserved":
      return "Re-observed post-edit state.\n";
    case "session.validation.plan": {
      const checks = Array.isArray(event.checks) ? event.checks : [];
      return `Validation plan: ${checks.length} check(s)\n`;
    }
    case "session.validation.running": {
      const check = s(event.check, "check");
      return `Running admitted validation: ${check}\n`;
    }
    case "session.validation.result": {
      const check = s(event.check, "check");
      const status = s(event.status, "NOT_ATTEMPTED");
      return `Validation result: ${check} — ${status}\n`;
    }
    case "session.validation.skipped": {
      const reason = s(event.reason, "validation not reached");
      return `Validation skipped: ${reason}\n`;
    }
    case "session.gate2": {
      if (event.status === "accepted") return "Gate 2: accepted.\n";
      return "Gate 2: not-established.\n";
    }
    case "session.terminal": {
      const disposition = s(event.disposition, "unknown");
      const summary = s(event.summary, "");
      return summary
        ? `Session terminal: ${disposition} — ${summary}\n`
        : `Session terminal: ${disposition}\n`;
    }
    case "session.finding": {
      const severity = s(event.severity, "info");
      const stage = s(event.stage, "session");
      const message = s(event.message, "");
      return `Finding [${severity}/${stage}]: ${message}\n`;
    }
    case "session.cancelled":
      return "Cycle cancelled.\n";
    case "session.engineering.workspace": {
      const ws = s(event.workspace, "task workspace");
      return `Task workspace ready.\n`;
    }
    case "session.engineering.activity": {
      const label = s(event.label, s(event.activity, "Working"));
      const detail =
        typeof event.detail === "string" && event.detail.trim() !== ""
          ? ` — ${s(event.detail)}`
          : "";
      return `${label}${detail}\n`;
    }
    case "session.engineering.tool": {
      const summary = s(event.summary, s(event.tool, "tool"));
      return `Tool: ${summary}\n`;
    }
    case "session.engineering.result": {
      const classification = s(event.classification, "NOT_VERIFIED");
      const files = Array.isArray(event.changedFiles)
        ? event.changedFiles.length
        : 0;
      const untouched = event.primaryUntouched === true ? "yes" : "no";
      return `Engineering result: ${classification} · ${files} file(s) · primary untouched: ${untouched}\n`;
    }
    case "session.engineering.bridge": {
      // Development evidence only — never print engine branding to the living UI.
      return "";
    }
    case "session.delivery.phase": {
      const phase = s(event.phase, "GitHub delivery");
      return `Delivery: ${phase}\n`;
    }
    case "session.delivery.approval": {
      return "Awaiting publication approval\n";
    }
    case "session.delivery.result": {
      const status = s(event.status, "DONE");
      return `Delivery result: ${status}\n`;
    }
    case "session.internal_error": {
      const message = s(event.message, "internal error");
      return `Internal error (session continues): ${message}\n`;
    }
    case "session.heartbeat":
      // Liveness only — host keeps its own progress copy; Studio renders elapsed.
      return "";
    default:
      return "";
  }
}

/**
 * @param {string} oid
 */
function shortOid(oid) {
  if (typeof oid !== "string" || oid.length < 8) return oid;
  if (oid === "(unborn)" || oid === "(unknown)" || oid === "(none)") return oid;
  return oid.slice(0, 12);
}

/**
 * Parse NDJSON event lines (ignores non-JSON / human lines).
 * @param {string} text
 */
export function parseSessionEventNdjson(text) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed[0] !== "{") continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
        out.push(parsed);
      }
    } catch {
      // ignore non-event lines
    }
  }
  return out;
}
