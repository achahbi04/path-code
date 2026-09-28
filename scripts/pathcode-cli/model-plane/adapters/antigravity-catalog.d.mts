import type { ModelIdentityV1 } from "../identity.d.mts";

export const ANTIGRAVITY_ENGINE_ID: "antigravity";
export const ANTIGRAVITY_DEFAULT_PROVIDER_MODEL_ID: "gemini-2.5-flash";

export function getAntigravityStaticCatalogIdentities(): ModelIdentityV1[];
export function findAntigravityCatalogIdentity(
  providerModelId: string,
): ModelIdentityV1 | null;
export function readLegacyAntigravityModelFromEnv(
  env?: Record<string, string | undefined>,
): {
  providerModelId: string;
  envKey: "AG1_MODEL" | "GOOGLE_CLOUD_MODEL";
} | null;
export function materializeAntigravityModelIdentity(
  providerModelId: string,
  catalogSource: string,
): { ok: true; identity: ModelIdentityV1 } | { ok: false; code: string; message: string };
