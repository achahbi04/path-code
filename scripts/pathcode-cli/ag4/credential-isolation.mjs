/**
 * AG4 — strip publication credentials from the Antigravity engineering env.
 */

import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { resolvePathRuntimeRoot } from "../paths.mjs";

/** Keys / markers that must never reach the engineering engine. */
export const PUBLICATION_ENV_DENY = Object.freeze([
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "GH_ENTERPRISE_TOKEN",
  "GITHUB_ENTERPRISE_TOKEN",
  "SSH_AUTH_SOCK",
  "SSH_AGENT_PID",
  "GIT_ASKPASS",
  "GH_ASKPASS",
]);

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{ runtimeRoot?: string }} [opts]
 * @returns {NodeJS.ProcessEnv}
 */
export function sanitizeEngineEnvForPublication(env, opts = {}) {
  const out = { ...env };
  for (const key of PUBLICATION_ENV_DENY) {
    delete out[key];
  }
  // Also drop any GH_* that looks like a token/header.
  for (const key of Object.keys(out)) {
    if (/^GH_.*(TOKEN|AUTH|PASSWORD)/i.test(key)) delete out[key];
    if (/^GITHUB_.*(TOKEN|AUTH|PASSWORD|PAT)/i.test(key)) delete out[key];
  }
  const runtimeRoot = opts.runtimeRoot ?? resolvePathRuntimeRoot();
  const emptyGh = join(runtimeRoot, "gh-empty-config");
  try {
    mkdirSync(emptyGh, { recursive: true });
  } catch {
    // ignore
  }
  out.GH_CONFIG_DIR = emptyGh;
  out.GIT_TERMINAL_PROMPT = "0";
  out.GCM_INTERACTIVE = "never";
  return out;
}
