/** P6.4 — one model-preference context for an already selected engine. */

import { resolveModelForEngine } from "./resolver.mjs";

/**
 * @param {{
 *   engineId: string,
 *   projectRoot?: string | null,
 *   checkpoint?: object | null,
 *   env?: Record<string, string | undefined>,
 *   preferencesEnv?: Record<string, string | undefined>,
 *   readUserPreferences?: boolean,
 *   providerModelId?: string | null,
 *   modelIdentity?: object | null,
 *   pathKey?: string | null,
 * }} input
 */
export function resolveProductionEngineModel(input) {
  const env = input.env || process.env;
  const pinned = input.checkpoint?.modelPreferences?.[input.engineId];
  return resolveModelForEngine({
    engineId: input.engineId,
    env,
    preferencesEnv: input.preferencesEnv || env,
    readUserPreferences: input.readUserPreferences === true || Boolean(input.projectRoot),
    projectRoot: input.projectRoot,
    ...(typeof pinned === "string" && pinned.trim()
      ? { taskPin: { engineId: input.engineId, providerModelId: pinned } }
      : {}),
    providerModelId: input.providerModelId,
    modelIdentity: input.modelIdentity,
    pathKey: input.pathKey,
  });
}
