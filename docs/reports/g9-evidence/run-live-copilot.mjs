/**
 * G9 Copilot full-engine live harness — PATH worktree + prepare + Copilot mutate
 * + PATH independent final validation + durable commit when VERIFIED.
 *
 * Usage:
 *   node run-live-copilot.mjs <label> <projectRoot> <taskText> <outDir>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { prepareEngineeringEnvironment } from "../../../scripts/pathcode-cli/ag9/prepare.mjs";
import { runCopilotEngineeringTurn } from "../../../scripts/pathcode-cli/ag9/copilot-engine.mjs";
import { withCollabTurn, appendCollabJournal } from "../../../scripts/pathcode-cli/ag9/collaborate.mjs";
import {
  capturePrimaryFingerprint,
  createTaskWorktree,
  primaryUntouched,
  collectWorktreeResult,
  removeTaskWorktree,
} from "../../../scripts/pathcode-cli/ag1/task-worktree.mjs";
import { admitPrimaryCheckout } from "../../../scripts/pathcode-cli/ag1/admission.mjs";
import { commitTaskWorktree } from "../../../scripts/pathcode-cli/ag1/task-commit.mjs";
import {
  runIndependentFinalValidation,
  classifyAg1Result,
} from "../../../scripts/pathcode-cli/ag1/final-validation.mjs";
import { resolveEngineeringCwd } from "../../../scripts/pathcode-cli/paths.mjs";

const checkout = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const label = process.argv[2];
const projectRoot = resolve(process.argv[3]);
const taskText = process.argv[4];
const outDir = resolve(process.argv[5]);
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g9-evidence/runtime-live-copilot");

mkdirSync(outDir, { recursive: true });
process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;

const admission = admitPrimaryCheckout(projectRoot);
if (!admission.ok) {
  console.log(JSON.stringify({ label, blocked: true, admission }, null, 2));
  process.exitCode = 2;
  process.exit();
}

const primaryBefore = capturePrimaryFingerprint(projectRoot);
const taskId = `g9cp-${randomUUID().slice(0, 8)}`;
const worktree = createTaskWorktree({
  primaryRoot: projectRoot,
  taskId,
  baselineCommit: admission.head,
  checkoutRoot: checkout,
});
if (!worktree.ok) {
  console.log(JSON.stringify({ label, worktree }, null, 2));
  process.exitCode = 2;
  process.exit();
}

const engineeringCwd = resolveEngineeringCwd(worktree.worktreePath, "");
const prepared = await prepareEngineeringEnvironment({
  projectRoot,
  worktreePath: worktree.worktreePath,
  runtimeRoot,
  taskText,
  startServices: false,
});
if (prepared?.toolEnv?.PATH) process.env.PATH = prepared.toolEnv.PATH;
for (const [k, v] of Object.entries(prepared.toolEnv || {})) {
  if (typeof v === "string" && v) process.env[k] = v;
}

appendCollabJournal({
  runtimeRoot,
  taskId,
  engine: "copilot",
  phase: "session_start",
  detail: "Copilot full-engine live harness",
});

const turn = await withCollabTurn(
  { runtimeRoot, taskId, engine: "copilot", timeoutMs: 600_000 },
  async () =>
    runCopilotEngineeringTurn({
      prompt: [
        "You are a full collaborating engineering engine in this PATH task worktree.",
        "You may inspect, edit, build, test, and repair code inside this workspace.",
        "Do not push, open PRs, deploy, or leave the worktree.",
        "Complete the engineering objective below, then stop.",
        "",
        taskText,
      ].join("\n"),
      cwd: engineeringCwd,
      toolEnv: prepared.toolEnv,
      timeoutMs: 480_000,
    }),
);

const validation = await runIndependentFinalValidation({
  worktreePath: worktree.worktreePath,
  engineeringCwd,
  primaryRoot: projectRoot,
});

const classification = classifyAg1Result({
  agentFinished: Boolean(turn?.ok),
  validation,
});

const gitResult = collectWorktreeResult(
  worktree.worktreePath,
  worktree.baseline.head,
);
const primaryAfter = capturePrimaryFingerprint(projectRoot);
const untouched = primaryUntouched(primaryBefore, primaryAfter);

/** @type {string | null} */
let commitSha = null;
if (classification === "VERIFIED" && gitResult.changedFiles.length > 0) {
  const committed = commitTaskWorktree({
    worktreePath: worktree.worktreePath,
    message: `PATH: verified Copilot task ${taskId}`,
  });
  commitSha = committed?.commitSha || committed?.sha || null;
}

const summary = {
  label,
  engine: "copilot",
  classification,
  turnOk: Boolean(turn?.ok),
  turnDetail: turn?.detail || null,
  changedFiles: turn?.changedFiles || gitResult.changedFiles,
  validation,
  primaryUntouched: untouched,
  commitSha,
  worktree: worktree.worktreePath,
  prepareBrief: prepared.capabilityBrief?.slice?.(0, 800),
};

writeFileSync(join(outDir, `${label}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(
  join(outDir, `${label}.json`),
  `${JSON.stringify({ summary, turn, validation, gitResult }, null, 2)}\n`,
);

try {
  removeTaskWorktree(projectRoot, worktree.worktreePath);
} catch {
  /* keep on failure for inspection */
}

console.log(JSON.stringify(summary, null, 2));
process.exitCode = classification === "VERIFIED" ? 0 : 1;
