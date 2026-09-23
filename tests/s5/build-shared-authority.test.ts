/**
 * S5 shared authority.
 *
 * A verified durable engineer result is adopted and the request is ready.
 * Evaluate and challenge do not dispatch another edit.
 * A fabric-supplied multi-step plan is coordinated without being treated as a retry.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  createBuildController,
  gitHeadSha,
  readBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { decideEngineerProductAdoption } from "../../scripts/pathcode-cli/build/result-evidence.mjs";

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "PATH Build",
      GIT_AUTHOR_EMAIL: "path-build@localhost",
      GIT_COMMITTER_NAME: "PATH Build",
      GIT_COMMITTER_EMAIL: "path-build@localhost",
    },
  });
}

function ctaRepo() {
  const dir = mkdtempSync(join(tmpdir(), "path-shared-cta-"));
  const root = join(dir, "project");
  mkdirSync(root);
  git(root, ["init", "--template="]);
  git(root, ["checkout", "-b", "path-build/shared"]);
  writeFileSync(
    join(root, "index.html"),
    "<!doctype html><a class=\"btn-secondary\" href=\"#how-to-use\">See how ICE works</a>\n",
  );
  git(root, ["add", "index.html"]);
  git(root, ["commit", "-m", "origin"]);
  const originSha = gitHeadSha(root)!;
  const taskId = "2963c6d8-5fc6-46ee-92c8-a4fff59ac63d";
  const taskBranch = `path/task-${taskId}`;
  git(root, ["checkout", "-b", taskBranch]);
  writeFileSync(
    join(root, "index.html"),
    "<!doctype html><a class=\"btn-secondary\" href=\"#how-to-use\">Learn how ICE works</a>\n",
  );
  git(root, ["add", "index.html"]);
  git(root, ["commit", "-m", "Learn how ICE works"]);
  const resultingSha = gitHeadSha(root)!;
  return { dir, root, originSha, resultingSha, taskId, taskBranch };
}

const gateway = {
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

describe("shared authority", () => {
  it("adopts a durable CTA commit when the provider closes after the edit", () => {
    const fixture = ctaRepo();
    const decision = decideEngineerProductAdoption({
      record: {
        buildId: "dcca5ffb-f748-4778-bc91-876ac8ae0176",
        intent: {
          outcome: "Change the secondary CTA text from See how ICE works to Learn how ICE works",
          outcomeRevision: 6,
        },
        productBrief: { productKind: "web" },
      },
      child: {
        taskId: fixture.taskId,
        actionId: "engineer:cta",
        intentRevision: 6,
      },
      projectRoot: fixture.root,
      classification: "FAILED",
      checkpoint: {
        taskId: fixture.taskId,
        finalState: "FAILED",
        validation: { classification: "FAILED", disposition: "ENGINE_ERROR" },
        sha: fixture.resultingSha,
        baseline: fixture.originSha,
        branch: fixture.taskBranch,
        changedFiles: ["index.html"],
        worktreePath: join(fixture.dir, "missing-worktree"),
      },
    });
    expect(decision.adopt).toBe(true);
    expect(decision.code).toBe("ADOPT");
    expect(decision.recoveredProviderClose).toBe(true);
    expect(decision.sourceSha).toBe(fixture.resultingSha);
    rmSync(fixture.dir, { recursive: true, force: true });
  });

  it("adopts a durable commit when PATH found no further checks to run", () => {
    const fixture = ctaRepo();
    const decision = decideEngineerProductAdoption({
      record: {
        buildId: "c5eb72cb-015e-45ef-b7ac-d185e716f626",
        intent: {
          outcome: "Change the secondary CTA text",
          outcomeRevision: 2,
        },
        productBrief: { productKind: "web" },
      },
      child: {
        taskId: fixture.taskId,
        actionId: "engineer:cta-checks",
        intentRevision: 2,
      },
      projectRoot: fixture.root,
      classification: "NOT_VERIFIED",
      reportText:
        "Not completed\n  No admissible validation candidates for final checks.\n",
      checkpoint: {
        taskId: fixture.taskId,
        finalState: "FAILED",
        validation: { classification: "NOT_VERIFIED", disposition: "NOT_VERIFIED" },
        sha: fixture.resultingSha,
        baseline: fixture.originSha,
        branch: fixture.taskBranch,
        changedFiles: ["index.html"],
        worktreePath: join(fixture.dir, "missing-worktree"),
      },
    });
    expect(decision.adopt).toBe(true);
    expect(decision.recoveredEmptyDiscovery).toBe(true);
    expect(decision.sourceSha).toBe(fixture.resultingSha);
    rmSync(fixture.dir, { recursive: true, force: true });
  });

  it("stops after one verified engineer result without evaluate or a second edit", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-shared-loop-"));
    const target = mkdtempSync(join(tmpdir(), "path-shared-proj-"));
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway,
    });
    const started = await controller.startBuild(
      "Change the secondary CTA text from See how ICE works to Learn how ICE works. Do not change anything else.",
      {
        targetDir: target,
        initialCriteria: [
          { id: "c-runnable", statement: "runnable", required: true },
          { id: "c-outcome", statement: "outcome", required: true },
          { id: "c-cta", statement: "secondary CTA says Learn how ICE works", required: true },
        ],
      },
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const ran = await controller.runUntilDone(started.build.buildId, { maxSteps: 8 });
    expect(ran.done).toBe(true);
    const record = readBuildRecord(runtimeRoot, started.build.buildId);
    const kinds = (record?.children || []).map((child) => child.kind);
    expect(kinds.filter((kind) => kind === "engineer")).toHaveLength(1);
    expect(kinds).not.toContain("evaluate");
    expect(kinds).not.toContain("challenge");
    const engineer = record?.children?.find((child) => child.kind === "engineer");
    expect(engineer?.classification).toMatch(/VERIFIED/i);
    expect(engineer?.adoptedSha).toBeTruthy();
    expect(record?.authoritativeSha).toBe(engineer?.adoptedSha);
    expect(record?.loop.status).toBe("complete");
    expect(record?.outcomeCriteria?.some((item) => item.status !== "PROVEN")).toBe(true);
    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 60_000);

  it("coordinates a fabric plan and does not add a semantic pass after the last step", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-shared-plan-"));
    const target = mkdtempSync(join(tmpdir(), "path-shared-plan-proj-"));
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway,
    });
    const started = await controller.startBuild("Add authentication", {
      targetDir: target,
      initialCriteria: [
        { id: "c-runnable", statement: "runnable", required: true },
        { id: "c-outcome", statement: "outcome", required: true },
      ],
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const record = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(record).toBeTruthy();
    if (!record) return;
    record.loop.fabricSteps = [
      "Add the account schema",
      "Add the session API",
      "Add the sign-in page",
    ];
    const { writeBuildRecord } = await import("../../scripts/pathcode-cli/build/record.mjs");
    writeBuildRecord(runtimeRoot, record);
    const ran = await controller.runUntilDone(started.build.buildId, { maxSteps: 10 });
    expect(ran.done).toBe(true);
    const after = readBuildRecord(runtimeRoot, started.build.buildId);
    const engineers = (after?.children || []).filter((child) => child.kind === "engineer");
    expect(engineers).toHaveLength(3);
    expect(engineers.map((child) => child.objective)).toEqual([
      expect.stringContaining("Add the account schema"),
      expect.stringContaining("Add the session API"),
      expect.stringContaining("Add the sign-in page"),
    ]);
    expect((after?.children || []).some((child) => child.kind === "evaluate")).toBe(false);
    expect((after?.children || []).some((child) => child.kind === "challenge")).toBe(false);
    expect(engineers[2]?.adoptedSha).toBeTruthy();
    expect(after?.loop.status).toBe("complete");
    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 60_000);

  it("pause settles the boundary and does not dispatch more engineering", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-shared-pause-"));
    const target = mkdtempSync(join(tmpdir(), "path-shared-pause-proj-"));
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: true,
      gateway,
    });
    const started = await controller.startBuild("Build a small page", {
      targetDir: target,
      initialCriteria: [
        { id: "c-runnable", statement: "runnable", required: true },
        { id: "c-outcome", statement: "outcome", required: true },
      ],
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const paused = await controller.pauseBuild(started.build.buildId);
    expect(paused.ok).toBe(true);
    const step = await controller.tick(started.build.buildId);
    expect(step.paused).toBe(true);
    expect(step.action).toBe("paused");
    const record = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(record?.loop.status).toBe("paused");
    expect(record?.children || []).toHaveLength(0);
    rmSync(runtimeRoot, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }, 60_000);
});
