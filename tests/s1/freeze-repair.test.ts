/**
 * S1 freeze-repair — title ownership helpers + read-only setup restore.
 */
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRATCH = join(CHECKOUT, ".path-code-tmp", "s1-freeze-vitest");

async function loadTitle() {
  return import(
    `${pathToFileURL(join(CHECKOUT, "scripts/pathcode-cli/terminal-title.mjs")).href}?t=${randomUUID()}`
  );
}

async function loadWorktree() {
  return import(
    `${pathToFileURL(join(CHECKOUT, "scripts/pathcode-cli/ag1/task-worktree.mjs")).href}?t=${randomUUID()}`
  );
}

async function loadCommit() {
  return import(
    `${pathToFileURL(join(CHECKOUT, "scripts/pathcode-cli/ag1/task-commit.mjs")).href}?t=${randomUUID()}`
  );
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function initTaskRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "freeze@example.com"]);
  git(dir, ["config", "user.name", "Freeze Proof"]);
  writeFileSync(join(dir, "README.md"), "fixture\n", "utf8");
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify(
      {
        name: "klarapp",
        lockfileVersion: 3,
        packages: {
          "node_modules/x": { version: "1.0.0", devOptional: true },
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "init"]);
  return git(dir, ["rev-parse", "HEAD"]).stdout.trim();
}

describe("S1 freeze repair — Terminal title", () => {
  it("keeps product title clean and process.title inert", async () => {
    const {
      formatPathTitle,
      setStablePathTitle,
      getOwnedPathTitle,
      restoreTerminalTitle,
    } = await loadTitle();
    const prev = process.title;
    expect(formatPathTitle("Klarapp")).toBe("Klarapp — PATH Code");
    setStablePathTitle({ projectName: "Klarapp" });
    expect(getOwnedPathTitle()).toBe("Klarapp — PATH Code");
    expect(process.title).toBe("\u200b");
    restoreTerminalTitle();
    try {
      process.title = prev;
    } catch {
      // ignore
    }
  });
});

describe("S1 freeze repair — read-only setup churn", () => {
  it("restores lockfile-only churn for assessment objectives", async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const scratch = mkdtempSync(join(SCRATCH, "ro-"));
    try {
      const {
        isReadOnlyAssessmentObjective,
        restoreIncidentalSetupChurn,
        collectWorktreeResult,
      } = await loadWorktree();
      const { commitTaskWorktree } = await loadCommit();
      const task = join(scratch, "task");
      const head = initTaskRepo(task);
      const lock = join(task, "package-lock.json");
      writeFileSync(
        lock,
        readFileSync(lock, "utf8").replace(/"devOptional": true/g, '"dev": true'),
        "utf8",
      );
      const objective =
        "Assess the repository. Do not modify files. Report findings.";
      expect(isReadOnlyAssessmentObjective(objective)).toBe(true);
      expect(
        collectWorktreeResult(task, head).changedFiles,
      ).toContain("package-lock.json");
      const restore = restoreIncidentalSetupChurn({
        worktreePath: task,
        baselineHead: head,
        objective,
      });
      expect(restore.applied).toBe(true);
      expect(collectWorktreeResult(task, head).changedFiles).toEqual([]);
      const committed = commitTaskWorktree({
        worktreePath: task,
        message: "PATH: verified",
      });
      expect(committed.ok).toBe(true);
      expect(committed.skipped).toBe(true);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("keeps lockfile changes for explicit dependency upgrades", async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const scratch = mkdtempSync(join(SCRATCH, "up-"));
    try {
      const {
        isReadOnlyAssessmentObjective,
        restoreIncidentalSetupChurn,
        collectWorktreeResult,
      } = await loadWorktree();
      const { commitTaskWorktree } = await loadCommit();
      const task = join(scratch, "task");
      const head = initTaskRepo(task);
      const lock = join(task, "package-lock.json");
      writeFileSync(
        lock,
        readFileSync(lock, "utf8").replace(/"devOptional": true/g, '"dev": true'),
        "utf8",
      );
      const objective =
        "Upgrade dependencies and update package-lock.json.";
      expect(isReadOnlyAssessmentObjective(objective)).toBe(false);
      const restore = restoreIncidentalSetupChurn({
        worktreePath: task,
        baselineHead: head,
        objective,
      });
      expect(restore.applied).toBe(false);
      expect(
        collectWorktreeResult(task, head).changedFiles,
      ).toContain("package-lock.json");
      const committed = commitTaskWorktree({
        worktreePath: task,
        message: "PATH: verified",
      });
      expect(committed.ok).toBe(true);
      expect(committed.skipped).not.toBe(true);
      expect(committed.commitSha).toMatch(/^[0-9a-f]{7,40}$/i);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
