/** P6.4 — durable model defaults without engine selection or Auto policy. */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveModelForEngine, SELECTION_SOURCE, RESOLVER_CODES } from "../../scripts/pathcode-cli/model-plane/resolver.mjs";
import { buildModelExecutionFromResolution } from "../../scripts/pathcode-cli/model-plane/execution-provenance.mjs";
import { createCheckpointSkeleton, readTaskCheckpoint, writeTaskCheckpoint } from "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PREFS = pathToFileURL(join(ROOT, "scripts/pathcode-cli/preferences.mjs")).href;
const PROJECT = pathToFileURL(join(ROOT, "scripts/pathcode-cli/model-plane/preference-config.mjs")).href;
const CLOUD = pathToFileURL(join(ROOT, "scripts/pathcode-cli/ag1/cloud-env.mjs")).href;
const temps: string[] = [];
function temp(label: string) { const path = mkdtempSync(join(tmpdir(), `path-p64-${label}-`)); temps.push(path); return path; }
afterEach(() => { for (const path of temps.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("P6.4 preferences and resolver hierarchy", () => {
  it("migrates v1 General Session model on explicit write without engineering bleed", async () => {
    const { readPreferences, writeEngineeringUserDefault, resolveEffectivePreferences } = await import(PREFS);
    const state = temp("state");
    const env = { PATHCODE_STATE_DIR: state, PATHCODE_OPENAI_MODEL: "env-general" };
    const path = join(state, "preferences.json");
    writeFileSync(path, JSON.stringify({ schema: "pathcode.prefs.v1", modelId: "X", autonomy: "bounded", unrelated: { retained: true } }));
    const before = readPreferences({ env });
    expect(before.generalSession.modelId).toBe("X");
    expect(before.engineering.byEngine).toEqual({});
    expect(resolveEffectivePreferences({ env }).modelId).toBe("X");
    expect(readFileSync(path, "utf8")).toContain("pathcode.prefs.v1");
    expect(writeEngineeringUserDefault({ env, engineId: "cursor", modelId: "cursor-user" }).ok).toBe(true);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    expect(raw.schema).toBe("pathcode.prefs.v2");
    expect(raw.modelId).toBeUndefined();
    expect(raw.generalSession.modelId).toBe("X");
    expect(raw.engineering.byEngine).toEqual({ cursor: "cursor-user" });
    expect(raw.unrelated).toEqual({ retained: true });
    expect(resolveEffectivePreferences({ env }).modelId).toBe("X");
  });

  it("uses only the selected engine's user default, below project and task tiers", async () => {
    const { writeEngineeringUserDefault } = await import(PREFS);
    const { writeProjectModelPreference } = await import(PROJECT);
    const state = temp("state");
    const projectRoot = temp("project");
    const preferencesEnv = { PATHCODE_STATE_DIR: state };
    expect(writeEngineeringUserDefault({ env: preferencesEnv, engineId: "copilot", modelId: "copilot-user" }).ok).toBe(true);
    const base = { engineId: "cursor", projectRoot, preferencesEnv, toolEnv: { CURSOR_MODEL: "cursor-env" } };
    const noCursorDefault = resolveModelForEngine(base);
    expect(noCursorDefault.ok && noCursorDefault.providerModelId).toBe("cursor-env");
    expect(writeEngineeringUserDefault({ env: preferencesEnv, engineId: "cursor", modelId: "cursor-user" }).ok).toBe(true);
    const user = resolveModelForEngine(base);
    expect(user.ok && user.providerModelId).toBe("cursor-user");
    expect(user.ok && user.selectionSource).toBe(SELECTION_SOURCE.USER_DEFAULT);
    const copilot = resolveModelForEngine({ ...base, engineId: "copilot" });
    expect(copilot.ok && copilot.providerModelId).toBe("copilot-user");
    const antigravity = resolveModelForEngine({ ...base, engineId: "antigravity", toolEnv: {} });
    expect(antigravity.ok && antigravity.selectionSource).toBe(SELECTION_SOURCE.AUTO);
    expect(writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "cursor-project" }).ok).toBe(true);
    const project = resolveModelForEngine(base);
    expect(project.ok && project.providerModelId).toBe("cursor-project");
    expect(project.ok && project.selectionSource).toBe(SELECTION_SOURCE.PROJECT_DEFAULT);
    const pinned = resolveModelForEngine({ ...base, taskPin: { engineId: "cursor", providerModelId: "cursor-task" } });
    expect(pinned.ok && pinned.providerModelId).toBe("cursor-task");
    expect(pinned.ok && pinned.selectionSource).toBe(SELECTION_SOURCE.TASK_PIN);
    const explicit = resolveModelForEngine({ ...base, taskPin: { engineId: "cursor", providerModelId: "cursor-task" }, providerModelId: "cursor-explicit" });
    expect(explicit.ok && explicit.providerModelId).toBe("cursor-explicit");
    expect(explicit.ok && explicit.selectionSource).toBe(SELECTION_SOURCE.EXPLICIT_TURN);
    const otherEngine = resolveModelForEngine({ ...base, engineId: "copilot" });
    expect(otherEngine.ok && otherEngine.providerModelId).toBe("copilot-user");
    const invalidPin = resolveModelForEngine({ ...base, taskPin: { engineId: "copilot", providerModelId: "wrong" } });
    expect(invalidPin.ok).toBe(false);
    if (!invalidPin.ok) expect(invalidPin.code).toBe(RESOLVER_CODES.MODEL_INCOMPATIBLE);
  });

  it("missing project file is read only; explicit write creates only model preferences", async () => {
    const { readProjectModelPreferences, writeProjectModelPreference } = await import(PROJECT);
    const projectRoot = temp("project");
    const before = readdirSync(projectRoot);
    const missing = readProjectModelPreferences(projectRoot);
    expect(missing.source).toBe("missing");
    expect(readdirSync(projectRoot)).toEqual(before);
    expect(existsSync(join(projectRoot, ".path"))).toBe(false);
    const written = writeProjectModelPreference({ projectRoot, engineId: "antigravity", modelId: "gemini-custom" });
    expect(written.ok).toBe(true);
    expect(readdirSync(join(projectRoot, ".path"))).toEqual(["model-preferences.json"]);
    const raw = JSON.parse(readFileSync(join(projectRoot, ".path", "model-preferences.json"), "utf8"));
    expect(raw.schema).toBe("path.model-preferences.v1");
    expect(raw.byEngine).toEqual({ antigravity: "gemini-custom" });
    expect(JSON.stringify(raw)).not.toMatch(/API_KEY|credential|secret/i);
    expect(writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "cursor-project" }).ok).toBe(true);
    expect(readProjectModelPreferences(projectRoot).byEngine).toEqual({ cursor: "cursor-project", antigravity: "gemini-custom" });
  });

  it("configures Antigravity bridge from the selected project default", async () => {
    const { writeProjectModelPreference } = await import(PROJECT);
    const { resolveAg1BridgeConfiguration } = await import(CLOUD);
    const projectRoot = temp("project");
    const preferencesEnv = { PATHCODE_STATE_DIR: temp("state") };
    expect(writeProjectModelPreference({ projectRoot, engineId: "antigravity", modelId: "ag-project" }).ok).toBe(true);
    const configured = resolveAg1BridgeConfiguration({
      projectRoot,
      preferencesEnv,
      env: { GOOGLE_CLOUD_PROJECT: "test-project", AG1_MODEL: "ag-legacy" },
    });
    expect(configured.ok).toBe(true);
    if (!configured.ok) return;
    expect(configured.resolution.providerModelId).toBe("ag-project");
    expect(configured.resolution.selectionSource).toBe(SELECTION_SOURCE.PROJECT_DEFAULT);
    expect(configured.env.AG1_MODEL).toBe("ag-project");
  });

  it("reports malformed project data, preserves bytes, and safely falls back", async () => {
    const { readProjectModelPreferences, writeProjectModelPreference } = await import(PROJECT);
    const projectRoot = temp("project");
    const state = temp("state");
    const dir = join(projectRoot, ".path");
    mkdirSync(dir);
    const path = join(dir, "model-preferences.json");
    const bad = [
      "{not-json",
      JSON.stringify({ schema: "wrong", byEngine: {}, updatedAt: new Date().toISOString() }),
      JSON.stringify({ schema: "path.model-preferences.v1", byEngine: { unknown: "x" }, updatedAt: new Date().toISOString() }),
      JSON.stringify({ schema: "path.model-preferences.v1", byEngine: { cursor: "bad model id" }, updatedAt: new Date().toISOString() }),
      JSON.stringify({ schema: "path.model-preferences.v1", byEngine: { cursor: "x" }, apiKey: "secret", updatedAt: new Date().toISOString() }),
    ];
    for (const bytes of bad) {
      writeFileSync(path, bytes);
      const read = readProjectModelPreferences(projectRoot);
      expect(read.ok).toBe(false);
      const resolution = resolveModelForEngine({ engineId: "cursor", projectRoot, preferencesEnv: { PATHCODE_STATE_DIR: state }, toolEnv: { CURSOR_MODEL: "cursor-env" } });
      expect(resolution.ok && resolution.providerModelId).toBe("cursor-env");
      expect(resolution.ok && resolution.diagnostics?.[0]?.code).toBe(read.code);
      expect(writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "good" }).ok).toBe(false);
      expect(readFileSync(path, "utf8")).toBe(bytes);
    }
  });

  it("preserves historical execution provenance and reserves Auto for P6.5", async () => {
    const { writeProjectModelPreference } = await import(PROJECT);
    const projectRoot = temp("project");
    const env = { PATHCODE_STATE_DIR: temp("state") };
    const before = resolveModelForEngine({ engineId: "cursor", projectRoot, preferencesEnv: env, toolEnv: {} });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const historic = buildModelExecutionFromResolution({ resolution: before, engine: "cursor", actualModelKnown: false });
    const runtimeRoot = temp("checkpoint");
    writeTaskCheckpoint(runtimeRoot, createCheckpointSkeleton({
      taskId: "historical-model",
      worktreePath: projectRoot,
      engineTurns: [{ engine: "cursor", role: "primary", state: "finished", ...historic }],
    }));
    expect(writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "cursor-new" }).ok).toBe(true);
    const current = resolveModelForEngine({ engineId: "cursor", projectRoot, preferencesEnv: env, toolEnv: {} });
    expect(current.ok && current.providerModelId).toBe("cursor-new");
    expect(historic?.requestedModel).toBe(before.providerModelId);
    expect(historic?.selectionSource).toBe(before.selectionSource);
    const persisted = (readTaskCheckpoint(runtimeRoot, "historical-model")?.engineTurns as Array<Record<string, unknown>> | undefined)?.[0];
    expect(persisted?.requestedModel).toBe(before.providerModelId);
    expect(persisted?.selectionSource).toBe(before.selectionSource);
    expect(writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "auto" }).ok).toBe(true);
    const auto = resolveModelForEngine({ engineId: "cursor", projectRoot, preferencesEnv: env, toolEnv: {} });
    expect(auto.ok && auto.selectionSource).toBe(SELECTION_SOURCE.AUTO);
  });
});
