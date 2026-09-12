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
    /** GC1-c living product projection (event-driven; never minted). */
    product: {
      pathPhase: "Idle",
      cloudFooter: null,
      region: null,
      projectFiles: /** @type {string[]} */ ([]),
      /** @type {Array<{ path: string, role: string }>} */
      projectEntries: [],
      branch: null,
      dirtySummary: null,
      projectName: null,
      editableCount: 0,
      contextCount: 0,
      hydrationFiles: null,
      cloudSelected: false,
      workstationReady: false,
      disposed: false,
      infraFailure: null,
      modelId: null,
      providerLabel: null,
      providerTurn: null,
      /** @type {string[] | null} */
      machineLines: null,
      pathDetail: null,
      /** AG1 living product — when true, evidence uses engineering lifecycle. */
      ag1: false,
      ag1Mutation: false,
      /** @type {string[]} */
      ag1Activities: [],
    },
  };
}

/**
 * Success dispositions that may legally render Complete (after cleanup when cloud).
 * @param {string} disposition
 * @param {string} [summary]
 */
export function isSuccessfulTerminalDisposition(disposition, summary = "") {
  const blob = `${disposition} ${summary}`;
  return /MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED|CONFIGURED VALIDATION ACCEPTED|EDIT APPLIED · CONFIGURED VALIDATION ACCEPTED/i.test(
    blob,
  );
}

/**
 * @param {string} disposition
 * @param {string} [summary]
 * @returns {"Complete"|"Failed"|"Blocked"|"Cancelled"|"Unknown"}
 */
export function classifyTerminalPathPhase(disposition, summary = "") {
  const blob = `${disposition} ${summary}`;
  if (/cancel|declined|CREDENTIAL_CANCELLED/i.test(blob)) return "Cancelled";
  if (
    /ESCALATION|AUTONOMY_ESCALATION|PRIMARY_MUTATED|cleanup\.pending|CLEANUP_PENDING|AG1_AUTH_REQUIRED|DIRTY_PRIMARY_TREE|DETACHED_HEAD_BLOCKED|GIT_IDENTITY_REQUIRED/i.test(
      blob,
    )
  ) {
    return "Blocked";
  }
  // AG1 independent final result classifications — never map failure to Complete.
  const disp = String(disposition || "").trim();
  if (/^VERIFIED$/i.test(disp)) return "Verified";
  if (/^PARTIALLY_VERIFIED$/i.test(disp)) return "Partially verified";
  if (/^FAILED$/i.test(disp)) return "Failed";
  if (/^NOT_VERIFIED$/i.test(disp)) return "Not verified";
  if (/^AG1_/i.test(disp)) return "Failed";
  if (isSuccessfulTerminalDisposition(disposition, summary)) return "Complete";
  if (/UNKNOWN|^unknown$/i.test(disp)) return "Unknown";
  // Fail closed: non-success outcomes never render as Complete.
  if (
    /fail|error|refuse|not.?established|NOT_READY|ACQUIRE|CREDENTIAL|unavailable|GC1|ENV_POLICY|STALE|GAP|DRIFT|CALL_FAILED|AUTH_FAILED|SNAPSHOT|REQUIRED|UNAVAILABLE|INVENTORY|MUTATION_STALE|VALIDATION_|SCOPE_|ADAPTER_|BRAIN_|H_REFUSED|EDIT_|CHECK_/i.test(
      blob,
    )
  ) {
    return "Failed";
  }
  return "Failed";
}

/**
 * ONE authoritative PATH phase for PROJECT/PATH/EVIDENCE/footer — never optimistic Complete.
 * @param {ReturnType<typeof createEmptyStudioState>} state
 */
