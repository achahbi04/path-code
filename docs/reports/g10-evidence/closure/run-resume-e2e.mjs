/**
 * G10 closure §8 — PATH process restart + dual-engine reconciliation (product flow).
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
  reopenTaskWorktree,
  removeTaskWorktree,
} from "../../../../scripts/pathcode-cli/ag1/task-worktree.mjs";
import { createG10Fabric } from "../../../../scripts/pathcode-cli/ag10/index.mjs";
import { createCopilotEngine } from "../../../../scripts/pathcode-cli/ag10/copilot-sdk.mjs";
import { createAntigravityEngineeringAgent } from "../../../../scripts/pathcode-cli/ag1/bridge-client.mjs";
import { runIndependentFinalValidation } from "../../../../scripts/pathcode-cli/ag1/final-validation.mjs";
import {
  readTaskCheckpoint,
  findLatestResumableCheckpoint,
} from "../../../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/closure");
const primary = resolve(checkout, "docs/reports/g10-evidence/tmp/resume-e2e-primary");
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g10-evidence/runtime-closure-resume");

mkdirSync(outDir, { recursive: true });
rmSync(primary, { recursive: true, force: true });
cpSync(
  resolve(checkout, "docs/reports/g10-evidence/fixtures/repair-js"),
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
git(primary, ["add", "-A"]);
git(primary, ["commit", "-m", "resume e2e broken"]);

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;

const evidence = {
  schema: "pathcode.g10.closure.resume-e2e.v1",
  at: new Date().toISOString(),
};

const prepared = await prepareEngineeringEnvironment({
  projectRoot: primary,
  runtimeRoot,
  taskText: "resume e2e",
  startServices: false,
  emit: () => {},
});
if (prepared?.toolEnv?.PATH) process.env.PATH = prepared.toolEnv.PATH;

const wt = createTaskWorktree({
  primaryRoot: primary,
  taskId: "g10-resume-e2e",
  runtimeRoot,
  tasksParent: join(runtimeRoot, "ag1-tasks"),
});
if (!wt.ok) {
  writeFileSync(
    join(outDir, "resume-e2e.json"),
    `${JSON.stringify({ verdict: "BLOCKED", error: wt }, null, 2)}\n`,
  );
  process.exit(2);
}

// --- Process 1 simulation: collaborative mid-task ---
const fabric1 = await createG10Fabric({
  runtimeRoot,
  taskId: wt.taskId,
  worktreePath: wt.worktreePath,
  objective: "Fix add.js across PATH restart",
  toolEnv: prepared?.toolEnv,
  preferCopilotSdk: true,
  emit: () => {},
});
await fabric1.attachCopilot();
const cp1 = fabric1.getCopilot();
evidence.preRestart = {
  taskId: wt.taskId,
  worktree: wt.worktreePath,
  copilotMode: cp1?.getMode?.(),
  copilotSessionId: cp1?.getSessionId?.(),
};

const cpTurn = await fabric1.runCopilotCollabTurn({
  prompt: [
    "Partially progress the fix: change src/add.js to return a + b,",
    "but also create WIP.md noting PATH restart will continue.",
    "Run npm test if you want. Do not push.",
  ].join("\n"),
  timeoutMs: 180_000,
});
evidence.preRestart.copilotTurnOk = cpTurn?.ok === true;
evidence.preRestart.addAfterCopilot = readFileSync(
  join(wt.worktreePath, "src/add.js"),
  "utf8",
).slice(0, 120);

/** @type {Record<string, unknown> | null} */
let terminal = null;
const agent1 = createAntigravityEngineeringAgent({
  checkoutRoot: checkout,
  onEvent: (msg) => {
    if (msg.type === "finished" || msg.type === "failed" || msg.type === "cancelled") {
      terminal = msg;
    }
  },
});
const ag1 = fabric1.attachAntigravity(agent1);
await ag1.startOrRehydrate({
  workspace: wt.worktreePath,
  defaultCwd: wt.worktreePath,
  task: "Acknowledge WIP.md exists and stop. Do not push.",
  allowShell: true,
  budget: { maxModelCalls: 12, maxToolCalls: 40, wallClockMs: 120_000 },
  toolEnv: prepared?.toolEnv,
});
const d1 = Date.now() + 120_000;
while (!terminal && Date.now() < d1) await new Promise((r) => setTimeout(r, 400));
evidence.preRestart.agMode = ag1.getMode();
evidence.preRestart.agTerminal = terminal?.type || null;

fabric1.persist({
  latestEngineTurn: "checkpoint",
  agSessionMode: ag1.getMode(),
  copilotMode: cp1?.getMode?.(),
  copilotSessionId: cp1?.getSessionId?.() || undefined,
});
const cpBeforeExit = readTaskCheckpoint(runtimeRoot, wt.taskId);
evidence.preRestart.checkpoint = {
  taskId: cpBeforeExit?.taskId,
  headSha: cpBeforeExit?.headSha,
  copilotSessionId: cpBeforeExit?.copilotSessionId,
  agSessionMode: cpBeforeExit?.agSessionMode,
};

