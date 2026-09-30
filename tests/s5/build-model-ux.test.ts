/** P6.6 Builder model controls and historical execution truth. */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectBuilderModelControl, writeBuilderModelPreference } from "../../scripts/pathcode-cli/build/surface/model-control.mjs";
import { projectEngineeringActivity } from "../../scripts/pathcode-cli/build/surface/engineering-activity.mjs";
import { readProjectModelPreferences, resolveProjectModelPreferencesPath, writeProjectModelPreference } from "../../scripts/pathcode-cli/model-plane/preference-config.mjs";
import { resolveModelForEngine, SELECTION_SOURCE } from "../../scripts/pathcode-cli/model-plane/resolver.mjs";
import { startPathBuildSurface } from "../../scripts/pathcode-cli/build/surface/server.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const temps: string[] = [];
const temp = (label: string) => { const dir = mkdtempSync(join(tmpdir(), `path-p66-${label}-`)); temps.push(dir); return dir; };
let surface: Awaited<ReturnType<typeof startPathBuildSurface>> | null = null;
afterEach(async () => {
  if (surface) { await surface.stop({ teardownOwned: true }); surface = null; }
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("P6.6 Builder model UX", () => {
  it("shows only Auto without a preferred engine and factual scoped catalog choices", () => {
    const projectRoot = temp("project");
    const env = { PATHCODE_STATE_DIR: temp("state") };
    const noScope = projectBuilderModelControl({ projectRoot, env });
    expect(noScope).toMatchObject({ value: "auto", editable: false, preferredEngine: null });
    expect(noScope.options.map((option) => option.value)).toEqual(["auto"]);
    expect(projectBuilderModelControl({ preferredEngine: "cursor", projectRoot, env }).options.map((option) => option.value)).toEqual(["auto", "composer-2.5"]);
    expect(projectBuilderModelControl({ preferredEngine: "antigravity", projectRoot, env }).options.map((option) => option.value)).toEqual(["auto", "gemini-2.5-flash"]);
    expect(projectBuilderModelControl({ preferredEngine: "copilot", projectRoot, env }).options.map((option) => option.value)).toEqual(["auto"]);
    expect(existsSync(resolveProjectModelPreferencesPath(projectRoot))).toBe(false);
    const html = readFileSync(join(resolvePathPackageRoot(), "scripts/pathcode-cli/build/surface/public/index.html"), "utf8");
    expect(html).toMatch(/id="landingModel"[^>]*><option value="auto">Auto<\/option>/);
    expect(html).not.toMatch(/composer-2\.5|gemini-2\.5-flash/);
  });

  it("writes only an explicit project default for the preferred engine", async () => {
    const { writeEngineeringUserDefault } = await import(new URL("../../scripts/pathcode-cli/preferences.mjs", import.meta.url).href);
    const projectRoot = temp("project");
    const env = { PATHCODE_STATE_DIR: temp("state") };
    writeEngineeringUserDefault({ env, engineId: "cursor", modelId: "composer-2.5" });
    writeProjectModelPreference({ projectRoot, engineId: "copilot", modelId: "copilot-custom" });
    writeProjectModelPreference({ projectRoot, engineId: "antigravity", modelId: "gemini-2.5-flash" });
    const before = readProjectModelPreferences(projectRoot);
    const read = projectBuilderModelControl({ preferredEngine: "cursor", projectRoot, env });
    expect(read.value).toBe("composer-2.5");
    expect(readProjectModelPreferences(projectRoot)).toEqual(before);
    expect(writeBuilderModelPreference({ preferredEngine: null, projectRoot, modelId: "composer-2.5", env }).ok).toBe(false);
    expect(writeBuilderModelPreference({ preferredEngine: "cursor", projectRoot, modelId: "gemini-2.5-flash", env }).ok).toBe(false);
    const saved = writeBuilderModelPreference({ preferredEngine: "cursor", projectRoot, modelId: "auto", env });
    expect(saved.ok).toBe(true);
    const after = readProjectModelPreferences(projectRoot);
    expect(after.ok && after.byEngine).toEqual({ cursor: "auto", copilot: "copilot-custom", antigravity: "gemini-2.5-flash" });
    const cursor = resolveModelForEngine({ engineId: "cursor", projectRoot, preferencesEnv: env, env: {} });
    const copilot = resolveModelForEngine({ engineId: "copilot", projectRoot, preferencesEnv: env, env: {} });
    expect(cursor.ok && cursor.selectionSource).toBe(SELECTION_SOURCE.AUTO);
    expect(copilot.ok && copilot.providerModelId).toBe("copilot-custom");
  });

  it("does not present a saved unlisted model as Auto or as a catalog option", () => {
    const projectRoot = temp("unlisted");
    const env = { PATHCODE_STATE_DIR: temp("state") };
    writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "cursor-custom" });
    const control = projectBuilderModelControl({ preferredEngine: "cursor", projectRoot, env });
    expect(control.value).toBeNull();
    expect(control.editable).toBe(true);
    expect(control.diagnostic).toMatch(/not in the current model list/);
    expect(control.options.map((option) => option.value)).toEqual(["auto", "composer-2.5"]);
    expect(writeBuilderModelPreference({ preferredEngine: "cursor", projectRoot, modelId: "composer-2.5", env }).ok).toBe(true);
    expect(projectBuilderModelControl({ preferredEngine: "cursor", projectRoot, env }).value).toBe("composer-2.5");
  });

  it("keeps actual engine and historical model display independent of current preferences", () => {
    const projectRoot = temp("project");
    const build = {
      projectBindings: [{ projectRoot }],
      children: [{ taskId: "t1", kind: "engineer", provider: "copilot", dispatchState: "consumed" }],
      adoptionHistory: [],
    };
    const checkpoint = {
      taskId: "t1",
      engineSelection: { preferred: "cursor", selected: "copilot" },
      engineTurns: [{ role: "primary", engine: "copilot", executionSchema: "path.model.execution.v1", requestedModel: null, actualModel: null, actualModelKnown: false, selectionSource: "provider_default" }],
    };
    const first = projectEngineeringActivity(build, { checkpoint, projectRoot });
    expect(first.currentTask.engine).toBe("copilot");
    expect(first.currentTask.model).toBe("Provider default");
    writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "composer-2.5" });
    writeProjectModelPreference({ projectRoot, engineId: "copilot", modelId: "copilot-future" });
    const later = projectEngineeringActivity(build, { checkpoint, projectRoot });
    expect(later.currentTask.engine).toBe("copilot");
    expect(later.currentTask.model).toBe("Provider default");
    const cursorCheckpoint = { ...checkpoint, engineTurns: [{ role: "primary", engine: "cursor", executionSchema: "path.model.execution.v1", requestedModel: "composer-2.5", actualModel: null, actualModelKnown: false, selectionSource: "auto" }] };
    expect(projectEngineeringActivity(build, { checkpoint: cursorCheckpoint, projectRoot }).currentTask.model).toBe("composer-2.5 (requested)");
    const attestedCheckpoint = { ...checkpoint, engineTurns: [{ role: "primary", engine: "copilot", executionSchema: "path.model.execution.v1", requestedModel: "requested-id", actualModel: "attested-id", actualModelKnown: true, selectionSource: "explicit_turn" }] };
    expect(projectEngineeringActivity(build, { checkpoint: attestedCheckpoint, projectRoot }).currentTask.model).toBe("attested-id");
    expect(projectEngineeringActivity(build, { checkpoint: { taskId: "t1", engineTurns: [] }, projectRoot }).currentTask.model).toBe("Unknown");
  });

  it("serves scoped choices and writes a preference only after an explicit creator mutation", async () => {
    const runtimeRoot = temp("runtime");
    const projectRoot = join(runtimeRoot, "product");
    surface = await startPathBuildSurface({ packageRoot: resolvePathPackageRoot(), runtimeRoot, preferredEngine: "cursor", fakeMode: true, autoLoop: false, openBrowser: false, port: 0 });
    const health = await fetch(new URL("/api/health", surface.url)).then((response) => response.json()) as any;
    expect(health.modelControl.options.map((option: { value: string }) => option.value)).toEqual(["auto", "composer-2.5"]);
    const start = await fetch(new URL("/api/builds", surface.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome: "Make a tiny CLI", targetDir: projectRoot }) });
    const started = await start.json() as any;
    expect(start.status).toBe(200);
    expect(existsSync(resolveProjectModelPreferencesPath(projectRoot))).toBe(false);
    const read = await fetch(new URL(`/api/builds/${started.buildId}`, surface.url)).then((response) => response.json()) as any;
    expect(read.modelControl.options.map((option: { value: string }) => option.value)).toEqual(["auto", "composer-2.5"]);
    expect(existsSync(resolveProjectModelPreferencesPath(projectRoot))).toBe(false);
    const saved = await fetch(new URL(`/api/builds/${started.buildId}/model-preference`, surface.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: "auto" }) });
    expect(saved.status).toBe(200);
    const project = readProjectModelPreferences(projectRoot);
    expect(project.ok && project.byEngine).toEqual({ cursor: "auto" });
    const secondRoot = join(runtimeRoot, "second-product");
    const unsupported = await fetch(new URL("/api/builds", surface.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome: "Make another CLI", targetDir: secondRoot, modelId: "gemini-2.5-flash" }) });
    expect(unsupported.status).toBe(400);
    expect(existsSync(resolveProjectModelPreferencesPath(secondRoot))).toBe(false);
    const selected = await fetch(new URL("/api/builds", surface.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome: "Make another CLI", targetDir: secondRoot, modelId: "composer-2.5" }) });
    expect(selected.status).toBe(200);
    const second = readProjectModelPreferences(secondRoot);
    expect(second.ok && second.byEngine).toEqual({ cursor: "composer-2.5" });
  }, 120_000);
});
