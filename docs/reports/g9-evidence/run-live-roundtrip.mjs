/**
 * G9 round-trip collab: AG → Copilot → AG resume → PATH VERIFIED.
 *
 * Usage:
 *   node run-live-roundtrip.mjs <label> <projectRoot> <outDir>
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { prepareEngineeringEnvironment } from "../../../scripts/pathcode-cli/ag9/prepare.mjs";
import { runCopilotEngineeringTurn } from "../../../scripts/pathcode-cli/ag9/copilot-engine.mjs";
import {
  withCollabTurn,
  appendCollabJournal,
  formatCollabHandoff,
  readCollabJournal,
} from "../../../scripts/pathcode-cli/ag9/collaborate.mjs";
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
import { createAntigravityEngineeringAgent } from "../../../scripts/pathcode-cli/ag1/bridge-client.mjs";
import { ensureAg1Runtime } from "../../../scripts/pathcode-cli/ag1/runtime-bootstrap.mjs";
import { assertAg1VenvReady } from "../../../scripts/pathcode-cli/ag1/venv-guard.mjs";

const checkout = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const label = process.argv[2];
const projectRoot = resolve(process.argv[3]);
const outDir = resolve(process.argv[4]);
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolve(checkout, "docs/reports/g9-evidence/runtime-live-roundtrip");

mkdirSync(outDir, { recursive: true });
process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";

const admission = admitPrimaryCheckout(projectRoot);
if (!admission.ok) {
  console.log(JSON.stringify({ label, blocked: true, admission }, null, 2));
  process.exit(2);
}

const primaryBefore = capturePrimaryFingerprint(projectRoot);
const taskId = `g9rt-${randomUUID().slice(0, 8)}`;
const worktree = createTaskWorktree({
  primaryRoot: projectRoot,
  taskId,
  baselineCommit: admission.head,
  checkoutRoot: checkout,
});
if (!worktree.ok) {
  console.log(JSON.stringify({ label, worktree }, null, 2));
  process.exit(2);
}

const engineeringCwd = resolveEngineeringCwd(worktree.worktreePath, "");
const prepared = await prepareEngineeringEnvironment({
  projectRoot,
  worktreePath: worktree.worktreePath,
  runtimeRoot,
  taskText: "round-trip collaborative engineering AG→Copilot→AG",
  startServices: false,
});
if (prepared?.toolEnv?.PATH) process.env.PATH = prepared.toolEnv.PATH;
for (const [k, v] of Object.entries(prepared.toolEnv || {})) {
  if (typeof v === "string" && v) process.env[k] = v;
}

function snap() {
  try {
    return readFileSync(join(engineeringCwd, "src/lib.rs"), "utf8");
  } catch {
    return null;
  }
}
function analyze(lib) {
  if (!lib) return { addFixed: false, mulFixed: false, comment: false };
  const addMatch = lib.match(/pub fn add[\s\S]*?\{([\s\S]*?)\}/);
  const mulMatch = lib.match(/pub fn mul[\s\S]*?\{([\s\S]*?)\}/);
  return {
    addFixed: /\ba\s*\+\s*b\b/.test(addMatch?.[1] || "") && !/\ba\s*-\s*b\b/.test(addMatch?.[1] || ""),
    mulFixed: /\ba\s*\*\s*b\b/.test(mulMatch?.[1] || ""),
    comment: /ROUNDTRIP|peer engine|collaborative/i.test(lib),
  };
}

appendCollabJournal({
  runtimeRoot,
  taskId,
  engine: "path",
  phase: "session_start",
  detail: "Round-trip AG→Copilot→AG",
});

const boot = await ensureAg1Runtime({ packageRoot: checkout, runtimeRoot });
const venv = assertAg1VenvReady({
  checkoutRoot: checkout,
  runtimeRoot: boot.runtimeRoot,
  pythonPath: boot.pythonPath,
});
if (!boot?.ok || !venv?.ok) {
  console.log(JSON.stringify({ label, blocked: true, boot, venv }, null, 2));
  process.exit(2);
}

async function runAgTurn(promptText, phase) {
  const events = [];
  return withCollabTurn(
    { runtimeRoot, taskId, engine: "antigravity", timeoutMs: 480_000 },
    async () => {
      let resolveFinished = () => {};
      const waitFinished = new Promise((r) => {
        resolveFinished = r;
      });
      const agent = createAntigravityEngineeringAgent({
        checkoutRoot: checkout,
        runtimeRoot,
        pythonPath: boot.pythonPath,
        env: { ...process.env, ...(prepared.toolEnv || {}) },
        onEvent: (msg) => {
          events.push(msg);
          if (msg?.type === "finished" || msg?.type === "failed" || msg?.type === "cancelled") {
            resolveFinished(msg);
          }
        },
      });
      try {
        const start = await agent.startTask({
          taskId: `${taskId}-${phase}`,
          task: promptText,
          workspace: worktree.worktreePath,
          defaultCwd: engineeringCwd,
          allowShell: true,
          capabilityBrief: prepared.capabilityBrief || "",
          toolEnv: prepared.toolEnv || {},
          budget: { maxModelCalls: 40, maxToolCalls: 80, wallClockMs: 360_000 },
        });
        if (!start?.ok) return { ok: false, detail: start?.message || "start failed", events };
        const terminal = await Promise.race([
          waitFinished,
          new Promise((_, rej) => setTimeout(() => rej(new Error("AG timeout")), 360_000)),
        ]);
        return {
          ok: terminal?.type === "finished",
          detail: String(terminal?.type || "unknown"),
          events: events.slice(0, 40),
        };
      } finally {
        try {
          agent.signalDone();
        } catch {
          /* */
        }
        try {
          agent.close?.();
        } catch {
          /* */
        }
      }
    },
  );
}

