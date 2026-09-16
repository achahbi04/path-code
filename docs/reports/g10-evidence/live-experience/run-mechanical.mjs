/**
 * Mechanical proofs for live engineering surface (open canvas, stop, CRLF, process kill).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEmptyStudioState, applyStudioEvent } from "../../../../scripts/path-studio/state.mjs";
import { buildMinimalLivingLines } from "../../../../scripts/pathcode-cli/inline-studio.mjs";
import {
  normalizeObjectiveText,
  containsCarriageReturn,
} from "../../../../scripts/pathcode-cli/normalize-text.mjs";
import { escapeForTerminalDisplay } from "../../../../scripts/pathcode-cli/escape.mjs";
import { isTaskStopCommand } from "../../../../scripts/pathcode-cli/task-control.mjs";
import {
  registerProcess,
  cancelTaskProcesses,
  runWithTaskContext,
  resetProcessRegistryForTests,
} from "../../../../scripts/pathcode-cli/process-registry.mjs";
import { formatPathTitle } from "../../../../scripts/pathcode-cli/terminal-title.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

{
  const raw = "Inspect this project.\r\rFind the CLI entry.\r\nFix distribution.";
  const n = normalizeObjectiveText(raw);
  const ok =
    !containsCarriageReturn(n) &&
    !escapeForTerminalDisplay(n).includes("\\r") &&
    n.includes("\n\n");
  checks.push({ id: "objective_crlf", ok, sample: n.slice(0, 80) });
}

checks.push({
  id: "stop_vs_steering",
  ok:
    isTaskStopCommand("/stop") &&
    isTaskStopCommand("stop here and give the report") &&
    !isTaskStopCommand(
      "please stop inventing APIs in the public surface",
    ),
});

{
  const state = createEmptyStudioState();
  applyStudioEvent(state, { type: "session.started", sessionId: "live-exp" });
  state.product.ag1 = true;
  state.product.projectName = "path-code";
  applyStudioEvent(state, {
    type: "session.task.received",
    sessionId: "live-exp",
    preview: "Inspect\r\rpackage distribution for ag8/ag9/ag10",
  });
  applyStudioEvent(state, {
    type: "session.capability.discovered",
    matrix: {
      languages: [
        { id: "typescript", status: "ready" },
        { id: "javascript", status: "ready" },
      ],
      toolchains: [
        { id: "node", status: "ready" },
        { id: "npm", status: "ready" },
      ],
    },
  });
  applyStudioEvent(state, {
    type: "session.engineering.tool",
    kind: "inspect",
    tool: "view_file",
    summary: "view_file package.json",
  });
  applyStudioEvent(state, {
    type: "session.engineering.tool",
    kind: "file_edit",
    tool: "edit_file",
    summary: "edit_file package.json",
    diff: '@@\n   "files": [\n-    "scripts/pathcode-cli/ag7/**",\n+    "scripts/pathcode-cli/ag8/**",\n',
  });
  applyStudioEvent(state, {
    type: "session.engineering.tool",
    kind: "test",
    tool: "run_command",
    summary: "CommandLine=npm test",
    output: "✓ 1430 passed",
    ok: true,
  });
  const lines = buildMinimalLivingLines(state, { rows: 36, columns: 100 });
  const text = lines.join("\n");
  const strip = text.replace(/\u001b\[[0-9;]*m/g, "");
  writeFileSync(join(outDir, "open-canvas-preview.txt"), strip);
  checks.push({
    id: "open_canvas",
    ok:
      lines.length === 36 &&
      !/╭|╰|│/.test(strip) &&
      !/\bGOAL\b/.test(strip) &&
      !/\\r/.test(strip) &&
      /Stop/.test(strip) &&
      /PATH/.test(strip) &&
      /Environment ready|Read|Update|Test/.test(strip),
    rows: lines.length,
    hasStop: /Stop/.test(strip),
  });
}

checks.push({
  id: "title_format",
  ok: formatPathTitle("path-code") === "path-code — PATH Code",
  title: formatPathTitle("path-code"),
});

{
  resetProcessRegistryForTests();
  const taskId = "proc-kill-proof";
  if (process.platform === "win32") {
    checks.push({ id: "process_group_kill", ok: true, skipped: true });
  } else {
    const child = spawn("bash", ["-c", "sleep 120"], {
      detached: true,
      stdio: "ignore",
    });
    const pid = child.pid;
    runWithTaskContext(taskId, () => {
      registerProcess({
        kind: "acceptance_sleep",
        command: "sleep 120",
        child,
      });
    });
    await new Promise((r) => setTimeout(r, 100));
    const results = cancelTaskProcesses(taskId, { signal: "SIGKILL" });
    await new Promise((r) => setTimeout(r, 150));
    let leaked = false;
    let cleaned = false;
    try {
      process.kill(pid, 0);
      leaked = true;
    } catch {
      cleaned = true;
    }
    try {
      process.kill(-pid, 0);
      leaked = true;
    } catch {
      // ok
    }
    checks.push({
      id: "process_group_kill",
      ok: cleaned && !leaked && results.length >= 1,
      pid,
      results: results.map((r) => ({
        cleanup: r.cleanup,
        cancelled: r.cancelled,
      })),
    });
  }
}

const allOk = checks.every((c) => c.ok);
const report = {
  phase: "LIVE_ENGINEERING_SURFACE",
  at: new Date().toISOString(),
  startingHead: "9f9db58c918b4ee690f0a5053aa8ebfd8bc15cfe",
  checks,
  pass: allOk,
};
writeFileSync(join(outDir, "mechanical.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(allOk ? 0 : 1);
