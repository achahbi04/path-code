/**
 * AG1/AG2 — isolated Git task worktree (primary checkout must remain untouched).
 */

import {
  mkdirSync,
  existsSync,
  rmSync,
  readFileSync,
  copyFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  resolveCheckoutRoot,
  resolvePathRuntimeRoot,
} from "../paths.mjs";

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 * @param {{ timeoutMs?: number }} [opts]
 */
function git(cwd, args, opts = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 60_000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trimEnd(),
    stderr: (result.stderr || "").trimEnd(),
    error: result.error ?? null,
  };
}

/**
 * @param {string} repoRoot
 */
export function capturePrimaryFingerprint(repoRoot) {
  const inside = git(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return {
      head: null,
      branch: null,
      porcelain: null,
      ok: true,
      unversioned: true,
    };
  }
  const head = git(repoRoot, ["rev-parse", "HEAD"]);
  const status = git(repoRoot, ["status", "--porcelain=v1", "-uall"]);
  const branch = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  // Unborn repo (init without commit) — still fingerprintable as unversioned bootstrap.
  if (head.status !== 0) {
    return {
      head: null,
      branch: branch.status === 0 ? branch.stdout.trim() : null,
      porcelain: status.status === 0 ? status.stdout : null,
      ok: true,
      unversioned: true,
    };
  }
  return {
    head: head.stdout.trim(),
    branch: branch.status === 0 ? branch.stdout.trim() : null,
    porcelain: status.status === 0 ? status.stdout : null,
    ok: status.status === 0,
    unversioned: false,
  };
}

/**
 * @param {{ head: string | null, porcelain: string | null, ok?: boolean, unversioned?: boolean }} before
 * @param {{ head: string | null, porcelain: string | null, ok?: boolean, unversioned?: boolean }} after
 */
export function primaryUntouched(before, after) {
  // Unversioned / bootstrap in-place: primary IS the engineering workspace.
  if (before?.unversioned === true || after?.unversioned === true) {
    return true;
  }
  return (
    before.ok !== false &&
    after.ok !== false &&
    before.head === after.head &&
    before.porcelain === after.porcelain
  );
}

/**
 * Allocate a unique task id + branch name that do not already exist.
 * @param {string} primaryRoot
 * @param {string} [preferredId]
 */
