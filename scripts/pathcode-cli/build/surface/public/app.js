/** PATH Build — visual builder client */

import { previewFrameSrc, previewTransition, shouldAcceptViewRevision } from "./view-revision.js";

const els = {
  landing: document.getElementById("landing"),
  workspace: document.getElementById("workspace"),
  outcome: document.getElementById("outcome"),
  buildBtn: document.getElementById("buildBtn"),
  landingError: document.getElementById("landingError"),
  statusPill: document.getElementById("statusPill"),
  criteriaLine: document.getElementById("criteriaLine"),
  buildIdentity: document.getElementById("buildIdentity"),
  chatScroll: document.getElementById("chatScroll"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
  selectionChip: document.getElementById("selectionChip"),
  previewStage: document.getElementById("previewStage"),
  previewEmpty: document.getElementById("previewEmpty"),
  previewEmptyTitle: document.getElementById("previewEmptyTitle"),
  previewEmptyDetail: document.getElementById("previewEmptyDetail"),
  previewFrame: document.getElementById("previewFrame"),
  previewFrameIncoming: document.getElementById("previewFrameIncoming"),
  previewNotice: document.getElementById("previewNotice"),
  previewError: document.getElementById("previewError"),
  previewLabel: document.getElementById("previewLabel"),
  drawer: document.getElementById("drawer"),
  drawerBody: document.getElementById("drawerBody"),
  projectPath: document.getElementById("projectPath"),
  pauseBuildBtn: document.getElementById("pauseBuildBtn"),
  stopBuildBtn: document.getElementById("stopBuildBtn"),
  resumeBuildBtn: document.getElementById("resumeBuildBtn"),
  recoverBuildBtn: document.getElementById("recoverBuildBtn"),
  selectModeBtn: document.getElementById("selectModeBtn"),
  refreshPreviewBtn: document.getElementById("refreshPreviewBtn"),
  undockBtn: document.getElementById("undockBtn"),
  projectsMode: document.getElementById("projectsMode"),
  projectMode: document.getElementById("projectMode"),
  projectModeTitle: document.getElementById("projectModeTitle"),
  projectRepoState: document.getElementById("projectRepoState"),
  projectDetails: document.getElementById("projectDetails"),
  archiveBtn: document.getElementById("archiveBtn"),
  restoreBtn: document.getElementById("restoreBtn"),
  archivedToggle: document.getElementById("archivedToggle"),
  archivedList: document.getElementById("archivedList"),
  archivedCount: document.getElementById("archivedCount"),
  requestLine: document.getElementById("requestLine"),
  interaction: document.getElementById("interaction"),
  closeDrawerBtn: document.getElementById("closeDrawerBtn"),
  newBuildBtn: document.getElementById("newBuildBtn"),
  openFolderBtn: document.getElementById("openFolderBtn"),
  openCodeBtn: document.getElementById("openCodeBtn"),
  projectList: document.getElementById("projectList"),
  creatorStatus: document.getElementById("creatorStatus"),
  queueNotice: document.getElementById("queueNotice"),
  copyPathBtn: document.getElementById("copyPathBtn"),
  downloadZipBtn: document.getElementById("downloadZipBtn"),
  repositoryBtn: document.getElementById("repositoryBtn"),
  renameTitleBtn: document.getElementById("renameTitleBtn"),
  titleEditor: document.getElementById("titleEditor"),
  libraryCollapse: document.getElementById("libraryCollapse"),
  libraryOpen: document.getElementById("libraryOpen"),
  jumpLatest: document.getElementById("jumpLatest"),
  worklog: document.getElementById("worklog"),
  worklogCurrent: document.getElementById("worklogCurrent"),
  worklogPhases: document.getElementById("worklogPhases"),
  worklogScroll: document.getElementById("worklogScroll"),
  worklogToggle: document.getElementById("worklogToggle"),
};

/** @type {string | null} */
let activeBuildId = null;
/** @type {EventSource | null} */
let events = null;
/** @type {string | null} */
let projectRoot = null;
/** @type {string | null} */
let previewEmbed = null;
/** @type {string | null} */
let previewDirectUrl = null;
/** @type {object | null} */
let selectedElement = null;
let selectMode = false;
/** @type {number} */
let renderedRevision = -1;
let worklogFollow = true;
let chatStick = true;
/** @type {any} */
let lastView = null;
/** @type {{ buildId: string, src: string } | null} */
let heldPreview = null;
let projectListScroll = 0;
/** @type {HTMLIFrameElement | null} */
let visibleFrame = els.previewFrame;
/** @type {HTMLIFrameElement | null} */
let spareFrame = els.previewFrameIncoming;

function showLandingError(msg) {
  if (!msg) {
    els.landingError.hidden = true;
    els.landingError.textContent = "";
    return;
  }
  els.landingError.hidden = false;
  els.landingError.textContent = msg;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setWorkspaceVisible(on) {
  els.landing.hidden = on;
  els.workspace.hidden = !on;
}

function renderChat(view) {
  const saved = els.chatScroll.scrollTop;
  const msgs = view.conversation || [];
  els.chatScroll.innerHTML = msgs
    .map((m) => {
      const role = m.role === "user" ? "user" : "assistant";
      const status = m.status
        ? `<span class="msg-status">${escapeHtml(String(m.status).replaceAll("_", " "))}</span>`
        : "";
      return `<div class="bubble ${role}" data-status="${escapeHtml(m.status || "")}">${status}${escapeHtml(m.text || "")}</div>`;
    })
    .join("");
  if (chatStick) els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
  else els.chatScroll.scrollTop = saved;
}

function clock(timestamp) {
  if (!timestamp) return "--:--:--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

function shortId(value) {
  const text = String(value || "");
  return text ? text.slice(0, 8) : "";
}

function dayLabel(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function splitEngineering(summary) {
  const text = String(summary || "");
  const match = text.match(
    /^(READ|SEARCH|CREATE|EDIT|DELETE|RENAME|RUN|TEST|TYPECHECK|BUILD|LINT|RESULT|COMMIT|ADOPT|PREVIEW|FAILURE|STOPPED|INSPECT)\s+([\s\S]*)$/,
  );
  if (!match) return { verb: "", target: text };
  return { verb: match[1], target: match[2] };
}

function engineeringDetail(entry) {
  const lines = [
    entry.engine ? `Executor: ${entry.engine}` : "",
    entry.diagnostics?.mode || entry.engineMode ? `Mode: ${entry.diagnostics?.mode || entry.engineMode}` : "",
    entry.taskId ? `Task: ${shortId(entry.taskId)}` : "",
    entry.actionId ? `Action: ${shortId(entry.actionId)}` : "",
    entry.source?.sourceOffsetOrEventId != null ? `Trace: ${entry.source.sourceOffsetOrEventId}` : "",
    entry.file?.relativePath ? `File: ${entry.file.relativePath}` : "",
    entry.command?.safeDisplay && entry.command.safeDisplay !== entry.summary
      ? entry.command.safeDisplay
      : "",
    entry.command?.exitCode != null ? `Exit: ${entry.command.exitCode}` : "",
    entry.command?.durationMs != null ? `Duration: ${entry.command.durationMs}ms` : "",
  ].filter(Boolean);
  return lines.map((line) => escapeHtml(line)).join("<br>");
}

function renderWorklog(view) {
  const timeline = view.engineeringTimeline || { phases: [], entries: [], turns: [], current: null };
  const expanded = els.interaction?.classList.contains("engineering-expanded");
  els.worklogToggle.hidden = false;
  els.worklogToggle.textContent = expanded ? "Collapse to compact" : "Expand";
  const current = timeline.current;
  els.worklogCurrent.textContent = current?.summary || "Engineering has not begun.";
  els.worklogPhases.innerHTML = (timeline.phases || [])
    .map(
      (phase) =>
        `<span class="phase-chip" data-status="${escapeHtml(phase.status)}">${escapeHtml(phase.label)}${
          phase.count ? ` · ${phase.count}` : ""
        }</span>`,
    )
    .join("");
  const savedScroll = els.worklogScroll.scrollTop;
  const turns = timeline.turns?.length
    ? timeline.turns
    : [{ entries: timeline.entries || [], phase: null, engine: null, taskId: null, status: null }];
  let previousDay = "";
  els.worklogScroll.innerHTML = turns
    .map((turn) => {
      const visible = (turn.entries || []).filter((entry) => entry.presentation !== "diagnostic");
      const hidden = (turn.entries || []).filter((entry) => entry.presentation === "diagnostic");
      const firstStamp = (visible[0] || turn.entries?.[0])?.timestamp;
      const day = dayLabel(firstStamp);
      const boundary = day && day !== previousDay ? `<div class="worklog-day">${escapeHtml(day)}</div>` : "";
      if (day) previousDay = day;
      const phaseName = {
        brief: "Understanding",
        engineer: "Building",
        evaluate: "Verifying",
        challenge: "Reviewing",
        revision: "Revision",
      }[turn.phase] || "PATH Engineering";
      const title = turn.taskId ? phaseName : turn.phase || "PATH Engineering";
      const diagLines = [
        turn.taskId ? `Task ${shortId(turn.taskId)}` : "",
        turn.actionId ? `Action ${shortId(turn.actionId)}` : "",
        turn.engine ? `Executor ${turn.engine}` : "",
        turn.intentRevision ? `Intent ${turn.intentRevision}` : "",
        ...hidden.map((entry) => entry.summary || ""),
        ...visible
          .filter(
            (entry) =>
              entry.command?.safeDisplay &&
              (entry.summary === "RUN command" || entry.summary === "FAILURE command"),
          )
          .map((entry) => entry.command.safeDisplay),
      ].filter(Boolean);
      const header = turn.taskId
        ? `<div class="worklog-turn" data-status="${escapeHtml(turn.status || "")}">
            <strong>${escapeHtml(title)}</strong>
            <details class="worklog-diagnostics">
              <summary>Diagnostics</summary>
              <div>${diagLines.map((line) => escapeHtml(line)).join("<br>")}</div>
            </details>
          </div>`
        : "";
      let sawRevision = false;
      const rows = visible
        .map((entry) => {
          const revision = entry.kind === "adopt" || entry.kind === "runtime";
          const banner = revision && !sawRevision ? `<div class="worklog-turn"><strong>Revision</strong></div>` : "";
          if (revision) sawRevision = true;
          const parts = splitEngineering(entry.summary);
          const detail = engineeringDetail(entry);
          return `${banner}<div class="worklog-entry" data-kind="${escapeHtml(entry.kind)}" data-sequence="${entry.sequence}">
              <time>${escapeHtml(clock(entry.timestamp))}</time>
              <span class="worklog-verb">${escapeHtml(parts.verb)}</span>
              <span>${escapeHtml(parts.target)}</span>
              ${
                detail
                  ? `<details class="entry-details"><summary>Details</summary>${detail}</details>`
                  : ""
              }
            </div>`;
        })
        .join("");
      return `${boundary}${header}${rows}`;
    })
    .join("");
  if (worklogFollow) els.worklogScroll.scrollTop = els.worklogScroll.scrollHeight;
  else els.worklogScroll.scrollTop = savedScroll;
  if (els.jumpLatest) els.jumpLatest.hidden = worklogFollow;
}

function renderDrawer(view) {
  const criteria = (view.criteria || [])
    .map(
      (c) =>
        `<li>[${escapeHtml(c.creatorStatus || "pending")}] ${escapeHtml(c.statement)}</li>`,
    )
    .join("");
  const live = view.engineeringActivity || {};
  const current = live.currentTask || live;
  const revision = live.latestRevision || null;
  const currentFiles = (current.files || [])
    .map((f) => `<li>${escapeHtml(f)}</li>`)
    .join("");
  const revisionFiles = (revision?.files || [])
    .map((f) => `<li>${escapeHtml(f)}</li>`)
    .join("");
  const steps = (live.steps || [])
    .map((step) => `<li>${escapeHtml(step.label || "")}</li>`)
    .join("");
  els.drawerBody.innerHTML = `
    <h3>Project</h3>
    <dl class="activity-grid">
      <dt>Title</dt><dd>${escapeHtml(view.displayTitle || "")}</dd>
      <dt>Build</dt><dd>${escapeHtml(view.buildId || "")}</dd>
      <dt>Path</dt><dd>${escapeHtml(view.projectRoot || "")}</dd>
      <dt>Branch</dt><dd>${escapeHtml(view.productBranch || view.identity?.productBranch || "")}</dd>
      <dt>SHA</dt><dd>${escapeHtml(view.authoritativeSha || "")}</dd>
      <dt>Preview SHA</dt><dd>${escapeHtml(view.identity?.previewSha || view.previewRevision || "")}</dd>
    </dl>
    <h3>Current engineering task</h3>
    <dl class="activity-grid">
      <dt>Engine</dt><dd>${escapeHtml(current.engine || "not started")}</dd>
      <dt>Selected</dt><dd>${escapeHtml(current.selectedEngine || current.engine || "not started")}</dd>
      <dt>Provider</dt><dd>${escapeHtml(current.executionProvider || "unknown")}</dd>
      <dt>Model</dt><dd>${escapeHtml(current.model || "unknown")}</dd>
      <dt>Mode</dt><dd>${escapeHtml(current.mode || "unknown")}</dd>
      <dt>Session</dt><dd>${escapeHtml(current.sessionId || "unknown")}</dd>
      <dt>Why</dt><dd>${escapeHtml(current.selectionReason || "not recorded")}</dd>
      <dt>Task</dt><dd>${escapeHtml(current.taskId || "not dispatched")}</dd>
      <dt>Phase</dt><dd>${escapeHtml(current.phase || live.phase || view.progressLabel || "starting")}</dd>
      <dt>Result</dt><dd>${escapeHtml(current.classification || current.resultSha || "pending")}</dd>
      <dt>Failure</dt><dd>${escapeHtml(current.failure || "none")}</dd>
    </dl>
    <h3>Files changed by this task</h3>
    <ul>${currentFiles || "<li>None</li>"}</ul>
    <h3>Latest adopted revision</h3>
    ${
      revision
        ? `<dl class="activity-grid">
            <dt>SHA</dt><dd>${escapeHtml(shortId(revision.sha) || "none")}</dd>
            <dt>Task</dt><dd>${escapeHtml(shortId(revision.taskId) || "unknown")}</dd>
            <dt>Engine</dt><dd>${escapeHtml(revision.engine || "unknown")}</dd>
            <dt>Intent</dt><dd>${escapeHtml(revision.intentRevision || "unknown")}</dd>
          </dl>
          <ul>${revisionFiles || "<li>None recorded</li>"}</ul>
          ${revision.diff ? `<pre class="activity-diff">${escapeHtml(revision.diff)}</pre>` : ""}`
        : "<p>No adopted revision yet.</p>"
    }
    <h3>Live trace</h3>
    <ul>${steps || "<li>None yet</li>"}</ul>
    <h3>Outcome verification</h3>
    <ul>${criteria || "<li>Pending</li>"}</ul>
  `;
  if (view.projectRoot) {
    els.projectPath.textContent = view.projectRoot;
  }
}

function commitPreviewSrc(nextSrc) {
  if (!visibleFrame || !nextSrc) return;
  const current = visibleFrame.getAttribute("src") || "";
  if (current === nextSrc) {
    visibleFrame.hidden = false;
    return;
  }
  if (!current || !spareFrame) {
    visibleFrame.hidden = false;
    visibleFrame.src = nextSrc;
    return;
  }
  spareFrame.onload = () => {
    spareFrame.hidden = false;
    spareFrame.classList.remove("incoming");
    visibleFrame.hidden = true;
    visibleFrame.classList.add("incoming");
    const previous = visibleFrame;
    visibleFrame = spareFrame;
    spareFrame = previous;
    spareFrame.removeAttribute("src");
    els.previewFrame = visibleFrame;
    if (selectMode) postSelectMode();
  };
  spareFrame.classList.add("incoming");
  spareFrame.src = nextSrc;
}

function updatePreview(view) {
  if (!view) return;
  if (heldPreview && heldPreview.buildId !== view.buildId) heldPreview = null;
  const embed = view.preview?.embedPath || null;
  const direct = view.preview?.url || null;
  const runtimeFailed =
    (view.runtime?.status === "failed" ||
      view.runtime?.status === "exited" ||
      view.runtime?.status === "unhealthy" ||
      view.runtime?.status === "unavailable") &&
    !(
      view.runtime?.reason === "no_preview_capability" &&
      view.uiState !== "error" &&
      view.status === "running"
    );
  const ready =
    !runtimeFailed &&
    (view.preview?.status === "ready" || view.preview?.status === "stale");

  const nextSrc = ready && embed ? previewFrameSrc(embed, view.authoritativeSha) : "";
  const decision = previewTransition({
    heldSrc: heldPreview?.src || "",
    nextReady: Boolean(ready && nextSrc),
    nextSrc,
    nextFailed: runtimeFailed,
    preparing: Boolean(view.previewPreparing) || view.status === "running",
  });
  const controls = decision.action !== "empty";
  document.querySelector(".preview-actions")?.toggleAttribute("hidden", !controls);
  document.querySelector(".viewport-toggles")?.toggleAttribute("hidden", !controls);
  if (els.previewNotice) {
    els.previewNotice.hidden = !decision.notice;
    els.previewNotice.textContent = decision.notice || "";
  }

  if (decision.action === "empty") {
    els.previewError.hidden = !runtimeFailed;
    if (runtimeFailed) {
      const exitBit =
        typeof view.runtime?.exitCode === "number" ? ` (exit ${view.runtime.exitCode})` : "";
      const stderr =
        view.runtime?.stderrTail ||
        view.runtime?.error ||
        view.runtime?.reason ||
        view.detail ||
        "Preview runtime is not running.";
      els.previewError.textContent = `Preview failed${exitBit}: ${String(stderr).slice(0, 800)}`;
    }
    els.previewEmpty.hidden = false;
    if (visibleFrame) {
      visibleFrame.hidden = true;
      visibleFrame.removeAttribute("src");
    }
    previewEmbed = null;
    previewDirectUrl = null;
    heldPreview = null;
    els.previewLabel.textContent = view.progressLabel || "Preparing";
    if (els.previewEmptyTitle) {
      els.previewEmptyTitle.textContent = view.progressLabel || "Building first version…";
    }
    if (els.previewEmptyDetail) {
      els.previewEmptyDetail.textContent =
        view.detail ||
        "Your product will appear here as soon as the first runnable revision exists.";
    }
    return;
  }

  els.previewEmpty.hidden = true;
  els.previewError.hidden = decision.notice !== "Preview update failed";
  if (decision.notice === "Preview update failed") {
    const reason = view.runtime?.reason || view.runtime?.error || view.detail || "";
    els.previewError.textContent = reason
      ? `Preview update failed: ${String(reason).slice(0, 240)}`
      : "Preview update failed";
  }
  if (decision.action === "swap") commitPreviewSrc(decision.src);
  else if (visibleFrame) visibleFrame.hidden = false;
  previewEmbed = decision.src;
  previewDirectUrl = direct;
  heldPreview = { buildId: view.buildId, src: decision.src };
  els.previewLabel.textContent = view.artifact?.framework
    ? `Live · ${view.artifact.framework}`
    : "Live product";
}

/**
 * @param {any} view
 */
function render(view) {
  lastView = view;
  if (!view || (view.phase === "idle" && !activeBuildId) || (!view.buildId && !activeBuildId)) {
    setWorkspaceVisible(false);
    return;
  }

  setWorkspaceVisible(true);
  activeBuildId = view.buildId;
  projectRoot = view.projectRoot || null;
  if (els.buildIdentity) {
    els.buildIdentity.textContent = view.displayTitle || "Project";
  }
  if (view.buildId) {
    const url = new URL(location.href);
    if (url.searchParams.get("buildId") !== view.buildId) {
      url.searchParams.set("buildId", view.buildId);
      history.replaceState(null, "", url);
    }
  }

  const state = view.uiState || "building";
  const phaseText = {
    understanding: "Understanding",
    engineering: "Engineering",
    verifying: "Verifying",
    reviewing: "Reviewing",
    ready: "Ready",
    paused: "Paused",
    attention: "Needs attention",
  }[view.creatorPhase] || view.creatorStatus || view.progressLabel || state;
  els.statusPill.textContent = phaseText;
  els.statusPill.dataset.state = state;
  if (els.criteriaLine) {
    const projection = view.criteriaProjection;
    const summary = projection?.project || view.criteriaSummary;
    if (projection?.split && summary?.total) {
      els.criteriaLine.textContent = `project ${summary.met}/${summary.total} proven`;
    } else if (summary?.total) {
      els.criteriaLine.textContent = `${summary.met} / ${summary.total}`;
    } else {
      els.criteriaLine.textContent = "";
    }
  }
  if (els.requestLine) {
    const projection = view.criteriaProjection;
    const live = ["understanding", "engineering", "verifying", "reviewing"].includes(view.creatorPhase);
    if (projection?.split && live) {
      const requestPhase = {
        understanding: "Understanding",
        engineering: "Engineering",
        verifying: "Verifying",
        reviewing: "Reviewing",
      }[view.creatorPhase] || "Current request";
      els.requestLine.hidden = false;
      els.requestLine.textContent = `Current request · ${requestPhase}${
        view.requestLabel ? ` · ${view.requestLabel}` : ""
      }`;
    } else {
      els.requestLine.hidden = true;
      els.requestLine.textContent = "";
    }
  }
  renderProjectMode(view);
  if (els.chatInput) {
    const editable = view.canSteer !== false && Boolean(view.projectRoot);
    els.chatInput.disabled = !editable;
    els.sendBtn.disabled = !editable;
    if (!editable) {
      els.chatInput.placeholder = view.projectRoot
        ? "This project needs attention before it can take a new message."
        : "This record has no product folder.";
    } else {
      els.chatInput.placeholder = "Ask PATH…";
    }
  }
  const phaseLabels = {
    understanding: "Understanding your request",
    engineering: "Engineering",
    verifying: "Verifying",
    reviewing: "Reviewing",
  };
  if (els.creatorStatus) {
    const label = phaseLabels[view.creatorPhase];
    els.creatorStatus.hidden = !label;
    if (label) {
      els.creatorStatus.innerHTML = `${escapeHtml(label)}<span class="ellipsis" aria-hidden="true"></span>`;
    }
  }

  renderChat(view);
  renderDrawer(view);
  renderWorklog(view);
  updatePreview(view);
  if (els.pauseBuildBtn) els.pauseBuildBtn.hidden = !view.canPause;
  els.stopBuildBtn.hidden = !view.canStop;
  const queuedWhilePaused = view.status === "paused" && Boolean(view.queuedRequest);
  els.resumeBuildBtn.hidden = !view.canResume;
  els.resumeBuildBtn.textContent = queuedWhilePaused ? "Resume & apply" : "Resume";
  if (els.queueNotice) {
    els.queueNotice.hidden = !queuedWhilePaused;
    els.queueNotice.textContent = queuedWhilePaused ? "QUEUED — project is paused" : "";
  }
  els.recoverBuildBtn.hidden = !view.needsRecovery;
  void loadProjects();

  if (!selectedElement && view.selectedElement) {
    selectedElement = view.selectedElement;
  }

  if (selectedElement) {
    els.selectionChip.hidden = false;
    els.selectionChip.textContent = `Selected: ${selectedElement.tag}${
      selectedElement.text ? ` “${String(selectedElement.text).slice(0, 40)}”` : ""
    }`;
  } else {
    els.selectionChip.hidden = true;
  }
}

function acceptView(view) {
  if (!view) return;
  const revision = Number(view.viewRevision);
  if (!shouldAcceptViewRevision(renderedRevision, revision)) return;
  if (Number.isFinite(revision)) {
    renderedRevision = Math.max(renderedRevision, revision);
  }
  render(view);
}

function subscribe(buildId) {
  if (events) {
    events.close();
    events = null;
  }
  events = new EventSource(`/api/builds/${encodeURIComponent(buildId)}/events`);
  const receive = (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      acceptView(payload?.view || payload);
    } catch {
      /* ignore */
    }
  };
  events.addEventListener("build", receive);
  events.addEventListener("snapshot", receive);
  events.onopen = () => stopTruthPoll();
  events.onerror = () => {
    // EventSource retries with Last-Event-ID; polling is only a transport fallback.
    startTruthPoll(buildId);
  };
}

async function startBuild() {
  const outcome = String(els.outcome.value || "").trim();
  if (!outcome) {
    showLandingError("Describe what you want to build.");
    return;
  }
  showLandingError("");
  els.buildBtn.disabled = true;
  els.buildBtn.textContent = "Starting…";
  render({
    phase: "starting",
    uiState: "building",
    buildId: "pending",
    headline: "Starting your build",
    progressLabel: "Preparing project",
    detail: "PATH is creating the Build session and project folder.",
    conversation: [{ role: "user", text: outcome, kind: "outcome", status: "incorporated" }],
    canStop: false,
    canResume: false,
    activity: [],
    criteria: [],
  });
  let startedOk = false;
  try {
    const res = await fetch("/api/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, originKind: "build-created" }),
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      showLandingError(`Build start failed (HTTP ${res.status}): invalid response`);
      return;
    }
    if (!res.ok || !body?.ok || !body.buildId) {
      activeBuildId = null;
      setWorkspaceVisible(false);
      showLandingError(
        body?.message ||
          body?.code ||
          `Could not start build (HTTP ${res.status})`,
      );
      return;
    }
    startedOk = true;
    activeBuildId = body.buildId;
    projectRoot = body.projectRoot || null;
    if (body.view) {
      acceptView(body.view);
    } else {
      setWorkspaceVisible(true);
      els.statusPill.textContent = "Building…";
    }
    subscribe(body.buildId);
    const url = new URL(location.href);
    url.searchParams.set("buildId", body.buildId);
    history.pushState({ buildId: body.buildId }, "", url);
    void loadProjects();
  } catch (err) {
    activeBuildId = null;
    setWorkspaceVisible(false);
    showLandingError(err instanceof Error ? err.message : String(err));
  } finally {
    // Only restore the landing CTA when start failed and we are still on landing.
    if (!startedOk) {
      els.buildBtn.disabled = false;
      els.buildBtn.textContent = "Build";
    }
  }
}

/** @type {ReturnType<typeof setInterval> | null} */
let truthPoll = null;

function stopTruthPoll() {
  if (truthPoll) {
    clearInterval(truthPoll);
    truthPoll = null;
  }
}

/**
 * SSE can miss events; poll authoritative Build view as a safe fallback.
 * @param {string} buildId
 */
function startTruthPoll(buildId) {
  stopTruthPoll();
  let failures = 0;
  truthPoll = setInterval(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/builds/${encodeURIComponent(buildId)}`);
        if (!res.ok) {
          failures += 1;
          return;
        }
        failures = 0;
        const view = await res.json();
        if (view?.buildId === buildId) acceptView(view);
        if (view?.complete || view?.status === "blocked") stopTruthPoll();
      } catch {
        failures += 1;
        if (failures > 20) stopTruthPoll();
      }
    })();
  }, 2500);
}

async function sendMessage(text) {
  if (!activeBuildId || !text.trim()) return;
  const trimmed = text.trim();
  const optimistic = {
    id: `local-${Date.now()}`,
    role: "user",
    text: trimmed,
    at: new Date().toISOString(),
    status: "queued",
  };
  if (lastView) {
    lastView = {
      ...lastView,
      queuedRequest: lastView.status === "paused" ? trimmed : lastView.queuedRequest,
      conversation: [...(lastView.conversation || []), optimistic],
    };
    render(lastView);
  }
  els.chatInput.value = "";
  els.sendBtn.disabled = true;
  try {
    const res = await fetch(
      `/api/builds/${encodeURIComponent(activeBuildId)}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          element: selectedElement,
        }),
      },
    );
    const body = await res.json();
    if (!res.ok || !body?.ok) {
      showHandoffResult("Change", {
        ok: false,
        message: body?.message || body?.code || `HTTP ${res.status}`,
      });
      return;
    }
    if (body.view) acceptView(body.view);
    selectedElement = null;
    els.selectionChip.hidden = true;
    els.chatInput.value = "";
  } finally {
    els.sendBtn.disabled = false;
  }
}

