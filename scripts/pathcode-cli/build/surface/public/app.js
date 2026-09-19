/** PATH Build — visual builder client */

const els = {
  landing: document.getElementById("landing"),
  workspace: document.getElementById("workspace"),
  outcome: document.getElementById("outcome"),
  buildBtn: document.getElementById("buildBtn"),
  landingError: document.getElementById("landingError"),
  statusPill: document.getElementById("statusPill"),
  chatScroll: document.getElementById("chatScroll"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
  selectionChip: document.getElementById("selectionChip"),
  previewStage: document.getElementById("previewStage"),
  previewEmpty: document.getElementById("previewEmpty"),
  previewFrame: document.getElementById("previewFrame"),
  previewError: document.getElementById("previewError"),
  previewLabel: document.getElementById("previewLabel"),
  drawer: document.getElementById("drawer"),
  drawerBody: document.getElementById("drawerBody"),
  projectPath: document.getElementById("projectPath"),
  selectModeBtn: document.getElementById("selectModeBtn"),
  refreshPreviewBtn: document.getElementById("refreshPreviewBtn"),
  openExternalBtn: document.getElementById("openExternalBtn"),
  detailsBtn: document.getElementById("detailsBtn"),
  closeDrawerBtn: document.getElementById("closeDrawerBtn"),
  newBuildBtn: document.getElementById("newBuildBtn"),
  openFolderBtn: document.getElementById("openFolderBtn"),
  openCodeBtn: document.getElementById("openCodeBtn"),
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
/** @type {any} */
let lastView = null;

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
  const msgs = view.conversation || [];
  els.chatScroll.innerHTML = msgs
    .map((m) => {
      const role = m.role === "user" ? "user" : "assistant";
      return `<div class="bubble ${role}">${escapeHtml(m.text || "")}</div>`;
    })
    .join("");
  els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
}

function renderDrawer(view) {
  const criteria = (view.criteria || [])
    .map((c) => `<li>[${escapeHtml(c.status)}] ${escapeHtml(c.statement)}</li>`)
    .join("");
  const activity = (view.activity || view.children || [])
    .map(
      (c) =>
        `<li>${escapeHtml(c.kind)} · ${escapeHtml(c.dispatchState || "")}${
          c.classification ? ` · ${escapeHtml(c.classification)}` : ""
        }</li>`,
    )
    .join("");
  const engine = view.preferredEngine
    ? `<p>Preferred engine: <strong>${escapeHtml(view.preferredEngine)}</strong></p>`
    : "";
  const artifact = view.artifact
    ? `<p>Artifact: ${escapeHtml(view.artifact.kind)}${
        view.artifact.framework ? ` / ${escapeHtml(view.artifact.framework)}` : ""
      }</p>`
    : "";
  const runtime = view.runtime
    ? `<p>Runtime: ${escapeHtml(view.runtime.status || "")}${
        view.runtime.url ? ` · ${escapeHtml(view.runtime.url)}` : ""
      }</p>`
    : "";

  els.drawerBody.innerHTML = `
    ${engine}
    ${artifact}
    ${runtime}
    <h3>Outcome checks</h3>
    <ul>${criteria || "<li>None yet</li>"}</ul>
    <h3>Engineering activity</h3>
    <ul>${activity || "<li>None yet</li>"}</ul>
  `;
  if (view.projectRoot) {
    els.projectPath.textContent = view.projectRoot;
  }
}

function updatePreview(view) {
  const embed = view.preview?.embedPath || null;
  const direct = view.preview?.url || null;
  const ready = view.preview?.status === "ready" || view.preview?.status === "stale";

  if (view.runtime?.status === "failed" || view.runtime?.status === "unhealthy") {
    els.previewError.hidden = false;
    els.previewError.textContent =
      view.runtime.error || view.detail || "Preview runtime failed.";
  } else {
    els.previewError.hidden = true;
  }

  if (ready && embed) {
    const nextSrc = embed.endsWith("/") ? embed : `${embed}/`;
    if (previewEmbed !== nextSrc) {
      previewEmbed = nextSrc;
      previewDirectUrl = direct;
      els.previewEmpty.hidden = true;
      els.previewFrame.hidden = false;
      els.previewFrame.src = nextSrc;
    }
    els.previewLabel.textContent = view.artifact?.framework
      ? `Live · ${view.artifact.framework}`
      : "Live product";
  } else if (!els.previewFrame.src) {
    els.previewEmpty.hidden = false;
    els.previewFrame.hidden = true;
    els.previewLabel.textContent = "Product preview";
  }
}

/**
 * @param {any} view
 */
function render(view) {
  lastView = view;
  if (!view || view.phase === "idle" || !view.buildId) {
    setWorkspaceVisible(false);
    return;
  }

  setWorkspaceVisible(true);
  activeBuildId = view.buildId;
  projectRoot = view.projectRoot || null;

  const state = view.uiState || "building";
  els.statusPill.textContent = view.progressLabel || view.headline || state;
  els.statusPill.dataset.state = state;

  renderChat(view);
  renderDrawer(view);
  updatePreview(view);

  if (selectedElement) {
    els.selectionChip.hidden = false;
    els.selectionChip.textContent = `Selected: ${selectedElement.tag}${
      selectedElement.text ? ` “${String(selectedElement.text).slice(0, 40)}”` : ""
    }`;
  } else {
    els.selectionChip.hidden = true;
  }
}

function subscribe(buildId) {
  if (events) {
    events.close();
    events = null;
  }
  events = new EventSource(`/api/builds/${encodeURIComponent(buildId)}/events`);
  events.onmessage = (ev) => {
    try {
      const view = JSON.parse(ev.data);
      render(view);
    } catch {
      /* ignore */
    }
  };
  events.onerror = () => {
    /* browser will retry */
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
  try {
    const res = await fetch("/api/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, originKind: "build-created" }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      showLandingError(body.message || body.code || "Could not start build");
      return;
    }
    activeBuildId = body.buildId;
    projectRoot = body.projectRoot;
    render(body.view);
    subscribe(body.buildId);
  } catch (err) {
    showLandingError(err instanceof Error ? err.message : String(err));
  } finally {
    els.buildBtn.disabled = false;
    els.buildBtn.textContent = "Build";
  }
}

async function sendMessage(text) {
  if (!activeBuildId || !text.trim()) return;
  els.sendBtn.disabled = true;
  try {
    const res = await fetch(
      `/api/builds/${encodeURIComponent(activeBuildId)}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          element: selectedElement,
        }),
      },
    );
    const body = await res.json();
    if (body.view) render(body.view);
    selectedElement = null;
    els.selectionChip.hidden = true;
    els.chatInput.value = "";
    // Soft-refresh preview shortly after engineering may land
    setTimeout(() => {
      if (els.previewFrame.src) {
        const src = els.previewFrame.src;
        els.previewFrame.src = "about:blank";
        setTimeout(() => {
          els.previewFrame.src = src;
        }, 50);
      }
    }, 8_000);
  } finally {
    els.sendBtn.disabled = false;
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

els.newBuildBtn.addEventListener("click", () => {
  if (events) events.close();
  events = null;
  activeBuildId = null;
  projectRoot = null;
  previewEmbed = null;
  selectedElement = null;
  els.previewFrame.src = "";
  els.previewFrame.hidden = true;
  els.previewEmpty.hidden = false;
  setWorkspaceVisible(false);
  els.outcome.value = "";
  els.outcome.focus();
});

els.detailsBtn.addEventListener("click", () => {
  els.drawer.hidden = false;
});
els.closeDrawerBtn.addEventListener("click", () => {
  els.drawer.hidden = true;
});

els.openFolderBtn.addEventListener("click", async () => {
  if (!activeBuildId && !projectRoot) return;
  await fetch("/api/open-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buildId: activeBuildId, path: projectRoot }),
  });
});

els.openCodeBtn.addEventListener("click", async () => {
  if (!activeBuildId && !projectRoot) return;
  await fetch("/api/open-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buildId: activeBuildId, path: projectRoot }),
  });
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

els.openExternalBtn.addEventListener("click", () => {
  const url = previewDirectUrl || previewEmbed;
  if (url) window.open(url, "_blank", "noopener");
});

els.selectModeBtn.addEventListener("click", () => {
  selectMode = !selectMode;
  els.selectModeBtn.classList.toggle("active", selectMode);
  els.previewFrame.contentWindow?.postMessage(
    { source: "path-build", type: "path-build:select-mode", enabled: selectMode },
    "*",
  );
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
  if (data.source !== "path-build-preview") return;
  if (data.type === "path-build:element-selected" && data.element) {
    selectedElement = data.element;
    selectMode = false;
    els.selectModeBtn.classList.remove("active");
    els.selectionChip.hidden = false;
    els.selectionChip.textContent = `Selected: ${selectedElement.tag}${
      selectedElement.text ? ` “${String(selectedElement.text).slice(0, 40)}”` : ""
    }`;
    els.chatInput.focus();
  }
});

// Resume explicit buildId from URL, else latest active build
(async () => {
  try {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("buildId");
    const path = fromUrl
      ? `/api/builds/${encodeURIComponent(fromUrl)}`
      : "/api/builds/latest";
    const res = await fetch(path);
    const view = await res.json();
    if (view?.buildId && view.phase !== "idle") {
      render(view);
      subscribe(view.buildId);
    }
  } catch {
    /* fresh landing */
  }
})();
