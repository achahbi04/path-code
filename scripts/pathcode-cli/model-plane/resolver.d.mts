import type { EngineeringEngineId, ModelIdentityV1 } from "./identity.d.mts";

export const RESOLVER_CODES: Readonly<{
  ENGINE_ID_REQUIRED: "ENGINE_ID_REQUIRED";
  MODEL_REF_REQUIRED: "MODEL_REF_REQUIRED";
  MODEL_INCOMPATIBLE: "MODEL_INCOMPATIBLE";
  INVALID_MODEL_IDENTITY: "INVALID_MODEL_IDENTITY";
}>;

export function resolveModelForEngine(input?: {
  engineId?: string | null;
  providerModelId?: string | null;
  provider?: string | null;
  modelIdentity?: object | null;
  pathKey?: string | null;
}):
  | { ok: true; engineId: EngineeringEngineId; identity: ModelIdentityV1 }
  | { ok: false; code: string; message: string };
