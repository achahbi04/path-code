#!/usr/bin/env node
/**
 * Phase A.1 — engineering report contract correction proof.
 * S2 / Phase B / Phase C remain NOT STARTED.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";
import { buildMinimalLivingLines } from "../../../../scripts/pathcode-cli/inline-studio.mjs";
import {
  buildEngineeringReportModel,
  formatEngineeringReportPlain,
  materializeEngineeringReport,
  dispositionFromOutcome,
  resolveEngineeringReportPath,
  resolveReportObjective,
  looksLikeLauncherShell,
  isTransientStatusText,
} from "../../../../scripts/pathcode-cli/engineering-report.mjs";
import { formatPlainReport } from "../../../../scripts/pathcode-cli/engineering-stream.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

function stripAnsi(s) {
  return String(s).replace(/\u001b\[[0-9;]*m/g, "");
}

{
  const d1 = dispositionFromOutcome("VERIFIED", "Verified", "VERIFIED");
  const d2 = dispositionFromOutcome("PARTIALLY_VERIFIED", "", "");
  const d3 = dispositionFromOutcome("CANCELLED", "", "");
  const d4 = dispositionFromOutcome("NOT_VERIFIED", "", "BUDGET_WALL_CLOCK");
  checks.push({
    id: "disposition_truthful",
    ok:
      d1 === "COMPLETE" &&
      d2 === "PARTIAL" &&
      d3 === "STOPPED" &&
      d4 === "BLOCKED",
    d1,
    d2,
    d3,
    d4,
  });
}

// —— A.1: launcher shell must never win Asked when a real objective exists ——
{
  const launcher = [
    "cd /Users/achahbi/Downloads/Klarapp",
    'echo "=== KLAR STATUS ==="',
    "git status --short --branch",
    'rm -rf "$HOME/.path-code/runtime-klar-phase-a"',
  ].join("\n");
  const realObjective =
    "Inspect Klarapp: run tests and typecheck; identify one solid point and one concrete risk with evidence.";

  checks.push({
    id: "launcher_shell_detected",
    ok: looksLikeLauncherShell(launcher) === true && looksLikeLauncherShell(realObjective) === false,
  });

  const polluted = {
    taskPreview: launcher,
    taskObjective: launcher,
    streamHistory: [
      { kind: "objective", title: "Objective", detail: launcher },
      { kind: "objective", title: "Objective", detail: realObjective },
      {
        kind: "narration",
        title: "PATH",
        detail: "The `npm install` command is running in the background...",
      },
      {
        kind: "command",
        title: "Run npm install",
        command: "npm install",
        ok: true,
        output: "found 1 high severity vulnerability",
      },
      {
        kind: "inspect",
        title: "Read",
        path: "package.json",
        detail: "package.json",
      },
      {
        kind: "command",
        title: "Test",
        command: "npm test",
        ok: true,
        output: "✓ 12 tests passed",
      },
      {
        kind: "command",
        title: "Typecheck",
        command: "npx tsc --noEmit",
        ok: true,
        output: "",
      },
    ],
    narrationExcerpts: [
      "The `npm install` command is running in the background...",
    ],
    engineeringHandoff:
      "Solid: existing Vitest suite is green. Risk: npm install reported 1 high-severity vulnerability.",
    ag1Checks: [
      { id: "npm-test", ok: true },
      { id: "typecheck-local-tsc", ok: true },
    ],
    resultClassification: "VERIFIED",
    terminalDisposition: "VERIFIED",
    taskBranch: "path/task-klar",
    resultSha: "abcdef1234567890",
    advancesSession: false,
  };

  const asked = resolveReportObjective(polluted, { objective: realObjective });
  const model = buildEngineeringReportModel(polluted, {
    classification: "VERIFIED",
    disposition: "VERIFIED",
    objective: realObjective,
    advancesSession: false,
    engineeringHandoff: polluted.engineeringHandoff,
  });
  const plain = formatEngineeringReportPlain(model);

  checks.push({
    id: "asked_prefers_real_objective_not_launcher",
    ok:
      asked === realObjective &&
      model.objective === realObjective &&
      !/rm -rf/.test(model.objective) &&
      !/git status --short/.test(model.objective) &&
      plain.includes(realObjective),
    asked: asked.slice(0, 80),
  });

  checks.push({
    id: "no_transient_npm_install_running_in_report",
    ok:
      !/is running in the background/i.test(plain) &&
      isTransientStatusText(
        "The `npm install` command is running in the background...",
      ) === true,
    plainSample: plain.slice(0, 400),
  });

  checks.push({
    id: "what_path_did_describes_completed_work",
    ok:
      /Inspected package\.json/i.test(plain) &&
      /Installed project dependencies/i.test(plain) &&
      (/Ran npm test/i.test(plain) || /npm test/i.test(plain)) &&
      (/typecheck/i.test(plain) || /tsc/i.test(plain)),
    whatPathDid: model.whatPathDid,
  });

  checks.push({
    id: "discoveries_are_findings_not_activity_dupes",
    ok:
      model.discoveries.length > 0 &&
      /vulnerabilit|Solid:|Risk:|passed/i.test(model.discoveries.join("\n")) &&
      !model.discoveries.every((d) => /is running/i.test(d)),
    discoveries: model.discoveries,
  });

  checks.push({
    id: "no_generic_merge_when_session_did_not_advance",
    ok: !/Merge when ready/i.test(plain),
    remaining: model.remaining,
  });
}

{
  const runtimeRoot = mkdtempSync(join(tmpdir(), "path-report-"));
  const taskId = "phase-a1-report-demo";
  const state = createEmptyStudioState();
  state.product.ag1 = true;
  state.product.projectName = "demo";
  state.product.taskId = taskId;
  applyStudioEvent(state, {
    type: "session.task.received",
    mode: "ag1",
    task:
      "Inspect the repo, run tests and typecheck, report one solid point and one risk.",
    preview:
      "Inspect the repo, run tests and typecheck, report one solid point and one risk.",
  });
  applyStudioEvent(state, {
    type: "session.engineering.narration",
    text: "The `npm install` command is running in the background...",
  });
  applyStudioEvent(state, {
    type: "session.engineering.tool",
    kind: "inspect",
    tool: "view_file",
    summary: "view_file package.json",
    path: "package.json",
  });
  applyStudioEvent(state, {
    type: "session.engineering.tool",
    kind: "command",
    tool: "run_command",
    summary: "run_command npm install",
    command: "npm install",
    output: "found 1 high severity vulnerability",
    ok: true,
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
  applyStudioEvent(state, {
    type: "session.engineering.tool",
    kind: "command",
    tool: "run_command",
    summary: "run_command npx tsc --noEmit",
    command: "npx tsc --noEmit",
    ok: true,
  });
  applyStudioEvent(state, {
    type: "session.engineering.handoff",
    summary:
      "Solid: clamp helper is covered by unit tests. Risk: one high-severity npm vulnerability remains.",
  });
  applyStudioEvent(state, {
    type: "session.engineering.result",
    classification: "VERIFIED",
    changedFiles: ["src/lib/utils.ts"],
    taskBranch: "path/task-demo",
    commitSha: "abcdef1234567890",
    baselineSha: "1234567890abcdef",
    durationMs: 90_000,
    advancesSession: false,
    checks: [
      { id: "typecheck-local-tsc", kind: "TYPECHECK", ok: true },
      { id: "npm-test", kind: "TEST", ok: true },
    ],
    timingMarks: [
      "first_engine_terminal:60000",
      "validation_start_0:80000",
      "validation_end_0:90000",
    ],
    engineeringHandoff:
      "Solid: clamp helper is covered by unit tests. Risk: one high-severity npm vulnerability remains.",
    inspectCommand: "git diff 12345678 abcdef12 --",
  });
  applyStudioEvent(state, {
    type: "session.terminal",
    disposition: "VERIFIED",
    summary: "Independent validation passed.",
  });

  process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
  const pack = materializeEngineeringReport(state.product, {
    session: {
      classification: "VERIFIED",
      disposition: "VERIFIED",
      objective: state.product.taskObjective,
      terminalSummary: "Independent validation passed.",
      changedFiles: ["src/lib/utils.ts"],
      taskBranch: "path/task-demo",
      commitSha: "abcdef1234567890",
      durationMs: 90_000,
      advancesSession: false,
      engineeringHandoff: state.product.engineeringHandoff,
    },
  });
  state.product.engineeringReportPlain = pack.plain;
  state.product.engineeringReportPath = pack.reportPath;
  state.product.reportActionNotice =
    "✓ Engineering report copied to clipboard\nSaved:\n  " + pack.reportPath;
  state.product.streamScroll = 0;

  const frame = stripAnsi(
    buildMinimalLivingLines(state, { rows: 56, columns: 100 }).join("\n"),
  );
  writeFileSync(join(outDir, "phase-a-report-canvas.txt"), frame);
  writeFileSync(join(outDir, "phase-a-report-plain.txt"), pack.plain);

  const plainViaFormat = formatPlainReport(state.product, "COMPLETE");
  const reportPath = resolveEngineeringReportPath(taskId, runtimeRoot);
  const durable = existsSync(reportPath)
    ? readFileSync(reportPath, "utf8")
    : "";

  const blankRun = frame.split("\n").filter((l) => l.trim() === "").length;
  const reportIdx = frame.indexOf("✓ COMPLETE");
  const askedIdx = frame.indexOf("Asked");

  checks.push({
    id: "canvas_shows_dedicated_report",
    ok:
      frame.startsWith("PATH ● Code") &&
      /Engineering report/i.test(frame) &&
      /✓ COMPLETE/i.test(frame) &&
      /Asked/i.test(frame) &&
      /What PATH did/i.test(frame) &&
      /Checks/i.test(frame) &&
      !/is running in the background/i.test(frame),
    hasReportHint: /Type \/report/i.test(frame),
  });
  checks.push({
    id: "asked_is_submitted_objective",
    ok:
      /Inspect the repo, run tests and typecheck/i.test(frame) &&
      /Inspect the repo, run tests and typecheck/i.test(pack.plain),
  });
  checks.push({
    id: "compact_layout_no_giant_blank_before_report",
    ok:
      reportIdx >= 0 &&
      askedIdx > reportIdx &&
      // Report should appear early in the frame (brand + blank + COMPLETE).
      reportIdx < 400 &&
      blankRun < 30,
    reportIdx,
    blankRun,
  });
  checks.push({
    id: "report_action_notice_visible",
    ok: /✓ Engineering report copied to clipboard/.test(frame) && /Saved:/.test(frame),
  });
  checks.push({
    id: "plain_report_sections",
    ok:
      /PATH ● Code — Engineering report/.test(pack.plain) &&
      /✓ COMPLETE/.test(pack.plain) &&
      /Asked/.test(pack.plain) &&
      /What PATH did/.test(pack.plain) &&
      /Important discoveries/.test(pack.plain) &&
      /Checks/.test(pack.plain) &&
      !/Merge when ready/i.test(pack.plain),
    reportChars: pack.plain.length,
  });
  checks.push({
    id: "report_file_beside_trace",
    ok: Boolean(pack.reportPath) && existsSync(reportPath),
    reportPath: pack.reportPath,
  });
  checks.push({
    id: "durable_matches_canonical_plain",
    ok: durable.trim() === pack.plain.trim(),
  });
  checks.push({
    id: "formatPlainReport_same_artifact",
    ok:
      plainViaFormat.includes("Engineering report") &&
      plainViaFormat.includes("COMPLETE") &&
      plainViaFormat.trim() === pack.plain.trim(),
  });
  checks.push({
    id: "scroll_snapped_to_latest",
    ok: state.product.streamScroll === 0,
  });
}

{
  const model = buildEngineeringReportModel(
    {
      taskPreview: "Do the thing",
      pathPhase: "Not verified",
      terminalSummary: "Task exceeded wall-clock budget.",
      resultClassification: "NOT_VERIFIED",
      terminalDisposition: "BUDGET_WALL_CLOCK",
      ag1Checks: [{ id: "npm-test", ok: false }],
    },
    { classification: "NOT_VERIFIED", disposition: "BUDGET_WALL_CLOCK" },
  );
  const plain = formatEngineeringReportPlain(model);
  writeFileSync(join(outDir, "phase-a-report-blocked.txt"), plain);
  checks.push({
    id: "wall_clock_is_blocked_not_complete",
    ok:
      model.disposition === "BLOCKED" &&
      /■ BLOCKED/.test(plain) &&
      !/✓ COMPLETE/.test(plain) &&
      /Not completed/.test(plain) &&
      /Remaining/.test(plain),
  });
}

{
  const withAdvance = buildEngineeringReportModel(
    {
      taskPreview: "Ship a fix",
      resultClassification: "VERIFIED",
      terminalDisposition: "VERIFIED",
      taskBranch: "path/task-x",
      resultSha: "abc123",
      advancesSession: true,
    },
    { classification: "VERIFIED", disposition: "VERIFIED", advancesSession: true },
  );
  const withoutAdvance = buildEngineeringReportModel(
    {
      taskPreview: "Assess only",
      resultClassification: "VERIFIED",
      terminalDisposition: "VERIFIED",
      taskBranch: "path/task-y",
      resultSha: "def456",
      advancesSession: false,
    },
    { classification: "VERIFIED", disposition: "VERIFIED", advancesSession: false },
  );
  checks.push({
    id: "merge_advice_only_when_advances_session",
    ok:
      /Merge when ready: git merge path\/task-x/.test(
        formatEngineeringReportPlain(withAdvance),
      ) &&
      !/Merge when ready/i.test(formatEngineeringReportPlain(withoutAdvance)),
  });
}

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  phase: "S1_PHASE_A1_REPORT_CONTRACT",
  s2: "NOT_STARTED",
  phaseB: "NOT_STARTED",
  phaseC: "NOT_STARTED",
  checks,
  failed: failed.map((c) => c.id),
  at: new Date().toISOString(),
};
writeFileSync(join(outDir, "phase-a-report-proof.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
