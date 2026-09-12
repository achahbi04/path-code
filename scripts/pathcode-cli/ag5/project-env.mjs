/**
 * AG5 — strip PATH-private Python/runtime contamination from project command env.
 * The Antigravity bridge uses an absolute interpreter under PATH_RUNTIME_ROOT;
 * target-project commands must not inherit VIRTUAL_ENV / PYTHONPATH / venv PATH.
 */

import { delimiter, join, resolve } from "node:path";
import { resolvePathRuntimeRoot } from "../paths.mjs";

/** Env keys that must not leak PATH's private Python runtime into project commands. */
export const PROJECT_PYTHON_ENV_DENY = Object.freeze([
  "VIRTUAL_ENV",
  "PYTHONHOME",
  "PYTHONPATH",
  "CONDA_PREFIX",
  "CONDA_DEFAULT_ENV",
  "CONDA_PROMPT_MODIFIER",
  "CONDA_SHLVL",
  "CONDA_PYTHON_EXE",
  "CONDA_EXE",
  "_OLD_VIRTUAL_PATH",
  "_OLD_VIRTUAL_PYTHONHOME",
  "_OLD_VIRTUAL_PS1",
]);

/**
 * Remove PATH runtime venv `bin`/`Scripts` directories from PATH.
 * @param {string | undefined} pathValue
 * @param {string} runtimeRoot
 */
export function stripRuntimeVenvFromPath(pathValue, runtimeRoot) {
  const raw = typeof pathValue === "string" ? pathValue : "";
  if (!raw) return raw;
  const runtime = resolve(runtimeRoot);
  const parts = raw.split(delimiter).filter(Boolean);
  const kept = parts.filter((part) => {
    const abs = resolve(part);
    // Drop PATH-owned ag1-venv bin directories only.
    if (abs === join(runtime, "ag1-venv", "bin")) return false;
    if (abs === join(runtime, "ag1-venv", "Scripts")) return false;
    if (abs.startsWith(join(runtime, "ag1-venv") + "/") && /\/(bin|Scripts)$/.test(abs)) {
      return false;
    }
    return true;
  });
  return kept.join(delimiter);
}

/**
 * Sanitize env for TARGET PROJECT engineering/validation subprocesses.
 * Does not remove the user's normal shell PATH beyond PATH-owned venv bins.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {{ runtimeRoot?: string }} [opts]
 * @returns {NodeJS.ProcessEnv}
 */
export function sanitizeProjectCommandEnv(env, opts = {}) {
  const out = { ...env };
  for (const key of PROJECT_PYTHON_ENV_DENY) {
    delete out[key];
  }
  const runtimeRoot = opts.runtimeRoot ?? resolvePathRuntimeRoot();
  out.PATH = stripRuntimeVenvFromPath(out.PATH, runtimeRoot);
  return out;
}