async function controlBuild(action) {
  if (!activeBuildId) return;
  const button =
    action === "stop"
      ? els.stopBuildBtn
      : action === "pause"
        ? els.pauseBuildBtn
        : action === "resume"
          ? els.resumeBuildBtn
          : els.recoverBuildBtn;
  button.disabled = true;
  try {
    const res = await fetch(
      `/api/builds/${encodeURIComponent(activeBuildId)}/${action}`,
      { method: "POST" },
    );
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      showHandoffResult(action, {
        ok: false,
        message: body?.message || body?.code || `HTTP ${res.status}`,
      });
      return;
    }
    if (body.view) acceptView(body.view);
  } catch (error) {
    showHandoffResult(action, {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    button.disabled = false;
  }
}

els.buildBtn.addEventListener("click", () => void startBuild());
els.outcome.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void startBuild();
  }
});

els.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  void sendMessage(els.chatInput.value);
});
els.chatInput.addEventListener("keydown", (event) => {
  if (event.isComposing || event.keyCode === 229) return;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const send =
    (event.key === "Enter" && !event.shiftKey && !coarse) ||
    (event.key === "Enter" && (event.metaKey || event.ctrlKey));
  if (!send) return;
  event.preventDefault();
  els.chatForm.requestSubmit();
});
els.pauseBuildBtn?.addEventListener("click", () => void controlBuild("pause"));
els.stopBuildBtn.addEventListener("click", () => void controlBuild("stop"));
els.resumeBuildBtn.addEventListener("click", () => void controlBuild("resume"));
els.recoverBuildBtn.addEventListener("click", () => void controlBuild("recover"));

