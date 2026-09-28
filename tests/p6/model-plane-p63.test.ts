/**
 * P6.3 — Copilot + Antigravity factual static catalogs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  getCopilotStaticCatalogIdentities,
} from "../../scripts/pathcode-cli/model-plane/adapters/copilot-catalog.mjs";
import {
  ANTIGRAVITY_DEFAULT_PROVIDER_MODEL_ID,
  findAntigravityCatalogIdentity,
  getAntigravityStaticCatalogIdentities,
  readLegacyAntigravityModelFromEnv,
} from "../../scripts/pathcode-cli/model-plane/adapters/antigravity-catalog.mjs";
import {
  AVAILABILITY,
  createModelIdentity,
} from "../../scripts/pathcode-cli/model-plane/identity.mjs";
import {
  MODEL_EXECUTION_SCHEMA,
  buildModelExecutionFromResolution,
} from "../../scripts/pathcode-cli/model-plane/execution-provenance.mjs";
import {
  RESOLVER_CODES,
  SELECTION_SOURCE,
  resolveAntigravityEngineModel,
  resolveCopilotEngineModel,
  resolveCursorEngineModel,
  resolveModelForEngine,
} from "../../scripts/pathcode-cli/model-plane/resolver.mjs";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const COPILOT_SDK = join(CHECKOUT, "scripts/pathcode-cli/ag10/copilot-sdk.mjs");
const AG10_CONTRACT = join(CHECKOUT, "scripts/pathcode-cli/ag10/engine-contract.mjs");
const MODEL_PLANE = join(CHECKOUT, "scripts/pathcode-cli/model-plane");

describe("P6.3 Copilot catalog and provider default", () => {
  it("A — does not invent static Copilot model IDs", () => {
    expect(getCopilotStaticCatalogIdentities()).toHaveLength(0);
  });

  it("B — provider default resolves without claiming actual model", () => {
    const plane = resolveCopilotEngineModel({ toolEnv: {} });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    expect(plane.providerModelId).toBeNull();
    expect(plane.model).toBeNull();
    expect(plane.selectionSource).toBe(SELECTION_SOURCE.PROVIDER_DEFAULT);
    const exec = buildModelExecutionFromResolution({
      resolution: plane,
      engine: "copilot",
      engineMode: "native_sdk",
      provider: null,
      actualModelKnown: false,
    });
    expect(exec?.executionSchema).toBe(MODEL_EXECUTION_SCHEMA);
    expect(exec?.requestedModel).toBeNull();
    expect(exec?.actualModel).toBeNull();
    expect(exec?.actualModelKnown).toBe(false);
    expect(exec?.selectionSource).toBe(SELECTION_SOURCE.PROVIDER_DEFAULT);
  });

  it("C — explicit Copilot model is engine-scoped and passes resolution only to Copilot", () => {
    const explicit = resolveCopilotEngineModel({
      toolEnv: {},
      providerModelId: "operator-explicit-copilot-model",
    });
    expect(explicit.ok).toBe(true);
    if (!explicit.ok) return;
    expect(explicit.identity?.engineId).toBe("copilot");
    expect(explicit.providerModelId).toBe("operator-explicit-copilot-model");
    expect(explicit.identity?.catalogued).toBe(false);

    const cursorReject = resolveCursorEngineModel({
      pathKey: "copilot:operator-explicit-copilot-model",
    });
    expect(cursorReject.ok).toBe(false);
    if (cursorReject.ok) return;
    expect(cursorReject.code).toBe(RESOLVER_CODES.MODEL_INCOMPATIBLE);

    const sdk = readFileSync(COPILOT_SDK, "utf8");
    expect(sdk).toContain("resolveCopilotEngineModel");
    expect(sdk).toContain("modelPlaneResolution.providerModelId");
  });
});

describe("P6.3 Antigravity catalog and legacy env", () => {
  it("D — defaults to evidence-backed gemini-2.5-flash", () => {
    const plane = resolveAntigravityEngineModel({ toolEnv: {} });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    expect(plane.providerModelId).toBe(ANTIGRAVITY_DEFAULT_PROVIDER_MODEL_ID);
    expect(plane.identity?.pathKey).toBe("antigravity:gemini-2.5-flash");
    expect(plane.selectionSource).toBe(SELECTION_SOURCE.PROVIDER_DEFAULT);
  });

  it("E — AG1_MODEL wins over GOOGLE_CLOUD_MODEL", () => {
    const env = {
      AG1_MODEL: "from-ag1",
      GOOGLE_CLOUD_MODEL: "from-cloud",
    };
    expect(readLegacyAntigravityModelFromEnv(env)?.providerModelId).toBe(
      "from-ag1",
    );
    const plane = resolveAntigravityEngineModel({ toolEnv: env });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    expect(plane.providerModelId).toBe("from-ag1");
  });

  it("F — env-selected Antigravity model uses selectionSource legacy_env", () => {
    const plane = resolveAntigravityEngineModel({
      toolEnv: { GOOGLE_CLOUD_MODEL: "gemini-custom-env" },
    });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    expect(plane.selectionSource).toBe(SELECTION_SOURCE.LEGACY_ENV);
    expect(plane.identity?.catalogSource).toBe("legacy_env");
  });

  it("G — static catalog entries default availability unknown", () => {
    const catalog = getAntigravityStaticCatalogIdentities();
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.providerModelId).toBe(ANTIGRAVITY_DEFAULT_PROVIDER_MODEL_ID);
    expect(catalog[0]?.availability).toBe(AVAILABILITY.UNKNOWN);
    expect(findAntigravityCatalogIdentity("gemini-2.5-flash")?.availability).toBe(
      AVAILABILITY.UNKNOWN,
    );
  });

  it("H — configured AG model is not persisted as known actual model", () => {
    const plane = resolveAntigravityEngineModel({
      toolEnv: { AG1_MODEL: "gemini-2.5-flash" },
    });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    const exec = buildModelExecutionFromResolution({
      resolution: plane,
      engine: "antigravity",
      engineMode: "bridge",
      provider: "Vertex AI",
      actualModelKnown: false,
    });
    expect(exec?.requestedModel).toBe("gemini-2.5-flash");
    expect(exec?.actualModelKnown).toBe(false);
    expect(exec?.actualModel).toBeNull();
  });
});

describe("P6.3 cross-engine, provenance, and boundaries", () => {
  it("I — cross-engine identities produce MODEL_INCOMPATIBLE", () => {
    const agOnCursor = resolveCursorEngineModel({
      pathKey: "antigravity:gemini-2.5-flash",
    });
    expect(agOnCursor.ok).toBe(false);
    if (agOnCursor.ok) return;
    expect(agOnCursor.code).toBe(RESOLVER_CODES.MODEL_INCOMPATIBLE);

    const cursorOnAg = resolveAntigravityEngineModel({
      pathKey: "cursor:composer-2.5",
    });
    expect(cursorOnAg.ok).toBe(false);
    if (cursorOnAg.ok) return;
    expect(cursorOnAg.code).toBe(RESOLVER_CODES.MODEL_INCOMPATIBLE);

    const cursorIdentity = createModelIdentity({
      engineId: "cursor",
      provider: "cursor",
      providerModelId: "composer-2.5",
    });
    expect(cursorIdentity.ok).toBe(true);
    if (!cursorIdentity.ok) return;
    const copilotReject = resolveCopilotEngineModel({
      modelIdentity: cursorIdentity.identity,
    });
    expect(copilotReject.ok).toBe(false);
    if (copilotReject.ok) return;
    expect(copilotReject.code).toBe(RESOLVER_CODES.MODEL_INCOMPATIBLE);
  });

  it("J — P6.2 provenance shape remains canonical on Copilot turns", () => {
    const plane = resolveCopilotEngineModel({
      toolEnv: {},
      providerModelId: "explicit-only",
    });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    const exec = buildModelExecutionFromResolution({
      resolution: plane,
      engine: "copilot",
      engineMode: "native_sdk",
      provider: null,
      actualModelKnown: false,
    });
    expect(exec?.executionSchema).toBe(MODEL_EXECUTION_SCHEMA);
    expect(exec?.requestedModel).toBe("explicit-only");
    expect(exec?.actualModelKnown).toBe(false);
  });

  it("K — Engine Fabric routing source unchanged", () => {
    const fabric = readFileSync(AG10_CONTRACT, "utf8");
    expect(fabric).toContain("export function selectEngineForTurn");
    expect(fabric).not.toMatch(/copilot-catalog|antigravity-catalog/);
  });

  it("L — no dynamic discovery in P6.3 model-plane adapters", () => {
    const resolver = readFileSync(
      join(MODEL_PLANE, "resolver.mjs"),
      "utf8",
    );
    const copilotCatalog = readFileSync(
      join(MODEL_PLANE, "adapters/copilot-catalog.mjs"),
      "utf8",
    );
    const agCatalog = readFileSync(
      join(MODEL_PLANE, "adapters/antigravity-catalog.mjs"),
      "utf8",
    );
    expect(resolver).not.toMatch(/discoverModels|dynamicDiscovery/i);
    expect(copilotCatalog).not.toMatch(/discoverModels|dynamicDiscovery/i);
    expect(agCatalog).not.toMatch(/discoverModels|dynamicDiscovery/i);
    expect(copilotCatalog).toContain("no dynamic discovery");
    expect(agCatalog).toContain("no dynamic discovery");
  });

  it("resolveModelForEngine delegates to Copilot and Antigravity resolvers", () => {
    const copilot = resolveModelForEngine({ engineId: "copilot", toolEnv: {} });
    const directCopilot = resolveCopilotEngineModel({ toolEnv: {} });
    expect(copilot).toEqual(directCopilot);

    const ag = resolveModelForEngine({ engineId: "antigravity", toolEnv: {} });
    const directAg = resolveAntigravityEngineModel({ toolEnv: {} });
    expect(ag).toEqual(directAg);
  });
});
