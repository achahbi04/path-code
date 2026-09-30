/** P6.4 correction — production engine entry resolution without provider calls. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createCheckpointSkeleton, patchTaskCheckpoint, readTaskCheckpoint, writeTaskCheckpoint } from "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";
import { buildModelExecutionFromResolution } from "../../scripts/pathcode-cli/model-plane/execution-provenance.mjs";
import { RESOLVER_CODES, SELECTION_SOURCE } from "../../scripts/pathcode-cli/model-plane/resolver.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = (relative: string) => pathToFileURL(join(ROOT, relative)).href;
const temps: string[] = [];
function temp(label: string) { const path = mkdtempSync(join(tmpdir(), `path-p64-wire-${label}-`)); temps.push(path); return path; }
afterEach(() => { for (const path of temps.splice(0)) rmSync(path, { recursive: true, force: true }); });

async function entry(engineId: "cursor" | "copilot", input: { projectRoot: string; toolEnv: Record<string, string>; checkpoint?: object; model?: string }) {
  if (engineId === "cursor") {
    const { createCursorEngine } = await import(moduleUrl("scripts/pathcode-cli/ag10/cursor-sdk.mjs"));
    const handle = await createCursorEngine({ taskId: "p64", cwd: input.projectRoot, ...input, ...(input.model ? { model: { id: input.model } } : {}) });
    return handle.getModelResolution();
  }
  const { createCopilotEngine } = await import(moduleUrl("scripts/pathcode-cli/ag10/copilot-sdk.mjs"));
  const handle = await createCopilotEngine({ taskId: "p64", cwd: input.projectRoot, ...input });
  return handle.getModelResolution();
}

describe("P6.4 production model context", () => {
  it("Cursor and Copilot entries consume project, user, task, and explicit tiers in order", async () => {
    const { writeEngineeringUserDefault } = await import(moduleUrl("scripts/pathcode-cli/preferences.mjs"));
    const { writeProjectModelPreference } = await import(moduleUrl("scripts/pathcode-cli/model-plane/preference-config.mjs"));
    const state = temp("state");
    const projectRoot = temp("project");
    const userRoot = temp("user-only");
    const toolEnv = { PATHCODE_STATE_DIR: state, CURSOR_MODEL: "cursor-legacy" };
    for (const engineId of ["cursor", "copilot"] as const) {
      const user = `${engineId}-user`;
      const project = `${engineId}-project`;
      const pinned = `${engineId}-pin`;
      const explicit = `${engineId}-explicit`;
      expect(writeEngineeringUserDefault({ env: toolEnv, engineId, modelId: user }).ok).toBe(true);
      const userResolution = await entry(engineId, { projectRoot: userRoot, toolEnv });
      expect(userResolution.ok && userResolution.providerModelId).toBe(user);
      expect(userResolution.ok && userResolution.selectionSource).toBe(SELECTION_SOURCE.USER_DEFAULT);
      expect(existsSync(join(userRoot, ".path"))).toBe(false);
      expect(writeProjectModelPreference({ projectRoot, engineId, modelId: project }).ok).toBe(true);
      const projectResolution = await entry(engineId, { projectRoot, toolEnv });
      expect(projectResolution.ok && projectResolution.providerModelId).toBe(project);
      expect(projectResolution.ok && projectResolution.selectionSource).toBe(SELECTION_SOURCE.PROJECT_DEFAULT);
      const checkpoint = createCheckpointSkeleton({ taskId: `${engineId}-task`, worktreePath: projectRoot, modelPreferences: { [engineId]: pinned } });
      const pinResolution = await entry(engineId, { projectRoot, toolEnv, checkpoint });
      expect(pinResolution.ok && pinResolution.providerModelId).toBe(pinned);
      expect(pinResolution.ok && pinResolution.selectionSource).toBe(SELECTION_SOURCE.TASK_PIN);
      const explicitResolution = await entry(engineId, { projectRoot, toolEnv, checkpoint, model: explicit });
      expect(explicitResolution.ok && explicitResolution.providerModelId).toBe(explicit);
      expect(explicitResolution.ok && explicitResolution.selectionSource).toBe(SELECTION_SOURCE.EXPLICIT_TURN);
    }
    const cursor = await entry("cursor", { projectRoot, toolEnv });
    const copilot = await entry("copilot", { projectRoot, toolEnv });
    expect(cursor.ok && cursor.providerModelId).toBe("cursor-project");
    expect(copilot.ok && copilot.providerModelId).toBe("copilot-project");
  });

  it("legacy and provider defaults stay below durable defaults; Auto remains pending", async () => {
    const { writeProjectModelPreference } = await import(moduleUrl("scripts/pathcode-cli/model-plane/preference-config.mjs"));
    const projectRoot = temp("project");
    const state = temp("state");
    const legacy = await entry("cursor", { projectRoot, toolEnv: { PATHCODE_STATE_DIR: state, CURSOR_MODEL: "cursor-legacy" } });
    expect(legacy.ok && legacy.providerModelId).toBe("cursor-legacy");
    expect(legacy.ok && legacy.selectionSource).toBe(SELECTION_SOURCE.LEGACY_ENV);
    const provider = await entry("copilot", { projectRoot, toolEnv: { PATHCODE_STATE_DIR: state } });
    expect(provider.ok && provider.providerModelId).toBeNull();
    expect(provider.ok && provider.selectionSource).toBe(SELECTION_SOURCE.PROVIDER_DEFAULT);
    expect(writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "auto" }).ok).toBe(true);
    const auto = await entry("cursor", { projectRoot, toolEnv: { PATHCODE_STATE_DIR: state, CURSOR_MODEL: "cursor-legacy" } });
    expect(auto.ok).toBe(false);
    if (!auto.ok) expect(auto.code).toBe(RESOLVER_CODES.AUTO_POLICY_PENDING);
  });

  it("Antigravity primary configuration consumes its canonical checkpoint pin", async () => {
    const { resolveAg1BridgeConfiguration } = await import(moduleUrl("scripts/pathcode-cli/ag1/cloud-env.mjs"));
    const { writeEngineeringUserDefault } = await import(moduleUrl("scripts/pathcode-cli/preferences.mjs"));
    const { writeProjectModelPreference } = await import(moduleUrl("scripts/pathcode-cli/model-plane/preference-config.mjs"));
    const projectRoot = temp("project");
    const runtime = temp("runtime");
    const state = temp("state");
    const env = { PATHCODE_STATE_DIR: state, GOOGLE_CLOUD_PROJECT: "test-project", AG1_MODEL: "ag-legacy" };
    writeEngineeringUserDefault({ env, engineId: "antigravity", modelId: "ag-user" });
    writeProjectModelPreference({ projectRoot, engineId: "antigravity", modelId: "ag-project" });
    writeTaskCheckpoint(runtime, createCheckpointSkeleton({ taskId: "ag-primary", worktreePath: projectRoot, modelPreferences: { antigravity: "ag-pin" } }));
    const checkpoint = readTaskCheckpoint(runtime, "ag-primary");
    const configured = resolveAg1BridgeConfiguration({ projectRoot, checkpoint, env });
    expect(configured.ok).toBe(true);
    if (!configured.ok) return;
    expect(configured.resolution.providerModelId).toBe("ag-pin");
    expect(configured.resolution.selectionSource).toBe(SELECTION_SOURCE.TASK_PIN);
    expect(configured.env.AG1_MODEL).toBe("ag-pin");
    const explicit = resolveAg1BridgeConfiguration({ projectRoot, checkpoint, env, providerModelId: "ag-explicit" });
    expect(explicit.ok && explicit.resolution.providerModelId).toBe("ag-explicit");
    expect(explicit.ok && explicit.env.AG1_MODEL).toBe("ag-explicit");
    const cursor = await entry("cursor", { projectRoot, toolEnv: env });
    const copilot = await entry("copilot", { projectRoot, toolEnv: env });
    expect(cursor.ok && cursor.providerModelId).not.toBe("ag-project");
    expect(copilot.ok && copilot.providerModelId).toBeNull();
  });

  it("task pins survive patching while prior execution provenance remains sealed", async () => {
    const { writeEngineeringUserDefault } = await import(moduleUrl("scripts/pathcode-cli/preferences.mjs"));
    const { writeProjectModelPreference } = await import(moduleUrl("scripts/pathcode-cli/model-plane/preference-config.mjs"));
    const runtime = temp("runtime");
    const projectRoot = temp("project");
    const toolEnv = { PATHCODE_STATE_DIR: temp("state") };
    const original = await entry("cursor", { projectRoot, toolEnv });
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const execution = buildModelExecutionFromResolution({ resolution: original, engine: "cursor", actualModelKnown: false });
    writeTaskCheckpoint(runtime, createCheckpointSkeleton({
      taskId: "history",
      worktreePath: projectRoot,
      engineTurns: [{ engine: "cursor", role: "primary", state: "finished", ...execution }],
    }));
    const before = readTaskCheckpoint(runtime, "history")?.engineTurns;
    expect(writeEngineeringUserDefault({ env: toolEnv, engineId: "cursor", modelId: "cursor-new-user" }).ok).toBe(true);
    expect(writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "cursor-new-project" }).ok).toBe(true);
    patchTaskCheckpoint(runtime, "history", { modelPreferences: { cursor: "cursor-future" } });
    const after = readTaskCheckpoint(runtime, "history");
    expect(after?.modelPreferences).toEqual({ cursor: "cursor-future" });
    expect(after?.engineTurns).toEqual(before);
    expect((after?.engineTurns as Array<Record<string, unknown>>)?.[0]?.actualModelKnown).toBe(false);
  });
});
