/**
 * G7 focused proofs — event truth, failure truth, bounded diff, inspect command.
 */

import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STUDIO = join(CHECKOUT_ROOT, "scripts/path-studio/state.mjs");
const INLINE = join(CHECKOUT_ROOT, "scripts/pathcode-cli/inline-studio.mjs");
const DIFF = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag7/diff-preview.mjs");

async function load(path: string) {
  return import(`${pathToFileURL(path).href}?g7=${randomUUID()}`);
}

describe("G7 A — event truth", () => {
  it("presentation clock alone cannot change engineering phase or result", async () => {
    const { createEmptyStudioState, applyStudioEvent, projectAuthoritativePathPhase } =
      await load(STUDIO);
    const state = createEmptyStudioState();
    applyStudioEvent(state, {
      type: "session.started",
      sessionId: "g7a",
    });
    applyStudioEvent(state, {
      type: "session.engineering.activity",
      sessionId: "g7a",
      activity: "inspecting",
      label: "Inspecting",
    });
    const before = projectAuthoritativePathPhase(state);
    // Heartbeat / elapsed time update must not invent progress.
    state.heartbeat = { stage: "Inspecting", elapsedMs: 60_000 };
    expect(projectAuthoritativePathPhase(state)).toBe(before);
    expect(state.cards.terminal.arrived).toBe(false);
    const { assertNoFabricatedProgress } = await load(STUDIO);
    const { buildInlineCardLines } = await load(INLINE);
    const text = buildInlineCardLines(state, { rows: 40, columns: 140 }).join("\n");
    expect(() => assertNoFabricatedProgress(text)).not.toThrow();
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/\bVerified\b/);
  });
});

describe("G7 B — failure truth", () => {
  it("failed final validation cannot render Verified; engine checks stay distinct", async () => {
    const { createEmptyStudioState, applyStudioEvent, projectAuthoritativePathPhase } =
      await load(STUDIO);
    const { buildEvidenceLines, buildInlineCardLines } = await load(INLINE);
    const sid = "g7b";
    const state = createEmptyStudioState();
    applyStudioEvent(state, { type: "session.started", sessionId: sid });
    applyStudioEvent(state, {
      type: "session.engineering.workspace",
      sessionId: sid,
      taskBranch: "path/task-x",
      baselineHead: "aaaaaaaa",
    });
    applyStudioEvent(state, {
      type: "session.engineering.activity",
      sessionId: sid,
      activity: "testing",
      label: "Testing",
    });
    let evidence = buildEvidenceLines(state).join("\n");
    expect(evidence).toMatch(/Eng\. tests/);
    expect(evidence).toMatch(/Checks\s+—/);

    applyStudioEvent(state, {
      type: "session.validation.plan",
      sessionId: sid,
      checks: ["test"],
    });
    applyStudioEvent(state, {
      type: "session.validation.running",
      sessionId: sid,
      check: "test",
      kind: "TARGETED_TEST",
    });
    applyStudioEvent(state, {
      type: "session.validation.result",
      sessionId: sid,
      check: "test",
      kind: "TARGETED_TEST",
      ok: false,
      status: "FAILED",
    });
    applyStudioEvent(state, {
      type: "session.engineering.result",
      sessionId: sid,
      classification: "FAILED",
      changedFiles: ["a.js"],
      checks: [{ id: "test", kind: "TARGETED_TEST", ok: false }],
    });
    expect(projectAuthoritativePathPhase(state)).toBe("Failed");
    evidence = buildEvidenceLines(state).join("\n");
    expect(evidence).toMatch(/Result\s+✕/);
    expect(evidence).not.toMatch(/Result\s+✓/);
    const frame = buildInlineCardLines(state, { rows: 40, columns: 140 }).join("\n");
    // Open canvas uses ■ BLOCKED (not a bare "Failed" label).
    expect(frame).toMatch(/BLOCKED|Failed/);
    expect(frame).not.toMatch(/✓ Verified/);
    expect(frame).not.toMatch(/✓ COMPLETE/);
  });
});

