import { createServer, type Server } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runPathBuildMain } from "../../scripts/path-build.mjs";
import {
  createBuildController,
  projectBuildForSurface,
  readBuildEvents,
  readBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { ensureBuildCoordinator } from "../../scripts/pathcode-cli/build/coordinator/ensure.mjs";
import { projectEngineeringTimeline } from "../../scripts/pathcode-cli/build/surface/engineering-timeline.mjs";
import { appendTaskTrace } from "../../scripts/pathcode-cli/task-trace.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const packageRoot = resolvePathPackageRoot();
const handles: Array<{ client: { close(): void; shutdown(): Promise<unknown> } }> = [];
let incompatible: Server | null = null;

afterEach(async () => {
  incompatible?.close();
  incompatible = null;
  while (handles.length) {
    const handle = handles.pop();
    try {
      await handle?.client.shutdown();
    } catch {
      handle?.client.close();
    }
  }
});

function trace(tool: string, path: string, extra: Record<string, unknown> = {}) {
  return {
    t: extra.t,
    type: "session.engineering.tool",
    tool,
    path,
    command: extra.command,
    durationMs: extra.durationMs,
    meta: extra.meta,
    engine: extra.engine,
  };
}

describe("PATH Build experience", () => {
  it("projects Cursor, Copilot, and Antigravity traces through one timeline", () => {
    const engines = [
      { engine: "cursor", read: "read", edit: "edit", command: "run_command" },
      { engine: "copilot", read: "view_file", edit: "edit_file", command: "run_command" },
      { engine: "antigravity", read: "read_file", edit: "search_replace", command: "run_command" },
    ];
    for (const shape of engines) {
      const timeline = projectEngineeringTimeline(
        {
          buildId: "b-timeline",
          children: [
            {
              kind: "engineer",
              taskId: "task-1",
              actionId: "act-1",
              provider: shape.engine,
              dispatchState: "consumed",
            },
          ],
        },
        {
          projectRoot: "/proj",
          traces: [
            {
              taskId: "task-1",
              lines: [
                trace(shape.read, "/proj/src/App.tsx", {
                  t: "2026-09-22T08:41:12.000Z",
                  engine: shape.engine,
                }),
                trace(shape.read, "/proj/src/styles.css", {
                  t: "2026-09-22T08:41:13.000Z",
                  engine: shape.engine,
                }),
                trace("grep", "/proj", {
                  t: "2026-09-22T08:41:14.000Z",
                  engine: shape.engine,
                  meta: { query: "EmergencyCard", kind: "search" },
                }),
                trace("create_file", "/proj/src/components/Hero.tsx", {
                  t: "2026-09-22T08:41:18.000Z",
                  engine: shape.engine,
                }),
                trace(shape.edit, "/proj/src/App.tsx", {
                  t: "2026-09-22T08:41:26.000Z",
                  engine: shape.engine,
                  meta: { added: 18, removed: 4 },
                }),
                trace("delete_file", "/proj/src/old.ts", {
                  t: "2026-09-22T08:41:27.000Z",
                  engine: shape.engine,
                }),
                trace("rename_file", "/proj/src/a.ts", {
                  t: "2026-09-22T08:41:28.000Z",
                  engine: shape.engine,
                }),
                trace(shape.command, "", {
                  t: "2026-09-22T08:41:40.000Z",
                  engine: shape.engine,
                  command: "npm run typecheck",
                  durationMs: 4100,
                  meta: { ok: true },
                }),
                trace(shape.command, "", {
                  t: "2026-09-22T08:41:46.000Z",
                  engine: shape.engine,
                  command: "npm test",
                  meta: { ok: false, exitCode: 1 },
                }),
                {
                  t: "2026-09-22T08:41:55.000Z",
                  type: "session.engineering.result",
                  engine: shape.engine,
                },
              ],
            },
          ],
          events: [
            {
              id: 1,
              type: "adoption.completed",
              at: "2026-09-22T08:41:56.000Z",
              data: { adoptedSha: "a64bd37abcdef", taskId: "task-1" },
            },
            {
              id: 2,
              type: "runtime.updated",
              at: "2026-09-22T08:41:57.000Z",
              data: { authoritativeSha: "a64bd37abcdef", status: "ready" },
            },
          ],
        },
      );
      const summaries = timeline.entries.map((entry) => entry.summary);
      expect(summaries.filter((line) => line.includes("READ src/"))).toHaveLength(2);
      expect(summaries.some((line) => line.includes("SEARCH EmergencyCard"))).toBe(true);
      expect(summaries.some((line) => line.includes("CREATE src/components/Hero.tsx"))).toBe(true);
      expect(summaries.some((line) => line.includes("EDIT src/App.tsx +18 -4"))).toBe(true);
      expect(summaries.some((line) => line.includes("DELETE src/old.ts"))).toBe(true);
      expect(summaries.some((line) => line.includes("RENAME src/a.ts"))).toBe(true);
      expect(summaries.some((line) => line.includes("PASS typecheck"))).toBe(true);
      expect(summaries.some((line) => line.includes("FAIL test"))).toBe(true);
      expect(summaries.some((line) => line.startsWith("RESULT"))).toBe(true);
      expect(summaries.some((line) => line.includes("ADOPT a64bd37abcde"))).toBe(true);
      expect(summaries.some((line) => line.includes("PREVIEW a64bd37abcde"))).toBe(true);
      expect(new Set(timeline.entries.map((entry) => entry.sequence)).size).toBe(
        timeline.entries.length,
      );
      expect(timeline.phases.find((phase) => phase.id === "engineer")?.count).toBeGreaterThan(0);
    }
  });

  it("redacts secret-bearing commands and keeps project paths relative", () => {
    const timeline = projectEngineeringTimeline(
      { buildId: "b-secret", children: [{ kind: "engineer", taskId: "t", provider: "cursor" }] },
      {
        projectRoot: "/proj",
        traces: [
          {
            taskId: "t",
            lines: [
              trace("run_command", "", {
                t: "2026-09-22T08:00:00.000Z",
                engine: "cursor",
                command: "curl -H 'Authorization: Bearer supersecret' https://example.test",
              }),
            ],
          },
        ],
      },
    );
    expect(JSON.stringify(timeline)).not.toMatch(/supersecret|Bearer /);
    expect(timeline.entries[0]?.summary).toContain("[redacted command]");
  });

  it("refuses fake mode at the operator entrypoint", async () => {
    const previous = {
      fake: process.env.PATHCODE_BUILD_FAKE,
      gateway: process.env.PATHCODE_GATEWAY_FAKE_ENGINE,
    };
    const errors: string[] = [];
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errors.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      process.env.PATHCODE_BUILD_FAKE = "1";
      delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
      expect(await runPathBuildMain([])).toBe(2);
      delete process.env.PATHCODE_BUILD_FAKE;
      process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
      expect(await runPathBuildMain([])).toBe(2);
      expect(errors.join("")).toContain(
        "Fake/simulated Build mode is not available through the operator entrypoint.",
      );
    } finally {
      process.stderr.write = write;
      if (previous.fake == null) delete process.env.PATHCODE_BUILD_FAKE;
      else process.env.PATHCODE_BUILD_FAKE = previous.fake;
      if (previous.gateway == null) delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
      else process.env.PATHCODE_GATEWAY_FAKE_ENGINE = previous.gateway;
    }
  });

  it("shows an engine start failure without synthetic engineering", async () => {
    const dir = mkdtempSync(join(tmpdir(), "path-build-start-fail-"));
    const runtimeRoot = join(dir, "rt");
    mkdirSync(runtimeRoot, { recursive: true });
    const target = join(dir, "site");
    mkdirSync(target);
    const controller = createBuildController({
      runtimeRoot,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask() {
          return {
            ok: false,
            code: "ENGINE_UNAVAILABLE",
            message: "cursor adapter refused to start",
          };
        },
      },
    });
    const started = await controller.startBuild("A public status page", {
      targetDir: target,
      originKind: "build-created",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const ticked = await controller.tick(started.build.buildId);
    expect(ticked.ok).toBe(false);
    expect(ticked.code).toBe("ENGINE_UNAVAILABLE");
    const record = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(record?.loop.blockedReason).toMatch(/cursor adapter refused/);
    const events = readBuildEvents(runtimeRoot, started.build.buildId);
    const timeline = projectEngineeringTimeline(record, { events, traces: [] });
    expect(timeline.entries.some((entry) => entry.kind === "task_failed")).toBe(true);
    expect(timeline.entries.some((entry) => /READ |CREATE |ADOPT |PREVIEW /.test(entry.summary))).toBe(
      false,
    );
    const view = projectBuildForSurface(record, { events });
    expect(view.progressLabel).not.toMatch(/Applying changes/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps a mid-task failure on the real task and does not invent adoption", async () => {
    const dir = mkdtempSync(join(tmpdir(), "path-build-mid-fail-"));
    const runtimeRoot = join(dir, "rt");
    mkdirSync(join(runtimeRoot, "metadata", "tasks"), { recursive: true });
    const target = join(dir, "site");
    mkdirSync(target);
    const controller = createBuildController({
      runtimeRoot,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask() {
          return { ok: true, taskId: "t-brief" };
        },
        snapshotTask() {
          return null;
        },
      },
    });
    const started = await controller.startBuild("A public status page", {
      targetDir: target,
      originKind: "build-created",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const build = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(build).not.toBeNull();
    if (!build) return;
    const taskId = "task-mid-fail";
    const { writeBuildRecord } = await import("../../scripts/pathcode-cli/build/record.mjs");
    build.children.push({
      kind: "engineer",
      taskId,
      actionId: "engineer:mid",
      bindingId: build.projectBindings[0]!.bindingId,
      dispatchState: "dispatched",
      dispatchedAt: new Date().toISOString(),
      selectedAt: new Date().toISOString(),
      intentRevision: build.intent.outcomeRevision,
      provider: "cursor",
    });
    build.loop.status = "running";
    writeBuildRecord(runtimeRoot, build);
    appendTaskTrace({
      taskId,
      runtimeRoot,
      type: "session.engineering.tool",
      engine: "cursor",
      tool: "read",
      path: `${target}/index.html`,
    });
    appendTaskTrace({
      taskId,
      runtimeRoot,
      type: "gateway.task.finished",
      engine: "cursor",
      meta: { status: "failed", classification: "FAILED" },
    });
    const beforeSha = build.authoritativeSha;
    const recon = await controller.reconcileBuildChildren(build.buildId);
    expect(recon.ok).toBe(true);
    const after = readBuildRecord(runtimeRoot, build.buildId);
    const child = after?.children.find((item) => item.taskId === taskId);
    expect(child?.dispatchState).toBe("consumed");
    expect(child?.classification).toBe("FAILED");
    expect(after?.authoritativeSha || null).toBe(beforeSha || null);
    expect((child as { adoptedSha?: string } | undefined)?.adoptedSha || null).toBeNull();
    const timeline = projectEngineeringTimeline(after, {
      projectRoot: target,
      traces: [
        {
          taskId,
          lines: [
            { type: "session.engineering.tool", tool: "read", path: `${target}/index.html`, engine: "cursor" },
            { type: "gateway.task.finished", engine: "cursor", meta: { status: "failed" } },
          ],
        },
      ],
      events: readBuildEvents(runtimeRoot, build.buildId),
    });
    expect(timeline.entries.some((entry) => entry.summary.includes("READ index.html"))).toBe(true);
    expect(timeline.entries.some((entry) => entry.kind === "task_failed")).toBe(true);
    expect(timeline.entries.some((entry) => entry.kind === "adopt")).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("starts, reuses, recovers a stale socket, and survives a crash", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-coord-"));
    try {
      const cold = await ensureBuildCoordinator({
        runtimeRoot,
        packageRoot,
        fakeMode: true,
      });
      handles.push(cold);
      const hello = await cold.client.hello("test");
      expect(hello.protocolVersion).toBe(1);
      expect(hello.pid).toBeTypeOf("number");

      const warm = await ensureBuildCoordinator({
        runtimeRoot,
        packageRoot,
        fakeMode: true,
      });
      handles.push(warm);
      expect(warm.started).toBe(false);
      expect((await warm.client.hello("test")).pid).toBe(hello.pid);

      const raced = await Promise.all([
        ensureBuildCoordinator({ runtimeRoot, packageRoot, fakeMode: true }),
        ensureBuildCoordinator({ runtimeRoot, packageRoot, fakeMode: true }),
      ]);
      handles.push(...raced);
      const pids = await Promise.all(raced.map((item) => item.client.hello("race")));
      expect(pids[0]?.pid).toBe(hello.pid);
      expect(pids[1]?.pid).toBe(hello.pid);

      for (const handle of handles) handle.client.close();
      handles.length = 0;
      const owner = hello.pid;
      expect(typeof owner).toBe("number");
      if (typeof owner !== "number") return;
      try {
        process.kill(owner, "SIGKILL");
      } catch {
        // the coordinator may already have exited
      }
      for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
          process.kill(owner, 0);
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const recovered = await ensureBuildCoordinator({
        runtimeRoot,
        packageRoot,
        fakeMode: true,
      });
      const next = await recovered.client.hello("recovered");
      expect(next.pid).not.toBe(owner);
      expect(next.protocolVersion).toBe(1);
      await recovered.client.shutdown();
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  it("does not replace an incompatible coordinator owner", async () => {
    const runtimeRoot = mkdtempSync(join("/tmp", "pc-mm-"));
    const socketPath = join(runtimeRoot, "build-coordinator", "coordinator.sock");
    mkdirSync(join(runtimeRoot, "build-coordinator"), { recursive: true });
    incompatible = createServer((socket) => {
      socket.on("data", (chunk) => {
        const line = String(chunk).split("\n")[0] || "{}";
        const message = JSON.parse(line) as { id?: string };
        socket.write(
          `${JSON.stringify({
            id: message.id,
            result: { ok: true, protocolVersion: 99, pid: process.pid, packageVersion: "old" },
          })}\n`,
        );
      });
    });
    await new Promise<void>((resolve) => incompatible?.listen(socketPath, resolve));
    await expect(
      ensureBuildCoordinator({ runtimeRoot, packageRoot, fakeMode: true }),
    ).rejects.toThrow(/protocol mismatch/);
    expect(existsSync(socketPath)).toBe(true);
    incompatible.close();
    incompatible = null;
    rmSync(runtimeRoot, { recursive: true, force: true });
  });
});
