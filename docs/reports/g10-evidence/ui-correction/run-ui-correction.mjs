/**
 * G10 UI correction — composer + bracketed paste + branding unit proofs.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyComposerInput,
  createComposerState,
  PASTE_START,
  PASTE_END,
  wrapComposerLines,
  COMPOSER_MAX_ROWS,
} from "../../../../scripts/pathcode-cli/composer.mjs";
import {
  buildInlineCardLines,
  brandPathCode,
} from "../../../../scripts/pathcode-cli/inline-studio.mjs";
import { createEmptyStudioState, applyStudioEvent } from "../../../../scripts/path-studio/state.mjs";
import {
  formatPathTitle,
  setStablePathTitle,
  restoreTerminalTitle,
} from "../../../../scripts/pathcode-cli/terminal-title.mjs";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/ui-correction");
mkdirSync(outDir, { recursive: true });

const evidence = {
  schema: "pathcode.g10.ui-correction.v1",
  at: new Date().toISOString(),
  cases: {},
};

// A. Short paste
{
  let s = createComposerState();
  let r = applyComposerInput(
    s,
    `${PASTE_START}Keep backward compatibility.${PASTE_END}`,
  );
  evidence.cases.shortPaste = {
    text: r.state.text,
    submitNull: r.submit == null,
    ok:
      r.state.text === "Keep backward compatibility." && r.submit == null,
  };
  r = applyComposerInput(r.state, "\r");
  evidence.cases.shortPaste.submitAfterEnter = r.submit;
  evidence.cases.shortPaste.ok =
    evidence.cases.shortPaste.ok &&
    r.submit === "Keep backward compatibility.";
}

// B. Long single-line paste (>300)
{
  const long = "x".repeat(350);
  let r = applyComposerInput(
    createComposerState(),
    `${PASTE_START}${long}${PASTE_END}`,
  );
  const wrapped = wrapComposerLines(r.state.text, 40);
  evidence.cases.longPaste = {
    len: r.state.text.length,
    wrapRows: wrapped.length,
    submitNull: r.submit == null,
    ok: r.state.text.length === 350 && r.submit == null && wrapped.length > 1,
  };
}

// C. Multiline paste — one buffer, no auto-submit
{
  const multi = "line one\nline two\nline three";
  let r = applyComposerInput(
    createComposerState(),
    `${PASTE_START}${multi}${PASTE_END}`,
  );
  evidence.cases.multilinePaste = {
    text: r.state.text,
    submitNull: r.submit == null,
    ok: r.state.text === multi && r.submit == null,
  };
}

// D. Paste during mutation → composer only (frame assertion)
{
  const state = createEmptyStudioState();
  applyStudioEvent(state, { type: "session.started", sessionId: "ui" });
  applyStudioEvent(state, {
    type: "session.engineering.activity",
    label: "Applying",
    detail: "src/add.js",
  });
  state.product.awaitingInput = true;
  state.product.composerText =
    "Keep backward compatibility and do not change the public API.";
  const frame = buildInlineCardLines(state, { rows: 24, columns: 100 }).join(
    "\n",
  );
  const bodyWithoutComposer = frame
    .split("\n")
    .filter((l) => !l.includes("> "))
    .join("\n");
  evidence.cases.pasteInFrame = {
    composerVisible: frame.includes("Keep backward compatibility"),
    notInActivityAlone:
      !bodyWithoutComposer.includes("do not change the public API") ||
      frame.includes("> Keep backward"),
    ok:
      frame.includes("> Keep backward compatibility") &&
      !/\bPROJECT\b/.test(frame.split("\n")[0] || ""),
  };
}

// Branding
{
  const prev = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  process.env.FORCE_COLOR = "1";
  const branded = brandPathCode();
  evidence.cases.branding = {
    hasWhitePath: /\u001b\[37mPATH/.test(branded),
    hasYellowDot: /\u001b\[33m●/.test(branded),
    hasWhiteCode: /\u001b\[37mCode/.test(branded),
    noCyan: !/\u001b\[36m/.test(branded),
    ok: false,
  };
  evidence.cases.branding.ok =
    evidence.cases.branding.hasWhitePath &&
    evidence.cases.branding.hasYellowDot &&
    evidence.cases.branding.hasWhiteCode &&
    evidence.cases.branding.noCyan;
  if (prev === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = prev;
}

// Title
{
  /** @type {string[]} */
  const writes = [];
  const stdout = { write: (c) => writes.push(String(c)) };
  const title = setStablePathTitle({
    stdout,
    projectName: "pathcode-g10-operator-demo",
  });
  restoreTerminalTitle({ stdout });
  evidence.cases.title = {
    title,
    expected: formatPathTitle("pathcode-g10-operator-demo"),
    wroteOsc: writes.some((w) => w.includes("]0;")),
    ok:
      title === "pathcode-g10-operator-demo — PATH Code" &&
      writes.some((w) => w.includes("]0;")),
  };
}

// Compact result
{
  const state = createEmptyStudioState();
  applyStudioEvent(state, { type: "session.started", sessionId: "ui" });
  applyStudioEvent(state, {
    type: "session.engineering.result",
    sessionId: "ui",
    classification: "VERIFIED",
    changedFiles: ["a.js", "b.js", "c.js"],
    commitSha: "7c645daeabcdef",
    taskBranch: "path/task-demo",
    engineeringHandoff:
      "This is a very long model prose paragraph that must not appear in the primary result surface of the living UI.",
    inspectCommand: "git diff --no-ext-diff abc def --",
  });
  const frame = buildInlineCardLines(state, { rows: 30, columns: 100 }).join(
    "\n",
  );
  evidence.cases.compactResult = {
    hasVerified: /VERIFIED/.test(frame),
    hasSha: /7c645dae/.test(frame),
    noHandoffProse: !frame.includes("very long model prose"),
    noInspectCmd: !frame.includes("git diff --no-ext-diff"),
    ok: false,
  };
  evidence.cases.compactResult.ok =
    evidence.cases.compactResult.hasVerified &&
    evidence.cases.compactResult.hasSha &&
    evidence.cases.compactResult.noHandoffProse &&
    evidence.cases.compactResult.noInspectCmd;
}

// Viewport wide/narrow
{
  const state = createEmptyStudioState();
  state.product.ag1 = true;
  state.product.projectName = "demo";
  state.product.awaitingInput = true;
  state.product.composerText = "x".repeat(200);
  const wide = buildInlineCardLines(state, { rows: 24, columns: 140 });
  const narrow = buildInlineCardLines(state, { rows: 24, columns: 60 });
  const overflow = [...wide, ...narrow].some(
    (l) => l.replace(/\u001b\[[0-9;]*m/g, "").length > 200,
  );
  evidence.cases.viewport = {
    wideLines: wide.length,
    narrowLines: narrow.length,
    hasComposerWide: wide.join("\n").includes("> "),
    hasComposerNarrow: narrow.join("\n").includes("> "),
    noLiteralEscapes: ![...wide, ...narrow].some((l) => l.includes("\\u001b")),
    ok:
      wide.join("\n").includes("PATH ● Code") &&
      narrow.join("\n").includes("PATH ● Code") &&
      !overflow,
  };
}

evidence.verdict = Object.values(evidence.cases).every((c) => c.ok === true)
  ? "PASS"
  : "PARTIAL";

writeFileSync(join(outDir, "ui-correction.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ verdict: evidence.verdict, cases: Object.fromEntries(Object.entries(evidence.cases).map(([k, v]) => [k, v.ok])) }));
process.exit(evidence.verdict === "PASS" ? 0 : 1);
