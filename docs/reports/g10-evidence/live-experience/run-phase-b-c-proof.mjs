#!/usr/bin/env node
/**
 * Phase B/C — live intelligence, scroll, ANSI, splash, steering proof.
 * S2 remains NOT STARTED.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";
import {
  buildMinimalLivingLines,
  buildSplashLines,
  brandPathLogoLarge,
} from "../../../../scripts/pathcode-cli/inline-studio.mjs";
import {
  renderStreamOp,
  fitCanvasLine,
} from "../../../../scripts/pathcode-cli/engineering-stream.mjs";
import {
  paintCodeLine,
  stripAnsiSequences,
} from "../../../../scripts/pathcode-cli/syntax-paint.mjs";
import {
  applyComposerInput,
  createComposerState,
} from "../../../../scripts/pathcode-cli/composer.mjs";
import {
  isOperatorQuestion,
  buildSteeringContinuePrompt,
  extractEngineeringNarration,
} from "../../../../scripts/pathcode-cli/ag8/narration.mjs";
import {
  buildEngineeringReportModel,
  formatEngineeringReportPlain,
} from "../../../../scripts/pathcode-cli/engineering-report.mjs";
import { formatPathTitle } from "../../../../scripts/pathcode-cli/terminal-title.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

function stripAnsi(s) {
  return String(s).replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\u001b./g, "");
}

{
  const dirty = "const x = \u001b[38;5;180m\"hi\"\u001b[0m;";
  const painted = paintCodeLine(dirty, "js");
  const plain = stripAnsi(painted);
  checks.push({
    id: "ansi_residue_stripped_before_paint",
    ok:
      stripAnsiSequences(dirty) === 'const x = "hi";' &&
      !/38;5;180m/.test(plain) &&
      !/38;5;180m/.test(painted.replace(/\u001b\[[0-9;]*m/g, "")),
    plain,
  });

  const line = fitCanvasLine(
    `\u001b[48;2;18;42;24m${paintCodeLine('const msg = "hello world";', "js")}\u001b[0m`,
    40,
  );
  checks.push({
    id: "fit_canvas_no_csi_residue",
    ok: !/38;5;\d+m/.test(stripAnsi(line)) && !/^\[/.test(stripAnsi(line)),
    line: stripAnsi(line),
  });
}

{
  const ops = renderStreamOp(
    {
      kind: "activity",
      title: "Copilot Researching",
      detail: "looking at tests",
    },
    80,
  );
  const text = stripAnsi(ops.join("\n"));
  checks.push({
    id: "provider_names_scrubbed_from_stream_titles",
    ok: !/Copilot/i.test(text) && !/Antigravity/i.test(text),
    text,
  });

  const narr = extractEngineeringNarration(
    "Antigravity found the bug. Copilot agrees the fix belongs in the test.",
  );
  checks.push({
    id: "narration_strips_provider_names",
    ok:
      narr.text.length > 10 &&
      !/Antigravity/i.test(narr.text) &&
      !/Copilot/i.test(narr.text),
    text: narr.text,
  });
}

{
  checks.push({
    id: "operator_question_detection",
    ok:
      isOperatorQuestion(
        "What specifically made you focus on the server layer?",
      ) === true &&
      isOperatorQuestion("don't modify that file") === false,
  });
  const prompt = buildSteeringContinuePrompt(
    "What specifically made you focus on the server layer? Show me the files.",
  );
  checks.push({
    id: "steering_question_prompt_asks_for_evidence",
    ok:
      /Answer substantively/i.test(prompt) &&
      /concrete paths/i.test(prompt) &&
      /server layer/i.test(prompt),
  });
}

{
  let composer = createComposerState();
  const pageUp = applyComposerInput(composer, "\u001b[5~");
  checks.push({
    id: "pageup_scrolls_even_with_composer_text",
    ok: false, // filled below
  });
  composer = createComposerState();
  composer = {
    ...composer,
    text: "focus on the build",
    cursor: "focus on the build".length,
  };
  const withText = applyComposerInput(composer, "\u001b[5~");
  const wheel = applyComposerInput(withText.state, "\u001b[A");
  checks[checks.length - 1] = {
    id: "pageup_scrolls_even_with_composer_text",
    ok:
      (withText.streamScrollDelta || 0) > 0 &&
      (wheel.streamScrollDelta || 0) > 0,
    pageUp: withText.streamScrollDelta,
    wheel: wheel.streamScrollDelta,
  };
}

{
  const state = createEmptyStudioState();
  state.product.ag1 = true;
  state.product.projectName = "demo";
  state.product.taskStartedAt = Date.now() - 90_000;
  state.product.lastActivityAt = Date.now() - 5_000;
  applyStudioEvent(state, {
    type: "session.task.received",
    mode: "ag1",
    task: "Fix the failing test",
  });
  for (let i = 0; i < 40; i += 1) {
    applyStudioEvent(state, {
      type: "session.engineering.narration",
      text: `Finding paragraph ${i}: the existing API already covers this path.`,
    });
  }
  applyStudioEvent(state, {
    type: "session.engineering.busy",
    label: "Waiting for engineering result",
    detail: "provider turn",
    since: Date.now() - 37_000,
  });
  applyStudioEvent(state, {
    type: "session.engineering.steer",
    phase: "queued",
    text: "What specifically made you focus on the server layer?",
  });

  state.product.streamScroll = 12;
  const scrolled = stripAnsi(
    buildMinimalLivingLines(state, { rows: 30, columns: 100 }).join("\n"),
  );
  writeFileSync(join(outDir, "phase-b-scroll-preview.txt"), scrolled);
  checks.push({
    id: "scroll_preserves_offset_while_running",
    ok:
      state.product.streamScroll > 0 &&
      /Finding paragraph/i.test(scrolled) &&
      /Jump to latest/i.test(scrolled) &&
      (/Waiting for engineering result/i.test(scrolled) ||
        /elapsed/i.test(scrolled)),
    scroll: state.product.streamScroll,
  });
  checks.push({
    id: "steer_status_visible_in_stream",
    ok: state.product.streamHistory.some(
      (e) => e && e.kind === "steer" && e.phase === "queued",
    ),
  });
  // Follow-latest frame must show guidance + heartbeat.
  state.product.streamScroll = 0;
  const latest = stripAnsi(
    buildMinimalLivingLines(state, { rows: 36, columns: 100 }).join("\n"),
  );
  checks.push({
    id: "follow_latest_shows_steer_and_heartbeat",
    ok:
      /Guidance queued|Guidance received|Applying your guidance/i.test(latest) &&
      (/Waiting for engineering result/i.test(latest) || /◐|◓|◑|◒/.test(latest)),
  });
}

{
  const splash = stripAnsi(
    buildSplashLines({ rows: 24, columns: 80 }, 0).join("\n"),
  );
  writeFileSync(join(outDir, "phase-c-splash-preview.txt"), splash);
  const mark = stripAnsi(brandPathLogoLarge(0).join("\n"));
  checks.push({
    id: "splash_is_centered_path_code_only",
    ok:
      /PATH\s+●\s+Code/.test(splash) &&
      !/gateway/i.test(splash) &&
      !/engineering gateway/i.test(splash) &&
      mark.includes("PATH") &&
      mark.includes("Code"),
    mark,
  });
}

{
  checks.push({
    id: "title_format_project_path_code",
    ok: formatPathTitle("Klarapp") === "Klarapp — PATH Code",
  });
}

{
  const model = buildEngineeringReportModel(
    {
      taskPreview:
        "Inspect Klarapp: run tests and typecheck; identify one solid point and one risk.",
      taskObjective:
        "Inspect Klarapp: run tests and typecheck; identify one solid point and one risk.",
      projectFiles: ["package-lock.json"],
      resultClassification: "VERIFIED",
      terminalDisposition: "VERIFIED",
      taskBranch: "path/task-a",
      resultSha: "abc123",
      advancesSession: true,
      engineeringHandoff:
        "Solid: tests are green. Risk: one high-severity npm advisory remains.",
      streamHistory: [
        {
          kind: "objective",
          detail:
            "Inspect Klarapp: run tests and typecheck; identify one solid point and one risk.",
        },
      ],
    },
    {
      classification: "VERIFIED",
      disposition: "VERIFIED",
      advancesSession: true,
      changedFiles: ["package-lock.json"],
      engineeringHandoff:
        "Solid: tests are green. Risk: one high-severity npm advisory remains.",
    },
  );
  const plain = formatEngineeringReportPlain(model);
  checks.push({
    id: "assessment_hides_lockfile_churn_and_merge",
    ok:
      !/package-lock\.json/.test(plain.match(/Changed[\s\S]*?\n\n/)?.[0] || "") &&
      !/Merge when ready/i.test(plain) &&
      /Solid:|Risk:/i.test(plain),
    remaining: model.remaining,
    files: model.files,
  });
}

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  phase: "S1_PHASE_B_C_LIVE_FEEL",
  s2: "NOT_STARTED",
  checks,
  failed: failed.map((c) => c.id),
  at: new Date().toISOString(),
};
writeFileSync(join(outDir, "phase-b-c-proof.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
