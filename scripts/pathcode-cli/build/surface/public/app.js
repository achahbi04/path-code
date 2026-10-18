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
  openEnvironmentsBtn: document.getElementById("openEnvironmentsBtn"),
  openIntegrationsBtn: document.getElementById("openIntegrationsBtn"),
  environmentsDialog: document.getElementById("environmentsDialog"),
  integrationsDialog: document.getElementById("integrationsDialog"),
  integrationsStatus: document.getElementById("integrationsStatus"),
  createIntegrationForm: document.getElementById("createIntegrationForm"),
  integrationProvider: document.getElementById("integrationProvider"),
  newIntegrationLabel: document.getElementById("newIntegrationLabel"),
  integrationsList: document.getElementById("integrationsList"),
  integrationDetails: document.getElementById("integrationDetails"),
  integrationProviderName: document.getElementById("integrationProviderName"),
  integrationName: document.getElementById("integrationName"),
  renameIntegrationBtn: document.getElementById("renameIntegrationBtn"),
  deleteIntegrationBtn: document.getElementById("deleteIntegrationBtn"),
  renameIntegrationForm: document.getElementById("renameIntegrationForm"),
  renameIntegrationLabel: document.getElementById("renameIntegrationLabel"),
  cancelRenameIntegrationBtn: document.getElementById("cancelRenameIntegrationBtn"),
  integrationBindings: document.getElementById("integrationBindings"),
  integrationEnvironmentSelect: document.getElementById("integrationEnvironmentSelect"),
  bindIntegrationEnvironmentBtn: document.getElementById("bindIntegrationEnvironmentBtn"),
  integrationCredentialSection: document.getElementById("integrationCredentialSection"),
  integrationCredentialRole: document.getElementById("integrationCredentialRole"),
  integrationCredentialSelect: document.getElementById("integrationCredentialSelect"),
  bindIntegrationCredentialBtn: document.getElementById("bindIntegrationCredentialBtn"),
  manageIntegrationEnvironmentsBtn: document.getElementById("manageIntegrationEnvironmentsBtn"),
  closeIntegrationsBtn: document.getElementById("closeIntegrationsBtn"),
  environmentsStatus: document.getElementById("environmentsStatus"),
  environmentsList: document.getElementById("environmentsList"),
  environmentDetails: document.getElementById("environmentDetails"),
  environmentName: document.getElementById("environmentName"),
  environmentVariables: document.getElementById("environmentVariables"),
  createEnvironmentForm: document.getElementById("createEnvironmentForm"),
  newEnvironmentName: document.getElementById("newEnvironmentName"),
  renameEnvironmentBtn: document.getElementById("renameEnvironmentBtn"),
  deleteEnvironmentBtn: document.getElementById("deleteEnvironmentBtn"),
  configForm: document.getElementById("configForm"),
  configVariableName: document.getElementById("configVariableName"),
  configValue: document.getElementById("configValue"),
  secretBindingForm: document.getElementById("secretBindingForm"),
  secretVariableName: document.getElementById("secretVariableName"),
  secretBackend: document.getElementById("secretBackend"),
  vercelLocatorForm: document.getElementById("vercelLocatorForm"),
  vercelLocatorVariable: document.getElementById("vercelLocatorVariable"),
  vercelTeamRef: document.getElementById("vercelTeamRef"),
  vercelProjectRef: document.getElementById("vercelProjectRef"),
  vercelTargetRef: document.getElementById("vercelTargetRef"),
  vercelBindingRef: document.getElementById("vercelBindingRef"),
  cancelVercelLocatorBtn: document.getElementById("cancelVercelLocatorBtn"),
  runtimeEnvironmentSelect: document.getElementById("runtimeEnvironmentSelect"),
  startEnvironmentRuntimeBtn: document.getElementById("startEnvironmentRuntimeBtn"),
  runtimeEnvironmentState: document.getElementById("runtimeEnvironmentState"),
  closeEnvironmentsBtn: document.getElementById("closeEnvironmentsBtn"),
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
let environmentsBuildId = null;
let environmentState = null;
let selectedEnvironmentId = null;
let runtimeEnvironmentId = null;
let locatorVariableName = null;
let integrationsBuildId = null;
let integrationState = null;
let integrationCatalog = [];
let integrationEnvironmentState = null;
let selectedIntegrationId = null;
let selectedIntegrationBindingId = null;
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

