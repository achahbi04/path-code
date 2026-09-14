/**
 * G9 — engineering tool environment envelope.
 * Prepend PATH-managed bins; strip AG1 venv / publication secrets.
 * Does not import credential values — only sanitizes keys.
 */

import { delimiter, join, resolve } from "node:path";

import {
  sanitizeProjectCommandEnv,
  stripRuntimeVenvFromPath,
} from "../ag5/project-env.mjs";
import { sanitizeEngineEnvForPublication } from "../ag4/credential-isolation.mjs";
import { resolveAg9RuntimeDirs } from "./layout.mjs";
import { miseEnv } from "./mise.mjs";

/**
 * Build process-local env for Antigravity / validation with PATH-managed tools prepended.
 *
 * @param {{
 *   baseEnv?: NodeJS.ProcessEnv,
 *   pathPrepend?: string[],
 *   runtimeRoot: string,
 * }} opts
 * @returns {NodeJS.ProcessEnv}
 */
export function buildEngineeringToolEnv(opts) {
  const runtimeRoot = opts.runtimeRoot;
  if (!runtimeRoot) throw new Error("buildEngineeringToolEnv: runtimeRoot required");

  const dirs = resolveAg9RuntimeDirs(runtimeRoot);
  const base = { ...(opts.baseEnv || process.env) };

  // Start from publication-safe + project-safe sanitizers (strip tokens + ag1-venv).
  let env = sanitizeEngineEnvForPublication(base, { runtimeRoot });
  env = sanitizeProjectCommandEnv(env, { runtimeRoot });

  // Merge isolated mise dirs without touching user ~/.config/mise.
  const isolated = miseEnv(runtimeRoot, env);
  env.MISE_DATA_DIR = isolated.MISE_DATA_DIR;
  env.MISE_CONFIG_DIR = isolated.MISE_CONFIG_DIR;
  env.MISE_CACHE_DIR = isolated.MISE_CACHE_DIR;
  env.MISE_STATE_DIR = isolated.MISE_STATE_DIR;
  env.CARGO_HOME = isolated.CARGO_HOME;
  env.RUSTUP_HOME = isolated.RUSTUP_HOME;
  env.MISE_YES = "1";

  // Optional Copilot home under PATH runtime (caller may set; never ~/.copilot).
  if (!env.COPILOT_HOME) {
    env.COPILOT_HOME = dirs.copilotHome;
  }

  /** @type {string[]} */
  const prepend = [];
  const extras = Array.isArray(opts.pathPrepend) ? opts.pathPrepend : [];
  for (const p of [
    join(dirs.miseHome, "bin"),
    join(dirs.languageServers, "bin"),
    join(dirs.languageServers, "npm", "bin"),
    join(dirs.toolchains, "cargo-home", "bin"),
    join(dirs.toolchains, "mise-data", "shims"),
    ...extras,
  ]) {
    if (typeof p === "string" && p.trim()) prepend.push(resolve(p.trim()));
  }

  // Dedupe while preserving order.
  /** @type {string[]} */
  const ordered = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const p of prepend) {
    if (seen.has(p)) continue;
    seen.add(p);
    ordered.push(p);
  }

  const cleanedPath = stripRuntimeVenvFromPath(env.PATH || "", runtimeRoot);
  const rest = cleanedPath
    .split(delimiter)
    .filter(Boolean)
    .filter((p) => !seen.has(resolve(p)));

  env.PATH = [...ordered, ...rest].join(delimiter);

  // Belt-and-suspenders: never reintroduce ag1-venv.
  env.PATH = stripRuntimeVenvFromPath(env.PATH, runtimeRoot);
  delete env.VIRTUAL_ENV;
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;

  return env;
}
