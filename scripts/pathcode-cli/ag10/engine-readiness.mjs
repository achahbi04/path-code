/**
 * S3 — operational engine readiness (not Dynamic Model Registry).
 *
 * Distinguishes capability-fit from runtime readiness. Never returns secrets.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { detectAg1Auth } from "../ag1/auth-detect.mjs";
import { detectCopilotCli } from "../ag8/copilot.mjs";
import { normalizeEngineId } from "./engine-contract.mjs";
import { detectCursorEngine, resolveCursorApiKey } from "./cursor-sdk.mjs";

/**
 * @typedef {'antigravity'|'copilot'|'cursor'} EngineId
 *
 * @typedef {{
 *   engineId: EngineId,
 *   installed: boolean,
 *   available: boolean,
 *   authenticated: boolean,
 *   ready: boolean,
 *   reason: string | null,
 *   authMethod?: string | null,
 *   mode?: string | null,
 *   evidence: string[],
 *   checkedAt: string,
 * }} EngineReadiness
 */

/**
 * @param {string} dir
 */
function dirHasEntries(dir) {
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
    return readdirSync(dir).some((name) => name && name !== "." && name !== "..");
  } catch {
    return false;
  }
}

/**
 * Presence-only Copilot credential probe. Does not read token values.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ home?: string }} [opts]
 */
export function detectCopilotAuthArtifacts(env = process.env, opts = {}) {
  const home = opts.home ?? env.HOME ?? homedir();
  /** @type {string[]} */
  const evidence = [];
  const tokenEnv = ["GH_TOKEN", "GITHUB_TOKEN", "COPILOT_GITHUB_TOKEN"].find(
    (key) => typeof env[key] === "string" && env[key].trim(),
  );
  if (tokenEnv) {
    evidence.push(`${tokenEnv} present`);
    return {
      authenticated: true,
      authMethod: "env_token",
      evidence,
    };
  }

  const dirs = [
    join(home, ".copilot"),
    join(home, ".config", "github-copilot"),
    join(home, ".config", "copilot"),
  ];
  for (const dir of dirs) {
    if (dirHasEntries(dir)) {
      evidence.push(`auth directory present: ${dir.replace(home, "~")}`);
      return {
        authenticated: true,
        authMethod: "local_config",
        evidence,
      };
    }
  }

  evidence.push("no Copilot auth artifacts found");
  return { authenticated: false, authMethod: null, evidence };
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, home?: string }} [opts]
 * @returns {EngineReadiness}
 */
export function probeAntigravityReadiness(opts = {}) {
  const env = opts.env || process.env;
  const checkedAt = new Date().toISOString();
  const auth = detectAg1Auth(env, { home: opts.home });
  return {
    engineId: "antigravity",
    installed: true,
    available: true,
    authenticated: auth.ok,
    ready: auth.ok,
    reason: auth.ok ? null : "AUTH_REQUIRED",
    authMethod: auth.mode === "none" ? null : auth.mode,
    mode: "bridge",
    evidence: [auth.message],
    checkedAt,
  };
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, home?: string }} [opts]
 * @returns {EngineReadiness}
 */
export function probeCopilotReadiness(opts = {}) {
  const env = opts.env || process.env;
  const checkedAt = new Date().toISOString();
  const cli = detectCopilotCli();
  const auth = detectCopilotAuthArtifacts(env, { home: opts.home });
  const evidence = [...(cli.evidence || []), ...auth.evidence];
  if (!cli.executable) {
    return {
      engineId: "copilot",
      installed: false,
      available: false,
      authenticated: false,
      ready: false,
      reason: "NOT_INSTALLED",
      authMethod: null,
      mode: "none",
      evidence,
      checkedAt,
    };
  }
  if (!auth.authenticated) {
    return {
      engineId: "copilot",
      installed: true,
      available: true,
      authenticated: false,
      ready: false,
      reason: "AUTH_REQUIRED",
      authMethod: null,
      mode: "cli_present",
      evidence,
      checkedAt,
    };
  }
  return {
    engineId: "copilot",
    installed: true,
    available: true,
    authenticated: true,
    ready: true,
    reason: null,
    authMethod: auth.authMethod,
    mode: "available",
    evidence,
    checkedAt,
  };
}

