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
  materializeCursorModelIdentity,
  readLegacyCursorModelFromEnv,
} from "./adapters/cursor-catalog.mjs";

export const SELECTION_SOURCE = Object.freeze({
  EXPLICIT_TURN: "explicit_turn",
  LEGACY_ENV: "legacy_env",
  PROVIDER_DEFAULT: "provider_default",
});

export const RESOLVER_CODES = Object.freeze({
  ENGINE_ID_REQUIRED: "ENGINE_ID_REQUIRED",
  MODEL_REF_REQUIRED: "MODEL_REF_REQUIRED",
  MODEL_INCOMPATIBLE: "MODEL_INCOMPATIBLE",
  INVALID_MODEL_IDENTITY: "INVALID_MODEL_IDENTITY",
});

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
 * @param {object} identity
 * @param {string} selectionSource
 * @param {string} providerModelId
 */
function okResolution(identity, selectionSource, providerModelId) {
  return {
    ok: true,
    engineId: CURSOR_ENGINE_ID,
    identity,
    providerModelId,
    selectionSource,
    model: { id: providerModelId },
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
    return okResolution(
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
    return okResolution(
      built.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      built.identity.providerModelId,
    );
  }

  const explicit =
    typeof input.providerModelId === "string" ? input.providerModelId.trim() : "";
  if (explicit) {
    const built = materializeCursorModelIdentity(explicit, CATALOG_SOURCE.STATIC);
    if (!built.ok) {
      return {
        ok: false,
        code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
        message: built.message,
      };
    }
    return okResolution(
      built.identity,
      SELECTION_SOURCE.EXPLICIT_TURN,
      built.identity.providerModelId,
    );
  }

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
    return okResolution(
      built.identity,
      SELECTION_SOURCE.LEGACY_ENV,
      built.identity.providerModelId,
    );
  }

  const built = materializeCursorModelIdentity(
    CURSOR_DEFAULT_PROVIDER_MODEL_ID,
    CATALOG_SOURCE.STATIC,
  );
  if (!built.ok) {
    return {
      ok: false,
      code: RESOLVER_CODES.INVALID_MODEL_IDENTITY,
      message: built.message,
    };
  }
  return okResolution(
    built.identity,
    SELECTION_SOURCE.PROVIDER_DEFAULT,
    built.identity.providerModelId,
  );
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
