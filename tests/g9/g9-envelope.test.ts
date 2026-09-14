/**
 * G9 — engineering tool env envelope isolation proofs.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
  const dir = mkdtempSync(join(tmpdir(), `pathcode-g9-env-${label}-`));
  temps.push(dir);
  return dir;
}

async function loadAg9() {
  return import(`${pathToFileURL(AG9).href}?g9=${randomUUID()}`);
}

describe("G9 buildEngineeringToolEnv isolation", () => {
  it("prepends PATH-managed bins and strips publication tokens", async () => {
    const { buildEngineeringToolEnv, ensureAg9RuntimeDirs } = await loadAg9();
    const runtimeRoot = tmpFixture("runtime");
    const dirs = ensureAg9RuntimeDirs(runtimeRoot);
    const lsBin = join(dirs.languageServers, "bin");
    mkdirSync(lsBin, { recursive: true });
    writeFileSync(join(lsBin, "fake-tool"), "#!/bin/sh\necho ok\n", {
      mode: 0o755,
    });

    const env = buildEngineeringToolEnv({
      runtimeRoot,
      pathPrepend: [lsBin],
      baseEnv: {
        PATH: "/usr/bin:/bin",
        HOME: "/tmp/home",
        GH_TOKEN: "secret-gh-token",
        GITHUB_TOKEN: "secret-github",
        SSH_AUTH_SOCK: "/tmp/ssh.sock",
        VIRTUAL_ENV: join(runtimeRoot, "ag1-venv"),
        COPILOT_HOME: "",
      },
    });

    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
    expect(env.VIRTUAL_ENV).toBeUndefined();
    expect(env.MISE_DATA_DIR).toContain(runtimeRoot);
    expect(env.MISE_CONFIG_DIR).toContain(runtimeRoot);
    expect(env.COPILOT_HOME).toBe(dirs.copilotHome);
    expect(String(env.PATH).startsWith(lsBin) || String(env.PATH).includes(lsBin)).toBe(
      true,
    );
    expect(String(env.PATH)).toContain(join(dirs.miseHome, "bin"));
  });

  it("does not reuse user ~/.config/mise as authority", async () => {
    const { buildEngineeringToolEnv, ensureAg9RuntimeDirs } = await loadAg9();
    const runtimeRoot = tmpFixture("mise-iso");
    ensureAg9RuntimeDirs(runtimeRoot);
    const env = buildEngineeringToolEnv({
      runtimeRoot,
      baseEnv: {
        PATH: "/usr/bin",
        MISE_GLOBAL_CONFIG_FILE: "/Users/someone/.config/mise/config.toml",
        HOME: "/Users/someone",
      },
    });
    expect(env.MISE_CONFIG_DIR).toContain(runtimeRoot);
    expect(env.MISE_CONFIG_DIR).not.toContain("/Users/someone/.config/mise");
    expect(env.MISE_YES).toBe("1");
  });

  it("requires runtimeRoot", async () => {
    const { buildEngineeringToolEnv } = await loadAg9();
    expect(() =>
      buildEngineeringToolEnv({ runtimeRoot: "" as unknown as string }),
    ).toThrow(/runtimeRoot/);
  });
});
