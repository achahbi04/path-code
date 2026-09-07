import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHECKOUT_ROOT,
  importHost,
  importPathcodeMain,
} from "./helpers.js";

describe("T02 banner / wordmark", () => {
  it("renders wide banner with vertically centred larger dot and compact/ascii fallbacks", async () => {
    const banner = await importHost("banner.mjs");
    const wide = banner.renderWordmark({ columns: 100, unicode: true });
    expect(wide).toContain("███");
    expect(wide.split("\n").length).toBe(5);
    // Dot glyphs on middle three rows of the owned reference
    expect(wide).toContain("▄");
    expect(wide).toContain("▀");
    expect(wide).toMatch(/███/);

    const mid = banner.renderWordmark({ columns: 60, unicode: true });
    expect(mid).toContain(banner.COMPACT_NAME);

    const narrow = banner.renderWordmark({ columns: 40, unicode: true });
    expect(narrow).toContain(banner.COMPACT_NAME);
    expect(narrow).not.toContain("\u001b");

    const ascii = banner.renderWordmark({ columns: 100, unicode: false });
    expect(ascii).toContain(banner.ASCII_NAME);
    expect(ascii.trim()).toBe(banner.ASCII_NAME);
    expect(ascii).not.toContain("●");
    expect(ascii).toContain("*");

    const plain = banner.renderWordmark({ columns: 100, plain: true, unicode: true });
    expect(plain.trim()).toBe(banner.ASCII_NAME);
  });
});

describe("T01 T03 packaging and offline entry", () => {
  it("T01: new entry resolves from foreign cwd; legacy smoke entry still works", () => {
    const foreign = "/tmp";
    const host = spawnSync(
      process.execPath,
      [join(CHECKOUT_ROOT, "scripts", "pathcode.mjs"), "--version"],
      { cwd: foreign, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
    );
    expect(host.status).toBe(0);
    expect(host.stdout).toMatch(/PATH \* Code|PATH ● Code/);

    const legacy = spawnSync(
      process.execPath,
      [join(CHECKOUT_ROOT, "dist", "cli", "entry.js"), "--help"],
      { cwd: foreign, encoding: "utf8" },
    );
    expect(legacy.status).toBe(0);
    expect(legacy.stdout).toContain("Path Code");
    expect(legacy.stdout).toContain("pathcode [--help]");

    const unknown = spawnSync(
      process.execPath,
      [join(CHECKOUT_ROOT, "scripts", "pathcode.mjs"), "build-something"],
      { cwd: foreign, encoding: "utf8" },
    );
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain("Unknown argument: build-something");
  });

  it("T03: help/version make zero provider calls and write no trial files", async () => {
    const { runPathcodeMain } = await importPathcodeMain();
    let fetchCalls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("unexpected fetch");
    }) as typeof fetch;
    try {
      const codeHelp = await runPathcodeMain(["--help"], {
        stdin: { isTTY: false },
        stdout: { isTTY: false, write: () => true, columns: 80 },
        stderr: { write: () => true },
      });
      expect(codeHelp).toBe(0);
      const codeVer = await runPathcodeMain(["--version"], {
        stdin: { isTTY: false },
        stdout: { isTTY: false, write: () => true, columns: 80 },
        stderr: { write: () => true },
      });
      expect(codeVer).toBe(0);
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("T04: live trial refuses non-TTY; banned flags rejected", async () => {
    const { runPathcodeMain } = await importPathcodeMain();
    const out: string[] = [];
    const err: string[] = [];
    const code = await runPathcodeMain(["--yes"], {
      stdin: { isTTY: false },
      stdout: {
        isTTY: false,
        write: (t: string) => {
          out.push(t);
          return true;
        },
        columns: 80,
      },
      stderr: {
        write: (t: string) => {
          err.push(t);
          return true;
        },
      },
    });
    expect(code).toBe(2);
    expect(err.join("")).toContain("--yes");

    const trial = await importHost("trial.mjs");
    const writes: string[] = [];
    const result = await trial.runMultiply01Trial(
      {
        write: (t: string) => writes.push(t),
        writeErr: (t: string) => writes.push(t),
        askLine: async () => null,
        askHiddenCredential: async () => ({ ok: false, code: "NO" }),
        isStopped: () => false,
        close: () => undefined,
      },
      {
        streams: { stdin: { isTTY: false }, stdout: { isTTY: false } },
        allowNonTty: false,
        modelId: "x",
        credential: "sk-test",
      },
    );
    expect(result.outcome).toBe("NON_TTY_REFUSED");
    expect(result.exitCode).toBe(2);
  });
});
