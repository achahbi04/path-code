import type { ModelPlaneResolution } from "./resolver.mjs";

export function validateEngineeringModelCommand(value: unknown):
  | { ok: true; value: string }
  | { ok: false; code: string; message: string };
export function resolveEngineeringModelCommand(input: {
  engineId: string;
  modelId: string;
  projectRoot?: string | null;
  checkpoint?: object | null;
  env?: Record<string, string | undefined>;
  preferencesEnv?: Record<string, string | undefined>;
}): ModelPlaneResolution;