export function projectAuthoritativePathPhase(state) {
  const product = state.product || createEmptyStudioState().product;
  const terminal = state.cards?.terminal;
  const recorded = product.pathPhase || "Idle";

  if (product.infraFailure) {
    return "Infrastructure failure";
  }

  // Cloud mid-flight always wins over a premature terminal Complete.
  if (product.cloudSelected && !product.disposed) {
    if (/Cleaning up/i.test(recorded) || /Cleaning up/i.test(product.cloudFooter || "")) {
      return "Cleaning up";
    }
    if (/Starting workstation/i.test(recorded) || /Starting workstation/i.test(product.cloudFooter || "")) {
      if (terminal?.arrived) {
        const classified = classifyTerminalPathPhase(
          String(terminal.detail || ""),
          "",
        );
        if (classified !== "Complete") return classified === "Failed" && /EXECUTION_NOT_READY|ACQUIRE|Infrastructure/i.test(String(terminal.detail || ""))
          ? "Infrastructure failure"
          : classified === "Failed"
            ? "Failed"
            : classified;
      }
      return "Starting workstation";
    }
    if (/Hydrating/i.test(recorded)) return "Hydrating";
    if (/Preparing dependencies|Preparing environment/i.test(recorded)) {
      return recorded;
    }
  }

  if (terminal?.arrived) {
    const parts = String(terminal.detail || "").split(" — ");
    const disposition = parts[0] || terminal.detail || "";
    const summary = parts.slice(1).join(" — ");
    const classified = classifyTerminalPathPhase(disposition, summary);
    if (classified === "Complete" || classified === "Verified") {
      if (product.cloudSelected && !product.disposed) {
        return /Cleaning up/i.test(product.cloudFooter || "")
          ? "Cleaning up"
          : "Saving result";
      }
      if (state.cards.gate2?.arrived && state.cards.gate2.status !== "done") {
        return "Failed";
      }
      // AG1: Verified is the success terminal; legacy Complete remains for Gate2 success.
      return classified === "Verified" ? "Verified" : "Complete";
    }
    if (
      classified === "Failed" &&
      /EXECUTION_NOT_READY|ACQUIRE_FAILED|REMOTE_|Infrastructure|environment unavailable/i.test(
        `${disposition} ${summary}`,
      )
    ) {
      return "Infrastructure failure";
    }
    return classified;
  }

  if (
    state.cards.validationRunning?.status === "active" &&
    recorded !== "Investigating failure"
  ) {
    return "Testing";
  }

  return recorded;
}

/**
 * @param {string} relativePath
 * @param {{ editable?: boolean, context?: boolean, modified?: boolean }} flags
 */
