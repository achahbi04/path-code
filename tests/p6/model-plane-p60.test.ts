/**
 * P6.0 — model identity + resolver skeleton (falsification).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  AVAILABILITY,
  buildPathKey,
  cataloguedImpliesAvailable,
  createModelIdentity,
  MODEL_IDENTITY_SCHEMA,
} from "../../scripts/pathcode-cli/model-plane/identity.mjs";
import {
  RESOLVER_CODES,
  resolveModelForEngine,
} from "../../scripts/pathcode-cli/model-plane/resolver.mjs";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MODEL_PLANE = join(CHECKOUT, "scripts/pathcode-cli/model-plane");
const AG10_CONTRACT = join(CHECKOUT, "scripts/pathcode-cli/ag10/engine-contract.mjs");

describe("P6.0 path.model.identity.v1", () => {
  it("engine-scopes pathKey so the same providerModelId on two engines differs", () => {
    const shared = "gpt-4o";
    const cursorKey = buildPathKey("cursor", shared);
    const copilotKey = buildPathKey("copilot", shared);
    expect(cursorKey).toBe(`cursor:${shared}`);
    expect(copilotKey).toBe(`copilot:${shared}`);
    expect(cursorKey).not.toBe(copilotKey);
  });

  it("static catalog identity defaults catalogued with availability unknown", () => {
    const created = createModelIdentity({
      engineId: "cursor",
      provider: "cursor",
      providerModelId: "composer-2.5",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.identity.schema).toBe(MODEL_IDENTITY_SCHEMA);
    expect(created.identity.catalogued).toBe(true);
    expect(created.identity.availability).toBe(AVAILABILITY.UNKNOWN);
    expect(cataloguedImpliesAvailable(created.identity)).toBe(false);
  });

  it("allows explicit availability=available when operator establishes it", () => {
    const created = createModelIdentity({
      engineId: "cursor",
      provider: "cursor",
      providerModelId: "composer-2.5",
      availability: AVAILABILITY.AVAILABLE,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.identity.availability).toBe(AVAILABILITY.AVAILABLE);
    expect(cataloguedImpliesAvailable(created.identity)).toBe(true);
  });
});

describe("P6.0 resolveModelForEngine", () => {
  it("requires engineId before model resolution", () => {
    const result = resolveModelForEngine({
      providerModelId: "composer-2.5",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(RESOLVER_CODES.ENGINE_ID_REQUIRED);
  });

  it("rejects cross-engine model identity with MODEL_INCOMPATIBLE", () => {
    const cursorIdentity = createModelIdentity({
      engineId: "cursor",
      provider: "cursor",
      providerModelId: "composer-2.5",
    });
    expect(cursorIdentity.ok).toBe(true);
    if (!cursorIdentity.ok) return;

    const result = resolveModelForEngine({
      engineId: "copilot",
      modelIdentity: cursorIdentity.identity,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(RESOLVER_CODES.MODEL_INCOMPATIBLE);
  });

  it("rejects pathKey scoped to a different engine", () => {
    const result = resolveModelForEngine({
      engineId: "antigravity",
      pathKey: "cursor:composer-2.5",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(RESOLVER_CODES.MODEL_INCOMPATIBLE);
  });

  it("resolves providerModelId for the selected engine only", () => {
    const result = resolveModelForEngine({
      engineId: "cursor",
      providerModelId: "composer-2.5",
      provider: "cursor",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.engineId).toBe("cursor");
    expect(result.identity.pathKey).toBe("cursor:composer-2.5");
    expect(result.identity.availability).toBe(AVAILABILITY.UNKNOWN);
  });
});

describe("P6.0 falsification — no engine selection in model-plane", () => {
  it("resolver module does not import or invoke Engine Fabric selection", () => {
    const resolverSrc = readFileSync(join(MODEL_PLANE, "resolver.mjs"), "utf8");
    const identitySrc = readFileSync(join(MODEL_PLANE, "identity.mjs"), "utf8");
    expect(resolverSrc).not.toMatch(/selectEngineForTurn/);
    expect(resolverSrc).not.toMatch(/engine-contract/);
    expect(identitySrc).not.toMatch(/selectEngineForTurn/);
    expect(identitySrc).not.toMatch(/engine-contract/);
  });

  it("Engine Fabric contract file is unchanged from P6.0 scope", () => {
    const fabricSrc = readFileSync(AG10_CONTRACT, "utf8");
    expect(fabricSrc).toContain("export function selectEngineForTurn");
    expect(fabricSrc).not.toMatch(/model-plane/);
  });
});
