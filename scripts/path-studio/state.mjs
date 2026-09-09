/**
 * Path Studio — pure state reducer (PS1).
 *
 * READ-ONLY mirror of the session NDJSON seam. Every card maps to exactly one
 * real session.* event family and appears only when that event has arrived.
 * Never fabricates progress, percentages, ETAs, or success before its event.
 *
 * Integrity lock: renders exactly one sessionId at a time; events from any
 * other sessionId are ignored.
 */

/** Ordered state cards — engine sequence. */
export const STUDIO_CARD_ORDER = Object.freeze([
  "task",
  "preflight",
  "disclosure",
  "authority",
  "scope",
  "reading",
  "reasoning",
  "gate1",
  "edit",
  "recovery",
  "applying",
  "reobserved",
  "validationPlan",
  "validationRunning",
  "validationResult",
  "validationSkipped",
  "gate2",
  "terminal",
  "findings",
]);

/** @typedef {"pending" | "active" | "done" | "skipped" | "refused"} CardStatus */

/**
 * @returns {{
 *   sessionId: string | null,
 *   sinkEnded: boolean,
 *   cards: Record<string, { id: string, title: string, status: CardStatus, detail: string, arrived: boolean }>,
 *   heartbeat: { stage: string, elapsedMs: number } | null,
 *   acceptedTypes: string[],
 *   ignoredForeignCount: number,
 * }}
 */
export function createEmptyStudioState() {
  /** @type {Record<string, { id: string, title: string, status: CardStatus, detail: string, arrived: boolean }>} */
  const cards = {};
  const titles = {
    task: "Task",
    preflight: "Preflight",
    disclosure: "Disclosure / Policy",
    authority: "Authority",
    scope: "Scope",
    reading: "Reading",
    reasoning: "Reasoning",
    gate1: "Gate 1",
    edit: "Edit summary",
    recovery: "Recovery checkpoint",
    applying: "Applying",
    reobserved: "Re-observed",
    validationPlan: "Validation plan",
    validationRunning: "Validation running",
    validationResult: "Validation result",
    validationSkipped: "Validation skipped",
    gate2: "Gate 2",
    terminal: "Terminal disposition",
    findings: "Findings",
  };
  for (const id of STUDIO_CARD_ORDER) {
    cards[id] = {
      id,
      title: titles[id] ?? id,
      status: "pending",
      detail: "not yet",
      arrived: false,
    };
  }
  return {
    sessionId: null,
    sinkEnded: false,
    cards,
    heartbeat: null,
    acceptedTypes: [],
    ignoredForeignCount: 0,
  };
}

/**
 * @param {ReturnType<typeof createEmptyStudioState>} state
 * @param {string} cardId
 * @param {CardStatus} status
 * @param {string} detail
 */
function setCard(state, cardId, status, detail) {
  const card = state.cards[cardId];
  if (!card) return;
  card.status = status;
  card.detail = detail;
  card.arrived = true;
}

/**
 * Apply one event. Foreign sessionId events are ignored (PS1-N).
 * First event with a sessionId binds the Studio view.
 *
 * @param {ReturnType<typeof createEmptyStudioState>} state
 * @param {Record<string, unknown>} event
 * @param {{ sessionId?: string | null, decorateGate2Accepted?: boolean }} [opts]
 * @returns {ReturnType<typeof createEmptyStudioState>}
 */
