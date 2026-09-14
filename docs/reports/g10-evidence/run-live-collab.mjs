/**
 * G10 collaborative acceptance on ONE shared task worktree.
 * Copilot SDK material turn → Antigravity continuation → PATH-style verify.
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
import { prepareEngineeringEnvironment } from "../../../scripts/pathcode-cli/ag9/prepare.mjs";
import {
  createTaskWorktree,
  removeTaskWorktree,
  capturePrimaryFingerprint,
} from "../../../scripts/pathcode-cli/ag1/task-worktree.mjs";
import { createAntigravityEngineeringAgent } from "../../../scripts/pathcode-cli/ag1/bridge-client.mjs";
import { createG10Fabric } from "../../../scripts/pathcode-cli/ag10/index.mjs";
import { createCopilotEngine } from "../../../scripts/pathcode-cli/ag10/copilot-sdk.mjs";
import { captureTaskReality } from "../../../scripts/pathcode-cli/ag10/task-reality.mjs";
import { runIndependentFinalValidation } from "../../../scripts/pathcode-cli/ag1/final-validation.mjs";

const checkout = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/live");
const primary = resolve(checkout, "docs/reports/g10-evidence/tmp/collab-primary");
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g10-evidence/runtime-live-collab");

mkdirSync(outDir, { recursive: true });
rmSync(primary, { recursive: true, force: true });
cpSync(join(checkout, "docs/reports/g9-evidence/live-repos/js-accept"), primary, {
  recursive: true,
});
writeFileSync(
  join(primary, "src/add.js"),
  "export function add(a, b) { return a - b; }\n",
);
function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}
if (!existsSync(join(primary, ".git"))) {
  git(primary, ["init"]);
  git(primary, ["config", "user.email", "g10@test"]);
  git(primary, ["config", "user.name", "g10"]);
  git(primary, ["config", "commit.gpgsign", "false"]);
}
git(primary, ["add", "-A"]);
git(primary, ["commit", "-m", "broken baseline"]);

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";

const evidence = {
  schema: "pathcode.g10.collab-shared-worktree.v1",
  at: new Date().toISOString(),
};

const prepared = await prepareEngineeringEnvironment({
  projectRoot: primary,
  runtimeRoot,
  taskText: "collaborative fix",
  startServices: false,
  emit: () => {},
});
if (prepared?.toolEnv?.PATH) process.env.PATH = prepared.toolEnv.PATH;

const wt = createTaskWorktree({
  primaryRoot: primary,
  taskId: "g10-collab-shared",
  runtimeRoot,
  tasksParent: join(runtimeRoot, "ag1-tasks"),
});
if (!wt.ok) {
  evidence.verdict = "BLOCKED";
  evidence.error = wt;
  writeFileSync(join(outDir, "collab-dual.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: "BLOCKED", error: wt.code }));
  process.exit(2);
}

const fabric = await createG10Fabric({
  runtimeRoot,
  taskId: wt.taskId,
  worktreePath: wt.worktreePath,
  objective: "Fix add.js with AG↔Copilot collaboration",
  toolEnv: prepared?.toolEnv,
  preferCopilotSdk: true,
  emit: () => {},
});

const before = captureTaskReality(wt.worktreePath);

const cpTurn = await fabric.runCopilotCollabTurn({
  prompt: [
    "You are a full engineering collaborator on this PATH task worktree.",
    "Diagnose src/add.js vs test/add.test.js.",
    "You may edit files and run tests.",
    "Make a MATERIAL code change toward fixing the test (even if incomplete).",
    "Do not push.",
  ].join("\n"),
  timeoutMs: 180_000,
});
const mid = captureTaskReality(wt.worktreePath);
evidence.copilot = {
  ok: cpTurn?.ok === true,
  mode: fabric.getCopilot()?.getMode?.() || cpTurn?.mode,
  changed: mid.diffFingerprint !== before.diffFingerprint,
  files: mid.changedFiles,
  detail: cpTurn?.detail,
};

// Antigravity continues on the SAME worktree
/** @type {Record<string, unknown>[]} */
const agEvents = [];
let terminal = null;
const agent = createAntigravityEngineeringAgent({
  checkoutRoot: checkout,
  onEvent: (msg) => {
    agEvents.push(msg);
    if (msg.type === "finished" || msg.type === "failed" || msg.type === "cancelled") {
      terminal = msg;
    }
  },
});
const agBind = fabric.attachAntigravity(agent);
const start = await agBind.startOrRehydrate({
  workspace: wt.worktreePath,
  defaultCwd: wt.worktreePath,
  task: [
    "Continue from the current worktree reality after a Copilot engineering turn.",
    "Finish fixing add.js so `npm test` passes. Keep public API. Do not push.",
    fabric.reconcileResume().resumeBrief,
  ].join("\n\n"),
  allowShell: true,
  budget: { maxModelCalls: 24, maxToolCalls: 80, wallClockMs: 300_000 },
  toolEnv: prepared?.toolEnv,
  capabilityBrief: prepared?.capabilityBrief,
  resumeFromCheckpoint: true,
  resumeBrief: fabric.reconcileResume().resumeBrief,
});
evidence.agStart = { ok: start.ok === true, mode: agBind.getMode() };

