/**
 * P6 — canonical model identity (path.model.identity.v1).
 *
 * Engine-scoped identities only. Catalogued membership does not imply availability.
 */

/** @typedef {"antigravity"|"copilot"|"cursor"} EngineeringEngineId */

export const MODEL_IDENTITY_SCHEMA = "path.model.identity.v1";

/** @type {ReadonlySet<EngineeringEngineId>} */
export const ENGINEERING_ENGINE_IDS = new Set([
  "antigravity",
  "copilot",
  "cursor",
]);

export const AVAILABILITY = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  DEPRECATED: "deprecated",
  UNKNOWN: "unknown",
});

export const CATALOG_SOURCE = Object.freeze({
  STATIC: "static",
  DISCOVERED: "discovered",
  LEGACY_ENV: "legacy_env",
});

/**
 * @param {unknown} value
 * @returns {EngineeringEngineId | null}
 */
export function normalizeEngineIdForModelPlane(value) {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (v === "antigravity" || v === "ag" || v === "ag1") return "antigravity";
  if (v === "copilot" || v === "github-copilot") return "copilot";
  if (v === "cursor") return "cursor";
  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeProviderModelId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return null;
  return trimmed;
}

/**
 * @param {EngineeringEngineId} engineId
 * @param {string} providerModelId
 * @returns {string | null}
 */
export function buildPathKey(engineId, providerModelId) {
  const engine = normalizeEngineIdForModelPlane(engineId);
  const modelId = normalizeProviderModelId(providerModelId);
  if (!engine || !modelId) return null;
  return `${engine}:${modelId}`;
}

/**
 * @param {string} pathKey
 * @returns {{ engineId: EngineeringEngineId, providerModelId: string } | null}
 */
export function parsePathKey(pathKey) {
  if (typeof pathKey !== "string") return null;
  const trimmed = pathKey.trim();
  const sep = trimmed.indexOf(":");
  if (sep <= 0 || sep === trimmed.length - 1) return null;
  const engineId = normalizeEngineIdForModelPlane(trimmed.slice(0, sep));
  const providerModelId = normalizeProviderModelId(trimmed.slice(sep + 1));
  if (!engineId || !providerModelId) return null;
  return { engineId, providerModelId };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isAvailability(value) {
  return (
    value === AVAILABILITY.AVAILABLE ||
    value === AVAILABILITY.UNAVAILABLE ||
    value === AVAILABILITY.DEPRECATED ||
    value === AVAILABILITY.UNKNOWN
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isCatalogSource(value) {
  return (
    value === CATALOG_SOURCE.STATIC ||
    value === CATALOG_SOURCE.DISCOVERED ||
    value === CATALOG_SOURCE.LEGACY_ENV
  );
}

/**
 * Create a validated identity. Static catalog entries default to
 * catalogued=true and availability=unknown unless explicitly set.
 *
 * @param {{
 *   engineId: EngineeringEngineId | string,
 *   provider: string,
 *   providerModelId: string,
 *   displayName?: string | null,
 *   catalogued?: boolean,
 *   availability?: string,
 *   catalogSource?: string,
 *   aliases?: string[],
 *   discoveredAt?: string | null,
 * }} input
 * @returns {{ ok: true, identity: object } | { ok: false, code: string, message: string }}
 */
export function createModelIdentity(input) {
  const engineId = normalizeEngineIdForModelPlane(input?.engineId);
  const providerModelId = normalizeProviderModelId(input?.providerModelId);
  const provider =
    typeof input?.provider === "string" && input.provider.trim()
      ? input.provider.trim().slice(0, 64)
      : null;

  if (!engineId) {
    return {
      ok: false,
      code: "INVALID_ENGINE_ID",
      message: "engineId must be a PATH engineering engine",
    };
  }
  if (!providerModelId) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_MODEL_ID",
      message: "providerModelId must be a non-empty string",
    };
  }
  if (!provider) {
    return {
      ok: false,
      code: "INVALID_PROVIDER",
      message: "provider must be a non-empty string",
    };
  }

  const pathKey = buildPathKey(engineId, providerModelId);
  if (!pathKey) {
    return {
      ok: false,
      code: "INVALID_PATH_KEY",
      message: "could not derive pathKey",
    };
  }

  const catalogued = input?.catalogued !== false;
  const catalogSource =
    input?.catalogSource && isCatalogSource(input.catalogSource)
      ? input.catalogSource
      : CATALOG_SOURCE.STATIC;

  let availability = input?.availability;
  if (!isAvailability(availability)) {
    availability = AVAILABILITY.UNKNOWN;
  }

  if (
    catalogued &&
    input?.availability === undefined &&
    catalogSource === CATALOG_SOURCE.STATIC
  ) {
    availability = AVAILABILITY.UNKNOWN;
  }

  const identity = {
    schema: MODEL_IDENTITY_SCHEMA,
    pathKey,
    engineId,
    provider,
    providerModelId,
    displayName:
      typeof input?.displayName === "string" && input.displayName.trim()
        ? input.displayName.trim().slice(0, 128)
        : providerModelId,
    catalogued,
    availability,
    catalogSource,
    aliases: Array.isArray(input?.aliases)
      ? input.aliases
          .filter((a) => typeof a === "string" && a.trim())
          .map((a) => a.trim().slice(0, 128))
          .slice(0, 8)
      : [],
    discoveredAt:
      typeof input?.discoveredAt === "string" && input.discoveredAt.trim()
        ? input.discoveredAt.trim()
        : null,
  };

  return { ok: true, identity };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, identity: object } | { ok: false, code: string, message: string }}
 */