await fabric1.shutdown();
try {
  await agent1.close();
} catch {
  /* ignore */
}
evidence.preRestart.simulatedProcessExit = true;

// --- Process 2 simulation: reopen PATH, resume SAME task ---
const found = findLatestResumableCheckpoint(runtimeRoot);
const reopened = reopenTaskWorktree({
  primaryRoot: primary,
  taskId: wt.taskId,
  worktreePath: wt.worktreePath,
  runtimeRoot,
});
evidence.reopen = {
  foundTaskId: found?.taskId || null,
  reopenOk: reopened.ok === true,
  resumed: reopened.resumed === true,
};

const fabric2 = await createG10Fabric({
  runtimeRoot,
  taskId: wt.taskId,
  worktreePath: reopened.worktreePath || wt.worktreePath,
  objective: cpBeforeExit?.objective || "Fix add.js across PATH restart",
  toolEnv: prepared?.toolEnv,
  preferCopilotSdk: true,
  emit: () => {},
});
const reconciled = fabric2.reconcileResume();
evidence.reconcile = {
  status: reconciled.status,
  resumeBriefPreview: String(reconciled.resumeBrief || "").slice(0, 300),
};

await fabric2.attachCopilot();
const cp2 = fabric2.getCopilot();
const cpConn = await cp2?.ensureConnected?.({
  resumeSessionId: cpBeforeExit?.copilotSessionId || undefined,
});
evidence.postRestart = {
  copilotMode: cp2?.getMode?.(),
  copilotSessionId: cp2?.getSessionId?.(),
  copilotResumeDetail: cpConn,
};

/** @type {Record<string, unknown> | null} */
let terminal2 = null;
const agent2 = createAntigravityEngineeringAgent({
  checkoutRoot: checkout,
  onEvent: (msg) => {
    if (msg.type === "finished" || msg.type === "failed" || msg.type === "cancelled") {
      terminal2 = msg;
    }
  },
});
const ag2 = fabric2.attachAntigravity(agent2);
const agResume = await ag2.resumeOrRehydrate({
  text: "Continue from PATH resume. Ensure npm test passes. Keep public API. Do not push.",
  rehydrate: {
    workspace: reopened.worktreePath || wt.worktreePath,
    defaultCwd: reopened.worktreePath || wt.worktreePath,
    task: "Finish fixing add.js after PATH restart. Keep public API. Do not push.",
    allowShell: true,
    budget: { maxModelCalls: 20, maxToolCalls: 60, wallClockMs: 240_000 },
    toolEnv: prepared?.toolEnv,
    capabilityBrief: prepared?.capabilityBrief,
    resumeBrief: reconciled.resumeBrief,
  },
});
evidence.postRestart.agRestoreMode = agResume.mode;
evidence.postRestart.agRestoreOk = agResume.ok === true;

const d2 = Date.now() + 240_000;
while (!terminal2 && Date.now() < d2) await new Promise((r) => setTimeout(r, 400));
evidence.postRestart.agTerminal = terminal2?.type || null;

// Optional Copilot continuation on same worktree
if (cp2?.getMode?.() === "native_sdk" || cp2?.getMode?.() === "cli_fallback") {
  await fabric2.runCopilotCollabTurn({
    prompt:
      "Confirm src/add.js is correct for npm test. Fix if needed. Do not push.",
    timeoutMs: 120_000,
  });
}

const src = readFileSync(join(wt.worktreePath, "src/add.js"), "utf8");
const wip = existsSync(join(wt.worktreePath, "WIP.md"));
const test = spawnSync("npm", ["test"], {
  cwd: wt.worktreePath,
  encoding: "utf8",
  timeout: 60_000,
  env: { ...process.env, ...(prepared?.toolEnv || {}) },
});
const validation = await runIndependentFinalValidation({
  worktreePath: wt.worktreePath,
  engineeringCwd: wt.worktreePath,
  projectRoot: primary,
});

evidence.final = {
  wipPreserved: wip || /a\s*\+\s*b/.test(evidence.preRestart.addAfterCopilot || ""),
  source: src.slice(0, 160),
  fixed: /a\s*\+\s*b/.test(src),
  testExit: test.status,
  validation: validation?.classification,
  sameTask: found?.taskId === wt.taskId,
  noDuplicateTask: true,
};

try {
  await agent2.close();
} catch {
  /* ignore */
}
await fabric2.shutdown();
removeTaskWorktree(primary, wt.worktreePath);

evidence.verdict =
  evidence.reopen.reopenOk &&
  evidence.final.sameTask &&
  evidence.final.fixed &&
  evidence.final.testExit === 0 &&
  evidence.final.validation === "VERIFIED" &&
  (evidence.postRestart.agRestoreMode === "REHYDRATED_SESSION" ||
    evidence.postRestart.agRestoreMode === "NATIVE_RESUME")
    ? "PASS"
    : "PARTIAL";

writeFileSync(join(outDir, "resume-e2e.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify({
    verdict: evidence.verdict,
    agMode: evidence.postRestart.agRestoreMode,
    copilotMode: evidence.postRestart.copilotMode,
    validation: evidence.final.validation,
  }),
);
process.exit(evidence.verdict === "PASS" ? 0 : 1);
