/**
 * G9 live acceptance harness — prepare + Antigravity session → evidence JSON.
 * Usage:
 *   node run-live-ag.mjs <label> <projectRoot> <taskText> <outDir>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareEngineeringEnvironment } from "../../../scripts/pathcode-cli/ag9/prepare.mjs";
import { runAntigravityEngineeringSession } from "../../../scripts/pathcode-cli/ag1/session.mjs";

const checkout = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const label = process.argv[2];
const projectRoot = resolve(process.argv[3]);
const taskText = process.argv[4];
const outDir = resolve(process.argv[5]);
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g9-evidence/runtime-live-ag");

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
for (const key of [
  "MISE_DATA_DIR",
  "MISE_CONFIG_DIR",
  "MISE_CACHE_DIR",
  "MISE_STATE_DIR",
  "CARGO_HOME",
  "RUSTUP_HOME",
  "MISE_YES",
  "COPILOT_HOME",
  "JAVA_HOME",
]) {
  if (prepared?.toolEnv?.[key]) process.env[key] = prepared.toolEnv[key];
}

writeFileSync(
  join(outDir, `${label}.prepare.json`),
  `${JSON.stringify({ label, projectRoot, runtimeRoot, prepared: {
    brief: prepared.capabilityBrief,
    provision: prepared.provision?.briefLines,
    lsp: prepared.languageServers,
    pathPrepend: prepared.pathPrepend,
  }, prepEvents }, null, 2)}\n`,
);

const events = [];
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
  wallClockMs: 900_000,
  sessionEventEmit: (type, fields = {}) => {
    events.push({ type, ...fields, at: Date.now() });
  },
});

const summary = {
  label,
  outcome: result?.outcome,
  classification: result?.classification,
  exitCode: result?.exitCode,
  primaryUntouched: result?.primaryUntouched,
  commitSha: result?.commitSha || null,
  engineActivityCount: result?.engineActivityCount ?? null,
  collaborateEvents: events.filter((e) =>
    String(e.type).includes("collaborate"),
  ),
  capabilityEvents: events
    .filter((e) => String(e.type).startsWith("session.capability"))
    .map((e) => ({
      type: e.type,
      detail: e.detail || e.label || null,
      phase: e.phase,
      engine: e.engine,
    })),
};

writeFileSync(
  join(outDir, `${label}.json`),
  `${JSON.stringify({ summary, result, events: events.slice(0, 200) }, null, 2)}\n`,
);
writeFileSync(join(outDir, `${label}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.classification === "VERIFIED" ? 0 : 1;