const environmentMessages = {
  ENVIRONMENT_REVISION_STALE: "Environment settings changed. Review the latest state and try again.",
  STALE_ENVIRONMENT_AUTHORITY: "Environment settings changed. Review the latest state and try again.",
  ENVIRONMENT_NOT_EMPTY: "Remove this environment's config and bindings before deleting it.",
  VARIABLE_KIND_CONFLICT: "Choose replacement explicitly to change this variable's kind.",
  CONFIG_SECRET_NAME_REJECTED: "This variable belongs in a secret binding.",
  CONFIG_VALUE_INVALID: "This value cannot be saved as ordinary config. Use a secret binding for credentials.",
  VARIABLE_NAME_RESERVED: "This name is reserved for PATH operations.",
  LOCAL_ENV_TRACKED: ".env.local is tracked by Git and cannot be used safely.",
  LOCAL_ENV_NOT_IGNORED: ".env.local is not safely ignored by Git.",
  LOCAL_ENV_PATH_UNSAFE: ".env.local is not a safe local file.",
  LOCAL_SECRET_MISSING: "The variable is not present in .env.local.",
  LOCAL_ENV_SYNTAX_UNSUPPORTED: ".env.local uses syntax PATH cannot safely read.",
  LOCAL_ENV_DUPLICATE: ".env.local defines a variable more than once.",
  LOCAL_ENV_NATIVE_LOAD_UNSAFE: ".env.local contains a name outside this environment's local bindings.",
  SECRET_BACKEND_UNAVAILABLE: "Vercel secret values are not available to the local preview.",
  PROVIDER_VERIFICATION_UNAVAILABLE: "PATH cannot safely verify this Vercel secret yet.",
  RESTORE_PENDING: "A version restore is pending. Try again after it is resolved.",
  ENVIRONMENT_NOT_FOUND: "This environment is no longer available.",
  SECRET_BINDING_NOT_FOUND: "This binding is no longer available.",
};
function environmentStatus(message, error = false) {
  els.environmentsStatus.textContent = message || "";
  els.environmentsStatus.dataset.error = String(error);
}
function environmentError(code) {
  return environmentMessages[code] || "The requested environment action could not be completed.";
}
function selectedEnvironment() {
  return environmentState?.items?.find((item) => item.environmentId === selectedEnvironmentId) || null;
}
function statusLabel(value) {
  return ({ configured: "Configured", unknown: "Unknown",
    verified_present: "Verified present", verified_missing: "Verified missing",
    verified_safe: "Verified safe", verified_unsafe: "Verified unsafe" })[value] || "Unknown";
}
function renderCurrentRuntimeEnvironment() {
  const currentRuntimeId = lastView?.runtime?.selectedEnvironmentId || null;
  const currentName = environmentState?.items?.find((item) => item.environmentId === currentRuntimeId)?.name;
  els.runtimeEnvironmentState.textContent = currentName
    ? `Current preview: ${currentName}`
    : currentRuntimeId ? "Current preview: an environment no longer listed here." :
      "Current preview: no P9 environment selected.";
}
function renderEnvironments() {
  if (!environmentState) return;
  const items = environmentState.items;
  els.environmentsList.innerHTML = items.length ? items.map((item) => {
    const configs = item.variables.filter((entry) => entry.kind === "config").length;
    const secrets = item.variables.length - configs;
    return `<button type="button" class="environment-item" data-environment-id="${escapeHtml(item.environmentId)}"
      aria-current="${item.environmentId === selectedEnvironmentId}">
      <strong>${escapeHtml(item.name)}</strong><small>${configs} config · ${secrets} secret bindings</small></button>`;
  }).join("") : '<p class="hint">No environments yet. Create one when you need project settings.</p>';
  const options = [new Option("No environment", ""), ...items.map((item) => new Option(item.name, item.environmentId))];
  els.runtimeEnvironmentSelect.replaceChildren(...options);
  if (!items.some((item) => item.environmentId === runtimeEnvironmentId)) runtimeEnvironmentId = null;
  els.runtimeEnvironmentSelect.value = runtimeEnvironmentId || "";
  renderCurrentRuntimeEnvironment();
  const selected = selectedEnvironment();
  els.environmentDetails.hidden = !selected;
  if (!selected) return;
  els.environmentName.textContent = selected.name;
  els.environmentVariables.innerHTML = selected.variables.length ? selected.variables.map((entry) => {
    const name = escapeHtml(entry.variableName);
    if (entry.kind === "config") return `<div class="environment-variable">
      <div class="environment-variable-main"><strong>${name}</strong>
      <small>Config · ${escapeHtml(entry.value)}</small></div>
      <button type="button" class="ghost tiny" data-config-edit="${name}">Edit</button>
      <button type="button" class="ghost tiny" data-config-remove="${name}">Remove</button></div>`;
    const source = entry.backend === "local_env_file" ? "Source: .env.local" : "Backend: Vercel";
    const safety = entry.backend === "local_env_file"
      ? ` · Safety: ${statusLabel(entry.safetyState)}` : "";
    return `<div class="environment-variable">
      <div class="environment-variable-main"><strong>${name}</strong>
      <small>${source} · Binding: ${statusLabel(entry.bindingState)} · Presence: ${statusLabel(entry.presenceState)}${safety}</small></div>
      ${entry.backend === "local_env_file"
        ? `<button type="button" class="ghost tiny" data-secret-verify="${name}">Verify</button>`
        : `<button type="button" class="ghost tiny" data-vercel-locator="${name}">Location</button>`}
      <button type="button" class="ghost tiny" data-secret-unbind="${name}">Unbind</button></div>`;
  }).join("") : '<p class="hint">No variables in this environment.</p>';
}
async function refreshEnvironments(buildId) {
  try {
    const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/environments`);
    const body = await response.json();
    if (activeBuildId !== buildId || environmentsBuildId !== buildId) return null;
    if (!response.ok || !body?.ok) {
      environmentStatus(environmentError(body?.code), true);
      return null;
    }
    environmentState = { revision: body.revision, items: body.items };
    if (!body.items.some((item) => item.environmentId === selectedEnvironmentId)) {
      selectedEnvironmentId = body.items[0]?.environmentId || null;
    }
    renderEnvironments();
    return environmentState;
  } catch {
    if (activeBuildId === buildId) environmentStatus("Could not load environments.", true);
    return null;
  }
}
async function submitEnvironmentAction(action, input) {
  if (!activeBuildId || !environmentState) return false;
  const buildId = activeBuildId;
  try {
    const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/environments/mutate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, input, expectedEnvironmentRevision: environmentState.revision }),
    });
    const body = await response.json();
    if (activeBuildId !== buildId) return false;
    if (!response.ok || !body?.ok) {
      if (["ENVIRONMENT_REVISION_STALE", "STALE_ENVIRONMENT_AUTHORITY"].includes(body?.code)) {
        await refreshEnvironments(buildId);
      }
      environmentStatus(environmentError(body?.code), true);
      return false;
    }
    if (action === "create_environment") selectedEnvironmentId = body.environmentId;
    const refreshed = await refreshEnvironments(buildId);
    environmentStatus(refreshed ? "Environment settings saved." : "Saved, but the latest settings could not be loaded.", !refreshed);
    return Boolean(refreshed);
  } catch {
    environmentStatus("Could not save environment settings.", true);
    return false;
  }
}
async function verifyLocalBinding(variableName) {
  if (!activeBuildId || !environmentState || !selectedEnvironmentId) return;
  const buildId = activeBuildId;
  try {
    const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/environments/verify-local`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ environmentId: selectedEnvironmentId, variableName,
        expectedEnvironmentRevision: environmentState.revision }),
    });
    const body = await response.json();
    if (activeBuildId !== buildId) return;
    if (!response.ok || !body?.ok) {
      if (body?.code === "STALE_ENVIRONMENT_AUTHORITY") await refreshEnvironments(buildId);
      environmentStatus(environmentError(body?.code), true);
      return;
    }
    await refreshEnvironments(buildId);
    if (body.safetyState === "verified_unsafe") {
      environmentStatus(".env.local is not safe for local runtime. Check Git tracking, ignore rules, and file location.", true);
    } else if (body.presenceState === "verified_missing") {
      environmentStatus("The variable is not present in .env.local.", true);
    } else {
      environmentStatus(`Verification complete: presence ${statusLabel(body.presenceState)}, safety ${statusLabel(body.safetyState)}.`);
    }
  } catch {
    environmentStatus("Could not verify this local binding.", true);
  }
}
function clearEnvironmentsUi() {
  if (els.environmentsDialog.open) els.environmentsDialog.close();
  environmentsBuildId = null;
  environmentState = null;
  selectedEnvironmentId = null;
  runtimeEnvironmentId = null;
  locatorVariableName = null;
  els.environmentsList.replaceChildren();
  els.environmentVariables.replaceChildren();
  els.vercelLocatorForm.hidden = true;
  environmentStatus("");
}
els.openEnvironmentsBtn?.addEventListener("click", () => {
  if (!activeBuildId || activeBuildId === "pending") return;
  environmentsBuildId = activeBuildId;
  els.environmentsDialog.showModal();
  environmentStatus("Loading environments…");
  void refreshEnvironments(activeBuildId);
});
els.closeEnvironmentsBtn?.addEventListener("click", () => els.environmentsDialog.close());
els.environmentsDialog?.addEventListener("close", () => {
  environmentsBuildId = null;
  environmentState = null;
  locatorVariableName = null;
});

