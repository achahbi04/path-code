/**
 * P6.2 — canonical model execution provenance on G10 engineTurns[].
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  createCheckpointSkeleton,
  patchTaskCheckpoint,
  readTaskCheckpoint,
  writeTaskCheckpoint,
} from "../../scripts/pathcode-cli/ag10/task-checkpoint.mjs";
import { extractProviderProvenance } from "../../scripts/pathcode-cli/build/reconcile.mjs";
import {
  MODEL_EXECUTION_SCHEMA,
  buildModelExecutionFromResolution,
} from "../../scripts/pathcode-cli/model-plane/execution-provenance.mjs";
import { CATALOG_SOURCE } from "../../scripts/pathcode-cli/model-plane/identity.mjs";
import {
  SELECTION_SOURCE,
  resolveCursorEngineModel,
} from "../../scripts/pathcode-cli/model-plane/resolver.mjs";

const AG10_CONTRACT = join(
  process.cwd(),
  "scripts/pathcode-cli/ag10/engine-contract.mjs",
);

function runtimeRoot() {
  return mkdtempSync(join(tmpdir(), "path-p62-"));
}

describe("P6.2 path.model.execution.v1 checkpoint persistence", () => {
  it("persists requested Cursor model without falsely persisting actual model", () => {
    const root = runtimeRoot();
    const plane = resolveCursorEngineModel({ toolEnv: {} });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    const modelExecution = buildModelExecutionFromResolution({
      resolution: plane,
      engine: "cursor",
      engineMode: "native_sdk",
      provider: null,
      actualModelKnown: false,
    });
    expect(modelExecution?.requestedModel).toBe("composer-2.5");
    expect(modelExecution?.actualModel).toBeNull();
    expect(modelExecution?.actualModelKnown).toBe(false);

    const cp = createCheckpointSkeleton({
      taskId: "p62-cursor",
      worktreePath: "/tmp/wt",
      engineTurns: [
        {
          engine: "cursor",
          role: "primary",
          mode: "native_sdk",
          state: "finished",
          ...modelExecution,
        },
      ],
    });
    writeTaskCheckpoint(root, cp);
    const loaded = readTaskCheckpoint(root, "p62-cursor");
    const turns = loaded?.engineTurns as Array<Record<string, unknown>> | undefined;
    const turn = turns?.[0];
    expect(turn?.executionSchema).toBe(MODEL_EXECUTION_SCHEMA);
    expect(turn?.requestedModel).toBe("composer-2.5");
    expect(turn?.actualModel).toBeNull();
    expect(turn?.actualModelKnown).toBe(false);
    expect(turn?.model).toBeNull();
  });

  it("perserves selectionSource, pathKey, catalogSource, fallbackOccurred on round-trip", () => {
    const root = runtimeRoot();
    const plane = resolveCursorEngineModel({
      toolEnv: { PATHCODE_CURSOR_MODEL: "composer-2.5" },
    });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    const modelExecution = buildModelExecutionFromResolution({
      resolution: plane,
      engine: "cursor",
      engineMode: "native_sdk",
      provider: null,
      actualModelKnown: false,
      fallbackOccurred: false,
    });
    expect(modelExecution?.selectionSource).toBe(SELECTION_SOURCE.LEGACY_ENV);
    expect(modelExecution?.pathKey).toBe("cursor:composer-2.5");
    expect(modelExecution?.catalogSource).toBe(CATALOG_SOURCE.LEGACY_ENV);

    patchTaskCheckpoint(root, "p62-roundtrip", {
      worktreePath: "/tmp/wt",
      engineTurns: [
        {
          engine: "cursor",
          role: "primary",
          mode: "native_sdk",
          state: "finished",
          ...modelExecution,
        },
      ],
    });
    const loaded = readTaskCheckpoint(root, "p62-roundtrip");
    const turns = loaded?.engineTurns as Array<Record<string, unknown>> | undefined;
    const turn = turns?.[0];
    expect(turn?.selectionSource).toBe(SELECTION_SOURCE.LEGACY_ENV);
    expect(turn?.pathKey).toBe("cursor:composer-2.5");
    expect(turn?.catalogSource).toBe(CATALOG_SOURCE.LEGACY_ENV);
    expect(turn?.fallbackOccurred).toBe(false);
  });

  it("allows attested actual model when adapter supplies evidence", () => {
    const plane = resolveCursorEngineModel({
      toolEnv: {},
      providerModelId: "composer-2.5",
    });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    const modelExecution = buildModelExecutionFromResolution({
      resolution: plane,
      engine: "cursor",
      engineMode: "native_sdk",
      provider: "cursor",
      actualModel: "composer-2.5",
      actualModelKnown: true,
    });
    expect(modelExecution?.actualModelKnown).toBe(true);
    expect(modelExecution?.actualModel).toBe("composer-2.5");
  });

  it("reads legacy checkpoints without P6 fields", () => {
    const provenance = extractProviderProvenance({
      engineTurns: [
        {
          engine: "antigravity",
          role: "primary",
          mode: "bridge",
          model: "gemini-2.5-flash",
        },
      ],
    });
    expect(provenance.requestedModel).toBe("gemini-2.5-flash");
    expect(provenance.actualModelKnown).toBe(false);
    expect(provenance.model).toBe("gemini-2.5-flash");
    expect(provenance.modelExecution?.executionSchema).toBeNull();
  });

  it("reconcile does not promote requested model to actual for P6 cursor turns", () => {
    const plane = resolveCursorEngineModel({ toolEnv: {} });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    const modelExecution = buildModelExecutionFromResolution({
      resolution: plane,
      engine: "cursor",
      engineMode: "native_sdk",
      provider: null,
      actualModelKnown: false,
    });
    const provenance = extractProviderProvenance({
      engineTurns: [
        {
          engine: "cursor",
          role: "primary",
          mode: "native_sdk",
          ...modelExecution,
        },
      ],
    });
    expect(provenance.requestedModel).toBe("composer-2.5");
    expect(provenance.actualModel).toBeNull();
    expect(provenance.actualModelKnown).toBe(false);
    expect(provenance.model).toBeNull();
  });

  it("Engine Fabric routing source unchanged", () => {
    const fabric = readFileSync(AG10_CONTRACT, "utf8");
    expect(fabric).toContain("export function selectEngineForTurn");
    expect(fabric).not.toMatch(/execution-provenance/);
  });
});