function showComposer(pushHistory) {
  if (events) events.close();
  events = null;
  stopTruthPoll();
  activeBuildId = null;
  projectRoot = null;
  previewEmbed = null;
  previewDirectUrl = null;
  heldPreview = null;
  selectedElement = null;
  lastView = null;
  if (visibleFrame) {
    visibleFrame.removeAttribute("src");
    visibleFrame.hidden = true;
  }
  if (spareFrame) {
    spareFrame.removeAttribute("src");
    spareFrame.hidden = true;
  }
  els.previewEmpty.hidden = false;
  els.drawerBody.innerHTML = "";
  els.projectPath.textContent = "";
  els.buildBtn.disabled = false;
  els.buildBtn.textContent = "Build";
  setWorkspaceVisible(false);
  setRailMode("projects");
  els.outcome.value = "";
  els.outcome.focus();
  if (pushHistory !== false) {
    history.pushState({ buildId: null }, "", location.pathname);
  }
  void loadProjects();
}

els.newBuildBtn.addEventListener("click", () => {
  if (lastView?.activeEngineering) {
    const dialog = document.getElementById("newProjectDialog");
    dialog.showModal();
    dialog.addEventListener(
      "close",
      () => {
        if (dialog.returnValue !== "stop") return;
        void controlBuild("stop").then(() => showComposer(true));
      },
      { once: true },
    );
    return;
  }
  showComposer(true);
});

