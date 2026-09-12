/**
 * AG3 focused proofs — three roots, runtime lock, terminal restore,
 * alternate-screen renderer, noninteractive guards.
 */

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  mkdtempSync,
  symlinkSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(CHECKOUT_ROOT, "scripts/pathcode-cli");
const AG1 = join(CLI, "ag1");
const LEGACY_VENV = join(CHECKOUT_ROOT, ".path-code-tmp", "ag1-venv");

async function load(rel: string) {
  return import(`${pathToFileURL(join(CLI, rel)).href}?ag3=${randomUUID()}`);
}

async function loadAg1(rel: string) {
  return import(`${pathToFileURL(join(AG1, rel)).href}?ag3=${randomUUID()}`);
}

function prepareRuntimeRoot(runtimeRoot: string) {
  mkdirSync(runtimeRoot, { recursive: true });
  const venv = join(runtimeRoot, "ag1-venv");
  if (!existsSync(venv) && existsSync(LEGACY_VENV)) {
    symlinkSync(LEGACY_VENV, venv);
  }
  writeFileSync(
    join(runtimeRoot, "runtime.marker.json"),
    JSON.stringify(
      {
        pathVersion: "0.1.0",
        sdkPin: "google-antigravity==0.1.16",
        venv,
      },
      null,
      2,
    ),
    "utf8",
  );
  return venv;
}