export function allocateTaskIdentity(primaryRoot, preferredId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const taskId = attempt === 0 && preferredId ? preferredId : randomUUID();
    const taskBranch = `path/task-${taskId}`;
    const exists = git(primaryRoot, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${taskBranch}`,
    ]);
    if (exists.status !== 0) {
      return { taskId, taskBranch };
    }
  }
  const taskId = randomUUID();
  return { taskId, taskBranch: `path/task-${taskId}-${Date.now()}` };
}

/**
 * Copy primary working-tree state into an isolated task worktree without
 * mutating the primary checkout.
 *
 * Tracked edits: `git stash create` (no primary side effects) + apply in WT.
 * Untracked project files: copied by porcelain path.
 *
 * @param {{
 *   primaryRoot: string,
 *   worktreePath: string,
 * }} input
 * @returns {{
 *   ok: true,
 *   adoptedTracked: boolean,
 *   adoptedUntracked: number,
 * } | {
 *   ok: false,
 *   code: string,
 *   message: string,
 * }}
 */
export function materializePrimaryWorkingTree(input) {
  const primaryRoot = resolve(input.primaryRoot);
  const worktreePath = resolve(input.worktreePath);
  const before = capturePrimaryFingerprint(primaryRoot);
  if (!before.ok) {
    return {
      ok: false,
      code: "AG1_PRIMARY_GIT_UNAVAILABLE",
      message: `Cannot read primary Git state under ${primaryRoot}`,
    };
  }
  if (!before.porcelain || before.porcelain.trim() === "") {
    return { ok: true, adoptedTracked: false, adoptedUntracked: 0 };
  }

  let adoptedTracked = false;
  const stash = git(primaryRoot, ["stash", "create"]);
  const stashSha =
    stash.status === 0 && /^[0-9a-f]{40}$/i.test(stash.stdout.trim())
      ? stash.stdout.trim()
      : null;
  if (stashSha) {
    // Prefer keeping index state when present; fall back to working-tree only.
    let apply = git(worktreePath, [
      "stash",
      "apply",
      "--quiet",
      "--index",
      stashSha,
    ]);
    if (apply.status !== 0) {
      apply = git(worktreePath, ["stash", "apply", "--quiet", stashSha]);
    }
    if (apply.status !== 0) {
      // Last resort: apply the stash patch as a plain diff.
      const patch = git(primaryRoot, [
        "stash",
        "show",
        "-p",
        "--include-untracked",
        stashSha,
      ]);
      if (patch.status === 0 && patch.stdout) {
        const applied = spawnSync("git", ["apply", "--whitespace=nowarn", "-"], {
          cwd: worktreePath,
          input: patch.stdout,
          encoding: "utf8",
          timeout: 60_000,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0",
            GIT_OPTIONAL_LOCKS: "0",
          },
        });
        if ((applied.status ?? 1) !== 0) {
          return {
            ok: false,
            code: "AG1_ADOPT_WORKING_TREE_FAILED",
            message:
              apply.stderr ||
              applied.stderr ||
              "Failed to adopt primary working-tree changes into the task workspace",
          };
        }
      } else {
        return {
          ok: false,
          code: "AG1_ADOPT_WORKING_TREE_FAILED",
          message:
            apply.stderr ||
            apply.stdout ||
            "Failed to adopt primary working-tree changes into the task workspace",
        };
      }
    }
    adoptedTracked = true;
  }

  let adoptedUntracked = 0;
  for (const line of before.porcelain.split("\n")) {
    if (!line || line.length < 4) continue;
    const code = line.slice(0, 2);
    if (code !== "??" && code !== "A " && code[0] !== "?") continue;
    // Porcelain path; handle renames sparingly — untracked are simple.
    let rel = line.slice(3);
    if (rel.startsWith('"') && rel.endsWith('"')) {
      // Best-effort unescape of quoted paths.
      rel = rel.slice(1, -1).replace(/\\([\\"ntr])/g, (_, c) => {
        if (c === "n") return "\n";
        if (c === "t") return "\t";
        if (c === "r") return "\r";
        return c;
      });
    }
    if (!rel || rel.endsWith("/")) continue;
    const src = join(primaryRoot, rel);
    const dest = join(worktreePath, rel);
    try {
      if (!existsSync(src) || !statSync(src).isFile()) continue;
      mkdirSync(dirname(dest), { recursive: true });
      if (!existsSync(dest)) {
        copyFileSync(src, dest);
        adoptedUntracked += 1;
      }
    } catch {
      // Skip unreadable paths; tracked adopt already carried the durable edits.
    }
  }

  const after = capturePrimaryFingerprint(primaryRoot);
  if (!primaryUntouched(before, after)) {
    return {
      ok: false,
      code: "AG1_PRIMARY_TOUCHED",
      message:
        "Primary checkout changed while adopting working-tree state into the task workspace.",
    };
  }

  return { ok: true, adoptedTracked, adoptedUntracked };
}

/**
 * Create an isolated linked worktree for one engineering task.
 *
 * Checks out a unique local branch `path/task-<id>` at baselineCommit
 * (sessionBaseCommit or primary HEAD). Detached primary HEAD is fine — the
 * task branch is created at that commit. When the primary working tree is
 * dirty and the baseline is the primary HEAD, current modifications are
 * adopted into the task workspace without mutating the primary.
 *
 * @param {{
 *   primaryRoot: string,
 *   taskId?: string,
 *   baselineCommit?: string,
 *   tasksParent?: string,
 *   checkoutRoot?: string,
 *   runtimeRoot?: string,
 *   adoptPrimaryWorkingTree?: boolean,
 * }} input
 */
export function createTaskWorktree(input) {
  const primaryRoot = resolve(input.primaryRoot);
  const checkoutRoot = input.checkoutRoot ?? resolveCheckoutRoot();
  const runtimeRoot =
    input.runtimeRoot ??
    resolvePathRuntimeRoot({ packageRoot: checkoutRoot });
  // AG5: disposable task worktrees live under PATH_RUNTIME_ROOT (never the
  // installed package tree, which must remain a relocatable read-only asset).
  const tasksParent =
    input.tasksParent ?? join(runtimeRoot, "ag1-tasks");
  const adoptPrimaryWorkingTree = input.adoptPrimaryWorkingTree !== false;

  mkdirSync(tasksParent, { recursive: true });

  const before = capturePrimaryFingerprint(primaryRoot);
  if (!before.ok) {
    return {
      ok: false,
      code: "AG1_PRIMARY_GIT_UNAVAILABLE",
      message: `Cannot read primary Git state under ${primaryRoot}`,
    };
  }

  // Unversioned existing project: engineer in-place on the primary until Git
  // exists. Do not invent a fake .git, and never delete the primary on cleanup.
  if (before.unversioned === true || !before.head) {
    const { taskId } = allocateTaskIdentity(primaryRoot, input.taskId);
    return {
      ok: true,
      taskId,
      taskBranch: null,
      worktreePath: resolve(primaryRoot),
      baseline: {
        head: null,
        branch: null,
        porcelain: before.porcelain,
        unversioned: true,
      },
      primaryBefore: before,
      adoptedWorkingTree: null,
      bootstrapMode: "unversioned_inplace",
    };
  }

  const baselineCommit =
    typeof input.baselineCommit === "string" &&
    /^[0-9a-f]{7,40}$/i.test(input.baselineCommit.trim())
      ? input.baselineCommit.trim()
      : before.head;

  const verify = git(primaryRoot, ["cat-file", "-e", `${baselineCommit}^{commit}`]);
  if (verify.status !== 0) {
    return {
      ok: false,
      code: "AG2_BASELINE_MISSING",
      message: `Session baseline commit is not available: ${baselineCommit}`,
    };
  }

  const { taskId, taskBranch } = allocateTaskIdentity(primaryRoot, input.taskId);
  const worktreePath = join(tasksParent, taskId);

  if (existsSync(worktreePath)) {
    return {
      ok: false,
      code: "AG1_WORKTREE_EXISTS",
      message: `Task worktree path already exists: ${worktreePath}`,
    };
  }

  // Named branch at the session baseline — durable artifact; worktree is ephemeral.
  // Works from detached HEAD: -b creates path/task-* at the exact commit.
  const add = git(primaryRoot, [
    "worktree",
    "add",
    "-b",
    taskBranch,
    worktreePath,
    baselineCommit,
  ]);
  if (add.status !== 0) {
    return {
      ok: false,
      code: "AG1_WORKTREE_ADD_FAILED",
      message: add.stderr || add.stdout || "git worktree add failed",
    };
  }

  const healthy = assertTaskWorktreeGitHealthy(worktreePath, primaryRoot);
  if (!healthy.ok) {
    git(primaryRoot, ["worktree", "remove", "--force", worktreePath]);
    git(primaryRoot, ["branch", "-D", taskBranch]);
    return {
      ok: false,
      code: healthy.code || "AG1_WORKTREE_GIT_UNHEALTHY",
      message:
        healthy.message ||
        `Task worktree Git linkage is invalid after create: ${worktreePath}`,
    };
  }

  /** @type {{ ok: true, adoptedTracked: boolean, adoptedUntracked: number } | null} */
  let adopted = null;
  const shouldAdopt =
    adoptPrimaryWorkingTree &&
    typeof before.porcelain === "string" &&
    before.porcelain.trim() !== "" &&
    baselineCommit === before.head;

  if (shouldAdopt) {
    const materialize = materializePrimaryWorkingTree({
      primaryRoot,
      worktreePath,
    });
    if (!materialize.ok) {
      git(primaryRoot, ["worktree", "remove", "--force", worktreePath]);
      git(primaryRoot, ["branch", "-D", taskBranch]);
      return materialize;
    }
    adopted = materialize;
  }

  const after = capturePrimaryFingerprint(primaryRoot);
  if (!primaryUntouched(before, after)) {
    git(primaryRoot, ["worktree", "remove", "--force", worktreePath]);
    git(primaryRoot, ["branch", "-D", taskBranch]);
    return {
      ok: false,
      code: "AG1_PRIMARY_TOUCHED",
      message: "Primary checkout changed while creating the task worktree.",
    };
  }

  let resolvedWorktree = resolve(worktreePath);
  try {
    if (existsSync(resolvedWorktree)) {
      resolvedWorktree = realpathSync(resolvedWorktree);
    }
  } catch {
    // keep resolve() result
  }

  return {
    ok: true,
    taskId,
    taskBranch,
    worktreePath: resolvedWorktree,
    baseline: {
      head: baselineCommit,
      branch: before.branch,
      porcelain: before.porcelain,
    },
    primaryBefore: before,
    adoptedWorkingTree: adopted,
    bootstrapMode: null,
  };
}

/**
 * True when a task worktree's `.git` linkage is valid and ordinary Git commands
 * succeed (`rev-parse --show-toplevel`, branch when attached).
 *
 * @param {string} worktreePath
 * @param {string} [primaryRoot]
 * @returns {{
 *   ok: boolean,
 *   code?: string,
 *   message?: string,
 *   toplevel?: string,
 *   branch?: string | null,
 *   gitdir?: string | null,
 * }}
 */
export function assertTaskWorktreeGitHealthy(worktreePath, primaryRoot) {
  const root = resolve(worktreePath);
  if (!existsSync(root)) {
    return {
      ok: false,
      code: "AG1_WORKTREE_MISSING",
      message: `Task worktree path missing: ${root}`,
    };
  }
  const dotGit = join(root, ".git");
  /** @type {string | null} */
  let gitdir = null;
  try {
    const st = statSync(dotGit);
    if (st.isFile()) {
      const text = readFileSync(dotGit, "utf8");
      const match = /^gitdir:\s*(.+?)\s*$/m.exec(text);
      if (!match) {
        return {
          ok: false,
          code: "AG1_WORKTREE_GITDIR_MALFORMED",
          message: `Task worktree .git pointer is malformed: ${dotGit}`,
        };
      }
      const target = match[1];
      gitdir = target.startsWith("/") ? target : resolve(root, target);
      if (!existsSync(gitdir)) {
        // Best-effort repair before declaring failure.
        if (typeof primaryRoot === "string" && primaryRoot) {
          const repaired = repairTaskWorktreeGit(primaryRoot, root);
          if (repaired.ok) {
            return assertTaskWorktreeGitHealthy(root);
          }
        }
        return {
          ok: false,
          code: "AG1_WORKTREE_GITDIR_MISSING",
          message:
            `Task worktree .git points at missing admin metadata: ${gitdir}`,
          gitdir,
        };
      }
    } else if (!st.isDirectory()) {
      return {
        ok: false,
        code: "AG1_WORKTREE_GIT_MISSING",
        message: `Task worktree has no usable .git: ${dotGit}`,
      };
    }
  } catch {
    return {
      ok: false,
      code: "AG1_WORKTREE_GIT_MISSING",
      message: `Task worktree .git unreadable: ${dotGit}`,
    };
  }

  const inside = git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return {
      ok: false,
      code: "AG1_WORKTREE_NOT_GIT",
      message:
        inside.stderr ||
        inside.stdout ||
        `fatal: not a git repository: ${root}`,
      gitdir,
    };
  }
  const toplevel = git(root, ["rev-parse", "--show-toplevel"]);
  if (toplevel.status !== 0 || !toplevel.stdout.trim()) {
    return {
      ok: false,
      code: "AG1_WORKTREE_TOPLEVEL_FAILED",
      message:
        toplevel.stderr ||
        toplevel.stdout ||
        `git rev-parse --show-toplevel failed in ${root}`,
      gitdir,
    };
  }
  const branch = git(root, ["branch", "--show-current"]);
  return {
    ok: true,
    toplevel: toplevel.stdout.trim(),
    branch: branch.status === 0 ? branch.stdout.trim() || null : null,
    gitdir,
  };
}

/**
 * Attempt `git worktree repair` when a linked worktree directory still exists
 * but admin metadata was removed while engines held the tree open.
 *
 * @param {string} primaryRoot
 * @param {string} worktreePath
 */
export function repairTaskWorktreeGit(primaryRoot, worktreePath) {
  const primary = resolve(primaryRoot);
  const target = resolve(worktreePath);
  if (!existsSync(target)) {
    return { ok: false, code: "MISSING", message: "worktree path missing" };
  }
  const repair = git(primary, ["worktree", "repair", target]);
  if (repair.status === 0) {
    const check = assertTaskWorktreeGitHealthy(target);
    if (check.ok) return { ok: true, repaired: true, ...check };
  }
  // Older Git without repair — try prune + re-add if branch still exists.
  git(primary, ["worktree", "prune"]);
  const branch = git(target, ["rev-parse", "--abbrev-ref", "HEAD"]);
  // Branch probe may fail if gitdir is broken; discover from path basename.
  const base = target.split(/[/\\]/).filter(Boolean).pop() || "";
  const guessed = base ? `path/task-${base}` : "";
  const candidates = [
    branch.status === 0 ? branch.stdout.trim() : "",
    guessed,
  ].filter(Boolean);
  for (const taskBranch of candidates) {
    const exists = git(primary, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${taskBranch}`,
    ]);
    if (exists.status !== 0) continue;
    // Remove broken checkout dir contents carefully: only if .git is a pointer file.
    try {
      const dotGit = join(target, ".git");
      if (existsSync(dotGit) && statSync(dotGit).isFile()) {
        rmSync(target, { recursive: true, force: true });
      }
    } catch {
      // fall through
    }
    if (existsSync(target)) continue;
    const add = git(primary, ["worktree", "add", target, taskBranch]);
    if (add.status === 0) {
      const check = assertTaskWorktreeGitHealthy(target);
      if (check.ok) return { ok: true, repaired: true, readded: true, ...check };
    }
  }
  return {
    ok: false,
    code: "REPAIR_FAILED",
    message: repair.stderr || repair.stdout || "git worktree repair failed",
  };
}

