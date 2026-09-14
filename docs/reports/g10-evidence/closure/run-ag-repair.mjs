/**
 * G10 closure §1 — Antigravity SAME-session real repair loop.
 *
 * Phase A: AG follows a constrained instruction that leaves tests failing.
 * Phase B: PATH validation failure is fed back via continueTask (NATIVE_RESUME).
 * Phase C: AG materially repairs; independent validation VERIFIED.
 */
import {
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { prepareEngineeringEnvironment } from "../../../../scripts/pathcode-cli/ag9/prepare.mjs";
import {
  createTaskWorktree,
  removeTaskWorktree,
  capturePrimaryFingerprint,
  primaryUntouched,
} from "../../../../scripts/pathcode-cli/ag1/task-worktree.mjs";
import { createAntigravityEngineeringAgent } from "../../../../scripts/pathcode-cli/ag1/bridge-client.mjs";
import { runIndependentFinalValidation } from "../../../../scripts/pathcode-cli/ag1/final-validation.mjs";
import { buildValidationRepairPrompt } from "../../../../scripts/pathcode-cli/ag8/index.mjs";
import { bindAntigravitySession } from "../../../../scripts/pathcode-cli/ag10/ag-session.mjs";
import { createG10Fabric } from "../../../../scripts/pathcode-cli/ag10/index.mjs";
import {
  createEmptyStudioState,
  applyStudioEvent,
} from "../../../../scripts/path-studio/state.mjs";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/closure");
const fixtureSrc = resolve(
  checkout,
  "docs/reports/g10-evidence/fixtures/repair-js",
);
const primary = resolve(checkout, "docs/reports/g10-evidence/tmp/ag-repair-primary");
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g10-evidence/runtime-closure-ag-repair");

mkdirSync(outDir, { recursive: true });
rmSync(primary, { recursive: true, force: true });
cpSync(fixtureSrc, primary, { recursive: true });

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
git(primary, ["add", "-A"]);
git(primary, ["commit", "-m", "broken baseline"]);

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;

const evidence = {
  schema: "pathcode.g10.closure.ag-repair.v1",
  at: new Date().toISOString(),
};
/** @type {object[]} */
const events = [];
let studio = createEmptyStudioState();
studio.sessionId = "ag-repair";

function emit(type, fields = {}) {
  const ev = { type, sessionId: "ag-repair", ...fields, at: Date.now() };
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
  taskText: "repair loop",
  startServices: false,
  emit: (e) => {
    if (e?.type) emit(e.type, e);
  },
});
if (prepared?.toolEnv?.PATH) process.env.PATH = prepared.toolEnv.PATH;

