/**
 * AG3 — Three-root law.
 *
 * PATH_PACKAGE_ROOT  — installed package (read-only assets)
 * PATH_RUNTIME_ROOT  — user-writable PATH state (venv, caches, diag)
 * TARGET_PROJECT_ROOT — user's Git repository (cwd discovery)
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

/**
 * Real filesystem location of this module (symlink-safe for npm/pnpm/nvm bins).
 */
function resolveHereDir() {
  const fromMeta = fileURLToPath(import.meta.url);
  try {
    return dirname(realpathSync(fromMeta));
  } catch {
    return dirname(fromMeta);
  }
}

const HERE = resolveHereDir();

/**
 * Absolute PATH package root (contains package.json). Never process.cwd().
 * Resolves through symlinks so global bin wrappers still find installed assets.
 */
export function resolvePathPackageRoot() {
  const candidate = resolve(join(HERE, "..", ".."));
  try {
    return realpathSync(candidate);
  } catch {
    return candidate;
  }
}

/** @deprecated Prefer resolvePathPackageRoot — kept for AG1/AG2 call sites. */
export function resolveCheckoutRoot() {
  return resolvePathPackageRoot();
}

/**
 * @returns {string} PATH version string from package.json
 */
export function readPathPackageVersion(packageRoot = resolvePathPackageRoot()) {
  try {
    const raw = readFileSync(join(packageRoot, "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" && pkg.version ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * User-writable PATH runtime root (never inside the npm package tree).
 * Override with PATHCODE_RUNTIME_ROOT.
 *
 * @param {{ home?: string, packageRoot?: string }} [opts]
 */
export function resolvePathRuntimeRoot(opts = {}) {
  if (
    typeof process.env.PATHCODE_RUNTIME_ROOT === "string" &&
    process.env.PATHCODE_RUNTIME_ROOT.trim()
  ) {
    return resolve(process.env.PATHCODE_RUNTIME_ROOT.trim());
  }
  const home = opts.home ?? process.env.HOME ?? homedir();
  const version = readPathPackageVersion(opts.packageRoot ?? resolvePathPackageRoot());
  return resolve(join(home, ".path-code", "runtime", `v${version}`));
}

/**
 * Discover the Git project root for the operator's cwd.
 * Also records TARGET_WORKING_SUBDIR when invoked from a repository subdirectory.
 *
 * @param {string} [cwd]
 * @returns {{
 *   ok: true,
 *   projectRoot: string,
 *   gitRepositoryRoot: string,
 *   workingSubdir: string,
 *   invocationCwd: string,
 *   gitDir: string,
 * } | { ok: false, code: string, message: string }}
 */
export function resolveTargetProjectRoot(cwd = process.cwd()) {
  const start = resolve(cwd);
  const probe = spawnSync(
    "git",
    ["rev-parse", "--show-toplevel"],
    {
      cwd: start,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 10_000,
    },
  );
  if (probe.status !== 0) {
    return {
      ok: false,
      code: "NOT_A_GIT_REPO",
      message: "PATH requires a Git repository. cd into a project and try again.",
    };
  }
  let projectRoot = resolve((probe.stdout || "").trim());
  try {
    projectRoot = realpathSync(projectRoot);
  } catch {
    // keep resolved
  }
  if (!projectRoot || !existsSync(projectRoot)) {
    return {
      ok: false,
      code: "NOT_A_GIT_REPO",
      message: "PATH could not resolve the Git project root.",
    };
  }

  let invocationCwd = start;
  try {
    invocationCwd = realpathSync(start);
  } catch {
    // keep resolved
  }

  const rel = relative(projectRoot, invocationCwd);
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    return {
      ok: false,
      code: "INVALID_WORKING_SUBDIR",
      message:
        "Invocation directory is outside the Git repository root. cd into the project and try again.",
    };
  }
  const workingSubdir =
    rel === "" || rel === "."
      ? ""
      : rel.split(/[/\\]/).filter(Boolean).join("/");

  return {
    ok: true,
    projectRoot,
    gitRepositoryRoot: projectRoot,
    workingSubdir,
    invocationCwd,
    gitDir: join(projectRoot, ".git"),
  };
}

/**
 * Effective engineering cwd inside a task worktree for a recorded subdirectory.
 *
 * @param {string} worktreePath
 * @param {string} [workingSubdir]
 */
export function resolveEngineeringCwd(worktreePath, workingSubdir = "") {
  const root = resolve(worktreePath);
  const sub =
    typeof workingSubdir === "string"
      ? workingSubdir.split(/[/\\]/).filter(Boolean).join("/")
      : "";
  if (!sub) return root;
  const candidate = resolve(root, sub);
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    return root;
  }
  return candidate;
}

/**
 * Package runtime prerequisites for Trial/cloud owners that still need dist/.
 * Local AG1/AG2/AG3 engineering does NOT require dist/.
 *
 * @param {string} [root]
 */
export function resolveRuntimePrerequisites(root = resolvePathPackageRoot()) {
  const packageJson = join(root, "package.json");
  const distEntry = join(root, "dist", "cli", "entry.js");
  const distAdapter = join(root, "dist", "adapters", "openai", "index.js");
  const distBrain = join(root, "dist", "brain", "index.js");
  const distMutation = join(
    root,
    "dist",
    "orchestrator",
    "mutation",
    "index.js",
  );
  const tscJs = join(root, "node_modules", "typescript", "lib", "tsc.js");

  if (!existsSync(packageJson)) {
    return {
      ok: false,
      code: "MISSING_PACKAGE",
      message: "Path Code package.json not found beside the launcher.",
    };
  }
  if (
    !existsSync(distEntry) ||
    !existsSync(distAdapter) ||
    !existsSync(distBrain) ||
    !existsSync(distMutation)
  ) {
    return {
      ok: false,
      code: "MISSING_DIST",
      message:
        "Built runtime missing under dist/. Run `npm run build` in this Path Code checkout before launching Trial 1.",
    };
  }
  if (!existsSync(tscJs)) {
    return {
      ok: false,
      code: "MISSING_TYPESCRIPT",
      message:
        "Installed TypeScript compiler missing at node_modules/typescript/lib/tsc.js. Restore dependencies in this checkout.",
    };
  }
  return { ok: true, root, tscJs, distEntry };
}

/**
 * Lightweight package identity check for product engineering (no dist required).
 * @param {string} [root]
 */
export function assertPathPackagePresent(root = resolvePathPackageRoot()) {
  const packageJson = join(root, "package.json");
  if (!existsSync(packageJson)) {
    return {
      ok: false,
      code: "MISSING_PACKAGE",
      message: "PATH package is incomplete (package.json missing).",
    };
  }
  return { ok: true, root };
}

/**
 * @param {string} relativeFromDist e.g. "adapters/openai/index.js"
 * @param {string} [root]
 */
export function distHref(relativeFromDist, root = resolvePathPackageRoot()) {
  return pathToFileURL(join(root, "dist", relativeFromDist)).href;
}