// Phase 1 AG: fix add only
const ag1 = await runAgTurn(
  [
    "ROUNDTRIP phase 1/3. Fix ONLY pub fn add (a+b). Leave mul broken.",
    "Do not push. Stop after fixing add.",
  ].join("\n"),
  "ag1",
);
appendCollabJournal({
  runtimeRoot,
  taskId,
  engine: "antigravity",
  phase: "turn_end",
  detail: `ag1 ok=${ag1?.ok}`,
});
const afterAg1 = analyze(snap());
const mid1 = await runIndependentFinalValidation({
  worktreePath: worktree.worktreePath,
  engineeringCwd,
  primaryRoot: projectRoot,
});

// Phase 2 Copilot: fix mul
const handoff = formatCollabHandoff(readCollabJournal({ runtimeRoot, taskId })) || "";
const cp = await withCollabTurn(
  { runtimeRoot, taskId, engine: "copilot", timeoutMs: 480_000 },
  async () =>
    runCopilotEngineeringTurn({
      prompt: [
        "ROUNDTRIP phase 2/3. Peer fixed add. Inspect current files/Git.",
        "Fix mul so tests for mul pass. Do not break add. Do not push.",
        handoff,
        JSON.stringify(mid1, null, 2).slice(0, 2500),
      ].join("\n"),
      cwd: engineeringCwd,
      toolEnv: prepared.toolEnv,
      timeoutMs: 360_000,
    }),
);
appendCollabJournal({
  runtimeRoot,
  taskId,
  engine: "copilot",
  phase: "turn_end",
  detail: `cp ok=${cp?.ok}`,
});
const afterCp = analyze(snap());
const mid2 = await runIndependentFinalValidation({
  worktreePath: worktree.worktreePath,
  engineeringCwd,
  primaryRoot: projectRoot,
});

// Phase 3 AG resume: add documentation comment proving continuation from current reality
const ag2 = await runAgTurn(
  [
    "ROUNDTRIP phase 3/3. Resume from CURRENT worktree state (do not revert peer fixes).",
    "Add a short rustdoc comment above pub fn add containing the exact token ROUNDTRIP_OK.",
    "Do not change function bodies. Run cargo test if needed. Do not push.",
  ].join("\n"),
  "ag2",
);
appendCollabJournal({
  runtimeRoot,
  taskId,
  engine: "antigravity",
  phase: "turn_end",
  detail: `ag2 ok=${ag2?.ok}`,
});
const afterAg2 = analyze(snap());

const validation = await runIndependentFinalValidation({
  worktreePath: worktree.worktreePath,
  engineeringCwd,
  primaryRoot: projectRoot,
});
const classification = classifyAg1Result({
  agentFinished: Boolean(afterAg1.addFixed && afterCp.mulFixed && afterAg2.comment),
  validation,
});
const gitResult = collectWorktreeResult(worktree.worktreePath, worktree.baseline.head);
const untouched = primaryUntouched(primaryBefore, capturePrimaryFingerprint(projectRoot));
let commitSha = null;
if (classification === "VERIFIED" && gitResult.changedFiles.length > 0) {
  const committed = commitTaskWorktree({
    worktreePath: worktree.worktreePath,
    message: `PATH: verified roundtrip task ${taskId}`,
  });
  commitSha = committed?.commitSha || committed?.sha || null;
}

const summary = {
  label,
  engine: "roundtrip",
  classification,
  sameWorktree: worktree.worktreePath,
  phases: {
    ag1: { ok: ag1?.ok, contribution: afterAg1, mid: mid1?.classification },
    copilot: { ok: cp?.ok, contribution: afterCp, mid: mid2?.classification },
    ag2: { ok: ag2?.ok, contribution: afterAg2 },
  },
  materialRoundTrip: Boolean(
    afterAg1.addFixed && afterCp.mulFixed && afterAg2.comment && afterAg1.addFixed,
  ),
  conflictProtection: "exclusive withCollabTurn leases",
  primaryUntouched: untouched,
  commitSha,
  validation,
  changedFiles: gitResult.changedFiles,
  journalTail: readCollabJournal({ runtimeRoot, taskId }).slice(-12),
};

writeFileSync(join(outDir, `${label}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(
  join(outDir, `${label}.json`),
  `${JSON.stringify({ summary, ag1, cp, ag2, mid1, mid2, validation }, null, 2)}\n`,
);
try {
  removeTaskWorktree(projectRoot, worktree.worktreePath);
} catch {
  /* */
}
console.log(JSON.stringify(summary, null, 2));
process.exitCode = classification === "VERIFIED" && summary.materialRoundTrip ? 0 : 1;
