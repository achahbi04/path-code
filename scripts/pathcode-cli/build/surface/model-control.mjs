/** Builder model choices are scoped by an existing engine preference. */

import { AVAILABILITY } from "../../model-plane/identity.mjs";
import { getCursorStaticCatalogIdentities } from "../../model-plane/adapters/cursor-catalog.mjs";
import { getCopilotStaticCatalogIdentities } from "../../model-plane/adapters/copilot-catalog.mjs";
import { getAntigravityStaticCatalogIdentities } from "../../model-plane/adapters/antigravity-catalog.mjs";
import { readProjectModelPreferences, writeProjectModelPreference } from "../../model-plane/preference-config.mjs";
import { readPreferences } from "../../preferences.mjs";

const CATALOGS = {
  cursor: getCursorStaticCatalogIdentities,
  copilot: getCopilotStaticCatalogIdentities,
  antigravity: getAntigravityStaticCatalogIdentities,
};

export function projectBuilderModelControl({ preferredEngine, projectRoot = null, env = process.env } = {}) {
  const engineId = Object.hasOwn(CATALOGS, preferredEngine) ? preferredEngine : null;
  const options = [{ value: "auto", label: "Auto" }];
  if (!engineId) return { preferredEngine: null, options, value: "auto", editable: false, diagnostic: null };

  for (const identity of CATALOGS[engineId]()) {
    if (identity.availability === AVAILABILITY.UNAVAILABLE || identity.availability === AVAILABILITY.DEPRECATED) continue;
    options.push({ value: identity.providerModelId, label: identity.providerModelId });
  }

  const project = projectRoot ? readProjectModelPreferences(projectRoot) : null;
  const user = readPreferences({ env });
  const configured = project?.ok && project.byEngine[engineId]
    ? project.byEngine[engineId]
    : user.ok ? user.engineering.byEngine[engineId] : null;
  const listed = !configured || options.some((option) => option.value === configured);
  const diagnostic = project && !project.ok
    ? `Project model preference could not be read: ${project.message}`
    : !user.ok
      ? `User model preference could not be read: ${user.message}`
      : !listed
        ? "A saved model preference is not in the current model list."
        : null;
  return {
    preferredEngine: engineId,
    options,
    value: project && !project.ok ? null : listed ? configured || "auto" : null,
    editable: Boolean(projectRoot) && project?.ok !== false,
    diagnostic,
  };
}

/** Explicit project-default mutation; no Builder-specific persistence. */
export function writeBuilderModelPreference({ preferredEngine, projectRoot, modelId, env = process.env }) {
  const control = projectBuilderModelControl({ preferredEngine, projectRoot, env });
  if (!control.preferredEngine || !projectRoot) {
    return { ok: false, code: "MODEL_SCOPE_REQUIRED", message: "A preferred engine and project are required." };
  }
  if (!control.options.some((option) => option.value === modelId)) {
    return { ok: false, code: "MODEL_NOT_LISTED", message: "This model is not listed for the preferred engine." };
  }
  return writeProjectModelPreference({ projectRoot, engineId: control.preferredEngine, modelId });
}
