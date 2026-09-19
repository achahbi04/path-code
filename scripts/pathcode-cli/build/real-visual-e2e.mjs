/**
 * PATH Build — real visual E2E harness (no fake fabric / no fake Gateway engine).
 *
 * Usage:
 *   PATHCODE_PREFERRED_ENGINE=cursor node scripts/pathcode-cli/build/real-visual-e2e.mjs
 *
 * Env:
 *   PATHCODE_BUILD_E2E_TIMEOUT_MS  (default 2400000 = 40m)
 *   PATHCODE_BUILD_E2E_MAX_STEPS   (default 24)
 *   PATHCODE_BUILD_NO_OPEN=1
 */
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { resolvePathPackageRoot, resolvePathRuntimeRoot } from "../paths.mjs";
import { startPathBuildSurface } from "./surface/server.mjs";
import {
  readBuildRecord,
  listBuildRecords,
} from "./index.mjs";
import { captureBrowserEvidence } from "./runtime/browser-evidence.mjs";
import { gitHeadSha } from "./adopt.mjs";

function canon(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

const OUTCOME =
  "Build a professional website for ICE — In Case of Emergency. It should clearly explain what the product is, why it matters, and present the app visually and professionally.";

const CHANGE =
  "Make the hero visually stronger and darker, and make the emergency value proposition more prominent.";

async function waitFor(pred, { timeoutMs, intervalMs = 4000, label }) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await pred();
    if (last && last.ok) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, timeout: true, label, last };
}

