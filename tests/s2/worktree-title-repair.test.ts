/**
 * S2.3 acceptance repair — live worktree preservation + title reclaim contracts.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
/** Workspace-local scratch (not /tmp): Cursor sandboxes often deny git under system temp. */
const SCRATCH_ROOT = join(CHECKOUT, ".path-code-tmp", "s3-s2-repair-tests");
const scratchDirs: string[] = [];

afterEach(() => {
  for (const d of scratchDirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

async function load(rel: string) {
  return import(
    `${pathToFileURL(join(CHECKOUT, "scripts/pathcode-cli", rel)).href}?r=${randomUUID()}`
  );
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      // Avoid template/hooks that some hosts reject under restricted FS.
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

/** Canonicalize for macOS `/var` ↔ `/private/var` equality in assertions. */
function canon(p: string) {
  try {
    return existsSync(p) ? realpathSync(p) : resolve(p);
  } catch {
    return resolve(p);
  }
}

function initRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  // Prefer workspace-local scratch: sandbox hosts often block git under /tmp.
  const init = git(dir, [
    "-c",
    "init.defaultBranch=main",
    "init",
    "--template=",
  ]);
  if (init.status !== 0) {
    throw new Error(
      `git init failed (${init.status}): ${init.stderr || init.stdout}`,
    );
  }
  git(dir, ["config", "user.email", "s23@example.com"]);
  git(dir, ["config", "user.name", "S23 Repair"]);
  writeFileSync(join(dir, "README.md"), "fixture\n");
  expect(git(dir, ["add", "-A"]).status).toBe(0);
  expect(git(dir, ["commit", "-m", "init"]).status).toBe(0);
}

describe("S2.3 worktree Git parity repair", () => {
  // Git worktree + orphan recovery is sequential and can exceed the 20s default
  // under parallel suite load on this host.
  it(
    "preserves healthy live PATH worktrees during orphan recovery",
    async () => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    const root = mkdtempSync(join(SCRATCH_ROOT, "s23-wt-"));
    scratchDirs.push(root);
    const primary = join(root, "primary");
    const runtimeRoot = join(root, "runtime");
    initRepo(primary);

    const { createTaskWorktree, assertTaskWorktreeGitHealthy } = await load(
      "ag1/task-worktree.mjs",
    );
    const { recoverPathOwnedStaleWorktrees, isLinkedWorktreeGitHealthy } =
      await load("ag5/orphan-recovery.mjs");

    const created = createTaskWorktree({
      primaryRoot: primary,
      checkoutRoot: CHECKOUT,
      runtimeRoot,
      adoptPrimaryWorkingTree: false,
    });
    expect(created.ok).toBe(true);
    expect(created.worktreePath).toBeTruthy();

    const before = assertTaskWorktreeGitHealthy(created.worktreePath, primary);
    expect(before.ok).toBe(true);
    expect(isLinkedWorktreeGitHealthy(created.worktreePath)).toBe(true);

    const recovered = recoverPathOwnedStaleWorktrees({
      projectRoot: primary,
      checkoutRoot: CHECKOUT,
      runtimeRoot,
    });
    expect(recovered.ok).toBe(true);
    const preserved = (recovered.preservedLivePathWorktrees || []).map(canon);
    expect(preserved).toContain(canon(created.worktreePath));
    expect(
      (recovered.recovered || []).some(
        (r: { path?: string }) =>
          typeof r.path === "string" &&
          canon(r.path) === canon(created.worktreePath),
      ),
    ).toBe(false);

    const after = assertTaskWorktreeGitHealthy(created.worktreePath, primary);
    expect(after.ok).toBe(true);
    const toplevel = git(created.worktreePath, ["rev-parse", "--show-toplevel"]);
    expect(toplevel.status).toBe(0);
    expect(canon(toplevel.stdout.trim())).toBe(canon(created.worktreePath));
    const branch = git(created.worktreePath, ["branch", "--show-current"]);
    expect(branch.status).toBe(0);
    expect(branch.stdout.trim()).toMatch(/^path\/task-/);
  },
    60_000,
  );

  it(
    "repairs a dangling gitdir pointer when admin metadata was removed",
    async () => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    const root = mkdtempSync(join(SCRATCH_ROOT, "s23-repair-"));
    scratchDirs.push(root);
    const primary = join(root, "primary");
    const runtimeRoot = join(root, "runtime");
    initRepo(primary);

    const {
      createTaskWorktree,
      assertTaskWorktreeGitHealthy,
      repairTaskWorktreeGit,
    } = await load("ag1/task-worktree.mjs");

    const created = createTaskWorktree({
      primaryRoot: primary,
      checkoutRoot: CHECKOUT,
      runtimeRoot,
      adoptPrimaryWorkingTree: false,
    });
    expect(created.ok).toBe(true);
    const wt = created.worktreePath as string;
    const dotGit = join(wt, ".git");
    const pointer = readFileSync(dotGit, "utf8");
    const match = /^gitdir:\s*(.+?)\s*$/m.exec(pointer);
    expect(match?.[1]).toBeTruthy();
    const gitdirTarget = match![1] as string;
    const gitdir = gitdirTarget.startsWith("/")
      ? gitdirTarget
      : join(wt, gitdirTarget);
    expect(existsSync(gitdir)).toBe(true);

    // Simulate the operator failure: remove admin metadata while leaving the
    // worktree directory and dangling gitdir pointer in place.
    rmSync(gitdir, { recursive: true, force: true });
    expect(existsSync(gitdir)).toBe(false);
    expect(assertTaskWorktreeGitHealthy(wt).ok).toBe(false);

    const repaired = repairTaskWorktreeGit(primary, wt);
    expect(repaired.ok).toBe(true);
    const healthy = assertTaskWorktreeGitHealthy(wt, primary);
    expect(healthy.ok).toBe(true);
    expect(git(wt, ["rev-parse", "--show-toplevel"]).status).toBe(0);
  });

  it("read-only assessment with empty validation candidates is VERIFIED", async () => {
    const { runIndependentFinalValidation } = await load(
      "ag1/final-validation.mjs",
    );
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    const root = mkdtempSync(join(SCRATCH_ROOT, "s23-val-"));
    scratchDirs.push(root);
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "klarapp-like", private: true }, null, 2) + "\n",
    );
    const result = await runIndependentFinalValidation({
      worktreePath: root,
      engineeringCwd: root,
      primaryRoot: root,
      objective:
        "Assess README.md and package.json only. Do not modify any files.",
    });
    expect(result.classification).toBe("VERIFIED");
  });
});