export function validateModelIdentity(value) {
  if (!value || typeof value !== "object") {
    return {
      ok: false,
      code: "INVALID_MODEL_IDENTITY",
      message: "identity must be an object",
    };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  if (record.schema !== MODEL_IDENTITY_SCHEMA) {
    return {
      ok: false,
      code: "INVALID_MODEL_IDENTITY",
      message: "unsupported identity schema",
    };
  }

  const engineId = normalizeEngineIdForModelPlane(record.engineId);
  const providerModelId = normalizeProviderModelId(record.providerModelId);
  const provider =
    typeof record.provider === "string" && record.provider.trim()
      ? record.provider.trim()
      : null;
  const pathKey =
    typeof record.pathKey === "string" ? record.pathKey.trim() : null;

  if (!engineId || !providerModelId || !provider || !pathKey) {
    return {
      ok: false,
      code: "INVALID_MODEL_IDENTITY",
      message: "missing required identity fields",
    };
  }

  const expectedKey = buildPathKey(engineId, providerModelId);
  if (pathKey !== expectedKey) {
    return {
      ok: false,
      code: "INVALID_PATH_KEY",
      message: "pathKey does not match engineId and providerModelId",
    };
  }

  if (typeof record.catalogued !== "boolean") {
    return {
      ok: false,
      code: "INVALID_MODEL_IDENTITY",
      message: "catalogued must be boolean",
    };
  }

  if (!isAvailability(record.availability)) {
    return {
      ok: false,
      code: "INVALID_AVAILABILITY",
      message: "invalid availability",
    };
  }

  if (!isCatalogSource(record.catalogSource)) {
    return {
      ok: false,
      code: "INVALID_CATALOG_SOURCE",
      message: "invalid catalogSource",
    };
  }

  return {
    ok: true,
    identity: {
      schema: MODEL_IDENTITY_SCHEMA,
      pathKey,
      engineId,
      provider: provider.slice(0, 64),
      providerModelId,
      displayName:
        typeof record.displayName === "string" && record.displayName.trim()
          ? record.displayName.trim().slice(0, 128)
          : providerModelId,
      catalogued: record.catalogued,
      availability: record.availability,
      catalogSource: record.catalogSource,
      aliases: Array.isArray(record.aliases) ? record.aliases : [],
      discoveredAt:
        typeof record.discoveredAt === "string" ? record.discoveredAt : null,
    },
  };
}

/**
 * Catalogued static membership must not imply availability=available.
 *
 * @param {{ catalogued?: boolean, availability?: string }} identity
 * @returns {boolean}
 */
export function cataloguedImpliesAvailable(identity) {
  return (
    identity?.catalogued === true &&
    identity?.availability === AVAILABILITY.AVAILABLE
  );
}
