/**
 * AG2 focused proofs A–J (product loop).
 */

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  mkdtempSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const AG1 = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag1");
const SCRATCH = join(CHECKOUT_ROOT, ".path-code-tmp", "ag2-test-scratch");

async function load(name: string) {
  return import(`${pathToFileURL(join(AG1, name)).href}?b=${randomUUID()}`);
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function initRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  const init = git(dir, ["init"]);
  if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);
  git(dir, ["config", "user.email", "ag2@example.com"]);
  git(dir, ["config", "user.name", "AG2 Test"]);
  writeFileSync(join(dir, "README.md"), "ag2 fixture\n", "utf8");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "ag2-fixture",
      private: true,
      type: "module",
      scripts: {
        test: "node --test test.mjs",
        typecheck: "node -e \"process.exit(0)\"",
      },
    }),
    "utf8",
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "sum.js"),
    "export function sum(a, b) { return a + b; }\n",
    "utf8",
  );
  writeFileSync(
    join(dir, "test.mjs"),
    "import test from 'node:test';\nimport assert from 'node:assert';\nimport { sum } from './src/sum.js';\ntest('sum', () => assert.equal(sum(2,3), 5));\n",
    "utf8",
  );
  git(dir, ["add", "-A"]);
  const commit = git(dir, ["commit", "-m", "init"]);
  if (commit.status !== 0) throw new Error(`commit failed: ${commit.stderr}`);
  git(dir, ["branch", "-M", "main"]);
}

function makeScratch(prefix: string) {
  mkdirSync(SCRATCH, { recursive: true });
  return mkdtempSync(join(SCRATCH, prefix));
}

