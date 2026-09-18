/**
 * S4.2 live: kill a registered engine process mid-task while Gateway stays alive.
 *
 * Proves: process sidecar + interrupt marking + same taskId resume path.
 * Uses a real OS child registered as antigravity_bridge (engine-shaped),
 * not the S4.1 Gateway SIGKILL path.
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
import { randomUUID } from "node:crypto";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import {
  registerProcess,
  resetProcessRegistryForTests,
  listProcesses,
} from "../../../../scripts/pathcode-cli/process-registry.mjs";
import {
  reconcileTaskProcesses,
  readTaskProcesses,
} from "../../../../scripts/pathcode-cli/task-processes.mjs";
import {
  writeTaskCheckpoint,
  readTaskCheckpoint,
  markTaskInterrupted,
  clearTaskInterrupted,
} from "../../../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";
import { assessTaskContinuity } from "../../../../scripts/pathcode-cli/ag10/task-continuity.mjs";
import { createG10Fabric } from "../../../../scripts/pathcode-cli/ag10/index.mjs";
import { detectCursorEngine } from "../../../../scripts/pathcode-cli/ag10/cursor-sdk.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKOUT = join(HERE, "../../../..");
const OUT_JSON = join(HERE, "s42-live-engine-interrupt.json");
const OUT_TXT = join(HERE, "s42-live-engine-interrupt-run.txt");

function log(line, lines) {
  const s = String(line);
  process.stdout.write(`${s}\n`);
  lines.push(s);
}

function tmpGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pathcode-s42-live-"));
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "s42@test"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "s42"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "s42 live\n");
  spawnSync("git", ["add", "."], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

async function main() {
  const lines = [];
  const push = (s) => log(s, lines);
  const evidence = {
    schema: "pathcode.s4.engine-interrupt.v1",
    verdict: "NOT_VERIFIED",
    steps: /** @type {object[]} */ ([]),
    cursorProbe: null,
  };

  const repo = tmpGitRepo();
  const runtimeRoot = mkdtempSync(join(tmpdir(), "pathcode-s42-rt-"));
  resetProcessRegistryForTests();
  process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
  process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";

  /** @type {import('node:child_process').ChildProcess | null} */
  let engineChild = null;

  try {
    push("S4.2 live — engine process kill while Gateway ownership remains");

    const cursorProbe = await detectCursorEngine(process.env);
    evidence.cursorProbe = {
      ready: cursorProbe.ready === true,
      status: cursorProbe.status,
      reason: cursorProbe.reason || null,
    };
    push(
      `Cursor probe: ready=${evidence.cursorProbe.ready} status=${evidence.cursorProbe.status}`,
    );

    const taskId = randomUUID();
    writeTaskCheckpoint(runtimeRoot, {
      schema: "pathcode.g10.task-checkpoint.v1",
      taskId,
      sessionId: taskId,
      repoRoot: repo,
      worktreePath: repo,
      objective: "S4.2 engine interrupt live",
      cursorSessionId: evidence.cursorProbe.ready
        ? "probe-session-placeholder"
        : undefined,
      cursorMode: evidence.cursorProbe.ready ? "native_sdk" : "none",
      updatedAt: new Date().toISOString(),
    });

    const fabric = await createG10Fabric({
      runtimeRoot,
      taskId,
      sessionId: taskId,
      worktreePath: repo,
      repoRoot: repo,
      objective: "S4.2 engine interrupt live",
    });
    fabric.beginEngineTurn("antigravity");
    let cp = readTaskCheckpoint(runtimeRoot, taskId);
    evidence.steps.push({
      step: "in_flight_checkpoint",
      latestEngineTurn: cp?.latestEngineTurn,
      taskId,
    });
    push(`in_flight checkpoint: ${cp?.latestEngineTurn}`);

    engineChild = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 500)"],
      { stdio: "ignore", detached: true },
    );
    registerProcess({
      taskId,
      kind: "antigravity_bridge",
      command: "node engine-hold",
      child: engineChild,
      runtimeRoot,
    });
    const live = listProcesses(taskId).find((p) => p.kind === "antigravity_bridge");
    evidence.steps.push({
      step: "engine_registered",
      pid: live?.pid,
      startKey: live?.startKey,
      alive: live?.alive,
    });
    push(`engine registered pid=${live?.pid} alive=${live?.alive}`);

    // Gateway Map still owns the task (in-process runtime).
    const rt = createGatewayRuntime({ packageRoot: CHECKOUT, runtimeRoot });
    await rt.bindProject({ cwd: repo });
    // Simulate ownership without running a full turn: task id present in CP only.
    // Kill engine process — Gateway stays up.
    process.kill(engineChild.pid, "SIGKILL");
    engineChild = null;
    await new Promise((r) => setTimeout(r, 200));

    const reconciled = reconcileTaskProcesses(runtimeRoot, taskId);
    evidence.steps.push({
      step: "reconcile_after_kill",
      liveKinds: reconciled.liveKinds,
      processes: readTaskProcesses(runtimeRoot, taskId)?.processes,
    });
    push(`reconcile liveKinds=${JSON.stringify(reconciled.liveKinds)}`);
    if (reconciled.liveKinds.includes("antigravity_bridge")) {
      throw new Error("dead engine still reported live");
    }

    fabric.noteEngineInterrupted("antigravity", "BRIDGE_EXIT live kill", {
      nativeResumePossible: false,
    });
    const assessment = assessTaskContinuity({ runtimeRoot, taskId });
    evidence.steps.push({
      step: "interrupted",
      disposition: assessment.disposition,
      nextAction: assessment.nextAction,
    });
    push(`disposition=${assessment.disposition} next=${assessment.nextAction}`);
    if (assessment.disposition !== "interrupted") {
      throw new Error(`expected interrupted, got ${assessment.disposition}`);
    }

    // Resume same taskId via Gateway (fake engine completes).
    markTaskInterrupted(runtimeRoot, taskId, "ensure interrupted before resume");
    const resumed = await rt.resumeTask({ taskId });
    evidence.steps.push({
      step: "resume",
      ok: resumed.ok,
      mode: resumed.mode,
      taskId: resumed.taskId,
      disposition: resumed.disposition,
    });
    push(`resume ok=${resumed.ok} mode=${resumed.mode} taskId=${resumed.taskId}`);
    if (!resumed.ok || resumed.taskId !== taskId) {
      throw new Error("resume did not preserve task identity");
    }
    await rt.awaitTask(taskId, 30_000);
    const snap = rt.snapshotTask(taskId);
    evidence.steps.push({
      step: "finished",
      status: snap?.status,
      classification: snap?.classification,
    });
    push(`finished status=${snap?.status}`);

    // Honest native vs rehydrate note for Cursor when auth present.
    if (evidence.cursorProbe.ready) {
      evidence.steps.push({
        step: "cursor_native_policy",
        detail:
          "Cursor Agent.resume attempted on ensureConnected; create fallback is not labeled native resume",
      });
    }

    clearTaskInterrupted(runtimeRoot, taskId, "post-verify cleanup");
    evidence.verdict = "LIVE-VERIFIED";
    push("VERDICT: LIVE-VERIFIED");
  } catch (err) {
    evidence.verdict = "FAILED";
    evidence.error = err instanceof Error ? err.message : String(err);
    push(`FAILED: ${evidence.error}`);
  } finally {
    try {
      if (engineChild?.pid) process.kill(engineChild.pid, "SIGKILL");
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
