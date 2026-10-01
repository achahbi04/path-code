/**
 * PATH Build — human product projection for the visual builder workspace.
 */

import {
  labelFromBuildEvents,
  projectEngineeringActivity,
} from "./engineering-activity.mjs";
import { projectEngineeringTimeline } from "./engineering-timeline.mjs";
import {
  creatorConversation,
  creatorPhase,
  creatorStatusLabel,
  displayTitleFor,
  hasActiveEngineering,
  isArchived,
} from "./project-library.mjs";
import { projectLastGoodPreview } from "../lifecycle-truth.mjs";

/**
 * @param {import('../types.mjs').BuildRecord | null | undefined} build
 */
function requestReceipt(build) {
  const revision = build?.intent?.outcomeRevision;
  const children = (Array.isArray(build?.children) ? build.children : []).filter(
    (child) => child && child.intentRevision === revision && !child.orphanAbandoned,
  );
  const accepted = [...(Array.isArray(build?.conversation) ? build.conversation : [])]
    .reverse()
    .find(
      (message) =>
        message?.role === "user" &&
        (revision == null || message.intentRevision === revision),
    );
  return {
    acceptedAt: accepted?.at || null,
    intentRevision: revision ?? null,
    tasks: children.map((child) => ({
      taskId: child.taskId || null,
      kind: child.kind || null,
      engine: child.provider || null,
      model: child.engineModel || null,
      mode: child.engineMode || null,
      sessionId: child.engineSessionId || null,
      executionProvider: child.executionProvider || null,
      startedAt: child.selectedAt || null,
      endedAt: child.consumedAt || child.terminalAt || null,
      status: child.classification || null,
      adoptedSha: child.adoptedSha || null,
    })),
    resultingSha: build?.authoritativeSha || null,
    adopted: children.some((child) => child.kind === "engineer" && child.adoptedSha),
    previewUrl: build?.previewUrl || null,
    ready: build?.loop?.status === "complete",
  };
}

