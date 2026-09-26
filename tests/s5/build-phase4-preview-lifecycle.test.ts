/**
 * Phase 4 — Preview + lifecycle truth falsification.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createBuildController,
  createBuildRecordSkeleton,
  lifecycleActivityAtFor,
  projectLastGoodPreview,
  readBuildRecord,
  writeBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import {
  creatorStatusLabel,
  libraryRow,
} from "../../scripts/pathcode-cli/build/surface/project-library.mjs";
import { projectBuildForSurface } from "../../scripts/pathcode-cli/build/surface/product-view.mjs";
import {
  previewFrameSrc,
  previewTransition,
} from "../../scripts/pathcode-cli/build/surface/public/view-revision.js";

function fakeGateway() {
  return {
    async bindProject() {
      return { ok: true };
    },
    async startTask() {
      return { ok: true };
    },
    async awaitTask() {
      return {};
    },
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Phase 4 preview + lifecycle truth", () => {
  it("last-good preview survives recover/restart projection", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p4-lg-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-p4-lg-proj-"));
    try {
      const controller = createBuildController({
        runtimeRoot,
        fakeMode: true,
        gateway: fakeGateway(),
      });
      const started = await controller.startBuild("Build a marker page", {
        targetDir: target,
      });
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      const ran = await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
      expect(ran.awaitingReview).toBe(true);
      const applied = await controller.applyCandidate(started.build.buildId);
      expect(applied.ok).toBe(true);
      const afterApply = readBuildRecord(runtimeRoot, started.build.buildId);
      expect(afterApply?.lastGoodPreview?.sha).toBeTruthy();
      expect(afterApply?.lastGoodPreview?.embedPath).toBe(
        `/preview/${started.build.buildId}/`,
      );
      const appliedSha = afterApply?.authoritativeSha;
      expect(appliedSha).toBeTruthy();

      // Simulate a failed/new candidate while applied product remains.
      afterApply!.pendingCandidate = {
        status: "pending",
        taskId: "cand-fail",
        sourceSha: "deadbeef",
        requestText: "break it",
      };
      afterApply!.loop.status = "awaiting_review";
      writeBuildRecord(runtimeRoot, afterApply!);

      const recovered = await controller.recover(started.build.buildId);
      expect(recovered.ok).toBe(true);
      const afterRecover = readBuildRecord(runtimeRoot, started.build.buildId);
      expect(afterRecover?.lastGoodPreview?.sha).toBe(appliedSha);
      expect(afterRecover?.authoritativeSha).toBe(appliedSha);

      const view = projectBuildForSurface(afterRecover, {
        preview: { status: "failed" },
        runtime: { status: "failed", reason: "exited" },
      });
      expect(view.lastGoodPreview?.sha).toBe(appliedSha);
      expect(view.creatorStatus).toBe("Ready to review");
      expect(view.progressLabel).toBe("Ready to review");

      // Client hold: failed next must not erase durable last-good.
      const durable = previewFrameSrc(
        view.lastGoodPreview!.embedPath,
        view.lastGoodPreview!.sha,
      );
      const held = previewTransition({
        heldSrc: durable,
        nextReady: false,
        nextSrc: "",
        nextFailed: true,
        preparing: false,
      });
      expect(held.action).toBe("hold");
      expect(held.src).toBe(durable);
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("failed/non-ready work cannot erase last-good applied preview field", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p4-erase-rt-"));
    try {
      const record = createBuildRecordSkeleton({ outcome: "site" });
      record.authoritativeSha = "aaa111";
      record.lastAppliedCandidate = {
        taskId: "t1",
        adoptedSha: "aaa111",
        at: "2026-01-01T00:00:00.000Z",
      };
      record.lastGoodPreview = {
        embedPath: `/preview/${record.buildId}/`,
        sha: "aaa111",
        at: "2026-01-01T00:00:00.000Z",
      };
      record.loop.status = "paused";
      writeBuildRecord(runtimeRoot, record);

      // Persistence write from recover-like path must not clear last-good.
      const loaded = readBuildRecord(runtimeRoot, record.buildId)!;
      loaded.loop.status = "paused";
      loaded.runtimeHealth = "failed";
      loaded.previewUrl = null;
      writeBuildRecord(runtimeRoot, loaded);

      const again = readBuildRecord(runtimeRoot, record.buildId)!;
      expect(again.lastGoodPreview?.sha).toBe("aaa111");
      expect(projectLastGoodPreview(again)?.sha).toBe("aaa111");

      // Pending failed candidate still projects last-good.
      again.pendingCandidate = {
        status: "pending",
        taskId: "t2",
        sourceSha: "bbb222",
      };
      again.loop.status = "awaiting_review";
      expect(projectLastGoodPreview(again)?.sha).toBe("aaa111");
      expect(creatorStatusLabel(again)).toBe("Ready to review");
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  it("candidate pending shows Ready to review; applied shows Ready", () => {
    const pending = {
      buildId: "b-review",
      loop: { status: "awaiting_review" },
      pendingCandidate: { status: "pending", sourceSha: "c1" },
      authoritativeSha: "a1",
      lastAppliedCandidate: { adoptedSha: "a1", at: "2026-01-01T00:00:00.000Z" },
      intent: { outcome: "site", outcomeRevision: 2 },
      children: [],
    };
    expect(creatorStatusLabel(pending)).toBe("Ready to review");
    const pendingView = projectBuildForSurface(pending, {});
    expect(pendingView.progressLabel).toBe("Ready to review");
    expect(pendingView.creatorStatus).toBe("Ready to review");
    expect(pendingView.headline).not.toBe("Ready");

    const applied = {
      buildId: "b-ready",
      loop: { status: "complete" },
      authoritativeSha: "a1",
      lastAppliedCandidate: { adoptedSha: "a1", at: "2026-01-01T00:00:00.000Z" },
      lastGoodPreview: {
        embedPath: "/preview/b-ready/",
        sha: "a1",
        at: "2026-01-01T00:00:00.000Z",
      },
      intent: { outcome: "site", outcomeRevision: 1 },
      children: [],
    };
    expect(creatorStatusLabel(applied)).toBe("Ready");
    const readyView = projectBuildForSurface(applied, {
      preview: { status: "ready" },
      runtime: { status: "ready" },
    });
    expect(readyView.progressLabel).toBe("Ready");
    expect(readyView.creatorStatus).toBe("Ready");
    expect(readyView.lastGoodPreview?.sha).toBe("a1");
  });

  it("failure requiring creator attention shows Needs attention", () => {
    const blocked = {
      buildId: "b-block",
      loop: { status: "blocked", blockedReason: "empty product" },
      intent: { outcome: "site", outcomeRevision: 1 },
      children: [],
    };
    expect(creatorStatusLabel(blocked)).toBe("Needs attention");
    expect(projectBuildForSurface(blocked, {}).progressLabel).toBe("Needs attention");

    const failedPaused = {
      buildId: "b-fail",
      loop: { status: "paused" },
      intent: { outcome: "site", outcomeRevision: 1 },
      children: [
        {
          kind: "engineer",
          classification: "FAILED",
          dispatchState: "consumed",
        },
      ],
    };
    expect(creatorStatusLabel(failedPaused)).toBe("Needs attention");
    const view = projectBuildForSurface(failedPaused, {});
    expect(view.progressLabel).toBe("Needs attention");
    expect(view.creatorStatus).toBe("Needs attention");
  });

  it("paused build recover does not make rail activity time become just now", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p4-rail-rt-"));
    try {
      const pausedAt = "2026-03-01T12:00:00.000Z";
      const record = createBuildRecordSkeleton({ outcome: "paused site" });
      record.loop.status = "paused";
      record.loop.pausedAt = pausedAt;
      record.lifecycleActivityAt = pausedAt;
      writeBuildRecord(runtimeRoot, record);

      const before = readBuildRecord(runtimeRoot, record.buildId)!;
      expect(lifecycleActivityAtFor(before)).toBe(pausedAt);
      const rowBefore = libraryRow(before);
      expect(rowBefore.activityAt).toBe(pausedAt);

      await sleep(20);
      const controller = createBuildController({
        runtimeRoot,
        fakeMode: true,
        gateway: fakeGateway(),
      });
      const recovered = await controller.recover(record.buildId);
      expect(recovered.ok).toBe(true);

      const after = readBuildRecord(runtimeRoot, record.buildId)!;
      // Persistence clock may move; activity clock must not.
      expect(after.updatedAt).not.toBe(pausedAt);
      expect(after.lifecycleActivityAt).toBe(pausedAt);
      expect(lifecycleActivityAtFor(after)).toBe(pausedAt);
      expect(libraryRow(after).activityAt).toBe(pausedAt);
      expect(creatorStatusLabel(after)).toBe("Paused");
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  it("legacy paused records without lifecycleActivityAt still use pausedAt not updatedAt", () => {
    const pausedAt = "2025-12-01T08:00:00.000Z";
    const build = {
      buildId: "legacy",
      createdAt: "2025-11-01T00:00:00.000Z",
      updatedAt: new Date().toISOString(),
      loop: { status: "paused", pausedAt },
      intent: { outcome: "old", outcomeRevision: 1 },
    };
    expect(lifecycleActivityAtFor(build)).toBe(pausedAt);
    expect(libraryRow(build).activityAt).toBe(pausedAt);
  });

  it("Ready never appears while candidate pending or preview preparing", () => {
    const pending = projectBuildForSurface(
      {
        buildId: "b",
        loop: { status: "awaiting_review" },
        pendingCandidate: { status: "pending", sourceSha: "x" },
        authoritativeSha: "a",
        intent: { outcome: "site", outcomeRevision: 1 },
        children: [],
      },
      { preview: { status: "ready" }, runtime: { status: "ready" } },
    );
    expect(pending.progressLabel).toBe("Ready to review");
    expect(pending.creatorStatus).toBe("Ready to review");

    const preparing = projectBuildForSurface(
      {
        buildId: "b2",
        loop: { status: "running", pendingRuntimeRefresh: true },
        authoritativeSha: "a",
        lastAppliedCandidate: { adoptedSha: "a", at: "2026-01-01T00:00:00.000Z" },
        intent: { outcome: "site", outcomeRevision: 1 },
        children: [],
      },
      { preview: { status: "ready" }, runtime: { status: "ready" } },
    );
    expect(preparing.progressLabel).toBe("Updating preview…");
    expect(preparing.creatorStatus).toBe("Building");
  });
});
