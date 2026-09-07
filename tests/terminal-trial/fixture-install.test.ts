import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CHECKOUT_ROOT,
  cleanupTrackedTrialRoots,
  importHost,
  importInstallHelper,
  tscJsPath,
  trackTrialRoot,
} from "./helpers.js";

afterEach(async () => {
  await cleanupTrackedTrialRoots();
});

describe("T07 fixture provisioning", () => {
  it("provisions one unique synthetic workspace with defective seed; no overwrite", async () => {
    const store = await importHost("fixture-store.mjs");
    expect(store.seedSourceIsDefectiveProduct()).toBe(true);
    const a = await store.provisionMultiply01Workspace();
    expect(a.ok).toBe(true);
    trackTrialRoot(a.root);
    const b = await store.provisionMultiply01Workspace();
    expect(b.ok).toBe(true);
    trackTrialRoot(b.root);
    expect(a.root).not.toBe(b.root);
    expect(a.root).not.toBe(CHECKOUT_ROOT);
    const source = await readFile(join(a.root, "src/calculator.ts"), "utf8");
    expect(source).toBe(store.SEED_CALCULATOR_SOURCE);
    expect(source).toContain("return a + b");
    expect(source).not.toContain("return a * b");
  });
});

describe("T21 offline seed fails regression", () => {
  it("unchanged seed fails real tsc+regression; fixed source passes", async () => {
    const store = await importHost("fixture-store.mjs");
    const seeded = await store.provisionMultiply01Workspace();
    expect(seeded.ok).toBe(true);
    trackTrialRoot(seeded.root);

    const tsc = tscJsPath();
    const compileSeed = spawnSync(
      process.execPath,
      [tsc, "-p", join(seeded.root, "tsconfig.json")],
      { cwd: seeded.root, encoding: "utf8", env: { LANG: "C" } },
    );
    expect(compileSeed.status).toBe(0);

    const failReg = spawnSync(
      process.execPath,
      [join(seeded.root, "tests", "calculator.test.cjs")],
      { cwd: seeded.root, encoding: "utf8", env: { LANG: "C" } },
    );
    expect(failReg.status).not.toBe(0);

    await writeFile(
      join(seeded.root, "src/calculator.ts"),
      store.FIXED_CALCULATOR_SOURCE,
      "utf8",
    );
    const compileFix = spawnSync(
      process.execPath,
      [tsc, "-p", join(seeded.root, "tsconfig.json")],
      { cwd: seeded.root, encoding: "utf8", env: { LANG: "C" } },
    );
    expect(compileFix.status).toBe(0);
    const passReg = spawnSync(
      process.execPath,
      [join(seeded.root, "tests", "calculator.test.cjs")],
      { cwd: seeded.root, encoding: "utf8", env: { LANG: "C" } },
    );
    expect(passReg.status).toBe(0);
  });
});

describe("T26 installer under disposable home", () => {
  it("--check read-only; --install idempotent; collision refuses", async () => {
    const { runInstallPathcodeLocal } = await importInstallHelper();
    const home = await mkdtemp(join(tmpdir(), "pathcode-install-home-"));
    trackTrialRoot(home);

    const check1 = await runInstallPathcodeLocal({
      home,
      argv: ["--check"],
    });
    expect(check1).toBe(1);

    const install1 = await runInstallPathcodeLocal({
      home,
      argv: ["--install"],
    });
    expect(install1).toBe(0);

    const check2 = await runInstallPathcodeLocal({
      home,
      argv: ["--check"],
    });
    expect(check2).toBe(0);

    const install2 = await runInstallPathcodeLocal({
      home,
      argv: ["--install"],
    });
    expect(install2).toBe(0); // idempotent

    // Collision: replace link with a regular file via a different home path collision
    const collideHome = await mkdtemp(join(tmpdir(), "pathcode-install-collide-"));
    trackTrialRoot(collideHome);
    const binDir = join(collideHome, ".local", "bin");
    await mkdir(binDir, { recursive: true });
    await writeFile(join(binDir, "pathcode"), "not-a-link", "utf8");
    const refused = await runInstallPathcodeLocal({
      home: collideHome,
      argv: ["--install"],
    });
    expect(refused).toBe(1);
  });
});

describe("T12 display escaping", () => {
  it("escapes ESC/OSC/CR/tab/BOM/bidi without altering approved bytes", async () => {
    const esc = await importHost("escape.mjs");
    const raw =
      "line\u001b]8;;http://evil\u0007x\r\n\tover\uFEFF\u202Ewreck";
    const shown = esc.escapeForTerminalDisplay(raw);
    expect(shown).toContain("\\u001b");
    expect(shown).toContain("\\r");
    expect(shown).toContain("\\t");
    expect(shown).toContain("\\ufeff");
    expect(shown).toContain("\\u202e");
    expect(shown).not.toContain("\u001b");
    const prefixed = esc.prefixUntrustedLines("APPLY deadbeef\nsecret");
    expect(prefixed.startsWith("| ")).toBe(true);
    expect(prefixed).toContain("| APPLY deadbeef");
  });
});

describe("T05 T06 consent and child-env predicates", () => {
  it("START/APPLY/CHECK exact match; env excludes secrets", async () => {
    const terminal = await importHost("terminal.mjs");
    expect(terminal.acceptsStartConsent("START abc", "abc")).toBe(true);
    expect(terminal.acceptsStartConsent("start abc", "abc")).toBe(false);
    expect(terminal.acceptsStartConsent("START abc extra", "abc")).toBe(false);
    expect(terminal.acceptsStartConsent("YES abc", "abc")).toBe(false);
    expect(terminal.acceptsApplyConfirmation("APPLY zz", "zz")).toBe(true);
    expect(terminal.acceptsApplyConfirmation("APPLY other", "zz")).toBe(false);

    const childEnv = await importHost("child-env.mjs");
    const env = childEnv.buildTrialChildEnvironment({
      OPENAI_API_KEY: "sk-secret",
      NODE_OPTIONS: "--require evil",
      LANG: "en_US.UTF-8",
      PATHCODE_LIVE_OPENAI: "1",
    });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.PATHCODE_LIVE_OPENAI).toBeUndefined();
    expect(env.LANG).toBe("en_US.UTF-8");
    expect(
      childEnv.trialChildEnvironmentExcludesSecrets(env),
    ).toBe(true);
  });
});
