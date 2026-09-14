/**
 * G9 living cockpit acceptance — real session events through PATH studio sink.
 *
 * Usage: node run-live-cockpit.mjs <label> <projectRoot> <taskText> <outDir>
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareEngineeringEnvironment } from "../../../scripts/pathcode-cli/ag9/prepare.mjs";
import { runAntigravityEngineeringSession } from "../../../scripts/pathcode-cli/ag1/session.mjs";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../scripts/path-studio/state.mjs";

const checkout = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const label = process.argv[2] || "cockpit-js";
const projectRoot = resolve(process.argv[3]);
const taskText = process.argv[4] || "Fix the failing test.";
const outDir = resolve(
  process.argv[5] || join(checkout, "docs/reports/g9-evidence/live"),
);
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g9-evidence/runtime-live-cockpit");

mkdirSync(outDir, { recursive: true });
process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;

const eventsPath = join(outDir, `${label}.events.ndjson`);
writeFileSync(eventsPath, "");

/** @type {object[]} */
const events = [];
let studio = createEmptyStudioState();

function record(type, fields = {}) {
  const ev = { type, ...fields, at: Date.now() };
  events.push(ev);
  writeFileSync(eventsPath, `${JSON.stringify(ev)}\n`, { flag: "a" });
  try {
    studio = applyStudioEvent(studio, ev) || studio;
  } catch {
    /* state apply best-effort */
  }
}

await prepareEngineeringEnvironment({
  projectRoot,
  runtimeRoot,
  taskText,
  startServices: false,
  emit: (e) => {
    if (e && typeof e.type === "string") record(e.type, e);
  },
});

const prompt = {
  write: () => {},
  isStopped: () => false,
  isCycleCancelRequested: () => false,
};

const result = await runAntigravityEngineeringSession(prompt, {
  taskText,
  projectRoot,
  checkoutRoot: checkout,
  cardsOwnProgress: true,
  wallClockMs: 700_000,
  sessionEventEmit: (type, fields = {}) => record(type, fields),
});

const types = events.map((e) => e.type);
const has = (re) => types.some((t) => re.test(String(t)));

const summary = {
  label,
  classification: result?.classification || null,
  primaryUntouched: result?.primaryUntouched ?? null,
  commitSha: result?.commitSha || null,
  eventCount: events.length,
  visible: {
    preparing: has(/capability\.preparing|capability\.provisioning/),
    lsp: has(/capability\.provisioning/) || has(/language/),
    indexing: has(/indexing|scip|capability\.ready/),
    inspecting: has(/understanding|inspecting|engineering\.activity/),
    implementing: has(/implementing|engineering\.activity/),
    collaboration: has(/collaborate/),
    affected: has(/affected/),
    repair: has(/repair/),
    verification: has(/validation|verif|terminal/),
    verified: result?.classification === "VERIFIED",
  },
  sampleTypes: [...new Set(types)].slice(0, 40),
};

writeFileSync(
  join(outDir, `${label}.summary.json`),
  `${JSON.stringify(summary, null, 2)}\n`,
);
writeFileSync(
  join(outDir, `${label}.studio-snapshot.json`),
  `${JSON.stringify({ cards: studio?.cards || studio }, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.classification === "VERIFIED" && summary.visible.preparing ? 0 : 1;
