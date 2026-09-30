import type { EngineeringEngineId, ModelIdentityV1 } from "./identity.d.mts";

export const SELECTION_SOURCE: Readonly<{
  EXPLICIT_TURN: "explicit_turn";
  TASK_PIN: "task_pin";
  PROJECT_DEFAULT: "project_default";
  USER_DEFAULT: "user_default";
  LEGACY_ENV: "legacy_env";
  AUTO: "auto";
  PROVIDER_DEFAULT: "provider_default";
}>;

export const RESOLVER_CODES: Readonly<{
  ENGINE_ID_REQUIRED: "ENGINE_ID_REQUIRED";
  MODEL_REF_REQUIRED: "MODEL_REF_REQUIRED";
  MODEL_INCOMPATIBLE: "MODEL_INCOMPATIBLE";
  INVALID_MODEL_IDENTITY: "INVALID_MODEL_IDENTITY";
  AUTO_POLICY_PENDING: "AUTO_POLICY_PENDING";
  MODEL_RESOLUTION_FAILED: "MODEL_RESOLUTION_FAILED";
}>;

export type ModelPlaneResolution =
  | {
      ok: true;
      engineId: EngineeringEngineId;
      identity: ModelIdentityV1 | null;
      providerModelId: string | null;
      selectionSource: string;
      model: { id: string } | null;
      autoPolicyVersion?: string;
      diagnostics?: Array<{ code: string; message: string; path?: string }>;
    }
  | { ok: false; code: string; message: string; diagnostics?: Array<{ code: string; message: string; path?: string }> };

export type ModelPreferenceInputs = {
  taskPin?: { engineId: EngineeringEngineId; providerModelId: string } | null;
  projectRoot?: string | null;
  projectDefault?: string | null;
  userDefault?: string | null;
  readUserPreferences?: boolean;
  preferencesEnv?: Record<string, string | undefined>;
};

export function resolveCursorEngineModel(input?: {
  toolEnv?: Record<string, string | undefined>;
  env?: Record<string, string | undefined>;
  providerModelId?: string | null;
  modelIdentity?: object | null;
  pathKey?: string | null;
} & ModelPreferenceInputs): ModelPlaneResolution;

export function resolveCopilotEngineModel(input?: {
  toolEnv?: Record<string, string | undefined>;
  env?: Record<string, string | undefined>;
  providerModelId?: string | null;
  modelIdentity?: object | null;
  pathKey?: string | null;
} & ModelPreferenceInputs): ModelPlaneResolution;

export function resolveAntigravityEngineModel(input?: {
  toolEnv?: Record<string, string | undefined>;
  env?: Record<string, string | undefined>;
  providerModelId?: string | null;
  modelIdentity?: object | null;
  pathKey?: string | null;
} & ModelPreferenceInputs): ModelPlaneResolution;

export function resolveModelForEngine(input?: {
  engineId?: string | null;
  providerModelId?: string | null;
  provider?: string | null;
  modelIdentity?: object | null;
  pathKey?: string | null;
  toolEnv?: Record<string, string | undefined>;
  env?: Record<string, string | undefined>;
} & ModelPreferenceInputs): ModelPlaneResolution;
