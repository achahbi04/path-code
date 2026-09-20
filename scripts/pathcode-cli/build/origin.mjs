/**
 * S5 — greenfield origin: directory + git init only (no scaffolds).
 * Build-created roots bind the EXACT target directory — never walk to $HOME.
 */

import { existsSync, mkdirSync, realpathSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  resolveTargetProjectRoot,
  assertAllowedProjectRoot,
} from "../paths.mjs";
import { admitPrimaryCheckout } from "../ag1/admission.mjs";

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 */
function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  });
}

/**
 * @param {string} p
 */
function realpathOrResolve(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/**
 * Ensure a Build-origin project root: mkdir + git init only.
 * Architecture is left to the first engineer task.
 *
 * When exactRoot is true (Build-created), projectRoot is ALWAYS the canonical
 * target directory after git init — upward marker discovery (e.g. macOS Public/
 * + ~/.claude.json) cannot hijack binding to $HOME.
 *
 * @param {{
 *   targetDir: string,
 *   bindingId?: string,
 *   exactRoot?: boolean,
 * }} input
 * @returns {{
 *   ok: true,
 *   binding: import('./types.mjs').ProjectBinding,
 *   admission: object,
 *   discovered: object,
 * } | {
 *   ok: false,
 *   code: string,
 *   message: string,
 * }}
 */
export function ensureBuildOrigin(input) {
  const requested = String(input.targetDir || "").trim();
  if (!requested) {
    return {
      ok: false,
      code: "ORIGIN_DIR_REQUIRED",
      message: "Build origin requires a target directory.",
    };
  }

  // Resolve first (may be /var/... before mkdir); re-canonicalize after mkdir.
  let targetDir = resolve(requested);
  const exactRoot = input.exactRoot !== false;

  try {
    mkdirSync(targetDir, { recursive: true });
  } catch (err) {
    return {
      ok: false,
      code: "ORIGIN_MKDIR_FAILED",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  targetDir = realpathOrResolve(targetDir);

  // Exact-root and nested-under-$HOME-git: require a .git directory *inside*
  // targetDir. Parent worktrees must not satisfy "already a repo".
  if (!hasGitDir(targetDir)) {
    const init = git(targetDir, ["init", "--template="]);
    if (init.status !== 0) {
      return {
        ok: false,
        code: "ORIGIN_GIT_INIT_FAILED",
        message: (init.stderr || init.stdout || "git init failed").trim(),
      };
    }
  }

  // Build-created: authoritative root is the directory we just initialized.
  // Do not call resolveTargetProjectRoot — it walks upward and can admit $HOME.
  if (exactRoot) {
    const top = git(targetDir, ["rev-parse", "--show-toplevel"]);
    const toplevel = realpathOrResolve((top.stdout || "").trim() || targetDir);
    if (top.status !== 0 || toplevel !== targetDir) {
      return {
        ok: false,
        code: "ORIGIN_ROOT_MISMATCH",
        message: `Build origin git toplevel ${JSON.stringify(toplevel)} does not match target ${JSON.stringify(targetDir)}.`,
      };
    }

    const allowed = assertAllowedProjectRoot(targetDir);
    if (!allowed.ok) {
      return {
        ok: false,
        code: allowed.code,
        message: allowed.message,
      };
    }

    const admission = admitPrimaryCheckout(targetDir);
    if (!admission.ok) {
      return {
        ok: false,
        code: admission.code || "ORIGIN_ADMISSION_FAILED",
        message: admission.message || "Build origin admission failed.",
      };
    }

    return {
      ok: true,
      binding: {
        bindingId:
          typeof input.bindingId === "string" && input.bindingId.trim()
            ? input.bindingId.trim()
            : `bind-${randomUUID().slice(0, 8)}`,
        projectRoot: targetDir,
        originGitInit: true,
        originKind: "build-created",
      },
      admission,
      discovered: {
        ok: true,
        projectRoot: targetDir,
        gitRepositoryRoot: targetDir,
        workingSubdir: "",
        invocationCwd: targetDir,
        gitDir: resolve(targetDir, ".git"),
        unversioned: false,
        exactRoot: true,
      },
    };
  }

  const discovered = resolveTargetProjectRoot(targetDir);
  if (!discovered.ok) {
    return {
      ok: false,
      code: discovered.code || "ORIGIN_BIND_FAILED",
      message:
        discovered.message ||
        "PATH could not bind the Build-origin directory after git init.",
    };
  }

  const allowed = assertAllowedProjectRoot(discovered.projectRoot);
  if (!allowed.ok) {
    return {
      ok: false,
      code: allowed.code,
      message: allowed.message,
    };
  }

  const admission = admitPrimaryCheckout(discovered.projectRoot);
  if (!admission.ok) {
    return {
      ok: false,
      code: admission.code || "ORIGIN_ADMISSION_FAILED",
      message: admission.message || "Build origin admission failed.",
    };
  }

  return {
    ok: true,
    binding: {
      bindingId:
        typeof input.bindingId === "string" && input.bindingId.trim()
          ? input.bindingId.trim()
          : `bind-${randomUUID().slice(0, 8)}`,
      projectRoot: discovered.projectRoot,
      originGitInit: true,
      originKind: "existing-project",
    },
    admission,
    discovered,
  };
}

/**
 * True when cwd is already a bindable PATH project (Git or markers).
 * Empty / freshly-mkdir'd directories are NEVER bindable — they are greenfield
 * origins to establish, not existing projects to discover upward.
 * @param {string} cwd
 */
export function isBindableProject(cwd) {
  const root = resolve(String(cwd || ""));
  if (!existsSync(root)) return false;
  try {
    const entries = readdirSync(root).filter((n) => n !== ".DS_Store");
    if (entries.length === 0) return false;
  } catch {
    return false;
  }
  const discovered = resolveTargetProjectRoot(root);
  if (!discovered.ok) return false;
  const allowed = assertAllowedProjectRoot(discovered.projectRoot);
  return allowed.ok === true;
}

/**
 * @param {string} dir
 */
export function hasGitDir(dir) {
  return existsSync(resolve(dir, ".git"));
}
