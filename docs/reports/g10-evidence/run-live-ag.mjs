/**
 * G10 live AG acceptance — native session + fabric checkpoint + cockpit events.
 * Usage:
 *   node run-live-ag.mjs <label> <projectRoot> <taskText>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareEngineeringEnvironment } from "../../../scripts/pathcode-cli/ag9/prepare.mjs";
import { runAntigravityEngineeringSession } from "../../../scripts/pathcode-cli/ag1/session.mjs";

const checkout = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const label = process.argv[2] || "ag-g10";
const projectRoot = resolve(
  process.argv[3] ||
    join(checkout, "docs/reports/g9-evidence/live-repos/ag-accept"),
);
const taskText =
  process.argv[4] ||
  "Fix the failing unit test. Keep the public API stable. Do not push.";
const outDir = resolve(checkout, "docs/reports/g10-evidence/live");
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g10-evidence/runtime-live-ag");

mkdirSync(outDir, { recursive: true });
process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";

const prepEvents = [];
const prepared = await prepareEngineeringEnvironment({
  projectRoot,
  runtimeRoot,
  taskText,
  startServices: false,
  emit: (e) => prepEvents.push({ ...e, at: Date.now() }),
});

if (prepared?.toolEnv?.PATH) process.env.PATH = prepared.toolEnv.PATH;

const events = [];
const prompt = {
  write: () => {},
  isStopped: () => false,
  isCycleCancelRequested: () => false,
  drainSteering: () => [],
};

const result = await runAntigravityEngineeringSession(prompt, {
  taskText,
  projectRoot,
  checkoutRoot: checkout,
  cardsOwnProgress: true,
  wallClockMs: 600_000,
  sessionEventEmit: (type, fields = {}) => {
    events.push({ type, ...fields, at: Date.now() });
  },
});

const g10Types = [
  "session.capability.preparing",
  "session.capability.collaborate",
  "session.engineering.activity",
  "session.hydration",
  "session.engineering.result",
  "session.terminal",
];
const summary = {
  schema: "pathcode.g10.ag-live.v1",
  label,
  at: new Date().toISOString(),
  outcome: result?.outcome,
  classification: result?.classification,
  exitCode: result?.exitCode,
  taskId: result?.taskId,
  engineActivityCount: result?.engineActivityCount,
  eventCount: events.length,
  eventTypes: [...new Set(events.map((e) => e.type))],
  g10Signals: {
    preparing: events.some((e) => e.type === "session.capability.preparing"),
    collaborating: events.some(
      (e) => e.type === "session.capability.collaborate",
    ),
    repairing: events.some(
      (e) =>
        e.type === "session.engineering.activity" &&
        /repair/i.test(String(e.label || e.activity || "")),
    ),
    result: events.some((e) => e.type === "session.engineering.result"),
  },
  prepBrief: prepared?.capabilityBrief?.slice?.(0, 400) || null,
  watchedFamilies: g10Types,
};

writeFileSync(join(outDir, `${label}.json`), `${JSON.stringify({ summary, result, events: events.slice(-80) }, null, 2)}\n`);
writeFileSync(join(outDir, `${label}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
process.exit(typeof result?.exitCode === "number" ? result.exitCode : 1);
