/**
 * G9 collaborative acceptance — ONE PATH task/worktree, both engines mutate.
 *
 * Flow:
 *   1. Admit primary + create one task worktree
 *   2. Prepare engineering environment
 *   3. Antigravity turn (bridge startTask on that worktree): fix ONLY add()
 *   4. Mid validation (expect fail while mul still broken)
 *   5. Copilot turn: inspect + fix remaining failures
 *   6. PATH independent final validation + durable commit
 *
 * Usage:
 *   node run-live-collab.mjs <label> <projectRoot> <outDir>
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
  resolve(checkout, "docs/reports/g9-evidence/runtime-live-collab");

mkdirSync(outDir, { recursive: true });
process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";

const admission = admitPrimaryCheckout(projectRoot);
if (!admission.ok) {
  console.log(JSON.stringify({ label, blocked: true, admission }, null, 2));
  process.exitCode = 2;
  process.exit();
}

const primaryBefore = capturePrimaryFingerprint(projectRoot);
const taskId = `g9cl-${randomUUID().slice(0, 8)}`;
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
  taskText: "collaborative dual-engine fix of add and mul",
  startServices: false,
});
if (prepared?.toolEnv?.PATH) process.env.PATH = prepared.toolEnv.PATH;
for (const [k, v] of Object.entries(prepared.toolEnv || {})) {
  if (typeof v === "string" && v) process.env[k] = v;
}

function snapLib() {
  try {
    return readFileSync(join(engineeringCwd, "src/lib.rs"), "utf8");
  } catch {
    return null;
  }
}

function analyze(lib) {
  if (!lib) return { addFixed: false, mulFixed: false };
  const addMatch = lib.match(/pub fn add[\s\S]*?\{([\s\S]*?)\}/);
  const mulMatch = lib.match(/pub fn mul[\s\S]*?\{([\s\S]*?)\}/);
  const addBody = addMatch?.[1] || "";
  const mulBody = mulMatch?.[1] || "";
  return {
    addFixed: /\ba\s*\+\s*b\b/.test(addBody) && !/\ba\s*-\s*b\b/.test(addBody),
    mulFixed: /\ba\s*\*\s*b\b/.test(mulBody),
    addBody: addBody.trim(),
    mulBody: mulBody.trim(),
  };
}

appendCollabJournal({
  runtimeRoot,
  taskId,
  engine: "path",
  phase: "session_start",
  detail: "Collaborative live harness: AG then Copilot in one worktree",
});

const beforeSnap = analyze(snapLib());

// --- Engine 1: Antigravity on the SAME worktree ---
const boot = await ensureAg1Runtime({
  packageRoot: checkout,
  runtimeRoot,
});
if (!boot?.ok) {
  const summary = { label, blocked: true, boot };
  writeFileSync(join(outDir, `${label}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = 2;
  process.exit();
}
const venv = assertAg1VenvReady({
  checkoutRoot: checkout,
  runtimeRoot: boot.runtimeRoot,
  pythonPath: boot.pythonPath,
});
if (!venv?.ok) {
  const summary = { label, blocked: true, venv };
  writeFileSync(join(outDir, `${label}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = 2;
  process.exit();
}

/** @type {any} */
let agTurn = { ok: false, detail: "not_started" };
const agEvents = [];

try {
  agTurn = await withCollabTurn(
    { runtimeRoot, taskId, engine: "antigravity", timeoutMs: 480_000 },
    async () => {
      /** @type {(msg: any) => void} */
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
          agEvents.push(msg);
          if (
            msg?.type === "finished" ||
            msg?.type === "failed" ||
            msg?.type === "cancelled"
          ) {
            resolveFinished(msg);
          }
        },
      });
      try {
        const start = await agent.startTask({
          taskId,
          task: [
            "COLLABORATIVE HANDOFF — phase 1 of 2.",
            "Fix ONLY pub fn add so add(2,2)==4 (use addition, not subtraction).",
            "Do NOT modify pub fn mul — leave it broken for the peer engine.",
            "Do not push. After fixing add, stop.",
          ].join("\n"),
          workspace: worktree.worktreePath,
          defaultCwd: engineeringCwd,
          allowShell: true,
          capabilityBrief: prepared.capabilityBrief || "",
          toolEnv: prepared.toolEnv || {},
          budget: {
            maxModelCalls: 40,
            maxToolCalls: 80,
            wallClockMs: 420_000,
          },
        });
        if (!start?.ok) {
          return { ok: false, detail: start?.message || "startTask failed", start };
        }
        const terminal = await Promise.race([
          waitFinished,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("AG turn timeout")), 420_000),
          ),
        ]);
        return {
          ok: terminal?.type === "finished",
          detail: String(terminal?.type || "unknown"),
          summary: terminal?.summary || null,
        };
      } finally {
        try {
          agent.signalDone();
        } catch {
          /* ignore */
        }
        try {
          agent.close();
        } catch {
          /* ignore */
        }
      }
    },
  );
} catch (err) {
  agTurn = { ok: false, detail: String(err?.message || err) };
}

