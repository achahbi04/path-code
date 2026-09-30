/** P6.4 — bounded, engine-scoped project model defaults. */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";

export const PROJECT_MODEL_PREFERENCES_SCHEMA = "path.model-preferences.v1";
export const MODEL_PREFERENCE_ENGINES = Object.freeze(["cursor", "copilot", "antigravity"]);

export function validateModelPreference(value) {
  if (value === "auto") return { ok: true, value };
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/.test(value)) {
    return { ok: false, code: "INVALID_MODEL_PREFERENCE", message: "model preference must be a provider model id or auto" };
  }
  return { ok: true, value };
}

function validateByEngine(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "INVALID_BY_ENGINE", message: "byEngine must be an object" };
  }
  const byEngine = {};
  for (const [engine, model] of Object.entries(value)) {
    if (!MODEL_PREFERENCE_ENGINES.includes(engine)) {
      return { ok: false, code: "UNKNOWN_ENGINE", message: `unknown model preference engine: ${engine}` };
    }
    const checked = validateModelPreference(model);
    if (!checked.ok) return { ...checked, message: `${engine}: ${checked.message}` };
    byEngine[engine] = checked.value;
  }
  return { ok: true, byEngine };
}

export function resolveProjectModelPreferencesPath(projectRoot) {
  return join(resolve(projectRoot), ".path", "model-preferences.json");
}

export function readProjectModelPreferences(projectRoot) {
  const path = resolveProjectModelPreferencesPath(projectRoot);
  if (!existsSync(path)) {
    return { ok: true, source: "missing", path, byEngine: {} };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.schema !== PROJECT_MODEL_PREFERENCES_SCHEMA) {
      return { ok: false, code: "INVALID_PROJECT_MODEL_SCHEMA", message: "invalid project model preference schema", path };
    }
    if (Object.keys(raw).some((key) => !["schema", "byEngine", "updatedAt"].includes(key))) {
      return { ok: false, code: "INVALID_PROJECT_MODEL_FIELDS", message: "project model preferences contain unknown fields", path };
    }
    const checked = validateByEngine(raw.byEngine);
    if (!checked.ok) return { ...checked, path };
    if (typeof raw.updatedAt !== "string" || !Number.isFinite(Date.parse(raw.updatedAt))) {
      return { ok: false, code: "INVALID_PROJECT_MODEL_TIMESTAMP", message: "updatedAt must be an ISO timestamp", path };
    }
    return { ok: true, source: "file", path, byEngine: checked.byEngine, updatedAt: raw.updatedAt };
  } catch (err) {
    return { ok: false, code: "INVALID_PROJECT_MODEL_JSON", message: err instanceof Error ? err.message : String(err), path };
  }
}

/** Explicit mutation only. Never repairs malformed existing configuration. */
export function writeProjectModelPreference({ projectRoot, engineId, modelId }) {
  const path = resolveProjectModelPreferencesPath(projectRoot);
  if (!MODEL_PREFERENCE_ENGINES.includes(engineId)) {
    return { ok: false, code: "UNKNOWN_ENGINE", message: `unknown model preference engine: ${engineId}`, path };
  }
  const checked = validateModelPreference(modelId);
  if (!checked.ok) return { ...checked, path };
  const existing = readProjectModelPreferences(projectRoot);
  if (!existing.ok) return existing;
  const byEngine = { ...existing.byEngine, [engineId]: checked.value };
  const payload = {
    schema: PROJECT_MODEL_PREFERENCES_SCHEMA,
    byEngine: Object.fromEntries(MODEL_PREFERENCE_ENGINES.filter((engine) => byEngine[engine]).map((engine) => [engine, byEngine[engine]])),
    updatedAt: new Date().toISOString(),
  };
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(temporary, path);
    return { ok: true, path, payload };
  } catch (err) {
    try { unlinkSync(temporary); } catch { /* no temporary file */ }
    return { ok: false, code: "PROJECT_MODEL_WRITE_FAILED", message: err instanceof Error ? err.message : String(err), path };
  }
}
