/** P6.7 PATH Code command and doctor wiring; no live provider calls. */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveEngineeringModelCommand } from "../../scripts/pathcode-cli/model-plane/command-override.mjs";
import { readProjectModelPreferences, resolveProjectModelPreferencesPath, writeProjectModelPreference } from "../../scripts/pathcode-cli/model-plane/preference-config.mjs";
import { resolveProductionEngineModel } from "../../scripts/pathcode-cli/model-plane/production-context.mjs";
import { readModelExecutionFromTurn } from "../../scripts/pathcode-cli/model-plane/execution-provenance.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const { parseArgs, runPathcodeMain } = await import(new URL("../../scripts/pathcode.mjs", import.meta.url).href);
const { runPathcodeDoctor } = await import(new URL("../../scripts/pathcode-cli/ag5/doctor.mjs", import.meta.url).href);
const { readPreferences, writeEngineeringUserDefault, writePreferences } = await import(new URL("../../scripts/pathcode-cli/preferences.mjs", import.meta.url).href);
const { createG10Fabric } = await import(new URL("../../scripts/pathcode-cli/ag10/index.mjs", import.meta.url).href);

const dirs: string[] = [];
function temp(label: string) { const dir = mkdtempSync(join(tmpdir(), `path-p67-${label}-`)); dirs.push(dir); return dir; }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("P6.7 engineering model commands", () => {
  it("parses one engineering flag without changing General Session --model or adding per-engine flags", () => {
    const parsed = parseArgs(["--model", "gpt-general", "--engineering-model", "auto"]);
    expect(parsed.ok && parsed.value).toMatchObject({ model: "gpt-general", engineeringModel: "auto" });
    expect(parseArgs(["--engineering-model", "bad value"]).ok).toBe(false);
    for (const flag of ["--cursor-model", "--copilot-model", "--antigravity-model"]) {
      const result = parseArgs([flag, "something"]);
      expect(result.ok && result.value.rest).toContain(flag);
    }
  });

  it("refuses an engineering override in a General Session cloud run", async () => {
    let error = "";
    const code = await runPathcodeMain(["--execution", "cloud", "--engineering-model", "auto"], {
      stdout: { write() {} },
      stderr: { write(value: string) { error += value; } },
    });
    expect(code).toBe(2);
    expect(error).toContain("General Session --model");
  });

  it("uses existing explicit, Auto, and incompatible resolution for the selected engine only", () => {
    const projectRoot = temp("project");
    const env = { PATHCODE_STATE_DIR: temp("state"), PATHCODE_CURSOR_MODEL: "legacy-id" };
    writeEngineeringUserDefault({ engineId: "cursor", modelId: "user-id", env });
    writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "project-id" });
    const checkpoint = { modelPreferences: { cursor: "task-id" } };
    const context = { projectRoot, checkpoint, env, preferencesEnv: env };
    const concrete = resolveEngineeringModelCommand({ engineId: "cursor", modelId: "composer-2.5", ...context });
    expect(concrete).toMatchObject({ ok: true, engineId: "cursor", providerModelId: "composer-2.5", selectionSource: "explicit_turn" });
    const auto = resolveEngineeringModelCommand({ engineId: "cursor", modelId: "auto", ...context });
    expect(auto).toMatchObject({ ok: true, providerModelId: "composer-2.5", selectionSource: "auto", autoPolicyVersion: "path.model.auto.v1" });
    const incompatible = resolveEngineeringModelCommand({ engineId: "cursor", modelId: "gemini-2.5-flash", ...context });
    expect(incompatible).toMatchObject({ ok: false, code: "MODEL_INCOMPATIBLE" });
    expect(resolveEngineeringModelCommand({ engineId: "antigravity", modelId: "composer-2.5", ...context })).toMatchObject({ ok: false, code: "MODEL_INCOMPATIBLE" });
    expect(resolveEngineeringModelCommand({ engineId: "copilot", modelId: "auto", ...context })).toMatchObject({ ok: true, engineId: "copilot", providerModelId: null, selectionSource: "auto" });
    expect(resolveProductionEngineModel({ engineId: "cursor", ...context })).toMatchObject({ ok: true, providerModelId: "task-id", selectionSource: "task_pin" });
    expect(resolveProductionEngineModel({ engineId: "antigravity", env: { AG1_MODEL: "legacy-ag" } })).toMatchObject({ ok: true, providerModelId: "legacy-ag", selectionSource: "legacy_env" });
    expect(readProjectModelPreferences(projectRoot).ok).toBe(true);
  });

  it("keeps historical execution provenance independent of later command and preference settings", () => {
    const turn = { engine: "cursor", executionSchema: "path.model.execution.v1", requestedModel: "composer-2.5", actualModel: null, actualModelKnown: false, selectionSource: "explicit_turn" };
    const before = readModelExecutionFromTurn(turn);
    const projectRoot = temp("history");
    writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "auto" });
    resolveEngineeringModelCommand({ engineId: "cursor", modelId: "auto", projectRoot });
    expect(readModelExecutionFromTurn(turn)).toEqual(before);
    expect(before.actualModel).toBeNull();
    expect(before.actualModelKnown).toBe(false);
  });

  it("refuses an incompatible G10 turn before attaching or rerouting an engine", async () => {
    const runtimeRoot = temp("runtime");
    const projectRoot = temp("worktree");
    const fabric = await createG10Fabric({ runtimeRoot, taskId: "p67-task", worktreePath: projectRoot, repoRoot: projectRoot, objective: "test", engineeringModelId: "gemini-2.5-flash" });
    const result = await fabric.runCursorCollabTurn({ prompt: "test" });
    expect(result).toMatchObject({ ok: false, code: "MODEL_INCOMPATIBLE" });
    expect(fabric.getCursor()).toBeNull();
    expect(fabric.getCheckpoint().engineTurns).toEqual([]);
  });

  it("doctor reports configuration sources without writing or inventing execution", () => {
    const projectRoot = temp("project");
    writeFileSync(join(projectRoot, "package.json"), "{}\n");
    const env = { PATHCODE_STATE_DIR: temp("state"), PATHCODE_OPENAI_MODEL: "gpt-env", AG1_MODEL: "gemini-2.5-flash" };
    writePreferences({ modelId: "gpt-pref", env });
    writeEngineeringUserDefault({ engineId: "cursor", modelId: "composer-2.5", env });
    writeProjectModelPreference({ projectRoot, engineId: "antigravity", modelId: "auto" });
    const pref = readPreferences({ env });
    const prefBytes = readFileSync(pref.path!, "utf8");
    const projectPath = resolveProjectModelPreferencesPath(projectRoot);
    const projectBytes = readFileSync(projectPath, "utf8");
    const report = runPathcodeDoctor({ cwd: projectRoot, env, packageRoot: resolvePathPackageRoot(), engineeringModelId: "auto", checkpoint: { modelPreferences: { cursor: "task-pin" } } });
    expect(report.rows.find((row: { name: string }) => row.name === "Explicit model")?.detail).toBe("auto");
    expect(report.text).toContain("gpt-pref");
    expect(report.text).toContain("gpt-env");
    expect(report.text).toContain("cursor=task-pin");
    expect(report.text).toContain("antigravity=auto");
    expect(report.text).toContain("deprecated in favor of durable model preferences");
    expect(report.text).toContain("no execution model inferred");
    expect(report.text).not.toMatch(/actual model\s*=/i);
    expect(readFileSync(pref.path!, "utf8")).toBe(prefBytes);
    expect(readFileSync(projectPath, "utf8")).toBe(projectBytes);
    const missing = temp("missing");
    writeFileSync(join(missing, "package.json"), "{}\n");
    runPathcodeDoctor({ cwd: missing, env, packageRoot: resolvePathPackageRoot() });
    expect(existsSync(resolveProjectModelPreferencesPath(missing))).toBe(false);
  });
});
