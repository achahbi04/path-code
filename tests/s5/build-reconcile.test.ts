/**
 * S5 — Build child reconciliation + cognitive result regressions.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  decideChildReconciliation,
  isTaskTerminal,
} from "../../scripts/pathcode-cli/build/reconcile.mjs";
import {
  parseBuildCognitiveResult,
  cognitiveResultToDirectives,
} from "../../scripts/pathcode-cli/build/cognitive-result.mjs";
import { createBuildController } from "../../scripts/pathcode-cli/build/index.mjs";
import { writeTaskCheckpoint } from "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";

describe("S5 Build child reconciliation", () => {
  it("treats VERIFIED checkpoint as terminal", () => {
    expect(
      isTaskTerminal({ finalState: "VERIFIED" }, null, ""),
    ).toBe(true);
    expect(
      isTaskTerminal({ finalState: "running" }, null, ""),
    ).toBe(false);
  });

  it("reconciles dispatched child with VERIFIED checkpoint to consume", async () => {
    const dir = mkdtempSync(join(tmpdir(), "path-recon-"));
    const runtimeRoot = join(dir, "rt");
    mkdirSync(join(runtimeRoot, "metadata", "tasks"), { recursive: true });
    const target = join(dir, "site");
    mkdirSync(target);

    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask() {
          return { ok: true, taskId: "t-eval" };
        },
        async awaitTask() {
          return { status: "verified", classification: "VERIFIED" };
        },
        snapshotTask() {
          return { status: "verified", classification: "VERIFIED" };
        },
      },
    });

    const started = await controller.startBuild("Build a tiny marker service", {
      targetDir: target,
      originKind: "build-created",
      initialCriteria: [
        { id: "c-runnable", statement: "runnable", required: true },
        { id: "c-outcome", statement: "outcome", required: true },
      ],
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const build = started.build;
    const taskId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    build.children.push({
      kind: "evaluate",
      taskId,
      actionId: "evaluate:test",
      bindingId: build.projectBindings[0].bindingId,
      dispatchState: "dispatched",
      dispatchedAt: new Date().toISOString(),
      selectedAt: new Date().toISOString(),
    });
    const { writeBuildRecord } = await import(
      "../../scripts/pathcode-cli/build/record.mjs"
    );
    writeBuildRecord(runtimeRoot, build);

    writeTaskCheckpoint(runtimeRoot, {
      taskId,
      finalState: "VERIFIED",
      validation: { classification: "VERIFIED" },
      sha: "abc",
    });

    const recon = await controller.reconcileBuildChildren(build.buildId);
    expect(recon.ok).toBe(true);
    const child = recon.build.children.find((c) => c.taskId === taskId);
    expect(child.dispatchState).toBe("consumed");

    rmSync(dir, { recursive: true, force: true });
  });

  it("decideChildReconciliation marks orphan dispatched without checkpoint", () => {
    const decision = decideChildReconciliation({
      child: {
        dispatchState: "dispatched",
        dispatchedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      },
      cp: null,
      snap: null,
      reportText: "",
      nowMs: Date.now(),
    });
    expect(decision.action).toBe("mark_terminal_and_consume");
    expect(decision.orphan).toBe(true);
  });

  it("conversation steer supersedes active evaluate and forces engineer next", async () => {
    const dir = mkdtempSync(join(tmpdir(), "path-steer-"));
    const runtimeRoot = join(dir, "rt");
    mkdirSync(join(runtimeRoot, "metadata", "tasks"), { recursive: true });
    const target = join(dir, "site");
    mkdirSync(target);
    /** @type {string[]} */
    const cancelled = [];

    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask() {
          return { ok: true, taskId: "t-new" };
        },
        async awaitTask() {
          return { status: "verified", classification: "VERIFIED" };
        },
        snapshotTask() {
          return { status: "running" };
        },
        async cancelTask(taskId) {
          cancelled.push(taskId);
          return { ok: true };
        },
      },
    });

    const started = await controller.startBuild("Build a website for ICE", {
      targetDir: target,
      originKind: "build-created",
      initialCriteria: [
        { id: "c-runnable", statement: "runnable", required: true },
        { id: "c-outcome", statement: "outcome", required: true },
      ],
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const { writeBuildRecord, readBuildRecord } = await import(
      "../../scripts/pathcode-cli/build/record.mjs"
    );
    const build = started.build;
    const evalId = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
    build.children.push({
      kind: "evaluate",
      taskId: evalId,
      actionId: "evaluate:stuck",
      bindingId: build.projectBindings[0].bindingId,
      dispatchState: "dispatched",
      dispatchedAt: new Date().toISOString(),
      selectedAt: new Date().toISOString(),
    });
    build.loop.status = "running";
    writeBuildRecord(runtimeRoot, build);

    const applied = await controller.applyConversation(build.buildId, {
      message: "Make the ICE hero dark navy.",
    });
    expect(applied.ok).toBe(true);
    expect(cancelled).toContain(evalId);

    const after = readBuildRecord(runtimeRoot, build.buildId);
    const evalChild = after.children.find((c) => c.taskId === evalId);
    expect(evalChild.dispatchState).toBe("consumed");
    expect(after.loop.forceNextKind).toBe("engineer");
    expect(after.loop.pendingConversationSteer).toBe(true);
    expect(after.hypotheses.proposedNextAction).toMatch(/dark navy/i);

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("S5 structured cognitive results", () => {
  it("parses evaluation JSON and rejects authoritativeRevision mismatch", () => {
    const report = `
Some prose
\`\`\`path-build-evaluation
{
  "version": 1,
  "buildId": "b1",
  "intentRevision": 2,
  "authoritativeRevision": "sha-wrong",
  "criteria": [
    { "criterionId": "c-runnable", "status": "PROVEN", "evidenceRefs": [], "reason": "ok" }
  ]
}
\`\`\`
`;
    const parsed = parseBuildCognitiveResult(report, {
      expectedBuildId: "b1",
      expectedIntentRevision: 2,
      expectedAuthoritativeRevision: "sha-right",
    });
    expect(parsed.errors).toContain("authoritativeRevision_mismatch");
    expect(parsed.structured).toBe(null);
  });

  it("accepts matching structured evaluation", () => {
    const report = `
\`\`\`path-build-evaluation
{
  "version": 1,
  "buildId": "b1",
  "intentRevision": 1,
  "authoritativeRevision": "sha1",
  "criteria": [
    { "criterionId": "c-x", "status": "PROVEN", "evidenceRefs": ["dom"], "reason": "visible" }
  ],
  "requirements": []
}
\`\`\`
`;
    const parsed = parseBuildCognitiveResult(report, {
      expectedBuildId: "b1",
      expectedIntentRevision: 1,
      expectedAuthoritativeRevision: "sha1",
    });
    expect(parsed.structured).toBeTruthy();
    const dirs = cognitiveResultToDirectives(parsed);
    expect(dirs[0]).toMatchObject({ id: "c-x", status: "PROVEN", source: "structured" });
  });

  it("falls back to prose CRITERION lines", () => {
    const parsed = parseBuildCognitiveResult(
      "CRITERION c-runnable: PROVEN — tests pass\n",
      {},
    );
    expect(parsed.ok).toBe(true);
    const dirs = cognitiveResultToDirectives(parsed);
    expect(dirs.some((d) => d.id === "c-runnable" && d.status === "PROVEN")).toBe(
      true,
    );
  });
});
