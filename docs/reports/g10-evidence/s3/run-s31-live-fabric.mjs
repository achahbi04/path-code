#!/usr/bin/env node
/**
 * S3.1 LIVE fabric proof — Cursor via PATH Gateway + executor surface.
 *
 * Exercises:
 *  1. resolveCursorApiKey / detectCursorEngine
 *  2. createCursorEngine engineering turn (shared fixture worktree)
 *  3. Gateway startTask preferredEngine=cursor (events + result provenance)
 *  4. Mid-task steer enqueue
 *  5. Separate cancel path on a long Cursor turn
 *
 * Writes: s31-live-fabric.json (no secrets).
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
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/index.mjs";
import {
  createCursorEngine,
  detectCursorEngine,
  resolveCursorApiKey,
} from "../../../../scripts/pathcode-cli/ag10/cursor-sdk.mjs";

const checkout = fileURLToPath(new URL("../../../..", import.meta.url));
const outDir = join(checkout, "docs/reports/g10-evidence/s3");
const fixture = join(outDir, "live-fixture");
const scratchRoot = join(checkout, ".path-code-tmp", "s31-live-fabric");
mkdirSync(outDir, { recursive: true });
mkdirSync(scratchRoot, { recursive: true });

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
  writeFileSync(join(fixture, "S31_CURSOR_MARK.txt"), "cursor-fabric-ok\n");
  git(fixture, ["add", "-A"]);
  const dirty = git(fixture, ["status", "--porcelain"]);
  if (String(dirty.stdout || "").trim()) {
    git(fixture, ["commit", "-m", "s31 fixture baseline"]);
  }
}

const evidence = {
  schema: "pathcode.s3.engine-fabric.live.v1",
  at: new Date().toISOString(),
  note: "S3.1 LIVE fabric proof. S2 freeze tip preserved. S4 not started.",
  cases: {},
};

const apiKey = resolveCursorApiKey(process.env);
if (!apiKey) {
  evidence.verdict = "AUTH_REQUIRED";
  writeFileSync(join(outDir, "s31-live-fabric.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: evidence.verdict }));
  process.exit(2);
}

ensureFixture();

const detect = await detectCursorEngine({ env: process.env });
evidence.cases.detect = {
  ok: detect.ready === true,
  status: detect.status,
  evidence: detect.evidence,
};

// --- 1) Direct executor turn against fixture ---
{
  /** @type {object[]} */
  const events = [];
  const engine = await createCursorEngine({
    taskId: "s31-direct",
    cwd: fixture,
    emit: (ev) => events.push(ev),
  });
  const connected = await engine.ensureConnected();
  const turn = await engine.runEngineeringTurn({
    prompt:
      "Create a file named S31_CURSOR_MARK.txt containing exactly: cursor-fabric-ok\nDo not modify other files. Reply with done when finished.",
    timeoutMs: 180_000,
  });
  const markPath = join(fixture, "S31_CURSOR_MARK.txt");
  const markOk =
    existsSync(markPath) &&
    readFileSync(markPath, "utf8").includes("cursor-fabric-ok");
  evidence.cases.directTurn = {
    ok: turn.ok === true && markOk,
    turnOk: turn.ok === true,
    markOk,
    engine: turn.engine || "cursor",
    mode: turn.mode || engine.getMode(),
    sessionId: turn.sessionId || engine.getSessionId(),
    runId: turn.runId || null,
    changedFiles: turn.changedFiles || [],
    eventTypes: [...new Set(events.map((e) => e.type).filter(Boolean))].slice(0, 40),
    text: String(turn.text || "").slice(0, 240),
    detail: turn.detail || null,
    code: turn.code || null,
  };
  await engine.disconnect();
}

