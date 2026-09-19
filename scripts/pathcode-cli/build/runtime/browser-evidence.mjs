/**
 * Browser/render evidence for visual Build products.
 * Uses fetch + lightweight HTML checks; Playwright when available.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

/**
 * @param {string} html
 * @param {string[]} needles
 */
function findNeedles(html, needles) {
  const lower = html.toLowerCase();
  /** @type {{ needle: string, found: boolean }[]} */
  const results = [];
  for (const n of needles) {
    const needle = String(n || "").trim();
    if (!needle) continue;
    results.push({ needle, found: lower.includes(needle.toLowerCase()) });
  }
  return results;
}

/**
 * Capture rendered evidence from a preview URL.
 * @param {{
 *   url: string,
 *   buildId: string,
 *   runtimeRoot: string,
 *   expectText?: string[],
 *   viewport?: { width: number, height: number },
 * }} input
 */
export async function captureBrowserEvidence(input) {
  const url = String(input.url || "").trim();
  const outDir = join(
    input.runtimeRoot,
    "metadata",
    "build-evidence",
    String(input.buildId).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80),
  );
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  /** @type {any} */
  const evidence = {
    ok: false,
    url,
    capturedAt: new Date().toISOString(),
    htmlPath: null,
    screenshotPath: null,
    title: null,
    textSample: null,
    needles: [],
    consoleErrors: [],
    engine: "fetch",
    error: null,
  };

  if (!url) {
    evidence.error = "missing_url";
    return evidence;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const html = await res.text();
    const htmlPath = join(outDir, `render-${stamp}.html`);
    writeFileSync(htmlPath, html, "utf8");
    evidence.htmlPath = htmlPath;
    evidence.ok = res.ok;
    evidence.status = res.status;
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    evidence.title = titleMatch ? titleMatch[1].trim() : null;
    evidence.textSample = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2_000);
    evidence.needles = findNeedles(html, input.expectText || []);
    evidence.contentHash = createHash("sha256").update(html).digest("hex").slice(0, 16);
  } catch (err) {
    evidence.error = err instanceof Error ? err.message : String(err);
    return evidence;
  }

  // Optional Playwright screenshot when installed
  try {
    const mod = await import("playwright").catch(() => null);
    if (mod?.chromium) {
      /** @type {{ headless: boolean, executablePath?: string }} */
      const launchOpts = { headless: true };
      const home = process.env.HOME || "";
      const browsersRoot =
        process.env.PLAYWRIGHT_BROWSERS_PATH ||
        join(home, "Library/Caches/ms-playwright");
      const candidates = [
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        join(
          browsersRoot,
          "chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        ),
        join(
          browsersRoot,
          "chromium-1148/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
        ),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ].filter(Boolean);
      for (const c of candidates) {
        if (c && existsSync(c)) {
          launchOpts.executablePath = c;
          break;
        }
      }
      const browser = await mod.chromium.launch(launchOpts);
      try {
        const page = await browser.newPage({
          viewport: input.viewport || { width: 1280, height: 800 },
        });
        const consoleErrors = [];
        page.on("pageerror", (e) => consoleErrors.push(String(e.message || e)));
        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        const shot = join(outDir, `shot-${stamp}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        evidence.screenshotPath = shot;
        evidence.consoleErrors = consoleErrors.slice(0, 20);
        evidence.engine = "playwright";
        evidence.title = (await page.title()) || evidence.title;
        const bodyText = await page.innerText("body").catch(() => "");
        if (bodyText) evidence.textSample = bodyText.replace(/\s+/g, " ").trim().slice(0, 2_000);
        evidence.ok = true;
      } finally {
        await browser.close();
      }
    }
  } catch (err) {
    evidence.playwrightError = err instanceof Error ? err.message : String(err);
  }

  const metaPath = join(outDir, `meta-${stamp}.json`);
  writeFileSync(metaPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  evidence.metaPath = metaPath;
  return evidence;
}

/**
 * @param {any} evidence
 * @param {string[]} requiredNeedles
 */
export function browserEvidenceSupports(evidence, requiredNeedles) {
  if (!evidence?.ok) return false;
  const needles = evidence.needles || [];
  for (const req of requiredNeedles || []) {
    const hit = needles.find((n) => n.needle.toLowerCase() === String(req).toLowerCase());
    if (hit && !hit.found) return false;
    if (!hit && evidence.textSample && !String(evidence.textSample).toLowerCase().includes(String(req).toLowerCase())) {
      return false;
    }
  }
  return true;
}

/**
 * @param {string} path
 */
export function evidenceFileExists(path) {
  return typeof path === "string" && path && existsSync(path);
}