describe("AG3 three-root law", () => {
  it("package root resolves from module location", async () => {
    const { resolvePathPackageRoot, resolveTargetProjectRoot } = await load(
      "paths.mjs",
    );
    const pkg = resolvePathPackageRoot();
    expect(pkg).toBe(CHECKOUT_ROOT);
    expect(existsSync(join(pkg, "package.json"))).toBe(true);
    const probe = resolveTargetProjectRoot(CHECKOUT_ROOT);
    expect(probe.ok).toBe(true);
    if (probe.ok) expect(probe.projectRoot).toBeTruthy();
  });

  it("PATHCODE_RUNTIME_ROOT override is honored and distinct from package assets", async () => {
    const runtimeRoot = join(tmpdir(), `ag3-runtime-${randomUUID()}`);
    process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
    try {
      const { resolvePathRuntimeRoot, resolvePathPackageRoot } = await load(
        "paths.mjs",
      );
      const rt = resolvePathRuntimeRoot();
      expect(rt).toBe(runtimeRoot);
      expect(rt).not.toBe(resolvePathPackageRoot());
    } finally {
      delete process.env.PATHCODE_RUNTIME_ROOT;
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });
});

describe("AG3 runtime bootstrap lock", () => {
  it("two concurrent ensureAg1Runtime calls share one healthy runtime", async () => {
    const runtimeRoot = join(
      CHECKOUT_ROOT,
      ".path-code-tmp",
      `ag3-boot-${randomUUID()}`,
    );
    mkdirSync(runtimeRoot, { recursive: true });
    // Seed from legacy venv so we do not need network pip in CI.
    prepareRuntimeRoot(runtimeRoot);
    // Delete marker so both think bootstrap is needed, but venv exists.
    rmSync(join(runtimeRoot, "runtime.marker.json"), { force: true });

    process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
    try {
      const { ensureAg1Runtime } = await loadAg1("runtime-bootstrap.mjs");
      const [a, b] = await Promise.all([
        ensureAg1Runtime({ packageRoot: CHECKOUT_ROOT, runtimeRoot }),
        ensureAg1Runtime({ packageRoot: CHECKOUT_ROOT, runtimeRoot }),
      ]);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(existsSync(join(runtimeRoot, "runtime.marker.json"))).toBe(true);
      expect(existsSync(join(runtimeRoot, "ag1-venv"))).toBe(true);
    } finally {
      delete process.env.PATHCODE_RUNTIME_ROOT;
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("AG3 terminal restore", () => {
  it("restoreTerminal is idempotent and emits show-cursor + exit-alt + reset", async () => {
    const { restoreTerminal, TERMINAL_SEQ } = await load(
      "terminal-restore.mjs",
    );
    let out = "";
    const stdout = {
      write(chunk: string) {
        out += chunk;
        return true;
      },
    } as unknown as NodeJS.WriteStream;
    let raw = true;
    const stdin = {
      isTTY: true,
      setRawMode(v: boolean) {
        raw = v;
      },
    } as unknown as NodeJS.ReadStream;
    restoreTerminal({ stdout, stdin });
    restoreTerminal({ stdout, stdin });
    expect(raw).toBe(false);
    expect(out.includes(TERMINAL_SEQ.SHOW_CURSOR)).toBe(true);
    expect(out.includes(TERMINAL_SEQ.EXIT_ALT)).toBe(true);
    expect(out.includes(TERMINAL_SEQ.RESET_GRAPHICS)).toBe(true);
  });

  it("alternate-screen renderer enters and exits alt buffer", async () => {
    const { createInlineStudioRenderer } = await load("inline-studio.mjs");
    let out = "";
    const stdout = {
      isTTY: true,
      rows: 40,
      columns: 120,
      write(chunk: string) {
        out += chunk;
        return true;
      },
      on() {},
      off() {},
    };
    const renderer = createInlineStudioRenderer({
      stdout: stdout as any,
      enabled: true,
      alternateScreen: true,
    });
    renderer.begin();
    renderer.onEvent({
      type: "session.task.received",
      taskId: "t1",
      preview: "demo",
    });
    renderer.finish();
    expect(out.includes("\u001b[?1049h")).toBe(true);
    expect(out.includes("\u001b[?1049l")).toBe(true);
    expect(out.includes("\u001b[?25h")).toBe(true);
  });
});

describe("AG3 noninteractive guards", () => {
  it("blocks known interactive commands", async () => {
    const { detectInteractiveCommandBlock, buildNoninteractiveEngineeringEnv } =
      await loadAg1("noninteractive-env.mjs");
    expect(detectInteractiveCommandBlock("python -i").blocked).toBe(true);
    expect(detectInteractiveCommandBlock("npm test").blocked).toBe(false);
    const env = buildNoninteractiveEngineeringEnv({
      PATH: "/usr/bin",
      CI: "true",
    } as NodeJS.ProcessEnv);
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.PATHCODE_NONINTERACTIVE).toBe("1");
    // Must not invent CI when absent — but may preserve caller CI.
    expect(env.CI).toBe("true");
    const env2 = buildNoninteractiveEngineeringEnv({
      PATH: "/usr/bin",
    } as NodeJS.ProcessEnv);
    expect(env2.CI).toBeUndefined();
  });
});

describe("AG3 package bin", () => {
  it("package.json exposes pathcode bin to scripts/pathcode.mjs", () => {
    const pkg = JSON.parse(
      readFileSync(join(CHECKOUT_ROOT, "package.json"), "utf8"),
    );
    expect(pkg.bin.pathcode).toBe("./scripts/pathcode.mjs");
    const entry = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode.mjs"),
      "utf8",
    );
    expect(entry.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("pathcode --version works via node entry without cwd package root", () => {
    const scratch = mkdtempSync(join(tmpdir(), "ag3-pathcode-"));
    try {
      spawnSync("git", ["init"], { cwd: scratch, encoding: "utf8" });
      spawnSync("git", ["config", "user.email", "ag3@example.com"], {
        cwd: scratch,
      });
      spawnSync("git", ["config", "user.name", "AG3"], { cwd: scratch });
      writeFileSync(join(scratch, "README.md"), "x\n");
      spawnSync("git", ["add", "."], { cwd: scratch });
      spawnSync("git", ["commit", "-m", "init"], { cwd: scratch });
      const r = spawnSync(
        process.execPath,
        [join(CHECKOUT_ROOT, "scripts/pathcode.mjs"), "--version"],
        { cwd: scratch, encoding: "utf8", env: process.env },
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/PATH/);
      expect(r.stdout).toMatch(/0\.1\.0/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe("AG3 narrow + non-TTY + cancel wiring", () => {
  it("narrow AG1 layout stays PROJECT|PATH|EVIDENCE framed cockpit", async () => {
    const { createEmptyStudioState, applyStudioEvent } = await import(
      `${pathToFileURL(join(CHECKOUT_ROOT, "scripts/path-studio/state.mjs")).href}?n=${randomUUID()}`
    );
    const { buildInlineCardLines } = await load("inline-studio.mjs");
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.task.received",
      mode: "ag1",
      preview: "x",
    });
    applyStudioEvent(state, {
      type: "session.engineering.activity",
      label: "Inspecting",
    });
    const narrow = buildInlineCardLines(state, { rows: 24, columns: 40 });
    const text = narrow.join("\n");
    expect(text).toContain("PATH ● Code");
    expect(text).toContain("PROJECT");
    expect(text).toContain("PATH");
    expect(text).toContain("EVIDENCE");
    expect(text).toContain("╭");
    expect(text).not.toContain("PATH STUDIO");
  });

  it("non-TTY renderer emits plain lifecycle text without alt-screen", async () => {
    const { createInlineStudioRenderer } = await load("inline-studio.mjs");
    const plain: string[] = [];
    const stdout = {
      isTTY: false,
      write(chunk: string) {
        plain.push(String(chunk));
        return true;
      },
    };
    const renderer = createInlineStudioRenderer({
      stdout: stdout as any,
      enabled: false,
      writePlain: (t: string) => plain.push(t),
    });
    renderer.begin();
    renderer.onEvent({
      type: "session.engineering.activity",
      activity: "inspecting",
      label: "Inspecting",
    });
    renderer.onEvent({
      type: "session.terminal",
      disposition: "VERIFIED",
      summary: "ok",
    });
    renderer.finish();
    const joined = plain.join("");
    expect(joined).not.toContain("\u001b[?1049h");
    expect(joined.length).toBeGreaterThan(0);
  });

  it("prompt requestCycleCancel is visible to AG1 cancel poll", async () => {
    const { PassThrough } = await import("node:stream");
    const { createPromptSession } = await load("terminal.mjs");
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const prompt = createPromptSession({
      stdin: stdin as any,
      stdout: stdout as any,
    });
    prompt.beginCycle();
    expect(prompt.isCycleCancelRequested()).toBe(false);
    expect(prompt.requestCycleCancel()).toBe(true);
    expect(prompt.isCycleCancelRequested()).toBe(true);
    prompt.endCycle();
    expect(prompt.isCycleCancelRequested()).toBe(false);
    prompt.close();
    stdin.end();
  });

  it("burst alt-screen events coalesce (write count << event count)", async () => {
    const { createInlineStudioRenderer } = await load("inline-studio.mjs");
    let writes = 0;
    const stdout = {
      isTTY: true,
      rows: 40,
      columns: 120,
      write() {
        writes += 1;
        return true;
      },
      on() {},
      off() {},
    };
    const renderer = createInlineStudioRenderer({
      stdout: stdout as any,
      enabled: true,
      alternateScreen: true,
    });
    renderer.begin();
    for (let i = 0; i < 40; i += 1) {
      renderer.onEvent({
        type: "session.engineering.activity",
        activity: "inspecting",
        label: `Inspecting-${i}`,
      });
    }
    // Allow coalesce timer to flush.
    await new Promise((r) => setTimeout(r, 80));
    renderer.finish();
    expect(writes).toBeLessThan(40);
    expect(writes).toBeGreaterThan(0);
  });
});
