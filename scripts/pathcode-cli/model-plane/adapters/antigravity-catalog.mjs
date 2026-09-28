/**
 * P6.3 — Antigravity static model catalog (no dynamic discovery).
 *
 * Evidence: ag1/cloud-env.mjs hydrate default AG1_MODEL=gemini-2.5-flash;
 * resolveAg1ExecutionIdentity reads AG1_MODEL then GOOGLE_CLOUD_MODEL.
 */

import {
  AVAILABILITY,
  CATALOG_SOURCE,
  createModelIdentity,
} from "../identity.mjs";

export const ANTIGRAVITY_ENGINE_ID = "antigravity";

/** Hydrated default in cloud-env.mjs when AG1_MODEL unset. */
export const ANTIGRAVITY_DEFAULT_PROVIDER_MODEL_ID = "gemini-2.5-flash";

const ANTIGRAVITY_STATIC_SEED = Object.freeze([
  {
    providerModelId: ANTIGRAVITY_DEFAULT_PROVIDER_MODEL_ID,
    displayName: "Gemini 2.5 Flash",
  },
]);

/**
 * @returns {object[]}
 */
export function getAntigravityStaticCatalogIdentities() {
  /** @type {object[]} */
  const out = [];
  for (const seed of ANTIGRAVITY_STATIC_SEED) {
    const built = createModelIdentity({
      engineId: ANTIGRAVITY_ENGINE_ID,
      provider: "google",
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
export function findAntigravityCatalogIdentity(providerModelId) {
  const id =
    typeof providerModelId === "string" ? providerModelId.trim() : "";
  if (!id) return null;
  return (
    getAntigravityStaticCatalogIdentities().find(
      (e) => e.providerModelId === id,
    ) || null
  );
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ providerModelId: string, envKey: "AG1_MODEL"|"GOOGLE_CLOUD_MODEL" } | null}
 */
export function readLegacyAntigravityModelFromEnv(env = process.env) {
  const ag1 =
    typeof env.AG1_MODEL === "string" ? env.AG1_MODEL.trim() : "";
  if (ag1) {
    return { providerModelId: ag1, envKey: "AG1_MODEL" };
  }
  const cloud =
    typeof env.GOOGLE_CLOUD_MODEL === "string"
      ? env.GOOGLE_CLOUD_MODEL.trim()
      : "";
  if (cloud) {
    return { providerModelId: cloud, envKey: "GOOGLE_CLOUD_MODEL" };
  }
  return null;
}

/**
 * @param {string} providerModelId
 * @param {string} catalogSource
 */
export function materializeAntigravityModelIdentity(
  providerModelId,
  catalogSource,
) {
  const catalogHit = findAntigravityCatalogIdentity(providerModelId);
  if (catalogHit) {
    return {
      ok: true,
      identity: {
        ...catalogHit,
        catalogSource:
          catalogSource === CATALOG_SOURCE.LEGACY_ENV
            ? CATALOG_SOURCE.LEGACY_ENV
            : catalogHit.catalogSource,
      },
    };
  }
  return createModelIdentity({
    engineId: ANTIGRAVITY_ENGINE_ID,
    provider: "google",
    providerModelId,
    catalogued: false,
    catalogSource,
    availability: AVAILABILITY.UNKNOWN,
  });
}
