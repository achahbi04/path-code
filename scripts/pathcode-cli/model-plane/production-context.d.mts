import type { ModelPlaneResolution } from "./resolver.d.mts";
import type { EngineeringEngineId } from "./identity.d.mts";

export function resolveProductionEngineModel(input: {
  engineId: EngineeringEngineId;
  projectRoot?: string | null;
  checkpoint?: { modelPreferences?: Partial<Record<EngineeringEngineId, string>> } | null;
  env?: Record<string, string | undefined>;
  preferencesEnv?: Record<string, string | undefined>;
  readUserPreferences?: boolean;
  providerModelId?: string | null;
  modelIdentity?: object | null;
  pathKey?: string | null;
}): ModelPlaneResolution;