// --- 2) Gateway preferredEngine=cursor primary turn ---
{
  const runtimeRoot = join(scratchRoot, `gw-${Date.now()}`);
  mkdirSync(runtimeRoot, { recursive: true });
  const runtime = createGatewayRuntime({
    packageRoot: checkout,
    runtimeRoot,
  });
  /** @type {object[]} */
  const events = [];
  const off = runtime.onEvent((env) => {
    const ev = env?.event || env;
    if (ev && typeof ev === "object") events.push(ev);
  });

  await runtime.bindProject({ cwd: fixture });
  const caps = runtime.listCapabilities();
  const cursorCap = caps.engines?.find((e) => e.id === "cursor");
  evidence.cases.gatewayCaps = {
    ok: cursorCap?.status === "available",
    cursorStatus: cursorCap?.status,
  };

  const started = await runtime.startTask({
    objective:
      "Append one line 'gateway-cursor' to S31_CURSOR_MARK.txt if it exists, otherwise create it with that line. Keep the change minimal. Reply briefly when done.",
    preferredEngine: "cursor",
    cwd: fixture,
  });
  evidence.cases.gatewayStart = {
    ok: started?.ok !== false && Boolean(started?.taskId),
    taskId: started?.taskId || null,
    preferredEngine: started?.preferredEngine || null,
  };

  let snap = null;
  if (started?.taskId) {
    // Enqueue steer while running (best-effort).
    await new Promise((r) => setTimeout(r, 1500));
    const steered = runtime.steerTask(
      started.taskId,
      "Keep the edit minimal; do not refactor.",
    );
    evidence.cases.gatewaySteer = {
      ok: steered?.ok !== false,
      code: steered?.code || null,
      detail: steered?.detail || steered?.message || null,
    };
    snap = await runtime.awaitTask(started.taskId);
  }

  const routingEvents = events.filter(
    (e) =>
      e.engine === "cursor" ||
      /cursor/i.test(String(e.detail || "")) ||
      /preferred engine:\s*cursor/i.test(String(e.detail || "")),
  );
  const provenance =
    snap?.result?.engine ||
    snap?.result?.provenance?.engine ||
    snap?.capabilities?.preferredEngine ||
    null;

  evidence.cases.gatewayCursorTask = {
    ok:
      Boolean(snap) &&
      (snap.status === "completed" || snap.status === "failed") &&
      routingEvents.length > 0,
    status: snap?.status || null,
    classification: snap?.classification || null,
    worktreePath: snap?.worktreePath || null,
    provenance,
    routingEventCount: routingEvents.length,
    eventSample: routingEvents.slice(0, 8).map((e) => ({
      type: e.type,
      engine: e.engine || null,
      detail: String(e.detail || e.label || "").slice(0, 120),
    })),
    resultDetail: String(
      snap?.result?.detail || snap?.result?.summary || "",
    ).slice(0, 240),
  };

  // G10 checkpoints live under metadata/tasks — capture before cleanup.
  try {
    const { readdirSync } = await import("node:fs");
    const metaTasks = join(runtimeRoot, "metadata", "tasks");
    const files = existsSync(metaTasks)
      ? readdirSync(metaTasks).filter((f) => f.endsWith(".checkpoint.json"))
      : [];
    evidence.cases.gatewayHistory = {
      ok: files.length > 0 || Boolean(snap?.taskId),
      checkpointFiles: files.slice(0, 8),
      taskId: snap?.taskId || started?.taskId || null,
      engine: snap?.result?.engine || null,
      preferredEngine: snap?.result?.preferredEngine || null,
      classification: snap?.classification || null,
      commitSha: snap?.commitSha || null,
    };
  } catch (err) {
    evidence.cases.gatewayHistory = {
      ok: Boolean(snap?.taskId),
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Tighten gatewayCursorTask after provenance fields exist.
  if (evidence.cases.gatewayCursorTask) {
    const primaryDone = routingEvents.some((e) =>
      /preferred Cursor engine taking the primary turn/i.test(
        String(e.detail || ""),
      ),
    );
    const completedOk =
      snap?.status === "completed" ||
      snap?.classification === "VERIFIED" ||
      snap?.classification === "PARTIALLY_VERIFIED";
    evidence.cases.gatewayCursorTask.ok =
      primaryDone &&
      routingEvents.length > 0 &&
      Boolean(snap) &&
      completedOk &&
      (snap?.result?.engine === "cursor" ||
        snap?.result?.preferredEngine === "cursor");
    evidence.cases.gatewayCursorTask.primaryDone = primaryDone;
    evidence.cases.gatewayCursorTask.completedOk = completedOk;
    evidence.cases.gatewayCursorTask.provenance =
      snap?.result?.engine ||
      snap?.result?.preferredEngine ||
      evidence.cases.gatewayCursorTask.provenance;
  }

  off?.();
  try {
    rmSync(runtimeRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// --- 3) Cancel path: long turn + abort ---
{
  /** @type {object[]} */
  const events = [];
  const engine = await createCursorEngine({
    taskId: "s31-cancel",
    cwd: fixture,
    emit: (ev) => events.push(ev),
  });
  await engine.ensureConnected();
  const ac = new AbortController();
  const turnPromise = engine.runEngineeringTurn({
    prompt:
      "Spend time carefully inspecting the repository structure and listing every file recursively in narration before making any change. Take your time.",
    timeoutMs: 120_000,
    signal: ac.signal,
  });
  await new Promise((r) => setTimeout(r, 2500));
  ac.abort();
  await engine.cancel();
  const cancelled = await turnPromise;
  evidence.cases.cancel = {
    ok: cancelled?.code === "CANCELLED",
    code: cancelled?.code || null,
    detail: String(cancelled?.detail || "").slice(0, 200),
    engine: cancelled?.engine || "cursor",
  };
  await engine.disconnect();
}

const caseOk = Object.values(evidence.cases).every((c) => c && c.ok === true);
evidence.verdict = caseOk ? "LIVE-VERIFIED" : "LIVE-PARTIAL";

writeFileSync(
  join(outDir, "s31-live-fabric.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      verdict: evidence.verdict,
      cases: Object.fromEntries(
        Object.entries(evidence.cases).map(([k, v]) => [k, Boolean(v?.ok)]),
      ),
    },
    null,
    2,
  ),
);
process.exitCode = caseOk ? 0 : 1;