els.worklogToggle.addEventListener("click", () => {
  els.interaction?.classList.toggle("engineering-expanded");
  const expanded = els.interaction?.classList.contains("engineering-expanded");
  els.worklogToggle.textContent = expanded ? "Collapse to compact" : "Expand";
});
els.closeDrawerBtn.addEventListener("click", () => {
  els.drawer.hidden = true;
});

function showHandoffResult(whichTitle, body) {
  const msg = body?.ok
    ? `${whichTitle}: ${body.path || projectRoot || "ok"}`
    : `${whichTitle} failed: ${body?.message || body?.code || "unknown error"}`;
  if (els.previewError) {
    els.previewError.hidden = false;
    els.previewError.textContent = msg;
    if (body?.ok) {
      setTimeout(() => {
        if (els.previewError.textContent === msg) els.previewError.hidden = true;
      }, 4000);
    }
  }
}

els.openFolderBtn.addEventListener("click", async () => {
  if (!activeBuildId && !projectRoot) {
    showHandoffResult("Open Folder", {
      ok: false,
      message: "No active Build project.",
    });
    return;
  }
  try {
    const res = await fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildId: activeBuildId, path: projectRoot }),
    });
    const body = await res.json().catch(() => ({
      ok: false,
      message: `HTTP ${res.status}`,
    }));
    showHandoffResult("Open Folder", body);
  } catch (err) {
    showHandoffResult("Open Folder", {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

els.openCodeBtn.addEventListener("click", async () => {
  if (!activeBuildId && !projectRoot) {
    showHandoffResult("Open in PATH Code", {
      ok: false,
      message: "No active Build project.",
    });
    return;
  }
  try {
    const res = await fetch("/api/open-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildId: activeBuildId, path: projectRoot }),
    });
    const body = await res.json().catch(() => ({
      ok: false,
      message: `HTTP ${res.status}`,
    }));
    showHandoffResult("Open in PATH Code", body);
  } catch (err) {
    showHandoffResult("Open in PATH Code", {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

els.refreshPreviewBtn.addEventListener("click", async () => {
  if (!activeBuildId) return;
  await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}/runtime/restart`, {
    method: "POST",
  });
  if (els.previewFrame.src) {
    const src = els.previewFrame.src.split("?")[0];
    els.previewFrame.src = `${src}?t=${Date.now()}`;
  }
});

els.undockBtn?.addEventListener("click", () => {
  if (!activeBuildId) return;
  window.open(`/live?buildId=${encodeURIComponent(activeBuildId)}`, `path-live-${activeBuildId}`);
});

function postSelectMode() {
  const frameWindow = els.previewFrame.contentWindow;
  if (!frameWindow) return;
  frameWindow.postMessage(
    { source: "path-build", type: "path-build:select-mode", enabled: selectMode },
    "*",
  );
}

els.selectModeBtn.addEventListener("click", () => {
  selectMode = !selectMode;
  els.selectModeBtn.classList.toggle("active", selectMode);
  els.selectModeBtn.setAttribute("aria-pressed", selectMode ? "true" : "false");
  els.previewStage.classList.toggle("selecting", selectMode);
  postSelectMode();
});

els.previewFrame.addEventListener("load", () => {
  if (selectMode) postSelectMode();
});

document.querySelectorAll("[data-viewport]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-viewport]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    els.previewStage.dataset.viewport = btn.getAttribute("data-viewport") || "desktop";
  });
});

window.addEventListener("message", (ev) => {
  const data = ev.data || {};
  if (!visibleFrame || ev.source !== visibleFrame.contentWindow) return;
  if (data.source !== "path-build-preview") return;
  if (data.type === "path-build:element-selected" && data.element) {
    selectedElement = data.element;
    selectMode = false;
    els.selectModeBtn.classList.remove("active");
    els.selectModeBtn.setAttribute("aria-pressed", "false");
    els.previewStage.classList.remove("selecting");
    postSelectMode();
    els.selectionChip.hidden = false;
    els.selectionChip.textContent = `Selected: ${selectedElement.tag}${
      selectedElement.text ? ` “${String(selectedElement.text).slice(0, 40)}”` : ""
    }`;
    els.chatInput.focus();
  }
});

function relativeTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function projectButton(row) {
  const current = row.buildId === activeBuildId ? ' aria-current="true"' : "";
  return `<button type="button" class="project-entry" data-build-id="${escapeHtml(row.buildId)}"${current}>
        <strong>${escapeHtml(row.displayTitle || "Project")}</strong>
        <span class="project-meta"><span>${escapeHtml(row.creatorStatus || row.status || "")}</span><span>${escapeHtml(relativeTime(row.updatedAt))}</span></span>
      </button>`;
}

function bindProjectButtons(root) {
  root?.querySelectorAll("[data-build-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const title = button.querySelector("strong")?.textContent || "project";
      void openProject(button.getAttribute("data-build-id"), "push", title);
    });
  });
}

async function loadProjects() {
  if (!els.projectList) return;
  const res = await fetch("/api/builds");
  const body = await res.json().catch(() => null);
  const rows = Array.isArray(body?.builds) ? body.builds : [];
  const active = rows.filter((row) => !row.archived);
  const archived = rows.filter((row) => row.archived);
  els.projectList.innerHTML = active.map(projectButton).join("");
  bindProjectButtons(els.projectList);
  if (els.projectList && !els.projectsMode?.hidden) {
    els.projectList.scrollTop = projectListScroll;
  }
  if (els.archivedList && els.archivedToggle) {
    const count = archived.length;
    els.archivedToggle.hidden = count === 0;
    if (els.archivedCount) els.archivedCount.textContent = count ? String(count) : "";
    els.archivedList.innerHTML = archived.map(projectButton).join("");
    bindProjectButtons(els.archivedList);
    if (count === 0) els.archivedList.hidden = true;
  }
}

function setRailMode(mode) {
  if (els.projectMode) els.projectMode.hidden = mode !== "project";
}

function renderProjectMode(view) {
  if (!view || !els.projectModeTitle) return;
  els.projectModeTitle.textContent = view.displayTitle || "Project";
  const repo = view.repository?.validated
    ? "Connected"
    : view.identity?.repository === "connected" || view.identity?.repository === "github"
      ? "Connected"
      : "Local";
  if (els.projectRepoState) els.projectRepoState.textContent = repo;
  if (els.projectDetails) {
    const sha = view.authoritativeSha ? String(view.authoritativeSha).slice(0, 12) : "";
    const previewSha = String(view.identity?.previewSha || view.previewRevision || "").slice(0, 12);
    els.projectDetails.innerHTML = `
      <dt>Build</dt><dd>${escapeHtml(shortId(view.buildId))}</dd>
      <dt>Path</dt><dd>${escapeHtml(view.projectRoot || "")}</dd>
      <dt>Branch</dt><dd>${escapeHtml(view.productBranch || "")}</dd>
      <dt>Revision</dt><dd>${escapeHtml(sha)}</dd>
      <dt>Preview</dt><dd>${escapeHtml(previewSha)}</dd>`;
  }
  if (els.archiveBtn) els.archiveBtn.hidden = Boolean(view.archived);
  if (els.restoreBtn) els.restoreBtn.hidden = !view.archived;
  if (els.recoverBuildBtn) els.recoverBuildBtn.hidden = !view.needsRecovery;
  if (els.projectMode) els.projectMode.hidden = false;
}

async function openProject(buildId, mode, title) {
  if (!buildId) return;
  const url = new URL(location.href);
  url.searchParams.set("buildId", buildId);
  if (mode === "push") history.pushState({ buildId }, "", url);
  else if (mode === "replace") history.replaceState({ buildId }, "", url);
  activeBuildId = buildId;
  worklogFollow = true;
  chatStick = true;
  heldPreview = null;
  previewEmbed = null;
  const loading = `Loading ${title || "project"}…`;
  if (els.buildIdentity) els.buildIdentity.textContent = loading;
  if (els.chatScroll) els.chatScroll.innerHTML = "";
  if (els.worklogScroll) els.worklogScroll.innerHTML = "";
  if (els.worklogCurrent) els.worklogCurrent.textContent = "";
  if (visibleFrame) {
    visibleFrame.hidden = true;
    visibleFrame.removeAttribute("src");
  }
  if (els.previewEmpty) els.previewEmpty.hidden = false;
  if (els.previewEmptyTitle) els.previewEmptyTitle.textContent = loading;
  if (els.previewStage) els.previewStage.scrollTop = 0;
  setWorkspaceVisible(true);
  const res = await fetch(`/api/builds/${encodeURIComponent(buildId)}`);
  const view = await res.json();
  if (view?.buildId) {
    renderedRevision = -1;
    acceptView(view);
    subscribe(view.buildId);
  }
  document.querySelector(".app-shell")?.classList.remove("library-open");
}

els.projectList?.addEventListener("scroll", () => {
  if (!els.projectsMode?.hidden) projectListScroll = els.projectList.scrollTop;
});
els.archivedToggle?.addEventListener("click", () => {
  if (!els.archivedList) return;
  els.archivedList.hidden = !els.archivedList.hidden;
});
async function setArchived(action) {
  if (!activeBuildId) return;
  const res = await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}/${action}`, { method: "POST" });
  const body = await res.json().catch(() => null);
  if (body?.view) acceptView(body.view);
  await loadProjects();
  if (action === "archive") {
    setRailMode("projects");
    showComposer(true);
  }
}
els.archiveBtn?.addEventListener("click", () => void setArchived("archive"));
els.restoreBtn?.addEventListener("click", () => void setArchived("restore"));
els.chatScroll?.addEventListener("scroll", () => {
  const gap = els.chatScroll.scrollHeight - els.chatScroll.scrollTop - els.chatScroll.clientHeight;
  chatStick = gap < 48;
});
els.worklogScroll?.addEventListener("scroll", () => {
  const gap = els.worklogScroll.scrollHeight - els.worklogScroll.scrollTop - els.worklogScroll.clientHeight;
  worklogFollow = gap < 48;
  if (els.jumpLatest) els.jumpLatest.hidden = worklogFollow;
});
els.jumpLatest?.addEventListener("click", () => {
  worklogFollow = true;
  els.worklogScroll.scrollTop = els.worklogScroll.scrollHeight;
  els.jumpLatest.hidden = true;
});

els.copyPathBtn?.addEventListener("click", async () => {
  if (!projectRoot) return;
  await navigator.clipboard.writeText(projectRoot);
  showHandoffResult("Copy Project Path", { ok: true, path: projectRoot });
});

els.downloadZipBtn?.addEventListener("click", () => {
  if (!activeBuildId) return;
  window.location.assign(`/api/builds/${encodeURIComponent(activeBuildId)}/export`);
});

els.renameTitleBtn?.addEventListener("click", () => {
  if (!els.titleEditor || !activeBuildId) return;
  els.titleEditor.hidden = false;
  els.titleEditor.value = els.buildIdentity.textContent || "";
  els.buildIdentity.hidden = true;
  els.titleEditor.focus();
});

async function commitTitle() {
  if (!els.titleEditor || els.titleEditor.hidden) return;
  const title = els.titleEditor.value.trim();
  els.titleEditor.hidden = true;
  els.buildIdentity.hidden = false;
  if (!title || !activeBuildId) return;
  const res = await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}/title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayTitle: title }),
  });
  const body = await res.json().catch(() => null);
  if (body?.view) acceptView(body.view);
  else els.buildIdentity.textContent = title;
  void loadProjects();
}

els.titleEditor?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void commitTitle();
  }
});
els.titleEditor?.addEventListener("blur", () => {
  void commitTitle();
});

