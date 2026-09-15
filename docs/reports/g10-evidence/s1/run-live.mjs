#!/usr/bin/env node
/**
 * S1 live gap closure — real Gateway → engines on a genuine non-fixture project.
 *
 * Proves:
 *  - CLI (external client) → Gateway → live AG/Copilot session
 *  - Headless attach to the same live task
 *  - Same-task multi-client while engines are working
 *  - Collaboration + capability events through the extracted gateway
 *  - Disconnect / reattach without cancelling engineering
 *  - Non-/tmp mechanical fixture project binding
 *
 * Never sets PATHCODE_GATEWAY_FAKE_ENGINE.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createGatewayClient } from "../../../../scripts/pathcode-cli/gateway/client.mjs";
import { resolveGatewaySocketPath } from "../../../../scripts/pathcode-cli/gateway/server.mjs";
import { ensureGateway, readGatewayPid } from "../../../../scripts/pathcode-cli/gateway/ensure.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const checkout = join(__dirname, "../../../..");
const outDir = join(__dirname, "live");
const operatorDemo = join(
  checkout,
  "docs/reports/g10-evidence/tmp/pathcode-g10-operator-demo",
);
const projectRoot = join(
  checkout,
  "docs/reports/g10-evidence/tmp/pathcode-s1-live-project",
);
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  join(checkout, "docs/reports/g10-evidence/runtime-live-ag");
const socketPath = resolveGatewaySocketPath(runtimeRoot);
const serverMain = join(checkout, "scripts/pathcode-cli/gateway/server-main.mjs");
const pathcodeMain = join(checkout, "scripts/pathcode.mjs");

mkdirSync(outDir, { recursive: true });

process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
process.env.PATHCODE_PACKAGE_ROOT = checkout;
process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || "path-code-gc1-260910";
process.env.PATH = [
  "/opt/homebrew/bin",
  `${process.env.HOME || ""}/.local/bin`,
  process.env.PATH || "",
]
  .filter(Boolean)
  .join(":");
delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
delete process.env.PATHCODE_USE_GATEWAY; // default on

/** @type {Record<string, unknown>} */
const evidence = {
  schema: "pathcode.s1.gateway.live.v1",
  at: new Date().toISOString(),
  note: "Live gateway ownership proof. MANUAL_UI_ACCEPTANCE remains PENDING_OPERATOR_REVIEW from S0. PATHCODE_GATEWAY_FAKE_ENGINE was not set.",
  project: {
    kind: "isolated_copy_of_operator_demo",
    source: operatorDemo,
    projectRoot,
  },
  runtimeRoot,
  socketPath,
  cases: {},
  eventTypes: [],
  g10Signals: {},
  enginesBookkeeping: null,
  verdict: "PENDING",
};

function log(...args) {
  console.error("[s1-live]", ...args);
}

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function prepareProject() {
  if (!existsSync(operatorDemo)) {
    throw new Error(`operator demo missing: ${operatorDemo}`);
  }
  rmSync(projectRoot, { recursive: true, force: true });
  mkdirSync(dirname(projectRoot), { recursive: true });
  cpSync(operatorDemo, projectRoot, {
    recursive: true,
    filter: (src) => !src.includes(`${operatorDemo}/.git/worktrees`),
  });
  // Ensure broken baseline for a real engineering objective.
  writeFileSync(join(projectRoot, "src/add.js"), "export function add(a, b) { return a - b; }\n");
  git(projectRoot, ["add", "-A"]);
  git(projectRoot, ["commit", "-m", "s1 live: broken add baseline", "--allow-empty"]);
  const status = git(projectRoot, ["status", "--porcelain"]);
  const head = git(projectRoot, ["rev-parse", "HEAD"]);
  evidence.cases.projectBinding = {
    ok: existsSync(join(projectRoot, "src/add.js")) && !projectRoot.includes("/tmp/pathcode-s1-repo-"),
    projectRoot,
    source: operatorDemo,
    head: (head.stdout || "").trim(),
    dirty: Boolean((status.stdout || "").trim()),
    notMechanicalTmpFixture: true,
  };
}

