/**
 * S4.3 — host startup reconcile + reopen notice (mechanical).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG10 = join(CHECKOUT, "scripts/pathcode-cli/ag10");

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
  return import(`${pathToFileURL(path).href}?s43=${randomUUID()}`);
}

function tmpGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pathcode-s43t-"));
  temps.push(dir);
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "s43@test"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "s43"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "s43\n");
  spawnSync("git", ["add", "."], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

describe("S4.3 host startup / reopen", () => {
  it("marks in-flight checkpoints interrupted when no process owners survive", async () => {
    const {
      writeTaskCheckpoint,
      reconcileHostStartup,
      formatReopenNotice,
    } = await load(join(AG10, "index.mjs"));
    const runtimeRoot = mkdtempSync(join(tmpdir(), "s43-rt-"));
    temps.push(runtimeRoot);
    const repo = tmpGitRepo();
    const taskId = randomUUID();
    writeTaskCheckpoint(runtimeRoot, {
      schema: "pathcode.g10.task-checkpoint.v1",
      taskId,
      sessionId: taskId,
      repoRoot: repo,
      worktreePath: repo,
      objective: "finish the reboot-proof note",
      latestEngineTurn: "in_flight:cursor",
      inFlightEngine: "cursor",
      inFlightStartedAt: new Date().toISOString(),
      cursorSessionId: "agent-xyz",
      cursorMode: "native_sdk",
      updatedAt: new Date().toISOString(),
    });

    const startup = reconcileHostStartup({
      runtimeRoot,
      projectRoot: repo,
    });
    const hit = startup.recoverable.find(
      (a: { taskId: string }) => a.taskId === taskId,
    );
    expect(hit).toBeTruthy();
    expect(hit.disposition).toBe("interrupted");
    expect(
      startup.markedInFlight.includes(taskId) ||
        hit.checkpoint?.continuityDisposition === "interrupted",
    ).toBe(true);
    const notice = startup.notices[0] || formatReopenNotice(hit);
    expect(notice).toMatch(/Interrupted engineering task/);
    expect(notice).toContain(`/resume ${taskId}`);
    expect(notice).toMatch(/Native resume will be attempted/);
  });

  it("lists only project-scoped recoverable tasks", async () => {
    const { writeTaskCheckpoint, listRecoverableTasks } = await load(
      join(AG10, "index.mjs"),
    );
    const runtimeRoot = mkdtempSync(join(tmpdir(), "s43-scope-"));
    temps.push(runtimeRoot);
    const repoA = tmpGitRepo();
    const repoB = tmpGitRepo();
    const idA = randomUUID();
    const idB = randomUUID();
    writeTaskCheckpoint(runtimeRoot, {
      schema: "pathcode.g10.task-checkpoint.v1",
      taskId: idA,
      sessionId: idA,
      repoRoot: repoA,
      worktreePath: repoA,
      objective: "A",
      continuityDisposition: "interrupted",
      interruptedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    writeTaskCheckpoint(runtimeRoot, {
      schema: "pathcode.g10.task-checkpoint.v1",
      taskId: idB,
      sessionId: idB,
      repoRoot: repoB,
      worktreePath: repoB,
      objective: "B",
      continuityDisposition: "interrupted",
      interruptedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const onlyA = listRecoverableTasks({
      runtimeRoot,
      projectRoot: repoA,
    });
    expect(onlyA.map((a: { taskId: string }) => a.taskId)).toEqual([idA]);
  });
});