describe("S2.3 installed-path title reclaim", () => {
  it("keeps product title owned and reclaim callable after SDK-boundary hooks", async () => {
    const {
      formatPathTitle,
      setStablePathTitle,
      getOwnedPathTitle,
      restoreTerminalTitle,
      reclaimTtyForeground,
      isPathTitleOwned,
    } = await load("terminal-title.mjs");

    const chunks: string[] = [];
    const stdout = {
      write(chunk: string) {
        chunks.push(String(chunk));
        return true;
      },
    };
    const expected = formatPathTitle("Klarapp");
    setStablePathTitle({ stdout, projectName: "Klarapp" });
    expect(isPathTitleOwned()).toBe(true);
    expect(getOwnedPathTitle()).toBe(expected);
    expect(process.title).not.toMatch(/copilot|node|python|PATH Code/i);

    // Simulate Copilot SDK start/turn boundaries (installed product path).
    const reclaimOk = reclaimTtyForeground();
    expect(typeof reclaimOk).toBe("boolean");
    expect(getOwnedPathTitle()).toBe(expected);
    expect(chunks.join("")).toContain(expected);
    expect(chunks.join("")).not.toMatch(/copilot/i);
    expect(chunks.join("")).not.toMatch(/TMPDIR=/);

    restoreTerminalTitle({ stdout });
    expect(isPathTitleOwned()).toBe(false);
  });
});
