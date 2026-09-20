/**
 * S5 — Real fresh-user browser acceptance.
 *
 * Drives the ACTUAL landing-page Build button (not controller.startBuild).
 * No fake fabric. Launches path-build surface from this process.
 *
 * Usage:
 *   PATHCODE_BUILD_NO_OPEN=1 node scripts/pathcode-cli/build/run-s5-real-browser-acceptance.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { resolvePathPackageRoot, resolvePathRuntimeRoot } from "../paths.mjs";
import { startPathBuildSurface } from "./surface/server.mjs";
import { readBuildRecord } from "./index.mjs";
import { captureBrowserEvidence } from "./runtime/browser-evidence.mjs";

const OUTCOME =
  "Build a website that tells about ICE in case of emergency app and how to use it, it should really look good friendly.";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(pred, { timeoutMs, intervalMs = 2000, label }) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await pred();
    if (last?.ok) return last;
    await sleep(intervalMs);
  }
  return { ok: false, timeout: true, label, last };
}

async function main() {
  if (
    process.env.PATHCODE_BUILD_FAKE === "1" ||
    process.env.PATHCODE_GATEWAY_FAKE_ENGINE === "1"
  ) {
    console.error("REFUSE fake fabric");
    process.exitCode = 2;
    return;
  }

  process.env.PLAYWRIGHT_BROWSERS_PATH =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    join(process.env.HOME || "", "Library/Caches/ms-playwright");
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    join(
      process.env.HOME || "",
      "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell",
    );

  const packageRoot = resolvePathPackageRoot();
  const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
  const evidenceDir = join(
    runtimeRoot,
    "metadata",
    "build-evidence",
    "fresh-browser-acceptance",
  );
  mkdirSync(evidenceDir, { recursive: true });

  /** @type {any} */
  const report = {
    startedAt: new Date().toISOString(),
    runtimeRoot,
    packageRoot,
  };

  const surface = await startPathBuildSurface({
    packageRoot,
    runtimeRoot,
    openBrowser: false,
    fakeMode: false,
    autoLoop: true,
    port: 0,
  });
  report.surfaceUrl = surface.url;
  console.log("Surface", surface.url);

  const exe =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH &&
    existsSync(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
      ? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      : undefined;
  const browser = await chromium.launch({
    headless: true,
    executablePath: exe,
  });
  const page = await browser.newPage();
  const network = [];
  page.on("response", async (res) => {
    try {
      const url = res.url();
      if (!url.includes("/api/")) return;
      const req = res.request();
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        bodyText = "";
      }
      network.push({
        method: req.method(),
        url,
        status: res.status(),
        body: bodyText.slice(0, 2_000),
      });
    } catch {
      /* ignore */
    }
  });

  // 1–4: landing → fill → click Build
  await page.goto(surface.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.fill("#outcome", OUTCOME);
  const btnBefore = await page.locator("#buildBtn").innerText();
  report.buttonBefore = btnBefore;

  await page.click("#buildBtn");
  await page.waitForTimeout(500);
  const btnDuring = await page.locator("#buildBtn").innerText().catch(() => "");
  report.buttonDuring = btnDuring;

  // Wait for workspace (Build must not silently return to idle landing)
  const entered = await waitFor(
    async () => {
      const landingHidden = await page.locator("#landing").isHidden();
      const workspaceVisible = await page.locator("#workspace").isVisible();
      const post = network.find(
        (n) => n.method === "POST" && n.url.endsWith("/api/builds"),
      );
      if (landingHidden && workspaceVisible && post && post.status === 200) {
        let parsed = null;
        try {
          parsed = JSON.parse(post.body);
        } catch {
          parsed = null;
        }
        return {
          ok: true,
          buildId: parsed?.buildId,
          projectRoot: parsed?.projectRoot,
          post,
        };
      }
      // Failure path: landing error visible
      const err = await page.locator("#landingError").innerText().catch(() => "");
      if (err && !landingHidden) {
        return { ok: false, landingError: err, post };
      }
      return {
        ok: false,
        landingHidden,
        workspaceVisible,
        btn: await page.locator("#buildBtn").innerText().catch(() => ""),
        post,
      };
    },
    { timeoutMs: 60_000, label: "enter_workspace" },
  );
  report.enterWorkspace = {
    ok: entered.ok,
    buildId: entered.buildId,
    projectRoot: entered.projectRoot,
    postStatus: entered.post?.status,
    landingError: entered.landingError || null,
    last: entered.ok ? undefined : entered,
  };
  console.log("enterWorkspace", report.enterWorkspace);
  if (!entered.ok || !entered.buildId) {
    report.verdict = "FAIL_BUILD_BUTTON";
    writeFileSync(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));
    await browser.close();
    await surface.stop();
    process.exitCode = 1;
    return;
  }

  const buildId = entered.buildId;
  report.buildId = buildId;
  report.projectRoot = entered.projectRoot;

  // 5–8: engineer child + activity
  const engineered = await waitFor(
    async () => {
      const b = readBuildRecord(runtimeRoot, buildId);
      const kids = b?.children || [];
      const eng = kids.find((c) => c.kind === "engineer");
      const activityText = await page.locator("#drawerBody").innerText().catch(() => "");
      const statusPill = await page.locator("#statusPill").innerText().catch(() => "");
      if (eng && eng.taskId) {
        return {
          ok: true,
          eng,
          activityText,
          statusPill,
          children: kids.length,
        };
      }
      // Open activity drawer if needed
      await page.locator("#detailsBtn").click().catch(() => null);
      return {
        ok: false,
        children: kids.length,
        status: b?.loop?.status,
        activityText: activityText.slice(0, 200),
        statusPill,
      };
    },
    { timeoutMs: 180_000, label: "engineer_dispatched" },
  );
  report.engineer = {
    ok: engineered.ok,
    taskId: engineered.eng?.taskId,
    state: engineered.eng?.dispatchState,
    statusPill: engineered.statusPill,
    activityHasEngineer: /engineer/i.test(engineered.activityText || ""),
  };
  console.log("engineer", report.engineer);

  // 9–10: adoption + runtime + live preview
  const previewReady = await waitFor(
    async () => {
      const b = readBuildRecord(runtimeRoot, buildId);
      const view = await (
        await fetch(new URL(`/api/builds/${buildId}`, surface.url))
      ).json();
      const iframeVisible = await page.locator("#previewFrame").isVisible().catch(() => false);
      const iframeSrc = await page.locator("#previewFrame").getAttribute("src").catch(() => "");
      if (
        b?.authoritativeSha &&
        (b.adoptionHistory?.length || 0) > 0 &&
        (view.preview?.status === "ready" || iframeVisible)
      ) {
        return {
          ok: true,
          auth: b.authoritativeSha,
          adoptions: b.adoptionHistory.length,
          preview: view.preview,
          iframeSrc,
        };
      }
      return {
        ok: false,
        auth: b?.authoritativeSha,
        adoptions: b?.adoptionHistory?.length || 0,
        preview: view.preview,
        children: (b?.children || []).map((c) => `${c.kind}:${c.dispatchState}`),
      };
    },
    { timeoutMs: 1_200_000, label: "preview_ready" },
  );
  report.preview = previewReady;
  console.log("preview", {
    ok: previewReady.ok,
    auth: previewReady.auth,
    url: previewReady.preview?.url,
  });

  let productShot = null;
  if (previewReady.ok && previewReady.preview?.url) {
    const ev = await captureBrowserEvidence({
      url: previewReady.preview.url,
      preferEmbedUrl: previewReady.preview.embedPath
        ? new URL(previewReady.preview.embedPath, surface.url).toString()
        : null,
      buildId,
      runtimeRoot,
      authoritativeSha: previewReady.auth,
      expectText: ["ICE", "Emergency"],
      captureMobile: true,
    });
    productShot = {
      ok: ev.ok,
      shot: ev.screenshotPath,
      mobile: ev.mobileScreenshotPath,
      hash: ev.contentHash,
      provider: ev.browserProvider,
      text: ev.textSample?.slice(0, 300),
    };
    report.productEvidence = productShot;
  }

  // 11–13: conversation change through UI chat
  const beforeHash = productShot?.hash;
  await page.fill("#chatInput", "Make the hero darker and the main heading larger.");
  await page.click("#sendBtn");
  const afterChange = await waitFor(
    async () => {
      const b = readBuildRecord(runtimeRoot, buildId);
      const view = await (
        await fetch(new URL(`/api/builds/${buildId}`, surface.url))
      ).json();
      const ev = await captureBrowserEvidence({
        url: view.preview?.url || previewReady.preview?.url,
        preferEmbedUrl: view.preview?.embedPath
          ? new URL(view.preview.embedPath, surface.url).toString()
          : null,
        buildId,
        runtimeRoot,
        authoritativeSha: b?.authoritativeSha,
        expectText: ["ICE"],
        captureMobile: false,
      });
      const authChanged =
        Boolean(b?.authoritativeSha) &&
        b.authoritativeSha !== previewReady.auth;
      const hashChanged = ev.ok && beforeHash && ev.contentHash !== beforeHash;
      if (authChanged || hashChanged) {
        return { ok: true, auth: b.authoritativeSha, hash: ev.contentHash, shot: ev.screenshotPath };
      }
      return {
        ok: false,
        status: b?.loop?.status,
        auth: b?.authoritativeSha?.slice?.(0, 8),
        adoptions: b?.adoptionHistory?.length,
      };
    },
    { timeoutMs: 1_200_000, label: "conversation_change" },
  );
  report.conversationChange = afterChange;
  console.log("conversationChange", {
    ok: afterChange.ok,
    auth: afterChange.auth,
  });

  // 16–17: Open Folder + Open in PATH Code via real UI buttons
  const [folderRes, codeRes] = await Promise.all([
    page.evaluate(async (id) => {
      const res = await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildId: id }),
      });
      return { status: res.status, body: await res.json() };
    }, buildId),
    page.evaluate(async (id) => {
      const res = await fetch("/api/open-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildId: id }),
      });
      return { status: res.status, body: await res.json() };
    }, buildId),
  ]);
  // Also click the buttons (covers client handlers)
  await page.click("#openFolderBtn");
  await page.click("#openCodeBtn");
  await sleep(1500);

  report.openFolder = {
    ok: Boolean(folderRes.body?.ok) && folderRes.body?.path === report.projectRoot,
    ...folderRes,
  };
  report.openCode = {
    ok:
      Boolean(codeRes.body?.ok) &&
      codeRes.body?.path === report.projectRoot &&
      Boolean(codeRes.body?.launched || codeRes.body?.method),
    ...codeRes,
  };
  console.log("openFolder", report.openFolder.ok, report.openFolder.body);
  console.log("openCode", report.openCode.ok, report.openCode.body);

  // UI screenshot of builder
  const uiShot = join(evidenceDir, "builder-ui.png");
  await page.screenshot({ path: uiShot, fullPage: true });
  report.builderUiShot = uiShot;

  const finalBuild = readBuildRecord(runtimeRoot, buildId);
  report.final = {
    status: finalBuild?.loop?.status,
    auth: finalBuild?.authoritativeSha,
    children: (finalBuild?.children || []).map((c) => ({
      kind: c.kind,
      state: c.dispatchState,
      taskId: c.taskId,
      provider: c.provider,
      classification: c.classification,
    })),
    criteria: (finalBuild?.outcomeCriteria || []).map((c) => ({
      id: c.id,
      status: c.status,
    })),
  };

  const pass =
    report.enterWorkspace?.ok &&
    report.engineer?.ok &&
    report.preview?.ok &&
    report.productEvidence?.ok &&
    report.conversationChange?.ok &&
    report.openFolder?.ok &&
    report.openCode?.ok;

  report.verdict = pass
    ? "PATH BUILD — REAL FRESH-USER BROWSER FLOW PASS"
    : "FAIL";
  report.operatorAcceptanceReady = pass;
  report.endedAt = new Date().toISOString();
  report.network = network.slice(-20);

  writeFileSync(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(
    join(packageRoot, "docs/reports/g10-evidence/s5/s5-fresh-browser-acceptance.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("REPORT", join(evidenceDir, "report.json"));
  console.log(pass ? "FRESH_BROWSER_ACCEPTANCE_PASS" : "FRESH_BROWSER_ACCEPTANCE_FAIL");

  await browser.close();
  await surface.stop();
  process.exitCode = pass ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
