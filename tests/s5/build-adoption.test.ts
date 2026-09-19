/**
 * S5 — Build product adoption + visual completion regressions.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  ensureBuildProductBranch,
  adoptEngineerResultIntoBuild,
  createBuildController,
  gitHeadSha,
} from "../../scripts/pathcode-cli/build/index.mjs";

function git(cwd, args, env = {}) {
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
      ...env,
    },
  });
}

describe("S5 Build authoritative adoption", () => {
  it("merges path/task-* into path-build branch and updates HEAD", () => {
    const root = mkdtempSync(join(tmpdir(), "path-adopt-"));
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-adopt-rt-"));
    git(root, ["init", "--template="]);
    const productBranch = "path-build/test01";
    const seeded = ensureBuildProductBranch({
      projectRoot: root,
      productBranch,
    });
    expect(seeded.ok).toBe(true);
    const before = gitHeadSha(root);

    // Simulate engineer task branch with a file change
    const taskBranch = "path/task-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    git(root, ["checkout", "-b", taskBranch]);
    writeFileSync(join(root, "index.html"), "<h1>ICE</h1>\n");
    git(root, ["add", "index.html"]);
    git(root, ["commit", "-m", "engineer: add ice site"]);
    const sourceSha = gitHeadSha(root);
    git(root, ["checkout", productBranch]);

    const adopted = adoptEngineerResultIntoBuild({
      runtimeRoot,
      buildId: "build-test",
      projectRoot: root,
      productBranch,
      taskId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      taskBranch,
      sourceSha,
    });
    expect(adopted.ok).toBe(true);
    expect(adopted.mode).toBe("merge");
    expect(adopted.adoptedSha).toBeTruthy();
    expect(adopted.adoptedSha).not.toBe(before);
    expect(adopted.sourceSha).toBe(sourceSha);

    rmSync(root, { recursive: true, force: true });
    rmSync(runtimeRoot, { recursive: true, force: true });
  });

  it("visual completion requires browser evidence when not fake", async () => {
    const dir = mkdtempSync(join(tmpdir(), "path-vis-complete-"));
    const runtimeRoot = join(dir, "rt");
    mkdirSync(runtimeRoot);
    const target = join(dir, "site");
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: false,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask() {
          return { ok: true, taskId: "t" };
        },
      },
    });
    const started = await controller.startBuild(
      "Build a professional website for ICE",
      { targetDir: target, originKind: "build-created" },
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const build = started.build;
    for (const c of build.outcomeCriteria) c.status = "PROVEN";
    build.authoritativeSha = "abc123";
    build.loop.pendingReinspect = false;
    build.children = [
      {
        kind: "evaluate",
        taskId: "e1",
        dispatchState: "consumed",
        classification: "VERIFIED",
        selectedAt: build.intent.revisedAt,
        bindingId: build.projectBindings[0].bindingId,
        actionId: "evaluate:1",
      },
      {
        kind: "challenge",
        taskId: "c1",
        dispatchState: "consumed",
        classification: "VERIFIED",
        selectedAt: build.intent.revisedAt,
        bindingId: build.projectBindings[0].bindingId,
        actionId: "challenge:1",
      },
    ];
    const { writeBuildRecord } = await import(
      "../../scripts/pathcode-cli/build/record.mjs"
    );
    writeBuildRecord(runtimeRoot, build);
    let assessment = controller.assessCompletion(build.buildId);
    expect(assessment.complete).toBe(false);
    expect(assessment.reason).toMatch(/browser_evidence|preview/);

    controller.patchRuntimeState(build.buildId, {
      previewUrl: "http://127.0.0.1:4173/",
      runtimeHealth: "ok",
      browserEvidence: {
        ok: true,
        authoritativeSha: "abc123",
        htmlPath: "/tmp/x.html",
      },
      clearRuntimeRefresh: true,
    });
    assessment = controller.assessCompletion(build.buildId);
    expect(assessment.complete).toBe(true);

    // Stale browser evidence SHA cannot satisfy completion
    controller.patchRuntimeState(build.buildId, {
      browserEvidence: {
        ok: true,
        authoritativeSha: "stale-old-sha",
        htmlPath: "/tmp/stale.html",
      },
    });
    assessment = controller.assessCompletion(build.buildId);
    expect(assessment.complete).toBe(false);
    expect(assessment.reason).toBe("browser_evidence_stale_revision");

    rmSync(dir, { recursive: true, force: true });
  });

  it("cannot COMPLETE before required derived criteria close", async () => {
    const dir = mkdtempSync(join(tmpdir(), "path-vis-gate-"));
    const runtimeRoot = join(dir, "rt");
    mkdirSync(runtimeRoot);
    const target = join(dir, "site");
    const controller = createBuildController({
      runtimeRoot,
      fakeMode: false,
      gateway: {
        async bindProject() {
          return { ok: true };
        },
        async startTask() {
          return { ok: true, taskId: "t" };
        },
      },
    });
    const started = await controller.startBuild(
      "Build a professional website for ICE with hero and emergency value",
      { targetDir: target, originKind: "build-created" },
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const build = started.build;
    // Only generic criteria proven — derived must remain open
    for (const c of build.outcomeCriteria) {
      if (c.id === "c-runnable" || c.id === "c-outcome") c.status = "PROVEN";
      else c.status = "UNKNOWN";
    }
    build.loop.pendingReinspect = false;
    build.authoritativeSha = "sha1";
    build.previewUrl = "http://127.0.0.1:1/";
    build.runtimeHealth = "ok";
    const { writeBuildRecord } = await import(
      "../../scripts/pathcode-cli/build/record.mjs"
    );
    writeBuildRecord(runtimeRoot, build);
    const assessment = controller.assessCompletion(build.buildId);
    expect(assessment.complete).toBe(false);
    expect(assessment.reason).not.toBeUndefined();

    rmSync(dir, { recursive: true, force: true });
  });
});
