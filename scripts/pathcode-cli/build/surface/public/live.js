import { previewFrameSrc, previewTransition } from "./view-revision.js";

const params = new URLSearchParams(location.search);
const buildId = params.get("buildId");
const title = document.getElementById("liveTitle");
const frame = document.getElementById("liveFrame");
const empty = document.getElementById("liveEmpty");
const stage = document.getElementById("liveStage");
let heldSrc = "";

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
  const runtimeFailed = ["failed", "exited", "unhealthy", "unavailable"].includes(view.runtime?.status);
  const ready = !runtimeFailed && (view.preview?.status === "ready" || view.preview?.status === "stale");
  const nextSrc = ready && embed ? previewFrameSrc(embed, view.authoritativeSha) : "";
  const decision = previewTransition({
    heldSrc,
    nextReady: Boolean(ready && nextSrc),
    nextSrc,
    nextFailed: runtimeFailed,
    preparing: Boolean(view.previewPreparing) || view.status === "running",
  });
  const notice = document.getElementById("liveNotice");
  if (notice) {
    notice.hidden = !decision.notice;
    notice.textContent = decision.notice || "";
  }
  if (decision.action === "empty") {
    frame.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }
  if (decision.action === "swap" && decision.src !== heldSrc) frame.src = decision.src;
  heldSrc = decision.src;
  frame.hidden = false;
  if (empty) empty.hidden = true;
}

void refresh();
setInterval(() => void refresh(), 1500);
