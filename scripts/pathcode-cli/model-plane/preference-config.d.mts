import type { EngineeringEngineId } from "./identity.d.mts";

export const PROJECT_MODEL_PREFERENCES_SCHEMA: "path.model-preferences.v1";
export const MODEL_PREFERENCE_ENGINES: ReadonlyArray<EngineeringEngineId>;

export function validateModelPreference(value: unknown):
  | { ok: true; value: string }
  | { ok: false; code: string; message: string };

export function resolveProjectModelPreferencesPath(projectRoot: string): string;

export function readProjectModelPreferences(projectRoot: string):
  | { ok: true; source: "missing" | "file"; path: string; byEngine: Partial<Record<EngineeringEngineId, string>>; updatedAt?: string }
  | { ok: false; code: string; message: string; path: string };

export function writeProjectModelPreference(input: {
  projectRoot: string;
  engineId: EngineeringEngineId;
  modelId: string;
}):
  | { ok: true; path: string; payload: { schema: string; byEngine: Partial<Record<EngineeringEngineId, string>>; updatedAt: string } }
  | { ok: false; code: string; message: string; path?: string };
