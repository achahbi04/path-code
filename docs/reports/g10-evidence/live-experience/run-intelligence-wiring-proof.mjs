#!/usr/bin/env node
/**
 * Live-experience intelligence wiring proof.
 *
 * Proves PATH carries engine narration, operator steering, busy heartbeat,
 * and a copyable plain report — without provider-name product narrative.
 */
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";
import { buildMinimalLivingLines } from "../../../../scripts/pathcode-cli/inline-studio.mjs";
import {
  formatPlainReport,
} from "../../../../scripts/pathcode-cli/engineering-stream.mjs";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "../../../../scripts/pathcode-cli/paths.mjs";
import {
  mapCopilotSdkEvent,
  toSessionEvent,
} from "../../../../scripts/pathcode-cli/ag10/events.mjs";
import { extractEngineeringNarration } from "../../../../scripts/pathcode-cli/ag8/narration.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

function stripAnsi(s) {
  return String(s).replace(/\u001b\[[0-9;]*m/g, "");
}

{
  // Copilot assistant.message must become narration, not "Researching".
  const mapped = mapCopilotSdkEvent({
    type: "assistant.message",
    data: {
      content:
        "The production implementation already uses the ctx-object API. The old call is isolated to the test, so I'm correcting the test rather than changing production behavior.",
      id: "msg-1",
    },
  });
  const session = mapped ? toSessionEvent(mapped) : null;
  checks.push({
    id: "copilot_assistant_maps_to_narration",
    ok:
      session?.type === "session.engineering.narration" &&
      /ctx-object API/.test(String(session.text || "")) &&
      !/Researching/i.test(String(session.label || "")),
    sessionType: session?.type || null,
  });

  const toolMapped = mapCopilotSdkEvent({
    type: "tool.execution_start",
    data: {
      toolName: "bash",
      callId: "c1",
      arguments: { command: "npm test" },
    },
  });
  const toolSession = toolMapped ? toSessionEvent(toolMapped) : null;
  checks.push({
    id: "copilot_tool_start_carries_command",
    ok:
      toolSession?.type === "session.engineering.tool" &&
      toolSession.command === "npm test",
    toolSession,
  });

  const editMapped = mapCopilotSdkEvent({
    type: "tool.execution_start",
    data: {
      toolName: "edit_file",
      callId: "c2",
      arguments: { path: "src/lib/utils.ts" },
    },
  });
  const editSession = editMapped ? toSessionEvent(editMapped) : null;
  checks.push({
    id: "copilot_edit_maps_to_stream_tool",
    ok:
      editSession?.type === "session.engineering.tool" &&
      editSession.path === "src/lib/utils.ts" &&
      editSession.kind === "file_edit",
    editSession,
  });
}

{
  const raw =
    "Thought: internal plan\n\nI'm checking the failing tests now.\n\nThe production clamp helper already returns a number.";
  const narr = extractEngineeringNarration(raw);
  checks.push({
    id: "narration_strips_cot_keeps_explanation",
    ok:
      /checking the failing tests/i.test(narr.text) &&
      !/Thought:|internal plan/i.test(narr.text),
    excerpt: narr.text.slice(0, 160),
  });
}

{
  const state = createEmptyStudioState();
  state.product.ag1 = true;
  state.product.projectName = "demo";
  applyStudioEvent(state, {
    type: "session.task.received",
    mode: "ag1",
    preview: "Fix the trial type error without changing clamp behavior",
  });
  applyStudioEvent(state, {
    type: "session.engineering.narration",
    text: [
      "I'm checking the failing typecheck now.",
      "The production clamp helper already returns a number. The type error is isolated to the trial constant, so I'm correcting that assignment rather than changing clamp behavior.",
    ].join("\n\n"),
  });
  applyStudioEvent(state, {
    type: "session.operator.note",
    text: "don't change application code",
  });
  applyStudioEvent(state, {
    type: "session.engineering.narration",
    text: "Taking that into the active engineering session now.",
  });
  applyStudioEvent(state, {
    type: "session.engineering.tool",
    kind: "file_edit",
    tool: "edit_file",
    summary: "edit_file src/lib/utils.ts",
    path: "src/lib/utils.ts",
    diff:
      '@@ -1,3 +1,3 @@\n-export const __pathcodeTrial: number = "not a number";\n+export const __pathcodeTrial: number = 0;\n export function clamp(n: number) {\n   return Math.max(0, n);\n }\n',
    added: 1,
    removed: 1,
  });
  applyStudioEvent(state, {
    type: "session.engineering.busy",
    label: "Running tests",
    detail: "npm test",
    since: Date.now() - 9_000,
  });
  checks.push({
    id: "busy_heartbeat_from_real_state",
    ok:
      state.product.busyLabel === "Running tests" &&
      typeof state.product.busySince === "number",
    busyLabel: state.product.busyLabel,
  });
  applyStudioEvent(state, {
    type: "session.capability.collaborate",
    engine: "copilot",
    phase: "repair",
    detail: "repairing validation failures",
  });
  applyStudioEvent(state, {
    type: "session.engineering.tool",
    kind: "command",
    tool: "run_command",
    summary: "run_command npm test",
    command: "npm test",
    output: "✓ 41 tests passed",
    ok: true,
  });

  // Mid-session canvas (before COMPLETE) — follow-latest still shows live work.
  const liveFrame = stripAnsi(
    buildMinimalLivingLines(state, { rows: 48, columns: 100 }).join("\n"),
  );
  writeFileSync(join(outDir, "intelligence-live-preview.txt"), liveFrame);

  applyStudioEvent(state, {
    type: "session.engineering.result",
    classification: "VERIFIED",
    changedFiles: ["src/lib/utils.ts"],
    taskBranch: "path/task-demo",
    commitSha: "abcdef1234567890",
    checks: [{ id: "test-local", kind: "TEST", ok: true }],
    timingMarks: [
      "first_engine_terminal:12000",
      "validation_start_0:45000",
      "validation_end_0:52000",
    ],
  });

  // Scroll to the top of durable history after COMPLETE.
  state.product.streamScroll = 10_000;
  const frame = stripAnsi(
    buildMinimalLivingLines(state, { rows: 48, columns: 100 }).join("\n"),
  );
  writeFileSync(join(outDir, "intelligence-canvas-preview.txt"), frame);

  const report = formatPlainReport(state.product, "COMPLETE");
  writeFileSync(join(outDir, "intelligence-plain-report.txt"), `${report}\n`);

  const historyKinds = (state.product.streamHistory || []).map((h) => h.kind);
  const historyBlob = JSON.stringify(state.product.streamHistory || []);
  checks.push({
    id: "stream_carries_narration_operator_tools",
    ok:
      historyKinds.includes("narration") &&
      historyKinds.includes("operator") &&
      liveFrame.startsWith("PATH ● Code") &&
      /checking the failing typecheck/i.test(liveFrame) &&
      /don't change application code/i.test(liveFrame) &&
      /Update\(src\/lib\/utils\.ts\)|● Update/i.test(liveFrame) &&
      /41 tests passed|npm test/i.test(liveFrame) &&
      /ctx-object|clamp helper|trial constant/i.test(historyBlob) &&
      !/\bCopilot engineering turn\b/i.test(liveFrame) &&
      !/\bAntigravity engineering turn\b/i.test(liveFrame) &&
      !/\bvia copilot\b/i.test(liveFrame),
    historyKinds,
  });
  checks.push({
    id: "history_scrollable_after_complete",
    ok:
      frame.startsWith("PATH ● Code") &&
      (/checking the failing typecheck/i.test(frame) ||
        /don't change application code/i.test(frame) ||
        /Jump to latest/i.test(frame)),
  });
  checks.push({
    id: "collaborate_uses_path_labels",
    ok:
      /Repairing/i.test(liveFrame) &&
      !/^Copilot$/m.test(liveFrame) &&
      !(state.product.streamHistory || []).some((h) =>
        /^(Copilot|Antigravity)$/i.test(String(h.title || "")),
      ),
  });
  checks.push({
    id: "timing_summary_on_result",
    ok:
      state.product.timingSummary &&
      typeof state.product.timingSummary.providerWait === "number" &&
      typeof state.product.timingSummary.validation === "number",
    timingSummary: state.product.timingSummary,
  });
  checks.push({
    id: "plain_report_copyable",
    ok:
      /COMPLETE/i.test(report) &&
      /Asked/i.test(report) &&
      /Engineering report/i.test(report) &&
      (/clamp helper|trial constant|npm test|utils\.ts/i.test(report) ||
        /checking the failing typecheck/i.test(report)) &&
      !/\u001b\[/.test(report),
    reportChars: report.length,
  });
}

{
  const proj = mkdtempSync(join(tmpdir(), "path-intel-"));
  spawnSync("git", ["init"], { cwd: proj, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: proj });
  spawnSync("git", ["config", "user.name", "t"], { cwd: proj });
  writeFileSync(join(proj, "readme.md"), "ok\n");
  spawnSync("git", ["add", "."], { cwd: proj });
  spawnSync("git", ["commit", "-m", "init"], { cwd: proj });

  const packageRoot = resolvePathPackageRoot();
  const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
  process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
  const rt = createGatewayRuntime({ packageRoot, runtimeRoot });
  await rt.bindProject({ cwd: proj });
  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  rt.onEvent((env) => {
    if (env?.event && typeof env.event.type === "string") {
      events.push(env.event);
    }
  });
  const started = await rt.startTask({
    objective: "Fix the trial type error",
  });
  // Mid-cycle natural steering while the fake engine runs.
  const steered = rt.steerTask(started.taskId, "don't change application code");
  await rt.awaitTask(started.taskId);

  const types = events.map((e) => e.type);
  const narrations = events.filter(
    (e) => e.type === "session.engineering.narration",
  );
  const notes = events.filter((e) => e.type === "session.operator.note");
  writeFileSync(
    join(outDir, "intelligence-gateway-events.json"),
    JSON.stringify({ types, narrations, notes, steered }, null, 2),
  );

  checks.push({
    id: "gateway_fake_emits_narration_and_steer",
    ok:
      steered?.ok === true &&
      types.includes("session.engineering.narration") &&
      types.includes("session.operator.note") &&
      types.includes("session.engineering.busy") &&
      narrations.some((n) => /clamp helper|trial constant/i.test(String(n.text || ""))) &&
      notes.some((n) => /don't change application code/i.test(String(n.text || ""))),
    steered,
    narrationCount: narrations.length,
    noteCount: notes.length,
  });
}

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  checks,
  failed: failed.map((c) => c.id),
  at: new Date().toISOString(),
};
writeFileSync(
  join(outDir, "intelligence-wiring-proof.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
