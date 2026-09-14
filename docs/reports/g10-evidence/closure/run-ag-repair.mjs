#!/usr/bin/env node
/**
 * §1 Antigravity real repair loop — same PATH task + same AG conversation:
 * Phase A engineers without fixing → PATH validation fails →
 * Phase B continueNative repair on SAME session → VERIFIED.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import {
  createTaskWorktree,
  removeTaskWorktree,
} from "../../../../scripts/pathcode-cli/ag1/task-worktree.mjs";
import { createAntigravityEngineeringAgent } from "../../../../scripts/pathcode-cli/ag1/bridge-client.mjs";
import { createG10Fabric } from "../../../../scripts/pathcode-cli/ag10/index.mjs";
import { prepareEngineeringEnvironment } from "../../../../scripts/pathcode-cli/ag9/prepare.mjs";
import { runIndependentFinalValidation } from "../../../../scripts/pathcode-cli/ag1/final-validation.mjs";
import { ensureAg1Runtime } from "../../../../scripts/pathcode-cli/ag1/runtime-bootstrap.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const checkout = path.resolve(__dirname, "../../../..");
const OUT = path.join(__dirname, "ag-repair.json");
const FIXTURE = path.join(__dirname, "../fixtures/repair-js");
const primary = path.join(checkout, "docs/reports/g10-evidence/tmp/ag-repair-primary");
// Reuse the proven live AG runtime (same as ag-g10-js) — do not bootstrap a fresh empty venv.
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  path.join(checkout, "docs/reports/g10-evidence/runtime-live-ag");

fs.mkdirSync(__dirname, { recursive: true });
fs.rmSync(primary, { recursive: true, force: true });
fs.cpSync(FIXTURE, primary, { recursive: true });

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}
git(primary, ["init"]);
git(primary, ["config", "user.email", "g10@path.local"]);
git(primary, ["config", "user.name", "G10"]);
git(primary, ["config", "commit.gpgsign", "false"]);
git(primary, ["add", "-A"]);
git(primary, ["commit", "-m", "broken baseline"]);

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;

/** @type {object[]} */
const events = [];
function emit(type, fields = {}) {
  events.push({ t: Date.now(), type, ...fields });
  console.error("[evt]", type, fields.label || fields.phase || "");
}

const boot = await ensureAg1Runtime({ packageRoot: checkout });
if (!boot.ok) {
  fs.writeFileSync(OUT, JSON.stringify({ verdict: "BLOCKED", boot }, null, 2));
  console.log(JSON.stringify({ verdict: "BLOCKED", boot }));
  process.exit(2);
}

const prepared = await prepareEngineeringEnvironment({
  projectRoot: primary,
  runtimeRoot,
  taskText: "ag repair",
  startServices: false,
  emit: (e) => {
    if (e?.type) emit(e.type, e);
  },
});
if (prepared?.toolEnv?.PATH) process.env.PATH = prepared.toolEnv.PATH;

const task = createTaskWorktree({
  primaryRoot: primary,
  taskId: `ag-repair-${Date.now()}`,
  runtimeRoot,
  tasksParent: path.join(runtimeRoot, "ag1-tasks"),
});
if (!task.ok) {
  fs.writeFileSync(OUT, JSON.stringify({ verdict: "BLOCKED", error: task }, null, 2));
  console.log(JSON.stringify({ verdict: "BLOCKED", error: task }));
  process.exit(2);
}

let testBefore = 1;
try {
  execFileSync("node", ["--test"], { cwd: task.worktreePath, stdio: "pipe" });
  testBefore = 0;
} catch (e) {
  testBefore = e.status ?? 1;
}

const fabric = await createG10Fabric({
  runtimeRoot,
  taskId: task.taskId,
  worktreePath: task.worktreePath,
  objective: "Repair add.js after failed validation",
  toolEnv: prepared?.toolEnv,
  preferCopilotSdk: false,
  emit: (e) => {
    if (e?.type) emit(e.type, e);
  },
});

/** @type {Record<string, unknown> | null} */
let terminal = null;
const agent = createAntigravityEngineeringAgent({
  checkoutRoot: checkout,
  onEvent: (msg) => {
    fabric.onAntigravityBridgeEvent?.(msg);
    if (msg.type === "finished" || msg.type === "failed" || msg.type === "cancelled") {
      terminal = msg;
    }
  },
});
const agBind = fabric.attachAntigravity(agent);

async function waitTerminal(ms) {
  const deadline = Date.now() + ms;
  while (!terminal && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
  }
  return terminal;
}