/**
 * Collect final Git evidence from the task worktree.
 * @param {string} worktreePath
 * @param {string} baselineHead
 */
export function collectWorktreeResult(worktreePath, baselineHead) {
  const inside = git(worktreePath, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return {
      ok: true,
      porcelain: "",
      diff: "",
      diffStat: "",
      changedFiles: [],
      unversioned: true,
    };
  }

  const status = git(worktreePath, ["status", "--porcelain=v1", "-uall"]);
  const hasBaseline =
    typeof baselineHead === "string" && /^[0-9a-f]{7,40}$/i.test(baselineHead);

  const diff = hasBaseline
    ? git(worktreePath, ["diff", "--no-ext-diff", baselineHead])
    : git(worktreePath, ["diff", "--no-ext-diff", "HEAD"]);
  const diffStat = hasBaseline
    ? git(worktreePath, ["diff", "--stat", "--no-ext-diff", baselineHead])
    : git(worktreePath, ["diff", "--stat", "--no-ext-diff", "HEAD"]);
  const nameOnly = hasBaseline
    ? git(worktreePath, ["diff", "--name-only", "--no-ext-diff", baselineHead])
    : git(worktreePath, ["diff", "--name-only", "--no-ext-diff", "HEAD"]);
  const cachedNameOnly = hasBaseline
    ? git(worktreePath, [
        "diff",
        "--cached",
        "--name-only",
        "--no-ext-diff",
        baselineHead,
      ])
    : git(worktreePath, ["diff", "--cached", "--name-only", "--no-ext-diff"]);
  const untracked = git(worktreePath, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);

  /** @type {string[]} */
  const fromPorcelain = [];
  if (status.status === 0) {
    for (const line of status.stdout.split("\n")) {
      const trimmed = line.trimEnd();
      if (!trimmed) continue;
      // porcelain v1: XY<space>path  or  XY<space>orig -> path
      const pathPart = trimmed.slice(3).split(" -> ").pop() || "";
      const rel = pathPart.replace(/^"|"$/g, "").trim();
      if (rel) fromPorcelain.push(rel);
    }
  }

  // git diff exits 1 when differences exist (with --exit-code) and some
  // environments surface that even without the flag — treat 0|1 as success.
  const diffOk = (r) => r.status === 0 || r.status === 1;

  const changedFiles = [
    ...new Set([
      ...(diffOk(nameOnly) ? nameOnly.stdout.split("\n").filter(Boolean) : []),
      ...(diffOk(cachedNameOnly)
        ? cachedNameOnly.stdout.split("\n").filter(Boolean)
        : []),
      ...(untracked.status === 0
        ? untracked.stdout.split("\n").filter(Boolean)
        : []),
      ...fromPorcelain,
    ]),
  ].sort();

  return {
    ok: status.status === 0,
    porcelain: status.status === 0 ? status.stdout : "",
    diff: diffOk(diff) ? diff.stdout : "",
    diffStat: diffOk(diffStat) ? diffStat.stdout : "",
    changedFiles,
    unversioned: false,
  };
}

