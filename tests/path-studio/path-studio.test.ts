/**
 * Phase PS1 — Path Studio read-only live mirror proofs (PS1-A … PS1-N + P1).
 *
 * Deterministic fixtures / scripted sinks. Zero live providers. Zero credentials.
 * Engine src/** untouched.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import { afterAll, describe, expect, it } from "vitest";

import { CHECKOUT_ROOT, cleanupTrackedRoots } from "../general-session/helpers.js";

afterAll(() => {
  cleanupTrackedRoots();
});

const FIXTURES = join(CHECKOUT_ROOT, "tests/path-studio/fixtures");
const STUDIO_STATE = join(CHECKOUT_ROOT, "scripts/path-studio/state.mjs");
const STUDIO_ENTRY = join(CHECKOUT_ROOT, "scripts/path-studio/path-studio.mjs");
const EVENTS_OUT = join(CHECKOUT_ROOT, "scripts/pathcode-cli/events-out.mjs");
const SESSION_EVENTS = join(CHECKOUT_ROOT, "scripts/pathcode-cli/session-events.mjs");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function tmpPath(label: string): string {
  const dir = join(tmpdir(), `pathcode-ps1-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${label}-${randomUUID()}.ndjson`);
}

describe("PS1-A CLI cleanliness + SRC zero-diff + R2-K interstitial", () => {
  it("PS1-A: --events-out uses a file sink only; no network server in CLI sources", async () => {
    const pathcode = readFileSync(join(CHECKOUT_ROOT, "scripts/pathcode.mjs"), "utf8");
    const eventsOut = readFileSync(EVENTS_OUT, "utf8");
    expect(pathcode).toContain("openEventsOutSink");
    expect(pathcode).not.toMatch(/createServer|WebSocket|listen\(/);
    expect(eventsOut).not.toMatch(/createServer|WebSocket|net\.|listen\(/);
    expect(eventsOut).toContain("fsyncSync");
    expect(eventsOut).toMatch(/openSync\([^,]+,\s*["']w["']\)/);

    // SRC_DIFF_BYTES=0 relative to HEAD for this worktree's committed src.
    const { execSync } = await import("node:child_process");
    const diff = execSync("git diff HEAD -- src/", {
      cwd: CHECKOUT_ROOT,
      encoding: "utf8",
    });
    expect(Buffer.byteLength(diff, "utf8")).toBe(0);

    // R2-K interstitial: heartbeat controller clears its timer on stop.
    const { createHeartbeatController, createSessionEventSink } = await import(
      `${SESSION_EVENTS}?ps1a=${Date.now()}`
    );
    const emitted: string[] = [];
    const timers: Array<ReturnType<typeof setInterval>> = [];
    const hb = createHeartbeatController({
      emit: (type: string) => {
        emitted.push(type);
      },
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
    expect(hb.activeStage()).toBe("reasoning");
    hb.stop();
    expect(hb.activeStage()).toBe(null);
    expect(timers).toHaveLength(0);

    const sink = createSessionEventSink({
      sessionId: "ps1a-sid",
      mode: "ndjson",
      writeNdjson: () => {},
    });
    sink.emit("session.task.received", { task: "x" });
    expect(sink.events()[0]!.sessionId).toBe("ps1a-sid");
  });
});

describe("PS1-B sink format + safe fields", () => {
  it("PS1-B: NDJSON one object/line, ordered, sessionId, no secrets", async () => {
    const { createSessionEventSink, parseSessionEventNdjson } = await import(
      `${SESSION_EVENTS}?ps1b=${Date.now()}`
    );
    const lines: string[] = [];
    const sink = createSessionEventSink({
      sessionId: "ps1b-canary",
      mode: "ndjson",
      writeNdjson: (line: string) => lines.push(line),
    });
    sink.emit("session.task.received", { task: "seeded-canary" });
    sink.emit("session.preflight", {
      branch: "main",
      head: "abc",
      dirtySummary: "clean",
    });
    sink.emit("session.terminal", { disposition: "OK", summary: "done" });

    const text = lines.join("");
    expect(text.endsWith("\n")).toBe(true);
    const parsed = parseSessionEventNdjson(text);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((e: { type: string }) => e.type)).toEqual([
      "session.task.received",
      "session.preflight",
      "session.terminal",
    ]);
    for (const e of parsed) {
      expect(e.sessionId).toBe("ps1b-canary");
    }
    const blob = JSON.stringify(parsed);
    expect(blob).not.toMatch(/sk-/);
    expect(blob).not.toContain("OPENAI_API_KEY");
    expect(blob).not.toContain("/Users/");
    expect(blob).not.toMatch(/rawModel|completion_tokens|choices/);
  });
});

describe("PS1-C…G render fidelity from fixtures", () => {
  it("PS1-C: missing gate2 stays pending — never accepted", async () => {
    const { reduceStudioEvents, renderStudioText } = await import(
      `${STUDIO_STATE}?ps1c=${Date.now()}`
    );
    const { parseSessionEventNdjson } = await import(
      `${SESSION_EVENTS}?ps1c=${Date.now()}`
    );
    const events = parseSessionEventNdjson(loadFixture("missing-gate2.ndjson"));
    const state = reduceStudioEvents(events);
    expect(state.cards.gate2.arrived).toBe(false);
    expect(state.cards.gate2.status).toBe("pending");
    expect(state.cards.gate2.detail).toBe("not yet");
    const text = renderStudioText(state);
    expect(text).toContain("Gate 2: not yet");
    expect(text).not.toMatch(/Gate 2: accepted/);
  });

  it("PS1-D: validation.skipped shows skipped; no running/result/gate2 accepted", async () => {
    const { reduceStudioEvents, renderStudioText } = await import(
      `${STUDIO_STATE}?ps1d=${Date.now()}`
    );
    const { parseSessionEventNdjson } = await import(
      `${SESSION_EVENTS}?ps1d=${Date.now()}`
    );
    const events = parseSessionEventNdjson(loadFixture("validation-skipped.ndjson"));
    const state = reduceStudioEvents(events);
    expect(state.cards.validationSkipped.status).toBe("skipped");
    expect(state.cards.validationRunning.arrived).toBe(false);
    expect(state.cards.validationResult.arrived).toBe(false);
    expect(state.cards.gate2.arrived).toBe(false);
    const text = renderStudioText(state);
    expect(text).toMatch(/Validation skipped:.*CHECK_DECLINED/);
    expect(text).not.toMatch(/Gate 2: accepted/);
  });

  it("PS1-E: no percentage/ETA/bar; heartbeat is elapsed-only liveness", async () => {
    const { reduceStudioEvents, renderStudioText, assertNoFabricatedProgress } =
      await import(`${STUDIO_STATE}?ps1e=${Date.now()}`);
    const { parseSessionEventNdjson } = await import(
      `${SESSION_EVENTS}?ps1e=${Date.now()}`
    );
    const events = parseSessionEventNdjson(loadFixture("accepted-cycle.ndjson"));
    const state = reduceStudioEvents(events);
    // Last heartbeat in fixture leaves liveness before gate1 cleared it —
    // re-apply a trailing heartbeat to assert render shape.
    const { applyStudioEvent } = await import(`${STUDIO_STATE}?ps1e2=${Date.now()}`);
    applyStudioEvent(state, {
      type: "session.heartbeat",
      sessionId: "sess-accepted",
      stage: "validation",
      elapsedMs: 42000,
    });
    const text = renderStudioText(state);
    assertNoFabricatedProgress(text);
    expect(text).toContain("liveness: working on validation — 42s");
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/ETA/i);
  });

  it("PS1-F: order fidelity for accepted and refused fixtures", async () => {
    const { reduceStudioEvents, arrivedCardSequence } = await import(
      `${STUDIO_STATE}?ps1f=${Date.now()}`
    );
    const { parseSessionEventNdjson } = await import(
      `${SESSION_EVENTS}?ps1f=${Date.now()}`
    );
    const accepted = reduceStudioEvents(
      parseSessionEventNdjson(loadFixture("accepted-cycle.ndjson")),
    );
    expect(arrivedCardSequence(accepted)).toEqual([
      "task",
      "preflight",
      "disclosure",
      "authority",
      "scope",
      "reading",
      "reasoning",
      "gate1",
      "edit",
      "recovery",
      "applying",
      "reobserved",
      "validationPlan",
      "validationRunning",
      "validationResult",
      "gate2",
      "terminal",
      "findings",
    ]);
    expect(accepted.cards.gate2.detail).toBe("accepted");

    const refused = reduceStudioEvents(
      parseSessionEventNdjson(loadFixture("refused-cycle.ndjson")),
    );
    expect(arrivedCardSequence(refused)).toEqual([
      "task",
      "preflight",
      "disclosure",
      "authority",
      "terminal",
    ]);
    expect(refused.cards.reading.arrived).toBe(false);
    expect(refused.cards.gate2.arrived).toBe(false);
    expect(refused.cards.terminal.detail).toContain("START_DECLINED");
  });

  it("PS1-G: terminal human render and Studio agree on stages/outcomes", async () => {
    const { renderSessionEventHuman, parseSessionEventNdjson } = await import(
      `${SESSION_EVENTS}?ps1g=${Date.now()}`
    );
    const { reduceStudioEvents, renderStudioText } = await import(
      `${STUDIO_STATE}?ps1g=${Date.now()}`
    );
    const events = parseSessionEventNdjson(loadFixture("accepted-cycle.ndjson"));
    const human = events
      .map((e: Record<string, unknown>) => renderSessionEventHuman(e))
      .filter(Boolean)
      .join("");
    const studio = renderStudioText(reduceStudioEvents(events));
    expect(human).toContain("Gate 1: grounded");
    expect(studio).toContain("Gate 1: grounded");
    expect(human).toContain("Gate 2: accepted");
    expect(studio).toContain("Gate 2: accepted");
    expect(human).not.toContain("Validation skipped");
    expect(studio).toMatch(/\[ \] Validation skipped: not yet/);
    expect(studio).not.toMatch(/Gate 2: not-established/);
  });
});

describe("PS1-H heartbeat bounds", () => {
  it("PS1-H: heartbeats only during entered stage; stop at terminal; none for unreached", async () => {
    const { createHeartbeatController } = await import(
      `${SESSION_EVENTS}?ps1h=${Date.now()}`
    );
    const events: Array<Record<string, unknown>> = [];
    let now = 1_000;
    const hb = createHeartbeatController({
      emit: (type: string, fields: Record<string, unknown> = {}) => {
        events.push({ type, ...fields });
      },
      intervalMs: 30,
      now: () => now,
    });
    // Unreached stage — no begin → no heartbeats.
    await delay(80);
    expect(events.filter((e) => e.type === "session.heartbeat")).toHaveLength(0);

    hb.begin("reasoning");
    now = 1_030;
    await delay(80);
    const during = events.filter((e) => e.type === "session.heartbeat");
    expect(during.length).toBeGreaterThan(0);
    expect(during.every((e) => e.stage === "reasoning")).toBe(true);
    expect(during.every((e) => typeof e.elapsedMs === "number")).toBe(true);
    expect(during.every((e) => !("percent" in e) && !("eta" in e))).toBe(true);

    hb.stop(); // stage terminal
    const countAtStop = events.length;
    await delay(80);
    expect(events.length).toBe(countAtStop);

    // Never begin validation → no validation heartbeats.
    expect(events.some((e) => e.stage === "validation")).toBe(false);
  });
});

describe("PS1-I separate process; PS1-J no input path", () => {
  it("PS1-I / PS1-J: Studio is its own process; no write-back; CLI kill leaves final state", async () => {
    const { PATH_STUDIO_WRITE_BACK, runPathStudioMain } =
      await import(`${STUDIO_ENTRY}?ps1ij=${Date.now()}`);
    expect(PATH_STUDIO_WRITE_BACK.hasWriteBack).toBe(false);
    expect(PATH_STUDIO_WRITE_BACK.authorityMint).toBe(false);
    expect(PATH_STUDIO_WRITE_BACK.autoApprove).toBe(false);
    expect(PATH_STUDIO_WRITE_BACK.stdinBridge).toBe(false);

    const studioSrc = readFileSync(STUDIO_ENTRY, "utf8");
    expect(studioSrc).not.toMatch(/writeFileSync\([^)]*pathcode|process\.stdin\.write/);
    // Negate real write-back / mint paths — not the explicit denial flags.
    expect(studioSrc).not.toMatch(/mintAuthority|cacheConsent|function\s+autoApprove/i);
    expect(studioSrc).toContain("hasWriteBack: false");
    expect(studioSrc).toContain("autoApprove: false");

    const sink = tmpPath("ps1i");
    writeFileSync(sink, loadFixture("accepted-cycle.ndjson"), "utf8");
    const chunks: string[] = [];
    const code = await runPathStudioMain(["--events-in", sink, "--once"], {
      stdout: { write: (s: string) => chunks.push(s) },
      stderr: { write: () => {} },
    });
    expect(code).toBe(0);
    expect(chunks.join("")).toContain("Gate 2: accepted");
    expect(chunks.join("")).toContain("(sink ended — final state)");

    // Spawn Studio as a child; killing it must not require killing a CLI.
    const child = spawn(process.execPath, [STUDIO_ENTRY, "--events-in", sink, "--once"], {
      cwd: CHECKOUT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = await new Promise<string>((resolve, reject) => {
      let buf = "";
      child.stdout?.on("data", (d) => {
        buf += String(d);
      });
      child.on("error", reject);
      child.on("close", (c) => {
        if (c === 0) resolve(buf);
        else reject(new Error(`studio exit ${c}`));
      });
    });
    expect(out).toContain("session: sess-accepted");
    // Sink still intact after Studio exits.
    expect(existsSync(sink)).toBe(true);
    unlinkSync(sink);
  });
});

describe("PS1-K authority boundary documented in report contract surface", () => {
  it("PS1-K: Studio help and constants state challenge-string-only future drive-mode", async () => {
    const { runPathStudioMain, PATH_STUDIO_WRITE_BACK } = await import(
      `${STUDIO_ENTRY}?ps1k=${Date.now()}`
    );
    const chunks: string[] = [];
    await runPathStudioMain(["--help"], {
      stdout: { write: (s: string) => chunks.push(s) },
      stderr: { write: () => {} },
    });
    const help = chunks.join("");
    expect(help).toContain("No input path to the CLI");
    expect(help).toContain("No authority");
    expect(PATH_STUDIO_WRITE_BACK.hasWriteBack).toBe(false);
    // Report will restate: future drive-mode = exact challenge over CLI stdin only.
    const stateSrc = readFileSync(STUDIO_ENTRY, "utf8");
    expect(stateSrc).toContain("challenge string");
  });
});

describe("PS1-L flush timing", () => {
  it("PS1-L: reader observes gapped events as they flush, not as an end burst", async () => {
    const { openEventsOutSink } = await import(`${EVENTS_OUT}?ps1l=${Date.now()}`);
    const { followEventsIn } = await import(`${STUDIO_ENTRY}?ps1l=${Date.now()}`);
    const sink = tmpPath("ps1l");
    const out = openEventsOutSink(sink);
    const seen: string[] = [];
    const signal = { stopped: false };
    const follow = followEventsIn(sink, {
      pollMs: 20,
      maxIdleMs: 5_000,
      signal,
      onLine: (line: string) => {
        try {
          const obj = JSON.parse(line);
          seen.push(String(obj.type));
        } catch {
          // ignore
        }
      },
      onEnd: () => {
        signal.stopped = true;
      },
    });

    out.writeLine(
      `${JSON.stringify({ type: "session.task.received", sessionId: "flush", ts: 1, task: "a" })}\n`,
    );
    await delay(60);
    expect(seen).toContain("session.task.received");
    expect(seen).not.toContain("session.terminal");

    await delay(80);
    out.writeLine(
      `${JSON.stringify({ type: "session.terminal", sessionId: "flush", ts: 2, disposition: "OK" })}\n`,
    );
    await delay(80);
    expect(seen).toEqual(["session.task.received", "session.terminal"]);
    out.close();
    signal.stopped = true;
    await follow;
    unlinkSync(sink);
  });
});

describe("PS1-M fresh sink on launch", () => {
  it("PS1-M: openEventsOutSink truncates prior-run content", async () => {
    const { openEventsOutSink } = await import(`${EVENTS_OUT}?ps1m=${Date.now()}`);
    const sink = tmpPath("ps1m");
    writeFileSync(
      sink,
      `${JSON.stringify({ type: "session.gate2", sessionId: "stale", status: "accepted" })}\n`,
      "utf8",
    );
    expect(readFileSync(sink, "utf8")).toContain("stale");
    const out = openEventsOutSink(sink);
    expect(readFileSync(sink, "utf8")).toBe("");
    out.writeLine(
      `${JSON.stringify({ type: "session.task.received", sessionId: "fresh", task: "now" })}\n`,
    );
    const text = readFileSync(sink, "utf8");
    expect(text).toContain("fresh");
    expect(text).not.toContain("stale");
    out.close();
    unlinkSync(sink);
  });
});

describe("PS1-N session-id isolation", () => {
  it("PS1-N: two session ids → Studio renders only the selected one; mid-stream bind is pure", async () => {
    const { reduceStudioEvents, renderStudioText } = await import(
      `${STUDIO_STATE}?ps1n=${Date.now()}`
    );
    const { parseSessionEventNdjson } = await import(
      `${SESSION_EVENTS}?ps1n=${Date.now()}`
    );
    const events = parseSessionEventNdjson(loadFixture("two-sessions.ndjson"));

    const onlyNew = reduceStudioEvents(events, { sessionId: "sess-new" });
    expect(onlyNew.sessionId).toBe("sess-new");
    expect(onlyNew.ignoredForeignCount).toBeGreaterThan(0);
    expect(onlyNew.cards.task.detail).toContain("current run task");
    expect(onlyNew.cards.gate2.arrived).toBe(false);
    expect(onlyNew.cards.terminal.detail).toContain("START_DECLINED");
    const textNew = renderStudioText(onlyNew);
    expect(textNew).not.toContain("prior run task");
    expect(textNew).not.toMatch(/Gate 2: accepted/);

    const onlyOld = reduceStudioEvents(events, { sessionId: "sess-old" });
    expect(onlyOld.cards.task.detail).toContain("prior run task");
    expect(onlyOld.cards.gate2.detail).toBe("accepted");
    expect(onlyOld.cards.terminal.detail).not.toContain("START_DECLINED");

    // Mid-stream attach: bind from first event when no forced id → sess-old,
    // then foreign sess-new ignored (no mix).
    const mid = reduceStudioEvents(events);
    expect(mid.sessionId).toBe("sess-old");
    expect(mid.ignoredForeignCount).toBeGreaterThan(0);
    expect(mid.cards.task.detail).toContain("prior run task");
    expect(renderStudioText(mid)).not.toContain("current run task");
  });
});

describe("P1 DECORATION PROBE", () => {
  it("P1: fabricating gate2 accepted fails PS1-C/D; restore by hash", async () => {
    const statePath = STUDIO_STATE;
    const original = readFileSync(statePath, "utf8");
    const beforeHash = createHash("sha256").update(original).digest("hex");

    // Weaken: always decorate gate2 as accepted when missing the event.
    const weakened = original.replace(
      "decorateGate2Accepted?: boolean",
      "decorateGate2Accepted?: boolean",
    ).replace(
      "// P1 decoration probe hook — MUST NOT ship enabled.\n  if (opts.decorateGate2Accepted === true && !state.cards.gate2.arrived) {\n    setCard(state, \"gate2\", \"done\", \"accepted\");\n  }",
      "// P1 decoration probe hook — opened.\n  if (!state.cards.gate2.arrived) {\n    setCard(state, \"gate2\", \"done\", \"accepted\");\n  }",
    );
    expect(weakened).not.toBe(original);
    writeFileSync(statePath, weakened, "utf8");
    const openedHash = createHash("sha256").update(weakened).digest("hex");

    try {
      const { reduceStudioEvents } = await import(
        `${STUDIO_STATE}?p1open=${openedHash}`
      );
      const { parseSessionEventNdjson } = await import(
        `${SESSION_EVENTS}?p1open=${openedHash}`
      );
      const missing = reduceStudioEvents(
        parseSessionEventNdjson(loadFixture("missing-gate2.ndjson")),
      );
      // PS1-C must fail open: shows accepted without the event.
      expect(missing.cards.gate2.arrived).toBe(true);
      expect(missing.cards.gate2.detail).toBe("accepted");

      const skipped = reduceStudioEvents(
        parseSessionEventNdjson(loadFixture("validation-skipped.ndjson")),
      );
      // PS1-D must fail open: gate2 accepted despite skip path.
      expect(skipped.cards.gate2.detail).toBe("accepted");
    } finally {
      writeFileSync(statePath, original, "utf8");
      const restored = readFileSync(statePath, "utf8");
      const afterHash = createHash("sha256").update(restored).digest("hex");
      expect(afterHash).toBe(beforeHash);
    }

    // Focused PASS after restore.
    const { reduceStudioEvents } = await import(
      `${STUDIO_STATE}?p1restored=${beforeHash}`
    );
    const { parseSessionEventNdjson } = await import(
      `${SESSION_EVENTS}?p1restored=${beforeHash}`
    );
    const missing = reduceStudioEvents(
      parseSessionEventNdjson(loadFixture("missing-gate2.ndjson")),
    );
    expect(missing.cards.gate2.arrived).toBe(false);
    expect(missing.cards.gate2.status).toBe("pending");

    // Record hashes for the report.
    expect(beforeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(openedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(openedHash).not.toBe(beforeHash);
  });
});

describe("PS1 parseArgs --events-out", () => {
  it("accepts --events ndjson --events-out and requires events mode", async () => {
    const { parseArgs } = await import(
      `${join(CHECKOUT_ROOT, "scripts/pathcode.mjs")}?args=${Date.now()}`
    );
    const ok = parseArgs(["--events", "ndjson", "--events-out", "/tmp/x.ndjson"]);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.events).toBe("ndjson");
      expect(ok.value.eventsOut).toBe("/tmp/x.ndjson");
    }
    const bad = parseArgs(["--events-out", "/tmp/x.ndjson"]);
    expect(bad.ok).toBe(false);
  });
});
