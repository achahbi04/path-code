/**
 * Engineering surface — normalize, stop control, open canvas.
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  normalizeObjectiveText,
  containsCarriageReturn,
} from "../../scripts/pathcode-cli/normalize-text.mjs";
import { isTaskStopCommand } from "../../scripts/pathcode-cli/task-control.mjs";
import { escapeForTerminalDisplay } from "../../scripts/pathcode-cli/escape.mjs";
import {
  applyComposerInput,
  createComposerState,
  PASTE_START,
  PASTE_END,
} from "../../scripts/pathcode-cli/composer.mjs";
import {
  registerProcess,
  cancelTaskProcesses,
  listProcesses,
  markProcessEnded,
  resetProcessRegistryForTests,
} from "../../scripts/pathcode-cli/process-registry.mjs";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STUDIO = join(CHECKOUT, "scripts/path-studio/state.mjs");
const INLINE = join(CHECKOUT, "scripts/pathcode-cli/inline-studio.mjs");

async function load(path: string) {
  return import(`${pathToFileURL(path).href}?es=${randomUUID()}`);
}

describe("engineering surface — paste / objective normalize", () => {
  it("normalizes CRLF and lone CR before durable use", () => {
    const raw = "Para one.\r\rPara two.\r\nPara three.";
    const n = normalizeObjectiveText(raw);
    expect(containsCarriageReturn(n)).toBe(false);
    expect(n).toBe("Para one.\n\nPara two.\nPara three.");
    expect(escapeForTerminalDisplay(raw)).not.toMatch(/\\r/);
  });

  it("composer paste normalizes CR before buffer insert", () => {
    let state = createComposerState();
    const chunk = `${PASTE_START}Line A.\r\rLine B.${PASTE_END}`;
    const r = applyComposerInput(state, chunk);
    expect(containsCarriageReturn(r.state.text)).toBe(false);
    expect(r.state.text).toContain("Line A.\n\nLine B.");
    expect(r.submit).toBeNull();
  });
});

describe("engineering surface — stop vs steering", () => {
  it("recognizes stop control phrases and ignores long steering", () => {
    expect(isTaskStopCommand("/stop")).toBe(true);
    expect(isTaskStopCommand("stop")).toBe(true);
    expect(isTaskStopCommand("Stop here and give the report")).toBe(true);
    expect(
      isTaskStopCommand(
        "please stop inventing APIs and keep the public surface stable",
      ),
    ).toBe(false);
  });
});

describe("engineering surface — open canvas", () => {
  it("renders full-height open canvas without GOAL box or outer frame", async () => {
    const { createEmptyStudioState, applyStudioEvent } = await load(STUDIO);
    const { buildMinimalLivingLines } = await load(INLINE);
    const state = createEmptyStudioState();
    applyStudioEvent(state, { type: "session.started", sessionId: "es" });
    state.product.ag1 = true;
    applyStudioEvent(state, {
      type: "session.task.received",
      sessionId: "es",
      preview: "Inspect\r\rthe distribution files list",
    });
    applyStudioEvent(state, {
      type: "session.engineering.tool",
      kind: "file_edit",
      tool: "edit_file",
      path: "package.json",
      summary: "edit_file package.json",
      diff:
        '@@ -1,3 +1,4 @@\n {\n-  "name": "x"\n+  "name": "path-code"\n+  "files": []\n }\n',
      added: 2,
      removed: 1,
    });
    const tall = buildMinimalLivingLines(state, { rows: 36, columns: 100 });
    const narrow = buildMinimalLivingLines(state, { rows: 24, columns: 72 });
    expect(tall.length).toBe(36);
    expect(narrow.length).toBe(24);
    const text = tall.join("\n");
    const plain = text.replace(/\u001b\[[0-9;]*m/g, "");
    expect(plain.split("\n")[0]).toMatch(/^PATH ● Code/);
    expect(text).not.toMatch(/╭|╰/);
    expect(text).not.toMatch(/\bGOAL\b/);
    expect(text).not.toMatch(/\\r/);
    expect(text).toMatch(/PATH/);
    expect(text).toMatch(/Stop/);
    expect(text).toMatch(/Inspect/);
    expect(text).toMatch(/Update\(package\.json\)/);
    expect(text).toMatch(/Added 2 lines/);
  });
});

describe("engineering surface — process registry", () => {
  it("tracks and cancels task-owned processes without killing live children when marked ended", () => {
    resetProcessRegistryForTests();
    const taskId = "task-es-1";
    const rec = registerProcess({
      taskId,
      kind: "test_proc",
      command: "echo noop",
      pid: 999999001,
    });
    expect(listProcesses(taskId).some((p) => p.id === rec.id)).toBe(true);
    markProcessEnded(rec.id, { exitCode: 0, cleanup: "ok" });
    const cancelled = cancelTaskProcesses(taskId);
    expect(cancelled.some((p) => p.id === rec.id && p.cancelled)).toBe(true);
    expect(cancelled.find((p) => p.id === rec.id)?.endedAt).toBeTruthy();
  });

  it("inherits task ownership from AsyncLocalStorage context", async () => {
    resetProcessRegistryForTests();
    const { runWithTaskContext } = await import(
      "../../scripts/pathcode-cli/process-registry.mjs"
    );
    runWithTaskContext("task-ctx-9", () => {
      registerProcess({
        kind: "ctx_child",
        command: "sleep 1",
        pid: 999999002,
      });
    });
    expect(listProcesses("task-ctx-9").length).toBe(1);
  });
});