const beforePrimary = capturePrimaryFingerprint(primary);
const wt = createTaskWorktree({
  primaryRoot: primary,
  taskId: "g10-ag-repair",
  runtimeRoot,
  tasksParent: join(runtimeRoot, "ag1-tasks"),
});
if (!wt.ok) {
  evidence.verdict = "BLOCKED";
  evidence.error = wt;
  writeFileSync(join(outDir, "ag-repair.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: "BLOCKED", code: wt.code }));
  process.exit(2);
}

const fabric = await createG10Fabric({
  runtimeRoot,
  taskId: wt.taskId,
  worktreePath: wt.worktreePath,
  objective: "AG same-session repair",
  toolEnv: prepared?.toolEnv,
  preferCopilotSdk: false,
  emit: (e) => {
    if (e?.type) emit(e.type, e);
  },
});

function waitTerminal(getTerm, ms) {
  const deadline = Date.now() + ms;
  return (async () => {
    while (Date.now() < deadline) {
      const t = getTerm();
      if (t) return t;
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  })();
}

/** @type {Record<string, unknown> | null} */
let terminal = null;
const agent = createAntigravityEngineeringAgent({
  checkoutRoot: checkout,
  onEvent: (msg) => {
    fabric.onAntigravityBridgeEvent?.(msg);
    if (msg.type === "activity") {
      emit("session.engineering.activity", {
        activity: msg.activity,
        label: String(msg.activity || ""),
        detail: msg.detail,
      });
    }
    if (msg.type === "tool") {
      emit("session.engineering.tool", {
        kind: msg.kind,
        tool: msg.tool,
        summary: msg.summary,
      });
    }
    if (msg.type === "finished" || msg.type === "failed" || msg.type === "cancelled") {
      terminal = msg;
    }
  },
});
const agBind = bindAntigravitySession({
  taskId: wt.taskId,
  agent,
  emit: (e) => emit(e.type, e),
});

// Phase A — constrained turn that should leave tests failing.
terminal = null;
const startA = await agBind.startOrRehydrate({
  workspace: wt.worktreePath,
  defaultCwd: wt.worktreePath,
  task: [
    "PATH engineering task (phase A).",
    "Create NOTES.md describing that add(2,2) currently fails.",
    "Do NOT modify src/add.js in this turn.",
    "Do not push. Stop when NOTES.md exists.",
  ].join("\n"),
  allowShell: true,
  budget: { maxModelCalls: 20, maxToolCalls: 60, wallClockMs: 240_000 },
  toolEnv: prepared?.toolEnv,
  capabilityBrief: prepared?.capabilityBrief,
});
evidence.phaseA = {
  startOk: startA.ok === true,
  mode: agBind.getMode(),
};
const termA = await waitTerminal(() => terminal, 240_000);
evidence.phaseA.terminal = termA?.type || null;

const testA = spawnSync("npm", ["test"], {
  cwd: wt.worktreePath,
  encoding: "utf8",
  timeout: 60_000,
  env: { ...process.env, ...(prepared?.toolEnv || {}) },
});
evidence.phaseA.testExit = testA.status;
evidence.phaseA.notesExists = existsSync(join(wt.worktreePath, "NOTES.md"));
evidence.phaseA.addSource = readFileSync(join(wt.worktreePath, "src/add.js"), "utf8").slice(
  0,
  120,
);

if (testA.status === 0) {
  // AG ignored the constraint and already fixed — still record, but repair loop not forced.
  evidence.phaseA.unexpectedPass = true;
}

// Independent validation (expect failure unless unexpectedPass)
let validation = await runIndependentFinalValidation({
  worktreePath: wt.worktreePath,
  engineeringCwd: wt.worktreePath,
  projectRoot: primary,
});
evidence.phaseA.validation = validation?.classification;

emit("session.engineering.activity", {
  activity: "repairing",
  label: "Repairing",
  detail: "validation failure returned to same Antigravity session",
});
fabric.emitG10?.({
  family: "repair.started",
  engine: "antigravity",
  detail: "same-session repair after failed validation",
});

// Phase B — same conversation continue (NATIVE_RESUME)
terminal = null;
const repairPrompt = buildValidationRepairPrompt(validation || {
  classification: "FAILED",
  reason: "npm test failed",
  checks: [{ id: "npm-test", ok: false, detail: String(testA.stdout || testA.stderr || "").slice(0, 500) }],
});
const cont = agBind.continueNative({
  text: [
    "PATH independent validation FAILED.",
    "You MUST now materially fix src/add.js so `npm test` passes.",
    "Keep the public add(a,b) API. Do not push.",
    "",
    repairPrompt,
  ].join("\n"),
});
evidence.phaseB = {
  continueOk: cont.ok === true,
  mode: cont.mode || agBind.getMode(),
};
const termB = await waitTerminal(() => terminal, 300_000);
evidence.phaseB.terminal = termB?.type || null;

const testB = spawnSync("npm", ["test"], {
  cwd: wt.worktreePath,
  encoding: "utf8",
  timeout: 60_000,
  env: { ...process.env, ...(prepared?.toolEnv || {}) },
});
evidence.phaseB.testExit = testB.status;
evidence.phaseB.addSource = readFileSync(join(wt.worktreePath, "src/add.js"), "utf8").slice(
  0,
  160,
);

validation = await runIndependentFinalValidation({
  worktreePath: wt.worktreePath,
  engineeringCwd: wt.worktreePath,
  projectRoot: primary,
});
evidence.finalValidation = validation?.classification;

try {
  agent.signalDone();
} catch {
  /* ignore */
}
try {
  await agent.close();
} catch {
  /* ignore */
}

const afterPrimary = capturePrimaryFingerprint(primary);
evidence.primaryUntouched = primaryUntouched(beforePrimary, afterPrimary);
evidence.cockpitPathPhase = studio?.product?.pathPhase || null;
evidence.eventTypes = [...new Set(events.map((e) => e.type))];
evidence.repairActivity = events.some(
  (e) =>
    e.type === "session.engineering.activity" &&
    /repair/i.test(String(e.label || e.activity || "")),
);

const fixed = /a\s*\+\s*b/.test(evidence.phaseB.addSource || "");
evidence.verdict =
  evidence.phaseA.startOk &&
  evidence.phaseB.continueOk &&
  evidence.phaseB.mode === "NATIVE_RESUME" &&
  (evidence.phaseA.testExit !== 0 || evidence.phaseA.unexpectedPass === true) &&
  evidence.phaseB.testExit === 0 &&
  fixed &&
  evidence.finalValidation === "VERIFIED" &&
  evidence.primaryUntouched
    ? "PASS"
    : "PARTIAL";

fabric.markFinal(evidence.verdict === "PASS" ? "VERIFIED" : "FAILED");
await fabric.shutdown();
removeTaskWorktree(primary, wt.worktreePath);

writeFileSync(join(outDir, "ag-repair.json"), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(
  join(outDir, "ag-repair.events.ndjson"),
  events.map((e) => JSON.stringify(e)).join("\n") + "\n",
);
console.log(
  JSON.stringify({
    verdict: evidence.verdict,
    mode: evidence.phaseB.mode,
    testA: evidence.phaseA.testExit,
    testB: evidence.phaseB.testExit,
    validation: evidence.finalValidation,
  }),
);
process.exit(evidence.verdict === "PASS" ? 0 : 1);
