/** P6.5 — deterministic model policy for an engine already selected by S3. */

import { AVAILABILITY, ENGINEERING_ENGINE_IDS, validateModelIdentity } from "./identity.mjs";

export const AUTO_POLICY_VERSION = "path.model.auto.v1";

/**
 * Current adapter catalogs have no attested model traits or turn-need matches.
 * Use only an adapter-declared default present in its catalog, then an unnamed
 * provider default where the adapter contract supports one.
 *
 * @param {{ engineId: string, catalog: object[], adapterDefaultId?: string | null,
 *   supportsUnnamedProviderDefault?: boolean }} input
 */
export function resolveAutoModelPolicy(input) {
  if (!ENGINEERING_ENGINE_IDS.has(input?.engineId)) {
    return { ok: false, code: "ENGINE_ID_REQUIRED", message: "Auto requires an already-selected engineId" };
  }
  const defaultId = input.adapterDefaultId;
  if (defaultId) {
    for (const candidate of input.catalog || []) {
      const checked = validateModelIdentity(candidate);
      if (!checked.ok || checked.identity.engineId !== input.engineId || checked.identity.providerModelId !== defaultId || checked.identity.catalogued !== true) continue;
      if (checked.identity.availability === AVAILABILITY.UNAVAILABLE || checked.identity.availability === AVAILABILITY.DEPRECATED) continue;
      return {
        ok: true,
        engineId: input.engineId,
        identity: checked.identity,
        providerModelId: checked.identity.providerModelId,
        autoPolicyVersion: AUTO_POLICY_VERSION,
      };
    }
  }
  if (input.supportsUnnamedProviderDefault === true) {
    return { ok: true, engineId: input.engineId, identity: null, providerModelId: null, autoPolicyVersion: AUTO_POLICY_VERSION };
  }
  return { ok: false, code: "MODEL_RESOLUTION_FAILED", message: `Auto has no valid default for ${input.engineId}` };
}
