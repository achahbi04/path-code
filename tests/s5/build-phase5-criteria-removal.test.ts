/**
 * Phase 5 — remove manufactured outcome-criteria ceremony.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createBuildController,
  readBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { projectBuildForSurface } from "../../scripts/pathcode-cli/build/surface/product-view.mjs";

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

describe("Phase 5 remove generic criteria layer", () => {
  it("startBuild does not manufacture outcomeCriteria from the brief", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p5-start-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-p5-start-proj-"));
    try {
      const controller = createBuildController({
        runtimeRoot,
        fakeMode: true,
        gateway: fakeGateway(),
      });
      const started = await controller.startBuild(
        "Build a polished dark-mode homepage with a hero and CTA",
        { targetDir: target },
      );
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      expect(started.build.outcomeCriteria).toEqual([]);
      // Brief may still describe the product — it is not product-facing criteria.
      expect(started.build.productBrief?.acceptanceCriteria?.length).toBeGreaterThan(0);
      const view = projectBuildForSurface(started.build);
      expect(view.criteria).toEqual([]);
      expect(view.criteriaSummary?.total).toBe(0);
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("follow-up revision produces no criteria in the record and no criteria in the view", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p5-follow-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-p5-follow-proj-"));
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
      const buildId = started.build.buildId;
      expect(readBuildRecord(runtimeRoot, buildId)?.outcomeCriteria).toEqual([]);

      const ran = await controller.runUntilDone(buildId, { maxSteps: 8 });
      expect(ran.awaitingReview).toBe(true);
      expect(readBuildRecord(runtimeRoot, buildId)?.outcomeCriteria).toEqual([]);

      const applied = await controller.applyCandidate(buildId);
      expect(applied.ok).toBe(true);
      expect(readBuildRecord(runtimeRoot, buildId)?.outcomeCriteria).toEqual([]);

      const steered = await controller.applyConversation(buildId, {
        message: "Make the headline larger and darker",
      });
      expect(steered.ok).toBe(true);
      const afterSteer = readBuildRecord(runtimeRoot, buildId)!;
      expect(afterSteer.outcomeCriteria).toEqual([]);
      expect(afterSteer.intent.outcomeRevision).toBeGreaterThan(1);

      const view = projectBuildForSurface(afterSteer, {
        preview: { status: "ready" },
        runtime: { status: "ready" },
      });
      expect(view.criteria).toEqual([]);
      expect(view.criteriaProjection?.project?.total).toBe(0);
      expect(JSON.stringify(view)).not.toMatch(/Outcome verification/i);
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("creator drawer markup no longer contains Outcome verification", () => {
    const src = readFileSync(
      new URL("../../scripts/pathcode-cli/build/surface/public/app.js", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/Outcome verification/);
    expect(src).toMatch(/Phase 5: no manufactured criteria ceremony/);
  });

  it("controller no longer promotes brief acceptanceCriteria into outcomeCriteria", () => {
    const src = readFileSync(
      new URL("../../scripts/pathcode-cli/build/controller.mjs", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/briefToOutcomeCriteria\(/);
    expect(src).toMatch(/Phase 5: do not manufacture outcomeCriteria/);
    expect(src).not.toMatch(
      /Seed criteria from evaluate if empty[\s\S]{0,200}c-runnable/,
    );
  });
});