appendCollabJournal({
  runtimeRoot,
  taskId,
  engine: "antigravity",
  phase: "turn_end",
  detail: `ok=${agTurn?.ok} detail=${agTurn?.detail}`,
});

const afterAgSnap = analyze(snapLib());
const midValidation = await runIndependentFinalValidation({
  worktreePath: worktree.worktreePath,
  engineeringCwd,
  primaryRoot: projectRoot,
});

// --- Engine 2: Copilot continues same worktree ---
const journal = readCollabJournal({ runtimeRoot, taskId });
const handoff = formatCollabHandoff(journal) || "";

/** @type {any} */
let cpTurn = { ok: false };
try {
  cpTurn = await withCollabTurn(
    { runtimeRoot, taskId, engine: "copilot", timeoutMs: 540_000 },
    async () =>
      runCopilotEngineeringTurn({
        prompt: [
          "You are a full collaborating engineering engine in this PATH task worktree.",
          "A peer engine already worked on this same worktree. Inspect current files and Git state.",
          "Do not silently overwrite legitimate peer fixes.",
          "Fix remaining test failures so cargo test passes (likely mul).",
          "Do not push or open PRs.",
          handoff ? `\nHandoff journal:\n${handoff}` : "",
          "",
          "Independent validation failures to resolve:",
          JSON.stringify(midValidation, null, 2).slice(0, 3000),
        ].join("\n"),
        cwd: engineeringCwd,
        toolEnv: prepared.toolEnv,
        timeoutMs: 420_000,
      }),
  );
} catch (err) {
  cpTurn = { ok: false, detail: String(err?.message || err) };
}

appendCollabJournal({
  runtimeRoot,
  taskId,
  engine: "copilot",
  phase: "turn_end",
  detail: `ok=${cpTurn?.ok} detail=${cpTurn?.detail}`,
});

const afterCpSnap = analyze(snapLib());
const validation = await runIndependentFinalValidation({
  worktreePath: worktree.worktreePath,
  engineeringCwd,
  primaryRoot: projectRoot,
});

const classification = classifyAg1Result({
  agentFinished: Boolean(agTurn?.ok || afterAgSnap.addFixed) && Boolean(cpTurn?.ok || afterCpSnap.mulFixed),
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
    message: `PATH: verified collaborative task ${taskId}`,
  });
  commitSha = committed?.sha || null;
}

const summary = {
  label,
  engine: "collaborative",
  classification,
  sameWorktree: worktree.worktreePath,
  antigravity: {
    ok: Boolean(agTurn?.ok),
    detail: agTurn?.detail || null,
    contribution: afterAgSnap,
  },
  copilot: {
    ok: Boolean(cpTurn?.ok),
    detail: cpTurn?.detail || null,
    changedFiles: cpTurn?.changedFiles || [],
    contribution: afterCpSnap,
  },
  before: beforeSnap,
  midValidationOk: midValidation?.ok === true,
  midClassification: midValidation?.classification || null,
  validation,
  materialCollaboration: Boolean(
    afterAgSnap.addFixed && afterCpSnap.mulFixed && afterAgSnap.addFixed !== afterCpSnap.mulFixed
      ? true
      : afterAgSnap.addFixed &&
          (afterCpSnap.mulFixed || (cpTurn?.changedFiles || []).length > 0),
  ),
  conflictProtection: "exclusive turn leases via withCollabTurn",
  primaryUntouched: untouched,
  commitSha,
  changedFiles: gitResult.changedFiles,
  journalTail: readCollabJournal({ runtimeRoot, taskId }).slice(-8),
};

writeFileSync(join(outDir, `${label}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(
  join(outDir, `${label}.json`),
  `${JSON.stringify({ summary, agTurn, cpTurn, midValidation, validation, gitResult, agEvents: agEvents.slice(0, 80) }, null, 2)}\n`,
);

try {
  removeTaskWorktree(projectRoot, worktree.worktreePath);
} catch {
  /* keep for inspection */
}

console.log(JSON.stringify(summary, null, 2));
process.exitCode =
  classification === "VERIFIED" && summary.materialCollaboration ? 0 : 1;
