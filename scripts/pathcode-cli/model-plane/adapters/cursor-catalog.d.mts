import type { ModelIdentityV1 } from "../identity.d.mts";

export const CURSOR_ENGINE_ID: "cursor";
export const CURSOR_DEFAULT_PROVIDER_MODEL_ID: "composer-2.5";

export function getCursorStaticCatalogIdentities(): ModelIdentityV1[];
export function findCursorCatalogIdentity(
  providerModelId: string,
): ModelIdentityV1 | null;
export function readLegacyCursorModelFromEnv(
  env?: Record<string, string | undefined>,
): {
  providerModelId: string;
  envKey: "PATHCODE_CURSOR_MODEL" | "CURSOR_MODEL";
} | null;
export function materializeCursorModelIdentity(
  providerModelId: string,
  catalogSource: string,
): { ok: true; identity: ModelIdentityV1 } | { ok: false; code: string; message: string };