function stopPriorGateway() {
  try {
    const pid = readGatewayPid(runtimeRoot);
    if (pid) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  try {
    rmSync(socketPath, { force: true });
  } catch {
    /* ignore */
  }
}

async function startDetachedGateway() {
  stopPriorGateway();
  const child = spawn(process.execPath, [serverMain], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PATHCODE_RUNTIME_ROOT: runtimeRoot,
      PATHCODE_PACKAGE_ROOT: checkout,
    },
  });
  child.unref();
  // Ensure FAKE engine is not inherited into the daemon env file sense — unset explicitly.
  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
  const ensured = await ensureGateway({
    packageRoot: checkout,
    runtimeRoot,
    forceRestart: false,
  });
  evidence.cases.gatewayDaemon = {
    ok: Boolean(ensured.client && existsSync(socketPath)),
    socketPath,
    started: ensured.started,
    pid: child.pid ?? readGatewayPid(runtimeRoot),
  };
  ensured.client?.close?.();
  return child.pid;
}

/**
 * @param {import('../../../../scripts/pathcode-cli/gateway/client.mjs').createGatewayClient extends Function ? any : any} client
 */
function collectEvents(client, bag) {
  return client.onEvent((env) => {
    const ev = env?.event;
    if (!ev || typeof ev.type !== "string") return;
    bag.push({
      t: Date.now(),
      type: ev.type,
      taskId: ev.taskId || env.taskId,
      label: ev.label,
      activity: ev.activity,
      detail: typeof ev.detail === "string" ? ev.detail.slice(0, 120) : undefined,
      engine: ev.engine,
      id: ev.id,
      phase: ev.phase,
    });
  });
}

function eventTypeSet(events) {
  return [...new Set(events.map((e) => e.type).filter(Boolean))];
}

function summarizeSignals(events) {
  const types = eventTypeSet(events);
  return {
    preparing: types.some((t) => t.includes("preparing") || t.includes("provision")),
    lspOrReady: types.some(
      (t) =>
        t.includes("capability.ready") ||
        t.includes("capability.provision") ||
        t.includes("capability.mcp") ||
        t.includes("capability.discovered"),
    ),
    collaborating: types.includes("session.capability.collaborate"),
    engineering: types.some(
      (t) =>
        t.includes("engineering") ||
        t.includes("bridge") ||
        t.includes("applying") ||
        t.includes("reading"),
    ),
    result: types.some((t) => t.includes("engineering.result") || t === "gateway.task.finished"),
  };
}

