import type { ModelPlaneResolution } from "./resolver.d.mts";

export const MODEL_EXECUTION_SCHEMA: "path.model.execution.v1";

export type ModelExecutionV1 = {
  executionSchema: typeof MODEL_EXECUTION_SCHEMA;
  engine: string;
  engineMode: string | null;
  provider: string | null;
  requestedModel: string | null;
  actualModel: string | null;
  actualModelKnown: boolean;
  pathKey: string | null;
  selectionSource: string;
  fallbackOccurred: boolean;
  catalogSource: string | null;
  autoPolicyVersion: string | null;
};

export function buildModelExecutionFromResolution(input: {
  resolution: Extract<ModelPlaneResolution, { ok: true }>;
  engine: string;
  engineMode?: string | null;
  provider?: string | null;
  actualModel?: string | null;
  actualModelKnown?: boolean;
  fallbackOccurred?: boolean;
  autoPolicyVersion?: string | null;
}): ModelExecutionV1 | null;

export function sealEngineTurnExecutionFields(
  turn: unknown,
): Partial<ModelExecutionV1>;

export function readModelExecutionFromTurn(turn: unknown): {
  executionSchema: string | null;
  requestedModel: string | null;
  actualModel: string | null;
  actualModelKnown: boolean;
  pathKey: string | null;
  selectionSource: string | null;
  fallbackOccurred: boolean;
  catalogSource: string | null;
  autoPolicyVersion: string | null;
};

export function projectLegacyModelField(turn: unknown): string | null;
