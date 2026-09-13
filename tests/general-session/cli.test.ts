/**
 * Phase 5G — the product surface at the prompt.
 *
 * 5G-M  a natural-language line is an engineering task, and it reaches the
 *       General Session with the operator's own words and this directory
 * 5G-AF `/recover <id>` routes to the recovery command; a missing or malformed
 *       id is a usage message, not a session
 */

import { Readable, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { importHost } from "./helpers.js";

/**
 * A TTY double that types the next line only once the REPL has redrawn its
 * prompt, which is how a person uses it and the only way readline hands each
 * line to the reader that asked for it.
 */
function createReplTty(lines: string[]) {
  const queue = [...lines];
  const chunks: string[] = [];

  const stdin = new Readable({ read() {} }) as Readable & {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode: (mode: boolean) => Readable;
  };
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = function setRawMode(mode: boolean) {
    this.isRaw = mode;
    return this;
  };

  const feedNext = () => {
    const next = queue.shift();
    if (next === undefined) {
      stdin.push(null);
      return;
    }
    setImmediate(() => stdin.push(`${next}\n`));
  };

  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      const text = String(chunk);
      chunks.push(text);
      if (text.endsWith("> ")) feedNext();
      callback();
    },
  }) as Writable & { isTTY: boolean; columns: number };
  stdout.isTTY = true;
  stdout.columns = 100;

  const stderr = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });

  return { stdin, stdout, stderr, output: () => chunks.join("") };
}

async function runRepl(
  lines: string[],
  testIo: Record<string, unknown>,
): Promise<{ exitCode: number; output: string }> {
  const { runPathcodeMain } = await importHost("../pathcode.mjs");
  const tty = createReplTty(lines);
  const exitCode = await runPathcodeMain(["--model", "gpt-test-fixture-model"], {
    stdin: tty.stdin,
    stdout: tty.stdout,
    stderr: tty.stderr,
    ...testIo,
  });
  return { exitCode, output: tty.output() };
}

describe("5G-M: a plain line at the prompt is an engineering task", () => {
  it("5G-M: routes the operator's words to the PATH engineering session", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const task = "Fix the failing authentication test without changing the public API.";
    const { exitCode } = await runRepl([task, "/exit"], {
      runAg1Session: async (_prompt: unknown, options: Record<string, unknown>) => {
        seen.push(options);
        return { exitCode: 0, outcome: "VERIFIED", engineActivityCount: 1 };
      },
    });

    expect(exitCode).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.taskText).toBe(task);
    expect(seen[0]!.projectRoot).toBe(process.cwd());
  });

  it("5G-M: an unknown slash command is not treated as a task", async () => {
    let called = false;
    const { output } = await runRepl(["/nonsense", "/exit"], {
      runAg1Session: async () => {
        called = true;
        return { exitCode: 0 };
      },
    });
    expect(called).toBe(false);
    expect(output).toContain("Unknown command: /nonsense");
  });
});

describe("5G-AF: /recover routes to the recovery command", () => {
  it("5G-AF: passes the parsed checkpoint id and this directory", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const { exitCode } = await runRepl(["/recover mc-1a2b3c4d", "/exit"], {
      runRecover: async (_prompt: unknown, options: Record<string, unknown>) => {
        seen.push(options);
        return { exitCode: 0, outcome: "RECOVERY_COMPLETE" };
      },
    });
    expect(exitCode).toBe(0);
    expect(seen[0]!.checkpointId).toBe("mc-1a2b3c4d");
    expect(seen[0]!.projectRoot).toBe(process.cwd());
  });

  it("5G-AF: a missing or path-like id is a usage message and the prompt stays open", async () => {
    let called = false;
    const { output } = await runRepl(["/recover", "/recover ../escape", "/exit"], {
      runRecover: async () => {
        called = true;
        return { exitCode: 0 };
      },
    });
    expect(called).toBe(false);
    expect(output).toContain("Usage: /recover <checkpoint-id>");
    expect(output).toContain("That is not a checkpoint id");
    expect(output).toContain("Goodbye.");
  });
});

describe("5G-M / 5G-AF: help and welcome describe what the prompt accepts", () => {
  it("5G-M: help lists natural-language tasks alongside the commands", async () => {
    const { renderHelpText } = await importHost("banner.mjs");
    const help = renderHelpText({ unicode: true, plain: false });
    expect(help).toMatch(/engineering/i);
    expect(help).toContain("pathcode --issue");
    expect(help).toContain("pathcode doctor");
    expect(help).toContain("/help");
    expect(help).toContain("/exit");
    expect(help).toContain("path/task-");
    expect(help).not.toMatch(/GC1|Antigravity|AG3|AG4/i);
  });

  it("5G-AF: the welcome screen describes isolated engineering + independent validation", async () => {
    const { renderWelcomeScreen } = await importHost("banner.mjs");
    const welcome = renderWelcomeScreen({ columns: 100, unicode: true, plain: false });
    expect(welcome).toContain("Describe an engineering task in your own words");
    expect(welcome).toContain("/recover <id>");
    expect(welcome).toContain("PATH creates an isolated task workspace");
    expect(welcome).toContain("PATH independently validates the final result");
  });
});