export function applyStudioEvent(state, event, opts = {}) {
  if (!event || typeof event.type !== "string") return state;

  const eventSid =
    typeof event.sessionId === "string" && event.sessionId.trim() !== ""
      ? event.sessionId.trim()
      : null;

  // Bind or filter by session id.
  const forced =
    typeof opts.sessionId === "string" && opts.sessionId.trim() !== ""
      ? opts.sessionId.trim()
      : null;
  if (state.sessionId === null) {
    state.sessionId = forced ?? eventSid;
  }
  const active = state.sessionId;
  if (active !== null && eventSid !== null && eventSid !== active) {
    state.ignoredForeignCount += 1;
    return state;
  }
  if (forced !== null && eventSid !== null && eventSid !== forced) {
    state.ignoredForeignCount += 1;
    return state;
  }

  const type = event.type;
  state.acceptedTypes.push(type);

  switch (type) {
    case "session.task.received":
      setCard(
        state,
        "task",
        "done",
        typeof event.task === "string" ? event.task : "(task)",
      );
      break;
    case "session.preflight": {
      const branch = typeof event.branch === "string" ? event.branch : "?";
      const dirty = typeof event.dirtySummary === "string" ? event.dirtySummary : "?";
      setCard(state, "preflight", "done", `${branch}; ${dirty}`);
      break;
    }
    case "session.disclosure":
      setCard(
        state,
        "disclosure",
        "done",
        typeof event.kind === "string" ? event.kind : "disclosed",
      );
      break;
    case "session.authority": {
      const gate = typeof event.gate === "string" ? event.gate : "authority";
      const how =
        typeof event.admission === "string" ? event.admission : "challenge-required";
      setCard(state, "authority", "done", `${gate} — ${how}`);
      break;
    }
    case "session.scope.admitted": {
      const editable = Array.isArray(event.editable) ? event.editable.length : 0;
      const context = Array.isArray(event.context) ? event.context.length : 0;
      setCard(state, "scope", "done", `editable: ${editable} context: ${context}`);
      break;
    }
    case "session.reading": {
      const files = Array.isArray(event.files) ? event.files : [];
      setCard(state, "reading", "done", files.join(", ") || "reading");
      state.heartbeat = null;
      break;
    }
    case "session.reasoning": {
      const n = typeof event.call === "number" ? event.call : "?";
      const of = typeof event.of === "number" ? event.of : "?";
      setCard(state, "reasoning", "active", `call ${n} of ${of}`);
      break;
    }
    case "session.gate1":
      if (event.status === "grounded") {
        setCard(state, "gate1", "done", "grounded");
      } else {
        setCard(state, "gate1", "refused", String(event.code ?? "refused"));
      }
      state.heartbeat = null;
      break;
    case "session.edit.summary": {
      const path = typeof event.path === "string" ? event.path : "(file)";
      const before = typeof event.beforeBytes === "number" ? event.beforeBytes : 0;
      const after = typeof event.afterBytes === "number" ? event.afterBytes : 0;
      const prev = state.cards.edit.arrived ? `${state.cards.edit.detail}; ` : "";
      setCard(state, "edit", "done", `${prev}${path} ${before}→${after} bytes`);
      break;
    }
    case "session.recovery.checkpoint":
      setCard(
        state,
        "recovery",
        "done",
        `id ${event.id ?? "?"} — ${event.status ?? "READY"}`,
      );
      break;
    case "session.applying": {
      const files = Array.isArray(event.files) ? event.files : [];
      setCard(state, "applying", "active", `${files.length} file(s)`);
      break;
    }
    case "session.reobserved":
      setCard(state, "reobserved", "done", "re-observed");
      state.heartbeat = null;
      if (state.cards.applying.arrived) {
        state.cards.applying.status = "done";
      }
      break;
    case "session.validation.plan": {
      const checks = Array.isArray(event.checks) ? event.checks : [];
      setCard(state, "validationPlan", "done", `${checks.length} check(s)`);
      break;
    }
    case "session.validation.running":
      setCard(
        state,
        "validationRunning",
        "active",
        typeof event.check === "string" ? event.check : "running",
      );
      break;
    case "session.validation.result": {
      const check = typeof event.check === "string" ? event.check : "check";
      const status = typeof event.status === "string" ? event.status : "?";
      const prev = state.cards.validationResult.arrived
        ? `${state.cards.validationResult.detail}; `
        : "";
      setCard(state, "validationResult", "done", `${prev}${check} — ${status}`);
      if (state.cards.validationRunning.arrived) {
        state.cards.validationRunning.status = "done";
      }
      state.heartbeat = null;
      break;
    }
    case "session.validation.skipped":
      setCard(
        state,
        "validationSkipped",
        "skipped",
        typeof event.reason === "string" ? event.reason : "skipped",
      );
      // Honesty: do not invent running/result/gate2 success.
      state.heartbeat = null;
      break;
    case "session.gate2":
      if (event.status === "accepted") {
        setCard(state, "gate2", "done", "accepted");
      } else {
        setCard(state, "gate2", "refused", "not-established");
      }
      state.heartbeat = null;
      break;
    case "session.terminal": {
      const disposition =
        typeof event.disposition === "string" ? event.disposition : "unknown";
      const summary = typeof event.summary === "string" ? event.summary : "";
      setCard(
        state,
        "terminal",
        "done",
        summary ? `${disposition} — ${summary}` : disposition,
      );
      state.heartbeat = null;
      break;
    }
    case "session.finding": {
      const message = typeof event.message === "string" ? event.message : "";
      const prev = state.cards.findings.arrived ? `${state.cards.findings.detail}\n` : "";
      setCard(state, "findings", "done", `${prev}${message}`.trim());
      break;
    }
    case "session.cancelled":
      setCard(state, "terminal", "refused", "cancelled");
      state.heartbeat = null;
      break;
    case "session.internal_error":
      setCard(
        state,
        "findings",
        "done",
        typeof event.message === "string" ? event.message : "internal error",
      );
      break;
    case "session.heartbeat": {
      const stage = typeof event.stage === "string" ? event.stage : "stage";
      const elapsedMs = typeof event.elapsedMs === "number" ? event.elapsedMs : 0;
      // Liveness only — never invent a percentage or filling bar.
      state.heartbeat = { stage, elapsedMs };
      break;
    }
    default:
      break;
  }

  // P1 decoration probe hook — MUST NOT ship enabled.
  if (opts.decorateGate2Accepted === true && !state.cards.gate2.arrived) {
    setCard(state, "gate2", "done", "accepted");
  }

  return state;
}

