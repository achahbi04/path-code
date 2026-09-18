/**
 * S4.1 — durable continuity disposition + Gateway resume (mechanical).
 */
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG10 = join(CHECKOUT, "scripts/pathcode-cli/ag10");
const GATEWAY = join(CHECKOUT, "scripts/pathcode-cli/gateway/index.mjs");

/** @type {string[]} */
const temps: string[] = [];

afterEach(() => {
  while (temps.length) {
    const p = temps.pop();
    if (!p) continue;
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

async function load(path: string) {
  return import(`${pathToFileURL(path).href}?s4=${randomUUID()}`);
}

function tmpGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pathcode-s4-"));
  temps.push(dir);
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "s4@test"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "s4"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "s4\n");
  spawnSync("git", ["add", "."], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

describe("S4.1 durable continuity", () => {
  it("classifies still_running vs interrupted vs completed from evidence", async () => {
    const {
      assessTaskContinuity,
      writeTaskCheckpoint,
      markTaskInterrupted,
    } = await load(join(AG10, "index.mjs"));
    const runtimeRoot = mkdtempSync(join(tmpdir(), "s4-rt-"));
    temps.push(runtimeRoot);
    const repo = tmpGitRepo();
    const taskId = randomUUID();

    writeTaskCheckpoint(runtimeRoot, {
      schema: "pathcode.g10.task-checkpoint.v1",
      taskId,
      sessionId: taskId,
      repoRoot: repo,
      worktreePath: repo,
      objective: "interrupted work",
      updatedAt: new Date().toISOString(),
    });

    expect(
      assessTaskContinuity({
        runtimeRoot,
        taskId,
        liveTask: { status: "running" },
      }).disposition,
    ).toBe("still_running");

    markTaskInterrupted(runtimeRoot, taskId, "gateway killed");
    const interrupted = assessTaskContinuity({ runtimeRoot, taskId });
    expect(interrupted.disposition).toBe("interrupted");
    expect(interrupted.nextAction).toBe("resume");

    writeTaskCheckpoint(runtimeRoot, {
      schema: "pathcode.g10.task-checkpoint.v1",
      taskId,
      sessionId: taskId,
      repoRoot: repo,
      worktreePath: repo,
      objective: "done",
      finalState: "VERIFIED",
      updatedAt: new Date().toISOString(),
    });
    expect(
      assessTaskContinuity({ runtimeRoot, taskId }).disposition,
    ).toBe("completed");
  });

  it("routes by traits presence for resumable vs recoverable_from_durable_state", async () => {
    const { assessTaskContinuity, writeTaskCheckpoint } = await load(
      join(AG10, "index.mjs"),
    );
    const runtimeRoot = mkdtempSync(join(tmpdir(), "s4-rt2-"));
    temps.push(runtimeRoot);
    const repo = tmpGitRepo();
    const taskId = randomUUID();
    writeTaskCheckpoint(runtimeRoot, {
      schema: "pathcode.g10.task-checkpoint.v1",
      taskId,
      sessionId: taskId,
      repoRoot: repo,
      worktreePath: repo,
      objective: "continue",
      cursorSessionId: "bc-agent-1",
      cursorMode: "native_sdk",
      updatedAt: new Date().toISOString(),
    });
    expect(
      assessTaskContinuity({ runtimeRoot, taskId }).disposition,
    ).toBe("resumable");

    const taskId2 = randomUUID();
    writeTaskCheckpoint(runtimeRoot, {
      schema: "pathcode.g10.task-checkpoint.v1",
      taskId: taskId2,
      sessionId: taskId2,
      repoRoot: repo,
      worktreePath: repo,
      objective: "continue without engine ids",
      updatedAt: new Date().toISOString(),
    });
    expect(
      assessTaskContinuity({ runtimeRoot, taskId: taskId2 }).disposition,
    ).toBe("recoverable_from_durable_state");
  });

  it("Gateway resume reconstructs ownership after Map loss (fake engine)", async () => {
    const prevFake = process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
    const prevBoot = process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;
    process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
    process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";
    try {
      const { createGatewayRuntime } = await load(GATEWAY);
      const {
        writeTaskCheckpoint,
        markTaskInterrupted,
        readTaskCheckpoint,
      } = await load(join(AG10, "index.mjs"));

      const repo = tmpGitRepo();
      const runtimeRoot = mkdtempSync(join(tmpdir(), "s4-gw-"));
      temps.push(runtimeRoot);

      const rt1 = createGatewayRuntime({
        packageRoot: CHECKOUT,
        runtimeRoot,
      });
      await rt1.bindProject({ cwd: repo });
      const started = await rt1.startTask({
        objective: "S4 continuity fake engineering",
      });
      expect(started.ok).toBe(true);
      const taskId = started.taskId;
      await rt1.awaitTask(taskId, 30_000);
      const done = rt1.snapshotTask(taskId);
      expect(done?.status).toBe("completed");

      // Simulate Gateway process loss: durable CP remains, Map gone.
      const rt2 = createGatewayRuntime({
        packageRoot: CHECKOUT,
        runtimeRoot,
      });
      // Re-open incomplete state: strip finalState and mark interrupted.
      const cp = readTaskCheckpoint(runtimeRoot, taskId);
      expect(cp).toBeTruthy();
      writeTaskCheckpoint(runtimeRoot, {
        ...cp,
        finalState: undefined,
        continuityDisposition: undefined,
        interruptedAt: undefined,
      });
      markTaskInterrupted(runtimeRoot, taskId, "simulated gateway death");

      expect(rt2.snapshotTask(taskId)).toBeNull();
      const continuity = rt2.assessContinuity({ taskId });
      expect(continuity.disposition).toBe("interrupted");

      await rt2.bindProject({ cwd: repo });
      const resumed = await rt2.resumeTask({ taskId });
      expect(resumed.ok).toBe(true);
      expect(resumed.mode).toBe("resume");
      expect(resumed.taskId).toBe(taskId);
      await rt2.awaitTask(taskId, 30_000);
      const after = rt2.snapshotTask(taskId);
      expect(after?.status).toBe("completed");
    } finally {
      if (prevFake == null) delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
      else process.env.PATHCODE_GATEWAY_FAKE_ENGINE = prevFake;
      if (prevBoot == null) delete process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;
      else process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = prevBoot;
    }
  });

  it("reclaims stale gateway pid/socket and marks checkpoints interrupted", async () => {
    const { reclaimStaleGatewayOwnership, resolveGatewayPidPath, resolveGatewaySocketPath } =
      await load(GATEWAY);
    const { writeTaskCheckpoint, readTaskCheckpoint } = await load(
      join(AG10, "index.mjs"),
    );
    const runtimeRoot = mkdtempSync(join(tmpdir(), "s4-reclaim-"));
    temps.push(runtimeRoot);
    const repo = tmpGitRepo();
    const taskId = randomUUID();
    writeTaskCheckpoint(runtimeRoot, {
      schema: "pathcode.g10.task-checkpoint.v1",
      taskId,
      sessionId: taskId,
      repoRoot: repo,
      worktreePath: repo,
      objective: "stale reclaim",
      updatedAt: new Date().toISOString(),
    });

    const pidPath = resolveGatewayPidPath(runtimeRoot);
    const socketPath = resolveGatewaySocketPath(runtimeRoot);
    mkdirSync(dirname(pidPath), { recursive: true });
    // Definitely-dead pid
    writeFileSync(pidPath, "999999\n/tmp/dead.sock\n1\n", "utf8");
    writeFileSync(socketPath, "", "utf8");

    const reclaim = reclaimStaleGatewayOwnership(runtimeRoot, socketPath);
    expect(reclaim.reclaimed).toBe(true);
    expect(reclaim.marked).toContain(taskId);
    expect(existsSync(pidPath)).toBe(false);
    const cp = readTaskCheckpoint(runtimeRoot, taskId);
    expect(cp?.continuityDisposition).toBe("interrupted");
  });

  it("refuses resume of VERIFIED checkpoints", async () => {
    const prevFake = process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
    const prevBoot = process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;
    process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
    process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";
    try {
      const { createGatewayRuntime } = await load(GATEWAY);
      const { writeTaskCheckpoint } = await load(join(AG10, "index.mjs"));
      const repo = tmpGitRepo();
      const runtimeRoot = mkdtempSync(join(tmpdir(), "s4-done-"));
      temps.push(runtimeRoot);
      const taskId = randomUUID();
      writeTaskCheckpoint(runtimeRoot, {
        schema: "pathcode.g10.task-checkpoint.v1",
        taskId,
        sessionId: taskId,
        repoRoot: repo,
        worktreePath: repo,
        objective: "already done",
        finalState: "VERIFIED",
        updatedAt: new Date().toISOString(),
      });
      const rt = createGatewayRuntime({ packageRoot: CHECKOUT, runtimeRoot });
      await rt.bindProject({ cwd: repo });
      const resumed = await rt.resumeTask({ taskId });
      expect(resumed.ok).toBe(false);
      expect(resumed.code).toBe("TASK_NOT_RESUMABLE");
    } finally {
      if (prevFake == null) delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
      else process.env.PATHCODE_GATEWAY_FAKE_ENGINE = prevFake;
      if (prevBoot == null) delete process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;
      else process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = prevBoot;
    }
  });
});
