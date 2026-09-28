/**
 * P6.1 — Cursor static model catalog (no dynamic discovery).
 *
 * Evidence: cursor-sdk.mjs historical default `composer-2.5` when env unset.
 */

import {
  AVAILABILITY,
  CATALOG_SOURCE,
  createModelIdentity,
} from "../identity.mjs";

/** @typedef {import("../identity.mjs").EngineeringEngineId} EngineeringEngineId */

export const CURSOR_ENGINE_ID = "cursor";

/**
 * Preserved PATH default (pre-P6 hardcoded in resolveCursorModel).
 * @type {string}
 */
export const CURSOR_DEFAULT_PROVIDER_MODEL_ID = "composer-2.5";

/**
 * @type {ReadonlyArray<{ providerModelId: string, displayName?: string }>}
 */
const CURSOR_STATIC_SEED = Object.freeze([
  {
    providerModelId: CURSOR_DEFAULT_PROVIDER_MODEL_ID,
    displayName: "Composer 2.5",
  },
]);

/**
 * @returns {object[]}
 */
export function getCursorStaticCatalogIdentities() {
  /** @type {object[]} */
  const out = [];
  for (const seed of CURSOR_STATIC_SEED) {
    const built = createModelIdentity({
      engineId: CURSOR_ENGINE_ID,
      provider: "cursor",
      providerModelId: seed.providerModelId,
      displayName: seed.displayName,
      catalogSource: CATALOG_SOURCE.STATIC,
    });
    if (built.ok) out.push(built.identity);
  }
  return out;
}

/**
 * @param {string} providerModelId
 * @returns {object | null}
 */
export function findCursorCatalogIdentity(providerModelId) {
  const id =
    typeof providerModelId === "string" ? providerModelId.trim() : "";
  if (!id) return null;
  return (
    getCursorStaticCatalogIdentities().find((e) => e.providerModelId === id) ||
    null
  );
}

/**
 * Legacy env compatibility (PATHCODE_* before CURSOR_MODEL).
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ providerModelId: string, envKey: "PATHCODE_CURSOR_MODEL"|"CURSOR_MODEL" } | null}
 */
export function readLegacyCursorModelFromEnv(env = process.env) {
  const pathcode =
    typeof env.PATHCODE_CURSOR_MODEL === "string"
      ? env.PATHCODE_CURSOR_MODEL.trim()
      : "";
  if (pathcode) {
    return { providerModelId: pathcode, envKey: "PATHCODE_CURSOR_MODEL" };
  }
  const cursor =
    typeof env.CURSOR_MODEL === "string" ? env.CURSOR_MODEL.trim() : "";
  if (cursor) {
    return { providerModelId: cursor, envKey: "CURSOR_MODEL" };
  }
  return null;
}

/**
 * @param {string} providerModelId
 * @param {string} catalogSource
 * @returns {{ ok: true, identity: object } | { ok: false, code: string, message: string }}
 */
export function materializeCursorModelIdentity(providerModelId, catalogSource) {
  const catalogHit = findCursorCatalogIdentity(providerModelId);
  if (catalogHit) {
    if (catalogSource === CATALOG_SOURCE.LEGACY_ENV) {
      return {
        ok: true,
        identity: {
          ...catalogHit,
          catalogSource: CATALOG_SOURCE.LEGACY_ENV,
        },
      };
    }
    return { ok: true, identity: catalogHit };
  }
  return createModelIdentity({
    engineId: CURSOR_ENGINE_ID,
    provider: "cursor",
    providerModelId,
    catalogued: false,
    catalogSource,
    availability: AVAILABILITY.UNKNOWN,
  });
}
