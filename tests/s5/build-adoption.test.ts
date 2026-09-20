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
import {
  adoptTaskResult,
  readLifecycleFromCheckpoint,
} from "../../scripts/pathcode-cli/result-lifecycle.mjs";
import { readTaskCheckpoint } from "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";

function git(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
) {
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
  it("uses the same MERGED lifecycle truth as PATH Code adoption", () => {
    const dir = mkdtempSync(join(tmpdir(), "path-shared-adopt-"));
    const runtimeRoot = join(dir, "rt");
    mkdirSync(runtimeRoot);

    const makeResult = (name: string, productBranch: string) => {
      const root = join(dir, name);
      mkdirSync(root);
      git(root, ["init", "--template="]);
      git(root, ["config", "user.email", "shared@path.local"]);
      git(root, ["config", "user.name", "Shared Adopt"]);
      writeFileSync(join(root, "README.md"), "base\n");
      git(root, ["add", "README.md"]);
      git(root, ["commit", "-m", "base"]);
      git(root, ["checkout", "-b", productBranch]);
      const taskId = `${name}-aaaa-bbbb-cccc-ddddeeee0001`;
      const branch = `path/task-${taskId}`;
      git(root, ["checkout", "-b", branch]);
      writeFileSync(join(root, `${name}.txt`), `${name}\n`);
      git(root, ["add", "."]);
      git(root, ["commit", "-m", `${name} result`]);
      const sha = gitHeadSha(root)!;
      git(root, ["checkout", productBranch]);
      return { root, taskId, branch, sha };
    };

    const code = makeResult("code", "main-product");
    const codeAdopted = adoptTaskResult({
      runtimeRoot,
      projectRoot: code.root,
      sourceRef: code.branch,
      requireAdoptable: true,
      entry: {
        taskId: code.taskId,
        branch: code.branch,
        sha: code.sha,
        changedFiles: ["code.txt"],
      },
    });
    expect(codeAdopted.ok).toBe(true);

    const build = makeResult("build", "path-build/shared");
    const buildAdopted = adoptEngineerResultIntoBuild({
      runtimeRoot,
      buildId: "build-shared",
      projectRoot: build.root,
      productBranch: "path-build/shared",
      taskId: build.taskId,
      taskBranch: build.branch,
      sourceSha: build.sha,
    });
    expect(buildAdopted.ok).toBe(true);

    for (const taskId of [code.taskId, build.taskId]) {
      expect(
        readLifecycleFromCheckpoint(
          readTaskCheckpoint(runtimeRoot, taskId),
        ).status,
      ).toBe("MERGED");
    }
    expect(
      adoptTaskResult({
        runtimeRoot,
        projectRoot: code.root,
        sourceRef: code.branch,
        entry: {
          taskId: code.taskId,
          branch: code.branch,
          changedFiles: ["code.txt"],
        },
      }).code,
    ).toBe("ALREADY_MERGED");
    expect(
      adoptEngineerResultIntoBuild({
        runtimeRoot,
        buildId: "build-shared",
        projectRoot: build.root,
        productBranch: "path-build/shared",
        taskId: build.taskId,
        taskBranch: build.branch,
        sourceSha: build.sha,
      }).code,
    ).toBe("ALREADY_MERGED");

    rmSync(dir, { recursive: true, force: true });
  });

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

  it("refuses empty adoption when engineer SHA is missing from Build repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "path-empty-adopt-"));
    const runtimeRoot = join(dir, "rt");
    mkdirSync(runtimeRoot);
    const root = join(dir, "project");
    mkdirSync(root);
    git(root, ["init", "--template="]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    writeFileSync(join(root, ".gitignore"), "\n");
    git(root, ["add", ".gitignore"]);
    git(root, ["commit", "-m", "origin"]);
    const productBranch = "path-build/empty01";
    git(root, ["checkout", "-b", productBranch]);
    const taskBranch = "path/task-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    git(root, ["checkout", "-b", taskBranch]);
    // Task branch stays at origin; sourceSha invents a nested-repo commit.
    const fakeSha = "0123456789abcdef0123456789abcdef01234567";
    git(root, ["checkout", productBranch]);

    const adopted = adoptEngineerResultIntoBuild({
      runtimeRoot,
      buildId: "build-empty",
      projectRoot: root,
      productBranch,
      taskId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      taskBranch,
      sourceSha: fakeSha,
      worktreePath: join(dir, "missing-wt"),
    });
    expect(adopted.ok).toBe(false);
    expect(String(adopted.code)).toMatch(/SOURCE_SHA|EMPTY/);

    rmSync(dir, { recursive: true, force: true });
  });

  it("requires a branchless engineer SHA to already be in product HEAD", () => {
    const dir = mkdtempSync(join(tmpdir(), "path-branchless-adopt-"));
    const runtimeRoot = join(dir, "rt");
    mkdirSync(runtimeRoot);
    const root = join(dir, "project");
    mkdirSync(root);
    git(root, ["init", "--template="]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    writeFileSync(join(root, "README.md"), "base\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "base"]);
    const productBranch = "path-build/branchless";
    git(root, ["checkout", "-b", productBranch]);
    const productSha = gitHeadSha(root)!;

    git(root, ["checkout", "-b", "unrelated-result"]);
    writeFileSync(join(root, "result.txt"), "not adopted\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "unrelated result"]);
    const sourceSha = gitHeadSha(root)!;
    git(root, ["checkout", productBranch]);

    const rejected = adoptEngineerResultIntoBuild({
      runtimeRoot,
      buildId: "build-branchless",
      projectRoot: root,
      productBranch,
      taskId: "branchless-task",
      sourceSha,
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.code).toBe("SOURCE_NOT_ADOPTED");

    const accepted = adoptEngineerResultIntoBuild({
      runtimeRoot,
      buildId: "build-branchless",
      projectRoot: root,
      productBranch,
      taskId: "branchless-task",
      sourceSha: productSha,
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.mode).toBe("already_adopted");
    expect(accepted.adoptedSha).toBe(productSha);

    rmSync(dir, { recursive: true, force: true });
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
        semanticProofAccepted: true,
        intentRevision: build.intent.outcomeRevision,
        authoritativeSha: "abc123",
        selectedAt: build.intent.revisedAt,
        bindingId: build.projectBindings[0]!.bindingId,
        actionId: "evaluate:1",
      },
      {
        kind: "challenge",
        taskId: "c1",
        dispatchState: "consumed",
        classification: "VERIFIED",
        semanticProofAccepted: true,
        intentRevision: build.intent.outcomeRevision,
        authoritativeSha: "abc123",
        selectedAt: build.intent.revisedAt,
        bindingId: build.projectBindings[0]!.bindingId,
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
