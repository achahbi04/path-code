/**
 * Continue ICE real-visual proof against an existing Build after artifact/runtime fix.
 * Usage:
 *   PATHCODE_BUILD_NO_OPEN=1 node scripts/pathcode-cli/build/real-visual-e2e-continue.mjs <buildId>
 */
import { mkdirSync, writeFileSync, existsSync, realpathSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolvePathPackageRoot, resolvePathRuntimeRoot } from "../paths.mjs";
import { startPathBuildSurface } from "./surface/server.mjs";
import { readBuildRecord } from "./index.mjs";
import { captureBrowserEvidence } from "./runtime/browser-evidence.mjs";
import { gitHeadSha } from "./adopt.mjs";

function canon(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

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
    console.error("REFUSE: fake fabric env is set");
    process.exitCode = 2;
    return;
  }
  const buildId = process.argv[2] || "818ccab1-f626-473c-96ca-0ef91931b138";
  const packageRoot = resolvePathPackageRoot();
  const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
  const evidenceDir = join(runtimeRoot, "metadata", "build-evidence", "real-visual-e2e");
  mkdirSync(evidenceDir, { recursive: true });

  const prior = readBuildRecord(runtimeRoot, buildId);
  if (!prior) {
    console.error("BUILD_NOT_FOUND", buildId);
    process.exitCode = 1;
    return;
  }
  const projectRoot = prior.projectBindings?.[0]?.projectRoot;
  const report = {
    continuedAt: new Date().toISOString(),
    buildId,
    projectRoot,
    priorAuthSha: prior.authoritativeSha,
    priorAdoptions: prior.adoptionHistory || [],
  };

  console.log("Continuing build", buildId, projectRoot);
  const surface = await startPathBuildSurface({
    packageRoot,
    runtimeRoot,
    openBrowser: process.env.PATHCODE_BUILD_NO_OPEN !== "1",
    fakeMode: false,
    autoLoop: true,
    port: 0,
  });
  report.surfaceUrl = surface.url;
  console.log("Surface", surface.url);

  // Recover + start runtime on authoritative tree
  await fetch(new URL(`/api/builds/${buildId}/recover`, surface.url), {
    method: "POST",
  }).catch(() => null);

  const previewReady = await waitFor(
    async () => {
      await fetch(new URL(`/api/builds/${buildId}/runtime/start`, surface.url), {
        method: "POST",
      });
      const view = await (await fetch(new URL(`/api/builds/${buildId}`, surface.url))).json();
      if (view.preview?.status === "ready" && view.preview?.url) {
        return { ok: true, view };
      }
      return { ok: false, view };
    },
    { timeoutMs: 120_000, label: "preview_ready" },
  );
  report.previewReady = {
    ok: previewReady.ok,
    url: previewReady.view?.preview?.url || null,
    embed: previewReady.view?.preview?.embedPath || null,
    authoritativeSha:
      readBuildRecord(runtimeRoot, buildId)?.authoritativeSha || gitHeadSha(projectRoot),
  };
  console.log("previewReady", report.previewReady);
  if (!previewReady.ok) {
    writeFileSync(join(evidenceDir, "continue-fail.json"), JSON.stringify(report, null, 2));
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
  const beforeMobile = await captureBrowserEvidence({
    url: report.previewReady.url,
    buildId,
    runtimeRoot,
    expectText: ["ICE"],
    viewport: { width: 390, height: 844 },
  });
  report.beforeEvidence = before;
  report.beforeMobile = {
    ok: beforeMobile.ok,
    contentHash: beforeMobile.contentHash,
    screenshotPath: beforeMobile.screenshotPath,
  };
  console.log("beforeEvidence", before.ok, before.contentHash, before.screenshotPath);

  // Conversational visual change
  const msg = await fetch(new URL(`/api/builds/${buildId}/message`, surface.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: CHANGE }),
  });
  const steered = await msg.json();
  report.steer = {
    ok: steered.ok,
    outcomeRevision: steered.build?.intent?.outcomeRevision,
  };
  console.log("steer", report.steer);

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
        ev.ok && before.contentHash && ev.contentHash && ev.contentHash !== before.contentHash;
      const newAdoption =
        (build?.adoptionHistory || []).length > (report.priorAdoptions?.length || 0);
      if (changed || (newAdoption && ev.ok)) {
        return { ok: true, evidence: ev, build, changed, newAdoption };
      }
      return {
        ok: false,
        evidence: ev,
        adoptions: build?.adoptionHistory?.length,
        status: build?.loop?.status,
        children: build?.children?.map((c) => `${c.kind}:${c.dispatchState}`),
      };
    },
    { timeoutMs: 1_800_000, label: "visible_change" },
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
    provider: c.provider || null,
  }));

  const open = await fetch(new URL("/api/open-folder", surface.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buildId }),
  });
  report.openFolder = await open.json();
  const openCode = await fetch(new URL("/api/open-code", surface.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buildId }),
  });
  report.openCode = await openCode.json();

  const finalBuild = readBuildRecord(runtimeRoot, buildId);
  report.finalStatus = finalBuild?.loop?.status;
  report.finalCriteria = finalBuild?.outcomeCriteria || [];
  report.productBrief = finalBuild?.productBrief || null;
  report.previewUrl = finalBuild?.previewUrl || report.previewReady.url;
  report.runtimeHealth = finalBuild?.runtimeHealth || null;
  report.bindsHome = canon(projectRoot) === canon(process.env.HOME || "");
  report.endedAt = new Date().toISOString();

  const pass =
    !report.bindsHome &&
    report.previewReady.ok &&
    report.beforeEvidence?.ok &&
    report.steer?.ok &&
    (report.visibleChange ||
      (report.adoptionHistory?.length || 0) > (report.priorAdoptions?.length || 0)) &&
    report.openFolder?.ok &&
    report.openCode?.ok &&
    canon(report.openFolder.path || projectRoot) === canon(projectRoot);

  report.verdict = pass ? "PASS_PARTIAL_OR_FULL" : "FAIL";
  report.complete = finalBuild?.loop?.status === "complete";
  report.operatorAcceptanceReady = Boolean(pass && report.complete && report.visibleChange);

  writeFileSync(join(evidenceDir, "continue-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    join(packageRoot, "docs/reports/g10-evidence/s5/s5-real-visual-e2e.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log("REPORT", join(evidenceDir, "continue-report.json"));
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
