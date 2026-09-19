#!/usr/bin/env node
/**
 * S5 diagnostic — live Copilot child ends gatewayStatus=failed / NOT_VERIFIED
 * despite LIVE_MARKER.txt. Captures full terminal, validation, and result payloads.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { ensureBuildOrigin } from "../../../../scripts/pathcode-cli/build/index.mjs";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "../../../..");
const OUT_JSON = join(HERE, "diag-live-not-verified.json");
const TIMEOUT_MS = 180_000;

const CAPTURED_TYPES = new Set([
  "session.terminal",
  "session.engineering.result",
]);

function typeMatchesCapture(type) {
  if (typeof type !== "string") return false;
  if (CAPTURED_TYPES.has(type)) return true;
  return type.startsWith("session.validation.");
}

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
}

function projectGitState(projectDir) {
  const inside = git(projectDir, ["rev-parse", "--is-inside-work-tree"]);
  const head = git(projectDir, ["rev-parse", "HEAD"]);
  const log = git(projectDir, ["log", "--oneline", "-3"]);
  const porcelain = git(projectDir, ["status", "--porcelain", "-uall"]);
  const name = git(projectDir, ["config", "--get", "user.name"]);
  const email = git(projectDir, ["config", "--get", "user.email"]);
  let markerContent = null;
  const markerPath = join(projectDir, "LIVE_MARKER.txt");
  if (existsSync(markerPath)) {
    markerContent = readFileSync(markerPath, "utf8");
  }
  return {
    insideWorkTree: inside.stdout?.trim() === "true",
    head: head.status === 0 ? head.stdout.trim() : null,
    headError: head.status !== 0 ? (head.stderr || head.stdout || "").trim() : null,
    logOneline: log.status === 0 ? log.stdout.trim().split("\n").filter(Boolean) : [],
    porcelain: porcelain.stdout?.trim() || "",
    gitUserName: name.status === 0 ? name.stdout.trim() : null,
    gitUserEmail: email.status === 0 ? email.stdout.trim() : null,
    markerExists: existsSync(markerPath),
    markerContent,
  };
}

async function main() {
  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
  delete process.env.PATHCODE_BUILD_FAKE;
  delete process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;

  const base = mkdtempSync(join(tmpdir(), "path-s5-diag-nv-"));
  const runtimeRoot = join(base, "runtime");
  const projectDir = join(base, "product");
  mkdirSync(runtimeRoot, { recursive: true });

  /** @type {Record<string, unknown>} */
  const evidence = {
    schema: "pathcode.s5.diag-live-not-verified.v1",
    at: new Date().toISOString(),
    timeoutMs: TIMEOUT_MS,
    baseDir: base,
    runtimeRoot,
    projectDir,
    origin: null,
    bind: null,
    task: null,
    snapshot: null,
    gitBefore: null,
    gitAfter: null,
    capturedEvents: /** @type {object[]} */ ([]),
    allEventTypes: /** @type {string[]} */ ([]),
    diagnosis: /** @type {Record<string, unknown>} */ ({}),
  };

  const origin = ensureBuildOrigin({ targetDir: projectDir });
  evidence.origin = origin;
  evidence.gitBefore = projectGitState(projectDir);

  if (!origin.ok) {
    evidence.verdict = "ORIGIN_FAILED";
    writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
    process.exit(1);
  }

  const runtime = createGatewayRuntime({
    packageRoot: PACKAGE_ROOT,
    runtimeRoot,
  });

  const bound = await runtime.bindProject({ cwd: origin.binding.projectRoot });
  evidence.bind = bound;

  /** @type {Set<string>} */
  const seenTypes = new Set();
  const off = runtime.onEvent((env) => {
    const ev = env?.event;
    if (!ev || typeof ev !== "object") return;
    if (typeof ev.type === "string") seenTypes.add(ev.type);
    if (!typeMatchesCapture(ev.type)) return;
    evidence.capturedEvents.push(structuredClone(ev));
  });

  const objective = [
    "Create LIVE_MARKER.txt at the repository root containing exactly: s5-live-ok",
    "",
    "Also establish git history: if there is no commit yet, stage LIVE_MARKER.txt and create the initial commit with message \"Add LIVE_MARKER\".",
    "Configure local git user.name and user.email in this repo if needed to commit.",
    "Do not push or leave the project directory.",
  ].join("\n");

  const started = await runtime.startTask({
    objective,
    preferredEngine: "copilot",
    cwd: origin.binding.projectRoot,
  });

  evidence.task = {
    ok: started?.ok,
    taskId: started?.taskId,
    preferredEngine: started?.preferredEngine,
    snapshotAtStart: started?.snapshot || null,
  };

  if (!started?.ok || !started.taskId) {
    off();
    evidence.verdict = "START_FAILED";
    evidence.allEventTypes = [...seenTypes];
    writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
    process.exit(1);
  }

  let awaitResult;
  try {
    awaitResult = await Promise.race([
      runtime.awaitTask(started.taskId, TIMEOUT_MS),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`awaitTask timed out after ${TIMEOUT_MS}ms`)),
          TIMEOUT_MS,
        );
      }),
    ]);
  } catch (err) {
    awaitResult = {
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    off();
  }

  const snap = runtime.snapshotTask(started.taskId);
  evidence.snapshot = snap;
  evidence.awaitResult = awaitResult;
  evidence.gitAfter = projectGitState(projectDir);
  evidence.allEventTypes = [...seenTypes].sort();

  const engineeringResult = evidence.capturedEvents.find(
    (e) => e.type === "session.engineering.result",
  );
  const terminal = evidence.capturedEvents.filter(
    (e) => e.type === "session.terminal",
  );
  const validationEvents = evidence.capturedEvents.filter((e) =>
    String(e.type).startsWith("session.validation."),
  );

  evidence.diagnosis = {
    gatewayStatus: snap?.status ?? null,
    gatewayClassification: snap?.classification ?? null,
    sessionResultClassification: snap?.result?.classification ?? null,
    sessionValidation: snap?.result?.validation ?? null,
    engineeringResultClassification: engineeringResult?.classification ?? null,
    engineeringResultCommitSha: engineeringResult?.commitSha ?? null,
    engineeringResultCommitStatus: engineeringResult?.commitStatus ?? null,
    engineeringResultChecks: engineeringResult?.checks ?? null,
    terminalDispositions: terminal.map((t) => ({
      disposition: t.disposition,
      summary: t.summary,
      commitSha: t.commitSha,
    })),
    validationEventTypes: validationEvents.map((e) => e.type),
    validationSkipped: validationEvents.find(
      (e) => e.type === "session.validation.skipped",
    ),
    validationPlan: validationEvents.find(
      (e) => e.type === "session.validation.plan",
    ),
    validationResults: validationEvents.filter(
      (e) => e.type === "session.validation.result",
    ),
    bootstrapHints: {
      originUnversioned: origin.admission?.unversioned === true,
      originHead: origin.admission?.head ?? null,
      bindUnversioned: bound?.unversioned === true,
    },
  };

  const markerOk =
    evidence.gitAfter?.markerExists === true &&
    String(evidence.gitAfter?.markerContent || "").includes("s5-live-ok");

  evidence.verdict =
    snap?.status === "completed" && snap?.classification === "VERIFIED"
      ? "VERIFIED"
      : markerOk && snap?.classification === "NOT_VERIFIED"
        ? "MARKER_OK_BUT_NOT_VERIFIED"
        : "FAILED";

  writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exit(markerOk && snap?.classification !== "VERIFIED" ? 0 : snap?.status === "completed" ? 0 : 1);
}

main().catch((err) => {
  writeFileSync(
    OUT_JSON,
    `${JSON.stringify(
      {
        schema: "pathcode.s5.diag-live-not-verified.v1",
        verdict: "CRASH",
        error: err instanceof Error ? err.message : String(err),
      },
      null,
      2,
    )}\n`,
  );
  console.error(err);
  process.exit(1);
});
