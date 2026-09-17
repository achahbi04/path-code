/**
 * AG5 — PATH-owned stale worktree recovery (never global user prune).
 *
 * Only reclaim registrations whose worktree directory is missing or whose
 * linked `.git` pointer is broken. Never remove a healthy live PATH worktree —
 * that deleted `.git/worktrees/<id>` admin metadata while engines still held
 * the directory open, leaving `gitdir:` pointing at a missing path (installed-
 * product operator failure on Klarapp).
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import { listWorktrees, removeTaskWorktree } from "../ag1/task-worktree.mjs";
import {
  resolveCheckoutRoot,
  resolvePathRuntimeRoot,
} from "../paths.mjs";

/**
 * Resolve + realpath when present so macOS `/var` vs `/private/var` (and similar
 * symlink roots) compare equal across git worktree lists and runtime dirs.
 * @param {string} p
 */
function canonicalPath(p) {
  const resolved = resolve(p);
  try {
    if (existsSync(resolved)) return realpathSync(resolved);
  } catch {
    // fall through
  }
  return resolved;
}

/**
 * @param {string} a
 * @param {string} b
 */
function samePath(a, b) {
  if (!a || !b) return false;
  return canonicalPath(a) === canonicalPath(b);
}

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 */
function git(cwd, args) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 30_000,
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
}

/**
 * Directories that hold PATH-owned disposable task worktrees.
 * @param {{ checkoutRoot?: string, runtimeRoot?: string }} [opts]
 */
export function pathOwnedTaskParents(opts = {}) {
  const checkoutRoot = resolve(opts.checkoutRoot ?? resolveCheckoutRoot());
  const runtimeRoot = resolve(
    opts.runtimeRoot ?? resolvePathRuntimeRoot({ packageRoot: checkoutRoot }),
  );
  return [
    join(runtimeRoot, "ag1-tasks"),
    // Legacy AG1–AG4 location (package-local); still reclaim on upgrade.
    join(checkoutRoot, ".path-code-tmp", "ag1-tasks"),
  ];
}

/**
 * True when a registered worktree is clearly PATH-owned.
 * @param {{ path?: string, branch?: string }} entry
 * @param {{ checkoutRoot?: string, runtimeRoot?: string }} [opts]
 */
export function isPathOwnedWorktree(entry, opts = {}) {
  const path = typeof entry.path === "string" ? canonicalPath(entry.path) : "";
  if (!path) return false;
  const parents = pathOwnedTaskParents(opts).map((p) => canonicalPath(p));
  for (const parent of parents) {
    if (path === parent || path.startsWith(parent + "/")) return true;
  }
  const branch = typeof entry.branch === "string" ? entry.branch : "";
  if (/^(refs\/heads\/)?path\/task-/.test(branch)) {
    if (!existsSync(path)) return true;
    if (path.includes(join(".path-code-tmp", "ag1-tasks"))) return true;
    if (path.includes(`${join("ag1-tasks")}${path.includes("/") ? "" : ""}`)) {
      // path/.../ag1-tasks/<uuid>
      if (/[/\\]ag1-tasks[/\\]/.test(path)) return true;
    }
  }
  return false;
}

/**
 * Linked worktree is usable when `.git` resolves and `git rev-parse` works.
 * @param {string} worktreePath
 */
export function isLinkedWorktreeGitHealthy(worktreePath) {
  const root = canonicalPath(worktreePath);
  if (!existsSync(root)) return false;
  const dotGit = join(root, ".git");
  try {
    const st = statSync(dotGit);
    if (st.isDirectory()) {
      const inside = git(root, ["rev-parse", "--is-inside-work-tree"]);
      return inside.status === 0 && inside.stdout.trim() === "true";
    }
    if (!st.isFile()) return false;
    const text = readFileSync(dotGit, "utf8");
    const match = /^gitdir:\s*(.+?)\s*$/m.exec(text);
    if (!match) return false;
    const target = match[1];
    const absolute = isAbsolute(target) ? target : resolve(root, target);
    if (!existsSync(absolute)) return false;
  } catch {
    return false;
  }
  const inside = git(root, ["rev-parse", "--is-inside-work-tree"]);
  return inside.status === 0 && inside.stdout.trim() === "true";
}

