/**
 * S4.1 live interruption: kill Gateway mid-task → reclaim → resume.
 *
 * Uses PATHCODE_GATEWAY_FAKE_ENGINE so the interruption is real (process kill)
 * without requiring live Copilot/Cursor auth for the first durability slice.
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createGatewayClient } from "../../../../scripts/pathcode-cli/gateway/client.mjs";
import {
  resolveGatewaySocketPath,
  resolveGatewayPidPath,
} from "../../../../scripts/pathcode-cli/gateway/server.mjs";
import { reclaimStaleGatewayOwnership } from "../../../../scripts/pathcode-cli/gateway/ensure.mjs";
import { readTaskCheckpoint } from "../../../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKOUT = join(HERE, "../../../..");
const SERVER_MAIN = join(CHECKOUT, "scripts/pathcode-cli/gateway/server-main.mjs");
const OUT_JSON = join(HERE, "s41-live-interrupt.json");
const OUT_TXT = join(HERE, "s41-live-interrupt-run.txt");

function log(line) {
  const s = String(line);
  process.stdout.write(`${s}\n`);
  return s;
}

function tmpGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pathcode-s41-live-"));
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "s41@test"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "s41"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "s41 live\n");
  spawnSync("git", ["add", "."], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForCheckpoint(runtimeRoot, taskId, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const cp = readTaskCheckpoint(runtimeRoot, taskId);
    if (cp) return cp;
    await sleep(100);
  }
  return null;
}

async function main() {
  const lines = [];
  const push = (s) => lines.push(log(s));
  const repo = tmpGitRepo();
  const runtimeRoot = mkdtempSync(join(tmpdir(), "pathcode-s41-rt-"));
  const socketPath = resolveGatewaySocketPath(runtimeRoot);
  const pidPath = resolveGatewayPidPath(runtimeRoot);

  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null;
  /** @type {ReturnType<typeof createGatewayClient> | null} */
  let client = null;

  const evidence = {
    schema: "pathcode.s4.live-interrupt.v1",
    verdict: "NOT_VERIFIED",
    steps: /** @type {object[]} */ ([]),
  };

  try {
    push("S4.1 live interrupt — spawn Gateway (fake engine, hold 6s)");
    child = spawn(process.execPath, [SERVER_MAIN], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        PATHCODE_RUNTIME_ROOT: runtimeRoot,
        PATHCODE_PACKAGE_ROOT: CHECKOUT,
        PATHCODE_GATEWAY_FAKE_ENGINE: "1",
        PATHCODE_GATEWAY_FAKE_HOLD_MS: "6000",
        PATHCODE_GATEWAY_SKIP_BOOTSTRAP: "1",
      },
    });
    child.unref();

    // Wait for socket
    let ready = false;
    for (let i = 0; i < 80; i += 1) {
      if (existsSync(socketPath)) {
        try {
          client = createGatewayClient({ socketPath, runtimeRoot });
          await client.connect();
          await client.hello("s41");
          ready = true;
          break;
        } catch {
          client = null;
        }
      }
      await sleep(150);
    }
    if (!ready || !client) throw new Error("gateway did not become ready");
    evidence.steps.push({ step: "gateway_started", pid: child.pid, socketPath });

    await client.bindProject(repo);
    const started = await client.startTask("S4.1 interrupt mid-hold");
    const taskId = started.taskId;
    push(`task started ${taskId}`);
    evidence.steps.push({ step: "task_started", taskId });

    const cp = await waitForCheckpoint(runtimeRoot, taskId);
    if (!cp) throw new Error("checkpoint not written during hold");
    push(`checkpoint durable at ${cp.worktreePath}`);
    evidence.steps.push({
      step: "checkpoint_present",
      objective: cp.objective,
      worktreePath: cp.worktreePath,
    });

    // Kill Gateway hard (simulates crash / reboot of Gateway process).
    const gwPid = Number(readFileSync(pidPath, "utf8").split("\n")[0]);
    push(`SIGKILL gateway pid ${gwPid}`);
    try {
      process.kill(gwPid, "SIGKILL");
    } catch {
      if (child.pid) process.kill(child.pid, "SIGKILL");
    }
    await sleep(400);
    client.close();
    client = null;
    evidence.steps.push({ step: "gateway_killed", pid: gwPid });

    const reclaim = reclaimStaleGatewayOwnership(runtimeRoot, socketPath);
    push(
      `reclaim reclaimed=${reclaim.reclaimed} marked=${reclaim.marked.join(",") || "(none)"}`,
    );
    evidence.steps.push({ step: "reclaim", ...reclaim });
    const afterKill = readTaskCheckpoint(runtimeRoot, taskId);
    if (afterKill?.continuityDisposition !== "interrupted") {
      throw new Error(
        `expected interrupted disposition, got ${afterKill?.continuityDisposition}`,
      );
    }

    // Spawn fresh Gateway and resume.
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
          await client.hello("s41-resume");
          ready = true;
          break;
        } catch {
          client = null;
        }
      }
      await sleep(150);
    }
    if (!ready || !client) throw new Error("replacement gateway not ready");

    const continuity = await client.assessContinuity(taskId);
    push(`continuity: ${continuity.disposition} → ${continuity.nextAction}`);
    evidence.steps.push({
      step: "continuity",
      disposition: continuity.disposition,
      nextAction: continuity.nextAction,
    });

    const resumed = await client.resumeTask(taskId);
    push(`resume mode=${resumed.mode} disposition=${resumed.disposition}`);
    evidence.steps.push({
      step: "resume",
      mode: resumed.mode,
      disposition: resumed.disposition,
      taskId: resumed.taskId,
    });
    if (!resumed.ok || resumed.taskId !== taskId) {
      throw new Error("resume did not re-own same taskId");
    }

    const finished = await client.awaitTask(taskId, 60_000);
    push(`finished status=${finished?.status} classification=${finished?.classification}`);
    evidence.steps.push({
      step: "finished",
      status: finished?.status,
      classification: finished?.classification,
    });

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