describe("G7 D — large result bounded preview", () => {
  it("caps files and total unified-diff lines and discloses truncation", async () => {
    const { buildBoundedDiffPreview, buildFullResultInspectCommand } =
      await load(DIFF);
    const files = Array.from({ length: 12 }, (_, i) => `f${i}.js`);
    let diff = "";
    for (const f of files) {
      diff += `diff --git a/${f} b/${f}\n`;
      diff += `--- a/${f}\n+++ b/${f}\n`;
      for (let n = 0; n < 40; n += 1) {
        diff += `+line-${f}-${n}\n`;
      }
    }
    const preview = buildBoundedDiffPreview(diff, { changedFiles: files });
    expect(preview.shownFiles).toBeLessThanOrEqual(5);
    expect(preview.shownLines).toBeLessThanOrEqual(50);
    expect(preview.truncated).toBe(true);
    expect(preview.totalFiles).toBe(12);
    const cmd = buildFullResultInspectCommand({
      baselineSha: "abc1234567890",
      resultSha: "def1234567890",
    });
    expect(cmd).toBe(
      "git diff --no-ext-diff --no-textconv abc1234567890 def1234567890 --",
    );
    expect(buildFullResultInspectCommand({})).toBeNull();
  });

  it("renders compact COMPLETE result in the minimal living frame", async () => {
    const { createEmptyStudioState, applyStudioEvent } = await load(STUDIO);
    const { buildInlineCardLines, buildLivingProductLines } = await load(INLINE);
    const sid = "g7d";
    const state = createEmptyStudioState();
    const many = Array.from({ length: 9 }, (_, i) => `pkg/file-${i}.ts`);
    applyStudioEvent(state, { type: "session.started", sessionId: sid });
    applyStudioEvent(state, {
      type: "session.preflight",
      sessionId: sid,
      branch: "main",
      head: "1111111",
      dirtySummary: "clean",
      projectName: "big-repo",
    });
    applyStudioEvent(state, {
      type: "session.engineering.result",
      sessionId: sid,
      classification: "VERIFIED",
      changedFiles: many,
      baselineSha: "1111111aaaa",
      commitSha: "2222222bbbb",
      taskBranch: "path/task-big",
      inspectCommand:
        "git diff --no-ext-diff --no-textconv 1111111aaaa 2222222bbbb --",
      checks: [{ id: "test", kind: "TARGETED_TEST", ok: true }],
    });
    const wide = buildInlineCardLines(state, { rows: 50, columns: 140 }).join("\n");
    expect(wide).toMatch(/COMPLETE/);
    // Open-canvas report lists changed files (and may say "9 file(s)" in last activity).
    expect(wide).toMatch(/pkg\/file-0\.ts/);
    expect(wide).toMatch(/9 file/);
    expect(wide).toMatch(/commit 2222222b/i);
    // Primary surface must not dump raw inspect commands.
    expect(wide).not.toMatch(/git diff --no-ext-diff/);
    const narrow = buildInlineCardLines(state, { rows: 40, columns: 72 }).join("\n");
    expect(narrow).toMatch(/COMPLETE/);
    expect(narrow).toMatch(/PATH ● Code/);
    // Open canvas: objective lives in the stream, not a permanent GOAL box.
    expect(narrow).not.toMatch(/\bGOAL\b/);
    expect(narrow).not.toMatch(/╭|╰/);
    expect(narrow).toMatch(/Stop|idle/);
    // Full-height: frame occupies the entire viewport row count.
    expect(wide.split("\n").length).toBe(50);
    expect(narrow.split("\n").length).toBe(40);
    // Legacy three-column still discloses inspect command when asked explicitly.
    const legacy = buildLivingProductLines(state, { rows: 50, columns: 140 }).join(
      "\n",
    );
    expect(legacy).toMatch(/git diff --no-ext-diff --no-textconv/);
  });
});

describe("G7 C — terminal restoration helpers remain centralized", () => {
  it("inline renderer restoreTerminalState restores cursor/alt-screen without stty sane", async () => {
    const { createInlineStudioRenderer } = await load(INLINE);
    const { EventEmitter } = await import("node:events");
    class FakeTty extends EventEmitter {
      isTTY = true;
      rows = 40;
      columns = 120;
      chunks: string[] = [];
      write(chunk: string) {
        this.chunks.push(chunk);
        return true;
      }
    }
    const stdout = new FakeTty();
    const renderer = createInlineStudioRenderer({
      stdout,
      enabled: true,
      alternateScreen: true,
    });
    renderer.begin();
    renderer.onEvent({ type: "session.started", sessionId: "g7c" });
    renderer.restoreTerminalState();
    const joined = stdout.chunks.join("");
    expect(joined).toContain("\u001b[?25h");
    expect(joined).toContain("\u001b[?1049l");
    expect(joined).not.toMatch(/stty\s+sane/);
    expect(renderer.isActive()).toBe(false);
  });
});

describe("G7 E — session result handoff fields", () => {
  it("keeps primary untouched messaging and second-task ready state reset", async () => {
    const { createEmptyStudioState, applyStudioEvent } = await load(STUDIO);
    const sid = "g7e";
    const state = createEmptyStudioState();
    applyStudioEvent(state, { type: "session.started", sessionId: sid });
    applyStudioEvent(state, {
      type: "session.engineering.result",
      sessionId: sid,
      classification: "VERIFIED",
      changedFiles: ["a.js"],
      primaryUntouched: true,
      commitSha: "abcd123",
      baselineSha: "bbbbbbb",
    });
    expect(state.product.pathPhase).toBe("Verified");
    // New session id starts a fresh product surface.
    const state2 = createEmptyStudioState();
    applyStudioEvent(state2, { type: "session.started", sessionId: "g7e-2" });
    expect(state2.product.pathPhase).toBe("Idle");
    expect(state2.cards.terminal.arrived).toBe(false);
  });
});