/**
 * Recover PATH-owned stale worktrees without pruning unrelated user worktrees
 * and without destroying live healthy task worktrees.
 *
 * @param {{
 *   projectRoot: string,
 *   checkoutRoot?: string,
 *   runtimeRoot?: string,
 * }} opts
 */
export function recoverPathOwnedStaleWorktrees(opts) {
  const projectRoot = canonicalPath(opts.projectRoot);
  const checkoutRoot = opts.checkoutRoot ?? resolveCheckoutRoot();
  const runtimeRoot =
    opts.runtimeRoot ??
    resolvePathRuntimeRoot({ packageRoot: checkoutRoot });
  const listed = listWorktrees(projectRoot);
  if (!listed.ok) {
    return {
      ok: true,
      recovered: [],
      preservedUserWorktrees: [],
      preservedLivePathWorktrees: [],
      pruned: false,
      message: "Could not list worktrees; skipped orphan recovery.",
    };
  }

  const primary = canonicalPath(projectRoot);
  /** @type {Array<{ path: string, branch?: string, action: string }>} */
  const recovered = [];
  /** @type {string[]} */
  const preservedUserWorktrees = [];
  /** @type {string[]} */
  const preservedLivePathWorktrees = [];
  const ownOpts = { checkoutRoot, runtimeRoot };

  for (const entry of listed.entries) {
    const p = typeof entry.path === "string" ? canonicalPath(entry.path) : "";
    if (!p || samePath(p, primary)) continue;
    if (!isPathOwnedWorktree(entry, ownOpts)) {
      preservedUserWorktrees.push(p);
      continue;
    }
    const missing = !existsSync(p);
    const healthy = !missing && isLinkedWorktreeGitHealthy(p);
    if (healthy) {
      // Live / still-usable PATH task worktree — do not touch.
      preservedLivePathWorktrees.push(p);
      continue;
    }
    const cleaned = removeTaskWorktree(projectRoot, p, { prune: false });
    if (missing && !cleaned.ok) {
      const beforePrune = listWorktrees(projectRoot);
      const wouldTouchUser = (beforePrune.entries || []).some((e) => {
        if (!e.path) return false;
        const ep = canonicalPath(e.path);
        if (samePath(ep, primary) || samePath(ep, p)) return false;
        return !existsSync(ep) && !isPathOwnedWorktree(e, ownOpts);
      });
      if (!wouldTouchUser) {
        git(projectRoot, ["worktree", "prune"]);
      }
    }
    recovered.push({
      path: p,
      branch: entry.branch,
      action: cleaned.ok || missing ? "recovered" : "incomplete",
    });
  }

  for (const tasksParent of pathOwnedTaskParents(ownOpts)) {
    if (!existsSync(tasksParent)) continue;
    try {
      for (const name of readdirSync(tasksParent)) {
        const abs = canonicalPath(join(tasksParent, name));
        try {
          if (!statSync(abs).isDirectory()) continue;
        } catch {
          continue;
        }
        const stillRegistered = listed.entries.some(
          (e) => e.path && samePath(e.path, abs),
        );
        if (stillRegistered) {
          // Registered + present: only remove if Git linkage is broken.
          if (isLinkedWorktreeGitHealthy(abs)) continue;
          const cleaned = removeTaskWorktree(projectRoot, abs, { prune: false });
          recovered.push({
            path: abs,
            action: cleaned.ok ? "removed_broken_dir" : "broken_incomplete",
          });
          continue;
        }
        try {
          rmSync(abs, { recursive: true, force: true });
          recovered.push({ path: abs, action: "removed_orphan_dir" });
        } catch {
          // leave inspectable
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    ok: true,
    recovered,
    preservedUserWorktrees,
    preservedLivePathWorktrees,
    pruned: false,
    runtimeRoot: canonicalPath(runtimeRoot),
  };
}
