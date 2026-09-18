#!/usr/bin/env node
/**
 * S3.1 — LIVE Cursor result-capture proof.
 *
 * Runs Cursor through Gateway (preferredEngine=cursor) to create a small file,
 * then asserts durable report + /inspect show the file and Adoptable: yes.
 *
 * Writes: s31-result-capture.json (no secrets).
 */
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/index.mjs";
import { detectCursorEngine } from "../../../../scripts/pathcode-cli/ag10/cursor-sdk.mjs";
import {
  getTaskHistoryEntry,
  formatInspectPanel,
  taskHasAdoptableChanges,
} from "../../../../scripts/pathcode-cli/task-history.mjs";

const checkout = fileURLToPath(new URL("../../../..", import.meta.url));
const outDir = join(checkout, "docs/reports/g10-evidence/s3");
const fixture = join(outDir, "live-fixture");
const runtimeRoot = join(homedir(), ".path-code", "runtime-s31-result-capture");
mkdirSync(outDir, { recursive: true });

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

function ensureFixture() {
  mkdirSync(fixture, { recursive: true });
  if (!existsSync(join(fixture, ".git"))) {
    git(fixture, ["-c", "init.defaultBranch=main", "init", "--template="]);
    git(fixture, ["config", "user.email", "s31@test"]);
    git(fixture, ["config", "user.name", "s31"]);
  }
  writeFileSync(join(fixture, "README.md"), "s31 live fixture\n");
  writeFileSync(
    join(fixture, "package.json"),
    `${JSON.stringify(
      {
        name: "s31-live-fixture",
        private: true,
        scripts: { test: 'node -e "process.exit(0)"' },
      },
      null,
      2,
    )}\n`,
  );
  git(fixture, ["add", "-A"]);
  const dirty = git(fixture, ["status", "--porcelain"]);
  if (String(dirty.stdout || "").trim()) {
    git(fixture, ["commit", "-m", "s31 fixture baseline"]);
  }
}

const evidence = {
  schema: "pathcode.s3.result-capture.live.v1",
  at: new Date().toISOString(),
  verdict: "PENDING",
  steps: /** @type {Record<string, unknown>} */ ({}),
};

async function main() {
  rmSync(runtimeRoot, { recursive: true, force: true });
  mkdirSync(runtimeRoot, { recursive: true });
  process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
  ensureFixture();

  const detected = await detectCursorEngine();
  evidence.steps.detect = {
    ready: detected.ready === true,
    status: detected.status,
  };
  if (!detected.ready) {
    evidence.verdict = "BLOCKED_AUTH";
    writeFileSync(
      join(outDir, "s31-result-capture.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.error("Cursor engine not ready");
    process.exit(2);
  }

  const gw = createGatewayRuntime({
    packageRoot: checkout,
    runtimeRoot,
  });
  await gw.bindProject({ cwd: fixture });

  const objective = [
    "Create a file named S3_CURSOR_OPERATOR_ACCEPTANCE.md in the task workspace.",
    "",
    "Its complete contents must be exactly:",
    "",
    "S3.1 Cursor operator acceptance.",
    "",
    "Do not modify any other file.",
    "Do not push or publish anything.",
    "Reply briefly when done.",
  ].join("\n");

  /** @type {object[]} */
  const events = [];
  const unsub = gw.onEvent((env) => {
    const ev = env?.event || env;
    if (ev && typeof ev === "object") events.push(ev);
  });

  const started = await gw.startTask({
    objective,
    preferredEngine: "cursor",
    cwd: fixture,
  });
  const taskId = started.taskId;
  evidence.steps.start = {
    taskId,
    preferredEngine: started.preferredEngine || null,
  };

  const snap = taskId ? await gw.awaitTask(taskId, 300_000) : null;
  unsub?.();

  evidence.steps.snapshot = {
    status: snap?.status || null,
    classification: snap?.classification || null,
    commitSha: snap?.commitSha || null,
    taskBranch: snap?.taskBranch || null,
    changedFiles: snap?.result?.changedFiles || null,
  };

  const resultEvent = [...events]
    .reverse()
    .find((e) => e?.type === "session.engineering.result");
  evidence.steps.resultEvent = {
    changedFiles: resultEvent?.changedFiles || null,
    commitSha: resultEvent?.commitSha || null,
    baselineSha: resultEvent?.baselineSha || null,
  };

  // Prefer session taskId from result (matches report/checkpoint). Gateway may
  // historically have used a distinct id before resumeTaskId wiring.
  const durableTaskId =
    (typeof snap?.result?.taskId === "string" && snap.result.taskId) ||
    (typeof snap?.taskBranch === "string" &&
      snap.taskBranch.match(/path\/task-([0-9a-fA-F-]{8,})/)?.[1]) ||
    taskId;

  const entry = getTaskHistoryEntry(runtimeRoot, durableTaskId);
  const inspect = entry ? formatInspectPanel(entry) : "";
  const reportPath = entry?.reportPath;
  const reportText =
    reportPath && existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "";

  evidence.steps.inspect = {
    durableTaskId,
    changedFiles: entry?.changedFiles || [],
    adoptable: entry ? taskHasAdoptableChanges(entry) : false,
    branch: entry?.branch || null,
    sha: entry?.sha || null,
    baseline: entry?.baseline || null,
    panelHasFile: /S3_CURSOR_OPERATOR_ACCEPTANCE\.md/.test(inspect),
    panelAdoptable: /Adoptable: yes/.test(inspect),
  };
  evidence.steps.report = {
    hasChangedSection: /^Changed$/m.test(reportText),
    mentionsFile: /S3_CURSOR_OPERATOR_ACCEPTANCE\.md/.test(reportText),
  };

  const ok =
    evidence.steps.inspect.panelHasFile === true &&
    evidence.steps.inspect.panelAdoptable === true &&
    Array.isArray(evidence.steps.inspect.changedFiles) &&
    evidence.steps.inspect.changedFiles.includes(
      "S3_CURSOR_OPERATOR_ACCEPTANCE.md",
    );

  evidence.verdict = ok ? "LIVE-VERIFIED" : "FAILED";
  evidence.inspectPanel = inspect.slice(0, 2000);

  writeFileSync(
    join(outDir, "s31-result-capture.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  writeFileSync(
    join(outDir, "s31-result-capture-run.txt"),
    [
      `verdict=${evidence.verdict}`,
      `taskId=${taskId}`,
      `changed=${JSON.stringify(evidence.steps.inspect.changedFiles)}`,
      `adoptable=${evidence.steps.inspect.adoptable}`,
      "",
      inspect,
      "",
    ].join("\n"),
  );

  console.log(JSON.stringify({ verdict: evidence.verdict, taskId, ok }, null, 2));
  await gw.shutdown?.();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  evidence.verdict = "ERROR";
  evidence.error = String(err && err.message ? err.message : err);
  writeFileSync(
    join(outDir, "s31-result-capture.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.error(err);
  process.exit(1);
});
