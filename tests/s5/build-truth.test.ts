/**
 * S5 — truthful status, message lifecycle, activity, and view ordering.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createBuildController,
  type BuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { readBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { projectBuildForSurface } from "../../scripts/pathcode-cli/build/surface/product-view.mjs";
import { projectEngineeringActivity } from "../../scripts/pathcode-cli/build/surface/engineering-activity.mjs";
import { frameEngineerObjective } from "../../scripts/pathcode-cli/build/objectives.mjs";
import {
  previewFrameSrc,
  shouldAcceptViewRevision,
} from "../../scripts/pathcode-cli/build/surface/public/view-revision.js";

function baseBuild(overrides: Record<string, unknown> = {}): BuildRecord {
  return {
    buildId: "b-truth",
    loop: { status: "running", pendingReinspect: false },
    intent: { outcome: "A product", outcomeRevision: 1, explicitRequirements: [] },
    outcomeCriteria: [],
    projectBindings: [{ bindingId: "x", projectRoot: "/tmp/product", originKind: "build-created" }],
    children: [],
    hypotheses: {},
    authoritativeSha: undefined,
    conversation: [],
    adoptionHistory: [],
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
    ...overrides,
  } as unknown as BuildRecord;
}

describe("S5 truthful Build projection", () => {
  it("shows a brief phase instead of Applying changes, then an engineer phase", () => {
    const brief = projectBuildForSurface(
      baseBuild({
        children: [
          {
            kind: "brief",
            taskId: "brief-1",
            dispatchState: "dispatched",
            intentRevision: 1,
          },
        ],
      }),
      { preview: { status: "ready" }, runtime: { status: "ready" } },
    );
    expect(brief.progressLabel).toMatch(/Understanding request/i);
    expect(brief.progressLabel).not.toMatch(/Applying changes/i);

    const engineer = projectBuildForSurface(
      baseBuild({
        authoritativeSha: "abc123",
        intent: { outcome: "A product", outcomeRevision: 2, explicitRequirements: [] },
        children: [
          {
            kind: "engineer",
            taskId: "eng-0",
            dispatchState: "consumed",
            adoptedSha: "abc123",
            intentRevision: 1,
          },
          {
            kind: "engineer",
            taskId: "eng-1",
            dispatchState: "dispatched",
            provider: "cursor",
            intentRevision: 2,
          },
        ],
      }),
      { preview: { status: "ready" }, runtime: { status: "ready" } },
    );
    expect(engineer.progressLabel).toMatch(/Applying changes/i);
    expect(engineer.engineeringActivity?.engine).toBe("cursor");
  });

  it("does not treat an empty first tree as a product error while the build is running", () => {
    const view = projectBuildForSurface(
      baseBuild({
        children: [
          { kind: "engineer", taskId: "eng-1", dispatchState: "dispatched", intentRevision: 1 },
        ],
      }),
      {
        runtime: { status: "unavailable", reason: "no_preview_capability" },
      },
    );
    expect(view.progressLabel).toMatch(/Engineering/i);
    expect(view.uiState).not.toBe("error");

    const idle = projectBuildForSurface(baseBuild({ loop: { status: "paused" } }), {
      runtime: { status: "unavailable", reason: "no_preview_capability" },
    });
    expect(idle.progressLabel).toBe("Paused");
  });

  it("projects task-trace steps and the selected engine without secrets", () => {
    const activity = projectEngineeringActivity(
      baseBuild({
        children: [
          {
            kind: "engineer",
            taskId: "eng-1",
            dispatchState: "dispatched",
            intentRevision: 1,
          },
        ],
      }),
      {
        projectRoot: "/tmp/product",
        checkpoint: { latestEngineTurn: "in_flight:cursor", worktreePath: "/tmp/product/wt" },
        traceLines: [
          { t: "1", type: "session.task.received", meta: { status: "running" } },
          {
            t: "2",
            type: "session.engineering.tool",
            tool: "create_file",
            path: "/tmp/product/wt/index.html",
            meta: { status: "running" },
          },
          {
            t: "3",
            type: "session.engineering.tool",
            tool: "run_command",
            command: "npm test",
            exitCode: 0,
            meta: { status: "running" },
          },
          {
            t: "4",
            type: "session.engineering.tool",
            tool: "run_command",
            command: "curl -H 'Authorization: Bearer supersecret-token'",
            meta: { status: "running" },
          },
          {
            t: "5",
            type: "session.engineering.tool",
            tool: "run_command",
            command: "cat /Users/someone/.copilot/config.json",
            meta: { status: "running" },
          },
          {
            t: "6",
            type: "session.engineering.tool",
            tool: "run_command",
            command: "cd /private/tmp/path-s5/ag1-tasks/abc && npm test",
            exitCode: 0,
            meta: { status: "running" },
          },
        ],
      },
    );
    expect(activity.engine).toBe("cursor");
    expect(activity.steps.map((step) => step.label)).toEqual([
      "engineer dispatched",
      "created index.html",
      "test passed",
      "running a command",
      "test passed",
    ]);
    expect(JSON.stringify(activity)).not.toMatch(/supersecret|Bearer |\/Users\/|\.copilot|\/private\/tmp/);
    expect(activity.steps[3]?.command).toBe("[redacted command]");
    expect(activity.steps[4]?.command).toBe("cd [path] && npm test");
  });

  it("rejects an older view revision and accepts a newer trace revision", () => {
    expect(shouldAcceptViewRevision(-1, 1_000_000)).toBe(true);
    expect(shouldAcceptViewRevision(5_000_004, 5_000_003)).toBe(false);
    expect(shouldAcceptViewRevision(5_000_004, 5_000_005)).toBe(true);
    expect(previewFrameSrc("http://127.0.0.1:7822/preview/build/", "abc123")).toBe(
      "http://127.0.0.1:7822/preview/build/?rev=abc123",
    );
    expect(previewFrameSrc("http://127.0.0.1:7822/preview/build", "")).toBe(
      "http://127.0.0.1:7822/preview/build/",
    );
  });

  it("keeps an explicit website request on the current brief and out of Applying", async () => {
    const dir = mkdtempSync(join(tmpdir(), "path-web-follow-"));
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
          return { ok: true, taskId: "t" };
        },
        async awaitTask() {
          return {};
        },
        snapshotTask() {
          return null;
        },
        async cancelTask() {
          return { ok: true };
        },
      },
    });
    const started = await controller.startBuild(
      "Critical details on the lock screen before every second counts.",
      { targetDir: target, originKind: "build-created" },
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(readBuildRecord(runtimeRoot, started.build.buildId)?.productBrief?.productKind).toBe(
      "unknown",
    );
    const applied = await controller.applyConversation(started.build.buildId, {
      message: "create a website that explains why this matters",
    });
    expect(applied.ok).toBe(true);
    const after = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(after?.productBrief?.productKind).toBe("web");
    expect(after?.productBrief?.stale).toBe(true);
    const rev = after?.intent.outcomeRevision;
    const rows = (after?.conversation || []).filter((msg) => msg.intentRevision === rev && msg.kind !== "outcome");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((msg) => msg.status !== "being_applied" && msg.status !== "applying" && msg.status !== "applied")).toBe(true);
    expect(rows.some((msg) => msg.role === "user" && /website/i.test(msg.text || ""))).toBe(true);
    expect(rows.some((msg) => /Understanding that request/i.test(msg.text || ""))).toBe(false);
    const objective = frameEngineerObjective(after, after?.hypotheses?.proposedNextAction || "");
    expect(objective).toMatch(/Product kind: web/);
    expect(objective).toMatch(/website/i);
    const view = projectBuildForSurface(after, { events: [] });
    expect(view.creatorPhase).toBe("understanding");
    expect(view.progressLabel).not.toMatch(/Applying changes/i);
    rmSync(dir, { recursive: true, force: true });
  });
});