/**
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<EngineReadiness>}
 */
export async function probeCursorReadiness(opts = {}) {
  const env = opts.env || process.env;
  const checkedAt = new Date().toISOString();
  const detected = await detectCursorEngine({ env });
  const keyPresent = Boolean(resolveCursorApiKey(env, { includeStored: env === process.env }));
  return {
    engineId: "cursor",
    installed: !/sdk_missing|sdk load failed/i.test(String(detected.reason || "")),
    available: detected.ready === true || detected.reason === "auth_required",
    authenticated: keyPresent,
    ready: detected.ready === true,
    reason: detected.ready
      ? null
      : detected.reason === "auth_required"
        ? "AUTH_REQUIRED"
        : String(detected.reason || "UNAVAILABLE"),
    authMethod: keyPresent ? "api_key" : null,
    mode: detected.ready ? "native_sdk" : "none",
    evidence: detected.evidence || [],
    checkedAt,
  };
}

/**
 * Adapter-level readiness probe for one or all engines.
 *
 * @param {{
 *   engine?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   home?: string,
 * }} [opts]
 * @returns {Promise<EngineReadiness[]>}
 */
export async function probeEngineReadiness(opts = {}) {
  const wanted = normalizeEngineId(opts.engine);
  const probes = [];
  if (!wanted || wanted === "antigravity") {
    probes.push(probeAntigravityReadiness(opts));
  }
  if (!wanted || wanted === "copilot") {
    probes.push(probeCopilotReadiness(opts));
  }
  if (!wanted || wanted === "cursor") {
    probes.push(await probeCursorReadiness(opts));
  }
  return probes;
}

/**
 * Convert readiness probes into fabric `ready` + capability live inputs.
 * @param {EngineReadiness[]} probes
 */
export function readinessToFabricLive(probes) {
  /** @type {Partial<Record<EngineId, EngineReadiness>>} */
  const byId = {};
  for (const probe of probes) byId[probe.engineId] = probe;
  return {
    ready: {
      antigravity: byId.antigravity?.ready !== false,
      copilot: byId.copilot?.ready === true,
      cursor: byId.cursor?.ready === true,
    },
    live: {
      antigravity: byId.antigravity?.ready !== false,
      copilot: {
        ready: byId.copilot?.ready === true,
        mode: byId.copilot?.mode || "none",
        reason: byId.copilot?.reason || undefined,
        evidence: byId.copilot?.evidence || [],
      },
      cursor: {
        ready: byId.cursor?.ready === true,
        mode: byId.cursor?.mode || "none",
        reason: byId.cursor?.reason || undefined,
        evidence: byId.cursor?.evidence || [],
      },
    },
  };
}

/**
 * Invoke the standard Copilot login flow when interactive authorization is required.
 * Does not invent credentials. Returns immediately if already ready.
 *
 * @param {{ env?: NodeJS.ProcessEnv, timeoutMs?: number }} [opts]
 */
export function invokeCopilotLogin(opts = {}) {
  const env = opts.env || process.env;
  const cli = detectCopilotCli();
  if (!cli.executable) {
    return {
      ok: false,
      code: "NOT_INSTALLED",
      message: "copilot CLI is not installed",
    };
  }
  const run = spawnSync(cli.executable, ["login"], {
    encoding: "utf8",
    timeout: typeof opts.timeoutMs === "number" ? opts.timeoutMs : 180_000,
    env: { ...env, CI: env.CI || "" },
    stdio: ["inherit", "pipe", "pipe"],
  });
  return {
    ok: run.status === 0,
    code: run.status === 0 ? "OK" : "LOGIN_FAILED",
    status: run.status,
    stdout: String(run.stdout || "").slice(0, 2_000),
    stderr: String(run.stderr || "").slice(0, 2_000),
  };
}