if (start.ok) {
  const agLeased = await fabric.runAntigravityCollabTurn({
    timeoutMs: 300_000,
    runTurn: async () => {
      // Wait for first finished/failed if start already racing
      const deadline = Date.now() + 280_000;
      while (!terminal && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!terminal) {
        agent.continueTask({
          text: "Finish the fix and ensure npm test passes, then stop.",
        });
        const d2 = Date.now() + 180_000;
        while (!terminal && Date.now() < d2) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      return {
        detail: String(terminal?.type || "timeout"),
        changedFiles: captureTaskReality(wt.worktreePath).changedFiles,
      };
    },
  });
  evidence.agTurn = {
    ok: terminal?.type === "finished",
    terminal: terminal?.type,
    leased: agLeased?.ok !== false,
    mode: agBind.getMode(),
  };
  try {
    agent.signalDone();
  } catch {
    /* ignore */
  }
}
try {
  await agent.close();
} catch {
  /* ignore */
}

const after = captureTaskReality(wt.worktreePath);
let validation = null;
try {
  validation = await runIndependentFinalValidation({
    worktreePath: wt.worktreePath,
    engineeringCwd: wt.worktreePath,
    projectRoot: primary,
  });
} catch (err) {
  evidence.validationError = err instanceof Error ? err.message : String(err);
}

const src = readFileSync(join(wt.worktreePath, "src/add.js"), "utf8");
const test = spawnSync("npm", ["test"], {
  cwd: wt.worktreePath,
  encoding: "utf8",
  timeout: 60_000,
  env: { ...process.env, ...(prepared?.toolEnv || {}) },
});

evidence.shared = {
  taskId: wt.taskId,
  worktree: wt.worktreePath,
  primaryUntouched: (() => {
    const fp = capturePrimaryFingerprint(primary);
    return fp.ok && String(fp.porcelain || "").trim() === "";
  })(),
  source: src.slice(0, 160),
  testExit: test.status,
  validationClassification: validation?.classification,
  fingerprints: {
    before: before.diffFingerprint,
    mid: mid.diffFingerprint,
    after: after.diffFingerprint,
  },
};

evidence.verdict =
  evidence.copilot.changed &&
  evidence.agStart.ok &&
  /a\s*\+\s*b/.test(src) &&
  test.status === 0
    ? "PASS"
    : "PARTIAL";

fabric.markFinal(evidence.verdict === "PASS" ? "VERIFIED" : "FAILED");
await fabric.shutdown();
removeTaskWorktree(primary, wt.worktreePath);

writeFileSync(join(outDir, "collab-dual.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify({
    verdict: evidence.verdict,
    cp: evidence.copilot,
    agMode: evidence.agStart.mode,
    testExit: test.status,
  }),
);
process.exit(evidence.verdict === "PASS" ? 0 : 1);
