/**
 * S2.2 — result lifecycle (discard + PR) focused proofs.
 */
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it, afterEach } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRATCH = join(CHECKOUT, ".path-code-tmp", "s2-lifecycle-test");

async function load(rel: string) {
  return import(
    `${pathToFileURL(join(CHECKOUT, "scripts/pathcode-cli", rel)).href}?s22=${randomUUID()}`
  );
}

/** Strip inherited git env so nested fixtures never attach to PATH's worktree. */
function gitEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extra,
    GIT_TERMINAL_PROMPT: "0",
  };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  delete env.GIT_PREFIX;
  return env;
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: gitEnv(),
  });
}

function initRepo() {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "repo-"));
  let init = git(root, ["init", "-b", "main"]);
  if (init.status !== 0) {
    init = git(root, ["init"]);
    git(root, ["checkout", "-b", "main"]);
  }
  if (!existsSync(join(root, ".git"))) {
    throw new Error(`git init failed: ${init.stderr || init.stdout}`);
  }
  git(root, ["config", "user.email", "s22@path.local"]);
  git(root, ["config", "user.name", "S22 Test"]);
  writeFileSync(join(root, "README.md"), "base\n", "utf8");
  git(root, ["add", "README.md"]);
  const commit = git(root, ["commit", "-m", "init"]);
  if (commit.status !== 0) {
    throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
  }
  return root;
}

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) {
    const p = cleanups.pop();
    if (p) {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
});