async function main() {
  if (
    process.env.PATHCODE_BUILD_FAKE === "1" ||
    process.env.PATHCODE_GATEWAY_FAKE_ENGINE === "1"
  ) {
    console.error("REFUSE: fake fabric env is set. Unset PATHCODE_BUILD_FAKE / PATHCODE_GATEWAY_FAKE_ENGINE.");
    process.exitCode = 2;
    return;
  }

  const packageRoot = resolvePathPackageRoot();
  const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
  const evidenceDir = join(
    runtimeRoot,
    "metadata",
    "build-evidence",
    "real-visual-e2e",
  );
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(join(homedir(), "PATH Builds"), { recursive: true });
  const targetDir = join(
    homedir(),
    "PATH Builds",
    `ice-real-visual-${Date.now().toString(36)}`,
  );

  const timeoutMs = Number(process.env.PATHCODE_BUILD_E2E_TIMEOUT_MS || 2_400_000);
  const report = {
    startedAt: new Date().toISOString(),
    outcome: OUTCOME,
    change: CHANGE,
    targetDir,
    runtimeRoot,
    fake: false,
  };

  console.log("Starting real PATH Build surface…");
  const surface = await startPathBuildSurface({
    packageRoot,
    runtimeRoot,
    openBrowser: process.env.PATHCODE_BUILD_NO_OPEN !== "1",
    fakeMode: false,
    autoLoop: true,
    port: 0,
    preferredEngine: process.env.PATHCODE_PREFERRED_ENGINE || null,
  });
  report.surfaceUrl = surface.url;
  console.log("Surface", surface.url);

  const started = await fetch(new URL("/api/builds", surface.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      outcome: OUTCOME,
      targetDir,
      originKind: "build-created",
    }),
  });
  const body = await started.json();
  if (!started.ok || !body.ok) {
    console.error("START_FAILED", body);
    writeFileSync(join(evidenceDir, "fail-start.json"), JSON.stringify(body, null, 2));
    await surface.stop();
    process.exitCode = 1;
    return;
  }

  const buildId = body.buildId;
  const projectRoot = body.projectRoot;
  report.buildId = buildId;
  report.projectRoot = projectRoot;
  report.bindsHome = canon(projectRoot) === canon(homedir());
  report.hasGit = existsSync(join(projectRoot, ".git"));
  report.productBrief = body.view?.productBrief || null;
  report.criteriaInitial = body.view?.criteria || [];
  console.log("buildId", buildId);
  console.log("projectRoot", projectRoot);
  console.log("bindsHome", report.bindsHome);

  if (report.bindsHome) {
    console.error("BINDING_FAILURE: projectRoot is $HOME");
    await surface.stop();
    process.exitCode = 1;
    return;
  }

  // Wait until preview is ready (site engineered + runtime started)
  const previewReady = await waitFor(
    async () => {
      const view = await (await fetch(new URL(`/api/builds/${buildId}`, surface.url))).json();
      const build = readBuildRecord(runtimeRoot, buildId);
      const hasWeb =
        existsSync(join(projectRoot, "index.html")) ||
        existsSync(join(projectRoot, "package.json"));
      if (view.preview?.status === "ready" && view.preview?.url) {
        return { ok: true, view, build };
      }
      // Kick runtime if tree exists
      if (hasWeb) {
        await fetch(new URL(`/api/builds/${buildId}/runtime/start`, surface.url), {
          method: "POST",
        });
      }
      return { ok: false, view, status: build?.loop?.status };
    },
    { timeoutMs: Math.min(timeoutMs, 1_800_000), label: "preview_ready" },
  );

  report.previewReady = {
    ok: previewReady.ok,
    url: previewReady.view?.preview?.url || null,
    embed: previewReady.view?.preview?.embedPath || null,
    authoritativeSha: previewReady.build?.authoritativeSha || gitHeadSha(projectRoot),
  };
  console.log("previewReady", report.previewReady);

  if (!previewReady.ok) {
    report.failure = "preview_not_ready";
    writeFileSync(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));
    await surface.stop();
    process.exitCode = 1;
    return;
  }

  const before = await captureBrowserEvidence({
    url: report.previewReady.url,
    buildId,
    runtimeRoot,
    expectText: ["ICE", "Emergency"],
    viewport: { width: 1280, height: 800 },
  });
  report.beforeEvidence = before;
  console.log("beforeEvidence", before.ok, before.contentHash, before.screenshotPath);

  // Conversational visual change through the real builder API
  const msg = await fetch(new URL(`/api/builds/${buildId}/message`, surface.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: CHANGE }),
  });
  const steered = await msg.json();
  report.steer = {
    ok: steered.ok,
    outcomeRevision: steered.build?.intent?.outcomeRevision,
    classified: steered.classified || null,
  };
  console.log("steer", report.steer);

  // Wait for adoption / content change
  const afterChange = await waitFor(
    async () => {
      const build = readBuildRecord(runtimeRoot, buildId);
      await fetch(new URL(`/api/builds/${buildId}/runtime/restart`, surface.url), {
        method: "POST",
      }).catch(() => null);
      const ev = await captureBrowserEvidence({
        url: report.previewReady.url,
        buildId,
        runtimeRoot,
        expectText: ["ICE", "Emergency"],
      });
      const changed =
        ev.ok &&
        before.contentHash &&
        ev.contentHash &&
        ev.contentHash !== before.contentHash;
      const adopted =
        Array.isArray(build?.adoptionHistory) && build.adoptionHistory.length > 0;
      if (changed || (adopted && ev.ok)) {
        return { ok: true, evidence: ev, build, changed, adopted };
      }
      return { ok: false, evidence: ev, adopted, status: build?.loop?.status };
    },
    { timeoutMs: Math.min(timeoutMs, 1_800_000), label: "visible_change" },
  );

  report.afterEvidence = afterChange.evidence || null;
  report.visibleChange = Boolean(afterChange.changed);
  report.adoptionHistory = afterChange.build?.adoptionHistory || [];
  report.authoritativeSha = afterChange.build?.authoritativeSha || null;
  report.children = (afterChange.build?.children || []).map((c) => ({
    kind: c.kind,
    taskId: c.taskId,
    classification: c.classification,
    dispatchState: c.dispatchState,
    adoptedSha: c.adoptedSha || null,
    sourceSha: c.sourceSha || null,
  }));
  console.log("visibleChange", report.visibleChange, "adoptions", report.adoptionHistory.length);

  // Open folder proof
  const open = await fetch(new URL("/api/open-folder", surface.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buildId }),
  });
  report.openFolder = await open.json();

  // Open in PATH Code proof (spawn only — do not wait)
  const openCode = await fetch(new URL("/api/open-code", surface.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buildId }),
  });
  report.openCode = await openCode.json();

  // Final criteria / completion snapshot (may still be running)
  const finalBuild = readBuildRecord(runtimeRoot, buildId);
  report.finalStatus = finalBuild?.loop?.status;
  report.finalCriteria = finalBuild?.outcomeCriteria || [];
  report.previewUrl = finalBuild?.previewUrl || report.previewReady.url;
  report.runtimeHealth = finalBuild?.runtimeHealth || null;
  report.endedAt = new Date().toISOString();

  const pass =
    !report.bindsHome &&
    report.hasGit &&
    report.previewReady.ok &&
    report.beforeEvidence?.ok &&
    report.steer?.ok &&
    (report.visibleChange || report.adoptionHistory.length > 0) &&
    report.openFolder?.ok &&
    report.openCode?.ok &&
    canon(report.openFolder.path || projectRoot) === canon(projectRoot);

  report.verdict = pass ? "PASS_PARTIAL_OR_FULL" : "FAIL";
  // Full operator acceptance also needs COMPLETE + challenge — record honestly.
  report.complete = finalBuild?.loop?.status === "complete";
  report.operatorAcceptanceReady = Boolean(
    pass && report.complete && report.visibleChange,
  );

  writeFileSync(join(evidenceDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    join(packageRoot, "docs/reports/g10-evidence/s5/s5-real-visual-e2e.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log("REPORT", join(evidenceDir, "report.json"));
  console.log(
    report.operatorAcceptanceReady
      ? "REAL_VISUAL_E2E_OPERATOR_READY"
      : pass
        ? "REAL_VISUAL_E2E_PARTIAL"
        : "REAL_VISUAL_E2E_FAIL",
  );

  await surface.stop();
  process.exitCode = report.operatorAcceptanceReady || pass ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
