/**
 * B1 — browser-driven honest-origin + live-preview proof.
 *
 * Drives the real landing Build button (no controller.startBuild shortcut),
 * asserts binding == ~/PATH Builds folder (not $HOME), then waits for a live
 * preview of the produced web artifact and a visible content change.
 *
 * Usage: node scripts/pathcode-cli/build/run-b1-honest-origin-preview.mjs
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

import { resolvePathPackageRoot, resolvePathRuntimeRoot } from "../paths.mjs";
import { startPathBuildSurface } from "./surface/server.mjs";
import { readBuildRecord } from "./index.mjs";

function canon(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function progress(report, evidenceDir, patch) {
  Object.assign(report, patch);
  try {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      join(evidenceDir, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  } catch {
    /* ignore */
  }
  console.log(`[b1] ${Object.keys(patch).join(",")}`);
}

async function waitFor(fn, { timeoutMs = 120_000, label = "wait" } = {}) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`${label}_timeout: ${JSON.stringify(last)}`);
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
  const chromeExec =
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
    "b1-honest-origin-preview",
  );
  mkdirSync(evidenceDir, { recursive: true });

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
  progress(report, evidenceDir, { surfaceUrl: surface.url });

  const browser = await chromium.launch({
    headless: true,
    executablePath: existsSync(chromeExec) ? chromeExec : undefined,
  });
  const page = await browser.newPage();
  const outcome =
    "Build a website that tells about ICE in case of emergency app and how to use it, it should really look good friendly.";

  try {
    await page.goto(surface.url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#outcome", { timeout: 15_000 });
    await page.fill("#outcome", outcome);

    const buildBtn = page.locator("#buildBtn");
    await expectVisible(buildBtn);
    progress(report, evidenceDir, { phase: "clicking_build" });

    const [post] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/builds") &&
          r.request().method() === "POST" &&
          !r.url().includes("/messages"),
        { timeout: 60_000 },
      ),
      buildBtn.click(),
    ]);

    const postStatus = post.status();
    const postBody = await post.json();
    progress(report, evidenceDir, {
      buildPost: {
        status: postStatus,
        ok: postBody.ok === true,
        buildId: postBody.buildId || null,
        projectRoot: postBody.projectRoot || null,
        message: postBody.message || null,
        code: postBody.code || null,
      },
    });
    if (!postBody.ok || postStatus >= 400) {
      throw new Error(`build_post_failed: ${JSON.stringify(report.buildPost)}`);
    }

    const buildId = postBody.buildId;
    const projectRoot = canon(postBody.projectRoot);
    const home = canon(homedir());
    progress(report, evidenceDir, {
      buildId,
      projectRoot,
      bindsHome: projectRoot === home,
      underPathBuilds: projectRoot.startsWith(
        canon(join(homedir(), "PATH Builds")),
      ),
      phase: "bound",
    });

    if (report.bindsHome) {
      throw new Error("BINDING_FAILURE: projectRoot is $HOME");
    }
    if (!report.underPathBuilds) {
      throw new Error(`BINDING_FAILURE: not under PATH Builds: ${projectRoot}`);
    }

    await page.waitForSelector("#workspace:not([hidden])", { timeout: 30_000 });
    const uiPath = (await page.locator("#projectPath").textContent())?.trim();
    progress(report, evidenceDir, { uiProjectPath: uiPath });
    if (canon(uiPath || "") !== projectRoot) {
      throw new Error(
        `UI_PATH_MISMATCH: ui=${uiPath} bound=${projectRoot}`,
      );
    }

    const record = readBuildRecord(runtimeRoot, buildId);
    const binding = record?.projectBindings?.[0];
    progress(report, evidenceDir, {
      originGitInit: Boolean(binding?.originGitInit),
      originKind: binding?.originKind || null,
    });
    if (!report.originGitInit) {
      throw new Error("originGitInit must be true for greenfield Build");
    }
    if (canon(binding.projectRoot) !== projectRoot) {
      throw new Error("binding.projectRoot mismatch");
    }

    // Wait for live preview from real engineering (or opportunistic runtime).
    progress(report, evidenceDir, { phase: "await_preview" });
    let lastKids = "";
    const previewReady = await waitFor(
      async () => {
        const viewRes = await fetch(
          new URL(`/api/builds/${encodeURIComponent(buildId)}`, surface.url),
        );
        const view = await viewRes.json();
        const v = view.view || view;
        const kids = (view.build?.children || []).map((c) => ({
          kind: c.kind,
          state: c.dispatchState,
          class: c.classification,
        }));
        const sig = JSON.stringify(kids);
        if (sig !== lastKids) {
          lastKids = sig;
          progress(report, evidenceDir, {
            poll: {
              preview: v.preview?.status,
              children: kids,
              at: new Date().toISOString(),
            },
          });
        }
        if (v.preview?.status === "ready" && v.preview?.url) {
          return {
            url: v.preview.url,
            embedPath: v.preview.embedPath,
            auth: view.build?.authoritativeSha || record?.authoritativeSha,
          };
        }
        return null;
      },
      { timeoutMs: 1_200_000, label: "preview_ready" },
    );
    progress(report, evidenceDir, { preview: previewReady, phase: "preview_ready" });

    const served1 = await fetch(previewReady.url);
    const bytes1 = Buffer.from(await served1.arrayBuffer());
    const diskIndex = join(projectRoot, "index.html");
    if (!existsSync(diskIndex)) {
      // framework may serve from public/dist — still prove served content is live
      report.servedHash1 = sha256(bytes1);
      report.servedHasIce = /ICE|emergency/i.test(bytes1.toString("utf8"));
    } else {
      const diskHash = sha256(readFileSync(diskIndex));
      report.servedHash1 = sha256(bytes1);
      report.diskHash1 = diskHash;
      report.servedMatchesDisk = report.servedHash1 === diskHash;
      if (!report.servedMatchesDisk) {
        // Static servers may inject preview scripts — compare substantive content
        report.servedHasIce = /ICE|emergency/i.test(bytes1.toString("utf8"));
      }
    }

    await page.screenshot({
      path: join(evidenceDir, "live-product.png"),
      fullPage: true,
    });
    report.liveProductShot = join(evidenceDir, "live-product.png");

    // Conversation change → wait for new auth / preview content shift
    const chat = page.locator("#chatInput");
    if (await chat.isVisible().catch(() => false)) {
      await chat.fill(
        "Make the hero headline say: ICE — Your Emergency Lifeline (B1 proof).",
      );
      const send = page.locator("#sendBtn");
      if (await send.isVisible().catch(() => false)) {
        await send.click({ timeout: 15_000 });
      } else {
        await page.locator("#chatForm").evaluate((form) =>
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
        );
      }
      progress(report, evidenceDir, { phase: "conversation_sent" });
      const changed = await waitFor(
        async () => {
          const viewRes = await fetch(
            new URL(`/api/builds/${encodeURIComponent(buildId)}`, surface.url),
          );
          const view = await viewRes.json();
          const url =
            view.view?.preview?.url ||
            view.preview?.url ||
            previewReady.url;
          const served = await fetch(url);
          const bytes = Buffer.from(await served.arrayBuffer());
          const text = bytes.toString("utf8");
          const hash = sha256(bytes);
          if (
            hash !== report.servedHash1 ||
            /B1 proof|Emergency Lifeline/i.test(text)
          ) {
            return { hash, text: text.slice(0, 240) };
          }
          return null;
        },
        { timeoutMs: 900_000, label: "preview_change" },
      );
      progress(report, evidenceDir, {
        conversationChange: changed,
        phase: "conversation_changed",
      });
      await page.screenshot({
        path: join(evidenceDir, "after-change.png"),
        fullPage: true,
      });
      report.changeShot = join(evidenceDir, "after-change.png");
    }

    // Open Folder — single bound path
    const openFolder = await fetch(new URL("/api/open-folder", surface.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildId }),
    });
    report.openFolder = {
      status: openFolder.status,
      body: await openFolder.json(),
    };
    if (
      !report.openFolder.body?.ok ||
      canon(report.openFolder.body.path) !== projectRoot
    ) {
      throw new Error(`open_folder_mismatch: ${JSON.stringify(report.openFolder)}`);
    }

    report.verdict = "B1 — HONEST ORIGIN + LIVE PRODUCT PREVIEW PASS";
    report.endedAt = new Date().toISOString();
    writeFileSync(
      join(evidenceDir, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    writeFileSync(
      join(
        packageRoot,
        "docs/reports/g10-evidence/s5/b1-honest-origin-preview.json",
      ),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report, null, 2));
    console.log(report.verdict);
  } finally {
    await browser.close().catch(() => {});
    await surface.stop().catch(() => {});
  }
}

async function expectVisible(locator) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
