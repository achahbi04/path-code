/**
 * S5 — one real-engine PATH Build start + single tick (bounded ~3 min).
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import { createBuildController } from "../../../../scripts/pathcode-cli/build/index.mjs";
import { resolveCursorApiKey } from "../../../../scripts/pathcode-cli/ag10/cursor-sdk.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "../../../..");
const OUT_JSON = join(HERE, "s5-live-engine-attempt.json");
const TIMEOUT_MS = 180_000;

function gatewayPort(runtime) {
  return {
    bindProject: (cwd) => runtime.bindProject({ cwd }),
    startTask: (objective, extra) => runtime.startTask({ objective, ...extra }),
    resumeTask: (taskId, extra) => runtime.resumeTask({ taskId, ...extra }),
    awaitTask: (taskId, timeoutMs) => runtime.awaitTask(taskId, timeoutMs),
    steerTask: (taskId, text) => runtime.steerTask(taskId, text),
    snapshotTask: (taskId) => runtime.snapshotTask(taskId),
  };
}

function copilotOnPath() {
  const r = spawnSync("which", ["copilot"], { encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim()) {
    return { available: true, path: r.stdout.trim() };
  }
  return { available: false, path: null };
}

function engineAvailability() {
  const copilot = copilotOnPath();
  const cursorKey = Boolean(resolveCursorApiKey(process.env));
  /** @type {'copilot'|'cursor'|null} */
  let preferred = null;
  let skipReason = null;
  if (copilot.available) preferred = "copilot";
  else if (cursorKey) preferred = "cursor";
  else {
    skipReason =
      "No CURSOR_API_KEY and copilot CLI not on PATH — real engine attempt skipped.";
  }
  return { copilot, cursorKey, preferred, skipReason };
}

async function main() {
  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
  delete process.env.PATHCODE_BUILD_FAKE;

  const engines = engineAvailability();
  const base = mkdtempSync(join(tmpdir(), "path-s5-live-eng-"));
  const runtimeRoot = join(base, "runtime");
  const projectDir = join(base, "product");
  mkdirSync(runtimeRoot, { recursive: true });

  /** @type {object} */
  const evidence = {
    schema: "pathcode.s5.live-engine-attempt.v1",
    verdict: "SKIPPED",
    ok: false,
    skipReason: engines.skipReason,
    engines,
    timeoutMs: TIMEOUT_MS,
    baseDir: base,
    runtimeRoot,
    projectDir,
    steps: /** @type {object[]} */ ([]),
  };

  if (!engines.preferred) {
    writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    process.exit(0);
  }

  const runtime = createGatewayRuntime({
    packageRoot: PACKAGE_ROOT,
    runtimeRoot,
  });
  const gateway = gatewayPort(runtime);
  const controller = createBuildController({
    runtimeRoot,
    gateway,
    fakeMode: false,
  });

  const outcome =
    "Add a single file LIVE_MARKER.txt at repo root containing exactly: s5-live-ok";

  const started = await controller.startBuild(outcome, {
    targetDir: projectDir,
    initialCriteria: [
      {
        id: "c-marker",
        statement: "LIVE_MARKER.txt exists with s5-live-ok",
        required: true,
      },
    ],
  });

  evidence.steps.push({
    step: "start",
    ok: started.ok === true,
    buildId: started.build?.buildId,
    git: existsSync(join(projectDir, ".git")),
    error: started.ok ? undefined : started,
  });

  if (!started.ok) {
    evidence.verdict = "FAILED";
    evidence.ok = false;
    evidence.failReason = "startBuild failed";
    writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
    process.exit(1);
  }

  evidence.buildId = started.build.buildId;

  /** @type {object[]} */
  const gatewayEvents = [];
  const off = runtime.onEvent((env) => {
    const ev = env?.event;
    if (!ev?.type) return;
    gatewayEvents.push({
      type: ev.type,
      engine: ev.engine,
      label: ev.label,
      detail: typeof ev.detail === "string" ? ev.detail.slice(0, 160) : undefined,
    });
  });

  let tickResult;
  const tickStart = Date.now();
  try {
    const buildId = started.build.buildId;
    const ticked = await Promise.race([
      controller.tick(buildId),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`build tick timed out after ${TIMEOUT_MS}ms`)),
          TIMEOUT_MS,
        );
      }),
    ]);

    const taskId = ticked.taskId;
    const snap = taskId ? runtime.snapshotTask(taskId) : null;
    tickResult = {
      ok: ticked.ok === true,
      taskId,
      kind: ticked.kind,
      action: ticked.action,
      preferredEngine: engines.preferred,
      gatewayStatus: snap?.status,
      gatewayClassification: snap?.classification,
      markerExists: existsSync(join(projectDir, "LIVE_MARKER.txt")),
      elapsedMs: Date.now() - tickStart,
      tickError: ticked.ok ? undefined : ticked,
    };
  } catch (err) {
    tickResult = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - tickStart,
      preferredEngine: engines.preferred,
    };
  } finally {
    off();
  }

  evidence.steps.push({
    step: "single_engineer_tick",
    ...tickResult,
    eventTypes: [...new Set(gatewayEvents.map((e) => e.type))].slice(0, 40),
    collaborated: gatewayEvents.some((e) => e.type === "session.capability.collaborate"),
  });

  const engineerOk =
    tickResult.ok === true &&
    (tickResult.gatewayStatus === "completed" ||
      tickResult.gatewayClassification === "VERIFIED" ||
      tickResult.gatewayClassification === "PARTIALLY_VERIFIED" ||
      tickResult.markerExists === true);

  evidence.ok = engineerOk;
  evidence.verdict = engineerOk ? "LIVE-ENGINE-ATTEMPTED" : "FAILED";
  if (!engineerOk && tickResult.error?.includes("timed out")) {
    evidence.verdict = "TIMEOUT";
  }
  if (
    !engineerOk &&
    tickResult.gatewayStatus === "failed" &&
    gatewayEvents.some((e) => /auth|login|unauthorized/i.test(String(e.detail || e.label || "")))
  ) {
    evidence.verdict = "AUTH_REQUIRED";
    evidence.skipReason = "Engine reachable but authentication required for live turn.";
  }

  evidence.loopStatus = tickResult.build?.loop?.status;
  writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exit(engineerOk ? 0 : 1);
}

main().catch((err) => {
  const evidence = {
    schema: "pathcode.s5.live-engine-attempt.v1",
    verdict: "FAILED",
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  };
  writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
  console.error(err);
  process.exit(1);
});
