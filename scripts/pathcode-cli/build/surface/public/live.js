import { previewFrameSrc } from "./view-revision.js";

const params = new URLSearchParams(location.search);
const buildId = params.get("buildId");
const title = document.getElementById("liveTitle");
const frame = document.getElementById("liveFrame");
const empty = document.getElementById("liveEmpty");
const stage = document.getElementById("liveStage");
let currentSrc = "";

document.querySelectorAll("[data-live-viewport]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-live-viewport]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    stage.dataset.viewport = button.getAttribute("data-live-viewport") || "desktop";
  });
});

document.getElementById("redockBtn")?.addEventListener("click", () => {
  const back = `/?buildId=${encodeURIComponent(buildId || "")}`;
  if (window.opener && !window.opener.closed) {
    window.opener.focus();
    window.close();
    return;
  }
  location.assign(back);
});

async function refresh() {
  if (!buildId) return;
  const res = await fetch(`/api/builds/${encodeURIComponent(buildId)}`);
  if (!res.ok) return;
  const view = await res.json();
  if (title) title.textContent = view.displayTitle || "Project";
  const embed = view.preview?.embedPath || null;
  const ready = view.preview?.status === "ready" || view.preview?.status === "stale";
  if (ready && embed) {
    const next = previewFrameSrc(embed, view.authoritativeSha);
    if (next !== currentSrc) {
      currentSrc = next;
      frame.src = next;
    }
    frame.hidden = false;
    if (empty) empty.hidden = true;
  }
}

void refresh();
setInterval(() => void refresh(), 1500);
