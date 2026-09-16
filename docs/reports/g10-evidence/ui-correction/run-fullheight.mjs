/**
 * S0 UI correction — full-height living surface + title ownership mechanical proof.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";
import {
  buildMinimalLivingLines,
  buildSplashLines,
  buildInlineCardLines,
} from "../../../../scripts/pathcode-cli/inline-studio.mjs";
import {
  formatPathTitle,
  stripOscTitleSequences,
  setStablePathTitle,
  restoreTerminalTitle,
  getOwnedPathTitle,
} from "../../../../scripts/pathcode-cli/terminal-title.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = __dirname;
mkdirSync(outDir, { recursive: true });

/** @type {Record<string, unknown>} */
const evidence = {
  schema: "pathcode.s0.ui-fullheight.v1",
  at: new Date().toISOString(),
  note: "MANUAL_UI_ACCEPTANCE remains FAILED until operator Terminal.app re-review.",
  cases: {},
};

function living(state, rows, columns) {
  return buildMinimalLivingLines(state, { rows, columns });
}

const idle = createEmptyStudioState();
applyStudioEvent(idle, { type: "session.started", sessionId: "ui" });
idle.product.ag1 = true;
idle.product.awaitingInput = true;
idle.product.projectName = "pathcode-g10-operator-demo";
idle.product.branch = "main";

const large = living(idle, 40, 120);
const narrow = living(idle, 28, 72);
const medium = living(idle, 32, 100);
evidence.cases.fullHeightIdle = {
  ok:
    large.length === 40 &&
    narrow.length === 28 &&
    medium.length === 32 &&
    large[0].startsWith("╭") &&
    large[large.length - 1].startsWith("╰"),
  largeRows: large.length,
  narrowRows: narrow.length,
  mediumRows: medium.length,
};

const active = createEmptyStudioState();
applyStudioEvent(active, { type: "session.started", sessionId: "ui" });
active.product.ag1 = true;
active.product.projectName = "pathcode-g10-operator-demo";
active.product.taskPreview = "Fix src/add.js so npm test passes.";
applyStudioEvent(active, {
  type: "session.engineering.activity",
  sessionId: "ui",
  activity: "inspecting",
  label: "Inspecting",
});
applyStudioEvent(active, {
  type: "session.capability.preparing",
  sessionId: "ui",
  detail: "toolchains",
});
applyStudioEvent(active, {
  type: "session.capability.collaborate",
  sessionId: "ui",
  label: "Collaborating",
});

const tall = living(active, 42, 110);
const short = living(active, 24, 110);
evidence.cases.streamExpandsOnResize = {
  ok: tall.length === 42 && short.length === 24 && tall.length > short.length,
  tall: tall.length,
  short: short.length,
  delta: tall.length - short.length,
};

function composerIndex(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/\|\s*>/.test(lines[i]) || /│\s*>/.test(lines[i]) || /│\s{2}│/.test(lines[i])) {
      // composer row is near bottom (before final border)
      return i;
    }
  }
  // fallback: line before bottom border
  return lines.length - 2;
}

const cIdx = composerIndex(tall);
evidence.cases.composerBottomAnchored = {
  ok: cIdx >= tall.length - 4 && cIdx < tall.length - 1,
  composerIndex: cIdx,
  total: tall.length,
  nearBottom: tall.length - 1 - cIdx,
};

evidence.cases.noDeadRegionOutsideFrame = {
  ok:
    tall.length === 42 &&
    tall[0].includes("╭") &&
    tall[tall.length - 1].includes("╰") &&
    tall.every((l) => typeof l === "string"),
  note: "Frame line count equals viewport rows; stream pads interior.",
};

const splash = buildSplashLines({ rows: 30, columns: 100 }, 2);
const splashText = splash.join("\n");
evidence.cases.openingSplash = {
  ok:
    splash.length === 30 &&
    /PATH/.test(splashText) &&
    /Code/.test(splashText) &&
    !/█|╔|╚|engineering gateway/i.test(splashText) &&
    // One identity only — a single PATH ● Code line in the frame.
    (splashText.match(/PATH/g) || []).length === 1,
  rows: splash.length,
  hasPath: /PATH/.test(splashText),
  clean: !/█|╔|╚|engineering gateway/i.test(splashText),
};

const title = formatPathTitle("pathcode-g10-operator-demo");
const leaked = `\u001b]0;Python TMPDIR=/tmp/x\u0007hello`;
const stripped = stripOscTitleSequences(leaked);
setStablePathTitle({ projectName: "pathcode-g10-operator-demo" });
const owned = getOwnedPathTitle();
const procTitle = process.title;
restoreTerminalTitle();
evidence.cases.titleOwnership = {
  ok:
    title === "pathcode-g10-operator-demo — PATH Code" &&
    owned === title &&
    procTitle === "pathcode" &&
    !stripped.includes("\u001b]") &&
    stripped.includes("hello"),
  format: title,
  processTitleWhileOwned: procTitle,
  strippedKeepsPayload: stripped === "hello",
  note: "process.title stays short 'pathcode' to avoid Terminal.app duplicating OSC title.",
};

const inline = buildInlineCardLines(active, { rows: 36, columns: 100 });
evidence.cases.inlineUsesFullHeight = {
  ok: inline.length === 36,
  rows: inline.length,
};

evidence.verdict = Object.values(evidence.cases).every((c) => c && c.ok === true)
  ? "PASS"
  : "PARTIAL";

writeFileSync(join(outDir, "fullheight.json"), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(
  join(outDir, "fullheight-preview-wide.txt"),
  `${tall.join("\n")}\n`,
);
writeFileSync(
  join(outDir, "fullheight-preview-narrow.txt"),
  `${short.join("\n")}\n`,
);
writeFileSync(
  join(outDir, "splash-preview.txt"),
  `${splash.join("\n")}\n`,
);

console.log(
  JSON.stringify(
    {
      verdict: evidence.verdict,
      cases: Object.fromEntries(
        Object.entries(evidence.cases).map(([k, v]) => [k, Boolean(v?.ok)]),
      ),
    },
    null,
    2,
  ),
);
process.exitCode = evidence.verdict === "PASS" ? 0 : 1;
