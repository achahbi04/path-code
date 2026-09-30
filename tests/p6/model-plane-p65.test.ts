/** P6.5 — selected-engine Auto policy, without provider calls. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAutoModelPolicy, AUTO_POLICY_VERSION } from "../../scripts/pathcode-cli/model-plane/auto-policy.mjs";
import { resolveModelForEngine, SELECTION_SOURCE, RESOLVER_CODES } from "../../scripts/pathcode-cli/model-plane/resolver.mjs";
import { createModelIdentity, AVAILABILITY, CATALOG_SOURCE } from "../../scripts/pathcode-cli/model-plane/identity.mjs";
import { buildModelExecutionFromResolution } from "../../scripts/pathcode-cli/model-plane/execution-provenance.mjs";
import { resolveProductionEngineModel } from "../../scripts/pathcode-cli/model-plane/production-context.mjs";

const auto = (engineId: string, more = {}) => resolveModelForEngine({ engineId, env: {}, projectDefault: "auto", ...more });

describe("P6.5 selected-engine Auto v1", () => {
  it("requires a selected engine and contains no engine-routing or scoring authority", () => {
    const missingEngine = resolveModelForEngine({ projectDefault: "auto" });
    expect(!missingEngine.ok && missingEngine.code).toBe(RESOLVER_CODES.ENGINE_ID_REQUIRED);
    const missingAutoEngine = resolveAutoModelPolicy({ engineId: "", catalog: [] });
    expect(!missingAutoEngine.ok && missingAutoEngine.code).toBe("ENGINE_ID_REQUIRED");
    const policy = readFileSync(new URL("../../scripts/pathcode-cli/model-plane/auto-policy.mjs", import.meta.url), "utf8");
    expect(policy).not.toMatch(/selectEngineForTurn|resolvePreferredEngine|score|rank|benchmark/i);
  });

  it("uses only factual defaults for Cursor and Antigravity, preserving unknown availability", () => {
    for (const [engineId, modelId] of [["cursor", "composer-2.5"], ["antigravity", "gemini-2.5-flash"]] as const) {
      const resolved = auto(engineId);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) continue;
      expect(resolved.providerModelId).toBe(modelId);
      expect(resolved.identity?.pathKey).toBe(`${engineId}:${modelId}`);
      expect(resolved.identity?.catalogSource).toBe(CATALOG_SOURCE.STATIC);
      expect(resolved.identity?.availability).toBe(AVAILABILITY.UNKNOWN);
      expect(resolved.selectionSource).toBe(SELECTION_SOURCE.AUTO);
      expect(resolved.autoPolicyVersion).toBe(AUTO_POLICY_VERSION);
    }
  });

  it("leaves Copilot's unnamed provider default unnamed and actual model unknown", () => {
    const resolved = auto("copilot");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.providerModelId).toBeNull();
    expect(resolved.identity).toBeNull();
    expect(resolved.model).toBeNull();
    expect(resolved.selectionSource).toBe(SELECTION_SOURCE.AUTO);
    const execution = buildModelExecutionFromResolution({ resolution: resolved, engine: "copilot", actualModelKnown: false });
    expect(execution).toMatchObject({ requestedModel: null, pathKey: null, selectionSource: "auto", autoPolicyVersion: AUTO_POLICY_VERSION, actualModel: null, actualModelKnown: false });
  });

  it("keeps Antigravity requested model aligned with its child environment", async () => {
    const { resolveAg1BridgeConfiguration } = await import(new URL("../../scripts/pathcode-cli/ag1/cloud-env.mjs", import.meta.url).href);
    const configured = resolveAg1BridgeConfiguration({ env: {}, projectDefault: "auto", providerModelId: "auto" });
    expect(configured.ok).toBe(true);
    if (!configured.ok) return;
    expect(configured.resolution.providerModelId).toBe("gemini-2.5-flash");
    expect(configured.resolution.selectionSource).toBe(SELECTION_SOURCE.AUTO);
    expect(configured.env.AG1_MODEL).toBe(configured.resolution.providerModelId);
    const execution = buildModelExecutionFromResolution({ resolution: configured.resolution, engine: "antigravity" });
    expect(execution?.actualModel).toBeNull();
    expect(execution?.actualModelKnown).toBe(false);
    expect(execution?.autoPolicyVersion).toBe(AUTO_POLICY_VERSION);
  });

  it("preserves explicit, task, project, user, and legacy concrete precedence", () => {
    const common = { engineId: "cursor", env: { CURSOR_MODEL: "legacy-id" }, projectDefault: "project-id", userDefault: "user-id" };
    const explicit = resolveModelForEngine({ ...common, providerModelId: "explicit-id", taskPin: { engineId: "cursor", providerModelId: "pin-id" } });
    expect(explicit.ok && explicit.providerModelId).toBe("explicit-id");
    const explicitOverAuto = resolveModelForEngine({ ...common, providerModelId: "explicit-id", taskPin: { engineId: "cursor", providerModelId: "auto" } });
    expect(explicitOverAuto.ok && explicitOverAuto.providerModelId).toBe("explicit-id");
    const pin = resolveModelForEngine({ ...common, taskPin: { engineId: "cursor", providerModelId: "pin-id" } });
    expect(pin.ok && pin.providerModelId).toBe("pin-id");
    const pinOverAuto = resolveModelForEngine({ ...common, projectDefault: "auto", taskPin: { engineId: "cursor", providerModelId: "pin-id" } });
    expect(pinOverAuto.ok && pinOverAuto.providerModelId).toBe("pin-id");
    const project = resolveModelForEngine(common);
    expect(project.ok && project.providerModelId).toBe("project-id");
    const projectOverAuto = resolveModelForEngine({ ...common, userDefault: "auto" });
    expect(projectOverAuto.ok && projectOverAuto.providerModelId).toBe("project-id");
    const user = resolveModelForEngine({ engineId: "cursor", env: common.env, userDefault: "user-id" });
    expect(user.ok && user.providerModelId).toBe("user-id");
    const legacy = resolveModelForEngine({ engineId: "cursor", env: common.env });
    expect(legacy.ok && legacy.providerModelId).toBe("legacy-id");
    expect(legacy.ok && legacy.selectionSource).toBe(SELECTION_SOURCE.LEGACY_ENV);
    const implicitAuto = resolveModelForEngine({ engineId: "cursor", env: {} });
    expect(implicitAuto.ok && implicitAuto.selectionSource).toBe(SELECTION_SOURCE.AUTO);
  });

  it("runs Auto for task, project, user, and explicit auto values", () => {
    const cases: Array<{ providerModelId?: string; taskPin?: { engineId: "cursor"; providerModelId: string }; projectDefault?: string; userDefault?: string }> = [
      { providerModelId: "auto" },
      { taskPin: { engineId: "cursor", providerModelId: "auto" } },
      { projectDefault: "auto" },
      { userDefault: "auto" },
    ];
    for (const input of cases) {
      const resolved = resolveModelForEngine({ engineId: "cursor", env: { CURSOR_MODEL: "legacy-id" }, ...input });
      expect(resolved.ok).toBe(true);
      expect(resolved.ok && resolved.providerModelId).toBe("composer-2.5");
      expect(resolved.ok && resolved.selectionSource).toBe(SELECTION_SOURCE.AUTO);
    }
  });

  it("resolves anew for the actual fallback engine and never carries cross-engine defaults", () => {
    const checkpoint = { modelPreferences: { cursor: "auto", copilot: "auto", antigravity: "auto" } };
    const cursor = resolveProductionEngineModel({ engineId: "cursor", env: {}, checkpoint });
    const copilot = resolveProductionEngineModel({ engineId: "copilot", env: {}, checkpoint });
    const antigravity = resolveProductionEngineModel({ engineId: "antigravity", env: {}, checkpoint });
    expect(cursor.ok && cursor.providerModelId).toBe("composer-2.5");
    expect(copilot.ok && copilot.providerModelId).toBeNull();
    expect(antigravity.ok && antigravity.providerModelId).toBe("gemini-2.5-flash");
  });

  it("rejects unavailable or deprecated defaults and never fabricates a replacement", () => {
    for (const availability of [AVAILABILITY.UNAVAILABLE, AVAILABILITY.DEPRECATED]) {
      const built = createModelIdentity({ engineId: "cursor", provider: "cursor", providerModelId: "composer-2.5", availability });
      expect(built.ok).toBe(true);
      if (!built.ok) continue;
      const result = resolveAutoModelPolicy({ engineId: "cursor", catalog: [built.identity], adapterDefaultId: "composer-2.5" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("MODEL_RESOLUTION_FAILED");
    }
    expect(resolveAutoModelPolicy({ engineId: "cursor", catalog: [], adapterDefaultId: "composer-2.5" }).ok).toBe(false);
  });
});