// Phase A: real engineering inspect/diagnose — must NOT fix yet (constrained task).
emit("session.engineering.activity", {
  label: "Phase A diagnose",
  detail: "inspect failing tests without fixing implementation",
});
terminal = null;
const start = await agBind.startOrRehydrate({
  workspace: task.worktreePath,
  defaultCwd: task.worktreePath,
  task: [
    "This repository has failing unit tests.",
    "Run `node --test` and write DIAGNOSIS.md explaining why tests fail.",
    "CRITICAL CONSTRAINT for this turn only: do NOT modify src/add.js.",
    "Do not push.",
  ].join("\n"),
  allowShell: true,
  budget: { maxModelCalls: 18, maxToolCalls: 60, wallClockMs: 180_000 },
  toolEnv: prepared?.toolEnv,
  capabilityBrief: prepared?.capabilityBrief,
});

console.error("[start]", JSON.stringify({
  ok: start?.ok,
  mode: start?.mode,
  detail: start?.detail,
  resultCode: start?.result?.code,
  resultMessage: start?.result?.message,
}));
const phaseA = await waitTerminal(200_000);
const srcAfterA = fs.readFileSync(path.join(task.worktreePath, "src/add.js"), "utf8");
const stillBrokenAfterA = /return\s+a\s*-\s*b/.test(srcAfterA);

const validationA = await runIndependentFinalValidation({
  worktreePath: task.worktreePath,
  engineeringCwd: task.worktreePath,
  projectRoot: primary,
});
emit("session.validation.result", {
  phase: "A",
  classification: validationA?.classification,
});

let phaseB = null;
let validationB = null;
let repairContinueOk = false;

if (
  stillBrokenAfterA &&
  validationA?.classification !== "VERIFIED" &&
  (phaseA?.type === "finished" || start?.ok)
) {
  emit("session.engineering.activity", {
    activity: "repairing",
    label: "Repairing",
    detail: "PATH validation failed — returning to same Antigravity session",
  });
  terminal = null;
  const cont = agBind.continueNative({
    text: [
      "PATH independent final verification FAILED.",
      `Classification: ${validationA?.classification || "NOT_VERIFIED"}`,
      "You may now modify src/add.js.",
      "Keep the public API: export function add(a, b).",
      "Fix the implementation so add returns a+b, run node --test until green, then stop.",
      "Do not push.",
    ].join("\n"),
  });
  repairContinueOk = cont?.ok !== false;
  phaseB = await waitTerminal(240_000);
  validationB = await runIndependentFinalValidation({
    worktreePath: task.worktreePath,
    engineeringCwd: task.worktreePath,
    projectRoot: primary,
  });
  emit("session.validation.result", {
    phase: "B",
    classification: validationB?.classification,
  });
}

const srcFinal = fs.readFileSync(path.join(task.worktreePath, "src/add.js"), "utf8");
const fixed = /return\s+a\s*\+\s*b/.test(srcFinal);
let testExit = 1;
try {
  execFileSync("node", ["--test"], { cwd: task.worktreePath, stdio: "pipe" });
  testExit = 0;
} catch (e) {
  testExit = e.status ?? 1;
}
const primarySrc = fs.readFileSync(path.join(primary, "src/add.js"), "utf8");
const primaryUntouched = /return\s+a\s*-\s*b/.test(primarySrc);
const conversationId =
  agBind.getConversationId?.() ||
  start?.conversationId ||
  fabric.getAntigravity?.()?.conversationId ||
  null;

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
await fabric.shutdown();
removeTaskWorktree(primary, task.worktreePath);

const verified =
  testBefore !== 0 &&
  stillBrokenAfterA &&
  validationA?.classification !== "VERIFIED" &&
  repairContinueOk &&
  fixed &&
  testExit === 0 &&
  validationB?.classification === "VERIFIED" &&
  primaryUntouched;

const out = {
  schema: "pathcode.g10.closure.ag-repair.v1",
  at: new Date().toISOString(),
  taskId: task.taskId,
  sameTask: true,
  sameSession: Boolean(conversationId) || repairContinueOk,
  conversationId,
  phaseA: {
    terminal: phaseA?.type || null,
    startOk: start?.ok !== false,
    stillBroken: stillBrokenAfterA,
    validation: validationA?.classification,
  },
  failure: {
    check: "node --test / independent final validation",
    classification: validationA?.classification,
  },
  repair: {
    continueNative: repairContinueOk,
    phaseBTerminal: phaseB?.type || null,
    fixed,
    validation: validationB?.classification,
  },
  testBefore,
  testExit,
  primaryUntouched,
  events: events.slice(0, 60),
  verdict: verified ? "PASS" : "PARTIAL",
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify({
    verdict: out.verdict,
    phaseA: out.phaseA,
    repair: out.repair,
    testExit,
    conversationId,
  }),
);
process.exit(verified ? 0 : 1);
