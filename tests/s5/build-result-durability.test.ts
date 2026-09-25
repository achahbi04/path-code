/**
 * S5 — durable engineer result survives task-worktree disposal.
 *
 * The bicycle qualification task 9ce8be8c committed a website, then session
 * cleanup removed the checkout before adoption. Filesystem detection of that
 * missing checkout returns capability "none". Adoption must not reuse that
 * signal when a verified commit is already in Git.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  createBuildController,
  detectBuildArtifact,
  gitHeadSha,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { decideEngineerProductAdoption } from "../../scripts/pathcode-cli/build/result-evidence.mjs";
import { adoptionAllowedForIntent } from "../../scripts/pathcode-cli/build/objectives.mjs";
import { writeTaskCheckpoint } from "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";

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

function websiteRepo() {
  const dir = mkdtempSync(join(tmpdir(), "path-durable-result-"));
  const root = join(dir, "project");
  mkdirSync(root);
  git(root, ["init", "--template="]);
  git(root, ["config", "user.email", "path-build@localhost"]);
  git(root, ["config", "user.name", "PATH Build"]);
  writeFileSync(join(root, "README.md"), "origin\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "PATH Build origin"]);
  const originSha = gitHeadSha(root)!;
  const productBranch = "path-build/durable1";
  git(root, ["checkout", "-b", productBranch]);
  const taskId = "9ce8be8c-785f-4d24-9a61-8617c100fa55";
  const taskBranch = `path/task-${taskId}`;
  git(root, ["checkout", "-b", taskBranch]);
  writeFileSync(
    join(root, "index.html"),
    "<!doctype html><title>Spoke & Wrench</title><h1>Bicycle repair</h1>\n",
  );
  mkdirSync(join(root, "css"), { recursive: true });
  writeFileSync(join(root, "css", "styles.css"), "body{color:#111}\n");
  git(root, ["add", "index.html", "css/styles.css"]);
  git(root, ["commit", "-m", "Add neighborhood bike repair site"]);
  const resultingSha = gitHeadSha(root)!;
  git(root, ["checkout", productBranch]);
  const gone = join(dir, "gone-worktree");
  return { dir, root, originSha, resultingSha, taskId, taskBranch, productBranch, gone };
}

const webRecord = {
  buildId: "fed8d6de-7746-433c-98a2-4fff0acaad85",
  intent: {
    outcome: "Build a polished public website for a neighborhood bicycle repair shop",
    outcomeRevision: 1,
  },
  productBrief: { productKind: "web", revision: 1 },
};

function verifiedCheckpoint(fixture: ReturnType<typeof websiteRepo>, patch: Record<string, unknown> = {}) {
  return {
    taskId: fixture.taskId,
    finalState: "VERIFIED",
    validation: { classification: "VERIFIED" },
    sha: fixture.resultingSha,
    baseline: fixture.originSha,
    branch: fixture.taskBranch,
    changedFiles: ["index.html", "css/styles.css"],
    worktreePath: fixture.gone,
    ...patch,
  };
}

describe("durable website result after worktree disposal", () => {
  it("keeps a verified website adoptable from Git when the task worktree is already gone", () => {
    const fixture = websiteRepo();
    const legacy = detectBuildArtifact(fixture.gone);
    expect(legacy.preview.capability).toBe("none");
    expect(legacy.signals).toContain("missing_root");
    expect(adoptionAllowedForIntent(webRecord, legacy.preview.capability).ok).toBe(false);

    const decision = decideEngineerProductAdoption({
      record: webRecord,
      child: {
        taskId: fixture.taskId,
        actionId: "engineer:465ffffc212413587468",
        intentRevision: 1,
        kind: "engineer",
      },
      checkpoint: verifiedCheckpoint(fixture),
      projectRoot: fixture.root,
      classification: "VERIFIED",
    });
    expect(decision.adopt).toBe(true);
    expect(decision.code).toBe("ADOPT");
    expect(decision.capability).toBe("web");
    expect(decision.capabilitySource).toBe("git-tree");
    expect(decision.sourceSha).toBe(fixture.resultingSha);

    const sealedAsOrigin = decideEngineerProductAdoption({
      record: webRecord,
      child: {
        taskId: fixture.taskId,
        actionId: "engineer:465ffffc212413587468",
        intentRevision: 1,
        kind: "engineer",
      },
      checkpoint: verifiedCheckpoint(fixture, {
        sha: fixture.originSha,
        productEvidence: {
          capability: "web",
          source: "task-worktree",
          resultingSha: fixture.originSha,
        },
      }),
      projectRoot: fixture.root,
      classification: "VERIFIED",
    });
    expect(sealedAsOrigin.adopt).toBe(true);
    expect(sealedAsOrigin.sourceSha).toBe(fixture.resultingSha);
    expect(sealedAsOrigin.capability).toBe("web");
    expect(sealedAsOrigin.capabilitySource).toBe("git-tree");

    const filesOnly = decideEngineerProductAdoption({
      record: webRecord,
      child: { taskId: fixture.taskId, actionId: "engineer:files", intentRevision: 1 },
      checkpoint: verifiedCheckpoint(fixture, {
        sha: undefined,
        branch: "path/task-00000000-0000-0000-0000-000000000000",
        productEvidence: undefined,
      }),
      projectRoot: fixture.root,
      classification: "VERIFIED",
    });
    expect(filesOnly.adopt).toBe(false);
    expect(filesOnly.code).toBe("EVIDENCE_UNAVAILABLE");
    expect(filesOnly.capability).toBe("unavailable");
    expect(String(filesOnly.reason)).toMatch(/not a finding that no website/i);

    rmSync(fixture.dir, { recursive: true, force: true });
  });

  it("rejects the falsifying adoption cases", () => {
    const fixture = websiteRepo();
    const child = {
      taskId: fixture.taskId,
      actionId: "engineer:465ffffc212413587468",
      intentRevision: 1,
    };
    const base = {
      record: webRecord,
      child,
      projectRoot: fixture.root,
      classification: "VERIFIED",
    };

    expect(
      decideEngineerProductAdoption({
        ...base,
        record: { ...webRecord, buildId: "other-build" },
        checkpoint: verifiedCheckpoint(fixture, {
          productEvidence: { buildId: webRecord.buildId, capability: "web" },
        }),
      }).code,
    ).toBe("WRONG_BUILD");

    expect(
      decideEngineerProductAdoption({
        ...base,
        record: {
          ...webRecord,
          intent: { ...webRecord.intent, outcomeRevision: 2 },
        },
        checkpoint: verifiedCheckpoint(fixture),
      }).code,
    ).toBe("STALE_INTENT");

    git(fixture.root, ["checkout", "-b", "unrelated"]);
    writeFileSync(join(fixture.root, "notes.txt"), "unrelated\n");
    git(fixture.root, ["add", "notes.txt"]);
    git(fixture.root, ["commit", "-m", "unrelated"]);
    const unrelatedSha = gitHeadSha(fixture.root)!;
    git(fixture.root, ["checkout", fixture.productBranch]);
    expect(
      decideEngineerProductAdoption({
        ...base,
        checkpoint: verifiedCheckpoint(fixture, { sha: unrelatedSha }),
      }).code,
    ).toBe("UNRELATED_SHA");

    expect(
      decideEngineerProductAdoption({
        ...base,
        checkpoint: verifiedCheckpoint(fixture, {
          baseline: fixture.resultingSha,
          sha: fixture.originSha,
        }),
      }).code,
    ).toBe("WRONG_ORIGIN");

    expect(
      decideEngineerProductAdoption({
        ...base,
        classification: "NOT_VERIFIED",
        checkpoint: verifiedCheckpoint(fixture, {
          finalState: "FAILED",
          validation: { classification: "NOT_VERIFIED" },
        }),
      }).code,
    ).toBe("FAILED_TASK");

    expect(
      decideEngineerProductAdoption({
        ...base,
        checkpoint: verifiedCheckpoint(fixture, {
          sha: "0123456789abcdef0123456789abcdef01234567",
          worktreePath: fixture.root,
        }),
      }).code,
    ).toBe("NO_DURABLE_RESULT");

    rmSync(fixture.dir, { recursive: true, force: true });
  });

  it("recovers a sealed website after restart when the task worktree is absent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "path-durable-restart-"));
    const runtimeRoot = join(dir, "rt");
    mkdirSync(runtimeRoot);
    const target = join(dir, "bakery");
    mkdirSync(target);
    const gateway = {
      async bindProject() {
        return { ok: true };
      },
      async startTask() {
        return { ok: true, taskId: "brief-task" };
      },
      async awaitTask() {
        return {};
      },
      snapshotTask() {
        return null;
      },
    };
    const controller = createBuildController({ runtimeRoot, gateway });
    const started = await controller.startBuild(
      "Build a small polished website for a neighborhood bakery",
      { targetDir: target, originKind: "build-created" },
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const root = started.projectRoot as string;
    git(root, ["config", "user.email", "path-build@localhost"]);
    git(root, ["config", "user.name", "PATH Build"]);
    const originSha = gitHeadSha(root)!;
    const taskId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const taskBranch = `path/task-${taskId}`;
    git(root, ["checkout", "-b", taskBranch]);
    writeFileSync(
      join(root, "index.html"),
      "<!doctype html><title>Bakery</title><h1>Neighborhood bakery</h1>\n",
    );
    git(root, ["add", "index.html"]);
    git(root, ["commit", "-m", "Add bakery website"]);
    const resultingSha = gitHeadSha(root)!;
    const productBranch = started.build.productBranch || "";
    expect(productBranch).toMatch(/^path-build\//);
    git(root, ["checkout", productBranch]);
    const gone = join(dir, "missing-task-worktree");

    const { readBuildRecord, writeBuildRecord } = await import(
      "../../scripts/pathcode-cli/build/record.mjs"
    );
    const build = readBuildRecord(runtimeRoot, started.build.buildId);
    expect(build).not.toBeNull();
    if (!build) return;
    build.children.push({
      kind: "engineer",
      taskId,
      actionId: "engineer:bakery",
      bindingId: build.projectBindings[0]!.bindingId,
      dispatchState: "dispatched",
      dispatchedAt: new Date().toISOString(),
      selectedAt: new Date().toISOString(),
      intentRevision: build.intent.outcomeRevision,
      provider: "cursor",
    });
    writeBuildRecord(runtimeRoot, build);
    writeTaskCheckpoint(runtimeRoot, {
      taskId,
      worktreePath: gone,
      finalState: "VERIFIED",
      validation: { classification: "VERIFIED" },
      sha: resultingSha,
      baseline: originSha,
      branch: taskBranch,
      changedFiles: ["index.html"],
      productEvidence: {
        capability: "web",
        source: "task-worktree",
        resultingSha,
        sealedAt: new Date().toISOString(),
      },
    });

    const restarted = createBuildController({ runtimeRoot, gateway });
    const recon = await restarted.reconcileBuildChildren(build.buildId);
    expect(recon.ok).toBe(true);
    const child = recon.build.children.find((c) => c.taskId === taskId);
    expect(child?.dispatchState).toBe("consumed");
    expect(child?.adoptedSha).toBeFalsy();
    expect(recon.build.pendingCandidate?.status).toBe("pending");
    expect(recon.build.authoritativeSha || originSha).toBe(originSha);
    const applied = await restarted.applyCandidate(build.buildId);
    expect(applied.ok).toBe(true);
    const adopted = applied.build.children.find((c) => c.taskId === taskId);
    expect(adopted?.adoptedSha).toBeTruthy();
    expect(gitHeadSha(root)).toBe(adopted?.adoptedSha);
    expect(applied.build.authoritativeSha).toBe(adopted?.adoptedSha);
    const tree = git(root, ["ls-tree", "-r", "--name-only", "HEAD"]);
    expect(tree.stdout).toContain("index.html");
    expect(git(root, ["cat-file", "-e", `${resultingSha}^{commit}`]).status).toBe(0);

    rmSync(dir, { recursive: true, force: true });
  });
});
