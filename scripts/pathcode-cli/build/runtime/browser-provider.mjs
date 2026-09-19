/**
 * S5 — resolve a working Playwright browser for Build render evidence.
 * Prefer validating real executables / channels over a single broken cache.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

/**
 * @returns {Promise<typeof import('playwright') | null>}
 */
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

/**
 * @param {string} path
 */
function frameworkOk(chromiumMacPath) {
  if (!chromiumMacPath || !existsSync(chromiumMacPath)) return false;
  // Incomplete sandbox installs often have the stub without Framework.
  const framework = join(
    chromiumMacPath,
    "../Frameworks/Chromium Framework.framework",
  );
  // executablePath may be .../Chromium.app/Contents/MacOS/Chromium
  const alt = join(
    chromiumMacPath,
    "../../Frameworks/Chromium Framework.framework",
  );
  return existsSync(framework) || existsSync(alt) || !chromiumMacPath.includes("chrome-mac");
}

/**
 * Attempt to install Playwright browsers for the locked dependency.
 * @param {string} [browser]
 */
export function repairPlaywrightBrowsers(browser = "chromium") {
  const r = spawnSync(
    process.execPath,
    [
      join(
        process.cwd(),
        "node_modules/playwright/cli.js",
      ),
      "install",
      browser,
    ],
    {
      encoding: "utf8",
      timeout: 600_000,
      env: {
        ...process.env,
        PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: "120000",
      },
    },
  );
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: String(r.stdout || "").slice(-2_000),
    stderr: String(r.stderr || "").slice(-2_000),
  };
}

/**
 * Probe launch strategies in order.
 * @returns {Promise<{
 *   ok: boolean,
 *   provider: string | null,
 *   launchOptions: Record<string, any>,
 *   playwright: any,
 *   error?: string,
 * }>}
 */
export async function resolveBrowserProvider() {
  const playwright = await loadPlaywright();
  if (!playwright?.chromium) {
    return {
      ok: false,
      provider: null,
      launchOptions: {},
      playwright: null,
      error: "playwright_not_installed",
    };
  }

  /** @type {Array<{ name: string, opts: Record<string, any> }>} */
  const candidates = [];

  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    candidates.push({
      name: "env_executable",
      opts: {
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      },
    });
  }

  candidates.push({ name: "chromium_default", opts: { headless: true } });
  candidates.push({
    name: "chrome_channel",
    opts: { headless: true, channel: "chrome" },
  });
  candidates.push({
    name: "chrome_beta_channel",
    opts: { headless: true, channel: "chrome-beta" },
  });
  candidates.push({
    name: "msedge_channel",
    opts: { headless: true, channel: "msedge" },
  });

  const home = homedir();
  const browsersRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    join(home, "Library/Caches/ms-playwright");
  for (const rel of [
    "chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    "chromium-1148/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
  ]) {
    const p = join(browsersRoot, rel);
    if (existsSync(p) && frameworkOk(p)) {
      candidates.push({
        name: `bundled_${rel.split("/")[0]}`,
        opts: { headless: true, executablePath: p },
      });
    }
  }

  for (const app of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ]) {
    if (existsSync(app)) {
      candidates.push({
        name: `system_${app.split("/").slice(-3, -2)[0] || "app"}`,
        opts: { headless: true, executablePath: app },
      });
    }
  }

  // WebKit fallback
  if (playwright.webkit) {
    candidates.push({ name: "webkit", opts: { headless: true, _browser: "webkit" } });
  }
  if (playwright.firefox) {
    candidates.push({ name: "firefox", opts: { headless: true, _browser: "firefox" } });
  }

  /** @type {string[]} */
  const errors = [];
  for (const c of candidates) {
    try {
      const browserType =
        c.opts._browser === "webkit"
          ? playwright.webkit
          : c.opts._browser === "firefox"
            ? playwright.firefox
            : playwright.chromium;
      const { _browser, ...launchOpts } = c.opts;
      const browser = await browserType.launch(launchOpts);
      await browser.close();
      return {
        ok: true,
        provider: c.name,
        launchOptions: launchOpts,
        playwright,
        browserTypeName: c.opts._browser || "chromium",
      };
    } catch (err) {
      errors.push(`${c.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Optional repair — skip by default (can take many minutes); enable with PATHCODE_PLAYWRIGHT_REPAIR=1
  if (process.env.PATHCODE_PLAYWRIGHT_REPAIR === "1") {
    const repaired = repairPlaywrightBrowsers("chromium");
    if (repaired.ok) {
      for (const c of [
        { name: "chromium_after_repair", opts: { headless: true } },
        { name: "chrome_channel_after_repair", opts: { headless: true, channel: "chrome" } },
      ]) {
        try {
          const browser = await playwright.chromium.launch(c.opts);
          await browser.close();
          return {
            ok: true,
            provider: c.name,
            launchOptions: c.opts,
            playwright,
            browserTypeName: "chromium",
          };
        } catch (err) {
          errors.push(`${c.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      errors.push(`repair_failed: ${repaired.stderr || repaired.stdout}`);
    }

    const wk = repairPlaywrightBrowsers("webkit");
    if (wk.ok && playwright.webkit) {
      try {
        const browser = await playwright.webkit.launch({ headless: true });
        await browser.close();
        return {
          ok: true,
          provider: "webkit_after_install",
          launchOptions: { headless: true },
          playwright,
          browserTypeName: "webkit",
        };
      } catch (err) {
        errors.push(`webkit_after_install: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return {
    ok: false,
    provider: null,
    launchOptions: {},
    playwright,
    error: errors.slice(0, 8).join(" | "),
  };
}

/**
 * @param {{
 *   provider?: Awaited<ReturnType<typeof resolveBrowserProvider>>,
 * }} [opts]
 */
export async function launchBrowserEvidenceSession(opts = {}) {
  const provider = opts.provider || (await resolveBrowserProvider());
  if (!provider.ok || !provider.playwright) {
    return { ok: false, error: provider.error || "no_browser_provider", provider };
  }
  const typeName = provider.browserTypeName || "chromium";
  const browserType =
    typeName === "webkit"
      ? provider.playwright.webkit
      : typeName === "firefox"
        ? provider.playwright.firefox
        : provider.playwright.chromium;
  const browser = await browserType.launch(provider.launchOptions);
  return {
    ok: true,
    browser,
    provider: provider.provider,
    close: async () => {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    },
  };
}
