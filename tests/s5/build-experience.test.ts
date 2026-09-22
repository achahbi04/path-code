import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runPathBuildMain } from "../../scripts/path-build.mjs";
import {
  sanitizeBuildEventValue,
  surfaceViewSanitizeLimits,
} from "../../scripts/pathcode-cli/build/index.mjs";
import {
  createBuildController,
  projectBuildForSurface,
  readBuildEvents,
  readBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { ensureBuildCoordinator } from "../../scripts/pathcode-cli/build/coordinator/ensure.mjs";
import { projectEngineeringTimeline } from "../../scripts/pathcode-cli/build/surface/engineering-timeline.mjs";
import { projectEngineeringActivity } from "../../scripts/pathcode-cli/build/surface/engineering-activity.mjs";
import {
  adoptionAllowedForIntent,
  capabilityFromChangedFiles,
  frameEngineerObjective,
} from "../../scripts/pathcode-cli/build/objectives.mjs";
import { resolveMutatingEngineAttempt } from "../../scripts/pathcode-cli/ag10/engine-contract.mjs";
import { probeCursorDispatchReadiness } from "../../scripts/pathcode-cli/ag10/cursor-sdk.mjs";
import { mapCursorSdkEvent } from "../../scripts/pathcode-cli/ag10/events.mjs";
import { selectSurfaceBuildId } from "../../scripts/pathcode-cli/build/index.mjs";
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
      expect(summaries.some((line) => line.includes("TYPECHECK passed"))).toBe(true);
      expect(summaries.some((line) => line.includes("TEST failed"))).toBe(true);
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
      const processResult = spawnSync(
        process.execPath,
        [join(packageRoot, "scripts/path-build.mjs")],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATHCODE_BUILD_FAKE: "1",
            PATHCODE_BUILD_NO_OPEN: "1",
          },
          timeout: 10_000,
        },
      );
      expect(processResult.status).toBe(2);
      expect(processResult.stderr).toContain(
        "Fake/simulated Build mode is not available through the operator entrypoint.",
      );
      expect(processResult.stdout).not.toContain("PATH Build ready:");
    } finally {
      process.stderr.write = write;
      if (previous.fake == null) delete process.env.PATHCODE_BUILD_FAKE;
      else process.env.PATHCODE_BUILD_FAKE = previous.fake;
      if (previous.gateway == null) delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
      else process.env.PATHCODE_GATEWAY_FAKE_ENGINE = previous.gateway;
    }
  });

  it("does not drop engineering timeline entries on the surface projection", () => {
    const entries = Array.from({ length: 80 }, (_, index) => ({
      sequence: index + 1,
      summary: `CURSOR READ src/file-${index}.ts`,
      kind: "file_read",
    }));
    const view = {
      engineeringTimeline: {
        entries,
        current: entries[entries.length - 1],
        phases: [{ id: "engineer", label: "Building", status: "done", count: 80 }],
      },
    };
    const durable = sanitizeBuildEventValue(view) as {
      engineeringTimeline: { entries: unknown[] };
    };
    expect(durable.engineeringTimeline.entries).toHaveLength(50);
    const surface = sanitizeBuildEventValue(view, 0, surfaceViewSanitizeLimits()) as {
      engineeringTimeline: { entries: Array<{ summary: string }> };
    };
    expect(surface.engineeringTimeline.entries).toHaveLength(80);
    expect(surface.engineeringTimeline.entries[79]?.summary).toBe("CURSOR READ src/file-79.ts");
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

  it("keeps two builds from sharing conversation, preview, worklog, or adoption", () => {
    const buildA = {
      buildId: "build-a",
      productBranch: "path-build/build-a",
      authoritativeSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      intent: { outcome: "website A", outcomeRevision: 1 },
      loop: { status: "running" },
      conversation: [{ id: "a", role: "user", text: "conversation A" }],
      children: [{ kind: "engineer", taskId: "task-a", provider: "cursor", dispatchState: "consumed" }],
      adoptionHistory: [{ adoptedSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", taskId: "task-a", engine: "cursor" }],
      projectBindings: [{ projectRoot: "/proj-a" }],
    };
    const buildB = {
      buildId: "build-b",
      productBranch: "path-build/build-b",
      authoritativeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      intent: { outcome: "website B", outcomeRevision: 2 },
      loop: { status: "complete" },
      conversation: [{ id: "b", role: "user", text: "conversation B" }],
      children: [{ kind: "engineer", taskId: "task-b", provider: "copilot", dispatchState: "consumed" }],
      adoptionHistory: [{ adoptedSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", taskId: "task-b", engine: "copilot" }],
      projectBindings: [{ projectRoot: "/proj-b" }],
    };
    const viewA = projectBuildForSurface(buildA, {
      traces: [{ taskId: "task-a", lines: [{ t: "2026-09-22T16:03:33.000Z", type: "session.task.received", engine: "cursor" }] }],
      preview: { revision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    const viewB = projectBuildForSurface(buildB, {
      traces: [{ taskId: "task-b", lines: [{ t: "2026-09-22T10:26:08.000Z", type: "session.task.received", engine: "copilot" }] }],
      preview: { revision: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    });
    expect(viewA.buildId).toBe("build-a");
    const talkA = (viewA.conversation || []).map((row) => row.text).join(" ");
    expect(talkA).toContain("conversation A");
    expect(talkA).not.toContain("conversation B");
    expect(viewA.identity?.previewSha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect((viewA.engineeringTimeline?.entries || []).every((entry) => entry.taskId === "task-a")).toBe(true);
    expect(viewA.engineeringActivity?.latestRevision?.taskId).toBe("task-a");
    expect(viewB.engineeringActivity?.latestRevision?.sha?.startsWith("bbbb")).toBe(true);
    expect(selectSurfaceBuildId([buildA, buildB])).toBe("build-a");
    expect(selectSurfaceBuildId([buildB])).toBeNull();
    expect(selectSurfaceBuildId([buildA, { ...buildA, buildId: "build-c", loop: { status: "running" } }])).toBeNull();
  });

  it("scopes a failed current task apart from an older adopted revision", () => {
    const activity = projectEngineeringActivity(
      {
        buildId: "build-mix",
        authoritativeSha: "1a57490e6e60ef7fd84810bb9b1fe201776e7db6",
        children: [
          {
            kind: "engineer",
            taskId: "e87c7556-84aa-4743-b6dd-aa5d43152897",
            provider: "cursor",
            dispatchState: "consumed",
            classification: "VERIFIED",
            adoptedSha: "1a57490e6e60ef7fd84810bb9b1fe201776e7db6",
          },
          {
            kind: "engineer",
            taskId: "ceddd7fb-39fa-4d42-bb9b-5abea2cb6cb6",
            provider: "cursor",
            dispatchState: "consumed",
            classification: "FAILED",
            intentRevision: 4,
          },
        ],
        adoptionHistory: [
          {
            adoptedSha: "1a57490e6e60ef7fd84810bb9b1fe201776e7db6",
            taskId: "e87c7556-84aa-4743-b6dd-aa5d43152897",
            engine: "cursor",
            intentRevision: 3,
            files: ["index.html", "package.json", "style.css"],
          },
        ],
      },
      {
        checkpoint: { taskId: "ceddd7fb-39fa-4d42-bb9b-5abea2cb6cb6", changedFiles: [] },
        revisionDiff: {
          sha: "1a57490e6e60ef7fd84810bb9b1fe201776e7db6",
          summary: "191 insertions",
          files: ["index.html", "package.json", "style.css"],
        },
      },
    );
    expect(activity.currentTask.taskId).toBe("ceddd7fb-39fa-4d42-bb9b-5abea2cb6cb6");
    expect(activity.currentTask.files).toEqual([]);
    expect(activity.currentTask.adoptedSha).toBeNull();
    expect(activity.latestRevision?.taskId).toBe("e87c7556-84aa-4743-b6dd-aa5d43152897");
    expect(activity.latestRevision?.files).toEqual(["index.html", "package.json", "style.css"]);
    expect(activity.adoptedSha).toBeNull();
  });

  it("orders the worklog by source sequence and keeps distinct same-time events", () => {
    const timeline = projectEngineeringTimeline(
      {
        buildId: "build-order",
        children: [
          { kind: "engineer", taskId: "task-late", provider: "cursor", dispatchState: "consumed" },
          { kind: "engineer", taskId: "task-early", provider: "copilot", dispatchState: "consumed" },
        ],
      },
      {
        traces: [
          {
            taskId: "task-late",
            lines: [
              { t: "2026-09-22T16:07:24.000Z", type: "session.engineering.tool", tool: "read_file", path: "a.html", engine: "cursor" },
              {
                t: "2026-09-22T16:07:24.000Z",
                type: "gateway.task.finished",
                meta: { status: "completed" },
                engine: "cursor",
              },
              {
                t: "2026-09-22T16:07:24.000Z",
                type: "session.engineering.result",
                engine: "cursor",
              },
            ],
          },
          {
            taskId: "task-early",
            lines: [
              { t: "2026-09-23T10:26:08.000Z", type: "session.engineering.tool", tool: "read_file", path: "b.html", engine: "copilot" },
              { t: "2026-09-23T10:26:08.000Z", type: "session.engineering.tool", tool: "read_file", path: "c.html", engine: "copilot" },
            ],
          },
        ],
      },
    );
    expect(timeline.entries.map((entry) => entry.taskId)).toEqual([
      "task-late",
      "task-late",
      "task-early",
      "task-early",
    ]);
    expect(timeline.entries.filter((entry) => entry.kind === "result")).toHaveLength(1);
    const sameTimeReads = timeline.entries.filter((entry) => entry.taskId === "task-early");
    expect(sameTimeReads).toHaveLength(2);
    expect(timeline.turns.map((turn) => turn.taskId)).toEqual(["task-late", "task-early"]);
    expect(timeline.turns[0]?.clockReversed).toBe(false);
  });

  it("shows a date boundary when a later source turn has an earlier clock", () => {
    const timeline = projectEngineeringTimeline(
      {
        buildId: "build-clock",
        children: [
          { kind: "engineer", taskId: "afternoon", provider: "cursor", dispatchState: "consumed", intentRevision: 1 },
          { kind: "engineer", taskId: "morning", provider: "cursor", dispatchState: "consumed", intentRevision: 2 },
        ],
      },
      {
        traces: [
          {
            taskId: "afternoon",
            lines: [{ t: "2026-09-22T16:07:24.000Z", type: "session.task.received", engine: "cursor" }],
          },
          {
            taskId: "morning",
            lines: [{ t: "2026-09-22T10:26:08.000Z", type: "session.task.received", engine: "cursor" }],
          },
        ],
      },
    );
    const first = timeline.entries[0];
    const second = timeline.entries[1];
    expect(first && second && first.timestamp && second.timestamp && first.timestamp > second.timestamp).toBe(true);
    expect(timeline.turns).toHaveLength(2);
    expect(timeline.turns[0]?.taskId).toBe("afternoon");
    expect(timeline.turns[1]?.taskId).toBe("morning");
  });

  it("distinguishes Cursor auth, runtime, and SDK readiness without printing a key", () => {
    const missing = probeCursorDispatchReadiness({ env: {} });
    expect(missing.apiKeyPresent).toBe(false);
    expect(missing.ready).toBe(false);
    expect(missing.reason === "auth_unavailable" || missing.reason?.startsWith("unsupported_runtime")).toBe(true);
    expect(JSON.stringify(missing)).not.toMatch(/sk-|CURSOR_API_KEY=/);
    const mapped = mapCursorSdkEvent({
      type: "tool_call",
      call_id: "call-1",
      name: "edit",
      status: "completed",
      path: "index.html",
    });
    expect(JSON.stringify(mapped || {})).toContain("call-1");
  });

  it("selects ready Cursor and refuses a silent Copilot fallback", () => {
    expect(
      resolveMutatingEngineAttempt({ preferred: "cursor", cursorMode: "native_sdk", fallback: "copilot" }),
    ).toMatchObject({ selected: "cursor", fallback: false, blocked: false });
    expect(
      resolveMutatingEngineAttempt({ preferred: "cursor", cursorMode: "unavailable", fallback: "" }),
    ).toMatchObject({ selected: null, blocked: true, newTask: false });
    expect(
      resolveMutatingEngineAttempt({ preferred: "cursor", cursorMode: "unavailable", fallback: "copilot" }),
    ).toMatchObject({ selected: "copilot", fallback: true, newTask: true });
  });

  it("refuses to adopt a non-web result for a website intent", () => {
    const record = {
      intent: { outcome: "Build a polished public website for ICE", outcomeRevision: 1 },
      productBrief: { productKind: "web" },
      projectBindings: [{ originGitInit: true }],
    };
    expect(adoptionAllowedForIntent(record, "cli").ok).toBe(false);
    expect(adoptionAllowedForIntent(record, "web").ok).toBe(true);
    expect(adoptionAllowedForIntent(record, "none").ok).toBe(false);
    expect(capabilityFromChangedFiles(["index.html", "css/styles.css", "js/main.js"])).toBe("web");
    expect(
      adoptionAllowedForIntent(
        record,
        capabilityFromChangedFiles(["index.html", "css/styles.css"]) || "none",
      ).ok,
    ).toBe(true);
    const objective = frameEngineerObjective(record, "establish the product");
    expect(objective).toContain("previewable website");
    expect(objective).toContain("PATH Build outcome");
    expect(objective).not.toContain("package.json OR a static index.html");
  });

  it("composes failed and paused as one truth and maps outcome lifecycle", () => {
    const paused = projectBuildForSurface(
      {
        buildId: "build-fail",
        loop: { status: "paused" },
        intent: { outcome: "website", outcomeRevision: 2 },
        children: [
          {
            kind: "engineer",
            taskId: "task-fail",
            provider: "cursor",
            dispatchState: "consumed",
            classification: "FAILED",
          },
        ],
        conversation: [
          { id: "u", role: "user", text: "make it red", status: "failed", intentRevision: 2 },
          { id: "a", role: "assistant", text: "Engineering that change…", status: "failed" },
        ],
        outcomeCriteria: [{ id: "c1", statement: "Explains the service", status: "UNKNOWN", required: true }],
      },
      {},
    );
    expect(paused.progressLabel).toBe("Failed — paused");
    expect((paused.conversation || []).find((row) => row.role === "assistant")?.status).toBe("failed");
    expect(paused.criteria?.[0]?.creatorStatus).toBe("pending");
    const evaluating = projectBuildForSurface(
      {
        buildId: "build-eval",
        loop: { status: "running" },
        intent: { outcome: "website", outcomeRevision: 1 },
        children: [{ kind: "evaluate", taskId: "task-eval", dispatchState: "dispatched" }],
        outcomeCriteria: [{ id: "c1", statement: "Explains the service", status: "UNKNOWN", required: true }],
      },
      {},
    );
    expect(evaluating.criteria?.[0]?.creatorStatus).toBe("evaluating");
    const inconclusive = projectBuildForSurface(
      {
        buildId: "build-unknown",
        loop: { status: "running" },
        intent: { outcome: "website", outcomeRevision: 1 },
        children: [{ kind: "evaluate", taskId: "task-eval", dispatchState: "consumed" }],
        outcomeCriteria: [{ id: "c1", statement: "Explains the service", status: "UNKNOWN", required: true }],
      },
      {},
    );
    expect(inconclusive.criteria?.[0]?.creatorStatus).toBe("inconclusive");
    const proven = projectBuildForSurface(
      {
        buildId: "build-proven",
        loop: { status: "complete" },
        intent: { outcome: "website", outcomeRevision: 1 },
        children: [{ kind: "evaluate", taskId: "task-eval", dispatchState: "consumed" }],
        outcomeCriteria: [{ id: "c1", statement: "Explains the service", status: "PROVEN", required: true }],
      },
      {},
    );
    expect(proven.criteria?.[0]?.creatorStatus).toBe("proven");
  });
});
