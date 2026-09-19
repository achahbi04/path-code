/**
 * Browser/render evidence for visual Build products.
 * Fetch baseline + Playwright via resolved browser provider.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  resolveBrowserProvider,
  launchBrowserEvidenceSession,
} from "./browser-provider.mjs";

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
 * @param {string} html
 */
function extractRevisionMarker(html) {
  const meta = String(html || "").match(
    /<meta\s+name=["']path-build-revision["']\s+content=["']([^"']+)["']/i,
  );
  if (meta) return meta[1];
  const win = String(html || "").match(
    /__PATH_BUILD_REVISION__\s*=\s*["']([^"']+)["']/,
  );
  return win ? win[1] : null;
}

/**
 * Capture rendered evidence from a preview URL.
 * @param {{
 *   url: string,
 *   buildId: string,
 *   runtimeRoot: string,
 *   expectText?: string[],
 *   viewport?: { width: number, height: number },
 *   authoritativeSha?: string | null,
 *   intentRevision?: number | null,
 *   bindingId?: string | null,
 *   preferEmbedUrl?: string | null,
 *   captureMobile?: boolean,
 * }} input
 */
export async function captureBrowserEvidence(input) {
  const url = String(input.preferEmbedUrl || input.url || "").trim();
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
    buildId: input.buildId,
    bindingId: input.bindingId || null,
    authoritativeSha: input.authoritativeSha || null,
    intentRevision: input.intentRevision ?? null,
    renderedRevision: null,
    revisionMatch: null,
    capturedAt: new Date().toISOString(),
    htmlPath: null,
    screenshotPath: null,
    mobileScreenshotPath: null,
    title: null,
    textSample: null,
    heroStyles: null,
    headingStyles: null,
    cta: null,
    needles: [],
    consoleErrors: [],
    failedRequests: [],
    engine: "fetch",
    browserProvider: null,
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
    evidence.renderedRevision = extractRevisionMarker(html);
    if (evidence.authoritativeSha && evidence.renderedRevision) {
      evidence.revisionMatch =
        evidence.renderedRevision === evidence.authoritativeSha;
    }
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

  // Stale revision via proxy marker — do not accept as current proof
  if (
    evidence.authoritativeSha &&
    evidence.renderedRevision &&
    evidence.renderedRevision !== evidence.authoritativeSha
  ) {
    evidence.ok = false;
    evidence.error = "stale_rendered_revision";
    evidence.revisionMatch = false;
  }

  try {
    const session = await launchBrowserEvidenceSession();
    if (session.ok && session.browser) {
      evidence.browserProvider = session.provider;
      try {
        const page = await session.browser.newPage({
          viewport: input.viewport || { width: 1280, height: 800 },
        });
        const consoleErrors = [];
        const failedRequests = [];
        page.on("pageerror", (e) => consoleErrors.push(String(e.message || e)));
        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        page.on("requestfailed", (req) => {
          failedRequests.push(`${req.failure()?.errorText || "fail"} ${req.url()}`);
        });
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await new Promise((r) => setTimeout(r, 400));

        const renderedRevision = await page
          .evaluate(() => {
            const meta = document.querySelector('meta[name="path-build-revision"]');
            // @ts-ignore
            return (
              (meta && meta.getAttribute("content")) ||
              // @ts-ignore
              window.__PATH_BUILD_REVISION__ ||
              null
            );
          })
          .catch(() => null);
        if (renderedRevision) evidence.renderedRevision = renderedRevision;
        if (evidence.authoritativeSha && evidence.renderedRevision) {
          evidence.revisionMatch =
            evidence.renderedRevision === evidence.authoritativeSha;
          if (!evidence.revisionMatch) {
            evidence.ok = false;
            evidence.error = "stale_rendered_revision";
          }
        }

        if (evidence.revisionMatch !== false) {
          const shot = join(outDir, `shot-desktop-${stamp}.png`);
          await page.screenshot({ path: shot, fullPage: true });
          evidence.screenshotPath = shot;

          const styles = await page
            .evaluate(() => {
              const hero =
                document.querySelector("header") ||
                document.querySelector("[class*='hero']") ||
                document.querySelector("main") ||
                document.body;
              const heading =
                document.querySelector("h1") ||
                document.querySelector("header h1") ||
                document.querySelector("h2");
              const cta =
                document.querySelector("header a, header button, .btn, .button, [class*='cta']") ||
                document.querySelector("a.button, button");
              const cs = (el) => {
                if (!el) return null;
                const s = window.getComputedStyle(el);
                return {
                  tag: el.tagName.toLowerCase(),
                  text: (el.innerText || "").trim().slice(0, 160),
                  backgroundColor: s.backgroundColor,
                  color: s.color,
                  fontSize: s.fontSize,
                  fontWeight: s.fontWeight,
                };
              };
              return {
                hero: cs(hero),
                heading: cs(heading),
                cta: cs(cta),
              };
            })
            .catch(() => null);
          if (styles) {
            evidence.heroStyles = styles.hero;
            evidence.headingStyles = styles.heading;
            evidence.cta = styles.cta;
          }

          evidence.consoleErrors = consoleErrors.slice(0, 20);
          evidence.failedRequests = failedRequests.slice(0, 20);
          evidence.engine = "playwright";
          evidence.title = (await page.title()) || evidence.title;
          const bodyText = await page.innerText("body").catch(() => "");
          if (bodyText) {
            evidence.textSample = bodyText.replace(/\s+/g, " ").trim().slice(0, 2_000);
          }
          if (evidence.error !== "stale_rendered_revision") evidence.ok = true;

          if (input.captureMobile !== false) {
            await page.setViewportSize({ width: 390, height: 844 });
            await new Promise((r) => setTimeout(r, 200));
            const mobileShot = join(outDir, `shot-mobile-${stamp}.png`);
            await page.screenshot({ path: mobileShot, fullPage: true });
            evidence.mobileScreenshotPath = mobileShot;
          }
        }
      } finally {
        await session.close();
      }
    } else {
      evidence.playwrightError = session.error || "no_browser_provider";
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
  if (evidence.revisionMatch === false) return false;
  const needles = evidence.needles || [];
  for (const req of requiredNeedles || []) {
    const hit = needles.find(
      (n) => n.needle.toLowerCase() === String(req).toLowerCase(),
    );
    if (hit && !hit.found) return false;
    if (
      !hit &&
      evidence.textSample &&
      !String(evidence.textSample)
        .toLowerCase()
        .includes(String(req).toLowerCase())
    ) {
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

export { resolveBrowserProvider };
