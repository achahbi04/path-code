/**
 * S5 — greenfield origin: directory + git init only (no scaffolds).
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  resolveTargetProjectRoot,
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
 * Ensure a Build-origin project root: mkdir + git init only.
 * Architecture is left to the first engineer task.
 *
 * @param {{
 *   targetDir: string,
 *   bindingId?: string,
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
  const targetDir = resolve(String(input.targetDir || "").trim());
  if (!targetDir) {
    return {
      ok: false,
      code: "ORIGIN_DIR_REQUIRED",
      message: "Build origin requires a target directory.",
    };
  }

  try {
    mkdirSync(targetDir, { recursive: true });
  } catch (err) {
    return {
      ok: false,
      code: "ORIGIN_MKDIR_FAILED",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const inside = git(targetDir, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    const init = git(targetDir, ["init", "--template="]);
    if (init.status !== 0) {
      return {
        ok: false,
        code: "ORIGIN_GIT_INIT_FAILED",
        message: (init.stderr || init.stdout || "git init failed").trim(),
      };
    }
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
    },
    admission,
    discovered,
  };
}

/**
 * True when cwd is already a bindable PATH project (Git or markers).
 * @param {string} cwd
 */
export function isBindableProject(cwd) {
  const discovered = resolveTargetProjectRoot(cwd);
  return discovered.ok === true;
}

/**
 * @param {string} dir
 */
export function hasGitDir(dir) {
  return existsSync(resolve(dir, ".git"));
}
