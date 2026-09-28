/**
 * P6 — Model Plane resolver skeleton.
 *
 * Resolves model identity for an already-selected engineering engine only.
 * Does not select or reroute engines (S3 Fabric authority).
 */

import {
  buildPathKey,
  createModelIdentity,
  normalizeEngineIdForModelPlane,
  parsePathKey,
  validateModelIdentity,
} from "./identity.mjs";

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
 * Resolve a model for a known engineering engine. P6.0: validates engine scope
 * and identity shape only — no provider adapter wiring.
 *
 * @param {{
 *   engineId?: string | null,
 *   providerModelId?: string | null,
 *   provider?: string | null,
 *   modelIdentity?: object | null,
 *   pathKey?: string | null,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   code?: string,
 *   message?: string,
 *   identity?: object,
 *   engineId?: EngineeringEngineId,
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
    return { ok: true, engineId, identity: validated.identity };
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
    return { ok: true, engineId, identity: built.identity };
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

  return { ok: true, engineId, identity: created.identity };
}
