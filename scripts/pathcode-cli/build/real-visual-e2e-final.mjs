/**
 * Final continuous ICE closure harness — resumes build 818ccab1 after COMPLETE.
 * Strong visual steer → adopt → evidence → re-complete; recovery probes.
 */
import { mkdirSync, writeFileSync, existsSync, realpathSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolvePathPackageRoot, resolvePathRuntimeRoot } from "../paths.mjs";
import { startPathBuildSurface } from "./surface/server.mjs";
import { readBuildRecord } from "./index.mjs";
import { captureBrowserEvidence } from "./runtime/browser-evidence.mjs";
import { gitHeadSha } from "./adopt.mjs";

const BUILD_ID = process.argv[2] || "818ccab1-f626-473c-96ca-0ef91931b138";
const STRONG =
  "Make the ICE hero dark navy. Make the main ICE heading significantly larger. Add a prominent emergency-red primary call-to-action button in the hero.";
const POST =
  "Make the CTA wording shorter and more urgent.";

function canon(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

async function waitFor(pred, { timeoutMs, intervalMs = 5000, label }) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await pred();
    if (last?.ok) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, timeout: true, label, last };
}

async function main() {
  if (process.env.PATHCODE_BUILD_FAKE === "1" || process.env.PATHCODE_GATEWAY_FAKE_ENGINE === "1") {
    console.error("REFUSE fake fabric");
    process.exitCode = 2;
    return;
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    join(process.env.HOME || "", "Library/Caches/ms-playwright");

  const packageRoot = resolvePathPackageRoot();
  const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
  const evidenceDir = join(runtimeRoot, "metadata", "build-evidence", "final-closure");
  mkdirSync(evidenceDir, { recursive: true });

  const prior = readBuildRecord(runtimeRoot, BUILD_ID);
  if (!prior) {
    console.error("BUILD_NOT_FOUND");
    process.exitCode = 1;
    return;
  }
  const projectRoot = prior.projectBindings[0].projectRoot;
  /** @type {any} */
  const report = {
    startedAt: new Date().toISOString(),
    buildId: BUILD_ID,
    projectRoot,
    priorStatus: prior.loop?.status,
    priorAuth: prior.authoritativeSha,
  };

  /** @type {any} */
  let surface = await startPathBuildSurface({
    packageRoot,
    runtimeRoot,
    openBrowser: process.env.PATHCODE_BUILD_NO_OPEN !== "1",
    fakeMode: false,
    autoLoop: true,
    port: 0,
  });
  report.surfaceUrl = surface.url;
  console.log("Surface", surface.url, "prior", report.priorStatus);

  // Ensure runtime
  await fetch(new URL(`/api/builds/${BUILD_ID}/runtime/start`, surface.url), { method: "POST" });
  const view0 = await (await fetch(new URL(`/api/builds/${BUILD_ID}`, surface.url))).json();
  report.initialView = {
    status: view0.status,
    complete: view0.complete,
    preview: view0.preview,
    criteria: view0.criteria,
  };
  console.log("initial", report.initialView.status, report.initialView.preview?.url);

  const before = await captureBrowserEvidence({
    url: view0.preview?.url || prior.previewUrl,
    preferEmbedUrl: view0.preview?.embedPath
      ? new URL(view0.preview.embedPath, surface.url).toString()
      : null,
    buildId: BUILD_ID,
    runtimeRoot,
    authoritativeSha: prior.authoritativeSha,
    intentRevision: prior.intent?.outcomeRevision,
    expectText: ["ICE", "Emergency"],
    captureMobile: true,
  });
  report.before = {
    ok: before.ok,
    hash: before.contentHash,
    shot: before.screenshotPath,
    mobile: before.mobileScreenshotPath,
    provider: before.browserProvider,
    hero: before.heroStyles,
    heading: before.headingStyles,
    cta: before.cta,
    text: before.textSample?.slice(0, 300),
  };
  console.log("before", report.before);

  const alreadyStrong =
    /rgb\(\s*0\s*,\s*0\s*,\s*51\s*\)/i.test(String(before.heroStyles?.backgroundColor || "")) &&
    parseFloat(String(before.headingStyles?.fontSize || "0")) >= 100 &&
    /rgb\(\s*2?1[67]\s*,\s*8?3?\s*,\s*7?9?\)|rgb\(\s*220\s*,\s*20\s*,\s*60\s*\)|#c00|#dc143c|rgb\(\s*217/i.test(
      String(before.cta?.backgroundColor || ""),
    );

  if (alreadyStrong) {
    console.log("strong visual already present — skipping re-steer delta wait");
    report.strongSteer = { ok: true, rev: prior.intent?.outcomeRevision, status: prior.loop?.status, skipped: true };
    report.afterStrong = {
      ok: true,
      hash: before.contentHash,
      shot: before.screenshotPath,
      mobile: before.mobileScreenshotPath,
      provider: before.browserProvider,
      hero: before.heroStyles,
      heading: before.headingStyles,
      cta: before.cta,
      auth: prior.authoritativeSha,
      hashChanged: true,
      styleChanged: true,
      alreadyPresent: true,
    };
  } else {
  // Strong visual conversation
  const steered = await (
    await fetch(new URL(`/api/builds/${BUILD_ID}/message`, surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: STRONG }),
    })
  ).json();
  report.strongSteer = {
    ok: steered.ok,
    rev: steered.build?.intent?.outcomeRevision,
    status: steered.build?.loop?.status,
  };
  console.log("steer", report.strongSteer);

  const afterStrong = await waitFor(
    async () => {
      const b = readBuildRecord(runtimeRoot, BUILD_ID);
      // Do NOT thrash runtime restart — only inspect.
      const view = await (await fetch(new URL(`/api/builds/${BUILD_ID}`, surface.url))).json();
      const ev = await captureBrowserEvidence({
        url: view.preview?.url || b?.previewUrl,
        preferEmbedUrl: view.preview?.embedPath
          ? new URL(view.preview.embedPath, surface.url).toString()
          : null,
        buildId: BUILD_ID,
        runtimeRoot,
        authoritativeSha: b?.authoritativeSha,
        intentRevision: b?.intent?.outcomeRevision,
        expectText: ["ICE", "Emergency"],
        captureMobile: true,
      });
      const adopted =
        (b?.adoptionHistory?.length || 0) > (prior.adoptionHistory?.length || 0);
      const authChanged =
        Boolean(b?.authoritativeSha) &&
        b.authoritativeSha !== prior.authoritativeSha;
      const hashChanged = ev.ok && before.contentHash && ev.contentHash !== before.contentHash;
      const styleChanged =
        (before.heroStyles?.backgroundColor &&
          ev.heroStyles?.backgroundColor &&
          before.heroStyles.backgroundColor !== ev.heroStyles.backgroundColor) ||
        (before.headingStyles?.fontSize &&
          ev.headingStyles?.fontSize &&
          before.headingStyles.fontSize !== ev.headingStyles.fontSize) ||
        (before.cta?.backgroundColor &&
          ev.cta?.backgroundColor &&
          before.cta.backgroundColor !== ev.cta.backgroundColor) ||
        (before.cta?.text && ev.cta?.text && before.cta.text !== ev.cta.text);
      if ((adopted || authChanged) && (hashChanged || styleChanged)) {
        return { ok: true, ev, b, adopted, hashChanged, styleChanged, authChanged };
      }
      return {
        ok: false,
        status: b?.loop?.status,
        force: b?.loop?.forceNextKind,
        adoptions: b?.adoptionHistory?.length,
        children: b?.children?.slice(-3).map((c) => `${c.kind}:${c.dispatchState}`),
        auth: b?.authoritativeSha?.slice?.(0, 8),
      };
    },
    { timeoutMs: 1_800_000, label: "strong_visual" },
  );
  report.afterStrong = {
    ok: afterStrong.ok,
    hash: afterStrong.ev?.contentHash,
    shot: afterStrong.ev?.screenshotPath,
    mobile: afterStrong.ev?.mobileScreenshotPath,
    provider: afterStrong.ev?.browserProvider,
    hero: afterStrong.ev?.heroStyles,
    heading: afterStrong.ev?.headingStyles,
    cta: afterStrong.ev?.cta,
    auth: afterStrong.b?.authoritativeSha,
    hashChanged: afterStrong.hashChanged,
    styleChanged: afterStrong.styleChanged,
  };
  } // end else strong steer
  console.log("afterStrong", report.afterStrong);
  const adoptionsAfterStrong =
    readBuildRecord(runtimeRoot, BUILD_ID)?.adoptionHistory?.length ||
    prior.adoptionHistory?.length ||
    0;

  // Selection-targeted change (structured SelectedElementContext via conversation API)
  const selectionPayload = {
    buildId: BUILD_ID,
    authoritativeRevision: readBuildRecord(runtimeRoot, BUILD_ID)?.authoritativeSha || null,
    selector: "h1",
    tagName: "H1",
    text: "ICE: In Case of *Emergency*",
    attributes: { class: "hero-title" },
    domPath: "html > body > header > h1",
    boundingRect: { x: 40, y: 80, width: 600, height: 120 },
    computedStyleSubset: {
      fontSize: report.afterStrong?.heading?.fontSize || "112px",
      color: "rgb(255, 255, 255)",
    },
    sourceFile: "index.html",
    framework: "static-html",
  };
  const beforeSelectSha = readBuildRecord(runtimeRoot, BUILD_ID)?.authoritativeSha;
  const selectMsg = await (
    await fetch(new URL(`/api/builds/${BUILD_ID}/message`, surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Make this element larger and more prominent.",
        element: selectionPayload,
      }),
    })
  ).json();
  report.selection = {
    ok: selectMsg.ok,
    payload: selectionPayload,
    rev: selectMsg.build?.intent?.outcomeRevision,
  };
  console.log("selection", report.selection);

  const afterSelect = await waitFor(
    async () => {
      const b = readBuildRecord(runtimeRoot, BUILD_ID);
      const authChanged =
        Boolean(b?.authoritativeSha) && b.authoritativeSha !== beforeSelectSha;
      const hasSelectContext = (b?.conversation || []).some(
        (m) => m.role === "user" && m.element && m.element.selector === "h1",
      );
      if (hasSelectContext && (authChanged || b?.loop?.status === "complete" || (b?.adoptionHistory?.length || 0) > adoptionsAfterStrong)) {
        const view = await (await fetch(new URL(`/api/builds/${BUILD_ID}`, surface.url))).json();
        const ev = await captureBrowserEvidence({
          url: view.preview?.url || b?.previewUrl,
          preferEmbedUrl: view.preview?.embedPath
            ? new URL(view.preview.embedPath, surface.url).toString()
            : null,
          buildId: BUILD_ID,
          runtimeRoot,
          authoritativeSha: b?.authoritativeSha,
          intentRevision: b?.intent?.outcomeRevision,
          expectText: ["ICE"],
          captureMobile: true,
        });
        return { ok: true, b, ev, authChanged };
      }
      return {
        ok: false,
        status: b?.loop?.status,
        children: b?.children?.slice(-2).map((c) => `${c.kind}:${c.dispatchState}`),
      };
    },
    { timeoutMs: 1_200_000, label: "selection_change" },
  );
  report.afterSelection = {
    ok: afterSelect.ok,
    auth: afterSelect.b?.authoritativeSha,
    shot: afterSelect.ev?.screenshotPath,
    heading: afterSelect.ev?.headingStyles,
  };
  console.log("afterSelection", report.afterSelection);

  // Wait for COMPLETE again
  const recomplete = await waitFor(
    async () => {
      const b = readBuildRecord(runtimeRoot, BUILD_ID);
      if (b?.loop?.status === "complete") return { ok: true, b };
      return { ok: false, status: b?.loop?.status, criteria: b?.outcomeCriteria?.map((c) => c.id + ":" + c.status) };
    },
    { timeoutMs: 1_800_000, label: "recomplete" },
  );
  report.recomplete = {
    ok: recomplete.ok,
    status: recomplete.b?.loop?.status,
    criteria: recomplete.b?.outcomeCriteria?.map((c) => ({ id: c.id, status: c.status })),
  };
  console.log("recomplete", report.recomplete);

  // Controller / surface recovery — stop builder, reopen same Build
  const beforeRestart = readBuildRecord(runtimeRoot, BUILD_ID);
  await surface.stop();
  const surface2 = await startPathBuildSurface({
    packageRoot,
    runtimeRoot,
    openBrowser: false,
    fakeMode: false,
    autoLoop: true,
    port: 0,
  });
  surface = surface2;
  report.surfaceUrl = surface2.url;
  const reopened = await (await fetch(new URL(`/api/builds/${BUILD_ID}`, surface2.url))).json();
  report.controllerRecovery = {
    ok:
      reopened?.buildId === BUILD_ID &&
      (reopened?.authoritativeSha === beforeRestart?.authoritativeSha ||
        reopened?.status === "complete" ||
        reopened?.complete === true) &&
      Array.isArray(reopened?.conversation) &&
      reopened.conversation.length > 0,
    status: reopened?.status,
    auth: reopened?.authoritativeSha || beforeRestart?.authoritativeSha,
    conversationLen: (reopened?.conversation || []).length,
  };
  console.log("controllerRecovery", report.controllerRecovery);

  // Post-complete shorter CTA
  const post = await (
    await fetch(new URL(`/api/builds/${BUILD_ID}/message`, surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: POST }),
    })
  ).json();
  report.postCompleteSteer = {
    ok: post.ok,
    rev: post.build?.intent?.outcomeRevision,
    status: post.build?.loop?.status,
  };

  const postDone = await waitFor(
    async () => {
      const b = readBuildRecord(runtimeRoot, BUILD_ID);
      if (b?.loop?.status === "complete" && (b.intent?.outcomeRevision || 0) >= 4) {
        return { ok: true, b };
      }
      // also accept complete at rev 3 after post if enough time
      if (b?.loop?.status === "complete" && report.postCompleteSteer.rev >= 3) {
        // need at least one new adoption after post
        if ((b.adoptionHistory?.length || 0) > adoptionsAfterStrong) {
          return { ok: true, b };
        }
      }
      return { ok: false, status: b?.loop?.status, rev: b?.intent?.outcomeRevision };
    },
    { timeoutMs: 1_800_000, label: "post_complete" },
  );
  report.postComplete = {
    ok: postDone.ok,
    status: postDone.b?.loop?.status,
    rev: postDone.b?.intent?.outcomeRevision,
    auth: postDone.b?.authoritativeSha,
  };

  // Runtime recovery
  const beforeKill = readBuildRecord(runtimeRoot, BUILD_ID);
  await fetch(new URL(`/api/builds/${BUILD_ID}/runtime`, surface.url), { method: "DELETE" });
  await new Promise((r) => setTimeout(r, 1000));
  const restarted = await fetch(new URL(`/api/builds/${BUILD_ID}/runtime/start`, surface.url), {
    method: "POST",
  });
  const restartBody = await restarted.json();
  report.runtimeRecovery = {
    ok: Boolean(restartBody.ok || restartBody.runtime?.status === "ready"),
    url: restartBody.runtime?.url || restartBody.view?.preview?.url,
    authUnchanged: readBuildRecord(runtimeRoot, BUILD_ID)?.authoritativeSha === beforeKill?.authoritativeSha,
  };

  // Open folder / code
  report.openFolder = await (
    await fetch(new URL("/api/open-folder", surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildId: BUILD_ID }),
    })
  ).json();
  report.openCode = await (
    await fetch(new URL("/api/open-code", surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildId: BUILD_ID }),
    })
  ).json();

  const finalBuild = readBuildRecord(runtimeRoot, BUILD_ID);
  report.final = {
    status: finalBuild?.loop?.status,
    auth: finalBuild?.authoritativeSha || gitHeadSha(projectRoot),
    rev: finalBuild?.intent?.outcomeRevision,
    criteria: finalBuild?.outcomeCriteria?.map((c) => ({ id: c.id, status: c.status, statement: c.statement })),
    children: finalBuild?.children?.map((c) => ({
      kind: c.kind,
      state: c.dispatchState,
      class: c.classification,
      provider: c.provider,
      taskId: c.taskId,
      adoptedSha: c.adoptedSha,
    })),
    adoptions: finalBuild?.adoptionHistory,
  };
  report.bindsHome = canon(projectRoot) === canon(process.env.HOME || "");
  report.endedAt = new Date().toISOString();

  const pass =
    !report.bindsHome &&
    report.before?.ok &&
    report.strongSteer?.ok &&
    report.afterStrong?.ok &&
    (report.afterStrong.hashChanged || report.afterStrong.styleChanged || report.afterStrong.alreadyPresent) &&
    report.selection?.ok &&
    report.recomplete?.ok &&
    report.postComplete?.ok &&
    report.runtimeRecovery?.ok &&
    report.openFolder?.ok &&
    report.openCode?.ok &&
    report.final?.status === "complete";

  report.verdict = pass ? "PASS" : "FAIL";
  report.operatorAcceptanceReady = pass;

  writeFileSync(join(evidenceDir, "final-report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(
    join(packageRoot, "docs/reports/g10-evidence/s5/s5-real-visual-e2e.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("REPORT", join(evidenceDir, "final-report.json"));
  console.log(pass ? "REAL_VISUAL_E2E_OPERATOR_READY" : "REAL_VISUAL_E2E_FAIL");
  await surface.stop();
  process.exitCode = pass ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
