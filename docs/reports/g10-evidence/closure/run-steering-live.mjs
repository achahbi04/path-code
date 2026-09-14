/**
 * G10 closure §6 — live steering during active mutation lease.
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
  createTaskWorktree,
  removeTaskWorktree,
} from "../../../../scripts/pathcode-cli/ag1/task-worktree.mjs";
import { createAntigravityEngineeringAgent } from "../../../../scripts/pathcode-cli/ag1/bridge-client.mjs";
import { createG10Fabric } from "../../../../scripts/pathcode-cli/ag10/index.mjs";
import { runIndependentFinalValidation } from "../../../../scripts/pathcode-cli/ag1/final-validation.mjs";

const checkout = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const outDir = resolve(checkout, "docs/reports/g10-evidence/closure");
const primary = resolve(checkout, "docs/reports/g10-evidence/tmp/steer-primary");
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g10-evidence/runtime-live-ag");

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
git(primary, ["commit", "-m", "steer baseline"]);

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ""}`;

const evidence = {
  schema: "pathcode.g10.closure.steering.v1",
  at: new Date().toISOString(),
  sequence: [],
};
/** @type {object[]} */
const events = [];

const prepared = await prepareEngineeringEnvironment({
  projectRoot: primary,
  runtimeRoot,
  taskText: "steering",
  startServices: false,
  emit: () => {},
});
if (prepared?.toolEnv?.PATH) process.env.PATH = prepared.toolEnv.PATH;

const wt = createTaskWorktree({
  primaryRoot: primary,
  taskId: "g10-steer",
  runtimeRoot,
  tasksParent: join(runtimeRoot, "ag1-tasks"),
});
if (!wt.ok) {
  writeFileSync(
    join(outDir, "steering-live.json"),
    `${JSON.stringify({ verdict: "BLOCKED", error: wt }, null, 2)}\n`,
  );
  process.exit(2);
}

const fabric = await createG10Fabric({
  runtimeRoot,
  taskId: wt.taskId,
  worktreePath: wt.worktreePath,
  objective: "Fix add with steering constraint",
  toolEnv: prepared?.toolEnv,
  preferCopilotSdk: false,
  emit: (e) => {
    if (e?.type) {
      events.push({ ...e, at: Date.now() });
      evidence.sequence.push({
        t: Date.now(),
        type: e.type,
        label: e.label,
        detail: e.detail,
      });
    }
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

// Begin mutation-active window and inject steering immediately (product PENDING).
fabric.getSteering().setMutationActive(true);
const pendingItem = fabric.acceptSteering(
  "Keep backward compatibility and do not change the public API.",
);
evidence.sequence.push({
  t: Date.now(),
  type: "steering.accept",
  status: pendingItem.status,
  text: pendingItem.text,
});
const midApply = fabric.applySteeringBoundary();
evidence.pendingWhileMutating = {
  status: pendingItem.status,
  deferred: midApply.deferred === true,
  appliedCount: midApply.applied.length,
};

terminal = null;
const start = await agBind.startOrRehydrate({
  workspace: wt.worktreePath,
  defaultCwd: wt.worktreePath,
  task: [
    "Fix src/add.js so npm test passes.",
    "You will receive operator steering — obey it.",
    "Do not rename add. Do not change the public function signature.",
    "Do not push.",
  ].join("\n"),
  allowShell: true,
  budget: { maxModelCalls: 24, maxToolCalls: 80, wallClockMs: 300_000 },
  toolEnv: prepared?.toolEnv,
  capabilityBrief: prepared?.capabilityBrief,
});

// Release mutation boundary and apply steering into continuation.
fabric.getSteering().setMutationActive(false);
const applied = fabric.applySteeringBoundary();
evidence.applied = {
  deferred: applied.deferred,
  count: applied.applied.length,
  text: applied.combinedText,
};
evidence.sequence.push({
  t: Date.now(),
  type: "steering.applied",
  text: applied.combinedText,
});

if (applied.combinedText) {
  agBind.continueNative({
    text: `Operator steering APPLIED:\n${applied.combinedText}\nContinue and finish the fix.`,
  });
}

const deadline = Date.now() + 300_000;
while (!terminal && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 500));
}
evidence.terminal = terminal?.type || null;

const src = readFileSync(join(wt.worktreePath, "src/add.js"), "utf8");
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

evidence.engineering = {
  exportStillAdd: /export function add\s*\(/.test(src),
  fixed: /a\s*\+\s*b/.test(src),
  testExit: test.status,
  validation: validation?.classification,
  source: src.slice(0, 200),
};
evidence.events = {
  pending: events.some((e) => /steering pending/i.test(String(e.label || ""))),
  applied: events.some((e) => /steering applied/i.test(String(e.label || ""))),
};

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
removeTaskWorktree(primary, wt.worktreePath);

evidence.verdict =
  evidence.pendingWhileMutating.status === "PENDING" &&
  evidence.pendingWhileMutating.deferred === true &&
  evidence.applied.count >= 1 &&
  evidence.engineering.exportStillAdd &&
  evidence.engineering.fixed &&
  evidence.engineering.testExit === 0 &&
  evidence.engineering.validation === "VERIFIED"
    ? "PASS"
    : "PARTIAL";

writeFileSync(join(outDir, "steering-live.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify({
    verdict: evidence.verdict,
    pending: evidence.pendingWhileMutating,
    applied: evidence.applied.count,
    validation: evidence.engineering.validation,
  }),
);
process.exit(evidence.verdict === "PASS" ? 0 : 1);
