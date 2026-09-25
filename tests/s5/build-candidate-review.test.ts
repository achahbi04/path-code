/**
 * Phase 2 — creator candidate review (Apply / Discard) complete matrix.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  createBuildController,
  gitHeadSha,
  readBuildRecord,
  writeBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { engineeringReportExists } from "../../scripts/pathcode-cli/engineering-report.mjs";
import { readLifecycleFromCheckpoint } from "../../scripts/pathcode-cli/result-lifecycle.mjs";
import { readTaskCheckpoint } from "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";
import {
  previewTransition,
  shouldAcceptBuildView,
  shouldAcceptViewRevision,
} from "../../scripts/pathcode-cli/build/surface/public/view-revision.js";

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

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

function assertNoAdoptInConsume() {
  const src = readFileSync(
    new URL("../../scripts/pathcode-cli/build/controller.mjs", import.meta.url),
    "utf8",
  );
  const consumeStart = src.indexOf("async function consumeChildResult");
  const applyStart = src.indexOf("async function applyCandidate");
  expect(consumeStart).toBeGreaterThan(-1);
  expect(applyStart).toBeGreaterThan(consumeStart);
  expect(src.slice(consumeStart, applyStart)).not.toContain("adoptEngineerResultIntoBuild");
  expect(src.slice(applyStart, src.indexOf("async function discardCandidate"))).toContain(
    "adoptEngineerResultIntoBuild",
  );
}

describe("creator candidate review", () => {
  it("A/B/E: VERIFIED stays candidate; SHA unchanged; status is review not FAILED", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-candidate-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-candidate-proj-"));
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
    const beforeSha = started.build.authoritativeSha || gitHeadSha(target);
    const ran = await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    expect(ran.awaitingReview).toBe(true);
    expect(ran.build?.loop.status).toBe("awaiting_review");
    expect(ran.build?.pendingCandidate?.status).toBe("pending");
    expect(ran.build?.pendingCandidate?.sourceSha).toBeTruthy();
    expect(ran.build?.authoritativeSha || null).toBe(beforeSha || null);
    expect(gitHeadSha(target)).toBe(beforeSha);
    expect(existsSync(join(target, "package.json"))).toBe(false);
    const engineer = (ran.build?.children || []).find((child) => child.kind === "engineer");
    expect(engineer?.classification).toMatch(/VERIFIED/i);
    expect(engineer?.adoptedSha).toBeFalsy();
    expect(
      ran.build?.conversation?.find((message) => message.role === "user")?.status,
    ).toBe("review");
    assertNoAdoptInConsume();

    const { projectBuildForSurface } = await import(
      "../../scripts/pathcode-cli/build/surface/product-view.mjs"
    );
    const view = projectBuildForSurface(ran.build);
    expect(view.canApply).toBe(true);
    expect(view.canDiscard).toBe(true);
    expect(view.candidatePreview?.embedPath).toContain("/preview-candidate/");
    expect(view.conversation?.find((message) => message.role === "user")?.status).toBe("review");
    expect(view.headline).toBe("Review this result");

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 60_000);

  it("C/D/E/I: Discard clears candidate, keeps SHA, never FAILED, restart stays discarded", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-discard-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-discard-proj-"));
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
    const beforeSha = started.build.authoritativeSha || gitHeadSha(target);
    const ran = await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    const engineer = (ran.build?.children || []).find((child) => child.kind === "engineer");
    const candidateSha = ran.build?.pendingCandidate?.sourceSha;
    expect(candidateSha).toBeTruthy();

    const discarded = await controller.discardCandidate(started.build.buildId);
    expect(discarded.ok).toBe(true);
    const afterDiscard = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(afterDiscard?.authoritativeSha || null).toBe(beforeSha || null);
    expect(afterDiscard?.pendingCandidate).toBeUndefined();
    expect(afterDiscard?.loop.status).toBe("paused");
    expect(afterDiscard?.lastDiscardedCandidate?.taskId).toBe(engineer!.taskId);
    expect(
      afterDiscard?.conversation?.find((message) => message.role === "user")?.status,
    ).toBe("discarded");
    const life = readLifecycleFromCheckpoint(
      readTaskCheckpoint(runtimeRoot, engineer!.taskId),
    );
    expect(life.status).toBe("DISCARDED");
    expect(engineeringReportExists(engineer!.taskId, runtimeRoot)).toBe(true);
    expect(
      git(target, [
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/path/task-${engineer!.taskId}`,
      ]).status,
    ).toBe(0);
    // First-product / empty authoritative tree — candidate files must not be on disk.
    expect(existsSync(join(target, "package.json"))).toBe(false);
    expect(existsSync(join(target, "index.html"))).toBe(false);

    const { projectBuildForSurface } = await import(
      "../../scripts/pathcode-cli/build/surface/product-view.mjs"
    );
    const view = projectBuildForSurface(afterDiscard);
    expect(view.candidatePreview).toBeNull();
    expect(view.canApply).toBe(false);
    expect(view.conversation?.find((message) => message.role === "user")?.status).toBe(
      "discarded",
    );
    expect(view.headline).not.toMatch(/Failed/i);
    expect(view.headline).toBe("Paused");
    // Empty authoritative product after Discard is not a preview failure.
    const emptyView = projectBuildForSurface(afterDiscard, {
      runtime: {
        status: "unavailable",
        reason: "no_preview_capability",
      },
    });
    expect(emptyView.uiState).toBe("paused");
    expect(emptyView.headline).not.toMatch(/Preview unavailable|Failed/i);
    expect(String(emptyView.detail || "")).toMatch(/No applied product exists yet/i);
    expect(String(emptyView.detail || "")).not.toMatch(/no_preview_capability/i);

    const awaitingView = projectBuildForSurface(
      { ...afterDiscard!, runtimeHealth: "awaiting_product" },
      { runtime: { status: "awaiting_product", reason: "empty_tree" } },
    );
    expect(awaitingView.uiState).toBe("paused");
    expect(awaitingView.headline).not.toMatch(/Failed|unavailable/i);

    // Non-fake first-product Discard parks on awaiting_product (no engine).
    const emptyLive = createBuildController({
      runtimeRoot,
      fakeMode: false,
      gateway: fakeGateway(),
    });
    const staged = readBuildRecord(runtimeRoot, started.build.buildId)!;
    staged.pendingCandidate = {
      status: "pending",
      taskId: engineer!.taskId,
      actionId: "engineer:restage",
      intentRevision: staged.intent.outcomeRevision,
      sourceSha: candidateSha || null,
      taskBranch: `path/task-${engineer!.taskId}`,
      worktreePath: target,
      files: ["index.html"],
      requestText: "restage",
      createdAt: new Date().toISOString(),
    };
    staged.loop.status = "awaiting_review";
    delete staged.lastDiscardedCandidate;
    writeBuildRecord(runtimeRoot, staged);
    const emptyDiscard = await emptyLive.discardCandidate(started.build.buildId);
    expect(emptyDiscard.ok).toBe(true);
    const emptyAfter = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(emptyAfter?.runtimeHealth).toBe("awaiting_product");
    expect(emptyAfter?.loop.pendingRuntimeRefresh).toBe(false);
    expect(emptyAfter?.previewUrl == null).toBe(true);

    // Historical FAILED label recovers from S2 discarded + lastDiscardedCandidate.
    const storedFailed = {
      ...afterDiscard!,
      conversation: (afterDiscard!.conversation || []).map((message) => ({
        ...message,
        status: "failed",
      })),
    };
    const recoveredView = projectBuildForSurface(storedFailed);
    expect(recoveredView.conversation?.find((message) => message.role === "user")?.status).toBe(
      "discarded",
    );

    // Preview hold must not keep discarded candidate.
    const leak = previewTransition({
      heldSrc: `/preview-candidate/${started.build.buildId}/?rev=${candidateSha}`,
      nextReady: false,
      nextSrc: "",
      preparing: false,
      allowCandidateHold: false,
    });
    expect(leak.action).toBe("empty");
    expect(leak.src).toBe("");

    const restarted = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: fakeGateway(),
    });
    const recovered = await restarted.recover(started.build.buildId);
    expect(recovered.ok).toBe(true);
    const afterRestart = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(afterRestart?.pendingCandidate).toBeUndefined();
    expect(afterRestart?.lastDiscardedCandidate?.sourceSha).toBe(candidateSha);
    expect(afterRestart?.authoritativeSha || null).toBe(beforeSha || null);
    expect(
      readLifecycleFromCheckpoint(readTaskCheckpoint(runtimeRoot, engineer!.taskId)).status,
    ).toBe("DISCARDED");

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 60_000);

  it("C prior product: Discard restores authoritative tree and clears candidate preview", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-discard-prior-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-discard-prior-proj-"));
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
    await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    const firstApply = await controller.applyCandidate(started.build.buildId);
    expect(firstApply.ok).toBe(true);
    const authoritative = firstApply.build?.authoritativeSha;
    expect(authoritative).toBeTruthy();
    expect(existsSync(join(target, "index.html"))).toBe(true);

    const taskId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const taskBranch = `path/task-${taskId}`;
    git(target, ["checkout", "-B", taskBranch]);
    writeFileSync(join(target, "index.html"), "<!doctype html><title>candidate-b</title>\n");
    git(target, ["add", "index.html"]);
    git(target, [
      "-c",
      "user.name=PATH Build",
      "-c",
      "user.email=path-build@localhost",
      "commit",
      "-m",
      "candidate B",
    ]);
    const candidateSha = gitHeadSha(target)!;
    expect(candidateSha).not.toBe(authoritative);
    git(target, ["checkout", "--force", started.build.productBranch || `path-build/${started.build.buildId.slice(0, 8)}`]);
    expect(gitHeadSha(target)).toBe(authoritative);

    const { writeTaskCheckpoint, createCheckpointSkeleton } = await import(
      "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs"
    );
    writeTaskCheckpoint(
      runtimeRoot,
      createCheckpointSkeleton({
        taskId,
        worktreePath: target,
        finalState: "VERIFIED",
        validation: { classification: "VERIFIED" },
        sha: candidateSha,
        branch: taskBranch,
        changedFiles: ["index.html"],
      }),
    );
    const record = readBuildRecord(runtimeRoot, started.build.buildId)!;
    record.children.push({
      kind: "engineer",
      taskId,
      actionId: "engineer:candidate-b",
      bindingId: record.projectBindings[0]!.bindingId,
      dispatchState: "consumed",
      consumedAt: new Date().toISOString(),
      intentRevision: record.intent.outcomeRevision,
      classification: "VERIFIED",
      sourceSha: candidateSha || null,
    });
    record.pendingCandidate = {
      status: "pending",
      taskId,
      actionId: "engineer:candidate-b",
      intentRevision: record.intent.outcomeRevision,
      sourceSha: candidateSha || null,
      taskBranch,
      worktreePath: target,
      files: ["index.html"],
      requestText: "Change the title only",
      createdAt: new Date().toISOString(),
    };
    record.loop.status = "awaiting_review";
    writeBuildRecord(runtimeRoot, record);

    const discarded = await controller.discardCandidate(started.build.buildId);
    expect(discarded.ok).toBe(true);
    const after = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(after?.authoritativeSha).toBe(authoritative);
    expect(after?.pendingCandidate).toBeUndefined();
    expect(gitHeadSha(target)).toBe(authoritative);
    expect(readFileSync(join(target, "index.html"), "utf8")).not.toContain("candidate-b");
    expect(
      readLifecycleFromCheckpoint(readTaskCheckpoint(runtimeRoot, taskId)).status,
    ).toBe("DISCARDED");
    const { projectBuildForSurface } = await import(
      "../../scripts/pathcode-cli/build/surface/product-view.mjs"
    );
    expect(projectBuildForSurface(after).candidatePreview).toBeNull();
    expect(
      projectBuildForSurface(after).conversation?.every(
        (message) => message.status !== "failed",
      ),
    ).toBe(true);

    // Non-fake Discard must request authoritative runtime restore when product exists.
    const liveController = createBuildController({
      runtimeRoot,
      fakeMode: false,
      gateway: fakeGateway(),
    });
    const again = readBuildRecord(runtimeRoot, started.build.buildId)!;
    again.pendingCandidate = {
      status: "pending",
      taskId,
      actionId: "engineer:candidate-b2",
      intentRevision: again.intent.outcomeRevision,
      sourceSha: candidateSha || null,
      taskBranch,
      worktreePath: target,
      files: ["index.html"],
      requestText: "Change the title only again",
      createdAt: new Date().toISOString(),
    };
    again.loop.status = "awaiting_review";
    writeBuildRecord(runtimeRoot, again);
    const discardLive = await liveController.discardCandidate(started.build.buildId);
    expect(discardLive.ok).toBe(true);
    const afterLive = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(afterLive?.authoritativeSha).toBe(authoritative);
    expect(afterLive?.pendingCandidate).toBeUndefined();
    expect(afterLive?.loop.pendingRuntimeRefresh).toBe(true);
    expect(existsSync(join(target, "index.html"))).toBe(true);
    expect(readFileSync(join(target, "index.html"), "utf8")).not.toContain("candidate-b");

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 90_000);

  it("F/G/H/J: Apply once; second Apply deduped; restart pending then applied", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-apply-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-apply-proj-"));
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
    const beforeSha = started.build.authoritativeSha || gitHeadSha(target);
    const ran = await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    const candidateSha = ran.build?.pendingCandidate?.sourceSha;
    expect(candidateSha).toBeTruthy();

    const mid = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: fakeGateway(),
    });
    const recovered = await mid.recover(started.build.buildId);
    expect(recovered.ok).toBe(true);
    const held = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(held?.pendingCandidate?.status).toBe("pending");
    expect(held?.pendingCandidate?.sourceSha).toBe(candidateSha);
    expect(held?.authoritativeSha || null).toBe(beforeSha || null);
    const resumed = await mid.resumeBuild(started.build.buildId);
    expect(resumed.awaitingReview).toBe(true);

    const applied = await mid.applyCandidate(started.build.buildId);
    expect(applied.ok).toBe(true);
    expect(applied.deduped).toBeFalsy();
    expect(applied.build?.authoritativeSha).toBeTruthy();
    expect(applied.build?.authoritativeSha).not.toBe(beforeSha);
    expect(applied.build?.pendingCandidate).toBeUndefined();
    expect((applied.build?.adoptionHistory || []).length).toBe(1);
    expect(existsSync(join(target, "package.json"))).toBe(true);

    const again = await mid.applyCandidate(started.build.buildId);
    expect(again.ok).toBe(true);
    expect(again.deduped).toBe(true);
    expect(again.build?.authoritativeSha).toBe(applied.build?.authoritativeSha);
    expect((again.build?.adoptionHistory || []).length).toBe(1);

    const afterApply = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: fakeGateway(),
    });
    await afterApply.recover(started.build.buildId);
    const final = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(final?.pendingCandidate).toBeUndefined();
    expect(final?.authoritativeSha).toBe(applied.build?.authoritativeSha);
    expect(final?.lastAppliedCandidate?.adoptedSha).toBe(applied.build?.authoritativeSha);

    const finished = await afterApply.runUntilDone(started.build.buildId, { maxSteps: 6 });
    expect(finished.done).toBe(true);
    expect(finished.build?.loop.status).toBe("complete");

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 60_000);

  it("K/L: selected Build view wins; stored failed recovers to review when pending", async () => {
    expect(
      shouldAcceptBuildView({
        previousBuildId: "build-a",
        nextBuildId: "build-b",
        previousRevision: 22_000_000,
        nextRevision: 1_000_000,
      }),
    ).toBe(true);
    expect(
      shouldAcceptBuildView({
        previousBuildId: "build-a",
        nextBuildId: "build-a",
        previousRevision: 5_000_004,
        nextRevision: 5_000_003,
      }),
    ).toBe(false);
    expect(shouldAcceptViewRevision(5_000_004, 5_000_005)).toBe(true);

    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-view-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-view-proj-"));
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
    await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    const record = readBuildRecord(runtimeRoot, started.build.buildId);
    const { projectBuildForSurface } = await import(
      "../../scripts/pathcode-cli/build/surface/product-view.mjs"
    );
    const storedFailed = {
      ...record!,
      conversation: (record!.conversation || []).map((message) => ({
        ...message,
        status: "failed",
      })),
    };
    const recovered = projectBuildForSurface(storedFailed);
    expect(recovered.conversation?.find((message) => message.role === "user")?.status).toBe(
      "review",
    );
    expect(recovered.headline).toBe("Review this result");
    expect(recovered.projectRoot).toBeTruthy();
    expect(recovered.candidatePreview?.embedPath).toContain("/preview-candidate/");

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 60_000);
});