describe("S2.2 result lifecycle", () => {
  it(
    "discards worktree/branch, keeps report, marks DISCARDED, primary untouched",
    async () => {
    const projectRoot = initRepo();
    cleanups.push(projectRoot);
    const runtimeRoot = mkdtempSync(join(SCRATCH, "rt-"));
    cleanups.push(runtimeRoot);

    const head = git(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
    const taskId = "s22-disc-aaaa-bbbb-cccc-ddddeeee0001";
    const branch = `path/task-${taskId}`;
    const wt = join(runtimeRoot, "ag1-tasks", taskId);
    mkdirSync(dirname(wt), { recursive: true });
    const addWt = git(projectRoot, [
      "worktree",
      "add",
      "-b",
      branch,
      wt,
      head,
    ]);
    if (addWt.status !== 0) {
      throw new Error(
        `worktree add failed (${addWt.status}): ${addWt.stderr || addWt.stdout}`,
      );
    }
    writeFileSync(join(wt, "feat.txt"), "change\n", "utf8");
    git(wt, ["add", "feat.txt"]);
    git(wt, ["commit", "-m", "feat"]);
    const sha = git(wt, ["rev-parse", "HEAD"]).stdout.trim();

    const { writeTaskCheckpoint, createCheckpointSkeleton, readTaskCheckpoint } =
      await load("ag10/task-checkpoint.mjs");
    const { writeEngineeringReportFile } = await load("engineering-report.mjs");
    writeTaskCheckpoint(
      runtimeRoot,
      createCheckpointSkeleton({
        taskId,
        worktreePath: wt,
        repoRoot: projectRoot,
        objective: "Add feat.txt",
        finalState: "VERIFIED",
      }),
    );
    writeEngineeringReportFile(
      taskId,
      [
        "COMPLETE",
        "",
        "Changed",
        "  feat.txt",
        "",
        "Git / result",
        `  ${branch}`,
        `  commit ${sha}`,
        `  baseline ${head}`,
        "  Inspect:",
        `  git diff --no-ext-diff --no-textconv ${head} ${sha} --`,
        "",
      ].join("\n"),
      runtimeRoot,
    );

    const {
      getTaskHistoryEntry,
      taskHasAdoptableChanges,
      formatLifecycleLabel,
      formatInspectPanel,
    } = await load("task-history.mjs");
    const {
      discardTaskResult,
      formatDiscardResultPanel,
    } = await load("result-lifecycle.mjs");

    const before = getTaskHistoryEntry(runtimeRoot, taskId);
    expect(taskHasAdoptableChanges(before!)).toBe(true);
    expect(formatLifecycleLabel(before!)).toMatch(/adoptable/);

    const primaryBefore = git(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
    const porcelainBefore = git(projectRoot, [
      "status",
      "--porcelain=v1",
      "-uall",
    ]).stdout;

    const discarded = discardTaskResult({
      runtimeRoot,
      projectRoot,
      entry: before!,
    });
    expect(discarded.ok).toBe(true);
    expect(discarded.primaryUntouched).toBe(true);
    expect(existsSync(wt)).toBe(false);
    expect(
      git(projectRoot, [
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${branch}`,
      ]).status,
    ).not.toBe(0);

    expect(git(projectRoot, ["rev-parse", "HEAD"]).stdout.trim()).toBe(
      primaryBefore,
    );
    expect(
      git(projectRoot, ["status", "--porcelain=v1", "-uall"]).stdout,
    ).toBe(porcelainBefore);

    const after = getTaskHistoryEntry(runtimeRoot, taskId);
    expect(after?.lifecycleStatus).toBe("DISCARDED");
    expect(taskHasAdoptableChanges(after!)).toBe(false);
    expect(formatLifecycleLabel(after!)).toBe("DISCARDED");
    expect(after?.hasReport).toBe(true);
    expect(after?.reportText).toContain("feat.txt");
    expect(formatInspectPanel(after!)).toMatch(/Adoptable: no — discarded/);
    expect(formatDiscardResultPanel(discarded, before!)).toMatch(/Discarded/);

    const cp = readTaskCheckpoint(runtimeRoot, taskId);
    expect(cp?.resultLifecycle?.status).toBe("DISCARDED");
  },
    60_000,
  );

  it("refuses PR for read-only / no-change and discarded tasks", async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const runtimeRoot = mkdtempSync(join(SCRATCH, "rt-"));
    cleanups.push(runtimeRoot);
    const projectRoot = initRepo();
    cleanups.push(projectRoot);

    const { writeEngineeringReportFile } = await load("engineering-report.mjs");
    const {
      getTaskHistoryEntry,
      taskHasAdoptableChanges,
      formatLifecycleLabel,
    } = await load("task-history.mjs");
    const { writeResultLifecycle } = await load("result-lifecycle.mjs");

    const roId = "s22-ro-aaaa-bbbb-cccc-ddddeeee0002";
    const head = git(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
    writeEngineeringReportFile(
      roId,
      [
        "COMPLETE",
        "",
        "Asked",
        "  Assess only",
        "",
        "Git / result",
        `  path/task-${roId}`,
        `  commit ${head}`,
        `  baseline ${head}`,
        "  Inspect:",
        `  git diff --no-ext-diff --no-textconv ${head} ${head} --`,
        "",
      ].join("\n"),
      runtimeRoot,
    );
    const ro = getTaskHistoryEntry(runtimeRoot, roId);
    expect(taskHasAdoptableChanges(ro!)).toBe(false);
    expect(formatLifecycleLabel(ro!)).not.toMatch(/adoptable/);

    const chgId = "s22-chg-aaaa-bbbb-cccc-ddddeeee0003";
    writeEngineeringReportFile(
      chgId,
      [
        "COMPLETE",
        "",
        "Changed",
        "  a.ts",
        "",
        "Git / result",
        `  path/task-${chgId}`,
        `  commit ${"a".repeat(40)}`,
        `  baseline ${"b".repeat(40)}`,
        "  Inspect:",
        `  git diff --no-ext-diff --no-textconv ${"b".repeat(40)} ${"a".repeat(40)} --`,
        "",
      ].join("\n"),
      runtimeRoot,
    );
    writeResultLifecycle({
      runtimeRoot,
      taskId: chgId,
      projectRoot,
      entry: getTaskHistoryEntry(runtimeRoot, chgId),
      patch: { status: "DISCARDED", discardedAt: new Date().toISOString() },
    });
    const discarded = getTaskHistoryEntry(runtimeRoot, chgId);
    expect(taskHasAdoptableChanges(discarded!)).toBe(false);
    expect(discarded?.lifecycleStatus).toBe("DISCARDED");
    expect(formatLifecycleLabel(discarded!)).toBe("DISCARDED");
  });

  it("formats PR preview/result panels and marks MERGED lifecycle", async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const runtimeRoot = mkdtempSync(join(SCRATCH, "rt-"));
    cleanups.push(runtimeRoot);
    const projectRoot = initRepo();
    cleanups.push(projectRoot);

    const {
      formatPrPreviewPanel,
      formatPrResultPanel,
      markTaskMerged,
      readLifecycleFromCheckpoint,
    } = await load("result-lifecycle.mjs");
    const { writeTaskCheckpoint, createCheckpointSkeleton, readTaskCheckpoint } =
      await load("ag10/task-checkpoint.mjs");
    const { getTaskHistoryEntry, formatLifecycleLabel } = await load(
      "task-history.mjs",
    );
    const { writeEngineeringReportFile } = await load("engineering-report.mjs");

    const taskId = "s22-pr-aaaa-bbbb-cccc-ddddeeee0004";
    writeTaskCheckpoint(
      runtimeRoot,
      createCheckpointSkeleton({
        taskId,
        worktreePath: join(runtimeRoot, "ag1-tasks", taskId),
        repoRoot: projectRoot,
        objective: "Ship feature",
        finalState: "VERIFIED",
      }),
    );
    writeEngineeringReportFile(
      taskId,
      [
        "COMPLETE",
        "",
        "Changed",
        "  src/x.ts",
        "",
        "Git / result",
        `  path/task-${taskId}`,
        `  commit ${"c".repeat(40)}`,
        `  baseline ${"d".repeat(40)}`,
        "",
      ].join("\n"),
      runtimeRoot,
    );
    const entry = getTaskHistoryEntry(runtimeRoot, taskId)!;
    const previewText = formatPrPreviewPanel(
      {
        taskBranch: entry.branch,
        commitSha: entry.sha,
        target: {
          remoteLabel: "origin → owner/repo",
          baseBranch: "main",
        },
      },
      entry,
    );
    expect(previewText).toMatch(/confirmation required/i);
    expect(previewText).toMatch(/push task branch \+ create\/reuse PR/);

    const okText = formatPrResultPanel(
      {
        ok: true,
        reused: false,
        taskBranch: entry.branch,
        commitSha: entry.sha,
        target: { remoteLabel: "origin → owner/repo" },
        push: { ok: true, skipped: false },
        pr: { number: 7, url: "https://github.com/owner/repo/pull/7" },
      },
      entry,
    );
    expect(okText).toMatch(/Pull request published/);
    expect(okText).toMatch(/#7/);

    markTaskMerged({ runtimeRoot, projectRoot, entry });
    const cp = readTaskCheckpoint(runtimeRoot, taskId);
    expect(readLifecycleFromCheckpoint(cp).status).toBe("MERGED");
    const after = getTaskHistoryEntry(runtimeRoot, taskId)!;
    expect(formatLifecycleLabel(after)).toBe("MERGED");
  });
});
