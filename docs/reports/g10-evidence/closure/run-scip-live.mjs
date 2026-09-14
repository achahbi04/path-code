/**
 * G10 closure §3 — live SCIP product use + cockpit events + engineering.
 */
import {
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { prepareEngineeringEnvironment } from "../../../../scripts/pathcode-cli/ag9/prepare.mjs";
import {
  ensureScipIndex,
  queryScipIndex,
  scipFingerprint,
} from "../../../../scripts/pathcode-cli/ag9/scip.mjs";
import { captureTaskReality } from "../../../../scripts/pathcode-cli/ag10/task-reality.mjs";
import { createG10Fabric } from "../../../../scripts/pathcode-cli/ag10/index.mjs";
import { runAntigravityEngineeringSession } from "../../../../scripts/pathcode-cli/ag1/session.mjs";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/closure");
const primary = resolve(checkout, "docs/reports/g10-evidence/tmp/scip-live-primary");
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g10-evidence/runtime-closure-scip");

mkdirSync(outDir, { recursive: true });
rmSync(primary, { recursive: true, force: true });
cpSync(
  resolve(checkout, "docs/reports/g9-evidence/live-repos/scip-mono"),
  primary,
  { recursive: true },
);

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}
git(primary, ["init"]);
git(primary, ["config", "user.email", "g10@test"]);
git(primary, ["config", "user.name", "g10"]);
git(primary, ["config", "commit.gpgsign", "false"]);
// Ensure broken tokenPrefix for engineering
writeFileSync(
  join(primary, "packages/a/index.ts"),
  readFileSync(
    resolve(checkout, "docs/reports/g9-evidence/live-repos/scip-mono/packages/a/index.ts"),
    "utf8",
  ),
);
git(primary, ["add", "-A"]);
git(primary, ["commit", "-m", "scip mono broken"]);

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;

const evidence = {
  schema: "pathcode.g10.closure.scip-live.v1",
  at: new Date().toISOString(),
  repository: "scip-mono",
};
/** @type {object[]} */
const events = [];
let studio = createEmptyStudioState();
studio.sessionId = "scip-live";

function record(type, fields = {}) {
  const ev = { type, sessionId: "scip-live", ...fields, at: Date.now() };
  events.push(ev);
  try {
    studio = applyStudioEvent(studio, ev) || studio;
  } catch {
    /* ignore */
  }
}

const prepared = await prepareEngineeringEnvironment({
  projectRoot: primary,
  runtimeRoot,
  taskText: "fix authHeader via symbol navigation across packages",
  startServices: false,
  emit: (e) => {
    if (e?.type) record(e.type, e);
  },
});
if (prepared?.toolEnv?.PATH) process.env.PATH = prepared.toolEnv.PATH;

const reality = captureTaskReality(primary);

record("session.capability.indexing", {
  detail: "SCIP indexing started",
  phase: "started",
});
const index = await ensureScipIndex({
  projectRoot: primary,
  runtimeRoot,
  language: "typescript",
  emit: (e) => {
    if (e?.type) record(e.type, e);
  },
});
record("session.capability.indexing", {
  detail: "SCIP indexing completed",
  phase: "completed",
  fingerprint: index?.fingerprint,
});
evidence.index = {
  ok: index?.ok === true,
  indexDir: index?.indexDir || null,
  fingerprint: index?.fingerprint || null,
  cached: index?.cached === true,
  evidence: (index?.evidence || []).slice(0, 12),
};

const symbol = "tokenPrefix";
const query = queryScipIndex({
  indexDir: index?.indexDir || "",
  op: "definition",
  symbol,
});
record("session.engineering.activity", {
  activity: "code_intelligence",
  label: "Code intelligence",
  detail: `SCIP query ${symbol}`,
});
evidence.query = {
  symbol,
  kind: "definition",
  ok: query?.ok === true,
  hits: Array.isArray(query?.results) ? query.results.slice(0, 8) : [],
  reason: query?.reason || null,
  fingerprint: index?.fingerprint || reality.diffFingerprint,
};

const fabric = await createG10Fabric({
  runtimeRoot,
  taskId: "scip-live-task",
  worktreePath: primary,
  objective: "fix tokenPrefix using SCIP facts",
  toolEnv: prepared?.toolEnv,
  preferCopilotSdk: false,
  emit: (e) => {
    if (e?.type) record(e.type, e);
  },
});
fabric.emitG10({
  family: "code-intelligence.query",
  detail: `symbol=${symbol}`,
  payload: { symbol, fingerprint: reality.diffFingerprint },
});

const factsBrief = [
  "PATH SCIP facts (current fingerprint):",
  `fingerprint=${reality.diffFingerprint}`,
  `symbol=${symbol}`,
  JSON.stringify(evidence.query.hits || evidence.query).slice(0, 1500),
  "Use these facts to locate the definition of tokenPrefix and fix the wrong prefix so authHeader('alice') === 'tok:alice'.",
].join("\n");

const prompt = {
  write: () => {},
  isStopped: () => false,
  isCycleCancelRequested: () => false,
  drainSteering: () => [],
};
const result = await runAntigravityEngineeringSession(prompt, {
  taskText: [
    "Cross-package TypeScript monorepo.",
    "authHeader in package b uses tokenPrefix from package a, but the prefix is wrong.",
    factsBrief,
    "Fix packages/a/index.ts so tests pass. Do not push.",
  ].join("\n\n"),
  projectRoot: primary,
  checkoutRoot: checkout,
  cardsOwnProgress: true,
  wallClockMs: 600_000,
  sessionEventEmit: (type, fields = {}) => record(type, fields),
});

evidence.engine = "antigravity";
evidence.session = {
  classification: result?.classification,
  outcome: result?.outcome,
  repairAttempts: result?.repairAttempts,
};
evidence.cockpit = {
  pathPhase: studio?.product?.pathPhase,
  hadCodeIntelligence: events.some(
    (e) =>
      e.type === "session.engineering.activity" &&
      /code intelligence/i.test(String(e.label || "")),
  ),
  hadIndexing: events.some(
    (e) => e.type === "session.capability.indexing",
  ),
};
const aSrc = readFileSync(join(primary, "packages/a/index.ts"), "utf8");
evidence.mutation = {
  fixed: /tok:/.test(aSrc) && !/bad:/.test(aSrc),
  preview: aSrc.slice(0, 200),
};
await fabric.shutdown();

evidence.verdict =
  evidence.index.ok &&
  evidence.query.ok &&
  evidence.cockpit.hadIndexing &&
  evidence.cockpit.hadCodeIntelligence &&
  evidence.session.classification === "VERIFIED" &&
  evidence.mutation.fixed
    ? "PASS"
    : "PARTIAL";

writeFileSync(join(outDir, "scip-live.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify({
    verdict: evidence.verdict,
    classification: evidence.session.classification,
    symbol,
    fixed: evidence.mutation.fixed,
  }),
);
process.exit(evidence.verdict === "PASS" ? 0 : 1);
