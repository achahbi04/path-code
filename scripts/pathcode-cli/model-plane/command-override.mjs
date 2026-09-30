/** Interpret a PATH Code engineering command using the existing Model Plane. */

import { buildPathKey, parsePathKey } from "./identity.mjs";
import { getCursorStaticCatalogIdentities } from "./adapters/cursor-catalog.mjs";
import { getCopilotStaticCatalogIdentities } from "./adapters/copilot-catalog.mjs";
import { getAntigravityStaticCatalogIdentities } from "./adapters/antigravity-catalog.mjs";
import { validateModelPreference } from "./preference-config.mjs";
import { resolveProductionEngineModel } from "./production-context.mjs";

const catalogs = [
  ["cursor", getCursorStaticCatalogIdentities],
  ["copilot", getCopilotStaticCatalogIdentities],
  ["antigravity", getAntigravityStaticCatalogIdentities],
];

export function validateEngineeringModelCommand(value) {
  return validateModelPreference(value);
}

/** A named catalog identity retains its engine scope across a CLI boundary. */
export function resolveEngineeringModelCommand(input) {
  const value = input.modelId;
  const checked = validateEngineeringModelCommand(value);
  if (!checked.ok) return checked;
  const parsed = parsePathKey(value);
  const matches = catalogs
    .flatMap(([engineId, read]) => read().map((identity) => ({ engineId, identity })))
    .filter(({ identity }) => identity.providerModelId === value);
  const owner = parsed || (matches.length === 1 ? matches[0] : null);
  return resolveProductionEngineModel({
    ...input,
    ...(owner
      ? { pathKey: parsed ? value : buildPathKey(owner.engineId, value) }
      : { providerModelId: value }),
  });
}
