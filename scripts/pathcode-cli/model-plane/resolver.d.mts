import type { EngineeringEngineId, ModelIdentityV1 } from "./identity.d.mts";

export const SELECTION_SOURCE: Readonly<{
  EXPLICIT_TURN: "explicit_turn";
  LEGACY_ENV: "legacy_env";
  PROVIDER_DEFAULT: "provider_default";
}>;

export const RESOLVER_CODES: Readonly<{
  ENGINE_ID_REQUIRED: "ENGINE_ID_REQUIRED";
  MODEL_REF_REQUIRED: "MODEL_REF_REQUIRED";
  MODEL_INCOMPATIBLE: "MODEL_INCOMPATIBLE";
  INVALID_MODEL_IDENTITY: "INVALID_MODEL_IDENTITY";
}>;

export type ModelPlaneResolution =
  | {
      ok: true;
      engineId: EngineeringEngineId;
      identity: ModelIdentityV1 | null;
      providerModelId: string | null;
      selectionSource: string;
      model: { id: string } | null;
    }
  | { ok: false; code: string; message: string };

export function resolveCursorEngineModel(input?: {
  toolEnv?: Record<string, string | undefined>;
  env?: Record<string, string | undefined>;
  providerModelId?: string | null;
  modelIdentity?: object | null;
  pathKey?: string | null;
}): ModelPlaneResolution;

export function resolveCopilotEngineModel(input?: {
  toolEnv?: Record<string, string | undefined>;
  env?: Record<string, string | undefined>;
  providerModelId?: string | null;
  modelIdentity?: object | null;
  pathKey?: string | null;
}): ModelPlaneResolution;

export function resolveAntigravityEngineModel(input?: {
  toolEnv?: Record<string, string | undefined>;
  env?: Record<string, string | undefined>;
  providerModelId?: string | null;
  modelIdentity?: object | null;
  pathKey?: string | null;
}): ModelPlaneResolution;

export function resolveModelForEngine(input?: {
  engineId?: string | null;
  providerModelId?: string | null;
  provider?: string | null;
  modelIdentity?: object | null;
  pathKey?: string | null;
  toolEnv?: Record<string, string | undefined>;
  env?: Record<string, string | undefined>;
}): ModelPlaneResolution;
