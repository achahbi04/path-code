/**
 * G9 — runtime layout, locks, provenance, mise env isolation proofs.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG9 = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag9/index.mjs");

/** @type {string[]} */
const temps: string[] = [];

afterEach(() => {
  while (temps.length) {
    const p = temps.pop();
    if (!p) continue;
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tmpFixture(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pathcode-g9-layout-${label}-`));
  temps.push(dir);
  return dir;
}

async function loadAg9() {
  return import(`${pathToFileURL(AG9).href}?g9=${randomUUID()}`);
}

describe("G9 runtime layout", () => {
  it("resolveAg9RuntimeDirs + ensureAg9RuntimeDirs create expected tree", async () => {
    const { resolveAg9RuntimeDirs, ensureAg9RuntimeDirs } = await loadAg9();
    const root = tmpFixture("dirs");
    const dirs = ensureAg9RuntimeDirs(root);
    const resolved = resolveAg9RuntimeDirs(root);

    expect(dirs.root).toBe(resolved.root);
    expect(dirs.toolManager).toMatch(/tool-manager$/);
    expect(dirs.miseHome).toMatch(/tool-manager[/\\]mise$/);
    expect(dirs.toolchains).toMatch(/toolchains$/);
    expect(dirs.languageServers).toMatch(/language-servers$/);
    expect(dirs.indexers).toMatch(/indexers$/);
    expect(dirs.caches).toMatch(/caches$/);
    expect(dirs.downloads).toMatch(/downloads$/);
    expect(dirs.scipCache).toMatch(/scip$/);
    expect(dirs.metadata).toMatch(/metadata$/);
    expect(dirs.locks).toMatch(/locks$/);
    expect(dirs.copilotHome).toMatch(/copilot-home$/);

    for (const p of Object.values(dirs) as string[]) {
      expect(existsSync(p)).toBe(true);
    }
  });
});

describe("G9 miseEnv isolation", () => {
  it("points MISE_* under PATH runtime and never ~/.config/mise", async () => {
    const { ensureAg9RuntimeDirs, miseEnv, miseDownloadUrl, MISE_PINNED_VERSION } =
      await loadAg9();
    const root = tmpFixture("mise-env");
    ensureAg9RuntimeDirs(root);

    const env = miseEnv(root, {
      PATH: "/usr/bin",
      HOME: "/tmp/fake-home",
      MISE_GLOBAL_CONFIG_FILE: "/tmp/fake-home/.config/mise/config.toml",
    });

    expect(env.MISE_DATA_DIR).toContain(root);
    expect(env.MISE_CONFIG_DIR).toContain(join("tool-manager", "mise", "config"));
    expect(env.MISE_CACHE_DIR).toContain(join("caches", "mise"));
    expect(env.MISE_DATA_DIR).not.toMatch(/\.config[/\\]mise/);
    expect(env.MISE_CONFIG_DIR).not.toBe("/tmp/fake-home/.config/mise");
    expect(env.MISE_GLOBAL_CONFIG_FILE).toBeUndefined();

    const url = miseDownloadUrl(MISE_PINNED_VERSION, { os: "darwin", arch: "arm64" });
    expect(url).toContain(`mise-${MISE_PINNED_VERSION}-macos-arm64.tar.gz`);
    expect(url).toContain("github.com/jdx/mise/releases/download/");
  });
});

describe("G9 locks + provenance", () => {
  it("withToolLock serializes exclusive critical sections", async () => {
    const { ensureAg9RuntimeDirs, withToolLock } = await loadAg9();
    const root = tmpFixture("locks");
    const dirs = ensureAg9RuntimeDirs(root);
    /** @type {number[]} */
    const order: number[] = [];

    const a = withToolLock(dirs.locks, "rust", async () => {
      order.push(1);
      await new Promise((r) => setTimeout(r, 80));
      order.push(2);
      return "a";
    });
    const b = withToolLock(dirs.locks, "rust", async () => {
      order.push(3);
      return "b";
    });

    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe("a");
    expect(rb).toBe("b");
    // Second lock must start after first finishes → 1,2 before 3.
    expect(order.indexOf(3)).toBeGreaterThan(order.indexOf(2));
  });

  it("appendProvenance writes JSONL records", async () => {
    const { ensureAg9RuntimeDirs, appendProvenance } = await loadAg9();
    const root = tmpFixture("prov");
    const dirs = ensureAg9RuntimeDirs(root);
    const meta = join(dirs.metadata, "capabilities.jsonl");
    appendProvenance(meta, {
      tool: "go",
      version: "1.22.0",
      requestedBy: "test",
      source: "mise",
      executable: "/tmp/go",
      integrity: "sha256:demo",
      health: "ok",
    });
    const lines = readFileSync(meta, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0] || "{}");
    expect(row.tool).toBe("go");
    expect(row.health).toBe("ok");
    expect(row.installedAt).toBeTruthy();
  });
});

describe("G9 envelope", () => {
  it("buildEngineeringToolEnv prepends bins and strips ag1-venv + secrets", async () => {
    const { ensureAg9RuntimeDirs, buildEngineeringToolEnv } = await loadAg9();
    const root = tmpFixture("env");
    const dirs = ensureAg9RuntimeDirs(root);
    const venvBin = join(root, "ag1-venv", "bin");

    const env = buildEngineeringToolEnv({
      runtimeRoot: root,
      pathPrepend: [join(dirs.languageServers, "bin")],
      baseEnv: {
        PATH: `${venvBin}:/usr/bin`,
        HOME: "/tmp",
        GH_TOKEN: "secret-token",
        GITHUB_TOKEN: "ghp_secret",
        VIRTUAL_ENV: join(root, "ag1-venv"),
        PYTHONPATH: "/evil",
        LANG: "C",
      },
    });

    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.VIRTUAL_ENV).toBeUndefined();
    expect(env.PYTHONPATH).toBeUndefined();
    expect(env.PATH).toContain(join(dirs.miseHome, "bin"));
    expect(env.PATH).not.toContain(venvBin);
    expect(env.MISE_CONFIG_DIR).toContain(dirs.miseHome);
    expect(env.COPILOT_HOME).toBe(dirs.copilotHome);
  });
});

describe("G9 platform backend", () => {
  it("reports support only for proven platforms", async () => {
    const { isPlatformSupported, platformBackend, detectPlatform } = await loadAg9();
    expect(isPlatformSupported("darwin-arm64")).toBe(true);
    expect(isPlatformSupported("linux-x64")).toBe(true);
    expect(isPlatformSupported("linux-arm64")).toBe(true);
    expect(isPlatformSupported("windows-x64")).toBe(false);
    expect(isPlatformSupported("darwin-x64")).toBe(false);

    const backend = platformBackend();
    expect(backend.id).toBe(detectPlatform().id);
    expect(typeof backend.canAcquireUserSpace).toBe("boolean");
    expect(backend.supported).toBe(isPlatformSupported(backend.id));
  });
});
