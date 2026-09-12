/**
 * Phase PS1-INLINE — single-terminal in-place Path Studio cards (PI-A…L + P1).
 *
 * Deterministic / scripted events. Zero live providers. Zero credentials.
 * Engine src/** untouched.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { afterAll, describe, expect, it } from "vitest";

import { CHECKOUT_ROOT, cleanupTrackedRoots } from "../general-session/helpers.js";

afterAll(() => {
  cleanupTrackedRoots();
});

const FIXTURES = join(CHECKOUT_ROOT, "tests/path-studio/fixtures");
const INLINE = join(CHECKOUT_ROOT, "scripts/pathcode-cli/inline-studio.mjs");
const SESSION_EVENTS = join(CHECKOUT_ROOT, "scripts/pathcode-cli/session-events.mjs");
const EVENTS_OUT = join(CHECKOUT_ROOT, "scripts/pathcode-cli/events-out.mjs");
const PATHCODE = join(CHECKOUT_ROOT, "scripts/pathcode.mjs");
const STUDIO_STATE = join(CHECKOUT_ROOT, "scripts/path-studio/state.mjs");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function parseNdjson(text: string): Record<string, unknown>[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function tmpPath(label: string): string {
  const dir = join(tmpdir(), `pathcode-ps1-inline-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${label}-${randomUUID()}.ndjson`);
}

class FakeTtyStdout extends EventEmitter {
  isTTY = true;
  rows: number;
  columns: number;
  chunks: string[] = [];
  writeCount = 0;

  constructor(rows = 40, columns = 100) {
    super();
    this.rows = rows;
    this.columns = columns;
  }

  write(chunk: string | Buffer): boolean {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    this.chunks.push(text);
    this.writeCount += 1;
    return true;
  }

  text(): string {
    return this.chunks.join("");
  }

  resize(rows: number, columns: number): void {
    this.rows = rows;
    this.columns = columns;
    this.emit("resize");
  }
}

describe("PS1-INLINE SRC allowlist + wiring", () => {
  it("src diff stays within GC1-c seams; inline module is wired without servers", async () => {
    const { execSync } = await import("node:child_process");
    const diff = execSync("git diff HEAD -- src/", {
      cwd: CHECKOUT_ROOT,
      encoding: "utf8",
    });
    // PS1-INLINE itself must not invent new src surfaces. GC1-c may touch the
    // authorized provider-neutral seams listed here (same floor as GC1 lifecycle).
    const allowedSrcPrefixes = [
      "src/execution/",
      "src/editing/host-dependencies.ts",
      "src/orchestrator/mutation/",
      "src/scope/",
    ];
    const touched = diff
      .split("\n")
      .filter((l) => l.startsWith("diff --git "))
      .map((l) => {
        const m = l.match(/b\/(.+)$/);
        return m ? m[1] : "";
      })
      .filter(Boolean);
    for (const path of touched) {
      if (path === undefined || path === "") continue;
      const ok = allowedSrcPrefixes.some(
        (p) => path === p || path.startsWith(p),
      );
      expect(ok, `unexpected src change: ${path}`).toBe(true);
    }

    const pathcode = readFileSync(PATHCODE, "utf8");
    const inline = readFileSync(INLINE, "utf8");
    expect(pathcode).toContain("createInlineStudioRenderer");
    expect(pathcode).toContain("installCollisionGuard");
    expect(pathcode).toContain("cardsOwnProgress");
    expect(inline).not.toMatch(/createServer|WebSocket|fs\.watch|net\.|listen\(/);
    expect(inline).toContain("ERASE_BELOW");
    expect(inline).toContain("SHOW_CURSOR");
    expect(inline).toContain('off("resize"');
    expect(inline).toContain("\\u001b[J");
    expect(inline).toContain("\\u001b[?25h");
  });
});

describe("PI-A / PI-B in-place TTY updates", () => {
  it("PI-A: accepted cycle updates a bounded region with cursor/clear-line; no per-event reprint stack", async () => {
    const { createInlineStudioRenderer, assembleAnsiFrame } = await import(
      `${INLINE}?pia=${Date.now()}`
    );
    const stdout = new FakeTtyStdout(40, 100);
    const renderer = createInlineStudioRenderer({ stdout, enabled: true });
    renderer.begin();
    const events = parseNdjson(loadFixture("accepted-cycle.ndjson"));
    for (const event of events) {
      renderer.onEvent(event);
    }
    const stats = renderer.stats();
    expect(stats.writeCount).toBe(events.length);
    const joined = stdout.text();
    expect(joined).toContain("\u001b[2K"); // clear-line
    expect(joined).toMatch(/\u001b\[\d+A/); // cursor-up after first frame
    expect(joined).toContain("Gate 2");
    expect(joined).toContain("accepted");
    // Not a fresh unbounded stack of "PATH ● Code" headers without cursor-up.
    const headers = joined.split("PATH ● Code").length - 1;
    expect(headers).toBe(events.length);
    // After first frame, subsequent frames use cursor-up (in-place).
    const upCount = (joined.match(/\u001b\[\d+A/g) ?? []).length;
    expect(upCount).toBeGreaterThanOrEqual(events.length - 1);
    renderer.finish();
    void assembleAnsiFrame;
  });

  it("PI-B: event N updates card N before event N+1 (live, not end-batch)", async () => {
    const { createInlineStudioRenderer } = await import(`${INLINE}?pib=${Date.now()}`);
    const stdout = new FakeTtyStdout(40, 100);
    const renderer = createInlineStudioRenderer({ stdout, enabled: true });
    renderer.begin();
    const events = parseNdjson(loadFixture("accepted-cycle.ndjson"));
    const gate1Idx = events.findIndex((e) => e.type === "session.gate1");
    expect(gate1Idx).toBeGreaterThan(0);
    for (let i = 0; i < gate1Idx; i += 1) {
      renderer.onEvent(events[i]!);
    }
    expect(renderer.getState().cards.gate1.arrived).toBe(false);
    expect(stdout.text()).not.toMatch(/Gate 1: grounded/);
    const writesBefore = renderer.stats().writeCount;
    renderer.onEvent(events[gate1Idx]!);
    expect(renderer.getState().cards.gate1.arrived).toBe(true);
    expect(renderer.stats().writeCount).toBe(writesBefore + 1);
    expect(stdout.text()).toMatch(/Gate 1/);
    expect(renderer.getState().cards.gate2.arrived).toBe(false);
    renderer.finish();
  });
});

describe("PI-C anti-decoration + P1", () => {
  it("PI-C: missing gate2 stays not-reached; skipped validation shows skipped", async () => {
    const { createInlineStudioRenderer } = await import(`${INLINE}?pic=${Date.now()}`);
    const stdout = new FakeTtyStdout(40, 100);
    const renderer = createInlineStudioRenderer({ stdout, enabled: true });
    renderer.begin();
    for (const event of parseNdjson(loadFixture("missing-gate2.ndjson"))) {
      renderer.onEvent(event);
    }
    const state = renderer.getState();
    expect(state.cards.gate2.arrived).toBe(false);
    expect(state.cards.gate2.status).toBe("pending");
    expect(stdout.text()).not.toMatch(/Gate 2: accepted/);
    renderer.finish();

    const stdout2 = new FakeTtyStdout(40, 100);
    const renderer2 = createInlineStudioRenderer({ stdout: stdout2, enabled: true });
    renderer2.begin();
    for (const event of parseNdjson(loadFixture("validation-skipped.ndjson"))) {
      renderer2.onEvent(event);
    }
    expect(renderer2.getState().cards.validationSkipped.status).toBe("skipped");
    expect(stdout2.text()).toMatch(/\[~\] Validation skipped/);
    expect(stdout2.text()).not.toMatch(/Validation running: (?!not yet)/);
    renderer2.finish();
  });

  it("P1: decorateGate2Accepted falsifies PI-C; restore by omitting the hook", async () => {
    const src = readFileSync(STUDIO_STATE, "utf8");
    const beforeHash = createHash("sha256").update(src).digest("hex");
    const { createInlineStudioRenderer } = await import(`${INLINE}?p1=${Date.now()}`);
    const stdout = new FakeTtyStdout(40, 100);
    const weak = createInlineStudioRenderer({
      stdout,
      enabled: true,
      decorateGate2Accepted: true,
    });
    weak.begin();
    for (const event of parseNdjson(loadFixture("missing-gate2.ndjson"))) {
      weak.onEvent(event);
    }
    // Fabricated accepted — this is the intentional falsification.
    expect(weak.getState().cards.gate2.arrived).toBe(true);
    expect(weak.getState().cards.gate2.detail).toBe("accepted");
    weak.finish();

    // Honest path (no decorate hook) must still refuse fabrication.
    const honestOut = new FakeTtyStdout(40, 100);
    const honest = createInlineStudioRenderer({ stdout: honestOut, enabled: true });
    honest.begin();
    for (const event of parseNdjson(loadFixture("missing-gate2.ndjson"))) {
      honest.onEvent(event);
    }
    expect(honest.getState().cards.gate2.arrived).toBe(false);
    honest.finish();

    const afterHash = createHash("sha256")
      .update(readFileSync(STUDIO_STATE, "utf8"))
      .digest("hex");
    expect(afterHash).toBe(beforeHash);
  });
});

describe("PI-D non-TTY fallback", () => {
  it("PI-D: non-TTY emits plain lines, no ANSI cursor codes", async () => {
    const { createInlineStudioRenderer } = await import(`${INLINE}?pid=${Date.now()}`);
    const chunks: string[] = [];
    const stdout = {
      isTTY: false,
      write(s: string) {
        chunks.push(s);
        return true;
      },
    };
    const renderer = createInlineStudioRenderer({ stdout, enabled: false });
    renderer.begin();
    for (const event of parseNdjson(loadFixture("accepted-cycle.ndjson"))) {
      renderer.onEvent(event);
    }
    const text = chunks.join("");
    expect(text).not.toMatch(/\u001b\[/);
    expect(text).toContain("Gate 1: grounded");
    expect(text).toContain("Gate 2: accepted");
    renderer.finish();
  });
});

describe("PI-E R2-K resize teardown + cursor restore", () => {
  it("PI-E: resize listener detached and cursor restored on finish and between cycles", async () => {
    const { createInlineStudioRenderer } = await import(`${INLINE}?pie=${Date.now()}`);
    const stdout = new FakeTtyStdout(40, 100);
    const renderer = createInlineStudioRenderer({ stdout, enabled: true });
    renderer.begin();
    expect(renderer.stats().hasResizeListener).toBe(true);
    renderer.onEvent({
      type: "session.task.received",
      sessionId: "pie",
      task: "x",
      ts: 1,
    });
    expect(stdout.text()).toContain("\u001b[?25l");
    renderer.finish();
    expect(renderer.stats().hasResizeListener).toBe(false);
    expect(stdout.text()).toContain("\u001b[?25h");
    expect(stdout.listenerCount("resize")).toBe(0);

    // Second cycle: one listener only while active, none after.
    renderer.begin();
    expect(stdout.listenerCount("resize")).toBe(1);
    renderer.onEvent({
      type: "session.cancelled",
      sessionId: "pie",
      ts: 2,
    });
    renderer.finish();
    expect(stdout.listenerCount("resize")).toBe(0);
    expect(renderer.stats().hasResizeListener).toBe(false);

    // Heartbeat controller still clears timers (R2-K interstitial).
    const { createHeartbeatController } = await import(`${SESSION_EVENTS}?pie=${Date.now()}`);
    const timers: Array<ReturnType<typeof setInterval>> = [];
    const hb = createHeartbeatController({
      emit: () => {},
      intervalMs: 20,
      setIntervalFn: (fn: () => void, ms: number) => {
        const t = setInterval(fn, ms);
        timers.push(t);
        return t;
      },
      clearIntervalFn: (t: ReturnType<typeof setInterval>) => {
        clearInterval(t);
        const idx = timers.indexOf(t);
        if (idx >= 0) timers.splice(idx, 1);
      },
    });
    hb.begin("reasoning");
    hb.stop();
    expect(timers).toHaveLength(0);
  });
});

describe("PI-F ndjson seam retained", () => {
  it("PI-F: --events-out still writes identical safe event objects", async () => {
    const { openEventsOutSink } = await import(`${EVENTS_OUT}?pif=${Date.now()}`);
    const { createSessionEventSink, parseSessionEventNdjson } = await import(
      `${SESSION_EVENTS}?pif=${Date.now()}`
    );
    const path = tmpPath("pif");
    const sinkFile = openEventsOutSink(path);
    const sink = createSessionEventSink({
      sessionId: "pif-sess",
      mode: "ndjson",
      writeNdjson: (line: string) => sinkFile.writeLine(line),
    });
    sink.emit("session.task.received", { task: "hello" });
    sink.emit("session.gate2", { status: "accepted" });
    sinkFile.close();
    const parsed = parseSessionEventNdjson(readFileSync(path, "utf8"));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.sessionId).toBe("pif-sess");
    expect(parsed[0]!.task).toBe("hello");
    expect(JSON.stringify(parsed)).not.toMatch(/sk-|api[_-]?key|OPENAI/i);
    unlinkSync(path);
  });
});

describe("PI-G REVIEW/BOUNDED + regression surface", () => {
  it("PI-G: pathcode wires cardsOwnProgress; general-session honors the flag; fixtures render", async () => {
    const pathcode = readFileSync(PATHCODE, "utf8");
    const session = readFileSync(
      join(CHECKOUT_ROOT, "scripts/pathcode-cli/general-session.mjs"),
      "utf8",
    );
    expect(pathcode).toContain("cardsOwnProgress: ttyInline");
    expect(session).toContain("cardsOwnProgress");
    expect(session).toContain("function progress(");
    // Refused + accepted fixtures still reduce without fabrication.
    const { createInlineStudioRenderer } = await import(`${INLINE}?pig=${Date.now()}`);
    for (const name of ["accepted-cycle.ndjson", "refused-cycle.ndjson"] as const) {
      const stdout = new FakeTtyStdout(40, 100);
      const renderer = createInlineStudioRenderer({ stdout, enabled: true });
      renderer.begin();
      for (const event of parseNdjson(loadFixture(name))) {
        renderer.onEvent(event);
      }
      expect(renderer.getState().cards.terminal.arrived).toBe(true);
      renderer.finish();
    }
  });
});

describe("PI-H viewport clamp", () => {
  it("PI-H: small rows clamps height; resize adapts; non-active collapse", async () => {
    const { createInlineStudioRenderer, buildInlineCardLines } = await import(
      `${INLINE}?pih=${Date.now()}`
    );
    const stdout = new FakeTtyStdout(10, 80);
    const renderer = createInlineStudioRenderer({ stdout, enabled: true });
    renderer.begin();
    for (const event of parseNdjson(loadFixture("accepted-cycle.ndjson"))) {
      renderer.onEvent(event);
    }
    const lines = buildInlineCardLines(renderer.getState(), {
      rows: stdout.rows,
      columns: stdout.columns,
    });
    expect(lines.length).toBeLessThanOrEqual(stdout.rows - 2);
    // Active/terminal kept fuller; many cards collapsed or dropped.
    const fullDetailLines = lines.filter(
      (l: string) => l.includes(": ") && !l.startsWith("session:"),
    );
    expect(fullDetailLines.length).toBeLessThan(STUDIO_CARD_ORDER_LENGTH());

    stdout.resize(40, 80);
    const after = buildInlineCardLines(renderer.getState(), {
      rows: stdout.rows,
      columns: stdout.columns,
    });
    expect(after.length).toBeGreaterThan(lines.length);
    renderer.finish();
  });
});

function STUDIO_CARD_ORDER_LENGTH(): number {
  // Keep in sync with state.mjs card count without importing (stable).
  return 19;
}

describe("PI-I visual width", () => {
  it("PI-I: ANSI codes stripped for width; visible line never exceeds columns", async () => {
    const { visibleWidth, truncateVisible, fitLine, buildInlineCardLines } = await import(
      `${INLINE}?pii=${Date.now()}`
    );
    const colored = `\u001b[32m${"src/" + "very/".repeat(40)}long/path.ts\u001b[0m`;
    expect(visibleWidth(colored)).toBeLessThan(colored.length);
    const truncated = truncateVisible(colored, 40);
    expect(visibleWidth(truncated)).toBeLessThanOrEqual(40);
    const fitted = fitLine(colored, 50);
    expect(visibleWidth(fitted)).toBeLessThanOrEqual(50);

    const { createEmptyStudioState, applyStudioEvent } = await import(
      `${STUDIO_STATE}?pii=${Date.now()}`
    );
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.edit.summary",
      sessionId: "w",
      path: "a/".repeat(200) + "file.ts",
      beforeBytes: 1,
      afterBytes: 2,
      ts: 1,
    });
    const columns = 60;
    const lines = buildInlineCardLines(state, { rows: 40, columns });
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(columns);
    }
  });
});

describe("PI-J atomic write", () => {
  it("PI-J: exactly one stdout.write per event redraw", async () => {
    const { createInlineStudioRenderer } = await import(`${INLINE}?pij=${Date.now()}`);
    const stdout = new FakeTtyStdout(40, 100);
    const renderer = createInlineStudioRenderer({ stdout, enabled: true });
    renderer.begin();
    const before = stdout.writeCount;
    renderer.onEvent({
      type: "session.task.received",
      sessionId: "pij",
      task: "one",
      ts: 1,
    });
    expect(stdout.writeCount - before).toBe(1);
    renderer.onEvent({
      type: "session.preflight",
      sessionId: "pij",
      branch: "main",
      dirtySummary: "clean",
      ts: 2,
    });
    expect(stdout.writeCount - before).toBe(2);
    renderer.finish();
    // finish may write SHOW_CURSOR — that is not a redraw frame.
  });
});

describe("PI-K collision guard", () => {
  it("PI-K: stray diagnostic writes are suppressed; living frame stays coherent", async () => {
    const { createInlineStudioRenderer, installCollisionGuard } = await import(
      `${INLINE}?pik=${Date.now()}`
    );
    const stdout = new FakeTtyStdout(40, 100);
    const renderer = createInlineStudioRenderer({ stdout, enabled: true });
    const prompt = {
      write(text: string) {
        stdout.write(text);
      },
    };
    const uninstall = installCollisionGuard(prompt, renderer);
    renderer.begin();
    renderer.onEvent({
      type: "session.task.received",
      sessionId: "pik",
      task: "t",
      ts: 1,
    });
    const mid = stdout.writeCount;
    // Stray library / console write mid-cycle — must not tear the product frame.
    prompt.write("STRAY_LOG_LINE\n");
    expect(renderer.stats().diagnostics.join("")).toContain("STRAY_LOG_LINE");
    const midChunks = stdout.chunks.slice(mid).join("");
    expect(midChunks).not.toContain("STRAY_LOG_LINE");
    renderer.onEvent({
      type: "session.preflight",
      sessionId: "pik",
      branch: "main",
      dirtySummary: "clean",
      ts: 2,
    });
    const after = stdout.chunks.slice(mid).join("");
    expect(after).not.toContain("STRAY_LOG_LINE");
    expect(after).toContain("Preflight");
    uninstall();
    renderer.finish();
  });
});

describe("PI-L erase-below on shrink", () => {
  it("PI-L: shrinking frame emits \\u001b[J after repositioning", async () => {
    const { createInlineStudioRenderer, assembleAnsiFrame } = await import(
      `${INLINE}?pil=${Date.now()}`
    );
    const tall = assembleAnsiFrame(["a", "b", "c", "d", "e"], {
      prevHeight: 0,
      reanchor: true,
      hideCursor: true,
    });
    const short = assembleAnsiFrame(["a", "b"], {
      prevHeight: 5,
      reanchor: false,
      hideCursor: true,
    });
    expect(short).toContain("\u001b[5A");
    expect(short).toContain("\u001b[J");
    // Erase-below comes after the rewritten shorter content.
    const eraseAt = short.lastIndexOf("\u001b[J");
    const lastContent = short.lastIndexOf("b");
    expect(eraseAt).toBeGreaterThan(lastContent);

    const stdout = new FakeTtyStdout(40, 80);
    const renderer = createInlineStudioRenderer({ stdout, enabled: true });
    renderer.begin();
    // Build a taller state then shrink viewport so the next redraw is shorter.
    for (const event of parseNdjson(loadFixture("accepted-cycle.ndjson"))) {
      renderer.onEvent(event);
    }
    stdout.rows = 8;
    const before = stdout.writeCount;
    renderer.onEvent({
      type: "session.heartbeat",
      sessionId: "sess-accepted",
      stage: "validation",
      elapsedMs: 10,
      ts: 9999,
    });
    expect(stdout.writeCount).toBe(before + 1);
    const last = stdout.chunks[stdout.chunks.length - 1]!;
    expect(last).toContain("\u001b[J");
    renderer.finish();
    void tall;
  });
});

describe("PI hygiene: no path-studio file watcher required", () => {
  it("inline renderer does not import fs.watch / followEventsIn", () => {
    const inline = readFileSync(INLINE, "utf8");
    expect(inline).not.toContain("followEventsIn");
    expect(inline).not.toContain("fs.watch");
    expect(existsSync(join(CHECKOUT_ROOT, "scripts/pathcode-cli/inline-studio.mjs"))).toBe(
      true,
    );
  });
});