const integrationMessages = {
  CREDENTIAL_REQUIRED: "Choose a secret binding for the required credential role.",
  CREDENTIAL_NOT_READY: "This credential needs local verification in Environments before PATH can use it.",
  CREDENTIAL_MISSING: "The local credential is missing. Check the project's ignored .env.local file.",
  CREDENTIAL_SOURCE_UNSAFE: "The local credential source is not safe to read. Review it in Environments.",
  CREDENTIAL_SOURCE_UNAVAILABLE: "PATH could not safely check the local credential source.",
  CREDENTIAL_MATERIAL_UNAVAILABLE: "PATH cannot verify this Vercel-managed credential locally.",
  INTEGRATION_ADAPTER_UNAVAILABLE: "PATH does not currently have a verification adapter for this provider.",
  PROVIDER_CREDENTIAL_REJECTED: "The provider rejected this credential. Check its value with the provider.",
  PROVIDER_UNAVAILABLE: "The provider could not be reached. You can try verification again later.",
  PROVIDER_RESPONSE_UNSAFE: "The provider response could not be verified safely.",
  INTEGRATION_AUTHORITY_STALE: "This integration changed during verification. Review the latest state.",
  INTEGRATION_ENVIRONMENT_STALE: "The environment or credential binding changed. Review the latest state.",
  INTEGRATION_CREDENTIAL_CHANGED: "The local credential changed during verification. Review it before trying again.",
  INTEGRATION_REVISION_STALE: "Integrations changed. The latest state has been loaded.",
  INTEGRATION_SECRET_REF_NOT_FOUND: "That secret variable is no longer available in this environment.",
  RESTORE_PENDING: "A version restore is pending. Try again after it is resolved.",
  INTEGRATION_NOT_EMPTY: "Remove its environment bindings before deleting this integration.",
  INTEGRATION_BINDING_NOT_EMPTY: "Remove the credential role before removing this environment.",
};
function integrationStatus(message, error = false) {
  els.integrationsStatus.textContent = message || "";
  els.integrationsStatus.dataset.error = String(error);
}
function integrationError(code) {
  return integrationMessages[code] || "The integration change could not be completed. Review the latest state and try again.";
}
function selectedIntegration() {
  return integrationState?.items?.find((item) => item.integrationId === selectedIntegrationId) || null;
}
function selectedIntegrationBinding() {
  return selectedIntegration()?.bindings?.find((item) => item.bindingId === selectedIntegrationBindingId) || null;
}
function integrationVerificationLabel(binding) {
  if (binding.needsReverification) return "Reverification required";
  return ({ unverified: "Not verified", ready: "Connected", action_required: "Action required", unavailable: "Unavailable" })[binding.verification?.state] || "Not verified";
}
function integrationVerificationMessage(verification) {
  if (verification?.failureCode) return integrationError(verification.failureCode);
  return "";
}
function integrationReadiness(credential) {
  if (!credential.resolved) return "Binding no longer resolves";
  if (credential.backend === "vercel_env") return "Configured externally";
  if (credential.bindingState !== "configured") return "Needs local setup";
  if (credential.presenceState === "verified_missing") return "Missing";
  if (credential.presenceState !== "verified_present") return "Needs local verification";
  if (credential.safetyState === "verified_unsafe") return "Unsafe source";
  if (credential.safetyState !== "verified_safe") return "Needs local verification";
  return "Present / Safe";
}
function renderIntegrationCredentialOptions() {
  const integration = selectedIntegration();
  const binding = selectedIntegrationBinding();
  const environment = integrationEnvironmentState?.items?.find((item) => item.environmentId === binding?.environmentId);
  if (!integration || !binding || !environment) {
    els.integrationCredentialSelect.replaceChildren(new Option("Choose an environment first", ""));
    els.bindIntegrationCredentialBtn.disabled = true;
    return;
  }
  const variables = environment.variables.filter((item) => item.kind === "secret");
  const options = [new Option(variables.length ? "Choose a secret variable" : "No secret bindings in this environment", "")];
  for (const item of variables) {
    const ready = item.backend === "vercel_env" ? "Configured externally" :
      item.presenceState === "verified_present" && item.safetyState === "verified_safe" ? "Present / Safe" :
        item.presenceState === "verified_missing" ? "Missing" : "Needs local verification";
    options.push(new Option(`${item.variableName} · ${item.backend} · ${ready}`, item.variableName));
  }
  els.integrationCredentialSelect.replaceChildren(...options);
  const provider = integrationCatalog.find((item) => item.providerKey === integration.providerKey);
  const roles = provider?.credentialRoles || [];
  const hasUnboundRequiredRole = roles.some((role) => role.required && !binding.credentials.some((item) => item.role === role.role));
  els.bindIntegrationCredentialBtn.disabled = !variables.length || !hasUnboundRequiredRole;
  const role = roles.find((item) => item.required && !binding.credentials.some((entry) => entry.role === item.role)) || roles[0];
  els.integrationCredentialRole.textContent = role?.role || "credential";
}
function renderIntegrations() {
  if (!integrationState) return;
  els.integrationsList.innerHTML = integrationState.items.length ? integrationState.items.map((item) => `
    <button type="button" class="integration-item" data-integration-id="${escapeHtml(item.integrationId)}" aria-current="${item.integrationId === selectedIntegrationId}">
      <strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.providerDisplayName)}</small>
    </button>`).join("") : '<p class="hint">No integrations yet. Add one to connect a provider.</p>';
  const integration = selectedIntegration();
  els.integrationDetails.hidden = !integration;
  if (!integration) {
    els.integrationBindings.replaceChildren();
    els.integrationCredentialSection.hidden = true;
    return;
  }
  els.integrationProviderName.textContent = integration.providerDisplayName;
  els.integrationName.textContent = integration.label;
  els.deleteIntegrationBtn.disabled = integration.bindings.length > 0;
  const boundEnvironmentIds = new Set(integration.bindings.map((item) => item.environmentId));
  const environments = integrationEnvironmentState?.items || [];
  const envOptions = [new Option(environments.length ? "Choose an environment" : "Create an environment first", "")];
  for (const environment of environments.filter((item) => !boundEnvironmentIds.has(item.environmentId))) {
    envOptions.push(new Option(environment.name, environment.environmentId));
  }
  els.integrationEnvironmentSelect.replaceChildren(...envOptions);
  els.bindIntegrationEnvironmentBtn.disabled = envOptions.length < 2;
  els.integrationBindings.innerHTML = integration.bindings.length ? integration.bindings.map((binding) => {
    const credentialHtml = binding.credentials.length ? binding.credentials.map((credential) => `
      <div class="integration-credential"><span><strong>${escapeHtml(credential.role)}</strong> · ${escapeHtml(credential.variableName || "Unresolved secret")}
        <small>${escapeHtml(credential.variableName ? integrationReadiness(credential) : "Binding no longer resolves")}</small></span>
        <button type="button" class="ghost tiny" data-unbind-role="${escapeHtml(credential.role)}" data-binding-id="${escapeHtml(binding.bindingId)}">Unbind</button></div>`).join("")
      : '<p class="hint">No credential role is bound to this environment.</p>';
    const verification = binding.verification || {};
    const capabilityHtml = verification.capabilities?.length
      ? `<p class="integration-capabilities">Capabilities: ${verification.capabilities.map(escapeHtml).join(", ")}</p>` : "";
    const verifiedAt = verification.verifiedAt ? `<p class="hint">Last verified ${escapeHtml(new Date(verification.verifiedAt).toLocaleString())}</p>` : "";
    const failure = integrationVerificationMessage(verification);
    const verifyLabel = binding.verification?.state === "ready" || binding.needsReverification ? "Reverify" : "Verify";
    return `<article class="integration-binding" data-binding-id="${escapeHtml(binding.bindingId)}" data-select-binding="${escapeHtml(binding.bindingId)}" aria-current="${binding.bindingId === selectedIntegrationBindingId}">
      <div class="integration-binding-heading"><div><strong>${escapeHtml(binding.environmentName || "Environment unavailable")}</strong>
        <small>${escapeHtml(integrationVerificationLabel(binding))}</small></div>
        <div class="integration-actions"><button type="button" class="ghost tiny" data-verify-binding="${escapeHtml(binding.bindingId)}">${verifyLabel}</button>
          <button type="button" class="ghost tiny" data-unbind-environment="${escapeHtml(binding.bindingId)}" ${binding.credentials.length ? "disabled" : ""}>Remove environment</button></div></div>
      ${credentialHtml}${verifiedAt}${capabilityHtml}${failure ? `<p class="integration-failure">${escapeHtml(failure)}</p>` : ""}
    </article>`;
  }).join("") : '<p class="hint">No environments are connected yet.</p>';
  const binding = selectedIntegrationBinding();
  els.integrationCredentialSection.hidden = !binding;
  if (binding) renderIntegrationCredentialOptions();
}
async function refreshIntegrations(buildId) {
  try {
    const [response, catalogResponse] = await Promise.all([
      fetch(`/api/builds/${encodeURIComponent(buildId)}/integrations`),
      fetch(`/api/builds/${encodeURIComponent(buildId)}/integrations/catalog`),
    ]);
    const [body, catalogBody] = await Promise.all([
      response.json(), catalogResponse.json(),
    ]);
    if (activeBuildId !== buildId || integrationsBuildId !== buildId) return null;
    if (!response.ok || !body?.ok) {
      integrationStatus(integrationError(body?.code || "INTEGRATIONS_UNAVAILABLE"), true);
      return null;
    }
    integrationState = { revision: body.revision, items: body.items || [] };
    integrationCatalog = catalogBody?.ok ? catalogBody.items || [] : [];
    integrationEnvironmentState = { revision: body.environmentRevision ?? null, items: body.environments || [] };
    if (!integrationState.items.some((item) => item.integrationId === selectedIntegrationId)) {
      selectedIntegrationId = integrationState.items[0]?.integrationId || null;
    }
    if (!selectedIntegration()?.bindings.some((item) => item.bindingId === selectedIntegrationBindingId)) {
      selectedIntegrationBindingId = selectedIntegration()?.bindings[0]?.bindingId || null;
    }
    renderIntegrations();
    return integrationState;
  } catch {
    if (activeBuildId === buildId && integrationsBuildId === buildId) integrationStatus("Could not load integrations.", true);
    return null;
  }
}
async function mutateIntegration(action, input) {
  if (!activeBuildId || !integrationState) return false;
  const buildId = activeBuildId;
  try {
    const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/integrations/mutate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, expectedIntegrationRevision: integrationState.revision, input }),
    });
    const body = await response.json();
    if (activeBuildId !== buildId) return false;
    if (!response.ok || !body?.ok) {
      if (body?.code === "INTEGRATION_REVISION_STALE") await refreshIntegrations(buildId);
      integrationStatus(integrationError(body?.code), true);
      return false;
    }
    if (action === "create_integration") selectedIntegrationId = body.integrationId;
    if (action === "bind_environment") selectedIntegrationBindingId = body.bindingId;
    if (["delete_integration"].includes(action)) selectedIntegrationId = null;
    if (action === "unbind_environment") selectedIntegrationBindingId = null;
    const refreshed = await refreshIntegrations(buildId);
    integrationStatus(refreshed ? "Integration settings saved." : "Saved, but the latest state could not be loaded.", !refreshed);
    return Boolean(refreshed);
  } catch {
    integrationStatus("Could not save integration settings.", true);
    return false;
  }
}
async function verifyIntegrationBinding(bindingId) {
  const binding = selectedIntegration()?.bindings.find((item) => item.bindingId === bindingId);
  if (!activeBuildId || !integrationState || !binding || !Number.isSafeInteger(binding.environmentRevision)) return;
  const buildId = activeBuildId;
  integrationStatus("Verifying with the provider…");
  try {
    const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/integrations/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationId: selectedIntegrationId, bindingId,
        expectedIntegrationRevision: integrationState.revision,
        expectedEnvironmentRevision: binding.environmentRevision }),
    });
    const body = await response.json();
    if (activeBuildId !== buildId) return;
    if (!response.ok || !body?.ok) {
      if (["INTEGRATION_REVISION_STALE", "INTEGRATION_AUTHORITY_STALE", "INTEGRATION_ENVIRONMENT_STALE"].includes(body?.code)) {
        await refreshIntegrations(buildId);
      }
      integrationStatus(integrationError(body?.code), true);
      return;
    }
    await refreshIntegrations(buildId);
    integrationStatus(body.verification.state === "ready"
      ? "Connected. PATH verified the provider identity."
      : integrationError(body.verification.failureCode) || integrationVerificationLabel({ verification: body.verification }),
      body.verification.state !== "ready");
  } catch {
    integrationStatus("Could not complete verification.", true);
  }
}
function clearIntegrationsUi() {
  if (els.integrationsDialog.open) els.integrationsDialog.close();
  integrationsBuildId = null;
  integrationState = null;
  integrationCatalog = [];
  integrationEnvironmentState = null;
  selectedIntegrationId = null;
  selectedIntegrationBindingId = null;
  els.integrationsList.replaceChildren();
  els.integrationBindings.replaceChildren();
  integrationStatus("");
}
els.openIntegrationsBtn?.addEventListener("click", () => {
  if (!activeBuildId || activeBuildId === "pending") return;
  integrationsBuildId = activeBuildId;
  els.integrationsDialog.showModal();
  integrationStatus("Loading integrations…");
  void refreshIntegrations(activeBuildId);
});
els.closeIntegrationsBtn?.addEventListener("click", () => els.integrationsDialog.close());
els.integrationsDialog?.addEventListener("close", () => { integrationsBuildId = null; });
els.createIntegrationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const label = els.newIntegrationLabel.value.trim();
  if (await mutateIntegration("create_integration", { providerKey: els.integrationProvider.value, label })) els.newIntegrationLabel.value = "";
});
els.integrationsList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-integration-id]");
  if (!button) return;
  selectedIntegrationId = button.dataset.integrationId;
  selectedIntegrationBindingId = selectedIntegration()?.bindings[0]?.bindingId || null;
  integrationStatus("");
  renderIntegrations();
});
els.renameIntegrationBtn?.addEventListener("click", () => {
  els.renameIntegrationLabel.value = selectedIntegration()?.label || "";
  els.renameIntegrationForm.hidden = false;
  els.renameIntegrationLabel.focus();
});
els.cancelRenameIntegrationBtn?.addEventListener("click", () => { els.renameIntegrationForm.hidden = true; });
els.renameIntegrationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const integration = selectedIntegration();
  if (integration && await mutateIntegration("rename_integration", { integrationId: integration.integrationId, label: els.renameIntegrationLabel.value.trim() })) {
    els.renameIntegrationForm.hidden = true;
  }
});
els.deleteIntegrationBtn?.addEventListener("click", async () => {
  const integration = selectedIntegration();
  if (!integration || integration.bindings.length || !window.confirm(`Delete “${integration.label}”? This removes only the PATH integration record.`)) return;
  await mutateIntegration("delete_integration", { integrationId: integration.integrationId });
});
els.bindIntegrationEnvironmentBtn?.addEventListener("click", () => {
  const integration = selectedIntegration();
  const environmentId = els.integrationEnvironmentSelect.value;
  if (integration && environmentId) void mutateIntegration("bind_environment", { integrationId: integration.integrationId, environmentId });
});
els.integrationBindings?.addEventListener("click", (event) => {
  const verify = event.target.closest("[data-verify-binding]");
  if (verify) { void verifyIntegrationBinding(verify.dataset.verifyBinding); return; }
  const unbindRole = event.target.closest("[data-unbind-role]");
  if (unbindRole) {
    void mutateIntegration("unbind_credential", { integrationId: selectedIntegrationId,
      bindingId: unbindRole.dataset.bindingId, role: unbindRole.dataset.unbindRole });
    return;
  }
  const unbindEnvironment = event.target.closest("[data-unbind-environment]");
  if (unbindEnvironment) {
    void mutateIntegration("unbind_environment", {
      integrationId: selectedIntegrationId, bindingId: unbindEnvironment.dataset.unbindEnvironment,
    });
    return;
  }
  const card = event.target.closest("[data-select-binding]");
  if (card) {
    selectedIntegrationBindingId = card.dataset.selectBinding;
    renderIntegrations();
  }
});
els.bindIntegrationCredentialBtn?.addEventListener("click", () => {
  const binding = selectedIntegrationBinding();
  const integration = selectedIntegration();
  const provider = integrationCatalog.find((item) => item.providerKey === integration?.providerKey);
  const role = provider?.credentialRoles?.find((item) => item.required)?.role || provider?.credentialRoles?.[0]?.role;
  const variableName = els.integrationCredentialSelect.value;
  if (binding && integration && role && variableName) void mutateIntegration("bind_credential", {
    integrationId: integration.integrationId, bindingId: binding.bindingId, role, variableName,
  });
});
els.manageIntegrationEnvironmentsBtn?.addEventListener("click", () => {
  els.integrationsDialog.close();
  els.openEnvironmentsBtn?.click();
});

