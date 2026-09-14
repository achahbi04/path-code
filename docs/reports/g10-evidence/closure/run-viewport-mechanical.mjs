/**
 * G10 closure §9 — cockpit viewport/frame mechanical checks (not operator PASS).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";
import {
  buildInlineCardLines,
  assembleAnsiFrame,
  LIVING_PRODUCT_MIN_COLUMNS,
} from "../../../../scripts/pathcode-cli/inline-studio.mjs";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/closure");
mkdirSync(outDir, { recursive: true });

const evidence = {
  schema: "pathcode.g10.closure.viewport.v1",
  at: new Date().toISOString(),
  note: "Mechanical frame checks only. MANUAL_UI_ACCEPTANCE remains PENDING_OPERATOR_REVIEW.",
  livingProductMinColumns: LIVING_PRODUCT_MIN_COLUMNS,
};

function buildState() {
  let state = createEmptyStudioState();
  state.sessionId = "viewport";
  const events = [
    { type: "session.task.received", preview: "fix very-long-named-module" },
    { type: "session.capability.preparing", detail: "Preparing environment" },
    { type: "session.capability.indexing", detail: "Indexing", phase: "started" },
    {
      type: "session.engineering.activity",
      activity: "code_intelligence",
      label: "Code intelligence",
      detail: "symbol query",
    },
    {
      type: "session.capability.collaborate",
      engine: "copilot",
      phase: "handoff",
      label: "Collaborating",
    },
    {
      type: "session.engineering.activity",
      activity: "repairing",
      label: "Repairing",
    },
    {
      type: "session.engineering.activity",
      activity: "steering",
      label: "Steering pending",
      detail: "Keep API",
    },
    {
      type: "session.engineering.activity",
      activity: "background",
      label: "Background validation",
    },
    {
      type: "session.edit.summary",
      path: "packages/very-long-package-name/src/deeply/nested/file-with-long-name.ts",
      kind: "edit",
    },
    {
      type: "session.engineering.result",
      classification: "VERIFIED",
      changedFiles: Array.from({ length: 24 }, (_, i) => `src/f${i}-long-name.js`),
      taskBranch: "path/task-demo",
      commitSha: "abcdef1234567890",
    },
  ];
  for (const e of events) {
    state = applyStudioEvent(state, { sessionId: "viewport", ...e }) || state;
  }
  state.product.changedFileTotal = 24;
  state.product.awaitingInput = true;
  state.product.cockpitPrompt = "PATH ● Code > ";
  state.product.ag1 = true;
  return state;
}

function checkFrame(label, columns, rows = 36) {
  const state = buildState();
  const lines = buildInlineCardLines(state, { columns, rows });
  const frame = assembleAnsiFrame(lines, { columns, rows });
  const text = Array.isArray(frame) ? frame.join("\n") : String(frame || "");
  const literalEscapes = /\\u001b|\\x1b|\\\\u001b/.test(text);
  const plain = text.replace(/\u001b\[[0-9;]*m/g, "");
  return {
    label,
    columns,
    lineCount: Array.isArray(lines) ? lines.length : 0,
    chars: text.length,
    literalEscapeSequences: literalEscapes,
    hasAnsiSgr: /\u001b\[/.test(text),
    containsGoal: /GOAL/.test(plain),
    containsPath: /\bPATH\b/.test(plain),
    containsComplete: /COMPLETE/.test(plain),
    containsComposer: />/.test(plain),
    preview: plain.slice(0, 500),
  };
}

evidence.wide = checkFrame("wide", 140);
evidence.narrow = checkFrame("narrow", 60);
evidence.resizeWideToNarrow = checkFrame("resize-narrow", 70);
evidence.resizeNarrowToWide = checkFrame("resize-wide", 120);
evidence.mechanicalOk =
  evidence.wide.literalEscapeSequences === false &&
  evidence.narrow.literalEscapeSequences === false &&
  evidence.wide.containsGoal === true &&
  evidence.wide.containsPath === true &&
  evidence.wide.containsComplete === true;
evidence.MANUAL_UI_ACCEPTANCE = "PENDING_OPERATOR_REVIEW";
evidence.verdict = evidence.mechanicalOk ? "MECHANICAL_OK" : "PARTIAL";

writeFileSync(
  join(outDir, "viewport-mechanical.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
writeFileSync(
  join(outDir, "viewport-wide.preview.txt"),
  evidence.wide.preview + "\n",
);
writeFileSync(
  join(outDir, "viewport-narrow.preview.txt"),
  evidence.narrow.preview + "\n",
);
console.log(
  JSON.stringify({
    verdict: evidence.verdict,
    MANUAL_UI_ACCEPTANCE: evidence.MANUAL_UI_ACCEPTANCE,
    wideProject: evidence.wide.containsProject,
  }),
);
