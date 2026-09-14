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
      /** @type {Array<{ label: string, detail: string }>} */
      recentOps: [],
      /** Current observable detail (command/file) from a real tool event. */
      currentDetail: null,
      /** Primary vs task branch clarity. */
      primaryBranch: null,
      taskBranch: null,
      baselineSha: null,
      resultSha: null,
      changedFileTotal: 0,
      /** Provisional engine-time check feedback (not final PATH validation). */
      engineCheckFeedback: null,
      finalValidationStarted: false,
      finalValidationComplete: false,
      /** Bounded presentation-only diff preview lines. */
      diffPreviewLines: /** @type {string[]} */ ([]),
      diffPreviewTruncated: false,
      diffPreviewShownFiles: 0,
      inspectCommand: null,
      preservedArtifact: null,
      /** Engineering handoff (engine-derived; distinct from PATH evidence). */
      engineeringHandoff: null,
      /** Compact multi-task history inside the session-long cockpit. */
      sessionHistory: /** @type {Array<{ preview: string, classification: string }>} */ ([]),
      /** Idle prompt text rendered inside the cockpit frame. */
      cockpitPrompt: null,
      awaitingInput: false,
      /** PATH-owned composer buffer (never echoed via terminal). */
      composerText: "",
      composerScroll: 0,
      composerPasteActive: false,
      /** Last task preview for session history. */
      taskPreview: null,
      /** AG4 GitHub delivery projection. */
      deliveryPhase: null,
      /** @type {{ remote: string, baseBranch: string, taskBranch: string, status: string } | null} */
      deliveryApproval: null,
      /** @type {{ status: string, remote: string | null, prNumber: number | null, prUrl: string | null, remoteBranchOk: boolean, prOk: boolean, message: string | null } | null} */
      deliveryResult: null,
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

  // AG4 delivery phases override the Verified terminal while publication is active.
  if (
    typeof product.deliveryPhase === "string" &&
    product.deliveryPhase.trim() !== ""
  ) {
    return product.deliveryPhase;
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
      {
        const preview =
          typeof event.task === "string"
            ? event.task
            : typeof event.preview === "string"
              ? event.preview
              : null;
        if (preview) {
          state.product.taskPreview = preview.slice(0, 80);
        }
      }
      state.product.awaitingInput = false;
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
      state.product.primaryBranch = branch;
      state.product.dirtySummary = dirty;
      if (typeof event.head === "string" && /^[0-9a-f]{7,40}$/i.test(event.head)) {
        state.product.baselineSha = event.head;
      }
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
      state.product.finalValidationStarted = true;
      state.product.engineCheckFeedback = null;
      // Reset provisional check rows; final validation owns ag1Checks from here.
      state.product.ag1Checks = [];
      setPathPhase(state, "Verifying");
      break;
    }
    case "session.validation.running":
      setCard(
        state,
        "validationRunning",
        "active",
        typeof event.check === "string" ? event.check : "running",
      );
      state.product.finalValidationStarted = true;
      setPathPhase(state, "Verifying");
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
      state.product.finalValidationStarted = true;
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
      if (typeof event.taskBranch === "string" && event.taskBranch.trim()) {
        state.product.taskBranch = event.taskBranch.trim();
      }
      if (typeof event.baselineHead === "string" && /^[0-9a-f]{7,40}$/i.test(event.baselineHead)) {
        state.product.baselineSha = event.baselineHead;
      }
      setPathPhase(state, "Understanding");
      break;
    }
    case "session.engineering.bridge": {
      state.product.ag1 = true;
      // Bridge/spawn diagnostics stay off the operator-facing detail lines.
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
      const detail =
        typeof event.detail === "string" ? event.detail.slice(0, 96) : null;
      // Agent "complete" is NOT a product terminal — only PATH validation is.
      if (/^complete$/i.test(activity) || /^complete$/i.test(label)) {
        setPathPhase(state, "Finishing");
        break;
      }
      if (/^failed$/i.test(activity) || /^failed$/i.test(label)) {
        setPathPhase(state, "Failed");
        if (detail) state.product.currentDetail = detail;
        break;
      }
      // Honest general state when label is vague.
      const phaseLabel =
        label && label.trim() ? label : "Working";
      setPathPhase(state, phaseLabel);
      if (detail) state.product.currentDetail = detail;
      if (/edit|implement/i.test(phaseLabel)) {
        setCard(state, "applying", "active", phaseLabel);
        state.product.ag1Mutation = true;
      } else if (/inspect|read|understand/i.test(phaseLabel)) {
        setCard(state, "reading", "active", phaseLabel);
      } else if (/repair/i.test(phaseLabel)) {
        state.product.ag1Mutation = true;
      } else if (/test/i.test(phaseLabel) && !/verif/i.test(phaseLabel)) {
        // Engine-time testing is provisional — do not mark final validation cards.
        state.product.engineCheckFeedback = "running";
      }
      if (!Array.isArray(state.product.ag1Activities)) {
        state.product.ag1Activities = [];
      }
      if (state.product.ag1Activities[state.product.ag1Activities.length - 1] !== phaseLabel) {
        state.product.ag1Activities.push(phaseLabel);
      }
      if (!Array.isArray(state.product.recentOps)) state.product.recentOps = [];
      const lastOp = state.product.recentOps[state.product.recentOps.length - 1];
      if (!lastOp || lastOp.label !== phaseLabel || (detail && lastOp.detail !== detail)) {
        state.product.recentOps.push({
          label: phaseLabel,
          detail: detail || "",
        });
        if (state.product.recentOps.length > 8) {
          state.product.recentOps = state.product.recentOps.slice(-8);
        }
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
      const firstLine = summary.split(/\r?\n/, 1)[0].trim();
      let detail = firstLine.slice(0, 96);
      const kind = typeof event.kind === "string" ? event.kind : "";
      const tool = typeof event.tool === "string" ? event.tool : "";
      if (
        kind === "command" ||
        kind === "test" ||
        /run_command/i.test(tool) ||
        /run_command/i.test(summary)
      ) {
        const m =
          summary.match(/CommandLine[=:\s]+([^\n]+)/i) ||
          summary.match(/run_command\s+([^\n]+)/i);
        let cmd = (m?.[1] || firstLine.replace(/^run_command\s*/i, "")).trim();
        // Post-tool summaries often carry stdout, not the argv — stay honest.
        const looksLikeOutput =
          /^[✔✖ℹ✓✗]/.test(cmd) ||
          /^(PASS|FAIL|ok|tests?\s+\d|suites?\s+\d)/i.test(cmd) ||
          /^(package\.json|src|test)\b/.test(cmd) ||
          summary.includes("\n");
        if (!cmd || looksLikeOutput) {
          detail =
            kind === "test" || /test/i.test(state.product.pathPhase || "")
              ? "cmd tests"
              : "cmd finished";
        } else {
          detail = `cmd ${cmd.slice(0, 90)}`;
        }
        setPathPhase(state, kind === "test" ? "Testing" : "Running command");
        if (kind === "test") state.product.engineCheckFeedback = "running";
      } else if (kind === "file_edit" || /edit_file|create_file/i.test(tool)) {
        const pathMatch = summary.match(/(?:^|\s)([^\s]+?\.[A-Za-z0-9]{1,8})\b/);
        if (pathMatch) {
          detail = `edit ${pathMatch[1]}`;
        } else {
          const note = firstLine
            .replace(/^(edit_file|create_file)\s*/i, "")
            .trim();
          detail = note ? `edit · ${note.slice(0, 80)}` : `edit ${tool || "file"}`;
        }
        setCard(state, "edit", "done", detail);
        state.product.ag1Mutation = true;
        if (state.cards.applying) {
          state.cards.applying.arrived = true;
          state.cards.applying.status = "done";
          state.cards.applying.detail = detail.slice(0, 80);
        }
        if (!state.product.projectFiles.includes(pathMatch?.[1] || "")) {
          const p = pathMatch?.[1];
          if (p) {
            if (!state.product.projectFiles.includes(p)) state.product.projectFiles.push(p);
            state.product.projectEntries.push({ path: p, role: "modified" });
            state.product.changedFileTotal = Math.max(
              state.product.changedFileTotal || 0,
              state.product.projectFiles.length,
            );
          }
        }
      } else if (kind === "inspect" || /view_file|list_dir|find_file|search_dir/i.test(tool)) {
        const pathMatch = summary.match(/(?:^|\s)([^\s]+?\.[A-Za-z0-9]{1,8})\b/);
        detail = pathMatch ? `read ${pathMatch[1]}` : `inspect ${tool || "files"}`;
        if (pathMatch?.[1]) {
          const p = pathMatch[1];
          if (!state.product.projectFiles.includes(p)) {
            state.product.projectFiles.push(p);
          }
          const entries = Array.isArray(state.product.projectEntries)
            ? state.product.projectEntries
            : [];
          const existing = entries.find((e) => e.path === p);
          if (existing) {
            if (existing.role !== "modified") existing.role = "inspecting";
          } else {
            entries.push({ path: p, role: "inspecting" });
          }
          state.product.projectEntries = entries;
        }
      }
      state.product.currentDetail = detail;
      state.product.pathDetail = detail.slice(0, 80);
      if (!Array.isArray(state.product.recentOps)) state.product.recentOps = [];
      state.product.recentOps.push({
        label: state.product.pathPhase || "Working",
        detail,
      });
      if (state.product.recentOps.length > 8) {
        state.product.recentOps = state.product.recentOps.slice(-8);
      }
      break;
    }
    case "session.capability.discovered": {
      state.product.ag1 = true;
      const matrix =
        event.matrix && typeof event.matrix === "object" ? event.matrix : null;
      const langs = Array.isArray(matrix?.languages)
        ? matrix.languages
            .filter((l) => l?.status === "ready")
            .map((l) => l.id)
        : [];
      const tools = Array.isArray(matrix?.toolchains)
        ? matrix.toolchains
            .filter((t) => t?.status === "ready")
            .map((t) => t.id)
        : [];
      const noteParts = [];
      if (langs.length) noteParts.push(langs.slice(0, 3).join(","));
      if (tools.length) noteParts.push(tools.slice(0, 3).join(","));
      const detail = noteParts.length
        ? `capability ${noteParts.join(" · ")}`.slice(0, 96)
        : "capability plane";
      if (!Array.isArray(state.product.recentOps)) state.product.recentOps = [];
      state.product.recentOps.push({ label: "Capability", detail });
      if (state.product.recentOps.length > 8) {
        state.product.recentOps = state.product.recentOps.slice(-8);
      }
      break;
    }
    case "session.capability.mcp": {
      state.product.ag1 = true;
      const enabled = typeof event.enabled === "number" ? event.enabled : 0;
      const denied = typeof event.denied === "number" ? event.denied : 0;
      if (!Array.isArray(state.product.recentOps)) state.product.recentOps = [];
      state.product.recentOps.push({
        label: "MCP",
        detail: `enabled ${enabled} · denied ${denied}`,
      });
      if (state.product.recentOps.length > 8) {
        state.product.recentOps = state.product.recentOps.slice(-8);
      }
      break;
    }
    case "session.capability.advisory": {
      state.product.ag1 = true;
      const label =
        typeof event.label === "string" && event.label.trim()
          ? event.label.trim()
          : "Engineering review";
      const detail =
        typeof event.detail === "string" ? event.detail.slice(0, 96) : "";
      setPathPhase(state, label);
      if (detail) state.product.currentDetail = detail;
      if (!Array.isArray(state.product.recentOps)) state.product.recentOps = [];
      state.product.recentOps.push({ label, detail });
      if (state.product.recentOps.length > 8) {
        state.product.recentOps = state.product.recentOps.slice(-8);
      }
      break;
    }
    case "session.capability.collaborate": {
      state.product.ag1 = true;
      const engine =
        typeof event.engine === "string" && event.engine.trim()
          ? event.engine.trim()
          : "peer";
      const label =
        typeof event.label === "string" && event.label.trim()
          ? event.label.trim()
          : "Collaborative engineering";
      const detail =
        typeof event.detail === "string"
          ? event.detail.slice(0, 96)
          : `${engine} turn`;
      setPathPhase(state, label);
      state.product.currentDetail = detail;
      if (!Array.isArray(state.product.recentOps)) state.product.recentOps = [];
      state.product.recentOps.push({ label, detail });
      if (state.product.recentOps.length > 8) {
        state.product.recentOps = state.product.recentOps.slice(-8);
      }
      break;
    }
    case "session.capability.preparing": {
      state.product.ag1 = true;
      setPathPhase(state, "Preparing environment");
      const detail =
        typeof event.detail === "string"
          ? event.detail.slice(0, 96)
          : "resolving engineering environment";
      state.product.currentDetail = detail;
      if (!Array.isArray(state.product.recentOps)) state.product.recentOps = [];
      state.product.recentOps.push({
        label: "Preparing environment",
        detail,
      });
      if (state.product.recentOps.length > 8) {
        state.product.recentOps = state.product.recentOps.slice(-8);
      }
      break;
    }
    case "session.capability.provisioning": {
      state.product.ag1 = true;
      const phase =
        typeof event.phase === "string" ? event.phase : "toolchains";
      const label =
        phase === "language-servers"
          ? "Preparing language intelligence"
          : phase === "indexing"
            ? "Indexing"
            : "Preparing environment";
      const detail =
        typeof event.detail === "string"
          ? event.detail.slice(0, 96)
          : String(phase).slice(0, 96);
      setPathPhase(state, label);
      state.product.currentDetail = detail;
      if (!Array.isArray(state.product.recentOps)) state.product.recentOps = [];
      state.product.recentOps.push({ label, detail });
      if (state.product.recentOps.length > 8) {
        state.product.recentOps = state.product.recentOps.slice(-8);
      }
      break;
    }
    case "session.capability.ready": {
      state.product.ag1 = true;
      const detail =
        typeof event.detail === "string"
          ? event.detail.slice(0, 96)
          : "engineering environment ready";
      if (!Array.isArray(state.product.recentOps)) state.product.recentOps = [];
      state.product.recentOps.push({
        label: "Environment ready",
        detail,
      });
      if (state.product.recentOps.length > 8) {
        state.product.recentOps = state.product.recentOps.slice(-8);
      }
      break;
    }
    case "session.capability.indexing": {
      state.product.ag1 = true;
      setPathPhase(state, "Indexing");
      const detail =
        typeof event.detail === "string"
          ? event.detail.slice(0, 96)
          : "building code index";
      state.product.currentDetail = detail;
      if (!Array.isArray(state.product.recentOps)) state.product.recentOps = [];
      state.product.recentOps.push({ label: "Indexing", detail });
      if (state.product.recentOps.length > 8) {
        state.product.recentOps = state.product.recentOps.slice(-8);
      }
      break;
    }
    case "session.engineering.handoff": {
      state.product.ag1 = true;
      if (typeof event.summary === "string" && event.summary.trim()) {
        state.product.engineeringHandoff = event.summary.trim().slice(0, 400);
      }
      break;
    }
    case "session.engineering.result": {
      state.product.ag1 = true;
      state.product.finalValidationStarted = true;
      state.product.finalValidationComplete = true;
      state.product.engineCheckFeedback = null;
      state.product.awaitingInput = false;
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
        ? event.changedFiles
        : [];
      state.product.changedFileTotal = files.length;
      if (typeof event.taskBranch === "string" && event.taskBranch.trim()) {
        state.product.taskBranch = event.taskBranch.trim();
      }
      if (typeof event.commitSha === "string" && /^[0-9a-f]{7,40}$/i.test(event.commitSha)) {
        state.product.resultSha = event.commitSha;
      }
      if (typeof event.baselineSha === "string" && /^[0-9a-f]{7,40}$/i.test(event.baselineSha)) {
        state.product.baselineSha = event.baselineSha;
      }
      if (typeof event.inspectCommand === "string" && event.inspectCommand.trim()) {
        state.product.inspectCommand = event.inspectCommand.trim();
      } else if (state.product.baselineSha && state.product.resultSha) {
        state.product.inspectCommand =
          `git diff --no-ext-diff --no-textconv ${state.product.baselineSha} ${state.product.resultSha} --`;
      }
      if (typeof event.preservedArtifact === "string" && event.preservedArtifact.trim()) {
        state.product.preservedArtifact = event.preservedArtifact.trim();
      }
      if (Array.isArray(event.diffPreviewLines)) {
        state.product.diffPreviewLines = event.diffPreviewLines
          .filter((l) => typeof l === "string")
          .slice(0, 50);
        state.product.diffPreviewTruncated = event.diffPreviewTruncated === true;
        state.product.diffPreviewShownFiles =
          typeof event.diffPreviewShownFiles === "number"
            ? event.diffPreviewShownFiles
            : Math.min(5, files.length);
      }
      const phase =
        classification === "VERIFIED"
          ? "Verified"
          : classification === "PARTIALLY_VERIFIED"
            ? "Partially verified"
            : classification === "FAILED"
              ? "Failed"
              : classification === "CANCELLED"
                ? "Cancelled"
                : "Not verified";
      setCard(
        state,
        "terminal",
        classification === "VERIFIED" ? "done" : "refused",
        `${classification} — ${files.length} file(s)`,
      );
      // Replace project entries with the actual changed-file set (stable sort).
      state.product.projectFiles = files.slice().sort();
      state.product.projectEntries = files.slice().sort().map((path) => ({
        path,
        role: "modified",
      }));
      // Clear bridge/tool residue so the phase label owns the PATH column.
      state.product.currentDetail =
        files.length > 0 ? `${files.length} file(s) changed` : "Engineering complete";
      if (!Array.isArray(state.product.sessionHistory)) {
        state.product.sessionHistory = [];
      }
      state.product.sessionHistory.push({
        preview: String(state.product.taskPreview || "task").slice(0, 60),
        classification,
      });
      if (state.product.sessionHistory.length > 8) {
        state.product.sessionHistory = state.product.sessionHistory.slice(-8);
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
    case "session.delivery.phase": {
      const phase =
        typeof event.phase === "string" && event.phase.trim()
          ? event.phase.trim()
          : "Preparing GitHub delivery";
      state.product.deliveryPhase = phase;
      setPathPhase(state, phase);
      break;
    }
    case "session.delivery.approval": {
      state.product.deliveryPhase = "Awaiting publication approval";
      state.product.deliveryApproval = {
        remote: typeof event.remote === "string" ? event.remote : "",
        baseBranch: typeof event.baseBranch === "string" ? event.baseBranch : "",
        taskBranch: typeof event.taskBranch === "string" ? event.taskBranch : "",
        status: typeof event.status === "string" ? event.status : "pending",
      };
      setPathPhase(state, "Awaiting publication approval");
      break;
    }
    case "session.delivery.result": {
      const status = typeof event.status === "string" ? event.status : "";
      state.product.deliveryResult = {
        status,
        remote: typeof event.remote === "string" ? event.remote : null,
        prNumber: typeof event.prNumber === "number" ? event.prNumber : null,
        prUrl: typeof event.prUrl === "string" ? event.prUrl : null,
        remoteBranchOk: event.remoteBranchOk === true,
        prOk: event.prOk === true,
        message: typeof event.message === "string" ? event.message : null,
      };
      if (status === "PUBLISHED") {
        state.product.deliveryPhase = "Pull request created";
        setPathPhase(state, "Pull request created");
      } else if (status === "DECLINED") {
        state.product.deliveryPhase = "Verified";
        state.product.deliveryApproval = null;
        setPathPhase(state, "Verified");
      } else if (status === "CANCELLED") {
        state.product.deliveryPhase = "Cancelled";
        setPathPhase(state, "Cancelled");
      } else if (status) {
        state.product.deliveryPhase = status;
        setPathPhase(state, status);
      }
      break;
    }
    default:
      break;
  }

  // While PATH independent validation is actively running, prefer Verifying.
  if (
    state.product.finalValidationStarted === true &&
    state.cards.validationRunning?.status === "active" &&
    state.product.pathPhase !== "Investigating failure" &&
    !state.cards.terminal?.arrived
  ) {
    setPathPhase(state, "Verifying");
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