/**
 * @param {import('../types.mjs').BuildRecord | null | undefined} build
 * @param {{
 *   preview?: object | null,
 *   runtime?: object | null,
 *   artifact?: object | null,
 *   uiState?: string | null,
 *   events?: object[],
 *   checkpoint?: object | null,
 *   diff?: object | null,
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
      engineeringActivity: null,
      handoff: null,
    };
  }

  const status = String(build.loop?.status || "unknown");
  const restorePending = Boolean(build.pendingRestore);
  const complete = status === "complete";
  const paused = status === "paused";
  const blocked = status === "blocked";
  const awaitingReview =
    status === "awaiting_review" ||
    build.pendingCandidate?.status === "pending";
  const pendingCandidate =
    awaitingReview && build.pendingCandidate?.status === "pending"
      ? {
          taskId: build.pendingCandidate.taskId || null,
          sourceSha: build.pendingCandidate.sourceSha || null,
          taskBranch: build.pendingCandidate.taskBranch || null,
          intentRevision:
            Number.isFinite(build.pendingCandidate.intentRevision)
              ? build.pendingCandidate.intentRevision
              : null,
          files: Array.isArray(build.pendingCandidate.files)
            ? build.pendingCandidate.files
            : [],
          requestText: build.pendingCandidate.requestText || "",
          diffSummary: build.pendingCandidate.diffSummary || "",
        }
      : null;
  const discardedTerminal =
    Boolean(build.lastDiscardedCandidate) &&
    !pendingCandidate &&
    !blocked &&
    paused;
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

  const kind = String(last?.kind || "");
  const ds = String(last?.dispatchState || "");
  const childLive = ds === "dispatched" || ds === "selected" || ds === "terminal_seen";
  const previewReady = preview?.status === "ready" || runtime?.status === "ready";
  const runtimeFailed =
    runtime?.status === "failed" ||
    runtime?.status === "unhealthy" ||
    runtime?.status === "exited" ||
    runtime?.status === "unavailable";
  const emptyTreePreview =
    runtime?.reason === "no_preview_capability" ||
    runtime?.reason === "no_start_plan" ||
    runtime?.reason === "empty_tree" ||
    runtime?.status === "awaiting_product" ||
    build.runtimeHealth === "awaiting_product";
  const updatingPreview = Boolean(build.loop?.pendingRuntimeRefresh) && !childLive;

  const lastClass = String(last?.classification || "");
  const realFailed =
    Boolean(last) &&
    !last.adoptedSha &&
    /FAIL|NOT_VERIFIED|BLOCKED/i.test(lastClass);
  const replacementLive = childLive && kind === "engineer";
  if (restorePending) {
    phase = "blocked";
    uiState = "error";
    headline = "Product history needs recovery";
    detail = "A version restore is being reconciled. The current product preview is unavailable until it finishes.";
    progressLabel = "Needs attention";
  } else if (awaitingReview) {
    phase = "review";
    uiState = "review";
    headline = "Review this result";
    detail = "Apply to make it the product, or Discard to keep the current product.";
    progressLabel = "Ready to review";
  } else if (paused && realFailed && !replacementLive) {
    phase = "paused";
    uiState = "error";
    headline = "Failed — paused";
    detail = "The current engineering task failed. Engineering is paused.";
    progressLabel = "Needs attention";
  } else if (paused) {
    phase = "paused";
    uiState = "paused";
    headline = "Paused";
    if (build.lastDiscardedCandidate && emptyTreePreview) {
      detail =
        "That candidate was discarded. Send a new request when you want to continue.";
    } else if (build.lastDiscardedCandidate) {
      detail =
        "That candidate was discarded. Showing the current authoritative product — send a new request to change it.";
    } else {
      detail = "Engineering is paused. Resume to continue from durable state.";
    }
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
    headline = "Needs attention";
    detail =
      build.loop?.blockedReason ||
      "PATH could not advance honestly. Adjust the request and continue.";
    progressLabel = "Needs attention";
  } else if (childLive && kind === "brief") {
    phase = "briefing";
    uiState = "building";
    headline = "Understanding request…";
    detail = "PATH is preparing the build from your request. You do not need to send another message.";
    progressLabel = "Understanding request…";
  } else if (childLive && kind === "engineer") {
    phase = "engineering";
    uiState = "building";
    const followUp =
      (build.intent?.outcomeRevision || 1) > 1 ||
      kids.some(
        (child) =>
          child.kind === "engineer" &&
          child.dispatchState === "consumed" &&
          child.adoptedSha &&
          child.taskId !== last?.taskId,
      );
    headline = followUp ? "Applying changes…" : "Engineering…";
    detail = followUp
      ? "A mutating engineer is applying this request to the product."
      : "A mutating engineer is building the first version.";
    progressLabel = headline;
  } else if (childLive && (kind === "evaluate" || kind === "challenge")) {
    phase = kind === "challenge" ? "challenging" : "evaluating";
    uiState = "checking";
    headline = kind === "challenge" ? "Reviewing outcome…" : "Checking result…";
    detail =
      kind === "challenge"
        ? "Challenge is reviewing the current outcome."
        : "PATH is validating the current result.";
    progressLabel = headline;
  } else if (updatingPreview) {
    phase = "runtime";
    uiState = "building";
    headline = "Updating preview…";
    detail = "An adopted revision is being moved into the preview runtime.";
    progressLabel = "Updating preview…";
  } else if (runtimeFailed && emptyTreePreview && status === "running") {
    phase = "starting";
    uiState = "building";
    headline = "Building first version…";
    detail = "Preview will appear when the first runnable revision is ready.";
    progressLabel = "Building first version…";
  } else if (runtimeFailed) {
    phase = "runtime_error";
    uiState = "error";
    headline = "Preview unavailable";
    const exitBit =
      typeof runtime.exitCode === "number" ? ` (exit ${runtime.exitCode})` : "";
    detail =
      runtime.stderrTail ||
      runtime.error ||
      runtime.reason ||
      `Could not start the product runtime${exitBit}.`;
    progressLabel = "Preview unavailable";
  } else if (
    (build.conversation || []).some(
      (msg) =>
        msg?.intentRevision === build.intent?.outcomeRevision &&
        msg?.status === "failed",
    ) &&
    !build.lastDiscardedCandidate
  ) {
    phase = "failed";
    uiState = "error";
    headline = "Needs attention";
    detail = "That request ended without an adopted product revision.";
    progressLabel = "Needs attention";
  } else if (previewReady && !updatingPreview && build.authoritativeSha) {
    phase = "preview";
    uiState = "ready";
    headline = "Ready";
    detail = "Interact with the live product. Chat to request changes.";
    progressLabel = "Ready";
  } else if (!kids.length) {
    phase = "starting";
    uiState = "building";
    headline = "Preparing the build…";
    detail =
      "PATH is preparing the build from your request. You do not need to send another message.";
    progressLabel = labelFromBuildEvents(extras.events) || "Preparing the build…";
  } else if (last && ds === "consumed" && /FAIL|CANCEL|NOT_VERIFIED|BLOCKED/i.test(String(last.classification || "")) && !build.authoritativeSha) {
    phase = "failed";
    uiState = "error";
    headline = "Needs attention";
    detail = "The current task ended before a product revision was adopted.";
    progressLabel = "Needs attention";
  }

  const discardedIntentRevision = (() => {
    const discardedTaskId = build.lastDiscardedCandidate?.taskId;
    if (!discardedTaskId) return null;
    const child = (build.children || []).find(
      (entry) => entry?.taskId === discardedTaskId,
    );
    return Number.isFinite(child?.intentRevision) ? child.intentRevision : null;
  })();

  const conversation = Array.isArray(build.conversation)
    ? build.conversation.map((m) => {
        let status = m.status || null;
        const messageRev = Number.isFinite(m.intentRevision)
          ? m.intentRevision
          : null;
        const belongsToDiscardedRevision =
          discardedIntentRevision != null &&
          messageRev === discardedIntentRevision;
        if (
          awaitingReview &&
          pendingCandidate &&
          (pendingCandidate.intentRevision == null ||
            messageRev == null ||
            messageRev === pendingCandidate.intentRevision) &&
          (status === "failed" || status === "queued")
        ) {
          status = "review";
        } else if (
          !awaitingReview &&
          belongsToDiscardedRevision &&
          (status === "failed" || status === "review" || status === "queued")
        ) {
          // Only the discarded request inherits DISCARDED — never later requests.
          status = "discarded";
        } else if (
          paused &&
          (status === "applying" || status === "preparing")
        ) {
          status = "paused";
        }
        return {
          id: m.id,
          role: m.role,
          text: m.text,
          at: m.at,
          kind: m.kind || null,
          status,
          intentRevision: messageRev,
        };
      }).filter((message) => creatorConversation([message]).length)
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
    displayTitle: displayTitleFor(build),
    creatorStatus: creatorStatusLabel(build),
    creatorPhase: creatorPhase(build),
    activeEngineering: hasActiveEngineering(build),
    needsRecovery: restorePending || status === "blocked" || Boolean(build.loop?.blockedReason),
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
    identity: {
      buildId: build.buildId,
      projectRoot,
      productBranch: build.productBranch || null,
      currentIntentRevision: build.intent?.outcomeRevision || 1,
      authoritativeProductSha: build.authoritativeSha || null,
      runtimeSha: restorePending ? null :
        runtime?.revision ||
        runtime?.sha ||
        runtime?.authoritativeSha ||
        null,
      previewSha: restorePending ? null : preview?.revision || preview?.authoritativeSha || null,
      loopStatus: status,
    },
    criteria: [],
    criteriaSummary: { met: 0, failed: 0, pending: 0, total: 0 },
    // Phase 5: creator surface never presents manufactured outcome criteria.
    criteriaProjection: {
      split: false,
      project: { met: 0, failed: 0, pending: 0, total: 0 },
      request: null,
    },
    requestLabel: (() => {
      const lastUser = [...conversation].reverse().find((message) => message?.role === "user");
      const text = String(lastUser?.text || "").replace(/\s+/g, " ").trim();
      return text ? text.slice(0, 72) : null;
    })(),
    archived: isArchived(build),
    queuedRequest: (() => {
      if (!paused) return null;
      const queued = [...conversation].reverse().find(
        (message) => message?.role === "user" && message?.status === "queued",
      );
      const text = String(queued?.text || "").replace(/\s+/g, " ").trim();
      return text || null;
    })(),
    previewPreparing: !restorePending && (
      Boolean(build.loop?.pendingRuntimeRefresh) ||
      (status === "running" && !previewReady)),
    children: activity,
    conversation,
    activity,
    engineeringActivity: projectEngineeringActivity(build, {
      ...extras,
      projectRoot,
    }),
    engineeringTimeline: projectEngineeringTimeline(build, {
      ...extras,
      projectRoot,
    }),
    viewRevision:
      (Array.isArray(extras.events) ? extras.events : []).reduce(
        (max, event) => Math.max(max, Number(event?.id) || 0),
        0,
      ) *
        1_000_000 +
      (Array.isArray(extras.traces)
        ? extras.traces.reduce(
            (total, bundle) => total + (Array.isArray(bundle?.lines) ? bundle.lines.length : 0),
            0,
          )
        : Array.isArray(extras.traceLines)
          ? extras.traceLines.length
          : 0),
    previewRevision: restorePending ? null : runtime?.authoritativeSha || preview?.authoritativeSha || null,
    previewMatchesAuthoritative: !restorePending && (
      !build.authoritativeSha ||
      !runtime?.authoritativeSha ||
      runtime.authoritativeSha === build.authoritativeSha),
    proposedNext: build.hypotheses?.proposedNextAction || null,
    blockedReason: build.loop?.blockedReason || null,
    complete,
    canSteer: !blocked && !restorePending,
    canPause: status === "running" && !restorePending,
    canStop: status === "running" && !restorePending,
    // Discarded candidate is already a completed decision — no Resume loop.
    canResume: (paused || blocked) && !awaitingReview && !discardedTerminal && !restorePending,
    canApply: Boolean(pendingCandidate) && !restorePending,
    canDiscard: Boolean(pendingCandidate) && !restorePending,
    pendingCandidate,
    lastDiscardedCandidate: build.lastDiscardedCandidate
      ? {
          taskId: build.lastDiscardedCandidate.taskId || null,
          sourceSha: build.lastDiscardedCandidate.sourceSha || null,
          at: build.lastDiscardedCandidate.at || null,
        }
      : null,
    lastAppliedCandidate: build.lastAppliedCandidate
      ? {
          taskId: build.lastAppliedCandidate.taskId || null,
          adoptedSha: build.lastAppliedCandidate.adoptedSha || null,
          at: build.lastAppliedCandidate.at || null,
        }
      : null,
    lastGoodPreview: restorePending ? null : projectLastGoodPreview(build),
    candidatePreview: pendingCandidate
      ? {
          status: "ready",
          embedPath: `/preview-candidate/${encodeURIComponent(build.buildId)}/`,
          kind: "candidate",
        }
      : null,
    requestReceipt: requestReceipt(build),
    selectedElement: build.loop?.pendingSelectedElement || null,
    preview: restorePending ? null : preview,
    runtime: restorePending ? null : runtime,
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
