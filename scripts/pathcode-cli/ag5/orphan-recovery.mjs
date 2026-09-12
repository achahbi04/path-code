/**
 * AG5 — PATH-owned stale worktree recovery (never global user prune).
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { listWorktrees, removeTaskWorktree } from "../ag1/task-worktree.mjs";
import {
  resolveCheckoutRoot,
  resolvePathRuntimeRoot,
} from "../paths.mjs";

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
  const path = typeof entry.path === "string" ? resolve(entry.path) : "";
  if (!path) return false;
  const parents = pathOwnedTaskParents(opts);
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
 * Recover PATH-owned stale worktrees without pruning unrelated user worktrees.
 *
 * @param {{
 *   projectRoot: string,
 *   checkoutRoot?: string,
 *   runtimeRoot?: string,
 * }} opts
 */
export function recoverPathOwnedStaleWorktrees(opts) {
  const projectRoot = resolve(opts.projectRoot);
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
      pruned: false,
      message: "Could not list worktrees; skipped orphan recovery.",
    };
  }

  const primary = resolve(projectRoot);
  /** @type {Array<{ path: string, branch?: string, action: string }>} */
  const recovered = [];
  /** @type {string[]} */
  const preservedUserWorktrees = [];
  const ownOpts = { checkoutRoot, runtimeRoot };

  for (const entry of listed.entries) {
    const p = typeof entry.path === "string" ? resolve(entry.path) : "";
    if (!p || p === primary) continue;
    if (!isPathOwnedWorktree(entry, ownOpts)) {
      preservedUserWorktrees.push(p);
      continue;
    }
    const missing = !existsSync(p);
    const cleaned = removeTaskWorktree(projectRoot, p, { prune: false });
    if (missing && !cleaned.ok) {
      const beforePrune = listWorktrees(projectRoot);
      const wouldTouchUser = (beforePrune.entries || []).some((e) => {
        if (!e.path) return false;
        const ep = resolve(e.path);
        if (ep === primary || ep === p) return false;
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
        const abs = join(tasksParent, name);
        try {
          if (!statSync(abs).isDirectory()) continue;
        } catch {
          continue;
        }
        const stillRegistered = listed.entries.some(
          (e) => e.path && resolve(e.path) === resolve(abs),
        );
        if (stillRegistered) continue;
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
    pruned: false,
    runtimeRoot,
  };
}
