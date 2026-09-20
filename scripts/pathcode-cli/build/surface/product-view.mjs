/**
 * PATH Build — human product projection for the visual builder workspace.
 */

/**
 * @param {import('../types.mjs').BuildRecord | null | undefined} build
 * @param {{
 *   preview?: object | null,
 *   runtime?: object | null,
 *   artifact?: object | null,
 *   uiState?: string | null,
 *   events?: object[],
 * }} [extras]
 */
export function projectBuildForSurface(build, extras = {}) {
  if (!build || typeof build !== "object") {
    return {
      ok: true,
      phase: "idle",
      uiState: "idle",
      headline: "What do you want to build?",
      detail:
        "Describe the product in plain language. PATH Build will create it and show it live.",
      buildId: null,
      status: null,
      outcome: "",
      projectRoot: null,
      originGitInit: false,
      originKind: null,
      progressLabel: null,
      requirements: [],
      criteria: [],
      children: [],
      conversation: [],
      proposedNext: null,
      blockedReason: null,
      complete: false,
      canSteer: false,
      preview: null,
      runtime: null,
      artifact: null,
      activity: [],
      handoff: null,
    };
  }

  const status = String(build.loop?.status || "unknown");
  const complete = status === "complete";
  const blocked = status === "blocked";
  const paused = status === "paused";
  const binding = (build.projectBindings || [])[0] || null;
  const projectRoot = binding?.projectRoot || null;
  const kids = Array.isArray(build.children) ? build.children : [];
  const last = kids.length ? kids[kids.length - 1] : null;
  const preview = extras.preview || null;
  const runtime = extras.runtime || null;
  const artifact = extras.artifact || null;

  /** @type {string} */
  let phase = "running";
  /** @type {string} */
  let uiState = "building";
  /** @type {string} */
  let headline = "Building your product…";
  /** @type {string} */
  let detail = "PATH is engineering toward your outcome.";
  /** @type {string | null} */
  let progressLabel = "Building…";

  if (paused) {
    phase = "paused";
    uiState = "paused";
    headline = "Paused";
    detail = "Engineering is paused. Resume to continue from durable state.";
    progressLabel = "Paused";
  } else if (complete) {
    phase = "complete";
    uiState = "ready";
    headline = "Ready";
    detail = "Your product is running. Keep chatting to change it.";
    progressLabel = "Ready";
  } else if (blocked) {
    phase = "blocked";
    uiState = "error";
    headline = "Needs your input";
    detail =
      build.loop?.blockedReason ||
      "PATH could not advance honestly. Adjust the request and continue.";
    progressLabel = "Blocked";
  } else if (
    runtime?.status === "failed" ||
    runtime?.status === "unhealthy" ||
    runtime?.status === "exited" ||
    runtime?.status === "unavailable"
  ) {
    phase = "runtime_error";
    uiState = "error";
    headline = "Preview failed";
    const exitBit =
      typeof runtime.exitCode === "number" ? ` (exit ${runtime.exitCode})` : "";
    detail =
      runtime.stderrTail ||
      runtime.error ||
      runtime.reason ||
      `Could not start the product runtime${exitBit}.`;
    progressLabel = "Error";
  } else if (preview?.status === "ready" || runtime?.status === "ready") {
    phase = "preview";
    uiState = last?.dispatchState === "dispatched" ? "applying" : "ready";
    headline = uiState === "applying" ? "Applying changes…" : "Live preview";
    detail =
      uiState === "applying"
        ? "Engineering is updating the product. Preview will refresh when ready."
        : "Interact with the live product. Chat to request changes.";
    progressLabel = uiState === "applying" ? "Applying changes…" : "Ready";
  } else if (!kids.length) {
    phase = "starting";
    uiState = "building";
    headline = "Starting your build";
    detail =
      binding?.originKind === "build-created" || binding?.originGitInit
        ? "Created a fresh project. First engineering pass is establishing the product."
        : "Bound to your project. First engineering pass is about to begin.";
    progressLabel = "Building…";
  } else if (last) {
    const kind = String(last.kind || "");
    const ds = String(last.dispatchState || "");
    if (kind === "engineer") {
      phase = "engineering";
      uiState = ds === "dispatched" || ds === "selected" ? "building" : "checking";
      headline =
        ds === "dispatched" || ds === "selected"
          ? "Building…"
          : "Checking…";
      detail = "A real engine is implementing toward your outcome.";
      progressLabel = headline;
    } else if (kind === "evaluate") {
      phase = "evaluating";
      uiState = "checking";
      headline = "Checking…";
      detail = "Verifying the product against your outcome.";
      progressLabel = "Checking…";
    } else if (kind === "challenge") {
      phase = "challenging";
      uiState = "checking";
      headline = "Checking…";
      detail = "Challenge pass is trying to falsify completion claims.";
      progressLabel = "Checking…";
    }
  }

  const conversation = Array.isArray(build.conversation)
    ? build.conversation.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        at: m.at,
        kind: m.kind || null,
      }))
    : [
        {
          id: "outcome",
          role: "user",
          text: build.intent?.outcome || "",
          at: build.createdAt,
          kind: "outcome",
        },
      ];

  const durableEvents = Array.isArray(extras.events) ? extras.events : [];
  const activity = durableEvents.length
    ? durableEvents.slice(-20).map((event) => ({
        kind: event.type,
        taskId: event.data?.taskId || null,
        dispatchState: event.data?.status || null,
        classification: event.data?.message || null,
        at: event.at || null,
        eventId: event.id,
      }))
    : kids.slice(-12).map((c) => ({
        kind: c.kind,
        taskId: c.taskId,
        dispatchState: c.dispatchState,
        classification: c.classification || null,
        at: c.consumedAt || c.dispatchedAt || c.selectedAt || null,
      }));

  return {
    ok: true,
    phase,
    uiState,
    headline,
    detail,
    progressLabel,
    buildId: build.buildId,
    status,
    outcome: build.intent?.outcome || "",
    outcomeRevision: build.intent?.outcomeRevision || 1,
    authoritativeSha: build.authoritativeSha || null,
    projectRoot,
    originGitInit: Boolean(binding?.originGitInit),
    originKind: binding?.originKind || build.originKind || null,
    productBranch: build.productBranch || null,
    requirements: (build.intent?.explicitRequirements || []).map((r) => ({
      id: r.id,
      statement: r.statement,
      status: r.status,
      required: r.required,
    })),
    criteria: (build.outcomeCriteria || []).map((c) => ({
      id: c.id,
      statement: c.statement,
      status: c.status,
      required: c.required,
      source: c.source || null,
    })),
    children: activity,
    conversation,
    activity,
    proposedNext: build.hypotheses?.proposedNextAction || null,
    blockedReason: build.loop?.blockedReason || null,
    complete,
    canSteer: !blocked,
    canStop: status === "running",
    canResume: paused || blocked,
    selectedElement: build.loop?.pendingSelectedElement || null,
    preview,
    runtime,
    artifact: artifact
      ? {
          kind: artifact.kind,
          framework: artifact.framework,
          signals: artifact.signals || [],
        }
      : null,
    productBrief: build.productBrief
      ? {
          productKind: build.productBrief.productKind,
          capabilityCount: (build.productBrief.capabilities || []).length,
          criteriaCount: (build.productBrief.acceptanceCriteria || []).length,
        }
      : null,
    handoff: projectRoot
      ? {
          projectRoot,
          openFolderHint: `open ${JSON.stringify(projectRoot)}`,
          codeHint: `cd ${JSON.stringify(projectRoot)} && pathcode`,
        }
      : null,
  };
}
