/**
 * P6 — Model Plane resolver skeleton.
 *
 * Resolves model identity for an already-selected engineering engine only.
 * Does not select or reroute engines (S3 Fabric authority).
 */

import {
  buildPathKey,
  CATALOG_SOURCE,
  createModelIdentity,
  normalizeEngineIdForModelPlane,
  parsePathKey,
  validateModelIdentity,
} from "./identity.mjs";
import {
  CURSOR_DEFAULT_PROVIDER_MODEL_ID,
  CURSOR_ENGINE_ID,
  getCursorStaticCatalogIdentities,
  materializeCursorModelIdentity,
  readLegacyCursorModelFromEnv,
} from "./adapters/cursor-catalog.mjs";
import {
  COPILOT_ENGINE_ID,
  getCopilotStaticCatalogIdentities,
  materializeCopilotModelIdentity,
} from "./adapters/copilot-catalog.mjs";
import {
  ANTIGRAVITY_DEFAULT_PROVIDER_MODEL_ID,
  ANTIGRAVITY_ENGINE_ID,
  getAntigravityStaticCatalogIdentities,
  materializeAntigravityModelIdentity,
  readLegacyAntigravityModelFromEnv,
} from "./adapters/antigravity-catalog.mjs";
import { readPreferences } from "../preferences.mjs";
import { readProjectModelPreferences } from "./preference-config.mjs";
import { resolveAutoModelPolicy } from "./auto-policy.mjs";

export const SELECTION_SOURCE = Object.freeze({
  EXPLICIT_TURN: "explicit_turn",
  TASK_PIN: "task_pin",
  PROJECT_DEFAULT: "project_default",
  USER_DEFAULT: "user_default",
  LEGACY_ENV: "legacy_env",
  AUTO: "auto",
  PROVIDER_DEFAULT: "provider_default",
});

export const RESOLVER_CODES = Object.freeze({
  ENGINE_ID_REQUIRED: "ENGINE_ID_REQUIRED",
  MODEL_REF_REQUIRED: "MODEL_REF_REQUIRED",
  MODEL_INCOMPATIBLE: "MODEL_INCOMPATIBLE",
  INVALID_MODEL_IDENTITY: "INVALID_MODEL_IDENTITY",
  AUTO_POLICY_PENDING: "AUTO_POLICY_PENDING",
  MODEL_RESOLUTION_FAILED: "MODEL_RESOLUTION_FAILED",
});

function resolveAuto(engineId) {
  const contract = engineId === CURSOR_ENGINE_ID
    ? { catalog: getCursorStaticCatalogIdentities(), adapterDefaultId: CURSOR_DEFAULT_PROVIDER_MODEL_ID }
    : engineId === ANTIGRAVITY_ENGINE_ID
      ? { catalog: getAntigravityStaticCatalogIdentities(), adapterDefaultId: ANTIGRAVITY_DEFAULT_PROVIDER_MODEL_ID }
      : { catalog: getCopilotStaticCatalogIdentities(), supportsUnnamedProviderDefault: true };
  const chosen = resolveAutoModelPolicy({ engineId, ...contract });
  if (!chosen.ok) return chosen;
  return {
    ...okEngineResolution(engineId, chosen.identity, SELECTION_SOURCE.AUTO, chosen.providerModelId),
    autoPolicyVersion: chosen.autoPolicyVersion,
  };
}

function resolvePreferenceTier(engineId, input, materialize) {
  const pin = input.taskPin;
  if (pin) {
    if (pin.engineId !== engineId) return incompatible(engineId, { pathKey: `${pin.engineId}:${pin.providerModelId}` });
    if (pin.providerModelId === "auto") {
      return resolveAuto(engineId);
    }
    const built = materialize(pin.providerModelId, CATALOG_SOURCE.STATIC);
    if (!built.ok) return { ok: false, code: RESOLVER_CODES.INVALID_MODEL_IDENTITY, message: built.message };
    return okEngineResolution(engineId, built.identity, SELECTION_SOURCE.TASK_PIN, built.identity.providerModelId);
  }

  const diagnostics = [];
  let projectDefault = input.projectDefault;
  if (projectDefault === undefined && input.projectRoot) {
    const project = readProjectModelPreferences(input.projectRoot);
    if (project.ok) projectDefault = project.byEngine[engineId];
    else diagnostics.push({ code: project.code, message: project.message, path: project.path });
  }
  let userDefault = input.userDefault;
  if (userDefault === undefined && (input.projectRoot || input.readUserPreferences)) {
    const user = readPreferences({ env: input.preferencesEnv || process.env });
    if (user.ok) userDefault = user.engineering.byEngine[engineId];
    else diagnostics.push({ code: "INVALID_USER_PREFERENCES", message: user.message, path: user.path });
  }
  for (const [value, source] of [
    [projectDefault, SELECTION_SOURCE.PROJECT_DEFAULT],
    [userDefault, SELECTION_SOURCE.USER_DEFAULT],
  ]) {
    if (value === undefined || value === null) continue;
    if (value === "auto") {
      return { ...resolveAuto(engineId), diagnostics };
    }
    const built = materialize(value, CATALOG_SOURCE.STATIC);
    if (!built.ok) return { ok: false, code: RESOLVER_CODES.INVALID_MODEL_IDENTITY, message: built.message, diagnostics };
    return { ...okEngineResolution(engineId, built.identity, source, built.identity.providerModelId), diagnostics };
  }
  return { diagnostics };
}

