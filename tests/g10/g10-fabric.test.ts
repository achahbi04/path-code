/**
 * G10 — unit tests for checkpoint, guards, steering, events, reality.
 */

import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG10 = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag10/index.mjs");

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

function tmp(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pathcode-g10-${label}-`));
  temps.push(dir);
  return dir;
}

async function loadAg10() {
  return import(`${pathToFileURL(AG10).href}?g10=${randomUUID()}`);
}

function initGitRepo(dir: string) {
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "g10@test"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "g10"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "g10\n");
  spawnSync("git", ["add", "."], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
}

describe("G10 fabric guards", () => {
  it("writes and reads crash-safe task checkpoint atomically", async () => {
    const {
      createCheckpointSkeleton,
      writeTaskCheckpoint,
      readTaskCheckpoint,
      patchTaskCheckpoint,
    } = await loadAg10();
    const root = tmp("cp");
    const wt = tmp("wt");
    const cp = createCheckpointSkeleton({
      taskId: "t1",
      worktreePath: wt,
      objective: "fix the bug",
      headSha: "abc",
      diffFingerprint: "fp1",
    });
    writeTaskCheckpoint(root, cp);
    const loaded = readTaskCheckpoint(root, "t1");
    expect(loaded?.objective).toBe("fix the bug");
    expect(loaded?.schema).toContain("g10.task-checkpoint");
    const patched = patchTaskCheckpoint(root, "t1", {
      finalState: "VERIFIED",
      copilotMode: "cli_fallback",
    });
    expect(patched.finalState).toBe("VERIFIED");
    expect(patched.copilotMode).toBe("cli_fallback");
  });

  it("reconciles with Git reality outranking stale checkpoint", async () => {
    const {
      createCheckpointSkeleton,
      writeTaskCheckpoint,
      reconcileTaskReality,
      captureTaskReality,
    } = await loadAg10();
    const root = tmp("rec");
    const wt = tmp("repo");
    initGitRepo(wt);
    const reality = captureTaskReality(wt);
    writeTaskCheckpoint(
      root,
      createCheckpointSkeleton({
        taskId: "t2",
        worktreePath: wt,
        headSha: "deadbeef",
        diffFingerprint: "stale-fp",
        objective: "old",
      }),
    );
    const { readTaskCheckpoint } = await loadAg10();
    const rec = reconcileTaskReality({
      checkpoint: readTaskCheckpoint(root, "t2"),
      worktreePath: wt,
    });
    expect(rec.authoritative.headSha).toBe(reality.headSha);
    expect(["git_ahead", "checkpoint_stale"]).toContain(rec.status);
    expect(rec.resumeBrief).toContain("filesystem/Git authoritative");
  });

  it("steering queues during mutation and applies at boundary", async () => {
    const { SteeringQueue } = await loadAg10();
    const q = new SteeringQueue();
    q.setMutationActive(true);
    const item = q.accept("Keep backward compatibility");
    expect(item.status).toBe("PENDING");
    const deferred = q.applyAtBoundary();
    expect(deferred.deferred).toBe(true);
    expect(deferred.applied).toHaveLength(0);
    q.setMutationActive(false);
    const applied = q.applyAtBoundary();
    expect(applied.deferred).toBe(false);
    expect(applied.applied).toHaveLength(1);
    expect(applied.combinedText).toContain("backward");
    expect(applied.applied[0].status).toBe("APPLIED");
  });

  it("no-progress breaker warns at 2 and stops at 3; productive resets", async () => {
    const { NoProgressCircuitBreaker } = await loadAg10();
    const b = new NoProgressCircuitBreaker();
    expect(b.recordHandoff({ productive: false }).action).toBe("continue");
    expect(b.recordHandoff({ productive: false }).action).toBe("warn");
    expect(b.recordHandoff({ productive: false }).action).toBe(
      "stop_auto_bounce",
    );
    b.recordHandoff({ productive: true });
    // After productive, long collaboration may continue past 3 total turns.
    expect(b.recordHandoff({ productive: true }).action).toBe("continue");
    expect(b.recordHandoff({ productive: true }).action).toBe("continue");
    expect(b.recordHandoff({ productive: true }).action).toBe("continue");
    expect(b.recordHandoff({ productive: true }).action).toBe("continue");
  });

  it("event idempotency rejects duplicates", async () => {
    const { EventIdempotencyGuard, makeEventId, normalizeG10Event } =
      await loadAg10();
    const g = new EventIdempotencyGuard();
    const ev = normalizeG10Event({
      family: "command.started",
      providerEventId: "call-1",
      detail: "npm test",
    });
    expect(ev).toBeTruthy();
    expect(g.accept(ev!.id)).toBe(true);
    expect(g.accept(ev!.id)).toBe(false);
    expect(makeEventId({ family: "x", providerEventId: "p" })).toBe("prov:p");
  });

  it("stale background intelligence is not consumed", async () => {
    const { StaleIntelligenceGuard } = await loadAg10();
    const v = StaleIntelligenceGuard.classify(
      { fingerprint: "aaa", kind: "scip", result: {} },
      "bbb",
    );
    expect(v.status).toBe("STALE");
    expect(v.ok).toBe(false);
    const ok = StaleIntelligenceGuard.classify(
      { fingerprint: "same", kind: "scip", result: { hits: 1 } },
      "same",
    );
    expect(ok.ok).toBe(true);
  });

  it("external action registry prevents duplicate completed actions", async () => {
    const { ExternalActionRegistry } = await loadAg10();
    const root = tmp("ext");
    const reg = new ExternalActionRegistry(root, "task-x");
    const id = ExternalActionRegistry.actionId("pr_create", "repo#1");
    expect(reg.begin({ id, kind: "pr_create" }).proceed).toBe(true);
    reg.record({ id, kind: "pr_create", status: "completed", result: { n: 1 } });
    const again = reg.begin({ id, kind: "pr_create" });
    expect(again.proceed).toBe(false);
    expect(again.reason).toBe("already_completed");
  });

  it("classifyAgSessionContinuity distinguishes native vs rehydrated", async () => {
    const { classifyAgSessionContinuity } = await import(
      `${pathToFileURL(join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag10/ag-session.mjs")).href}?${randomUUID()}`
    );
    expect(
      classifyAgSessionContinuity({
        hadLiveAgent: true,
        continueSucceeded: true,
        restartedBridge: false,
        currentTaskId: "t",
      }).mode,
    ).toBe("NATIVE_RESUME");
    expect(
      classifyAgSessionContinuity({
        hadLiveAgent: false,
        continueSucceeded: false,
        restartedBridge: true,
        currentTaskId: "t",
      }).mode,
    ).toBe("REHYDRATED_SESSION");
  });

  it("maps Copilot SDK / AG events into session cockpit events", async () => {
    const { mapCopilotSdkEvent, mapAntigravityBridgeEvent, toSessionEvent } =
      await loadAg10();
    const cmd = mapCopilotSdkEvent({
      type: "tool.start",
      data: { toolName: "shell", callId: "c1" },
    });
    expect(cmd?.family).toBe("command.started");
    expect(toSessionEvent(cmd!).type).toBe("session.engineering.tool");
    const edit = mapAntigravityBridgeEvent({
      type: "activity",
      activity: "editing",
      detail: "src/a.ts",
    });
    expect(edit?.family).toBe("file.modified");
  });

  it("createG10Fabric persists and survives reload", async () => {
    const { createG10Fabric, readTaskCheckpoint } = await loadAg10();
    const root = tmp("fab");
    const wt = tmp("fabwt");
    mkdirSync(wt, { recursive: true });
    const fabric = await createG10Fabric({
      runtimeRoot: root,
      taskId: "fab1",
      worktreePath: wt,
      objective: "persist me",
      preferCopilotSdk: false,
    });
    fabric.acceptSteering("do not break API");
    fabric.persist({ latestEngineTurn: "antigravity" });
    await fabric.shutdown();
    const cp = readTaskCheckpoint(root, "fab1");
    expect(cp?.objective).toBe("persist me");
    expect(cp?.pendingSteering?.length).toBeGreaterThan(0);
    expect(cp?.latestEngineTurn).toBe("antigravity");
  });

  it("pins a stable host Copilot CLI path for Keychain ACL identity", async () => {
    const sdkPath = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag10/copilot-sdk.mjs");
    const {
      resolveStableCopilotCliPath,
      withStableCopilotPath,
    } = await import(`${pathToFileURL(sdkPath).href}?g10=${randomUUID()}`);
    const fake = join(tmp("copilot-bin"), "copilot");
    mkdirSync(dirname(fake), { recursive: true });
    writeFileSync(fake, "#!/bin/sh\necho ok\n", { mode: 0o755 });
    const resolved = resolveStableCopilotCliPath({
      COPILOT_CLI_PATH: fake,
      PATH: "/usr/bin:/bin",
    });
    expect(resolved).toBe(fake);
    const env = withStableCopilotPath({
      COPILOT_CLI_PATH: fake,
      PATH: "/usr/bin:/bin",
    });
    expect(env.COPILOT_CLI_PATH).toBe(fake);
    expect(env.PATHCODE_COPILOT_BIN).toBe(fake);
    expect(String(env.PATH || "").startsWith(dirname(fake))).toBe(true);
  });
});