els.environmentsList?.addEventListener("click", (event) => {
  const item = event.target.closest("[data-environment-id]");
  if (!item) return;
  selectedEnvironmentId = item.dataset.environmentId;
  els.vercelLocatorForm.hidden = true;
  renderEnvironments();
});
els.createEnvironmentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = els.newEnvironmentName.value.trim();
  if (await submitEnvironmentAction("create_environment", { name })) els.newEnvironmentName.value = "";
});
els.renameEnvironmentBtn?.addEventListener("click", async () => {
  const selected = selectedEnvironment();
  if (!selected) return;
  const name = window.prompt("Rename environment", selected.name);
  if (name === null || name.trim() === selected.name) return;
  await submitEnvironmentAction("rename_environment", { environmentId: selected.environmentId, name: name.trim() });
});
els.deleteEnvironmentBtn?.addEventListener("click", async () => {
  const selected = selectedEnvironment();
  if (!selected) return;
  if (selected.variables.length) {
    environmentStatus(environmentMessages.ENVIRONMENT_NOT_EMPTY, true);
    return;
  }
  if (!window.confirm(`Delete the empty environment “${selected.name}”? This does not delete external secret values.`)) return;
  await submitEnvironmentAction("delete_environment", { environmentId: selected.environmentId });
});
els.configForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selected = selectedEnvironment();
  if (!selected) return;
  const variableName = els.configVariableName.value.trim();
  const previous = selected.variables.find((entry) => entry.variableName === variableName);
  const replace = previous?.kind === "secret";
  if (replace && !window.confirm(`Replace the PATH secret binding for ${variableName} with ordinary config? The external secret value will remain in its backend.`)) return;
  const input = { environmentId: selected.environmentId, variableName, value: els.configValue.value,
    ...(replace ? { replace: true } : {}) };
  if (await submitEnvironmentAction("set_config", input)) {
    els.configVariableName.value = "";
    els.configValue.value = "";
  }
});
els.secretBindingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selected = selectedEnvironment();
  if (!selected) return;
  const variableName = els.secretVariableName.value.trim();
  const previous = selected.variables.find((entry) => entry.variableName === variableName);
  const replace = Boolean(previous);
  if (replace && !window.confirm(`Replace the PATH binding for ${variableName}? Existing external values will remain where they are managed.`)) return;
  const input = { environmentId: selected.environmentId, variableName, backend: els.secretBackend.value,
    ...(replace ? { replace: true } : {}) };
  if (await submitEnvironmentAction("bind_secret", input)) els.secretVariableName.value = "";
});
els.environmentVariables?.addEventListener("click", async (event) => {
  const selected = selectedEnvironment();
  if (!selected) return;
  const node = event.target.closest("[data-config-edit], [data-config-remove], [data-secret-verify], [data-secret-unbind], [data-vercel-locator]");
  if (!node) return;
  const name = node.dataset.configEdit || node.dataset.configRemove || node.dataset.secretVerify ||
    node.dataset.secretUnbind || node.dataset.vercelLocator;
  const entry = selected.variables.find((item) => item.variableName === name);
  if (!entry) return;
  if (node.dataset.configEdit) {
    els.configVariableName.value = entry.variableName;
    els.configValue.value = entry.value;
    els.configValue.focus();
  } else if (node.dataset.configRemove) {
    await submitEnvironmentAction("remove_config", { environmentId: selected.environmentId, variableName: name });
  } else if (node.dataset.secretVerify) {
    await verifyLocalBinding(name);
  } else if (node.dataset.secretUnbind) {
    if (!window.confirm(`Remove the PATH binding for ${name}? This does not delete its value from .env.local or Vercel.`)) return;
    await submitEnvironmentAction("unbind_secret", { environmentId: selected.environmentId, variableName: name });
  } else if (node.dataset.vercelLocator) {
    locatorVariableName = name;
    els.vercelLocatorVariable.textContent = `Binding: ${name}`;
    for (const [key, control] of [["teamRef", els.vercelTeamRef], ["projectRef", els.vercelProjectRef],
      ["targetRef", els.vercelTargetRef], ["bindingRef", els.vercelBindingRef]]) {
      control.value = entry.descriptor[key] || "";
    }
    els.vercelLocatorForm.hidden = false;
  }
});
els.vercelLocatorForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selected = selectedEnvironment();
  if (!selected || !locatorVariableName) return;
  const input = { environmentId: selected.environmentId, variableName: locatorVariableName,
    teamRef: els.vercelTeamRef.value.trim() || null, projectRef: els.vercelProjectRef.value.trim() || null,
    targetRef: els.vercelTargetRef.value.trim() || null, bindingRef: els.vercelBindingRef.value.trim() || null };
  if (await submitEnvironmentAction("set_vercel_locator", input)) {
    els.vercelLocatorForm.hidden = true;
    locatorVariableName = null;
  }
});
els.cancelVercelLocatorBtn?.addEventListener("click", () => {
  locatorVariableName = null;
  els.vercelLocatorForm.hidden = true;
});
els.runtimeEnvironmentSelect?.addEventListener("change", () => {
  runtimeEnvironmentId = els.runtimeEnvironmentSelect.value || null;
});
async function startSelectedEnvironmentRuntime() {
  if (!activeBuildId || activeBuildId === "pending") return;
  const buildId = activeBuildId;
  if (runtimeEnvironmentId && !environmentState?.items?.some((item) => item.environmentId === runtimeEnvironmentId)) {
    environmentStatus("Review the latest environment list before starting preview.", true);
    return;
  }
  try {
    const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/runtime/restart`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(runtimeEnvironmentId ? { environmentId: runtimeEnvironmentId } : {}),
    });
    const body = await response.json();
    if (activeBuildId !== buildId) return;
    if (!response.ok || !body?.ok) {
      environmentStatus(environmentError(body?.code), true);
      return;
    }
    if (body.view?.buildId) acceptView(body.view);
    environmentStatus(runtimeEnvironmentId ? "Preview restarted with the selected environment." :
      "Preview restarted without a P9 environment.");
    renderEnvironments();
  } catch {
    environmentStatus("Could not start the preview.", true);
  }
}
els.startEnvironmentRuntimeBtn?.addEventListener("click", () => void startSelectedEnvironmentRuntime());

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
  if (els.environmentsDialog?.open) renderCurrentRuntimeEnvironment();
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
  void refreshProductOperationSummaries(view.buildId);
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
  clearEnvironmentsUi();
  clearIntegrationsUi();
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
  const result = await fetch(`/api/builds/${encodeURIComponent(activeBuildId)}/runtime/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(runtimeEnvironmentId ? { environmentId: runtimeEnvironmentId } : {}),
  });
  const outcome = await result.json().catch(() => null);
  if (!result.ok || !outcome?.ok) {
    els.previewError.hidden = false;
    els.previewError.textContent = environmentError(outcome?.code);
    return;
  }
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
  clearEnvironmentsUi();
  clearIntegrationsUi();
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