function withPreferenceDiagnostics(resolution, preferred) {
  return preferred.diagnostics?.length
    ? { ...resolution, diagnostics: preferred.diagnostics }
    : resolution;
}

/**
 * @param {EngineeringEngineId} engineId
 * @param {object} identity
 * @returns {{ ok: false, code: string, message: string }}
 */
function incompatible(engineId, identity) {
  return {
    ok: false,
    code: RESOLVER_CODES.MODEL_INCOMPATIBLE,
    message: `model identity ${identity.pathKey || "(invalid)"} is not compatible with engine ${engineId}`,
  };
}

/**
 * @param {EngineeringEngineId} engineId
 * @param {object | null} identity
 * @param {string} selectionSource
 * @param {string | null | undefined} providerModelId
 */
function okEngineResolution(engineId, identity, selectionSource, providerModelId) {
  const id =
    typeof providerModelId === "string" ? providerModelId.trim() : "";
  return {
    ok: true,
    engineId,
    identity: identity ?? null,
    providerModelId: id || null,
    selectionSource,
    model: id ? { id } : null,
  };
}

/**
 * Cursor engineering model resolution (static catalog + legacy env + default).
 *
 * @param {{
 *   toolEnv?: Record<string, string | undefined>,
 *   env?: Record<string, string | undefined>,
 *   providerModelId?: string | null,
 *   modelIdentity?: object | null,
 *   pathKey?: string | null,
 * }} input
 */
export function resolveCursorEngineModel(input = {}) {
  const env = input.toolEnv || input.env || process.env;

  if (input.modelIdentity) {
    const validated = validateModelIdentity(input.modelIdentity);
    if (!validated.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: validated.message,
      };
    }
    if (validated.identity.engineId !== CURSOR_ENGINE_ID) {
      return incompatible(CURSOR_ENGINE_ID, validated.identity);
    }
    return okEngineResolution(
      CURSOR_ENGINE_ID,
      validated.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      validated.identity.providerModelId,
    );
  }

  if (typeof input.pathKey === "string" && input.pathKey.trim()) {
    const parsed = parsePathKey(input.pathKey);
    if (!parsed) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: "invalid pathKey",
      };
    }
    if (parsed.engineId !== CURSOR_ENGINE_ID) {
      return {
        ok: false,
        code: RESOLVER_CODES.MODEL_INCOMPATIBLE,
        message: `pathKey engine ${parsed.engineId} is not compatible with cursor`,
      };
    }
    const built = materializeCursorModelIdentity(
      parsed.providerModelId,
      CATALOG_SOURCE.STATIC,
    );
    if (!built.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: built.message,
      };
    }
    return okEngineResolution(
      CURSOR_ENGINE_ID,
      built.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      built.identity.providerModelId,
    );
  }

  const explicit =
    typeof input.providerModelId === "string" ? input.providerModelId.trim() : "";
  if (explicit === "auto") return resolveAuto(CURSOR_ENGINE_ID);
  if (explicit) {
    const built = materializeCursorModelIdentity(explicit, CATALOG_SOURCE.STATIC);
    if (!built.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: built.message,
      };
    }
    return okEngineResolution(
      CURSOR_ENGINE_ID,
      built.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      built.identity.providerModelId,
    );
  }

  const preferred = resolvePreferenceTier(CURSOR_ENGINE_ID, input, materializeCursorModelIdentity);
  if ("ok" in preferred) return preferred;
  const legacy = readLegacyCursorModelFromEnv(env);
  if (legacy) {
    const built = materializeCursorModelIdentity(
      legacy.providerModelId,
      CATALOG_SOURCE.LEGACY_ENV,
    );
    if (!built.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: built.message,
      };
    }
    return withPreferenceDiagnostics(okEngineResolution(
      CURSOR_ENGINE_ID,
      built.identity,
      SELECTION_SOURCE.LEGACY_ENV,
      built.identity.providerModelId,
    ), preferred);
  }

  return withPreferenceDiagnostics(resolveAuto(CURSOR_ENGINE_ID), preferred);
}