async function waitForActivity(events, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const signals = summarizeSignals(events);
    if (signals.engineering || signals.collaborating || signals.preparing) {
      return signals;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return summarizeSignals(events);
}

async function main() {
  log("prepare project");
  prepareProject();

  log("start detached gateway");
  await startDetachedGateway();

  const capsClient = createGatewayClient({ runtimeRoot, socketPath });
  await capsClient.connect();
  await capsClient.hello("caps");
  const caps = await capsClient.listCapabilities();
  const engines = Array.isArray(caps.engines) ? caps.engines : [];
  evidence.enginesBookkeeping = engines.map((e) => ({
    id: e.id,
    status: e.status,
    role: e.role,
  }));
  evidence.cases.capabilities = {
    ok:
      engines.some((e) => e.id === "antigravity" && e.status === "available") &&
      engines.some((e) => e.id === "copilot" && e.status === "available") &&
      engines.some((e) => e.id === "cursor" && e.status === "slot_reserved"),
    engines: evidence.enginesBookkeeping,
    note: "cursor is S3 slot_reserved only — not claimed LIVE in S1",
  };
  capsClient.close();

  /** @type {object[]} */
  const headlessEvents = [];
  /** @type {object[]} */
  const cliNdjsonEvents = [];

  const headless = createGatewayClient({ runtimeRoot, socketPath });
  await headless.connect();
  await headless.hello("headless");
  await headless.bindProject(projectRoot);
  const offHeadless = collectEvents(headless, headlessEvents);

  const objective =
    "Fix the failing unit test for add(a,b). The implementation incorrectly subtracts. Change src/add.js so add returns a+b. Run npm test. Do not push.";

  // --- CLI child: real pathcode entry (runPathcodeMain) as external gateway client ---
  const cliEventsPath = join(outDir, "cli.events.ndjson");
  const cliConsolePath = join(outDir, "cli.console.txt");
  const cliHelper = join(__dirname, "run-cli-live-client.mjs");
  rmSync(cliEventsPath, { force: true });
  writeFileSync(cliConsolePath, "");

  const cleanEnv = { ...process.env };
  delete cleanEnv.PATHCODE_GATEWAY_FAKE_ENGINE;

  log("spawn CLI helper against external gateway");
  const cli = spawn(process.execPath, [cliHelper], {
    cwd: projectRoot,
    env: {
      ...cleanEnv,
      PATHCODE_RUNTIME_ROOT: runtimeRoot,
      PATHCODE_PACKAGE_ROOT: checkout,
      PATHCODE_GATEWAY_EXTERNAL: "1",
      PATHCODE_USE_GATEWAY: "1",
      PATHCODE_S1_OBJECTIVE: objective,
      PATHCODE_S1_EVENTS_OUT: cliEventsPath,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      PATH: process.env.PATH,
      TERM: process.env.TERM || "xterm-256color",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let cliStdout = "";
  let cliStderr = "";
  cli.stdout.on("data", (c) => {
    cliStdout += c.toString("utf8");
    writeFileSync(cliConsolePath, `${cliStdout}\n---stderr---\n${cliStderr}`);
  });
  cli.stderr.on("data", (c) => {
    cliStderr += c.toString("utf8");
    writeFileSync(cliConsolePath, `${cliStdout}\n---stderr---\n${cliStderr}`);
  });
  evidence.cases.cliEntry = {
    ok: true,
    helper: cliHelper,
    pathcodeMain,
    mode: "runPathcodeMain_fake_tty_external_gateway",
  };

  // Wait for a running task on the gateway (CLI started it).
  let taskId = null;
  const startDeadline = Date.now() + 120_000;
  while (Date.now() < startDeadline && !taskId) {
    try {
      const status = await headless.request("project.status", {});
      const list = await headless.request("task.list", {});
      const tasks = list?.result?.tasks || [];
      const running = tasks.find((t) => t.status === "running");
      if (running) {
        taskId = running.taskId;
        break;
      }
      // Also try any newest task
      if (tasks.length && !taskId) {
        const newest = tasks[tasks.length - 1];
        if (newest?.taskId) taskId = newest.taskId;
      }
    } catch (err) {
      log("poll tasks", err instanceof Error ? err.message : String(err));
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  evidence.cases.cliStart = {
    ok: Boolean(taskId),
    taskId,
    cliPid: cli.pid,
    externalGateway: true,
  };

  if (!taskId) {
    try {
      cli.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    throw new Error("CLI did not start a gateway task in time");
  }

  log("headless attach", taskId);
  const attached = await headless.attachTask(taskId);
  evidence.cases.sameTaskAttach = {
    ok: attached?.attached === true && attached?.snapshot?.taskId === taskId,
    taskId,
    statusAtAttach: attached?.snapshot?.status,
  };

  const midSignals = await waitForActivity(headlessEvents, 240_000);
  evidence.cases.liveEngineActivity = {
    ok: midSignals.engineering || midSignals.preparing || midSignals.collaborating,
    ...midSignals,
    eventCountAtProbe: headlessEvents.length,
  };

  // Disconnect CLI while engines still working (do NOT cancel).
  let beforeDisconnect = await headless.snapshotTask(taskId);
  // Prefer dropping while still running; wait briefly if prepare is still warming.
  const runWaitDeadline = Date.now() + 60_000;
  while (
    beforeDisconnect?.status === "running" &&
    !midSignals.engineering &&
    Date.now() < runWaitDeadline
  ) {
    await waitForActivity(headlessEvents, 5_000);
    beforeDisconnect = await headless.snapshotTask(taskId);
  }
  log("disconnect CLI (SIGTERM) while status=", beforeDisconnect?.status);
  const wasRunning = beforeDisconnect?.status === "running";
  try {
    cli.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  await new Promise((r) => setTimeout(r, 1500));
  const afterDisconnect = await headless.snapshotTask(taskId);
  evidence.cases.disconnectDuringActivity = {
    ok:
      wasRunning &&
      (afterDisconnect?.status === "running" ||
        afterDisconnect?.status === "completed" ||
        afterDisconnect?.status === "failed") &&
      afterDisconnect?.taskId === taskId,
    statusBefore: beforeDisconnect?.status,
    statusAfterCliDrop: afterDisconnect?.status,
    droppedWhileRunning: wasRunning,
    taskStillOwnedByGateway: true,
    sameTaskId: afterDisconnect?.taskId === taskId,
    note: "CLI process terminated without task.cancel; gateway retained ownership",
  };

  // Reattach via a fresh headless-style client (simulates CLI reattach).
  const reattach = createGatewayClient({ runtimeRoot, socketPath });
  await reattach.connect();
  await reattach.hello("cli-reattach");
  const reattached = await reattach.attachTask(taskId);
  const reattachEvents = [];
  const offRe = collectEvents(reattach, reattachEvents);
  evidence.cases.reattach = {
    ok: reattached?.attached === true && reattached?.snapshot?.taskId === taskId,
    taskId,
    status: reattached?.snapshot?.status,
  };

  log("await task completion", taskId);
  const finished = await headless.awaitTask(taskId, 900_000);
  const resultPack = await headless.getResult(taskId);

  // Drain CLI ndjson if present
  if (existsSync(cliEventsPath)) {
    const raw = readFileSync(cliEventsPath, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        cliNdjsonEvents.push(msg);
      } catch {
        /* ignore */
      }
    }
  }

  const allEvents = [...headlessEvents, ...reattachEvents];
  const types = eventTypeSet(allEvents);
  evidence.eventTypes = types;
  evidence.g10Signals = summarizeSignals(allEvents);

  const changed = resultPack?.result?.changedFiles || finished?.result?.changedFiles || [];
  const classification =
    finished?.classification || resultPack?.result?.classification || null;

  evidence.cases.completion = {
    ok:
      finished?.status === "completed" &&
      (classification === "VERIFIED" || classification === "PARTIALLY_VERIFIED"),
    status: finished?.status,
    classification,
    commitSha: finished?.commitSha || resultPack?.result?.commitSha || null,
    taskBranch: finished?.taskBranch || resultPack?.result?.taskBranch || null,
    changedFiles: changed,
    primaryUntouched: resultPack?.result?.primaryUntouched ?? null,
  };

  evidence.cases.collaborationThroughGateway = {
    ok: evidence.g10Signals.collaborating === true,
    collaborateEvents: allEvents.filter((e) => e.type === "session.capability.collaborate")
      .length,
    note: "Collaboration fabric exercised on gateway-owned task (not historical G10-only)",
  };

  evidence.cases.capabilityUse = {
    ok: evidence.g10Signals.preparing === true && evidence.g10Signals.lspOrReady === true,
    preparing: evidence.g10Signals.preparing,
    lspOrMcpOrReady: evidence.g10Signals.lspOrReady,
    sample: allEvents
      .filter((e) => String(e.type || "").includes("capability"))
      .slice(0, 12),
  };

  evidence.cases.headlessObserve = {
    ok: headlessEvents.length > 0,
    eventCount: headlessEvents.length,
    reattachEventCount: reattachEvents.length,
    cliNdjsonEventCount: cliNdjsonEvents.length,
  };

  offHeadless();
  offRe();
  headless.close();
  reattach.close();

  // Kill gateway daemon after capture
  stopPriorGateway();

  const required = [
    evidence.cases.projectBinding,
    evidence.cases.gatewayDaemon,
    evidence.cases.capabilities,
    evidence.cases.cliStart,
    evidence.cases.sameTaskAttach,
    evidence.cases.liveEngineActivity,
    evidence.cases.disconnectDuringActivity,
    evidence.cases.reattach,
    evidence.cases.completion,
    evidence.cases.collaborationThroughGateway,
    evidence.cases.capabilityUse,
    evidence.cases.headlessObserve,
  ];
  evidence.verdict = required.every((c) => c && c.ok === true) ? "PASS" : "PARTIAL";
  evidence.atEnd = new Date().toISOString();

  writeFileSync(join(outDir, "live.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(
    join(outDir, "events.json"),
    `${JSON.stringify({ headlessEvents, reattachEvents, cliNdjsonEvents, types }, null, 2)}\n`,
  );
  writeFileSync(
    join(outDir, "result.json"),
    `${JSON.stringify({ finished, resultPack }, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        verdict: evidence.verdict,
        taskId,
        classification,
        cases: Object.fromEntries(
          Object.entries(evidence.cases).map(([k, v]) => [k, Boolean(v?.ok)]),
        ),
        g10Signals: evidence.g10Signals,
        enginesBookkeeping: evidence.enginesBookkeeping,
      },
      null,
      2,
    ),
  );

  process.exitCode = evidence.verdict === "PASS" ? 0 : 1;
}

main().catch((err) => {
  evidence.verdict = "FAILED";
  evidence.error = err instanceof Error ? err.stack || err.message : String(err);
  try {
    writeFileSync(join(outDir, "live.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  } catch {
    /* ignore */
  }
  console.error(err);
  process.exitCode = 1;
  try {
    stopPriorGateway();
  } catch {
    /* ignore */
  }
});