async function refreshRepositoryDialog() {
  if (!activeBuildId) return;
  const res = await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}/repository`);
  const body = await res.json().catch(() => null);
  const repo = body?.repository || {};
  const state = document.getElementById("repositoryState");
  const hint = document.getElementById("repositoryHint");
  const meta = document.getElementById("repositorySyncMeta");
  const sync = document.getElementById("repositorySync");
  const connect = document.getElementById("repositoryConnectBtn");
  const disconnect = document.getElementById("repositoryDisconnectBtn");
  const push = document.getElementById("repositoryPushBtn");
  const nameField = document.getElementById("repositoryNameField");
  const label = repo.state === "github" || repo.state === "connected" || repo.validated
    ? "Connected"
    : "Local";
  if (state) state.textContent = label;
  if (els.projectRepoState) els.projectRepoState.textContent = label;
  if (hint) {
    hint.textContent = repo.github?.authenticated
      ? "GitHub CLI is available. Creating a repository happens only when you choose Connect."
      : "GitHub CLI is not authenticated. PATH does not store credentials.";
  }
  if (sync) sync.checked = repo.syncAdopted === true;
  if (meta) {
    meta.textContent = repo.lastSyncedSha
      ? `Last synced ${String(repo.lastSyncedSha).slice(0, 8)}`
      : repo.lastSyncError || "";
  }
  const connected = repo.validated === true;
  if (connect) connect.hidden = connected || !repo.github?.authenticated;
  if (nameField) nameField.hidden = connected || !repo.github?.authenticated;
  if (disconnect) disconnect.hidden = !connected;
  if (push) push.hidden = !connected;
}

els.repositoryBtn?.addEventListener("click", () => {
  void refreshRepositoryDialog().then(() => {
    document.getElementById("repositoryDialog")?.showModal();
  });
});
document.getElementById("repositoryCloseBtn")?.addEventListener("click", () => {
  document.getElementById("repositoryDialog")?.close();
});
document.getElementById("repositorySync")?.addEventListener("change", async (event) => {
  if (!activeBuildId) return;
  await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}/repository`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync-mode", enabled: event.target.checked === true }),
  });
  await refreshRepositoryDialog();
});
document.getElementById("repositoryConnectBtn")?.addEventListener("click", async () => {
  if (!activeBuildId) return;
  const name = document.getElementById("repositoryName")?.value || "";
  const visibility = document.getElementById("repositoryVisibility")?.value || "private";
  const res = await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}/repository`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "connect-github", name, visibility }),
  });
  const body = await res.json().catch(() => null);
  if (!body?.ok) showHandoffResult("Repository", body || { ok: false, message: "GitHub was not connected." });
  await refreshRepositoryDialog();
});
document.getElementById("repositoryPushBtn")?.addEventListener("click", async () => {
  if (!activeBuildId) return;
  await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}/repository`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync" }),
  });
  await refreshRepositoryDialog();
});
document.getElementById("repositoryDisconnectBtn")?.addEventListener("click", async () => {
  if (!activeBuildId) return;
  if (!window.confirm("Disconnect removes PATH's local remote. It does not delete the GitHub repository.")) return;
  await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}/repository`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "disconnect", confirm: true }),
  });
  await refreshRepositoryDialog();
});

els.libraryCollapse?.addEventListener("click", () => {
  document.querySelector(".app-shell")?.classList.toggle("library-collapsed");
});
els.libraryOpen?.addEventListener("click", () => {
  document.querySelector(".app-shell")?.classList.add("library-open");
});

window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.search).get("buildId");
  if (id) void openProject(id, "none");
  else showComposer(false);
});

(async () => {
  try {
    await loadProjects();
    const fromUrl = new URLSearchParams(location.search).get("buildId");
    if (fromUrl) await openProject(fromUrl, "replace");
  } catch {
    if (activeBuildId) setWorkspaceVisible(true);
  }
})();