describe("G7 F — final ANSI write boundary", () => {
  it("emits real ESC bytes and never literal \\\\u001b; NO_COLOR has neither", async () => {
    const { createInlineStudioRenderer, buildInlineCardLines, safeDisplay } =
      await load(INLINE);
    const { createEmptyStudioState, applyStudioEvent } = await load(STUDIO);
    const { EventEmitter } = await import("node:events");
    class FakeTty extends EventEmitter {
      isTTY = true;
      rows = 40;
      columns = 140;
      chunks: string[] = [];
      write(chunk: string) {
        this.chunks.push(chunk);
        return true;
      }
    }
    const stdout = new FakeTty();
    const renderer = createInlineStudioRenderer({
      stdout,
      enabled: true,
      alternateScreen: true,
    });
    renderer.begin();
    renderer.onEvent({ type: "session.task.received", sessionId: "ansi", mode: "ag1", preview: "x" });
    renderer.onEvent({
      type: "session.preflight",
      sessionId: "ansi",
      branch: "main",
      dirtySummary: "clean",
      projectName: "demo",
    });
    renderer.onEvent({
      type: "session.engineering.activity",
      sessionId: "ansi",
      activity: "inspecting",
      label: "Inspecting",
    });
    const joined = stdout.chunks.join("");
    expect(joined).toContain("\u001b[");
    expect(joined).not.toContain("\\u001b");
    expect(joined.codePointAt(joined.indexOf("\u001b"))).toBe(0x1b);

    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
    try {
      const state = createEmptyStudioState();
      applyStudioEvent(state, {
        type: "session.task.received",
        sessionId: "nc",
        mode: "ag1",
        preview: "y",
      });
      applyStudioEvent(state, {
        type: "session.engineering.activity",
        sessionId: "nc",
        activity: "inspecting",
        label: "Inspecting",
      });
      const text = buildInlineCardLines(state, { rows: 40, columns: 140 }).join("\n");
      expect(text).not.toMatch(/\u001b\[[0-9;]*m/);
      expect(text).not.toContain("\\u001b");
      expect(safeDisplay("evil\u001b[2J")).toContain("\\u001b");
      expect(safeDisplay("evil\u001b[2J")).not.toMatch(/\u001b\[2J/);
    } finally {
      if (prev === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = prev;
    }
    renderer.finish();
  });

  it("keeps alt-screen across startTask and shows in-cockpit idle prompt", async () => {
    const { createInlineStudioRenderer } = await load(INLINE);
    const { EventEmitter } = await import("node:events");
    class FakeTty extends EventEmitter {
      isTTY = true;
      rows = 40;
      columns = 140;
      chunks: string[] = [];
      write(chunk: string) {
        this.chunks.push(chunk);
        return true;
      }
    }
    const stdout = new FakeTty();
    const renderer = createInlineStudioRenderer({
      stdout,
      enabled: true,
      alternateScreen: true,
    });
    renderer.begin();
    renderer.onEvent({
      type: "session.engineering.result",
      sessionId: "s1",
      classification: "VERIFIED",
      changedFiles: ["a.js"],
      commitSha: "aaaaaaaaaaaa",
      baselineSha: "bbbbbbbbbbbb",
      taskBranch: "path/task-1",
      diffPreviewLines: ["+export const a = 1"],
    });
    const mid = stdout.chunks.join("");
    expect(mid).toContain("\u001b[?1049h");
    expect(mid).not.toContain("\\u001b");
    renderer.setIdlePrompt("PATH ● Code > ");
    const idle = stdout.chunks.join("");
    expect(idle).toMatch(/COMPLETE/);
    expect(idle).toMatch(/PATH ● Code/);
    expect(idle).toMatch(/> /);
    // Second task must not exit alt screen.
    const beforeExit = (idle.match(/\u001b\[\?1049l/g) || []).length;
    renderer.startTask();
    renderer.onEvent({
      type: "session.task.received",
      sessionId: "s2",
      mode: "ag1",
      preview: "second",
    });
    const after = stdout.chunks.join("");
    const afterExit = (after.match(/\u001b\[\?1049l/g) || []).length;
    expect(afterExit).toBe(beforeExit);
    expect(renderer.isActive()).toBe(true);
    renderer.finish();
    expect(renderer.stats().altScreenActive).toBe(false);
  });
});
