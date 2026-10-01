/** PATH Build — visual builder client */

import { previewFrameSrc, previewTransition, previewNeedsCommit, shouldAcceptBuildView } from "./view-revision.js";

const els = {
  landing: document.getElementById("landing"),
  workspace: document.getElementById("workspace"),
  outcome: document.getElementById("outcome"),
  buildBtn: document.getElementById("buildBtn"),
  landingModel: document.getElementById("landingModel"),
  landingPreferredEngine: document.getElementById("landingPreferredEngine"),
  workspaceModel: document.getElementById("workspaceModel"),
  workspacePreferredEngine: document.getElementById("workspacePreferredEngine"),
  workspaceModelHint: document.getElementById("workspaceModelHint"),
  landingError: document.getElementById("landingError"),
  statusPill: document.getElementById("statusPill"),
  criteriaLine: document.getElementById("criteriaLine"),
  buildIdentity: document.getElementById("buildIdentity"),
  codeIdentity: document.getElementById("codeIdentity"),
  codeIdentityMain: document.getElementById("codeIdentityMain"),
  codeIdentitySha: document.getElementById("codeIdentitySha"),
  codeIdentityProcs: document.getElementById("codeIdentityProcs"),
  staleCode: document.getElementById("staleCode"),
  candidateReview: document.getElementById("candidateReview"),
  candidateReviewRequest: document.getElementById("candidateReviewRequest"),
  candidateReviewFiles: document.getElementById("candidateReviewFiles"),
  candidateReviewDiff: document.getElementById("candidateReviewDiff"),
  applyCandidateBtn: document.getElementById("applyCandidateBtn"),
  discardCandidateBtn: document.getElementById("discardCandidateBtn"),
  chatScroll: document.getElementById("chatScroll"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
  referenceList: document.getElementById("referenceList"),
  referenceStatus: document.getElementById("referenceStatus"),
  referenceUploadBtn: document.getElementById("referenceUploadBtn"),
  referenceFile: document.getElementById("referenceFile"),
  referenceLinkBtn: document.getElementById("referenceLinkBtn"),
  referenceLinkForm: document.getElementById("referenceLinkForm"),
  referenceUrl: document.getElementById("referenceUrl"),
  referenceLinkSave: document.getElementById("referenceLinkSave"),
  referenceLinkCancel: document.getElementById("referenceLinkCancel"),
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
  openVersionsBtn: document.getElementById("openVersionsBtn"),
  versionsDialog: document.getElementById("versionsDialog"),
  versionsList: document.getElementById("versionsList"),
  versionsStatus: document.getElementById("versionsStatus"),
  versionDetails: document.getElementById("versionDetails"),
  versionBase: document.getElementById("versionBase"),
  versionTarget: document.getElementById("versionTarget"),
  compareVersionsBtn: document.getElementById("compareVersionsBtn"),
  versionComparison: document.getElementById("versionComparison"),
  closeVersionsBtn: document.getElementById("closeVersionsBtn"),
  confirmVersionRestoreDialog: document.getElementById("confirmVersionRestoreDialog"),
  confirmVersionRestoreCopy: document.getElementById("confirmVersionRestoreCopy"),
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
let landingModelTouched = false;
let landingModelControl = null;
let referenceBuildId = null;
let versionsBuildId = null;
let restoreIntent = null;
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

function showReferenceStatus(message, error = false) {
  els.referenceStatus.hidden = !message;
  els.referenceStatus.textContent = message || "";
  els.referenceStatus.dataset.error = String(error);
}

function clearReferenceUi() {
  referenceBuildId = null;
  els.referenceList.replaceChildren();
  els.referenceFile.value = "";
  els.referenceUrl.value = "";
  els.referenceLinkForm.hidden = true;
  showReferenceStatus("");
}

function renderReferences(references) {
  if (!references.length) {
    els.referenceList.innerHTML = '<span class="reference-empty">No references yet.</span>';
    return;
  }
  els.referenceList.innerHTML = references.map((reference) => {
    if (reference.kind === "uploaded") {
      return `<div class="reference-item">${escapeHtml(reference.filename)} <span>· ${escapeHtml(reference.mediaType)} · ${Number(reference.byteLength).toLocaleString()} bytes</span></div>`;
    }
    const url = escapeHtml(reference.url);
    return `<div class="reference-item"><a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.label || reference.url)}</a>${reference.label ? ` <span>· ${url}</span>` : ""}</div>`;
  }).join("");
}

async function refreshReferences(buildId) {
  try {
    const res = await fetch(`/api/builds/${encodeURIComponent(buildId)}/references`);
    const body = await res.json();
    if (activeBuildId !== buildId || referenceBuildId !== buildId) return false;
    if (!res.ok || !body?.ok) {
      els.referenceList.replaceChildren();
      showReferenceStatus(body?.message || body?.code || `Could not load references (HTTP ${res.status})`, true);
      return false;
    }
    renderReferences(body.references || []);
    return true;
  } catch (error) {
    if (activeBuildId === buildId && referenceBuildId === buildId) {
      els.referenceList.replaceChildren();
      showReferenceStatus(error instanceof Error ? error.message : "Could not load references", true);
    }
    return false;
  }
}

function versionLabel(version) {
  return `Version ${version.adoptionIndex + 1}`;
}

function versionStatus(message, error = false) {
  els.versionsStatus.textContent = message || "";
  els.versionsStatus.dataset.error = String(error);
}

function renderVersions(listing) {
  els.versionDetails.replaceChildren();
  els.versionComparison.replaceChildren();
  const versions = [...listing.versions].reverse();
  const current = listing.current;
  const pending = listing.restorePending;
  const currentLabel = current?.adoptionIndex == null
    ? "Current product state"
    : `Current · Version ${current.adoptionIndex + 1}`;
  els.versionsList.innerHTML = `${current && current.adoptionIndex === null
    ? `<div class="version-item"><strong>Current product state</strong><span>${current.git.resolvable ? "Resolvable" : "Unavailable"}</span></div>`
    : ""}${versions.length ? versions.map((version) => {
    const eligible = !pending && !version.current && version.git.resolvable &&
      version.recordedBuildMatches !== false && version.recordedBindingMatches !== false && Boolean(current?.sha);
    const date = version.adoptedAt ? ` · ${escapeHtml(version.adoptedAt.slice(0, 10))}` : "";
    const state = version.current ? "Current" : version.git.resolvable ? "Adopted" : "Unavailable";
    return `<div class="version-item" data-version-index="${version.adoptionIndex}">
      <div><strong>${escapeHtml(versionLabel(version))}</strong><span>${state}${date}</span></div>
      <div class="version-actions"><button type="button" class="ghost tiny" data-version-detail="${version.adoptionIndex}">Details</button>
      ${eligible ? `<button type="button" class="ghost tiny" data-version-restore="${version.adoptionIndex}">Restore…</button>` : ""}</div>
    </div>`;
  }).join("") : '<p class="hint">No adopted versions yet.</p>'}`;
  const selectors = [
    ...listing.versions.map((version) => ({ value: `adoption:${version.adoptionIndex}`, label: `${versionLabel(version)}${version.current ? " · Current" : ""}` })),
    ...(current ? [{ value: "current", label: currentLabel }] : []),
  ];
  for (const select of [els.versionBase, els.versionTarget]) {
    select.replaceChildren(...selectors.map(({ value, label }) => new Option(label, value)));
  }
  if (selectors.length) {
    els.versionBase.value = selectors[0].value;
    els.versionTarget.value = current ? "current" : selectors[selectors.length - 1].value;
  }
  els.compareVersionsBtn.disabled = selectors.length < 2;
  if (pending) versionStatus("A restore is being reconciled. Another restore is unavailable until it finishes.", true);
  else versionStatus(versions.length ? "" : "There are no adopted versions to compare yet.");
}

async function refreshVersions(buildId) {
  try {
    const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/versions`);
    const body = await response.json();
    if (activeBuildId !== buildId || versionsBuildId !== buildId) return null;
    if (!response.ok || !body?.ok) {
      els.versionsList.replaceChildren();
      versionStatus(body?.message || body?.code || "Could not load versions", true);
      return null;
    }
    renderVersions(body);
    return body;
  } catch (error) {
    if (activeBuildId === buildId && versionsBuildId === buildId) {
      versionStatus(error instanceof Error ? error.message : "Could not load versions", true);
    }
    return null;
  }
}

async function showVersionDetails(adoptionIndex) {
  const buildId = versionsBuildId;
  if (!buildId) return;
  try {
    const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/versions/${adoptionIndex}`);
    const body = await response.json();
    if (activeBuildId !== buildId || versionsBuildId !== buildId) return;
    if (!response.ok || !body?.ok) {
      versionStatus(body?.message || body?.code || "Could not read this version", true);
      return;
    }
    const version = body.version;
    els.versionDetails.textContent = `${versionLabel(version)} · ${version.git.resolvable ? "Resolvable" : "Unavailable"}${version.adoptedAt ? ` · Adopted ${version.adoptedAt.slice(0, 10)}` : ""}${version.files.length ? ` · ${version.files.length} recorded file${version.files.length === 1 ? "" : "s"}` : ""}`;
  } catch (error) {
    if (activeBuildId === buildId) versionStatus(error instanceof Error ? error.message : "Could not read this version", true);
  }
}

async function compareVersions() {
  const buildId = versionsBuildId;
  if (!buildId) return;
  try {
    const params = new URLSearchParams({ base: els.versionBase.value, target: els.versionTarget.value });
    const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/versions/compare?${params}`);
    const body = await response.json();
    if (activeBuildId !== buildId || versionsBuildId !== buildId) return;
    if (!response.ok || !body?.ok) {
      els.versionComparison.replaceChildren();
      versionStatus(body?.message || body?.code || "Could not compare versions", true);
      return;
    }
    const status = { A: "Added", M: "Modified", D: "Deleted", R: "Renamed", C: "Copied", T: "Type changed" };
    els.versionComparison.innerHTML = body.files.length
      ? `<p>${body.summary.changedFiles} changed file${body.summary.changedFiles === 1 ? "" : "s"}</p><ul>${body.files.map((file) => {
        const label = status[file.status[0]] || file.status;
        const counts = file.statsKnown && !file.binary ? ` · +${file.additions} / −${file.deletions}` : file.binary ? " · Binary" : "";
        return `<li>${escapeHtml(label)} · ${escapeHtml(file.previousPath ? `${file.previousPath} → ${file.path}` : file.path)}${counts}</li>`;
      }).join("")}</ul>`
      : "<p>These versions have the same committed file tree.</p>";
    versionStatus("");
  } catch (error) {
    if (activeBuildId === buildId) versionStatus(error instanceof Error ? error.message : "Could not compare versions", true);
  }
}

async function beginVersionRestore(adoptionIndex) {
  const buildId = versionsBuildId;
  if (!buildId) return;
  // Re-read P8.0 immediately before showing confirmation. S2 revalidates again.
  const listed = await refreshVersions(buildId);
  const version = listed?.versions?.[adoptionIndex];
  if (!listed || listed.restorePending || !listed.current?.sha || !version || version.current ||
      !version.git.resolvable || version.recordedBuildMatches === false || version.recordedBindingMatches === false) {
    if (listed && !listed.restorePending) versionStatus("This version is not eligible for restore. Review the refreshed list.", true);
    return;
  }
  restoreIntent = { buildId, adoptionIndex, expectedAuthoritativeSha: listed.current.sha };
  const currentLabel = listed.current.adoptionIndex == null ? "the current product state" : `current Version ${listed.current.adoptionIndex + 1}`;
  els.confirmVersionRestoreCopy.textContent = `${versionLabel(version)} will replace ${currentLabel} as the current product state.`;
  els.confirmVersionRestoreDialog.showModal();
}

async function submitVersionRestore(intent) {
  if (activeBuildId !== intent.buildId || versionsBuildId !== intent.buildId) return;
  versionStatus("Restoring version…");
  try {
    const response = await fetch(`/api/builds/${encodeURIComponent(intent.buildId)}/versions/restore`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adoptionIndex: intent.adoptionIndex, expectedAuthoritativeSha: intent.expectedAuthoritativeSha }),
    });
    const body = await response.json();
    if (activeBuildId !== intent.buildId || versionsBuildId !== intent.buildId) return;
    if (body?.code === "STALE_AUTHORITY") {
      await refreshVersions(intent.buildId);
      versionStatus("The product changed. Review the refreshed versions before requesting restore again.", true);
      return;
    }
    if (!response.ok || !body?.ok) {
      await refreshVersions(intent.buildId);
      versionStatus(body?.message || body?.code || "Restore failed", true);
      return;
    }
    const refreshed = await refreshVersions(intent.buildId);
    if (!refreshed) {
      versionStatus("Restore completed, but versions could not be refreshed. Reopen Versions to check the current state.", true);
      return;
    }
    if (body.noOp) versionStatus("This version already matches the current product state. No new version was created.");
    else versionStatus("Version restored. The earlier versions remain in history.");
    const viewResponse = await fetch(`/api/builds/${encodeURIComponent(intent.buildId)}`);
    if (viewResponse.ok && activeBuildId === intent.buildId) acceptView(await viewResponse.json());
  } catch (error) {
    versionStatus(error instanceof Error ? error.message : "Restore failed", true);
  }
}

function clearVersionsUi() {
  if (els.confirmVersionRestoreDialog.open) els.confirmVersionRestoreDialog.close("cancel");
  if (els.versionsDialog.open) els.versionsDialog.close();
  versionsBuildId = null;
  restoreIntent = null;
  els.versionsList.replaceChildren();
  els.versionDetails.replaceChildren();
  els.versionComparison.replaceChildren();
  versionStatus("");
}

els.openVersionsBtn?.addEventListener("click", () => {
  if (!activeBuildId || activeBuildId === "pending") return;
  clearVersionsUi();
  versionsBuildId = activeBuildId;
  els.versionsDialog.showModal();
  versionStatus("Loading versions…");
  void refreshVersions(activeBuildId);
});
els.closeVersionsBtn?.addEventListener("click", () => clearVersionsUi());
els.versionsDialog?.addEventListener("close", () => clearVersionsUi());
els.versionsList?.addEventListener("click", (event) => {
  const detail = event.target.closest("[data-version-detail]");
  const restore = event.target.closest("[data-version-restore]");
  if (detail) void showVersionDetails(Number(detail.dataset.versionDetail));
  if (restore) void beginVersionRestore(Number(restore.dataset.versionRestore));
});
els.compareVersionsBtn?.addEventListener("click", () => void compareVersions());
els.confirmVersionRestoreDialog?.addEventListener("close", () => {
  const intent = restoreIntent;
  restoreIntent = null;
  if (els.confirmVersionRestoreDialog.returnValue === "confirm" && intent) void submitVersionRestore(intent);
});

function setWorkspaceVisible(on) {
  els.landing.hidden = on;
  els.workspace.hidden = !on;
}

function renderModelSelect(select, hint, preferred, control, allowBeforeProject = false) {
  if (!select || !control) return;
  const options = Array.isArray(control.options) ? control.options : [{ value: "auto", label: "Auto" }];
  const displayedOptions = control.value === null
    ? [{ value: "", label: "Saved model not listed", disabled: true }, ...options]
    : options;
  const key = displayedOptions.map((option) => `${option.value}:${option.label}`).join("|");
  if (select.dataset.optionsKey !== key) {
    select.replaceChildren(...displayedOptions.map((option) => {
      const choice = new Option(option.label, option.value);
      choice.disabled = option.disabled === true;
      return choice;
    }));
    select.dataset.optionsKey = key;
  }
  select.value = control.value ?? "";
  select.disabled = !control.preferredEngine || (!allowBeforeProject && !control.editable);
  if (preferred) {
    preferred.hidden = !control.preferredEngine;
    preferred.textContent = control.preferredEngine
      ? `Preferred engine: ${control.preferredEngine[0].toUpperCase()}${control.preferredEngine.slice(1)}`
      : "";
  }
  if (hint) {
    hint.hidden = !control.diagnostic;
    hint.textContent = control.diagnostic || "";
  }
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
  const candidateEmbed = view.candidatePreview?.embedPath || null;
  // Candidate preview is only valid while pending. Never keep painting a
  // discarded/applied candidate as last-known-good product.
  if (!candidateEmbed && heldPreview && String(heldPreview.src || "").includes("/preview-candidate/")) {
    heldPreview = null;
  }
  const embed = candidateEmbed || view.preview?.embedPath || null;
  const direct = candidateEmbed ? null : view.preview?.url || null;
  const emptyProductRuntime =
    view.runtime?.status === "awaiting_product" ||
    view.runtime?.reason === "empty_tree" ||
    view.runtimeHealth === "awaiting_product" ||
    ((view.runtime?.reason === "no_preview_capability" ||
      view.runtime?.reason === "no_start_plan") &&
      (view.lastDiscardedCandidate ||
        view.uiState === "paused" ||
        (view.uiState !== "error" && view.status === "running")));
  const runtimeFailed =
    (view.runtime?.status === "failed" ||
      view.runtime?.status === "exited" ||
      view.runtime?.status === "unhealthy" ||
      view.runtime?.status === "unavailable") &&
    !emptyProductRuntime;
  const ready =
    Boolean(candidateEmbed) ||
    (!runtimeFailed && view.preview?.status === "ready");
  // "stale" means a persisted dead URL — not paintable until rematerialized.

  const nextSrc =
    ready && embed
      ? previewFrameSrc(embed, view.pendingCandidate?.sourceSha || view.authoritativeSha)
      : "";
  // lastGoodPreview is durable identity for rematerialization. It must NOT be
  // navigated into the iframe until the runtime is actually serving — otherwise
  // restart loads /preview/:id → 503 JSON and a same-URL "keep" never repaints.
  // Mid-session heldPreview (already painted HTML) still holds across prepare/fail.
  const decision = previewTransition({
    heldSrc: heldPreview?.src || "",
    nextReady: Boolean(ready && nextSrc),
    nextSrc,
    nextFailed: runtimeFailed && !candidateEmbed,
    preparing:
      !candidateEmbed &&
      (Boolean(view.previewPreparing) ||
        view.status === "running" ||
        (Boolean(view.lastGoodPreview?.sha) && !ready && !runtimeFailed)),
    allowCandidateHold: Boolean(candidateEmbed),
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
      els.previewEmptyTitle.textContent =
        view.lastDiscardedCandidate || view.status === "paused"
          ? view.progressLabel || "No product applied yet"
          : view.lastGoodPreview?.sha && !runtimeFailed
            ? "Restoring preview…"
            : view.progressLabel || "Building first version…";
    }
    if (els.previewEmptyDetail) {
      els.previewEmptyDetail.textContent =
        view.detail ||
        (view.lastDiscardedCandidate
          ? "That candidate was discarded. Apply a result to make it the live product."
          : view.lastGoodPreview?.sha && !runtimeFailed
            ? "Reopening the last applied product in the preview runtime."
            : "Your product will appear here as soon as the first runnable revision exists.");
    }
    // Never leave a red "Preview failed: no_preview_capability" after Discard
    // of a first-product candidate — that is empty product truth, not failure.
    if (emptyProductRuntime) {
      els.previewError.hidden = true;
      els.previewError.textContent = "";
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
  const frameSrc = visibleFrame?.getAttribute("src") || "";
  if (previewNeedsCommit(decision, frameSrc)) {
    commitPreviewSrc(decision.src);
  } else if (visibleFrame) {
    visibleFrame.hidden = false;
  }
  previewEmbed = decision.src;
  previewDirectUrl = direct;
  heldPreview = { buildId: view.buildId, src: decision.src };
  els.previewLabel.textContent = candidateEmbed
    ? "Candidate preview"
    : view.artifact?.framework
      ? `Live · ${view.artifact.framework}`
      : "Live product";
}

function renderCandidateReview(view) {
  if (!els.candidateReview) return;
  const candidate = view?.pendingCandidate;
  const show = Boolean(view?.canApply && candidate);
  els.candidateReview.hidden = !show;
  if (!show) return;
  const request = String(candidate.requestText || view.outcome || "").trim();
  const files = Array.isArray(candidate.files) ? candidate.files.filter(Boolean) : [];
  if (els.candidateReviewRequest) {
    els.candidateReviewRequest.textContent = request
      ? `Request: ${request.slice(0, 160)}`
      : "An engineer result is ready for your decision.";
  }
  if (els.candidateReviewFiles) {
    els.candidateReviewFiles.textContent = files.length
      ? `Files: ${files.slice(0, 8).join(", ")}${files.length > 8 ? "…" : ""}`
      : "Files: see candidate preview";
  }
  if (els.candidateReviewDiff) {
    const sha = candidate.sourceSha ? String(candidate.sourceSha).slice(0, 12) : "";
    els.candidateReviewDiff.textContent = candidate.diffSummary
      ? candidate.diffSummary
      : sha
        ? `Candidate ${sha}`
        : "";
  }
}

/**
 * @param {any} view
 */
function render(view) {
  lastView = view;
  if (view?.serving) renderServingIdentity(view.serving);
  if (view?.modelControl) {
    renderModelSelect(els.workspaceModel, els.workspaceModelHint, els.workspacePreferredEngine, view.modelControl);
  }
  if (!view || (view.phase === "idle" && !activeBuildId) || (!view.buildId && !activeBuildId)) {
    setWorkspaceVisible(false);
    return;
  }

  setWorkspaceVisible(true);
  activeBuildId = view.buildId;
  projectRoot = view.projectRoot || null;
  const canAttach = Boolean(view.buildId && view.buildId !== "pending" && projectRoot);
  els.referenceUploadBtn.disabled = !canAttach;
  els.referenceLinkBtn.disabled = !canAttach;
  if (!canAttach) {
    clearReferenceUi();
  } else if (referenceBuildId !== view.buildId) {
    clearReferenceUi();
    referenceBuildId = view.buildId;
    void refreshReferences(view.buildId);
  }
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
    // Phase 5: no manufactured criteria ceremony in the creator chrome.
    els.criteriaLine.textContent = "";
    els.criteriaLine.hidden = true;
  }
  if (els.requestLine) {
    const live = ["understanding", "engineering", "verifying", "reviewing"].includes(
      view.creatorPhase,
    );
    if (live) {
      const requestPhase = {
        understanding: "Understanding",
        engineering: "Engineering",
        verifying: "Verifying",
        reviewing: "Reviewing",
      }[view.creatorPhase] || "Current request";
      els.requestLine.hidden = false;
      els.requestLine.textContent = view.requestLabel
        ? `Current request · ${requestPhase} · ${view.requestLabel}`
        : `Current request · ${requestPhase}`;
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
      els.chatInput.placeholder = view.starting
        ? "Creating the project folder…"
        : view.projectRoot
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
  if (view.status === "awaiting_review") {
    phaseLabels.reviewing = "Review this result";
  }
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
  renderCandidateReview(view);
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
  // A late response from a previously open Build cannot restore its UI or references.
  if (activeBuildId && view.buildId && view.buildId !== activeBuildId) return;
  const revision = Number(view.viewRevision);
  if (
    !shouldAcceptBuildView({
      previousBuildId: lastView?.buildId || null,
      nextBuildId: view.buildId || null,
      previousRevision: renderedRevision,
      nextRevision: revision,
    })
  ) {
    return;
  }
  if (view.buildId && lastView?.buildId && view.buildId !== lastView.buildId) {
    renderedRevision = -1;
    heldPreview = null;
  }
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
    conversation: [{ role: "user", text: outcome, kind: "outcome", status: "queued" }],
    starting: true,
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
      body: JSON.stringify({ outcome, originKind: "build-created", ...(landingModelTouched ? { modelId: els.landingModel.value } : {}) }),
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
    renderedRevision = -1;
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
          : action === "apply"
            ? els.applyCandidateBtn
            : action === "discard"
              ? els.discardCandidateBtn
              : els.recoverBuildBtn;
  if (button) button.disabled = true;
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
    if (action === "apply" || action === "discard") {
      heldPreview = null;
      if (visibleFrame && String(visibleFrame.src || "").includes("/preview-candidate/")) {
        visibleFrame.removeAttribute("src");
        visibleFrame.hidden = true;
      }
    }
    if (body.view) acceptView(body.view);
  } catch (error) {
    showHandoffResult(action, {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (button) button.disabled = false;
  }
}

els.buildBtn.addEventListener("click", () => void startBuild());
els.landingModel?.addEventListener("change", () => { landingModelTouched = true; });
els.workspaceModel?.addEventListener("change", async () => {
  if (!activeBuildId || !lastView?.modelControl?.editable) return;
  const modelId = els.workspaceModel.value;
  try {
    const res = await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}/model-preference`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      renderModelSelect(els.workspaceModel, els.workspaceModelHint, els.workspacePreferredEngine, lastView.modelControl);
      showHandoffResult("Model preference", body || { ok: false, message: `HTTP ${res.status}` });
      return;
    }
    if (body.view) render(body.view);
  } catch (error) {
    renderModelSelect(els.workspaceModel, els.workspaceModelHint, els.workspacePreferredEngine, lastView.modelControl);
    showHandoffResult("Model preference", { ok: false, message: error instanceof Error ? error.message : "Request failed" });
  }
});
els.referenceUploadBtn?.addEventListener("click", () => {
  if (activeBuildId && referenceBuildId === activeBuildId) els.referenceFile.click();
});
els.referenceFile?.addEventListener("change", async () => {
  const file = els.referenceFile.files?.[0];
  const buildId = activeBuildId;
  if (!file || !buildId || referenceBuildId !== buildId) return;
  els.referenceUploadBtn.disabled = true;
  showReferenceStatus(`Attaching ${file.name}…`);
  try {
    const res = await fetch(`/api/builds/${encodeURIComponent(buildId)}/references/upload`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Reference-Filename": encodeURIComponent(file.name),
      },
      body: file,
    });
    const body = await res.json();
    if (activeBuildId !== buildId || referenceBuildId !== buildId) return;
    if (!res.ok || !body?.ok) {
      showReferenceStatus(body?.message || body?.code || `Upload failed (HTTP ${res.status})`, true);
      return;
    }
    if (await refreshReferences(buildId) && activeBuildId === buildId) showReferenceStatus(`Attached ${file.name}.`);
  } catch (error) {
    if (activeBuildId === buildId && referenceBuildId === buildId) {
      showReferenceStatus(error instanceof Error ? error.message : "Upload failed", true);
    }
  } finally {
    els.referenceFile.value = "";
    els.referenceUploadBtn.disabled = !activeBuildId || referenceBuildId !== activeBuildId;
  }
});
els.referenceLinkBtn?.addEventListener("click", () => {
  if (!activeBuildId || referenceBuildId !== activeBuildId) return;
  els.referenceLinkForm.hidden = false;
  els.referenceUrl.focus();
});
els.referenceLinkCancel?.addEventListener("click", () => {
  els.referenceUrl.value = "";
  els.referenceLinkForm.hidden = true;
  showReferenceStatus("");
});
els.referenceLinkForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const buildId = activeBuildId;
  if (!buildId || referenceBuildId !== buildId) return;
  els.referenceLinkSave.disabled = true;
  showReferenceStatus("Saving link…");
  try {
    const res = await fetch(`/api/builds/${encodeURIComponent(buildId)}/references/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: els.referenceUrl.value.trim() }),
    });
    const body = await res.json();
    if (activeBuildId !== buildId || referenceBuildId !== buildId) return;
    if (!res.ok || !body?.ok) {
      showReferenceStatus(body?.message || body?.code || `Link failed (HTTP ${res.status})`, true);
      return;
    }
    els.referenceUrl.value = "";
    els.referenceLinkForm.hidden = true;
    if (await refreshReferences(buildId) && activeBuildId === buildId) showReferenceStatus("Link saved.");
  } catch (error) {
    if (activeBuildId === buildId && referenceBuildId === buildId) {
      showReferenceStatus(error instanceof Error ? error.message : "Link failed", true);
    }
  } finally {
    els.referenceLinkSave.disabled = false;
  }
});
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
els.applyCandidateBtn?.addEventListener("click", () => void controlBuild("apply"));
els.discardCandidateBtn?.addEventListener("click", () => void controlBuild("discard"));

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
  clearReferenceUi();
  clearVersionsUi();
  landingModelTouched = false;
  renderModelSelect(els.landingModel, null, els.landingPreferredEngine, landingModelControl, true);
  if (visibleFrame) {
    visibleFrame.removeAttribute("src");
    visibleFrame.hidden = true;
  }
  if (spareFrame) {
    spareFrame.removeAttribute("src");
    spareFrame.hidden = true;
  }
  if (els.candidateReview) els.candidateReview.hidden = true;
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
  const res = await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}`);
  const view = await res.json().catch(() => null);
  if (view?.buildId) acceptView(view);
  else if (els.previewFrame.src) {
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
        <span class="project-meta"><span>${escapeHtml(row.creatorStatus || row.status || "")}</span><span>${escapeHtml(relativeTime(row.activityAt || row.updatedAt))}</span></span>
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

/**
 * Phase 6 project-rail accordion. Replaces <details>/<summary> with a row
 * system: consistent height, left label, right value, chevron.
 * @param {string} railKey
 * @param {boolean} [forceOpen]
 */
function setRailRowOpen(railKey, forceOpen) {
  const row = document.querySelector(`.rail-row[data-rail="${railKey}"]`);
  if (!row) return;
  const head = row.querySelector(".rail-row-head");
  const body = row.querySelector(".rail-row-body");
  if (!head || !body) return;
  const next =
    typeof forceOpen === "boolean" ? forceOpen : row.getAttribute("data-open") !== "true";
  row.setAttribute("data-open", next ? "true" : "false");
  head.setAttribute("aria-expanded", next ? "true" : "false");
  body.hidden = !next;
}

function bindRailRows() {
  document.querySelectorAll(".rail-row-head").forEach((head) => {
    if (head.dataset.bound === "1") return;
    head.dataset.bound = "1";
    head.addEventListener("click", () => {
      const row = head.closest(".rail-row");
      const key = row?.getAttribute("data-rail");
      if (!key) return;
      setRailRowOpen(key);
    });
  });
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
  bindRailRows();
}

async function openProject(buildId, mode, title) {
  if (!buildId) return;
  const url = new URL(location.href);
  url.searchParams.set("buildId", buildId);
  if (mode === "push") history.pushState({ buildId }, "", url);
  else if (mode === "replace") history.replaceState({ buildId }, "", url);
  activeBuildId = buildId;
  clearReferenceUi();
  clearVersionsUi();
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

function renderServingIdentity(serving) {
  if (!serving || !els.codeIdentity) return;
  const procs = Array.isArray(serving.processes) ? serving.processes : [];
  const sha = typeof serving.sha === "string" ? serving.sha : "";
  const shortSha = sha ? sha.slice(0, 12) : "";
  els.codeIdentityMain.textContent = `PATH ${serving.version || ""} · ${serving.label || "unknown"}`;
  if (els.codeIdentitySha) {
    els.codeIdentitySha.textContent = shortSha
      ? `${shortSha}${serving.exact === false || serving.stale ? " · stale" : ""}`
      : "";
    els.codeIdentitySha.hidden = !shortSha;
  }
  els.codeIdentityProcs.textContent = procs
    .map((p) => {
      const pSha =
        typeof p.sha === "string" && p.sha
          ? p.sha.slice(0, 7)
          : typeof p.identity?.sha === "string"
            ? p.identity.sha.slice(0, 7)
            : "";
      return `${p.role}${pSha ? ` ${pSha}` : ""} pid ${p.pid ?? "?"}${p.stale ? " STALE" : ""}`;
    })
    .join("\n");
  els.codeIdentity.classList.toggle("is-stale", Boolean(serving.stale || !serving.exact));
  els.codeIdentity.dataset.sha = sha;
  const warnings = Array.isArray(serving.warnings) ? serving.warnings : [];
  els.staleCode.hidden = warnings.length === 0;
  els.staleCode.innerHTML = warnings.length
    ? `<strong>${serving.stale ? "Stale code" : "Unattributable code"}</strong> — ${warnings
        .map((w) => escapeHtml(w))
        .join("<br />")}`
    : "";
}

async function refreshServingIdentity() {
  try {
    const res = await fetch("/api/identity");
    if (res.ok) renderServingIdentity(await res.json());
  } catch {
    /* surface offline; the next poll retries */
  }
}

void refreshServingIdentity();
setInterval(() => void refreshServingIdentity(), 5_000);
bindRailRows();

(async () => {
  try {
    try {
      const health = await fetch("/api/health").then((response) => response.json());
      landingModelControl = health?.modelControl || null;
      renderModelSelect(els.landingModel, null, els.landingPreferredEngine, landingModelControl, true);
    } catch {
      /* The static Auto control remains available while the surface reconnects. */
    }
    await loadProjects();
    const fromUrl = new URLSearchParams(location.search).get("buildId");
    if (fromUrl) await openProject(fromUrl, "replace");
  } catch {
    if (activeBuildId) setWorkspaceVisible(true);
  }
})();