/**
 * Copilot engineering model resolution (provider default + optional explicit id).
 *
 * @param {{
 *   toolEnv?: Record<string, string | undefined>,
 *   env?: Record<string, string | undefined>,
 *   providerModelId?: string | null,
 *   modelIdentity?: object | null,
 *   pathKey?: string | null,
 * }} input
 */
export function resolveCopilotEngineModel(input = {}) {
  const env = input.toolEnv || input.env || process.env;

  if (input.modelIdentity) {
    const validated = validateModelIdentity(input.modelIdentity);
    if (!validated.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: validated.message,
      };
    }
    if (validated.identity.engineId !== COPILOT_ENGINE_ID) {
      return incompatible(COPILOT_ENGINE_ID, validated.identity);
    }
    return okEngineResolution(
      COPILOT_ENGINE_ID,
      validated.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      validated.identity.providerModelId,
    );
  }

  if (typeof input.pathKey === "string" && input.pathKey.trim()) {
    const parsed = parsePathKey(input.pathKey);
    if (!parsed) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: "invalid pathKey",
      };
    }
    if (parsed.engineId !== COPILOT_ENGINE_ID) {
      return {
        ok: false,
        code: RESOLVER_CODES.MODEL_INCOMPATIBLE,
        message: `pathKey engine ${parsed.engineId} is not compatible with copilot`,
      };
    }
    const built = materializeCopilotModelIdentity(
      parsed.providerModelId,
      CATALOG_SOURCE.STATIC,
    );
    if (!built.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: built.message,
      };
    }
    return okEngineResolution(
      COPILOT_ENGINE_ID,
      built.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      built.identity.providerModelId,
    );
  }

  const explicit =
    typeof input.providerModelId === "string" ? input.providerModelId.trim() : "";
  if (explicit === "auto") return resolveAuto(COPILOT_ENGINE_ID);
  if (explicit) {
    const built = materializeCopilotModelIdentity(explicit, CATALOG_SOURCE.STATIC);
    if (!built.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: built.message,
      };
    }
    return okEngineResolution(
      COPILOT_ENGINE_ID,
      built.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      built.identity.providerModelId,
    );
  }

  const preferred = resolvePreferenceTier(COPILOT_ENGINE_ID, input, materializeCopilotModelIdentity);
  if ("ok" in preferred) return preferred;
  return withPreferenceDiagnostics(resolveAuto(COPILOT_ENGINE_ID), preferred);
}

/**
 * Antigravity engineering model resolution (static catalog + legacy env + default).
 *
 * @param {{
 *   toolEnv?: Record<string, string | undefined>,
 *   env?: Record<string, string | undefined>,
 *   providerModelId?: string | null,
 *   modelIdentity?: object | null,
 *   pathKey?: string | null,
 * }} input
 */
export function resolveAntigravityEngineModel(input = {}) {
  const env = input.toolEnv || input.env || process.env;

  if (input.modelIdentity) {
    const validated = validateModelIdentity(input.modelIdentity);
    if (!validated.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: validated.message,
      };
    }
    if (validated.identity.engineId !== ANTIGRAVITY_ENGINE_ID) {
      return incompatible(ANTIGRAVITY_ENGINE_ID, validated.identity);
    }
    return okEngineResolution(
      ANTIGRAVITY_ENGINE_ID,
      validated.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      validated.identity.providerModelId,
    );
  }

  if (typeof input.pathKey === "string" && input.pathKey.trim()) {
    const parsed = parsePathKey(input.pathKey);
    if (!parsed) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: "invalid pathKey",
      };
    }
    if (parsed.engineId !== ANTIGRAVITY_ENGINE_ID) {
      return {
        ok: false,
        code: RESOLVER_CODES.MODEL_INCOMPATIBLE,
        message: `pathKey engine ${parsed.engineId} is not compatible with antigravity`,
      };
    }
    const built = materializeAntigravityModelIdentity(
      parsed.providerModelId,
      CATALOG_SOURCE.STATIC,
    );
    if (!built.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: built.message,
      };
    }
    return okEngineResolution(
      ANTIGRAVITY_ENGINE_ID,
      built.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      built.identity.providerModelId,
    );
  }

  const explicit =
    typeof input.providerModelId === "string" ? input.providerModelId.trim() : "";
  if (explicit === "auto") return resolveAuto(ANTIGRAVITY_ENGINE_ID);
  if (explicit) {
    const built = materializeAntigravityModelIdentity(
      explicit,
      CATALOG_SOURCE.STATIC,
    );
    if (!built.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: built.message,
      };
    }
    return okEngineResolution(
      ANTIGRAVITY_ENGINE_ID,
      built.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      built.identity.providerModelId,
    );
  }

  const preferred = resolvePreferenceTier(ANTIGRAVITY_ENGINE_ID, input, materializeAntigravityModelIdentity);
  if ("ok" in preferred) return preferred;
  const legacy = readLegacyAntigravityModelFromEnv(env);
  if (legacy) {
    const built = materializeAntigravityModelIdentity(
      legacy.providerModelId,
      CATALOG_SOURCE.LEGACY_ENV,
    );
    if (!built.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: built.message,
      };
    }
    return withPreferenceDiagnostics(okEngineResolution(
      ANTIGRAVITY_ENGINE_ID,
      built.identity,
      SELECTION_SOURCE.LEGACY_ENV,
      built.identity.providerModelId,
    ), preferred);
  }

  return withPreferenceDiagnostics(resolveAuto(ANTIGRAVITY_ENGINE_ID), preferred);
}

