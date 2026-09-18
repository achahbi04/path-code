/**
 * S3.1 — Cursor/fabric result capture → /inspect adoptable lifecycle.
 */
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG1 = join(CHECKOUT, "scripts/pathcode-cli/ag1");
const AG10 = join(CHECKOUT, "scripts/pathcode-cli/ag10");
const CLI = join(CHECKOUT, "scripts/pathcode-cli");

async function load(path: string) {
  return import(`${pathToFileURL(path).href}?rc=${randomUUID()}`);
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

function initRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["-c", "init.defaultBranch=main", "init", "--template="]);
  git(dir, ["config", "user.email", "s31-rc@test"]);
  git(dir, ["config", "user.name", "s31-rc"]);
  writeFileSync(join(dir, "README.md"), "base\n");
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-m", "baseline"]);
  return git(dir, ["rev-parse", "HEAD"]).stdout.trim();
}

describe("S3.1 result capture", () => {
  it("does not treat create + do-not-modify-other as read-only", async () => {
    const { isReadOnlyAssessmentObjective } = await load(
      join(AG1, "task-worktree.mjs"),
    );
    const createObj = `Create a file named S3_CURSOR_OPERATOR_ACCEPTANCE.md.

Do not modify any other file.
Do not push or publish anything.

Before finishing, verify that this is the only intended project change.`;
    expect(isReadOnlyAssessmentObjective(createObj)).toBe(false);
    expect(
      isReadOnlyAssessmentObjective(
        "Assess the repository. Do not modify files. Report findings.",
      ),
    ).toBe(true);
  });

  it("collects staged Cursor creates and lists post-commit files", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "s31-rc-"));
    try {
      const {
        collectWorktreeResult,
        listCommitChangedFiles,
      } = await load(join(AG1, "task-worktree.mjs"));
      const { commitTaskWorktree } = await load(join(AG1, "task-commit.mjs"));
      const task = join(scratch, "task");
      const baseline = initRepo(task);
      writeFileSync(
        join(task, "S3_CURSOR_OPERATOR_ACCEPTANCE.md"),
        "S3.1 Cursor operator acceptance.\n",
      );
      // Simulate Cursor staging before PATH finalization.
      git(task, ["add", "S3_CURSOR_OPERATOR_ACCEPTANCE.md"]);
      const collected = collectWorktreeResult(task, baseline);
      expect(collected.changedFiles).toContain(
        "S3_CURSOR_OPERATOR_ACCEPTANCE.md",
      );
      const committed = commitTaskWorktree({
        worktreePath: task,
        message: "PATH: verified task probe",
      });
      expect(committed.ok).toBe(true);
      expect(committed.skipped).not.toBe(true);
      const listed = listCommitChangedFiles(
        task,
        baseline,
        committed.commitSha,
      );
      expect(listed).toEqual(["S3_CURSOR_OPERATOR_ACCEPTANCE.md"]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("persists changedFiles on checkpoint and /inspect is adoptable", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "s31-rc-cp-"));
    try {
      const {
        createCheckpointSkeleton,
        writeTaskCheckpoint,
        patchTaskCheckpoint,
      } = await load(join(AG10, "task-checkpoint.mjs"));
      const {
        getTaskHistoryEntry,
        formatInspectPanel,
        taskHasAdoptableChanges,
      } = await load(join(CLI, "task-history.mjs"));
      const {
        writeEngineeringReportFile,
        formatEngineeringReportPlain,
        buildEngineeringReportModel,
      } = await load(join(CLI, "engineering-report.mjs"));

      const runtimeRoot = join(scratch, "runtime");
      const repo = join(scratch, "repo");
      const baseline = initRepo(repo);
      writeFileSync(
        join(repo, "S3_CURSOR_OPERATOR_ACCEPTANCE.md"),
        "S3.1 Cursor operator acceptance.\n",
      );
      git(repo, ["add", "S3_CURSOR_OPERATOR_ACCEPTANCE.md"]);
      git(repo, ["commit", "-m", "PATH: verified task t1"]);
      const sha = git(repo, ["rev-parse", "HEAD"]).stdout.trim();
      const taskId = randomUUID();
      const branch = `path/task-${taskId}`;

      const sk = createCheckpointSkeleton({
        taskId,
        worktreePath: join(runtimeRoot, "ag1-tasks", taskId),
        objective: "Create S3_CURSOR_OPERATOR_ACCEPTANCE.md",
        repoRoot: repo,
        finalState: "VERIFIED",
      });
      writeTaskCheckpoint(runtimeRoot, sk);
      patchTaskCheckpoint(runtimeRoot, taskId, {
        branch,
        sha,
        baseline,
        changedFiles: ["S3_CURSOR_OPERATOR_ACCEPTANCE.md"],
        finalState: "VERIFIED",
      });

      const plain = formatEngineeringReportPlain(
        buildEngineeringReportModel(
          {
            taskId,
            taskObjective: "Create S3_CURSOR_OPERATOR_ACCEPTANCE.md",
            projectFiles: ["S3_CURSOR_OPERATOR_ACCEPTANCE.md"],
            taskBranch: branch,
            resultSha: sha,
            baselineSha: baseline,
            resultClassification: "VERIFIED",
            advancesSession: true,
          },
          {
            classification: "VERIFIED",
            changedFiles: ["S3_CURSOR_OPERATOR_ACCEPTANCE.md"],
            taskBranch: branch,
            commitSha: sha,
            baselineSha: baseline,
            advancesSession: true,
          },
        ),
      );
      writeEngineeringReportFile(taskId, plain, runtimeRoot);
      expect(plain).toMatch(/Changed\n {2}S3_CURSOR_OPERATOR_ACCEPTANCE\.md/);

      const entry = getTaskHistoryEntry(runtimeRoot, taskId);
      expect(entry).toBeTruthy();
      expect(entry.changedFiles).toContain("S3_CURSOR_OPERATOR_ACCEPTANCE.md");
      expect(taskHasAdoptableChanges(entry)).toBe(true);
      const inspect = formatInspectPanel(entry);
      expect(inspect).toMatch(/changed\s+1 file/);
      expect(inspect).toMatch(/S3_CURSOR_OPERATOR_ACCEPTANCE\.md/);
      expect(inspect).toMatch(/Adoptable: yes/);
      expect(existsSync(join(runtimeRoot, "metadata", "tasks", `${taskId}.checkpoint.json`))).toBe(
        true,
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("recovers changedFiles from Git when report omitted Changed", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "s31-rc-rec-"));
    try {
      const {
        createCheckpointSkeleton,
        writeTaskCheckpoint,
      } = await load(join(AG10, "task-checkpoint.mjs"));
      const {
        getTaskHistoryEntry,
        taskHasAdoptableChanges,
        formatInspectPanel,
      } = await load(join(CLI, "task-history.mjs"));
      const { writeEngineeringReportFile } = await load(
        join(CLI, "engineering-report.mjs"),
      );

      const runtimeRoot = join(scratch, "runtime");
      const repo = join(scratch, "repo");
      const baseline = initRepo(repo);
      writeFileSync(
        join(repo, "S3_CURSOR_OPERATOR_ACCEPTANCE.md"),
        "S3.1 Cursor operator acceptance.\n",
      );
      git(repo, ["add", "S3_CURSOR_OPERATOR_ACCEPTANCE.md"]);
      git(repo, ["commit", "-m", "PATH: verified"]);
      const sha = git(repo, ["rev-parse", "HEAD"]).stdout.trim();
      const taskId = randomUUID();
      const branch = `path/task-${taskId}`;

      writeTaskCheckpoint(
        runtimeRoot,
        createCheckpointSkeleton({
          taskId,
          worktreePath: join(runtimeRoot, "ag1-tasks", taskId),
          objective: "Create acceptance file",
          repoRoot: repo,
          finalState: "VERIFIED",
        }),
      );
      // Report has Git state but no Changed section (the operator bug shape).
      writeEngineeringReportFile(
        taskId,
        [
          "✓ COMPLETE",
          "",
          "Git / result state",
          `  branch  ${branch}`,
          `  commit  ${sha.slice(0, 12)}`,
          `  baseline ${baseline.slice(0, 12)}`,
          "",
        ].join("\n"),
        runtimeRoot,
      );

      const entry = getTaskHistoryEntry(runtimeRoot, taskId);
      expect(entry.changedFiles).toContain("S3_CURSOR_OPERATOR_ACCEPTANCE.md");
      expect(taskHasAdoptableChanges(entry)).toBe(true);
      expect(formatInspectPanel(entry)).toMatch(/Adoptable: yes/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
