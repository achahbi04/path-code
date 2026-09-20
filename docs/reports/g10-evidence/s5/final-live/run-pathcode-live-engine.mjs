/**
 * Bounded real PATH Code Gateway task for S5 engine qualification.
 * Usage: node .../run-pathcode-live-engine.mjs cursor|copilot
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createGatewayRuntime } from "../../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import { probeEngineReadiness } from "../../../../../scripts/pathcode-cli/ag10/engine-readiness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "../../../../../");
const ENGINE = String(process.argv[2] || "cursor").toLowerCase();
const TIMEOUT_MS = Number(process.env.PATHCODE_LIVE_TIMEOUT_MS || 180_000);
const OUT_JSON = join(HERE, `pathcode-live-${ENGINE}.json`);

function tmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), `path-s5-code-${ENGINE}-`));
  spawnSync("git", ["init", "-q", "--initial-branch=main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "path@example.invalid"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "PATH"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), `PATH Code live ${ENGINE}\n`);
  writeFileSync(
    join(dir, "marker.js"),
    "export function marker() { return 'before'; }\n",
  );
  spawnSync("git", ["add", "."], { cwd: dir });
  spawnSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

async function main() {
  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
  delete process.env.PATHCODE_BUILD_FAKE;
  const probes = await probeEngineReadiness({ engine: ENGINE });
  const readiness = probes[0];
  const projectDir = tmpRepo();
  const runtimeRoot = join(projectDir, ".path-runtime");
  mkdirSync(runtimeRoot, { recursive: true });
  const evidence = {
    schema: "pathcode.s5.pathcode-live-engine.v1",
    engine: ENGINE,
    readiness,
    projectDir,
    runtimeRoot,
    timeoutMs: TIMEOUT_MS,
    ok: false,
    verdict: "NOT_VERIFIED",
  };
  if (!readiness.ready && process.env.PATHCODE_FORCE_UNREADY !== "1") {
    evidence.verdict = readiness.reason || "NOT_READY";
    writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    process.exit(readiness.reason === "AUTH_REQUIRED" ? 2 : 1);
  }

  const runtime = createGatewayRuntime({
    packageRoot: PACKAGE_ROOT,
    runtimeRoot,
  });
  const events = [];
  const off = runtime.onEvent((envelope) => {
    const ev = envelope?.event;
    if (!ev?.type) return;
    events.push({
      type: ev.type,
      engine: ev.engine,
      tool: ev.tool,
      detail:
        typeof ev.detail === "string" ? ev.detail.slice(0, 160) : undefined,
    });
  });

  const bound = await runtime.bindProject({ cwd: projectDir });
  const started = await runtime.startTask({
    objective:
      "Change marker.js so marker() returns exactly 's5-live-ok'. Keep the file a valid ES module. Do not add unrelated files.",
    cwd: projectDir,
    preferredEngine: ENGINE,
  });
  evidence.bind = { ok: bound?.ok !== false };
  evidence.started = {
    ok: started?.ok === true,
    taskId: started?.taskId,
    sessionId: started?.sessionId || null,
    engine: started?.engine || started?.preferredEngine || ENGINE,
  };
  if (!started?.ok || !started.taskId) {
    evidence.verdict = "START_FAILED";
    writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
    process.exit(1);
  }

  try {
    await Promise.race([
      runtime.awaitTask(started.taskId, TIMEOUT_MS),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("await timeout")), TIMEOUT_MS + 5_000);
      }),
    ]);
  } catch (error) {
    evidence.awaitError = error instanceof Error ? error.message : String(error);
  }
  off();

  const snap = runtime.snapshotTask(started.taskId);
  let resultMarker = "";
  const resultSha = snap?.commitSha || snap?.resultSha;
  if (resultSha) {
    const shown = spawnSync("git", ["show", `${resultSha}:marker.js`], {
      cwd: projectDir,
      encoding: "utf8",
    });
    if (shown.status === 0) resultMarker = shown.stdout;
  }
  const marker = existsSync(join(projectDir, "marker.js"))
    ? readFileSync(join(projectDir, "marker.js"), "utf8")
    : "";
  evidence.snapshot = {
    status: snap?.status,
    classification: snap?.classification,
    engine: snap?.engine || snap?.provider,
    mode: snap?.engineMode || snap?.mode,
    sessionId: snap?.sessionId,
    taskId: started.taskId,
    resultSha: snap?.commitSha || snap?.resultSha,
    changedFiles: snap?.changedFiles || [],
    taskBranch: snap?.taskBranch,
  };
  evidence.markerContainsLive =
    resultMarker.includes("s5-live-ok") || marker.includes("s5-live-ok");
  evidence.resultMarker = resultMarker.slice(0, 200);
  evidence.eventTypes = [...new Set(events.map((e) => e.type))].slice(0, 40);
  evidence.ok =
    evidence.markerContainsLive === true ||
    snap?.classification === "VERIFIED" ||
    snap?.status === "completed";
  evidence.verdict = evidence.ok
    ? "PASS"
    : /auth|login|unauthorized/i.test(JSON.stringify(snap || {}))
      ? "AUTH_REQUIRED"
      : "FAILED";
  writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exit(evidence.ok ? 0 : 1);
}

main().catch((error) => {
  writeFileSync(
    OUT_JSON,
    `${JSON.stringify({ ok: false, verdict: "FAILED", error: String(error) }, null, 2)}\n`,
  );
  console.error(error);
  process.exit(1);
});
