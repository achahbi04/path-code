/**
 * P6.3 — Copilot static model catalog (no dynamic discovery).
 *
 * Repository evidence: copilot-sdk passes `options.model` when set; otherwise
 * SDK/provider default. No PATH model env pins and no named model list in repo.
 */

import {
  AVAILABILITY,
  CATALOG_SOURCE,
  createModelIdentity,
} from "../identity.mjs";

export const COPILOT_ENGINE_ID = "copilot";

/** No evidence-backed named Copilot model IDs in PATH today. */
const COPILOT_STATIC_SEED = Object.freeze([]);

/**
 * @returns {object[]}
 */
export function getCopilotStaticCatalogIdentities() {
  /** @type {object[]} */
  const out = [];
  for (const seed of COPILOT_STATIC_SEED) {
    const built = createModelIdentity({
      engineId: COPILOT_ENGINE_ID,
      provider: "copilot",
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
export function findCopilotCatalogIdentity(providerModelId) {
  const id =
    typeof providerModelId === "string" ? providerModelId.trim() : "";
  if (!id) return null;
  return (
    getCopilotStaticCatalogIdentities().find((e) => e.providerModelId === id) ||
    null
  );
}

/**
 * @param {string} providerModelId
 * @param {string} catalogSource
 */
export function materializeCopilotModelIdentity(providerModelId, catalogSource) {
  const catalogHit = findCopilotCatalogIdentity(providerModelId);
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
    engineId: COPILOT_ENGINE_ID,
    provider: "copilot",
    providerModelId,
    catalogued: false,
    catalogSource,
    availability: AVAILABILITY.UNKNOWN,
  });
}
