export type EngineeringEngineId = "antigravity" | "copilot" | "cursor";

export const MODEL_IDENTITY_SCHEMA: "path.model.identity.v1";
export const ENGINEERING_ENGINE_IDS: ReadonlySet<EngineeringEngineId>;
export const AVAILABILITY: Readonly<{
  AVAILABLE: "available";
  UNAVAILABLE: "unavailable";
  DEPRECATED: "deprecated";
  UNKNOWN: "unknown";
}>;
export const CATALOG_SOURCE: Readonly<{
  STATIC: "static";
  DISCOVERED: "discovered";
  LEGACY_ENV: "legacy_env";
}>;

export type ModelIdentityV1 = {
  schema: typeof MODEL_IDENTITY_SCHEMA;
  pathKey: string;
  engineId: EngineeringEngineId;
  provider: string;
  providerModelId: string;
  displayName: string;
  catalogued: boolean;
  availability: (typeof AVAILABILITY)[keyof typeof AVAILABILITY];
  catalogSource: (typeof CATALOG_SOURCE)[keyof typeof CATALOG_SOURCE];
  aliases: string[];
  discoveredAt: string | null;
};

export function normalizeEngineIdForModelPlane(
  value: unknown,
): EngineeringEngineId | null;
export function normalizeProviderModelId(value: unknown): string | null;
export function buildPathKey(
  engineId: EngineeringEngineId | string,
  providerModelId: string,
): string | null;
export function parsePathKey(
  pathKey: string,
): { engineId: EngineeringEngineId; providerModelId: string } | null;
export function createModelIdentity(input: {
  engineId: EngineeringEngineId | string;
  provider: string;
  providerModelId: string;
  displayName?: string | null;
  catalogued?: boolean;
  availability?: string;
  catalogSource?: string;
  aliases?: string[];
  discoveredAt?: string | null;
}): { ok: true; identity: ModelIdentityV1 } | { ok: false; code: string; message: string };
export function validateModelIdentity(
  value: unknown,
): { ok: true; identity: ModelIdentityV1 } | { ok: false; code: string; message: string };
export function cataloguedImpliesAvailable(identity: {
  catalogued?: boolean;
  availability?: string;
}): boolean;
