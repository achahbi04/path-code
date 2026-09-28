import type { ModelIdentityV1 } from "../identity.d.mts";

export const COPILOT_ENGINE_ID: "copilot";

export function getCopilotStaticCatalogIdentities(): ModelIdentityV1[];
export function findCopilotCatalogIdentity(
  providerModelId: string,
): ModelIdentityV1 | null;
export function materializeCopilotModelIdentity(
  providerModelId: string,
  catalogSource: string,
): { ok: true; identity: ModelIdentityV1 } | { ok: false; code: string; message: string };
