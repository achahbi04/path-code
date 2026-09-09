/**
 * Phase 5G-R2 — structured session event stream.
 *
 * Single source of truth for anything that displays a living session.
 * Every event corresponds to an actual host/owner transition. No decorative
 * progress, no fabricated stages, no secrets, no raw model text beyond the
 * existing sanitized disclosure envelopes.
 */

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
]);

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
 * @param {{
 *   onEvent?: (event: Readonly<Record<string, unknown>>) => void,
 *   writeNdjson?: (line: string) => void,
 *   writeHumanFromEvents?: (text: string) => void,
 *   mode?: "human" | "ndjson" | "both",
 * }} [options]
 */
export function createSessionEventSink(options = {}) {
  /** @type {Readonly<Record<string, unknown>>[]} */
  const events = [];
  const mode = options.mode ?? "human";

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [fields]
   */
  function emit(type, fields = {}) {
    const event = createSessionEvent(type, fields);
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
  switch (type) {
    case "session.task.received":
      return "";
    case "session.preflight": {
      const dirty = typeof event.dirtySummary === "string" ? event.dirtySummary : "unknown";
      const branch = typeof event.branch === "string" ? event.branch : "(none)";
      const head = typeof event.head === "string" ? event.head : "(unknown)";
      return `Checking the working tree… (${branch} @ ${shortOid(head)}; ${dirty})\n`;
    }
    case "session.disclosure":
      return "";
    case "session.authority": {
      const gate = typeof event.gate === "string" ? event.gate : "authority";
      const how =
        typeof event.admission === "string" ? event.admission : "challenge-required";
      return `Authority: ${gate} — ${how}\n`;
    }
    case "session.scope.admitted": {
      const editable = Array.isArray(event.editable) ? event.editable.length : 0;
      const context = Array.isArray(event.context) ? event.context.length : 0;
      return `Scope admitted: editable: ${editable} context: ${context}\n`;
    }
    case "session.reading": {
      const files = Array.isArray(event.files) ? event.files : [];
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
      return `Gate 1: refused: ${event.code ?? "unknown"}\n`;
    }
    case "session.edit.summary": {
      const path = typeof event.path === "string" ? event.path : "(file)";
      const kind = typeof event.kind === "string" ? event.kind : "edit";
      const before = typeof event.beforeBytes === "number" ? event.beforeBytes : 0;
      const after = typeof event.afterBytes === "number" ? event.afterBytes : 0;
      return `Edit summary: ${path} (${kind}) ${before} → ${after} bytes\n`;
    }
    case "session.recovery.checkpoint": {
      const id = typeof event.id === "string" ? event.id : "(none)";
      return `Recovery checkpoint READY: ${id}\n`;
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
      const check = typeof event.check === "string" ? event.check : "check";
      return `Running admitted validation: ${check}\n`;
    }
    case "session.validation.result": {
      const check = typeof event.check === "string" ? event.check : "check";
      const status = typeof event.status === "string" ? event.status : "NOT_ATTEMPTED";
      return `Validation result: ${check} — ${status}\n`;
    }
    case "session.validation.skipped": {
      const reason =
        typeof event.reason === "string" ? event.reason : "validation not reached";
      return `Validation skipped: ${reason}\n`;
    }
    case "session.gate2": {
      if (event.status === "accepted") return "Gate 2: accepted.\n";
      return "Gate 2: not-established.\n";
    }
    case "session.terminal": {
      const disposition =
        typeof event.disposition === "string" ? event.disposition : "unknown";
      const summary = typeof event.summary === "string" ? event.summary : "";
      return summary
        ? `Session terminal: ${disposition} — ${summary}\n`
        : `Session terminal: ${disposition}\n`;
    }
    case "session.finding": {
      const severity = typeof event.severity === "string" ? event.severity : "info";
      const stage = typeof event.stage === "string" ? event.stage : "session";
      const message = typeof event.message === "string" ? event.message : "";
      return `Finding [${severity}/${stage}]: ${message}\n`;
    }
    case "session.cancelled":
      return "Cycle cancelled.\n";
    case "session.internal_error": {
      const message = typeof event.message === "string" ? event.message : "internal error";
      return `Internal error (session continues): ${message}\n`;
    }
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
