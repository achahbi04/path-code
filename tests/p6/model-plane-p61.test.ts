/**
 * P6.1 — Cursor catalog + legacy env absorption.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CURSOR_DEFAULT_PROVIDER_MODEL_ID,
  findCursorCatalogIdentity,
  getCursorStaticCatalogIdentities,
  readLegacyCursorModelFromEnv,
} from "../../scripts/pathcode-cli/model-plane/adapters/cursor-catalog.mjs";
import {
  AVAILABILITY,
  createModelIdentity,
} from "../../scripts/pathcode-cli/model-plane/identity.mjs";
import {
  RESOLVER_CODES,
  SELECTION_SOURCE,
  resolveCursorEngineModel,
  resolveModelForEngine,
} from "../../scripts/pathcode-cli/model-plane/resolver.mjs";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CURSOR_SDK = join(CHECKOUT, "scripts/pathcode-cli/ag10/cursor-sdk.mjs");
const AG10_CONTRACT = join(CHECKOUT, "scripts/pathcode-cli/ag10/engine-contract.mjs");

describe("P6.1 Cursor static catalog", () => {
  it("lists composer-2.5 as catalogued with availability unknown", () => {
    const catalog = getCursorStaticCatalogIdentities();
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.providerModelId).toBe(CURSOR_DEFAULT_PROVIDER_MODEL_ID);
    expect(catalog[0]?.catalogued).toBe(true);
    expect(catalog[0]?.availability).toBe(AVAILABILITY.UNKNOWN);
    const found = findCursorCatalogIdentity("composer-2.5");
    expect(found?.availability).toBe(AVAILABILITY.UNKNOWN);
    expect(found?.availability).not.toBe(AVAILABILITY.AVAILABLE);
  });
});

describe("P6.1 legacy env absorption", () => {
  it("PATHCODE_CURSOR_MODEL wins over CURSOR_MODEL", () => {
    const env = {
      PATHCODE_CURSOR_MODEL: "from-pathcode",
      CURSOR_MODEL: "from-cursor",
    };
    expect(readLegacyCursorModelFromEnv(env)?.providerModelId).toBe(
      "from-pathcode",
    );
    const resolved = resolveCursorEngineModel({ toolEnv: env });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.providerModelId).toBe("from-pathcode");
    expect(resolved.selectionSource).toBe(SELECTION_SOURCE.LEGACY_ENV);
  });

  it("CURSOR_MODEL works when PATHCODE_CURSOR_MODEL is absent", () => {
    const resolved = resolveCursorEngineModel({
      toolEnv: { CURSOR_MODEL: "legacy-cursor-model" },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.providerModelId).toBe("legacy-cursor-model");
    expect(resolved.selectionSource).toBe(SELECTION_SOURCE.LEGACY_ENV);
  });

  it("defaults to composer-2.5 through Model Plane when env unset", () => {
    const resolved = resolveCursorEngineModel({ toolEnv: {} });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.providerModelId).toBe("composer-2.5");
    expect(resolved.selectionSource).toBe(SELECTION_SOURCE.AUTO);
    expect(resolved.identity).not.toBeNull();
    if (!resolved.identity) return;
    expect(resolved.identity.pathKey).toBe("cursor:composer-2.5");
  });
});

describe("P6.1 cross-engine and fabric boundaries", () => {
  it("rejects cross-engine model identity before Cursor execution", () => {
    const copilotIdentity = createModelIdentity({
      engineId: "copilot",
      provider: "copilot",
      providerModelId: "gpt-4o",
    });
    expect(copilotIdentity.ok).toBe(true);
    if (!copilotIdentity.ok) return;
    const result = resolveCursorEngineModel({
      modelIdentity: copilotIdentity.identity,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(RESOLVER_CODES.MODEL_INCOMPATIBLE);
  });

  it("resolveModelForEngine cursor path matches resolveCursorEngineModel", () => {
    const direct = resolveCursorEngineModel({ toolEnv: {} });
    const viaEngine = resolveModelForEngine({ engineId: "cursor", toolEnv: {} });
    expect(direct).toEqual(viaEngine);
  });

  it("Engine Fabric contract file unchanged by P6.1 scope", () => {
    const fabric = readFileSync(AG10_CONTRACT, "utf8");
    expect(fabric).toContain("export function selectEngineForTurn");
    expect(fabric).not.toMatch(/model-plane/);
  });
});

describe("P6.1 cursor-sdk single resolver path", () => {
  it("does not re-resolve model from env inside tryStart or runEngineeringTurn", () => {
    const src = readFileSync(CURSOR_SDK, "utf8");
    const tryStartBlock = src.slice(
      src.indexOf("async function tryStart"),
      src.indexOf("async function runEngineeringTurn"),
    );
    const runTurnBlock = src.slice(
      src.indexOf("async function runEngineeringTurn"),
      src.indexOf("async function steer"),
    );
    expect(tryStartBlock).not.toMatch(/resolveCursorModel\(/);
    expect(runTurnBlock).not.toMatch(/resolveCursorModel\(/);
    expect(tryStartBlock).toContain("modelPlaneResolution.model");
    expect(runTurnBlock).toContain("turnResolution.model");
  });

  it("resolveCursorModel delegates to Model Plane", () => {
    const src = readFileSync(CURSOR_SDK, "utf8");
    expect(src).toMatch(/resolveCursorEngineModel/);
    expect(src).toMatch(/export function resolveCursorModel/);
  });
});