/**
 * Fold an ordered event list into Studio state.
 * @param {ReadonlyArray<Record<string, unknown>>} events
 * @param {{ sessionId?: string | null, decorateGate2Accepted?: boolean }} [opts]
 */
export function reduceStudioEvents(events, opts = {}) {
  let state = createEmptyStudioState();
  for (const event of events) {
    applyStudioEvent(state, event, opts);
  }
  return state;
}

/**
 * Text rendering of Studio cards. Elapsed-only liveness; no % / ETA / bar.
 * @param {ReturnType<typeof createEmptyStudioState>} state
 */
export function renderStudioText(state) {
  const lines = [];
  lines.push("PATH STUDIO — read-only live mirror");
  lines.push(
    state.sessionId
      ? `session: ${state.sessionId}`
      : "session: (waiting for first event)",
  );
  if (state.ignoredForeignCount > 0) {
    lines.push(`ignored foreign-session events: ${state.ignoredForeignCount}`);
  }
  lines.push("");
  for (const id of STUDIO_CARD_ORDER) {
    const card = state.cards[id];
    if (!card) continue;
    // Skip cards never reached stay "pending / not yet"
    const mark =
      card.status === "pending"
        ? "[ ]"
        : card.status === "skipped"
          ? "[~]"
          : card.status === "refused"
            ? "[x]"
            : card.status === "active"
              ? "[>]"
              : "[*]";
    lines.push(`${mark} ${card.title}: ${card.detail}`);
  }
  if (state.heartbeat) {
    const sec = Math.floor(state.heartbeat.elapsedMs / 1000);
    lines.push("");
    lines.push(`liveness: working on ${state.heartbeat.stage} — ${sec}s`);
  }
  if (state.sinkEnded) {
    lines.push("");
    lines.push("(sink ended — final state)");
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Assert the rendered text contains no fabricated progress decoration.
 * @param {string} text
 */
export function assertNoFabricatedProgress(text) {
  if (/\d+\s*%/.test(text)) {
    throw new Error("fabricated percentage in Studio render");
  }
  if (/\bETA\b/i.test(text)) {
    throw new Error("fabricated ETA in Studio render");
  }
  if (/progress\s*bar|█|▓|filling/i.test(text)) {
    throw new Error("fabricated progress bar in Studio render");
  }
  return true;
}

/**
 * Stages reached in arrival order (for order-fidelity proofs).
 * @param {ReturnType<typeof createEmptyStudioState>} state
 */
export function arrivedCardSequence(state) {
  return STUDIO_CARD_ORDER.filter((id) => state.cards[id]?.arrived === true);
}