/**
 * Authoritative changed-file list for a durable task commit vs baseline.
 * Prefer this after commitTaskWorktree so /inspect and reports match Git.
 *
 * @param {string} worktreePath
 * @param {string | null | undefined} baselineHead
 * @param {string | null | undefined} commitSha
 * @returns {string[]}
 */
export function listCommitChangedFiles(worktreePath, baselineHead, commitSha) {
  const base =
    typeof baselineHead === "string" && /^[0-9a-f]{7,40}$/i.test(baselineHead)
      ? baselineHead
      : "";
  const sha =
    typeof commitSha === "string" && /^[0-9a-f]{7,40}$/i.test(commitSha)
      ? commitSha
      : "";
  if (!base || !sha || base.toLowerCase() === sha.toLowerCase()) {
    return [];
  }
  const nameOnly = git(worktreePath, [
    "diff",
    "--name-only",
    "--no-ext-diff",
    base,
    sha,
  ]);
  // 0 = identical trees, 1 = differences (both are successful invocations).
  if (nameOnly.status !== 0 && nameOnly.status !== 1) return [];
  return [
    ...new Set(
      nameOnly.stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].sort();
}

/** Basenames that dependency/setup tooling commonly mutates without intent. */
export const INCIDENTAL_SETUP_BASENAMES = Object.freeze([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "npm-shrinkwrap.json",
  "Cargo.lock",
  "poetry.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
  "bun.lockb",
  "bun.lock",
]);

/**
 * True when the objective is a read-only assessment / inspect / report and
 * must not produce incidental setup churn as the engineering result.
 * Explicit dependency-upgrade / lockfile-update intents return false.
 *
 * "Do not modify any other file" alongside create/add/write intent is NOT
 * read-only — that phrasing constrains scope, it does not forbid the create.
 *
 * @param {string} text
 */
export function isReadOnlyAssessmentObjective(text) {
  const t = String(text || "");
  if (!t.trim()) return false;
  // S5 — Build evaluate/challenge are assessment-shaped even when the durable
  // outcome text mentions create/implement (those verbs describe the product,
  // not this task's mutation authority).
  if (
    /\bPATH Build (evaluate|challenge) task\b/i.test(t) &&
    /\bassessment only\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(upgrade|update|bump|refresh|pin)\b[\s\S]{0,40}\b(dependenc|lockfile|package-lock|pnpm-lock|yarn\.lock)\b/i.test(
      t,
    ) ||
    /\b(dependenc|lockfile|package-lock)\b[\s\S]{0,40}\b(upgrade|update|bump|refresh)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  // Positive edit/create intent wins over a later "do not modify any other
  // file" scope constraint (common in Cursor operator acceptance prompts).
  const positiveEdit =
    /\b(create|implement|fix|repair|refactor|migrate)\b/i.test(t) ||
    /\b(add|write|append|edit|update)\s+(a\s+|the\s+|an\s+)?(file|files|code|line|lines)\b/i.test(
      t,
    ) ||
    /\b(add|write|append)\s+\S+\.(md|ts|tsx|js|jsx|json|py|go|rs)\b/i.test(t);
  if (positiveEdit) {
    return false;
  }
  if (
    /\bdo not (modify|change|edit|write|alter|touch)\b/i.test(t) ||
    /\bwithout (modifying|changing|editing|altering|writing)\b/i.test(t) ||
    /\bread-?only\b/i.test(t) ||
    /\bno (file |code )?changes?\b/i.test(t)
  ) {
    return true;
  }
  const assess =
    /\b(assess|inspect|check|review|audit|report|identify|findings?|investigate)\b/i.test(
      t,
    );
  const modify =
    /\b(fix|repair|implement|refactor|migrate|add |create |delete |remove |edit |modify|write |change )\b/i.test(
      t,
    );
  return assess && !modify;
}

/**
 * @param {string} filePath
 */
function isIncidentalSetupPath(filePath) {
  const base = String(filePath || "").split(/[\\/]/).pop() || "";
  return INCIDENTAL_SETUP_BASENAMES.some(
    (name) => name.toLowerCase() === base.toLowerCase(),
  );
}

/**
 * Restore known setup-only files in the task worktree to the baseline commit
 * so read-only assessments do not produce lockfile-only task commits.
 *
 * @param {{
 *   worktreePath: string,
 *   baselineHead: string,
 *   objective: string,
 * }} input
 * @returns {{
 *   applied: boolean,
 *   restored: string[],
 *   reason: string,
 * }}
 */
export function restoreIncidentalSetupChurn(input) {
  const worktreePath = resolve(input.worktreePath);
  const baselineHead = String(input.baselineHead || "").trim();
  if (!isReadOnlyAssessmentObjective(input.objective || "")) {
    return { applied: false, restored: [], reason: "not_read_only" };
  }
  if (!/^[0-9a-f]{7,40}$/i.test(baselineHead)) {
    return { applied: false, restored: [], reason: "no_baseline" };
  }

  const nameOnly = git(worktreePath, [
    "diff",
    "--name-only",
    "--no-ext-diff",
    baselineHead,
  ]);
  const untracked = git(worktreePath, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  const dirty = [
    ...(nameOnly.status === 0
      ? nameOnly.stdout.split("\n").map((s) => s.trim()).filter(Boolean)
      : []),
    ...(untracked.status === 0
      ? untracked.stdout.split("\n").map((s) => s.trim()).filter(Boolean)
      : []),
  ];
  const incidental = [...new Set(dirty.filter(isIncidentalSetupPath))];
  if (incidental.length === 0) {
    return { applied: false, restored: [], reason: "no_incidental" };
  }
  // Only restore when EVERY dirty path is incidental setup — never hide real edits.
  const intentional = dirty.filter((p) => !isIncidentalSetupPath(p));
  if (intentional.length > 0) {
    return {
      applied: false,
      restored: [],
      reason: "intentional_changes_present",
    };
  }

  /** @type {string[]} */
  const restored = [];
  for (const rel of incidental) {
    const tracked = git(worktreePath, [
      "ls-tree",
      "--name-only",
      baselineHead,
      "--",
      rel,
    ]);
    if (tracked.status === 0 && tracked.stdout.trim()) {
      const co = git(worktreePath, [
        "checkout",
        "-f",
        baselineHead,
        "--",
        rel,
      ]);
      if (co.status === 0) restored.push(rel);
    } else {
      // Untracked setup artifact — remove from the task worktree.
      try {
        const abs = resolve(worktreePath, rel);
        if (existsSync(abs)) {
          rmSync(abs, { force: true });
          restored.push(rel);
        }
      } catch {
        // ignore
      }
    }
  }
  return {
    applied: restored.length > 0,
    restored,
    reason: restored.length > 0 ? "restored" : "restore_failed",
  };
}

/**
 * Reopen an existing PATH task worktree for resume (G10).
 * Does not create a new branch; binds to the durable task branch/worktree.
 *
 * @param {{
 *   primaryRoot: string,
 *   taskId: string,
 *   worktreePath?: string,
 *   tasksParent?: string,
 *   checkoutRoot?: string,
 *   runtimeRoot?: string,
 * }} input
 */
export function reopenTaskWorktree(input) {
  const primaryRoot = resolve(input.primaryRoot);
  const checkoutRoot = input.checkoutRoot ?? resolveCheckoutRoot();
  const runtimeRoot =
    input.runtimeRoot ??
    resolvePathRuntimeRoot({ packageRoot: checkoutRoot });
  const tasksParent =
    input.tasksParent ?? join(runtimeRoot, "ag1-tasks");
  const taskId = String(input.taskId || "").trim();
  if (!taskId) {
    return {
      ok: false,
      code: "G10_RESUME_NO_TASK_ID",
      message: "Resume requires a task id",
    };
  }
  const taskBranch = `path/task-${taskId}`;
  const worktreePath = resolve(
    typeof input.worktreePath === "string" && input.worktreePath.trim()
      ? input.worktreePath.trim()
      : join(tasksParent, taskId),
  );
  const before = capturePrimaryFingerprint(primaryRoot);
  if (!before.ok) {
    return {
      ok: false,
      code: "AG1_PRIMARY_GIT_UNAVAILABLE",
      message: `Cannot read primary Git state under ${primaryRoot}`,
    };
  }
  if (before.unversioned === true || !before.head) {
    // Resume into in-place unversioned bootstrap (primary is the workspace).
    return {
      ok: true,
      taskId,
      taskBranch: null,
      worktreePath: resolve(primaryRoot),
      baseline: {
        head: null,
        branch: null,
        porcelain: before.porcelain,
        unversioned: true,
      },
      primaryBefore: before,
      bootstrapMode: "unversioned_inplace",
    };
  }

  if (existsSync(worktreePath)) {
    const health = assertTaskWorktreeGitHealthy(worktreePath, primaryRoot);
    if (!health.ok) {
      const repaired = repairTaskWorktreeGit(primaryRoot, worktreePath);
      if (!repaired.ok) {
        return {
          ok: false,
          code: health.code || "G10_RESUME_WORKTREE_UNHEALTHY",
          message:
            health.message ||
            `Existing task worktree Git linkage is invalid: ${worktreePath}`,
        };
      }
    }
    const head = git(worktreePath, ["rev-parse", "HEAD"]);
    const branch = git(worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return {
      ok: true,
      resumed: true,
      taskId,
      taskBranch:
        branch.status === 0 && branch.stdout.trim()
          ? branch.stdout.trim()
          : taskBranch,
      worktreePath,
      baseline: {
        head: head.status === 0 ? head.stdout.trim() : before.head,
        branch: before.branch,
        porcelain: before.porcelain,
      },
      primaryBefore: before,
    };
  }

  // Worktree path missing but branch may still exist — re-add.
  const branchExists = git(primaryRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${taskBranch}`,
  ]);
  if (branchExists.status !== 0) {
    return {
      ok: false,
      code: "G10_RESUME_BRANCH_MISSING",
      message: `Task branch missing for resume: ${taskBranch}`,
    };
  }
  mkdirSync(tasksParent, { recursive: true });
  const add = git(primaryRoot, [
    "worktree",
    "add",
    worktreePath,
    taskBranch,
  ]);
  if (add.status !== 0) {
    return {
      ok: false,
      code: "G10_RESUME_WORKTREE_ADD_FAILED",
      message: add.stderr || add.stdout || "git worktree add failed on resume",
    };
  }
  const after = capturePrimaryFingerprint(primaryRoot);
  if (!primaryUntouched(before, after)) {
    git(primaryRoot, ["worktree", "remove", "--force", worktreePath]);
    return {
      ok: false,
      code: "AG1_PRIMARY_TOUCHED",
      message: "Primary checkout changed while resuming the task worktree.",
    };
  }
  const head = git(worktreePath, ["rev-parse", "HEAD"]);
  return {
    ok: true,
    resumed: true,
    taskId,
    taskBranch,
    worktreePath: resolve(worktreePath),
    baseline: {
      head: head.status === 0 ? head.stdout.trim() : before.head,
      branch: before.branch,
      porcelain: before.porcelain,
    },
    primaryBefore: before,
  };
}

/**
 * Remove a task worktree (best effort). Leaves primary untouched.
 * Task branch is preserved by default.
 *
 * @param {string} primaryRoot
 * @param {string} worktreePath
 * @param {{ prune?: boolean }} [opts]
 */
export function removeTaskWorktree(primaryRoot, worktreePath, opts = {}) {
  const primary = resolve(primaryRoot);
  const target = resolve(worktreePath);
  // Never delete an in-place unversioned bootstrap workspace (primary itself).
  if (target === primary) {
    return {
      ok: true,
      code: "BOOTSTRAP_INPLACE_KEPT",
      primaryUntouched: true,
      worktreePath: target,
    };
  }
  const before = capturePrimaryFingerprint(primaryRoot);
  const rm = git(primaryRoot, ["worktree", "remove", "--force", worktreePath]);
  if (rm.status !== 0 && existsSync(worktreePath)) {
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      // leave inspectable
    }
  }
  // If git removed admin metadata but left a directory with a dangling gitdir
  // pointer, force-remove the broken checkout so we never strand engines on it.
  if (existsSync(worktreePath) && !assertTaskWorktreeGitHealthy(worktreePath).ok) {
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      // leave inspectable
    }
  }
  // AG5: never unconditionally prune — that can drop unrelated user worktrees.
  // Callers that need prune must opt in after proving only PATH-owned stale entries.
  if (opts.prune === true) {
    git(primaryRoot, ["worktree", "prune"]);
  }
  const after = capturePrimaryFingerprint(primaryRoot);
  const gone = !existsSync(worktreePath);
  return {
    ok: gone,
    code: gone ? "CLEANED" : "CLEANUP_INCOMPLETE",
    primaryUntouched: primaryUntouched(before, after),
    worktreePath,
  };
}

/**
 * List registered worktrees under the primary repo.
 * @param {string} primaryRoot
 */
export function listWorktrees(primaryRoot) {
  const listed = git(primaryRoot, ["worktree", "list", "--porcelain"]);
  if (listed.status !== 0) {
    return { ok: false, entries: [], raw: listed.stderr };
  }
  /** @type {{ path: string, head?: string, branch?: string, detached?: boolean }[]} */
  const entries = [];
  /** @type {{ path?: string, head?: string, branch?: string, detached?: boolean }} */
  let cur = {};
  for (const line of listed.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur.path) entries.push(/** @type {any} */ (cur));
      cur = { path: line.slice("worktree ".length) };
    } else if (line.startsWith("HEAD ")) {
      cur.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      cur.branch = line.slice("branch ".length);
    } else if (line === "detached") {
      cur.detached = true;
    } else if (line === "") {
      if (cur.path) entries.push(/** @type {any} */ (cur));
      cur = {};
    }
  }
  if (cur.path) entries.push(/** @type {any} */ (cur));
  return { ok: true, entries, raw: listed.stdout };
}

/**
 * Capture a bounded per-file unified diff for the living engineering surface.
 * Falls back to an all-additions preview for new untracked files.
 *
 * @param {string} worktreePath
 * @param {string} baselineHead
 * @param {string} relPath
 * @param {{ maxBytes?: number }} [opts]
 * @returns {{ path: string, diff: string, added: number, removed: number }}
 */
export function captureFileDiffForUi(worktreePath, baselineHead, relPath, opts = {}) {
  const maxBytes =
    typeof opts.maxBytes === "number" && opts.maxBytes > 0
      ? opts.maxBytes
      : 12_000;
  const path = String(relPath || "").replace(/^\.\//, "").trim();
  if (!path || path.includes("\0")) {
    return { path: "", diff: "", added: 0, removed: 0 };
  }
  const root = resolve(worktreePath);
  let diffText = "";
  if (baselineHead) {
    const d = git(root, [
      "diff",
      "--no-ext-diff",
      "--no-color",
      "-U3",
      baselineHead,
      "--",
      path,
    ], { timeoutMs: 8_000 });
    if (d.status === 0 && d.stdout.trim()) diffText = d.stdout;
  }
  if (!diffText) {
    // Untracked / new file — synthesize an additions-only hunk.
    try {
      const abs = resolve(root, path);
      if (existsSync(abs)) {
        const body = readFileSync(abs, "utf8").slice(0, maxBytes);
        const bodyLines = body.split("\n");
        const hunk = [
          `diff --git a/${path} b/${path}`,
          `--- /dev/null`,
          `+++ b/${path}`,
          `@@ -0,0 +1,${bodyLines.length} @@`,
          ...bodyLines.map((l) => `+${l}`),
        ];
        diffText = hunk.join("\n");
      }
    } catch {
      // ignore
    }
  }
  if (diffText.length > maxBytes) {
    diffText = `${diffText.slice(0, maxBytes)}\n…`;
  }
  let added = 0;
  let removed = 0;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
  }
  return { path, diff: diffText, added, removed };
}

/**
 * Bounded plaintext preview of a file for Read ops.
 * @param {string} worktreePath
 * @param {string} relPath
 * @param {{ maxLines?: number }} [opts]
 */
export function captureFilePreviewForUi(worktreePath, relPath, opts = {}) {
  const maxLines =
    typeof opts.maxLines === "number" && opts.maxLines > 0
      ? opts.maxLines
      : 8;
  const path = String(relPath || "").replace(/^\.\//, "").trim();
  if (!path) return { path: "", preview: "" };
  try {
    const abs = resolve(worktreePath, path);
    if (!existsSync(abs)) return { path, preview: "" };
    const text = readFileSync(abs, "utf8");
    const preview = text.split("\n").slice(0, maxLines).join("\n");
    return { path, preview: preview.slice(0, 4_000) };
  } catch {
    return { path, preview: "" };
  }
}
