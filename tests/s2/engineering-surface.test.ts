/**
 * Engineering surface — normalize, stop control, open canvas.
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(CHECKOUT, "scripts/pathcode-cli");
const STUDIO = join(CHECKOUT, "scripts/path-studio/state.mjs");
const INLINE = join(CHECKOUT, "scripts/pathcode-cli/inline-studio.mjs");

async function load(path: string) {
  return import(`${pathToFileURL(path).href}?es=${randomUUID()}`);
}

describe("engineering surface — paste / objective normalize", () => {
  it("normalizes CRLF and lone CR before durable use", async () => {
    const { normalizeObjectiveText, containsCarriageReturn } = await load(
      join(CLI, "normalize-text.mjs"),
    );
    const { escapeForTerminalDisplay } = await load(join(CLI, "escape.mjs"));
    const raw = "Para one.\r\rPara two.\r\nPara three.";
    const n = normalizeObjectiveText(raw);
    expect(containsCarriageReturn(n)).toBe(false);
    expect(n).toBe("Para one.\n\nPara two.\nPara three.");
    expect(escapeForTerminalDisplay(raw)).not.toMatch(/\\r/);
  });

  it("composer paste normalizes CR before buffer insert", async () => {
    const {
      applyComposerInput,
      createComposerState,
      PASTE_START,
      PASTE_END,
    } = await load(join(CLI, "composer.mjs"));
    const { containsCarriageReturn } = await load(
      join(CLI, "normalize-text.mjs"),
    );
    let state = createComposerState();
    const chunk = `${PASTE_START}Line A.\r\rLine B.${PASTE_END}`;
    const r = applyComposerInput(state, chunk);
    expect(containsCarriageReturn(r.state.text)).toBe(false);
    expect(r.state.text).toContain("Line A.\n\nLine B.");
    expect(r.submit).toBeNull();
  });
});

describe("engineering surface — stop vs steering", () => {
  it("recognizes stop control phrases and ignores long steering", async () => {
    const { isTaskStopCommand } = await load(join(CLI, "task-control.mjs"));
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

  it("paints S2 operator panel in-canvas and shows idle · complete after result", async () => {
    const { createEmptyStudioState, applyStudioEvent } = await load(STUDIO);
    const { buildMinimalLivingLines } = await load(INLINE);
    const state = createEmptyStudioState();
    applyStudioEvent(state, { type: "session.started", sessionId: "es2" });
    state.product.ag1 = true;
    state.product.projectName = "Klarapp";
    applyStudioEvent(state, {
      type: "session.task.received",
      sessionId: "es2",
      preview: "Assess packaging",
    });
    applyStudioEvent(state, {
      type: "session.engineering.busy",
      label: "Waiting for engineering result",
    });
    applyStudioEvent(state, {
      type: "session.engineering.result",
      classification: "VERIFIED",
      changedFiles: [],
      durationMs: 4200,
    });
    expect(state.product.busyLabel).toBeNull();
    expect(state.product.awaitingInput).toBe(true);
    expect(state.heartbeat).toBeNull();

    const idle = buildMinimalLivingLines(state, { rows: 28, columns: 90 });
    const idlePlain = idle.join("\n").replace(/\u001b\[[0-9;]*m/g, "");
    expect(idlePlain).toMatch(/idle · complete/);
    expect(idlePlain).not.toMatch(/Waiting for engineering result/);
    expect(idlePlain).not.toMatch(/\brunning\b/);

    state.product.operatorPanel = [
      "Durable task history (1 shown, newest first)",
      "",
      "taskId  demo-task-1",
      "  project   Klarapp",
      "  outcome   VERIFIED",
    ].join("\n");
    const panel = buildMinimalLivingLines(state, { rows: 28, columns: 90 });
    const panelPlain = panel.join("\n").replace(/\u001b\[[0-9;]*m/g, "");
    expect(panelPlain).toMatch(/PATH · command/);
    expect(panelPlain).toMatch(/Durable task history/);
    expect(panelPlain).toMatch(/demo-task-1/);
    expect(panelPlain).toMatch(/idle · complete/);
  });
});

describe("engineering surface — process registry", () => {
  it("tracks and cancels task-owned processes without killing live children when marked ended", async () => {
    const {
      registerProcess,
      cancelTaskProcesses,
      listProcesses,
      markProcessEnded,
      resetProcessRegistryForTests,
    } = await load(join(CLI, "process-registry.mjs"));
    resetProcessRegistryForTests();
    const taskId = "task-es-1";
    const rec = registerProcess({
      taskId,
      kind: "test_proc",
      command: "echo noop",
      pid: 999999001,
    });
    expect(
      listProcesses(taskId).some(
        (p: { id: string }) => p.id === rec.id,
      ),
    ).toBe(true);
    markProcessEnded(rec.id, { exitCode: 0, cleanup: "ok" });
    const cancelled = cancelTaskProcesses(taskId);
    expect(
      cancelled.some(
        (p: { id: string; cancelled?: boolean }) =>
          p.id === rec.id && p.cancelled,
      ),
    ).toBe(true);
    expect(
      cancelled.find((p: { id: string }) => p.id === rec.id)?.endedAt,
    ).toBeTruthy();
  });

  it("inherits task ownership from AsyncLocalStorage context", async () => {
    const {
      registerProcess,
      listProcesses,
      resetProcessRegistryForTests,
      runWithTaskContext,
    } = await load(join(CLI, "process-registry.mjs"));
    resetProcessRegistryForTests();
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
