/** PATH Build product surface client */

const els = {
  outcome: document.getElementById("outcome"),
  buildBtn: document.getElementById("buildBtn"),
  hint: document.getElementById("hint"),
  composer: document.getElementById("composer"),
  stage: document.getElementById("stage"),
  pulse: document.getElementById("pulse"),
  phaseKicker: document.getElementById("phaseKicker"),
  headline: document.getElementById("headline"),
  detail: document.getElementById("detail"),
  metaRow: document.getElementById("metaRow"),
  lists: document.getElementById("lists"),
  steerPanel: document.getElementById("steerPanel"),
  steerText: document.getElementById("steerText"),
  steerBtn: document.getElementById("steerBtn"),
  requireBtn: document.getElementById("requireBtn"),
  handoff: document.getElementById("handoff"),
  projectPath: document.getElementById("projectPath"),
  openFolderBtn: document.getElementById("openFolderBtn"),
  newBuildBtn: document.getElementById("newBuildBtn"),
  error: document.getElementById("error"),
};

/** @type {string | null} */
let activeBuildId = null;
/** @type {EventSource | null} */
let events = null;
/** @type {string | null} */
let projectRoot = null;

function showError(msg) {
  if (!msg) {
    els.error.hidden = true;
    els.error.textContent = "";
    return;
  }
  els.error.hidden = false;
  els.error.textContent = msg;
}

/**
 * @param {any} view
 */
function render(view) {
  if (!view || view.phase === "idle" || !view.buildId) {
    els.stage.hidden = true;
    els.composer.hidden = false;
    return;
  }

  els.composer.hidden = true;
  els.stage.hidden = false;
  activeBuildId = view.buildId;
  projectRoot = view.projectRoot || null;

  els.pulse.dataset.phase = view.phase || "running";
  els.phaseKicker.textContent = view.progressLabel || view.phase || "Working";
  els.headline.textContent = view.headline || "Building…";
  els.detail.textContent = view.detail || "";

  const chips = [];
  if (view.status) chips.push(view.status);
  if (view.originGitInit) chips.push("fresh origin");
  if (view.fakeMode) chips.push("demo fabric");
  if (view.preferredEngine) chips.push(view.preferredEngine);
  if (view.outcomeRevision) chips.push(`r${view.outcomeRevision}`);
  els.metaRow.innerHTML = chips
    .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
    .join("");

  const blocks = [];
  if (view.requirements?.length) {
    blocks.push(listBlock("Requirements", view.requirements.map((r) => `[${r.status}] ${r.statement}`)));
  }
  if (view.criteria?.length) {
    blocks.push(
      listBlock(
        "Outcome checks",
        view.criteria.map((c) => `[${c.status}] ${c.statement}`),
      ),
    );
  }
  if (view.children?.length) {
    blocks.push(
      listBlock(
        "Recent work",
        view.children.map(
          (c) =>
            `${c.kind} · ${c.state}${c.classification ? ` · ${c.classification}` : ""}`,
        ),
      ),
    );
  }
  els.lists.innerHTML = blocks.join("");

  els.steerPanel.hidden = !view.canSteer;
  if (view.handoff?.projectRoot) {
    els.handoff.hidden = false;
    els.projectPath.textContent = view.handoff.projectRoot;
  } else if (view.complete && view.projectRoot) {
    els.handoff.hidden = false;
    els.projectPath.textContent = view.projectRoot;
  } else if (view.projectRoot) {
    els.handoff.hidden = false;
    els.projectPath.textContent = view.projectRoot;
  } else {
    els.handoff.hidden = true;
  }
}

function listBlock(title, items) {
  return `<div class="list-card"><h3>${escapeHtml(title)}</h3><ul>${items
    .map((i) => `<li>${escapeHtml(i)}</li>`)
    .join("")}</ul></div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function watch(buildId) {
  if (events) {
    events.close();
    events = null;
  }
  events = new EventSource(`/api/builds/${encodeURIComponent(buildId)}/events`);
  events.onmessage = (ev) => {
    try {
      render(JSON.parse(ev.data));
    } catch {
      // ignore
    }
  };
  events.onerror = () => {
    // browser will retry; keep last render
  };
}

async function startBuild() {
  showError("");
  const outcome = els.outcome.value.trim();
  if (!outcome) {
    showError("Describe what you want to build.");
    els.outcome.focus();
    return;
  }
  els.buildBtn.disabled = true;
  els.buildBtn.textContent = "Starting…";
  try {
    const res = await fetch("/api/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.message || data.code || "Could not start build");
    }
    render(data.view);
    watch(data.buildId);
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  } finally {
    els.buildBtn.disabled = false;
    els.buildBtn.textContent = "Build";
  }
}

async function revise(kind) {
  if (!activeBuildId) return;
  const text = els.steerText.value.trim();
  if (!text) {
    showError(kind === "require" ? "Add a requirement." : "Describe the revision.");
    return;
  }
  showError("");
  const res = await fetch(
    `/api/builds/${encodeURIComponent(activeBuildId)}/${kind}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    },
  );
  const data = await res.json();
  if (!res.ok || !data.ok) {
    showError(data.message || data.code || "Could not update build");
    return;
  }
  els.steerText.value = "";
  if (data.view) render(data.view);
}

els.buildBtn.addEventListener("click", () => void startBuild());
els.outcome.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void startBuild();
  }
});
els.steerBtn.addEventListener("click", () => void revise("steer"));
els.requireBtn.addEventListener("click", () => void revise("require"));
els.newBuildBtn.addEventListener("click", () => {
  if (events) events.close();
  events = null;
  activeBuildId = null;
  projectRoot = null;
  els.outcome.value = "";
  els.stage.hidden = true;
  els.composer.hidden = false;
  els.outcome.focus();
});
els.openFolderBtn.addEventListener("click", async () => {
  if (!projectRoot) return;
  showError("");
  try {
    const res = await fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: projectRoot }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      await navigator.clipboard.writeText(projectRoot);
      showError(`Could not open Finder. Path copied: ${projectRoot}`);
    }
  } catch {
    try {
      await navigator.clipboard.writeText(projectRoot);
    } catch {
      // ignore
    }
    showError(`Path: ${projectRoot}`);
  }
});

// Resume latest active build if surface was refreshed mid-run.
fetch("/api/builds/latest")
  .then((r) => r.json())
  .then((view) => {
    if (view?.buildId && view.phase !== "idle") {
      render(view);
      watch(view.buildId);
    }
  })
  .catch(() => {});