/**
 * Resolve a model for a known engineering engine.
 *
 * @param {{
 *   engineId?: string | null,
 *   providerModelId?: string | null,
 *   provider?: string | null,
 *   modelIdentity?: object | null,
 *   pathKey?: string | null,
 *   toolEnv?: Record<string, string | undefined>,
 *   env?: Record<string, string | undefined>,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   code?: string,
 *   message?: string,
 *   identity?: object,
 *   engineId?: EngineeringEngineId,
 *   providerModelId?: string,
 *   selectionSource?: string,
 *   model?: { id: string },
 * }}
 */
export function resolveModelForEngine(input = {}) {
  const engineId = normalizeEngineIdForModelPlane(input.engineId);
  if (!engineId) {
    return {
      ok: false,
      code: RESOLVER_CODES.ENGINE_ID_REQUIRED,
      message: "engineId is required before model resolution",
    };
  }

  if (engineId === CURSOR_ENGINE_ID) {
    return resolveCursorEngineModel(input);
  }
  if (engineId === COPILOT_ENGINE_ID) {
    return resolveCopilotEngineModel(input);
  }
  if (engineId === ANTIGRAVITY_ENGINE_ID) {
    return resolveAntigravityEngineModel(input);
  }

  if (input.modelIdentity) {
    const validated = validateModelIdentity(input.modelIdentity);
    if (!validated.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: validated.message,
      };
    }
    if (validated.identity.engineId !== engineId) {
      return incompatible(engineId, validated.identity);
    }
    return {
      ok: true,
      engineId,
      identity: validated.identity,
      providerModelId: validated.identity.providerModelId,
      selectionSource: SELECTION_SOURCE.EXPLICIT_TURN,
      model: { id: validated.identity.providerModelId },
    };
  }

  if (typeof input.pathKey === "string" && input.pathKey.trim()) {
    const parsed = parsePathKey(input.pathKey);
    if (!parsed) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: "invalid pathKey",
      };
    }
    if (parsed.engineId !== engineId) {
      return {
        ok: false,
        code: RESOLVER_CODES.MODEL_INCOMPATIBLE,
        message: `pathKey engine ${parsed.engineId} does not match ${engineId}`,
      };
    }
    const built = createModelIdentity({
      engineId,
      provider:
        typeof input.provider === "string" && input.provider.trim()
          ? input.provider
          : engineId,
      providerModelId: parsed.providerModelId,
    });
    if (!built.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: built.message,
      };
    }
    return {
      ok: true,
      engineId,
      identity: built.identity,
      providerModelId: built.identity.providerModelId,
      selectionSource: SELECTION_SOURCE.EXPLICIT_TURN,
      model: { id: built.identity.providerModelId },
    };
  }

  const providerModelId =
    typeof input.providerModelId === "string" ? input.providerModelId : null;
  if (!providerModelId?.trim()) {
    return {
      ok: false,
      code: RESOLVER_CODES.MODEL_REF_REQUIRED,
      message: "providerModelId, pathKey, or modelIdentity is required",
    };
  }

  const created = createModelIdentity({
    engineId,
    provider:
      typeof input.provider === "string" && input.provider.trim()
        ? input.provider
        : engineId,
    providerModelId,
  });
  if (!created.ok) {
    return {
      ok: false,
      code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
      message: created.message,
    };
  }

  const crossCheck = buildPathKey(engineId, created.identity.providerModelId);
  if (crossCheck !== created.identity.pathKey) {
    return incompatible(engineId, created.identity);
  }

  return {
    ok: true,
    engineId,
    identity: created.identity,
    providerModelId: created.identity.providerModelId,
    selectionSource: SELECTION_SOURCE.EXPLICIT_TURN,
    model: { id: created.identity.providerModelId },
  };
}
