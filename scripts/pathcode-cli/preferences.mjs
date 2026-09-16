/**
 * S2 — minimal durable preferences (model + autonomy only).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveStateDirectory } from "./state-dir.mjs";
import { parseAutonomyMode } from "./autonomy-policy.mjs";

export const PREFS_SCHEMA = "pathcode.prefs.v1";

/**
 * @param {{ env?: NodeJS.ProcessEnv, home?: string, platform?: string }} [opts]
 */
export function resolvePreferencesPath(opts = {}) {
  const state = resolveStateDirectory({
    env: opts.env ?? process.env,
    home: opts.home,
    platform: opts.platform,
  });
  if (!state.ok) {
    return { ok: false, code: state.code, message: state.message };
  }
  return {
    ok: true,
    path: join(state.directory, "preferences.json"),
    stateDir: state.directory,
    source: state.source,
  };
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, home?: string, platform?: string }} [opts]
 * @returns {{
 *   ok: boolean,
 *   modelId: string | null,
 *   autonomy: "review" | "bounded" | null,
 *   path: string | null,
 *   source: string,
 *   message?: string,
 * }}
 */
export function readPreferences(opts = {}) {
  const resolved = resolvePreferencesPath(opts);
  if (!resolved.ok) {
    return {
      ok: false,
      modelId: null,
      autonomy: null,
      path: null,
      source: "unavailable",
      message: resolved.message,
    };
  }
  if (!existsSync(resolved.path)) {
    return {
      ok: true,
      modelId: null,
      autonomy: null,
      path: resolved.path,
      source: "missing",
    };
  }
  try {
    const raw = JSON.parse(readFileSync(resolved.path, "utf8"));
    if (!raw || typeof raw !== "object") {
      return {
        ok: true,
        modelId: null,
        autonomy: null,
        path: resolved.path,
        source: "invalid",
      };
    }
    const modelId =
      typeof raw.modelId === "string" && raw.modelId.trim()
        ? raw.modelId.trim()
        : null;
    let autonomy = null;
    if (typeof raw.autonomy === "string") {
      const parsed = parseAutonomyMode(raw.autonomy);
      if (parsed.ok) autonomy = parsed.mode;
    }
    return {
      ok: true,
      modelId,
      autonomy,
      path: resolved.path,
      source: "file",
    };
  } catch (err) {
    return {
      ok: false,
      modelId: null,
      autonomy: null,
      path: resolved.path,
      source: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {{
 *   modelId?: string | null,
 *   autonomy?: "review" | "bounded" | null,
 *   env?: NodeJS.ProcessEnv,
 *   home?: string,
 *   platform?: string,
 * }} input
 */
export function writePreferences(input) {
  const resolved = resolvePreferencesPath(input);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }
  const existing = readPreferences(input);
  const modelId =
    input.modelId !== undefined ? input.modelId : existing.modelId;
  const autonomy =
    input.autonomy !== undefined ? input.autonomy : existing.autonomy;
  const payload = {
    schema: PREFS_SCHEMA,
    modelId: modelId || null,
    autonomy: autonomy || null,
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(
    resolved.path,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  return { ok: true, path: resolved.path, payload };
}

/**
 * Resolve effective prefs with explicit load order:
 * CLI flag → session override → prefs file → env → defaults.
 *
 * @param {{
 *   modelFlag?: string | null,
 *   autonomyFlag?: "review" | "bounded" | null,
 *   autonomyExplicit?: boolean,
 *   sessionModel?: string | null,
 *   sessionAutonomy?: "review" | "bounded" | null,
 *   env?: NodeJS.ProcessEnv,
 * }} input
 */
export function resolveEffectivePreferences(input) {
  const env = input.env ?? process.env;
  const file = readPreferences({ env });
  const envModel =
    typeof env.PATHCODE_OPENAI_MODEL === "string" &&
    env.PATHCODE_OPENAI_MODEL.trim()
      ? env.PATHCODE_OPENAI_MODEL.trim()
      : null;

  /** @type {string | null} */
  let modelId = null;
  /** @type {string} */
  let modelSource = "default";
  if (typeof input.sessionModel === "string" && input.sessionModel.trim()) {
    modelId = input.sessionModel.trim();
    modelSource = "session";
  } else if (typeof input.modelFlag === "string" && input.modelFlag.trim()) {
    modelId = input.modelFlag.trim();
    modelSource = "flag";
  } else if (file.modelId) {
    modelId = file.modelId;
    modelSource = "file";
  } else if (envModel) {
    modelId = envModel;
    modelSource = "env";
  }

  /** @type {"review" | "bounded"} */
  let autonomy = "review";
  /** @type {string} */
  let autonomySource = "default";
  if (input.sessionAutonomy === "review" || input.sessionAutonomy === "bounded") {
    autonomy = input.sessionAutonomy;
    autonomySource = "session";
  } else if (
    input.autonomyExplicit &&
    (input.autonomyFlag === "review" || input.autonomyFlag === "bounded")
  ) {
    autonomy = input.autonomyFlag;
    autonomySource = "flag";
  } else if (file.autonomy === "review" || file.autonomy === "bounded") {
    autonomy = file.autonomy;
    autonomySource = "file";
  } else {
    autonomy = "review";
    autonomySource = "default";
  }

  return {
    modelId,
    modelSource,
    autonomy,
    autonomySource,
    prefsPath: file.path,
  };
}

/**
 * Operator-facing prefs panel (survives alt-screen via setOperatorPanel).
 * @param {ReturnType<typeof resolveEffectivePreferences>} eff
 * @param {{ persisted?: boolean }} [opts]
 */
export function formatPreferencesPanel(eff, opts = {}) {
  const lines = [
    "Durable preferences",
    "",
    `  model     ${eff.modelId || "(unset)"}`,
    `            source: ${eff.modelSource}`,
    `  autonomy  ${eff.autonomy}`,
    `            source: ${eff.autonomySource}`,
    `  file      ${eff.prefsPath || "(unavailable)"}`,
    "",
    "Change with:",
    "  /model <id>",
    "  /autonomy <review|bounded>",
  ];
  if (opts.persisted === true) {
    lines.push("", "These values persist across PATH restarts (prefs file).");
  }
  return lines.join("\n");
}
