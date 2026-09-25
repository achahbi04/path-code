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
    expect(String(emptyView.detail || "")).toMatch(
      /Send a new request when you want to continue/i,
    );
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

    // Resume after Discard must stay idle/usable — never Needs attention / blocked.
    const beforeResumeSha = emptyAfter?.authoritativeSha || null;
    const resumed = await emptyLive.resumeBuild(started.build.buildId);
    expect(resumed.ok).toBe(true);
    expect(resumed.awaitCreator).toBe(true);
    const afterResume = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(afterResume?.authoritativeSha || null).toBe(beforeResumeSha);
    expect(afterResume?.loop.status).toBe("paused");
    expect(afterResume?.loop.blockedReason).toBeFalsy();
    expect(afterResume?.pendingCandidate).toBeUndefined();
    const resumeView = projectBuildForSurface(afterResume);
    expect(resumeView.canSteer).toBe(true);
    expect(resumeView.canResume).toBe(false);
    expect(resumeView.uiState).not.toBe("error");
    expect(resumeView.headline).not.toMatch(/Needs attention|Failed/i);
    expect(String(resumeView.blockedReason || "")).not.toMatch(
      /verified durable result/i,
    );
    // Tick must not block or dispatch after Discard.
    const tick = await emptyLive.tick(started.build.buildId);
    expect(tick.blocked).toBeFalsy();
    expect(tick.action).not.toBe("blocked");
    expect(tick.awaitCreator || tick.paused).toBeTruthy();
    const afterTick = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(afterTick?.loop.status).not.toBe("blocked");
    expect(afterTick?.authoritativeSha || null).toBe(beforeResumeSha);
    expect(
      (afterTick?.children || []).filter((child) => child.kind === "engineer").length,
    ).toBe((emptyAfter?.children || []).filter((child) => child.kind === "engineer").length);

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

  it("Discard → Request B → candidate B → Apply once; statuses do not leak across requests", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-discard-continue-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-discard-continue-proj-"));
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
    const authBefore = started.build.authoritativeSha || gitHeadSha(target);
    const ranA = await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    const engineerA = (ranA.build?.children || []).find((child) => child.kind === "engineer");
    const candidateA = ranA.build?.pendingCandidate?.sourceSha;
    expect(candidateA).toBeTruthy();
    const msgA = (ranA.build?.conversation || []).find((message) => message.role === "user");
    expect(msgA?.status).toBe("review");

    const discarded = await controller.discardCandidate(started.build.buildId);
    expect(discarded.ok).toBe(true);
    const afterDiscard = readBuildRecord(runtimeRoot, started.build.buildId)!;
    expect(afterDiscard.pendingCandidate).toBeUndefined();
    expect(afterDiscard.authoritativeSha || null).toBe(authBefore || null);
    expect(afterDiscard.loop.status).toBe("paused");
    expect(
      afterDiscard.conversation?.find((message) => message.id === msgA?.id)?.status,
    ).toBe("discarded");
    expect(
      readLifecycleFromCheckpoint(readTaskCheckpoint(runtimeRoot, engineerA!.taskId)).status,
    ).toBe("DISCARDED");

    const { projectBuildForSurface } = await import(
      "../../scripts/pathcode-cli/build/surface/product-view.mjs"
    );
    // Projection: Request B queued must NOT inherit DISCARDED/APPLIED/FAILED from A.
    const leakProbe = projectBuildForSurface({
      ...afterDiscard,
      intent: { ...afterDiscard.intent, outcomeRevision: 2 },
      conversation: [
        ...(afterDiscard.conversation || []),
        {
          id: "msg-b-queued",
          role: "user",
          text: "add a logo and polish like Apple",
          at: new Date().toISOString(),
          kind: "change",
          status: "queued",
          intentRevision: 2,
        },
      ],
    });
    expect(
      leakProbe.conversation?.find((message) => message.id === msgA?.id)?.status,
    ).toBe("discarded");
    expect(
      leakProbe.conversation?.find((message) => message.id === "msg-b-queued")?.status,
    ).toBe("queued");
    expect(
      leakProbe.conversation?.find((message) => message.id === "msg-b-queued")?.status,
    ).not.toBe("discarded");

    const appliedLeak = projectBuildForSurface({
      ...afterDiscard,
      lastDiscardedCandidate: undefined,
      lastAppliedCandidate: {
        taskId: engineerA!.taskId,
        adoptedSha: candidateA!,
        at: new Date().toISOString(),
      },
      conversation: [
        {
          id: "msg-a-applied",
          role: "user",
          text: "request A",
          at: new Date().toISOString(),
          kind: "outcome",
          status: "applied",
          intentRevision: 1,
        },
        {
          id: "msg-b-new",
          role: "user",
          text: "request B",
          at: new Date().toISOString(),
          kind: "change",
          status: "queued",
          intentRevision: 2,
        },
      ],
      intent: { ...afterDiscard.intent, outcomeRevision: 2 },
      loop: { ...afterDiscard.loop, status: "paused" },
      children: (afterDiscard.children || []).map((child) =>
        child.taskId === engineerA!.taskId
          ? { ...child, adoptedSha: candidateA }
          : child,
      ),
    });
    expect(
      appliedLeak.conversation?.find((message) => message.id === "msg-b-new")?.status,
    ).toBe("queued");
    expect(
      appliedLeak.conversation?.find((message) => message.id === "msg-b-new")?.status,
    ).not.toBe("applied");

    const failedLeak = projectBuildForSurface({
      ...afterDiscard,
      lastDiscardedCandidate: undefined,
      conversation: [
        {
          id: "msg-a-failed",
          role: "user",
          text: "request A failed",
          at: new Date().toISOString(),
          kind: "outcome",
          status: "failed",
          intentRevision: 1,
        },
        {
          id: "msg-b-after-fail",
          role: "user",
          text: "request B after fail",
          at: new Date().toISOString(),
          kind: "change",
          status: "queued",
          intentRevision: 2,
        },
      ],
      intent: { ...afterDiscard.intent, outcomeRevision: 2 },
      loop: { ...afterDiscard.loop, status: "paused" },
    });
    expect(
      failedLeak.conversation?.find((message) => message.id === "msg-b-after-fail")
        ?.status,
    ).toBe("queued");
    expect(
      failedLeak.conversation?.find((message) => message.id === "msg-b-after-fail")
        ?.status,
    ).not.toBe("failed");

    // Re-arm on NEW request B.
    const engineersBefore = (afterDiscard.children || []).filter(
      (child) => child.kind === "engineer",
    ).length;
    const steered = await controller.applyConversation(started.build.buildId, {
      message: "add a logo and polish like Apple",
    });
    expect(steered.ok).toBe(true);
    const afterSteer = readBuildRecord(runtimeRoot, started.build.buildId)!;
    expect(afterSteer.loop.status).toBe("running");
    expect(afterSteer.intent.outcomeRevision).toBe(2);
    const msgB = (afterSteer.conversation || []).find(
      (message) =>
        message.role === "user" &&
        String(message.text || "").includes("add a logo"),
    );
    expect(msgB).toBeTruthy();
    expect(msgB?.intentRevision).toBe(2);
    expect(msgB?.status).not.toBe("discarded");
    expect(
      afterSteer.conversation?.find((message) => message.id === msgA?.id)?.status,
    ).toBe("discarded");
    expect(afterSteer.lastDiscardedCandidate?.taskId).toBe(engineerA!.taskId);
    expect(afterSteer.authoritativeSha || null).toBe(authBefore || null);

    const viewB = projectBuildForSurface(afterSteer);
    expect(
      viewB.conversation?.find((message) => message.id === msgB?.id)?.status,
    ).not.toBe("discarded");

    const ranB = await controller.runUntilDone(started.build.buildId, { maxSteps: 10 });
    expect(ranB.build?.pendingCandidate?.status).toBe("pending");
    expect(ranB.build?.pendingCandidate?.intentRevision).toBe(2);
    expect(ranB.build?.authoritativeSha || null).toBe(authBefore || null);
    const engineersAfter = (ranB.build?.children || []).filter(
      (child) => child.kind === "engineer",
    );
    expect(engineersAfter.length).toBe(engineersBefore + 1);
    const engineerB = engineersAfter[engineersAfter.length - 1];
    expect(engineerB?.intentRevision).toBe(2);
    expect(engineerB?.taskId).not.toBe(engineerA!.taskId);
    const viewReview = projectBuildForSurface(ranB.build);
    expect(viewReview.canApply).toBe(true);
    expect(viewReview.canDiscard).toBe(true);
    expect(
      viewReview.conversation?.find((message) => message.id === msgB?.id)?.status,
    ).toBe("review");
    expect(
      viewReview.conversation?.find((message) => message.id === msgA?.id)?.status,
    ).toBe("discarded");

    const appliedB = await controller.applyCandidate(started.build.buildId);
    expect(appliedB.ok).toBe(true);
    expect(appliedB.deduped).toBeFalsy();
    const afterApply = readBuildRecord(runtimeRoot, started.build.buildId)!;
    expect(afterApply.authoritativeSha).toBe(ranB.build?.pendingCandidate?.sourceSha || appliedB.build?.authoritativeSha);
    expect(afterApply.authoritativeSha).not.toBe(authBefore);
    expect(afterApply.pendingCandidate).toBeUndefined();
    expect((afterApply.adoptionHistory || []).length).toBe(1);
    expect(
      afterApply.conversation?.find((message) => message.id === msgB?.id)?.status,
    ).toBe("applied");
    expect(
      afterApply.conversation?.find((message) => message.id === msgA?.id)?.status,
    ).toBe("discarded");
    expect(
      readLifecycleFromCheckpoint(readTaskCheckpoint(runtimeRoot, engineerA!.taskId)).status,
    ).toBe("DISCARDED");
    const secondApply = await controller.applyCandidate(started.build.buildId);
    expect(secondApply.deduped).toBe(true);
    expect((readBuildRecord(runtimeRoot, started.build.buildId)?.adoptionHistory || []).length).toBe(1);
    expect(
      (readBuildRecord(runtimeRoot, started.build.buildId)?.children || []).filter(
        (child) => child.kind === "engineer",
      ).length,
    ).toBe(engineersAfter.length);

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 120_000);

  it("one creator request projects as one card: orphan QUEUED cannot survive Apply", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-history-truth-rt-"));
    const target = mkdtempSync(join(tmpdir(), "path-history-truth-proj-"));
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
    await controller.discardCandidate(started.build.buildId);

    // First B attempt (queued / orphaned when a corrected B follows).
    await controller.applyConversation(started.build.buildId, {
      message: "add a logo to the dark-mode homepage, plolish it like an apple website",
    });
    const afterB1 = readBuildRecord(runtimeRoot, started.build.buildId)!;
    const msgB1 = (afterB1.conversation || []).find((message) =>
      String(message.text || "").includes("plolish"),
    );
    expect(msgB1?.status).toBeTruthy();
    expect(msgB1?.status).not.toBe("discarded");

    // Corrected B — advances revision; orphan B1 must not stay visible as QUEUED.
    await controller.applyConversation(started.build.buildId, {
      message: "add a logo to the dark-mode homepage, polish it like an apple website",
    });
    const afterB2 = readBuildRecord(runtimeRoot, started.build.buildId)!;
    expect(afterB2.intent.outcomeRevision).toBeGreaterThan(2);
    expect(
      afterB2.conversation?.find((message) => message.id === msgB1?.id)?.status,
    ).toBe("superseded");
    const msgB2 = (afterB2.conversation || []).find((message) =>
      String(message.text || "").includes("polish it like an apple"),
    );
    expect(msgB2?.id).not.toBe(msgB1?.id);

    const { projectBuildForSurface } = await import(
      "../../scripts/pathcode-cli/build/surface/product-view.mjs"
    );
    const earlyView = projectBuildForSurface(afterB2);
    const logoCards = (earlyView.conversation || []).filter((message) =>
      /add a logo/i.test(String(message.text || "")),
    );
    expect(logoCards).toHaveLength(1);
    expect(logoCards[0]?.id).toBe(msgB2?.id);
    expect(logoCards[0]?.status).not.toBe("discarded");

    const ran = await controller.runUntilDone(started.build.buildId, { maxSteps: 10 });
    expect(ran.build?.pendingCandidate?.status).toBe("pending");
    const applied = await controller.applyCandidate(started.build.buildId);
    expect(applied.ok).toBe(true);

    const final = readBuildRecord(runtimeRoot, started.build.buildId)!;
    expect(final.authoritativeSha).toBeTruthy();
    expect(final.pendingCandidate).toBeUndefined();
    expect((final.adoptionHistory || []).length).toBe(1);
    expect(final.conversation?.find((message) => message.id === msgB1?.id)?.status).toBe(
      "superseded",
    );
    expect(final.conversation?.find((message) => message.id === msgB2?.id)?.status).toBe(
      "applied",
    );
    expect(
      final.conversation?.find((message) => message.role === "user" && message.intentRevision === 1)
        ?.status,
    ).toBe("discarded");

    const view = projectBuildForSurface(final);
    const visibleLogo = (view.conversation || []).filter((message) =>
      /add a logo/i.test(String(message.text || "")),
    );
    expect(visibleLogo).toHaveLength(1);
    expect(visibleLogo[0]?.status).toBe("applied");
    expect(visibleLogo[0]?.id).toBe(msgB2?.id);
    expect(
      view.conversation?.find((message) =>
        /Create a dark-mode homepage/i.test(String(message.text || "")),
      )?.status,
    ).toBe("discarded");

    // Reload / recover must not resurrect QUEUED B1.
    const recovered = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: fakeGateway(),
    });
    await recovered.recover(started.build.buildId);
    const afterReload = readBuildRecord(runtimeRoot, started.build.buildId)!;
    const reloadView = projectBuildForSurface(afterReload);
    expect(
      (reloadView.conversation || []).filter((message) =>
        /add a logo/i.test(String(message.text || "")),
      ),
    ).toHaveLength(1);
    expect(
      reloadView.conversation?.find((message) =>
        /add a logo/i.test(String(message.text || "")),
      )?.status,
    ).toBe("applied");
    expect(afterReload.conversation?.find((message) => message.id === msgB1?.id)?.status).toBe(
      "superseded",
    );

    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 120_000);
});