afterAll(() => {
  try {
    rmSync(SCRATCH, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("AG2 A — dirty primary refused", () => {
  it("DIRTY_PRIMARY_TREE and no worktree created", async () => {
    const { admitPrimaryCheckout } = await load("admission.mjs");
    const { createTaskWorktree, listWorktrees } = await load("task-worktree.mjs");
    const root = makeScratch("ag2-dirty-");
    const primary = join(root, "primary");
    initRepo(primary);
    writeFileSync(join(primary, "DIRTY.txt"), "x\n", "utf8");
    const admission = admitPrimaryCheckout(primary);
    expect(admission.ok).toBe(false);
    if (!admission.ok) {
      expect(admission.code).toBe("DIRTY_PRIMARY_TREE");
    }
    // Caller must not create worktree after refusal — prove create would still
    // be gated by product session; here we assert admission blocks first.
    const before = listWorktrees(primary);
    expect(before.ok).toBe(true);
    expect(before.entries.length).toBe(1); // primary only
    void createTaskWorktree;
  });
});

describe("AG2 B — detached HEAD blocked", () => {
  it("DETACHED_HEAD_BLOCKED", async () => {
    const { admitPrimaryCheckout } = await load("admission.mjs");
    const root = makeScratch("ag2-detach-");
    const primary = join(root, "primary");
    initRepo(primary);
    const head = git(primary, ["rev-parse", "HEAD"]).stdout.trim();
    git(primary, ["checkout", "--detach", head]);
    const admission = admitPrimaryCheckout(primary);
    expect(admission.ok).toBe(false);
    if (!admission.ok) expect(admission.code).toBe("DETACHED_HEAD_BLOCKED");
  });
});

describe("AG2 C — verified cleanup", () => {
  it("task branch + commit remain; worktree removed", async () => {
    const {
      createTaskWorktree,
      removeTaskWorktree,
      listWorktrees,
      collectWorktreeResult,
    } = await load("task-worktree.mjs");
    const { commitTaskWorktree } = await load("task-commit.mjs");
    const root = makeScratch("ag2-verified-");
    const primary = join(root, "primary");
    initRepo(primary);
    const tasksParent = join(root, "tasks");
    const wt = createTaskWorktree({
      primaryRoot: primary,
      tasksParent,
      checkoutRoot: CHECKOUT_ROOT,
    });
    expect(wt.ok).toBe(true);
    writeFileSync(join(wt.worktreePath, "src", "sum.js"), "export function sum(a,b){return a+b;}\n", "utf8");
    writeFileSync(join(wt.worktreePath, "NOTE.md"), "verified\n", "utf8");
    const committed = commitTaskWorktree({
      worktreePath: wt.worktreePath,
      message: `PATH: verified task ${wt.taskId}`,
    });
    expect(committed.ok).toBe(true);
    expect(committed.commitSha).toMatch(/^[0-9a-f]{40}$/i);
    const branchHead = git(primary, ["rev-parse", wt.taskBranch]).stdout.trim();
    expect(branchHead).toBe(committed.commitSha);
    const cleanup = removeTaskWorktree(primary, wt.worktreePath);
    expect(cleanup.ok).toBe(true);
    expect(existsSync(wt.worktreePath)).toBe(false);
    const listed = listWorktrees(primary);
    expect(listed.entries.every((e: { path: string }) => e.path !== wt.worktreePath)).toBe(
      true,
    );
    // Branch remains
    expect(git(primary, ["show-ref", "--verify", `refs/heads/${wt.taskBranch}`]).status).toBe(0);
    void collectWorktreeResult;
  });
});

describe("AG2 D — failed partial work preserved", () => {
  it("UNVERIFIED WIP commit; baseline does not advance conceptually", async () => {
    const { createTaskWorktree, removeTaskWorktree } = await load("task-worktree.mjs");
    const { commitTaskWorktree } = await load("task-commit.mjs");
    const root = makeScratch("ag2-fail-");
    const primary = join(root, "primary");
    initRepo(primary);
    const baseline = git(primary, ["rev-parse", "HEAD"]).stdout.trim();
    const wt = createTaskWorktree({
      primaryRoot: primary,
      tasksParent: join(root, "tasks"),
      checkoutRoot: CHECKOUT_ROOT,
      baselineCommit: baseline,
    });
    writeFileSync(join(wt.worktreePath, "WIP.txt"), "partial\n", "utf8");
    const committed = commitTaskWorktree({
      worktreePath: wt.worktreePath,
      message: `PATH WIP: preserve failed task ${wt.taskId}`,
    });
    expect(committed.ok).toBe(true);
    expect(committed.commitSha).not.toBe(baseline);
    const cleanup = removeTaskWorktree(primary, wt.worktreePath);
    expect(cleanup.ok).toBe(true);
    // Session baseline would remain `baseline` — primary HEAD unchanged
    expect(git(primary, ["rev-parse", "HEAD"]).stdout.trim()).toBe(baseline);
  });
});

describe("AG2 E/F — session success chain + failure isolation", () => {
  it("task2 starts from task1 verified commit; failed task2 does not move baseline", async () => {
    const { createTaskWorktree, removeTaskWorktree } = await load("task-worktree.mjs");
    const { commitTaskWorktree } = await load("task-commit.mjs");
    const root = makeScratch("ag2-chain-");
    const primary = join(root, "primary");
    initRepo(primary);
    const A = git(primary, ["rev-parse", "HEAD"]).stdout.trim();
    const t1 = createTaskWorktree({
      primaryRoot: primary,
      tasksParent: join(root, "tasks"),
      checkoutRoot: CHECKOUT_ROOT,
      baselineCommit: A,
    });
    writeFileSync(join(t1.worktreePath, "T1.txt"), "one\n", "utf8");
    const c1 = commitTaskWorktree({
      worktreePath: t1.worktreePath,
      message: "PATH: verified task 1",
    });
    expect(c1.ok).toBe(true);
    removeTaskWorktree(primary, t1.worktreePath);
    const B = c1.commitSha as string;

    const t2fail = createTaskWorktree({
      primaryRoot: primary,
      tasksParent: join(root, "tasks"),
      checkoutRoot: CHECKOUT_ROOT,
      baselineCommit: B,
    });
    expect(t2fail.baseline.head).toBe(B);
    writeFileSync(join(t2fail.worktreePath, "FAIL.txt"), "x\n", "utf8");
    commitTaskWorktree({
      worktreePath: t2fail.worktreePath,
      message: "PATH WIP: preserve failed task 2",
    });
    removeTaskWorktree(primary, t2fail.worktreePath);

    // Task 3 still from B (session baseline not advanced on failure)
    const t3 = createTaskWorktree({
      primaryRoot: primary,
      tasksParent: join(root, "tasks"),
      checkoutRoot: CHECKOUT_ROOT,
      baselineCommit: B,
    });
    expect(t3.baseline.head).toBe(B);
    expect(readFileSync(join(t3.worktreePath, "T1.txt"), "utf8")).toContain("one");
    expect(existsSync(join(t3.worktreePath, "FAIL.txt"))).toBe(false);
    removeTaskWorktree(primary, t3.worktreePath);
  });
});

describe("AG2 G — no worktree leak", () => {
  it("repeated create/remove leaves no orphan task paths", async () => {
    const { createTaskWorktree, removeTaskWorktree, listWorktrees } = await load(
      "task-worktree.mjs",
    );
    const root = makeScratch("ag2-leak-");
    const primary = join(root, "primary");
    initRepo(primary);
    const tasksParent = join(root, "tasks");
    for (let i = 0; i < 3; i += 1) {
      const wt = createTaskWorktree({
        primaryRoot: primary,
        tasksParent,
        checkoutRoot: CHECKOUT_ROOT,
      });
      expect(wt.ok).toBe(true);
      const cleanup = removeTaskWorktree(primary, wt.worktreePath);
      expect(cleanup.ok).toBe(true);
    }
    const listed = listWorktrees(primary);
    expect(listed.entries.length).toBe(1);
    expect(listed.entries[0].path).toBe(primary);
  });
});

describe("AG2 H — primary untouched", () => {
  it("agent edits stay in worktree", async () => {
    const {
      createTaskWorktree,
      capturePrimaryFingerprint,
      primaryUntouched,
      removeTaskWorktree,
    } = await load("task-worktree.mjs");
    const root = makeScratch("ag2-untouched-");
    const primary = join(root, "primary");
    initRepo(primary);
    const before = capturePrimaryFingerprint(primary);
    const wt = createTaskWorktree({
      primaryRoot: primary,
      tasksParent: join(root, "tasks"),
      checkoutRoot: CHECKOUT_ROOT,
    });
    writeFileSync(join(wt.worktreePath, "ONLY_WT.txt"), "x\n", "utf8");
    const after = capturePrimaryFingerprint(primary);
    expect(primaryUntouched(before, after)).toBe(true);
    expect(existsSync(join(primary, "ONLY_WT.txt"))).toBe(false);
    removeTaskWorktree(primary, wt.worktreePath);
  });
});

describe("AG2 I — final validation independence", () => {
  it("engine finished alone cannot establish VERIFIED", async () => {
    const { classifyAg1Result } = await load("final-validation.mjs");
    expect(
      classifyAg1Result({ agentFinished: true, validation: null }),
    ).toBe("NOT_VERIFIED");
    expect(
      classifyAg1Result({
        agentFinished: true,
        validation: { classification: "FAILED" },
      }),
    ).toBe("FAILED");
    expect(
      classifyAg1Result({
        agentFinished: true,
        validation: { classification: "VERIFIED" },
      }),
    ).toBe("VERIFIED");
  });
});

describe("AG2 J — cancellation cleanup path exists", () => {
  it("removeTaskWorktree works after cancel-style WIP preserve", async () => {
    const { createTaskWorktree, removeTaskWorktree } = await load("task-worktree.mjs");
    const { commitTaskWorktree } = await load("task-commit.mjs");
    const root = makeScratch("ag2-cancel-");
    const primary = join(root, "primary");
    initRepo(primary);
    const wt = createTaskWorktree({
      primaryRoot: primary,
      tasksParent: join(root, "tasks"),
      checkoutRoot: CHECKOUT_ROOT,
    });
    writeFileSync(join(wt.worktreePath, "CANCEL.txt"), "c\n", "utf8");
    const committed = commitTaskWorktree({
      worktreePath: wt.worktreePath,
      message: `PATH WIP: preserve cancelled task ${wt.taskId}`,
    });
    expect(committed.ok).toBe(true);
    const cleanup = removeTaskWorktree(primary, wt.worktreePath);
    expect(cleanup.ok).toBe(true);
    expect(existsSync(wt.worktreePath)).toBe(false);
  });
});
