/**
 * S4.3 host-restart simulation (autonomous — no Mac reboot required).
 *
 * Simulates: durable in-flight task → kill Gateway (host process death) →
 * fresh process reconcileHostStartup → discover recoverable → task.resume
 * same taskId.
 */
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createGatewayClient } from "../../../../scripts/pathcode-cli/gateway/client.mjs";
import {
  resolveGatewaySocketPath,
  resolveGatewayPidPath,
} from "../../../../scripts/pathcode-cli/gateway/server.mjs";
import { reconcileHostStartup } from "../../../../scripts/pathcode-cli/ag10/host-startup.mjs";
import { readTaskCheckpoint } from "../../../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";
import { createG10Fabric } from "../../../../scripts/pathcode-cli/ag10/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKOUT = join(HERE, "../../../..");
const SERVER_MAIN = join(CHECKOUT, "scripts/pathcode-cli/gateway/server-main.mjs");
const OUT_JSON = join(HERE, "s43-host-restart-sim.json");
const OUT_TXT = join(HERE, "s43-host-restart-sim-run.txt");

function log(line, lines) {
  const s = String(line);
  process.stdout.write(`${s}\n`);
  lines.push(s);
}

function tmpGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pathcode-s43-"));
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "s43@test"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "s43"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "s43\n");
  spawnSync("git", ["add", "."], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const lines = [];
  const push = (s) => log(s, lines);
  const evidence = {
    schema: "pathcode.s4.host-restart-sim.v1",
    verdict: "NOT_VERIFIED",
    steps: /** @type {object[]} */ ([]),
  };
  const repo = tmpGitRepo();
  const runtimeRoot = mkdtempSync(join(tmpdir(), "pathcode-s43-rt-"));
  const socketPath = resolveGatewaySocketPath(runtimeRoot);
  const pidPath = resolveGatewayPidPath(runtimeRoot);
  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null;
  /** @type {ReturnType<typeof createGatewayClient> | null} */
  let client = null;

  try {
    push("S4.3 host-restart sim — spawn Gateway with in-flight durable task");
    child = spawn(process.execPath, [SERVER_MAIN], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        PATHCODE_RUNTIME_ROOT: runtimeRoot,
        PATHCODE_PACKAGE_ROOT: CHECKOUT,
        PATHCODE_GATEWAY_FAKE_ENGINE: "1",
        PATHCODE_GATEWAY_FAKE_HOLD_MS: "8000",
        PATHCODE_GATEWAY_SKIP_BOOTSTRAP: "1",
      },
    });
    child.unref();

    let ready = false;
    for (let i = 0; i < 80; i += 1) {
      if (existsSync(socketPath)) {
        try {
          client = createGatewayClient({ socketPath, runtimeRoot });
          await client.connect();
          await client.hello("s43");
          ready = true;
          break;
        } catch {
          client = null;
        }
      }
      await sleep(150);
    }
    if (!ready || !client) throw new Error("gateway not ready");

    await client.bindProject(repo);
    const started = await client.startTask("S4.3 host restart durable in-flight");
    const taskId = started.taskId;
    push(`task ${taskId} started`);

    // Wait for fake early checkpoint, then stamp in_flight via fabric heartbeat.
    let cp = null;
    for (let i = 0; i < 40; i += 1) {
      cp = readTaskCheckpoint(runtimeRoot, taskId);
      if (cp) break;
      await sleep(100);
    }
    if (!cp) throw new Error("no checkpoint");
    const fabric = await createG10Fabric({
      runtimeRoot,
      taskId,
      sessionId: taskId,
      worktreePath: cp.worktreePath || repo,
      repoRoot: repo,
      objective: cp.objective || "S4.3",
    });
    fabric.beginEngineTurn("cursor");
    cp = readTaskCheckpoint(runtimeRoot, taskId);
    evidence.steps.push({
      step: "in_flight",
      latestEngineTurn: cp?.latestEngineTurn,
      inFlightEngine: cp?.inFlightEngine,
    });
    push(`in_flight=${cp?.latestEngineTurn}`);

    const gwPid = Number(readFileSync(pidPath, "utf8").split("\n")[0]);
    push(`SIGKILL gateway ${gwPid} (simulate host/process death)`);
    try {
      process.kill(gwPid, "SIGKILL");
    } catch {
      if (child.pid) process.kill(child.pid, "SIGKILL");
    }
    await sleep(400);
    try {
      client.close();
    } catch {
      /* ignore */
    }
    client = null;
    child = null;

    // Fresh process: reconcile as PATH would on reopen after reboot.
    const startup = reconcileHostStartup({ runtimeRoot, projectRoot: repo });
    evidence.steps.push({
      step: "startup_reconcile",
      reclaimed: startup.reclaim?.reclaimed,
      markedInFlight: startup.markedInFlight,
      recoverable: startup.recoverable.map((a) => ({
        taskId: a.taskId,
        disposition: a.disposition,
        nextAction: a.nextAction,
      })),
      noticePreview: startup.notices[0]?.slice(0, 240) || null,
    });
    push(
      `reconcile recoverable=${startup.recoverable.length} markedInFlight=${startup.markedInFlight.join(",") || "(none)"}`,
    );
    const hit = startup.recoverable.find((a) => a.taskId === taskId);
    if (!hit || hit.disposition !== "interrupted") {
      throw new Error(
        `expected interrupted ${taskId}, got ${hit?.disposition || "missing"}`,
      );
    }
    if (!String(startup.notices[0] || "").includes("/resume")) {
      throw new Error("reopen notice missing /resume guidance");
    }

    // Fresh Gateway + resume same taskId
    child = spawn(process.execPath, [SERVER_MAIN], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        PATHCODE_RUNTIME_ROOT: runtimeRoot,
        PATHCODE_PACKAGE_ROOT: CHECKOUT,
        PATHCODE_GATEWAY_FAKE_ENGINE: "1",
        PATHCODE_GATEWAY_SKIP_BOOTSTRAP: "1",
      },
    });
    child.unref();
    ready = false;
    for (let i = 0; i < 80; i += 1) {
      if (existsSync(socketPath)) {
        try {
          client = createGatewayClient({ socketPath, runtimeRoot });
          await client.connect();
          await client.hello("s43-resume");
          ready = true;
          break;
        } catch {
          client = null;
        }
      }
      await sleep(150);
    }
    if (!ready || !client) throw new Error("replacement gateway not ready");

    const resumed = await client.resumeTask(taskId);
    evidence.steps.push({
      step: "resume",
      ok: resumed.ok,
      mode: resumed.mode,
      taskId: resumed.taskId,
    });
    push(`resume mode=${resumed.mode} taskId=${resumed.taskId}`);
    if (!resumed.ok || resumed.taskId !== taskId) {
      throw new Error("task identity not preserved");
    }
    const finished = await client.awaitTask(taskId, 60_000);
    evidence.steps.push({
      step: "finished",
      status: finished?.status,
      classification: finished?.classification,
    });
    push(`finished ${finished?.status}`);
    if (finished?.status !== "completed") {
      throw new Error(`expected completed, got ${finished?.status}`);
    }

    evidence.verdict = "LIVE-VERIFIED";
    push("VERDICT: LIVE-VERIFIED");
  } catch (err) {
    evidence.verdict = "FAILED";
    evidence.error = err instanceof Error ? err.message : String(err);
    push(`FAILED: ${evidence.error}`);
  } finally {
    try {
      client?.close();
    } catch {
      /* ignore */
    }
    try {
      if (existsSync(pidPath)) {
        const pid = Number(readFileSync(pidPath, "utf8").split("\n")[0]);
        if (Number.isFinite(pid)) process.kill(pid, "SIGKILL");
      }
    } catch {
      /* ignore */
    }
    try {
      rmSync(repo, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      rmSync(runtimeRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    writeFileSync(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
    writeFileSync(OUT_TXT, `${lines.join("\n")}\n`);
  }
  process.exit(evidence.verdict === "LIVE-VERIFIED" ? 0 : 1);
}

main();