/* P13.4–P16 product operations. The browser sends variable identities, never credentials. */
function initializeProductOperations() {
  const names = {databases:'Database',auth:'Authentication',payments:'Payments',native:'Mobile'};
  const dialog = document.getElementById('productOperationsDialog');
  if (!dialog) return;
  const content = document.getElementById('productOperationsContent');
  const status = document.getElementById('productOperationsStatus');
  const title = document.getElementById('productOperationsTitle');
  let plane = null, buildId = null, state = null, selected = null, supporting = {}, busy = false;
  const safe = v => String(v ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label = v => String(v || 'Not checked').replace(/_/g,' ');
  const options = (items,idKey,labelKey,value) => items.map(i => `<option value="${safe(i[idKey])}" ${i[idKey] === value ? 'selected' : ''}>${safe(i[labelKey])}</option>`).join('');
  const select = (name,caption,items,value,empty = false) => `<label>${caption}<select name="${name}">${empty ? '<option value="">None</option>' : ''}${items.map(([v,l])=>`<option value="${safe(v)}" ${v === value ? 'selected' : ''}>${safe(l)}</option>`).join('')}</select></label>`;
  const field = (name,caption,value = '',required = true) => `<label>${caption}<input name="${name}" value="${safe(value)}" ${required ? 'required' : ''} maxlength="2048"></label>`;
  const check = (name,caption,on) => `<label class="operation-check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}>${caption}</label>`;
  const envSelect = (value,name='environmentId',caption='Environment') => select(name,caption,state.environments.map(e=>[e.environmentId,e.name]),value);
  const itemId = i => i?.[{databases:'databaseId',auth:'authId',payments:'paymentId',native:'nativeId'}[plane]];
  const urlSource = (kind='explicit',domainId=null,base='') => select('urlKind','Stable URL source',[['explicit','Explicit URL'],['p11_domain','Verified PATH Builder domain']],kind) + select('domainId','Verified domain',(state.domains || []).map(d=>[d.domainId,d.fqdn]),domainId,true) + field('baseUrl','Explicit URL',base,false) + (!(state.domains || []).length ? '<p class="hint">No verified PATH Builder domain is available. Configure and verify a domain outside this dialog or use an explicit URL.</p>' : '');
  const secretSelect = (name,caption,env,value) => select(name,caption,(state.environments.find(e=>e.environmentId===env)?.variables || []).map(v=>[v.variableName,`${v.variableName} · ${label(v.backend)} · ${label(v.presenceState)}`]),value,true);
  function detail(i) {
    if (!i) return '';
    let facts = '';
    if (plane === 'databases') facts = `<dl><dt>Provider</dt><dd>Supabase / PostgreSQL</dd><dt>Environment</dt><dd>${safe(i.environmentName)}</dd><dt>Source</dt><dd>${safe(label(i.source))}</dd><dt>Provider health</dt><dd>${safe(label(i.providerObservation.state))}</dd><dt>Connection</dt><dd>${i.readiness?.credentialActionRequired ? 'Needs credential · last observation: ' : ''}${safe(label(i.connectionObservation.state))} ${safe(i.connectionObservation.serverVersion)}</dd><dt>Migrations</dt><dd>${safe(label(i.migrationObservation.state))} · local ${safe(i.migrationObservation.localCount)} / remote ${safe(i.migrationObservation.remoteCount ?? 'not checked')}</dd></dl>`;
    else if (plane === 'auth') facts = `<p>Provider configuration: ${safe(label(i.observation.state))}</p><p>Client key: ${safe(i.config.publishableKeyVariableName)}</p><p>Project: ${safe(i.readiness?.projectUrl)}</p><p>${safe((i.readiness?.problems || []).map(label).join(' · '))}</p>`;
    else if (plane === 'payments') facts = `<dl><dt>Stripe verification identity</dt><dd>${safe(label(i.readiness?.verificationIdentity))}</dd><dt>Verified mode</dt><dd>${safe(label(i.readiness?.verifiedMode))}</dd><dt>Production runtime secret</dt><dd>${safe(label(i.readiness?.runtimeSecret))}</dd><dt>Webhook runtime secret</dt><dd>${safe(label(i.readiness?.webhookSecret))}</dd><dt>Expected webhook URL</dt><dd>${safe(i.readiness?.webhookUrl || 'Production callback/webhook base missing')}</dd></dl><p class="hint">Configure this endpoint and the listed events in Stripe. Local verification and runtime-secret presence do not prove that the keys are identical. Browser success redirects are not payment truth.</p><p>${safe(i.checkout.requiredWebhookEvents.join(', '))}</p>`;
    else facts = `<p>Source: ${safe(state.authoritativeSha || supporting.sourceSha || 'Not configured')}</p><p>Build environment: ${safe(label(i.readiness?.buildEnvironmentState))}</p><p>Web artifact: ${safe(label(i.readiness?.webArtifactState))}</p><p>${(i.readiness?.problems || []).map(p=>safe(label(p))).join(' · ')}</p><p>Auth callback: ${safe(i.readiness?.callbackUrl || 'Not configured')}</p><p>iOS: ${i.platforms.includes('ios') ? 'Local Xcode / signing acceptance required' : 'Not configured'}</p><p>Android: ${i.platforms.includes('android') ? 'Local Android SDK / signing acceptance required' : 'Not configured'}</p><p class="hint">Hosted Checkout stays web-based. Return links require product acceptance.</p>`;
    return `<section class="operation-summary">${facts}${state.pendingOperation ? `<p>Operation: ${safe(label(state.pendingOperation.state))} ${safe(state.pendingOperation.providerProjectName || '')}</p>` : ''}</section>`;
  }
  function form(i) {
    if (plane === 'databases') return field('label','Database name',i?.label || '') + (i ? '' : envSelect(state.environments[0]?.environmentId) + select('source','Source',[['existing','Existing Supabase project'],['path_provisioned','Create through PATH Builder']],'existing')) + (i ? field('organizationSlug','Organization',i.providerTarget.organizationSlug || '',false)+field('projectRef','Project reference',i.providerTarget.projectRef || '',false)+field('region','Region',i.providerTarget.region || '',false) : '');
    if (plane === 'auth') {
      const c = i?.config || {}; const database = supporting.databases?.items.find(d=>d.databaseId===i?.databaseId) || supporting.databases?.items[0];
      const env = database?.environmentId;
      return field('label','Authentication name',i?.label || '') + select('databaseId','Linked Supabase database',(supporting.databases?.items || []).map(d=>[d.databaseId,`${d.label} · ${d.environmentName}`]),database?.databaseId) + urlSource(c.siteUrlSource,c.domainId,c.siteUrl) + field('redirectUrls','Allowed redirects (comma separated)',c.redirectUrls?.join(', ') || '',false) + field('publishableKeyVariableName','Client publishable-key variable',c.publishableKeyVariableName || '') + check('signupEnabled','Allow signup',c.signupEnabled ?? true) + check('emailEnabled','Email sign-in',c.emailEnabled ?? true) + check('emailConfirmationRequired','Require email confirmation',c.emailConfirmationRequired ?? true) + ['google','github'].map(p=>{
        const s = c.socialProviders?.find(s=>s.provider===p);
        return `<details><summary>${p === 'google' ? 'Google' : 'GitHub'} sign-in</summary>${check(p+'Enabled','Enabled',s?.enabled)}${field(p+'ClientId','Client ID',s?.clientId || '',false)}${secretSelect(p+'SecretVariable','Client-secret variable',env,s?.credential?.variableName)}</details>`;
      }).join('');
    }
    if (plane === 'payments') {
      const c = i?.checkout || {};
      return field('label','Payment configuration name',i?.label || '') + select('integrationBinding','Stripe verification connection',(supporting.integrations?.items || []).filter(i=>i.providerKey==='stripe').flatMap(i=>i.bindings.map(b=>[`${i.integrationId}/${b.bindingId}`,`${i.label} · ${b.environmentName} · ${label(b.verification?.state)}`])),i ? `${i.integrationId}/${i.verificationBindingId}` : '') + envSelect(i?.runtimeEnvironmentId,'runtimeEnvironmentId','Production runtime environment') + select('expectedMode','Expected mode',[['test','Test'],['live','Live']],i?.expectedMode || 'test') + select('checkoutMode','Checkout mode',[['payment','One-time payment'],['subscription','Subscription']],c.mode || 'payment') + field('priceIds','Existing Stripe Price IDs (comma separated)',c.priceIds?.join(', ') || '') + field('successPath','Success path',c.successPath || '/billing/success') + field('cancelPath','Cancel path',c.cancelPath || '/pricing') + field('webhookPath','Webhook path',c.webhookPath || '/api/stripe/webhook') + urlSource(i?.urlSource.kind,i?.urlSource.domainId,i?.urlSource.explicitBaseUrl || '') + field('endpointId','Stripe endpoint ID',i?.webhook.endpointId || '',false) + select('authId','Authentication dependency',(supporting.auth?.items || []).map(a=>[a.authId,a.label]),i?.dependencies.authId,true) + select('databaseId','Database dependency',(supporting.databases?.items || []).map(d=>[d.databaseId,d.label]),i?.dependencies.databaseId,true) + '<p class="hint">Store STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the production environment. No key values belong in this dialog.</p>';
    }
    const p = i || {};
    return field('appName','App name',p.appName || '') + field('appId','App ID (reverse domain)',p.appId || '') + check('ios','iOS',p.platforms?.includes('ios') ?? true) + check('android','Android',p.platforms?.includes('android') ?? true) + envSelect(p.buildEnvironmentId,'buildEnvironmentId','Dedicated build environment') + '<p class="hint">Use config and verified local secret bindings only. An environment containing Vercel secrets cannot be used for packaging.</p>' + field('webDir','Static build output directory',p.packagePolicy?.webDir || 'dist') + select('authId','Authentication dependency',(supporting.auth?.items || []).map(a=>[a.authId,a.label]),p.authId,true) + field('authCallbackScheme','Auth callback scheme',p.authCallbackScheme || '',false) + '<p class="hint">Capacitor 8.5.3 · generated native projects remain artifacts. No store upload or signing is performed.</p>';
  }
  function render() {
    const i = state.items.find(i=>itemId(i)===selected);
    const actions = !i ? '' : plane === 'databases' ? `<button class="ghost" data-op="verify-provider">Verify provider</button><button class="ghost" data-op="verify-connection">Verify connection</button><button class="ghost" data-op="migrations-observe">Observe migrations</button>${i.source === 'path_provisioned' ? '<button class="ghost" data-op="regions">Discover regions</button><button class="ghost" data-op="provision-prepare">Prepare provider project</button><button class="ghost" data-op="provision-execute">Create provider project…</button><button class="ghost" data-op="provision-observe">Observe provisioning</button>' : ''}` : plane === 'auth' ? '<button class="ghost" data-op="observe">Observe provider</button><button class="ghost" data-op="apply-prepare">Prepare apply</button><button class="ghost" data-op="apply-execute">Execute apply…</button><button class="ghost" data-op="apply-observe">Reconcile / cancel preparation</button>' : plane === 'native' ? '<button class="ghost" data-op="prepare">Prepare package</button><button class="ghost" data-op="execute">Package…</button><button class="ghost" data-op="observe">Observe / recover</button>' : '';
    content.innerHTML = `<div class="operation-layout"><nav aria-label="Configurations"><button type="button" class="ghost" data-select="">Add ${names[plane].toLowerCase()}</button>${state.items.map(x=>`<button type="button" class="ghost" data-select="${safe(itemId(x))}" aria-current="${itemId(x)===selected}">${safe(x.label || x.appName)}</button>`).join('')}</nav><section>${detail(i)}<form id="productOperationForm" class="operation-form">${form(i)}<button class="cta compact" type="submit">${i ? 'Save changes' : 'Add configuration'}</button></form>${plane === 'databases' && i ? `<details><summary>Credentials</summary>${secretSelect('managementVariable','Management-token variable',i.environmentId,i.credentials.management.variableName)}<button class="ghost" data-bind="bind_management_credential">Bind management variable</button><button class="ghost" data-unbind="unbind_management_credential">Remove management binding</button>${secretSelect('databaseUrlVariable','Database URL variable',i.environmentId,i.credentials.databaseUrl.variableName)}<button class="ghost" data-bind="bind_database_url">Bind database URL variable</button><button class="ghost" data-unbind="unbind_database_url">Remove database URL binding</button>${secretSelect('provisionVariable','Provision-password variable',i.environmentId,null)}</details>` : ''}<div class="operation-actions">${actions}${i ? '<button data-delete="true" class="ghost">Remove configuration…</button>' : ''}</div>${plane === 'native' ? `<details><summary>Generated artifacts</summary>${(state.artifacts || []).filter(a=>a.nativeId===selected).map(a=>`<p>${safe(a.artifactId)} · ${safe(a.state)} · ${safe(a.sourceSha.slice(0,12))} · ${safe(a.bytes)} bytes</p>`).join('') || '<p>No packages yet.</p>'}<p class="hint">Artifacts are retained under native-snapshots / build ID / artifact ID / .path-native-package in the PATH runtime. Open the ios project in Xcode or the android directory in Android Studio after review. Signing and store submission remain local acceptance gates.</p></details>` : ''}</section></div>`;
    content.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{ selected=b.dataset.select || null; render(); });
    content.querySelector('form').onsubmit=save;
    content.querySelectorAll('[data-op]').forEach(b=>b.onclick=()=>operate(b.dataset.op));
    content.querySelectorAll('[data-bind]').forEach(b=>b.onclick=()=>bind(b.dataset.bind));
    content.querySelectorAll('[data-unbind]').forEach(b=>b.onclick=()=>mutation(b.dataset.unbind,{databaseId:selected}));
    content.querySelector('[data-delete]')?.addEventListener('click',remove);
    content.querySelector('[name="databaseId"]')?.addEventListener('change',e=>{
      if (plane !== 'auth') return;
      const database = supporting.databases?.items.find(d=>d.databaseId===e.target.value);
      for (const p of ['google','github']) {
        const selector = content.querySelector(`[name="${p}SecretVariable"]`);
        selector.innerHTML = '<option value="">None</option>' + options(state.environments.find(e=>e.environmentId===database?.environmentId)?.variables || [],'variableName','variableName',null);
      }
    });
  }
  async function refresh() {
    const current = buildId;
    const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/${plane}`); const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.code || 'Could not load configuration');
    if (current !== buildId || current !== activeBuildId) return;
    state = data;
    for (const p of ['databases','auth','integrations']) if (p !== plane) {
      const r=await fetch(`/api/builds/${encodeURIComponent(buildId)}/${p}`); const v=await r.json(); supporting[p]=v.ok?v:{items:[]};
    }
    supporting.sourceSha=state.authoritativeSha;
    render();
  }
  async function post(sub,body) {
    if (busy || buildId !== activeBuildId) return null;
    const requestBuildId=buildId,requestPlane=plane;
    busy=true; status.textContent='Working…'; content.inert=true;
    try {
      const response=await fetch(`/api/builds/${encodeURIComponent(buildId)}/${plane}/${sub}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const result=await response.json();
      if (requestBuildId !== activeBuildId || requestBuildId !== buildId || requestPlane !== plane) return null;
      if (!response.ok || !result.ok) throw new Error(label(result.code || 'Operation failed'));
      status.textContent=result.state ? label(result.state) : 'Saved'; return result;
    } catch(e) { status.textContent=e.message; return null; }
    finally { busy=false; content.inert=false; if (requestBuildId===activeBuildId && requestBuildId===buildId && requestPlane===plane) await refresh().catch(e=>{status.textContent=e.message;}); }
  }
  const data = () => Object.fromEntries(new FormData(content.querySelector('form')));
  const mutation = (action,input) => post('mutate',{action,[{databases:'expectedDatabaseRevision',auth:'expectedAuthRevision',payments:'expectedPaymentRevision',native:'expectedNativeRevision'}[plane]]:state.revision,input});
  async function save(e) {
    e.preventDefault(); const d=data(); const i=state.items.find(i=>itemId(i)===selected); let input;
    if (plane === 'databases') {
      if (!i) return mutation('create_database',{provider:'supabase',label:d.label,environmentId:d.environmentId,source:d.source});
      if (i.label !== d.label) {
        const renamed=await mutation('rename_database',{databaseId:selected,label:d.label});
        if (!renamed) return;
      }
      if (i.source === 'existing' && (i.providerTarget.organizationSlug !== (d.organizationSlug || null) || i.providerTarget.projectRef !== (d.projectRef || null) || i.providerTarget.region !== (d.region || null))) {
        await mutation('set_provider_target',{databaseId:selected,organizationSlug:d.organizationSlug || null,projectRef:d.projectRef || null,region:d.region || null});
      } else status.textContent='Saved';
      return;
    }
    if (plane === 'auth') {
      const database=supporting.databases?.items.find(x=>x.databaseId===d.databaseId);
      const domain=state.domains?.find(x=>x.domainId===d.domainId);
      input={label:d.label,databaseId:d.databaseId,environmentId:database?.environmentId,config:{siteUrlSource:d.urlKind,domainId:d.urlKind==='p11_domain'?d.domainId:null,siteUrl:d.urlKind==='p11_domain'?`https://${domain?.fqdn}`:d.baseUrl,redirectUrls:d.redirectUrls.split(',').map(s=>s.trim()).filter(Boolean),signupEnabled:!!d.signupEnabled,emailEnabled:!!d.emailEnabled,emailConfirmationRequired:!!d.emailConfirmationRequired,publishableKeyVariableName:d.publishableKeyVariableName,socialProviders:['google','github'].map(p=>({provider:p,enabled:!!d[p+'Enabled'],clientId:d[p+'ClientId'] || '',clientSecretVariableName:d[p+'SecretVariable'] || null}))}};
    } else if (plane === 'payments') {
      const [integrationId,verificationBindingId]=(d.integrationBinding || '').split('/');
      const events={payment:['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'],subscription:['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed']};
      input={label:d.label,integrationId,verificationBindingId,runtimeEnvironmentId:d.runtimeEnvironmentId,expectedMode:d.expectedMode,checkout:{mode:d.checkoutMode,priceIds:d.priceIds.split(',').map(s=>s.trim()).filter(Boolean),successPath:d.successPath,cancelPath:d.cancelPath,webhookPath:d.webhookPath,requiredWebhookEvents:events[d.checkoutMode]},urlSource:{kind:d.urlKind,domainId:d.urlKind==='p11_domain'?d.domainId:null,explicitBaseUrl:d.urlKind==='explicit'?d.baseUrl || null:null},dependencies:{authId:d.authId || null,databaseId:d.databaseId || null},webhook:{endpointId:d.endpointId || null,signingSecretVariableName:'STRIPE_WEBHOOK_SECRET'}};
    } else input={appId:d.appId,appName:d.appName,platforms:['ios','android'].filter(p=>d[p]),buildEnvironmentId:d.buildEnvironmentId,packagePolicy:{capacitorVersion:'8.5.3',webDir:d.webDir,iosPackageManager:'SPM'},authId:d.authId || null,authCallbackScheme:d.authCallbackScheme || null};
    if (i) input[{auth:'authId',payments:'paymentId',native:'nativeId'}[plane]]=selected;
    const action={auth:i?'update_auth':'create_auth',payments:i?'update_payment':'create_payment',native:i?'update_profile':'create_profile'}[plane];
    await mutation(action,input);
  }
  async function bind(action) {
    const selector=content.querySelector(`[name="${action === 'bind_management_credential'?'managementVariable':'databaseUrlVariable'}"]`);
    await mutation(action,{databaseId:selected,variableName:selector.value});
  }
  async function remove() {
    const message=plane==='databases'?'Remove this PATH Builder record? The external database is retained.':'Remove this configuration?';
    if(!confirm(message)) return;
    const input={ [{databases:'databaseId',auth:'authId',payments:'paymentId',native:'nativeId'}[plane]]:selected };
    if(plane==='databases') input.acknowledgeExternalResourceRetained=true;
    await mutation({databases:'delete_database',auth:'delete_auth',payments:'delete_payment',native:'delete_profile'}[plane],input);
    selected=null;
  }
  async function operate(op) {
    const d=data(); const revision=state.revision; const envRevision=state.environmentRevision;
    let body;
    if(plane==='databases') {
      body={databaseId:selected,expectedDatabaseRevision:revision,expectedEnvironmentRevision:envRevision};
      if(op==='regions') body.organizationSlug=d.organizationSlug;
      if(op==='provision-prepare') {
        if(!confirm('Prepare a Supabase project creation intent? Execution can create billable provider resources.')) return;
        Object.assign(body,{organizationSlug:d.organizationSlug,region:d.region,provisionPasswordVariableName:content.querySelector('[name="provisionVariable"]').value,acknowledgeProviderBilling:true});
      }
      if(op==='provision-execute'||op==='provision-observe') body={operationId:state.pendingOperation?.operationId,expectedDatabaseRevision:revision,expectedEnvironmentRevision:envRevision};
      if(op==='migrations-observe') body.expectedAuthoritativeSha=supporting.sourceSha;
    } else if(plane==='auth') body={authId:selected,expectedAuthRevision:revision,expectedDatabaseRevision:supporting.databases?.revision ?? 0,expectedEnvironmentRevision:envRevision};
    else body={nativeId:selected,expectedNativeRevision:revision,expectedEnvironmentRevision:envRevision};
    if(['apply-execute','provision-execute','execute'].includes(op) && !confirm(op==='provision-execute'?'Create this provider project now? This may incur charges.':op==='apply-execute'?'Apply the prepared authentication settings to Supabase now?':'Run dependency installation and build scripts from canonical product source, then package native projects?')) return;
    const result=await post(op,body);
    if(result?.regions) status.textContent='Available regions: '+result.regions.map(r=>r.code).join(', ');
  }
  document.querySelectorAll('[data-product-plane]').forEach(button=>button.addEventListener('click',async()=>{
    if(!activeBuildId || busy) return;
    plane=button.dataset.productPlane; buildId=activeBuildId; selected=null; supporting={}; title.textContent=names[plane]; status.textContent='Loading…'; content.textContent=''; dialog.showModal();
    try { await refresh(); status.textContent=''; } catch(e) { status.textContent=e.message; }
  }));
  document.getElementById('closeProductOperations').onclick=()=>dialog.close();
  document.getElementById('refreshProductOperations').onclick=()=>refresh().catch(e=>{status.textContent=e.message;});
}
initializeProductOperations();

