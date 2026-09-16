#!/usr/bin/env node
/**
 * Live Git-state admission proof — three real repository shapes.
 *
 * 1) clean named branch
 * 2) clean detached HEAD
 * 3) dirty working tree
 *
 * For each: admit → create task worktree → gateway fake engine reaches
 * engineering.result; primary fingerprint unchanged.
 */
import {
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { admitPrimaryCheckout } from "../../../../scripts/pathcode-cli/ag1/admission.mjs";
import {
  createTaskWorktree,
  capturePrimaryFingerprint,
  primaryUntouched,
  removeTaskWorktree,
} from "../../../../scripts/pathcode-cli/ag1/task-worktree.mjs";
import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "../../../../scripts/pathcode-cli/paths.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolvePathPackageRoot();
const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, unknown>>} */
const checks = [];

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "live@path"]);
  git(dir, ["config", "user.name", "PATH Live"]);
  writeFileSync(join(dir, "readme.md"), "live proof\n");
  writeFileSync(
    join(dir, "src.js"),
    "export function add(a, b) { return a + b; }\n",
  );
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  git(dir, ["branch", "-M", "main"]);
}

/**
 * @param {string} id
 * @param {string} primary
 * @param {{ expectDetached?: boolean, expectDirty?: boolean, expectFile?: string }} expect
 */
async function proveShape(id, primary, expect) {
  const admission = admitPrimaryCheckout(primary);
  const before = capturePrimaryFingerprint(primary);
  if (!admission.ok) {
    checks.push({
      id,
      ok: false,
      reason: "admission_failed",
      code: admission.code,
      message: admission.message,
    });
    return;
  }
  if (expect.expectDetached && !admission.detached) {
    checks.push({ id, ok: false, reason: "expected_detached" });
    return;
  }
  if (expect.expectDirty && !admission.dirty) {
    checks.push({ id, ok: false, reason: "expected_dirty" });
    return;
  }
  if (!expect.expectDirty && admission.dirty) {
    checks.push({ id, ok: false, reason: "expected_clean" });
    return;
  }

  const tasksParent = join(primary, "..", `${id}-tasks`);
  mkdirSync(tasksParent, { recursive: true });
  const wt = createTaskWorktree({
    primaryRoot: primary,
    tasksParent,
    checkoutRoot: packageRoot,
  });
  if (!wt.ok) {
    checks.push({
      id,
      ok: false,
      reason: "worktree_failed",
      code: wt.code,
      message: wt.message,
    });
    return;
  }

  if (expect.expectFile) {
    const p = join(wt.worktreePath, expect.expectFile);
    if (!existsSync(p)) {
      checks.push({
        id,
        ok: false,
        reason: "adopted_file_missing",
        expectFile: expect.expectFile,
      });
      removeTaskWorktree(primary, wt.worktreePath);
      return;
    }
  }

  process.env.PATHCODE_GATEWAY_FAKE_ENGINE = "1";
  process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP = "1";
  const rt = createGatewayRuntime({ packageRoot, runtimeRoot });
  await rt.bindProject({ cwd: primary });
  /** @type {string[]} */
  const events = [];
  rt.onEvent((env) => {
    if (typeof env?.event?.type === "string") events.push(env.event.type);
  });
  const started = await rt.startTask({
    objective: `Live proof ${id}: inspect and implement a tiny change`,
  });
  if (!started.ok) {
    checks.push({
      id,
      ok: false,
      reason: "start_failed",
      message: started.message,
    });
    delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
    delete process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;
    removeTaskWorktree(primary, wt.worktreePath);
    return;
  }
  await rt.awaitTask(started.taskId);
  const snap = rt.snapshotTask(started.taskId);
  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
  delete process.env.PATHCODE_GATEWAY_SKIP_BOOTSTRAP;

  const after = capturePrimaryFingerprint(primary);
  const preserved = primaryUntouched(before, after);
  const reachedEngineering =
    events.includes("session.engineering.activity") ||
    events.includes("session.engineering.tool") ||
    events.includes("session.engineering.result");
  const blockedGit =
    events.some((e) => e === "session.terminal") &&
    /DIRTY_PRIMARY|DETACHED_HEAD/.test(JSON.stringify(snap));

  // Gateway fake engine creates its own task path; remove our probe worktree.
  removeTaskWorktree(primary, wt.worktreePath);

  checks.push({
    id,
    ok:
      admission.ok &&
      wt.ok &&
      preserved &&
      reachedEngineering &&
      !blockedGit &&
      snap?.status === "completed" &&
      snap?.classification === "VERIFIED",
    admission: {
      detached: admission.detached,
      dirty: admission.dirty,
      branch: admission.branch,
    },
    taskBranch: wt.taskBranch,
    preserved,
    reachedEngineering,
    events,
    status: snap?.status,
    classification: snap?.classification,
  });
}

const root = mkdtempSync(join(tmpdir(), "path-admit-live-"));

{
  const primary = join(root, "clean-branch");
  initRepo(primary);
  await proveShape("clean_named_branch", primary, {});
}

{
  const primary = join(root, "detached");
  initRepo(primary);
  const head = git(primary, ["rev-parse", "HEAD"]).stdout.trim();
  git(primary, ["checkout", "--detach", head]);
  await proveShape("clean_detached_head", primary, { expectDetached: true });
}

{
  const primary = join(root, "dirty");
  initRepo(primary);
  writeFileSync(join(primary, "WIP.md"), "operator local work\n");
  writeFileSync(
    join(primary, "src.js"),
    "export function add(a, b) { return a + b + 10; }\n",
  );
  await proveShape("dirty_working_tree", primary, {
    expectDirty: true,
    expectFile: "WIP.md",
  });
  // Ensure primary still has operator WIP after PATH.
  checks.push({
    id: "dirty_primary_wip_preserved",
    ok:
      existsSync(join(primary, "WIP.md")) &&
      readFileSync(join(primary, "src.js"), "utf8").includes("a + b + 10"),
  });
}

// Mirror operator disposable worktree shape from nordic if present.
const nordic = "/Users/achahbi/Projects/nordic-rain-pathcode-live";
if (existsSync(join(nordic, ".git")) || existsSync(nordic)) {
  const disposable = join(root, "nordic-detach-wt");
  const add = git(nordic, [
    "worktree",
    "add",
    "--detach",
    disposable,
    "HEAD",
  ]);
  if (add.status === 0) {
    await proveShape("nordic_style_detached_worktree", disposable, {
      expectDetached: true,
    });
    git(nordic, ["worktree", "remove", "--force", disposable]);
  } else {
    checks.push({
      id: "nordic_style_detached_worktree",
      ok: false,
      reason: "could_not_create_disposable",
      stderr: add.stderr,
    });
  }
}

const pass = checks.every((c) => c.ok);
writeFileSync(
  join(outDir, "git-state-admission-proof.json"),
  JSON.stringify({ pass, at: new Date().toISOString(), root, checks }, null, 2),
);
console.log(JSON.stringify({ pass, checks }, null, 2));
try {
  rmSync(root, { recursive: true, force: true });
} catch {
  // ignore
}
process.exit(pass ? 0 : 1);
