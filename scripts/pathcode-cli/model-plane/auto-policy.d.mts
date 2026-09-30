import type { ModelIdentityV1 } from "./identity.d.mts";

export const AUTO_POLICY_VERSION: "path.model.auto.v1";
export function resolveAutoModelPolicy(input: {
  engineId: string;
  catalog: object[];
  adapterDefaultId?: string | null;
  supportsUnnamedProviderDefault?: boolean;
}):
  | { ok: true; engineId: string; identity: ModelIdentityV1 | null; providerModelId: string | null; autoPolicyVersion: typeof AUTO_POLICY_VERSION }
  | { ok: false; code: string; message: string };