let operationSummaryAt = 0;
let operationSummaryBuildId = null;
async function refreshProductOperationSummaries(buildId) {
  if (operationSummaryBuildId === buildId && Date.now() - operationSummaryAt < 10000) return;
  operationSummaryAt = Date.now(); operationSummaryBuildId = buildId;
  await Promise.all(['databases','auth','payments','native'].map(async plane => {
    try {
      const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/${plane}`);
      const data = await response.json();
      if (activeBuildId !== buildId || !response.ok || !data.ok) return;
      const items = data.items || [];
      let summary = 'Needs setup';
      if (plane === 'databases' && items.length) summary = items.some(i => i.readiness?.connectionReady === true) ? 'Connected' : 'Needs verification';
      if (plane === 'auth' && items.length) summary = items.every(i => i.readiness?.state === 'ready') ? 'Configured' : 'Needs attention';
      if (plane === 'payments' && items.length) summary = 'Stripe · ' + (items[0].readiness?.verifiedMode === 'unknown' ? 'Not verified' : items[0].readiness.verifiedMode === 'live' ? 'Live' : 'Test');
      if (plane === 'native' && items.length) summary = [...new Set(items.flatMap(i=>i.platforms))].map(p=>p === 'ios' ? 'iOS' : 'Android').join(' + ');
      const element = document.getElementById('operation-summary-' + plane);
      if (element) element.textContent = summary;
    } catch { /* Existing summary is observational only. */ }
  }));
}
