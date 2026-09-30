/**
 * P6.3 — Copilot + Antigravity factual static catalogs.
 */
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const CLOUD_ENV = pathToFileURL(join(CHECKOUT, "scripts/pathcode-cli/ag1/cloud-env.mjs")).href;
const BRIDGE_CLIENT = pathToFileURL(join(CHECKOUT, "scripts/pathcode-cli/ag1/bridge-client.mjs")).href;

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
    expect(sdk).toContain("resolveProductionEngineModel");
    expect(sdk).toContain("modelPlaneResolution.providerModelId");
  });
});

describe("P6.3 Antigravity catalog and legacy env", () => {
  it("resolves each model source once for provenance and bridge child configuration", async () => {
    const { resolveAg1BridgeConfiguration } = await import(CLOUD_ENV);
    const { buildBridgeChildEnv } = await import(BRIDGE_CLIENT);
    const cases = [
      { env: { AG1_MODEL: "Y", GOOGLE_CLOUD_MODEL: "Z" }, expected: "Y", source: SELECTION_SOURCE.LEGACY_ENV },
      { env: { GOOGLE_CLOUD_MODEL: "Z" }, expected: "Z", source: SELECTION_SOURCE.LEGACY_ENV },
      { env: {}, expected: "gemini-2.5-flash", source: SELECTION_SOURCE.PROVIDER_DEFAULT },
      { env: { AG1_MODEL: "Y", GOOGLE_CLOUD_MODEL: "Z" }, providerModelId: "X", expected: "X", source: SELECTION_SOURCE.EXPLICIT_TURN },
      { env: { AG1_MODEL: "Y", GOOGLE_CLOUD_MODEL: "Z" }, pathKey: "antigravity:X-path", expected: "X-path", source: SELECTION_SOURCE.EXPLICIT_TURN },
    ];
    for (const input of cases) {
      const configured = resolveAg1BridgeConfiguration(input);
      expect(configured.ok).toBe(true);
      if (!configured.ok) continue;
      const childEnv = buildBridgeChildEnv(configured.env);
      const provenance = buildModelExecutionFromResolution({
        resolution: configured.resolution,
        engine: "antigravity",
        engineMode: "bridge",
        actualModelKnown: false,
      });
      expect(childEnv.AG1_MODEL).toBe(input.expected);
      expect(provenance?.requestedModel).toBe(childEnv.AG1_MODEL);
      expect(provenance?.selectionSource).toBe(input.source);
      expect(provenance?.actualModel).toBeNull();
      expect(provenance?.actualModelKnown).toBe(false);
    }
  });

  it("hydration preserves GOOGLE_CLOUD_MODEL without manufacturing AG1_MODEL", async () => {
    const { hydrateAg1CloudEnv } = await import(CLOUD_ENV);
    const env = hydrateAg1CloudEnv({ GOOGLE_CLOUD_MODEL: "Z", GOOGLE_CLOUD_PROJECT: "test-project" });
    expect(env.AG1_MODEL).toBeUndefined();
    expect(env.GOOGLE_CLOUD_MODEL).toBe("Z");
    const defaultEnv = hydrateAg1CloudEnv({ GOOGLE_CLOUD_PROJECT: "test-project" });
    expect(defaultEnv.AG1_MODEL).toBeUndefined();
  });

  it("passes the explicit configured model to an actual bridge child", async () => {
    const { resolveAg1BridgeConfiguration } = await import(CLOUD_ENV);
    const { createAntigravityEngineeringAgent } = await import(BRIDGE_CLIENT);
    const dir = mkdtempSync(join(tmpdir(), "path-p63-bridge-"));
    try {
      const script = join(dir, "bridge.cjs");
      writeFileSync(script, 'process.stdout.write(JSON.stringify({type:"started", model:process.env.AG1_MODEL})+"\\n"); process.stdin.resume();');
      const configured = resolveAg1BridgeConfiguration({ env: { GOOGLE_CLOUD_PROJECT: "test-project", AG1_MODEL: "Y" }, providerModelId: "X" });
      expect(configured.ok).toBe(true);
      if (!configured.ok) return;
      let resolveStarted: (model: string) => void = () => {};
      const started = new Promise<string>((resolve) => { resolveStarted = resolve; });
      const agent = createAntigravityEngineeringAgent({
        checkoutRoot: CHECKOUT,
        runtimeRoot: dir,
        pythonPath: process.execPath,
        bridgeScript: script,
        env: configured.env,
        onEvent: (event: { type?: string; model?: string }) => {
          if (event.type === "started") resolveStarted(String(event.model));
        },
      });
      try {
        const result = await agent.startTask({ taskId: "p63", workspace: dir, task: "test" });
        expect(result.ok).toBe(true);
        expect(await started).toBe(configured.resolution.providerModelId);
      } finally {
        agent.cancel();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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