function fileRole(relativePath, flags) {
  if (flags.modified) return "modified remotely";
  if (flags.editable) return "editable";
  const base = String(relativePath).split("/").pop() || "";
  if (/\.test\.|\.spec\.|_test\.|tests?\//i.test(relativePath)) return "validation";
  if (
    /^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig.*\.json|Cargo\.toml|go\.mod|pom\.xml|build\.gradle)/i.test(
      base,
    )
  ) {
    return "execution";
  }
  if (flags.context) return "context";
  return "support";
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

function setPathPhase(state, phase) {
  if (!state.product) return;
  state.product.pathPhase = phase;
}

function setCloudFooter(state, text) {
  if (!state.product) return;
  state.product.cloudFooter = text;
  if (text && /Disposed/i.test(text)) {
    state.product.disposed = true;
  }
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
  if (!state.product) {
    state.product = createEmptyStudioState().product;
  }

  switch (type) {
    case "session.task.received":
      setCard(
        state,
        "task",
        "done",
        typeof event.task === "string"
          ? event.task
          : typeof event.preview === "string"
            ? event.preview
            : "(task)",
      );
      if (event.mode === "ag1") {
        state.product.ag1 = true;
      }
      if (typeof event.modelId === "string") state.product.modelId = event.modelId;
      if (typeof event.provider === "string") {
        state.product.providerLabel = event.provider;
      }
      setPathPhase(state, "Understanding");
      break;
    case "session.preflight": {
      const branch = typeof event.branch === "string" ? event.branch : "?";
      const dirty = typeof event.dirtySummary === "string" ? event.dirtySummary : "?";
      setCard(state, "preflight", "done", `${branch}; ${dirty}`);
      state.product.branch = branch;
      state.product.dirtySummary = dirty;
      if (typeof event.projectName === "string" && event.projectName.trim()) {
        state.product.projectName = event.projectName.trim();
      }
      setPathPhase(state, "Scoping");
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
      const editable = Array.isArray(event.editable) ? event.editable : [];
      const context = Array.isArray(event.context) ? event.context : [];
      setCard(
        state,
        "scope",
        "done",
        `editable: ${editable.length} context: ${context.length}`,
      );
      state.product.editableCount = editable.length;
      state.product.contextCount = context.length;
      const editableSet = new Set(editable.map(String));
      const contextSet = new Set(context.map(String));
      const files = [
        ...editable.map(String),
        ...context.map(String).filter((p) => !editableSet.has(p)),
      ];
      state.product.projectFiles = files.slice(0, 12);
      state.product.projectEntries = files.slice(0, 12).map((path) => ({
        path,
        role: fileRole(path, {
          editable: editableSet.has(path),
          context: contextSet.has(path),
        }),
      }));
      setPathPhase(state, "Scoping");
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
      state.product.providerTurn = { call: n, of };
      if (typeof event.modelId === "string") {
        state.product.modelId = event.modelId;
      }
      if (typeof event.provider === "string") {
        state.product.providerLabel = event.provider;
      }
      setPathPhase(state, "Understanding");
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
      setPathPhase(state, "Correcting");
      break;
    }
    case "session.recovery.checkpoint":
    case "session.checkpoint.ready":
      setCard(
        state,
        "recovery",
        "done",
        `id ${event.id ?? "?"} — ${event.status ?? "READY"}`,
      );
      setPathPhase(state, "Checkpointing");
      break;
    case "session.applying": {
      const files = Array.isArray(event.files) ? event.files : [];
      setCard(state, "applying", "active", `${files.length} file(s)`);
      setPathPhase(state, "Applying");
      if (files.length > 0) {
        const first = String(files[0]);
        state.product.pathDetail = first;
        const entries = Array.isArray(state.product.projectEntries)
          ? state.product.projectEntries
          : [];
        state.product.projectEntries = entries.map((e) =>
          files.map(String).includes(e.path)
            ? { ...e, role: "modified remotely" }
            : e,
        );
      }
      break;
    }
    case "session.reobserved":
      setCard(state, "reobserved", "done", "re-observed");
      state.heartbeat = null;
      if (state.cards.applying.arrived) {
        state.cards.applying.status = "done";
      }
      setPathPhase(state, "Verifying");
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
      setPathPhase(state, "Testing");
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
      // Only accumulate AG1 check rows on the Antigravity product path.
      if (state.product.ag1 === true) {
        if (!Array.isArray(state.product.ag1Checks)) state.product.ag1Checks = [];
        state.product.ag1Checks.push({
          id: check,
          kind: typeof event.kind === "string" ? event.kind : check,
          ok: event.ok === true || status === "PASSED",
        });
      }
      state.heartbeat = null;
      if (/fail|error|not.?pass/i.test(status)) {
        setPathPhase(state, "Investigating failure");
      } else {
        setPathPhase(state, "Verifying");
      }
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
      const classified = classifyTerminalPathPhase(disposition, summary);
      if (classified === "Complete" && state.product.cloudSelected && !state.product.disposed) {
        setPathPhase(state, "Saving result");
      } else if (
        classified === "Failed" &&
        /EXECUTION_NOT_READY|ACQUIRE|REMOTE_|environment unavailable|Infrastructure/i.test(
          `${disposition} ${summary}`,
        )
      ) {
        state.product.infraFailure =
          summary || disposition || "execution environment unavailable";
        setPathPhase(state, "Infrastructure failure");
      } else {
        setPathPhase(state, classified);
      }
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
      setPathPhase(state, "Cancelled");
      break;
    case "session.internal_error":
      setCard(
        state,
        "findings",
        "done",
        typeof event.message === "string" ? event.message : "internal error",
      );
      setPathPhase(state, "Failed");
      break;
    case "session.heartbeat": {
      const stage = typeof event.stage === "string" ? event.stage : "stage";
      const elapsedMs = typeof event.elapsedMs === "number" ? event.elapsedMs : 0;
      // Liveness only — never invent a percentage or filling bar.
      state.heartbeat = { stage, elapsedMs };
      break;
    }
    case "session.cloud.selected": {
      state.product.cloudSelected = true;
      if (typeof event.region === "string") state.product.region = event.region;
      setPathPhase(state, "Preparing environment");
      setCloudFooter(
        state,
        `☁ ${event.region || "cloud"} · Engineering Image · Selected`,
      );
      break;
    }
    case "session.environment.preparing": {
      setPathPhase(state, "Starting workstation");
      const config = typeof event.config === "string" ? event.config : "workstation";
      setCloudFooter(state, `☁ Starting workstation · ${config}`);
      break;
    }
    case "session.workstation.ready": {
      setPathPhase(state, "Preparing environment");
      state.product.workstationReady = true;
      setCloudFooter(
        state,
        `☁ ${state.product.region || "europe-west4"} · Engineering Image · Ready`,
      );
      break;
    }
    case "session.machine.capabilities": {
      const lines = Array.isArray(event.lines)
        ? event.lines.map(String)
        : null;
      if (lines && lines.length > 0) {
        state.product.machineLines = lines;
      }
      break;
    }
    case "session.hydration": {
      setPathPhase(state, "Hydrating");
      const files = typeof event.files === "number" ? event.files : null;
      state.product.hydrationFiles = files;
      const bytes =
        typeof event.bytes === "number" ? event.bytes : null;
      state.product.pathDetail =
        files != null
          ? `${files} files${bytes != null ? ` · ${(bytes / 1024).toFixed(1)} KB` : ""}`
          : null;
      setCloudFooter(
        state,
        `☁ ${state.product.region || "europe-west4"} · Engineering Image · Hydrating${
          files != null ? ` · ${files} file(s)` : ""
        }`,
      );
      break;
    }
    case "session.artifacts.saving":
      setPathPhase(state, "Saving artifacts");
      setCloudFooter(state, `☁ Saving artifacts…`);
      break;
    case "session.cleanup":
      setPathPhase(state, "Cleaning up");
      setCloudFooter(state, "☁ Cleaning up…");
      break;
    case "session.cleanup.pending":
      setPathPhase(state, "Blocked");
      setCloudFooter(state, "☁ Cleanup pending");
      break;
    case "session.workstation.disposed":
      setCloudFooter(state, "☁ Disposed ✓");
      state.product.disposed = true;
      // Promote deferred Complete only after dispose when terminal was successful.
      if (state.cards.terminal?.arrived) {
        const parts = String(state.cards.terminal.detail || "").split(" — ");
        if (isSuccessfulTerminalDisposition(parts[0] || "", parts.slice(1).join(" — "))) {
          if (
            !state.cards.gate2?.arrived ||
            state.cards.gate2.status === "done"
          ) {
            setPathPhase(state, "Complete");
          }
        }
      }
      break;
    case "session.engineering.workspace": {
      state.product.ag1 = true;
      setCard(
        state,
        "recovery",
        "done",
        typeof event.baselineHead === "string"
          ? `baseline ${event.baselineHead.slice(0, 12)}`
          : "task workspace",
      );
      setPathPhase(state, "Understanding");
      break;
    }
    case "session.engineering.bridge": {
      state.product.ag1 = true;
      if (typeof event.detail === "string") {
        state.product.pathDetail = event.detail.slice(0, 80);
      }
      break;
    }
    case "session.engineering.activity": {
      state.product.ag1 = true;
      const activity =
        typeof event.activity === "string" ? event.activity : "";
      const label =
        typeof event.label === "string"
          ? event.label
          : activity || "Working";
      // Agent "complete" is NOT a product terminal — only PATH validation is.
      if (/^complete$/i.test(activity) || /^complete$/i.test(label)) {
        setPathPhase(state, "Finishing");
        break;
      }
      if (/^failed$/i.test(activity) || /^failed$/i.test(label)) {
        setPathPhase(state, "Failed");
        break;
      }
      setPathPhase(state, label);
      if (/edit|implement/i.test(label)) {
        setCard(state, "applying", "active", label);
        state.product.ag1Mutation = true;
      } else if (/test|verif/i.test(label)) {
        setCard(state, "validationRunning", "active", label);
      } else if (/inspect|read|understand/i.test(label)) {
        setCard(state, "reading", "active", label);
      }
      if (!Array.isArray(state.product.ag1Activities)) {
        state.product.ag1Activities = [];
      }
      if (state.product.ag1Activities[state.product.ag1Activities.length - 1] !== label) {
        state.product.ag1Activities.push(label);
      }
      break;
    }
    case "session.engineering.tool": {
      state.product.ag1 = true;
      const summary =
        typeof event.summary === "string"
          ? event.summary
          : typeof event.tool === "string"
            ? event.tool
            : "tool";
      if (event.kind === "file_edit") {
        setCard(state, "edit", "done", summary.slice(0, 120));
        state.product.ag1Mutation = true;
        if (state.cards.applying) {
          state.cards.applying.arrived = true;
          state.cards.applying.status = "done";
          state.cards.applying.detail = summary.slice(0, 80);
        }
      }
      break;
    }
    case "session.engineering.result": {
      state.product.ag1 = true;
      if (Array.isArray(event.checks)) {
        state.product.ag1Checks = event.checks.map((c) => ({
          id: typeof c?.id === "string" ? c.id : "",
          kind: typeof c?.kind === "string" ? c.kind : "",
          ok: c?.ok === true,
        }));
      }
      const classification =
        typeof event.classification === "string"
          ? event.classification
          : "NOT_VERIFIED";
      const files = Array.isArray(event.changedFiles)
        ? event.changedFiles.length
        : 0;
      const phase =
        classification === "VERIFIED"
          ? "Verified"
          : classification === "PARTIALLY_VERIFIED"
            ? "Partially verified"
            : classification === "FAILED"
              ? "Failed"
              : "Not verified";
      setCard(
        state,
        "terminal",
        classification === "VERIFIED" ? "done" : "refused",
        `${classification} — ${files} file(s)`,
      );
      if (Array.isArray(event.changedFiles)) {
        for (const p of event.changedFiles.slice(0, 40)) {
          if (typeof p !== "string") continue;
          if (!state.product.projectFiles.includes(p)) {
            state.product.projectFiles.push(p);
          }
          state.product.projectEntries.push({
            path: p,
            role: fileRole(p, { modified: true }),
          });
        }
      }
      setPathPhase(state, phase);
      break;
    }
    case "session.environment.unavailable":
    case "session.infrastructure.failure": {
      const reason =
        typeof event.message === "string"
          ? event.message
          : typeof event.code === "string"
            ? event.code
            : "execution environment unavailable";
      state.product.infraFailure = reason;
      setPathPhase(state, "Infrastructure failure");
      setCloudFooter(state, "☁ Cleaning up…");
      break;
    }
    default:
      break;
  }

  // While validation is actively running, prefer Testing over stale phases.
  if (
    state.cards.validationRunning?.status === "active" &&
    state.product.pathPhase !== "Investigating failure"
  ) {
    setPathPhase(state, "Testing");
  }
  // Cloud running footer while applying/validating after hydration.
  if (
    state.product.cloudSelected &&
    !state.product.disposed &&
    (state.cards.applying?.status === "active" ||
      state.cards.validationRunning?.status === "active")
  ) {
    const sec = state.heartbeat
      ? Math.floor(state.heartbeat.elapsedMs / 1000)
      : null;
    setCloudFooter(
      state,
      `☁ ${state.product.region || "europe-west4"} · Engineering Image · Running${
        sec != null ? ` · ${sec}s` : ""
      }`,
    );
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
