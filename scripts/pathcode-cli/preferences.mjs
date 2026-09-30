/**
 * S2/P6.4 — durable General Session and engineering preferences.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { resolveStateDirectory } from "./state-dir.mjs";
import { parseAutonomyMode } from "./autonomy-policy.mjs";
import { MODEL_PREFERENCE_ENGINES, validateModelPreference } from "./model-plane/preference-config.mjs";

export const PREFS_SCHEMA = "pathcode.prefs.v2";
const LEGACY_PREFS_SCHEMA = "pathcode.prefs.v1";

function emptyPreferences(path, source, extra = {}) {
  return { ok: true, modelId: null, generalSession: { modelId: null }, engineering: { byEngine: {} }, autonomy: null, path, source, ...extra };
}

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
 *   generalSession: { modelId: string | null },
 *   engineering: { byEngine: Record<string, string> },
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
      ...emptyPreferences(null, "unavailable"),
      ok: false,
      message: resolved.message,
    };
  }
  if (!existsSync(resolved.path)) {
    return emptyPreferences(resolved.path, "missing");
  }
  try {
    const raw = JSON.parse(readFileSync(resolved.path, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      ![LEGACY_PREFS_SCHEMA, PREFS_SCHEMA, undefined].includes(raw.schema)) {
      return { ...emptyPreferences(resolved.path, "invalid"), ok: false, message: "invalid preferences schema" };
    }
    const legacy = raw.schema !== PREFS_SCHEMA;
    const modelCandidate = legacy ? raw.modelId : raw.generalSession?.modelId;
    const modelId = typeof modelCandidate === "string" && modelCandidate.trim() ? modelCandidate.trim() : null;
    const byEngine = {};
    if (!legacy && raw.engineering !== undefined) {
      const configured = raw.engineering?.byEngine;
      if (!configured || typeof configured !== "object" || Array.isArray(configured)) {
        return { ...emptyPreferences(resolved.path, "invalid"), ok: false, message: "invalid engineering preferences" };
      }
      for (const [engine, value] of Object.entries(configured)) {
        const checked = validateModelPreference(value);
        if (!MODEL_PREFERENCE_ENGINES.includes(engine) || !checked.ok) {
          return { ...emptyPreferences(resolved.path, "invalid"), ok: false, message: `invalid engineering default for ${engine}` };
        }
        byEngine[engine] = checked.value;
      }
    }
    let autonomy = null;
    if (typeof raw.autonomy === "string") {
      const parsed = parseAutonomyMode(raw.autonomy);
      if (parsed.ok) autonomy = parsed.mode;
    }
    return {
      ok: true,
      modelId,
      generalSession: { modelId },
      engineering: { byEngine },
      autonomy,
      path: resolved.path,
      source: legacy ? "legacy_file" : "file",
      raw,
    };
  } catch (err) {
    return {
      ...emptyPreferences(resolved.path, "error"),
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {{
 *   modelId?: string | null,
 *   engineeringDefault?: { engineId: string, modelId: string },
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
  if (!existing.ok) return { ok: false, code: "INVALID_PREFERENCES", message: existing.message, path: resolved.path };
  const modelId =
    input.modelId !== undefined ? input.modelId : existing.modelId;
  const autonomy =
    input.autonomy !== undefined ? input.autonomy : existing.autonomy;
  const byEngine = { ...existing.engineering.byEngine };
  if (input.engineeringDefault) {
    const { engineId, modelId: preferredModel } = input.engineeringDefault;
    if (!MODEL_PREFERENCE_ENGINES.includes(engineId)) {
      return { ok: false, code: "UNKNOWN_ENGINE", message: `unknown model preference engine: ${engineId}` };
    }
    const checked = validateModelPreference(preferredModel);
    if (!checked.ok) return checked;
    byEngine[engineId] = checked.value;
  }
  const { schema: _schema, modelId: _legacyModel, generalSession: _general, engineering: _engineering, autonomy: _autonomy, updatedAt: _updated, ...unrelated } = existing.raw || {};
  const payload = {
    ...unrelated,
    schema: PREFS_SCHEMA,
    generalSession: { ...(existing.raw?.generalSession || {}), modelId: modelId || null },
    engineering: { ...(existing.raw?.engineering || {}), byEngine: Object.fromEntries(MODEL_PREFERENCE_ENGINES.filter((engine) => byEngine[engine]).map((engine) => [engine, byEngine[engine]])) },
    autonomy: autonomy || null,
    updatedAt: new Date().toISOString(),
  };
  const temporary = `${resolved.path}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(resolved.path), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(temporary, resolved.path);
    return { ok: true, path: resolved.path, payload };
  } catch (err) {
    try { unlinkSync(temporary); } catch { /* no temporary file */ }
    return { ok: false, code: "PREFERENCES_WRITE_FAILED", message: err instanceof Error ? err.message : String(err) };
  }
}

export function writeEngineeringUserDefault(input) {
  const { engineId, modelId, ...storage } = input;
  return writePreferences({ ...storage, engineeringDefault: { engineId, modelId } });
}

/**
 * Resolve effective General Session prefs with explicit load order:
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
