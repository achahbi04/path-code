import type { BuildRecord } from "./index.mjs";

export interface CognitiveDirective {
  id: string;
  status: string;
  note: string;
  source: string;
}
export interface CognitiveResult {
  ok: boolean;
  structured: {
    criteria?: unknown[];
    requirements?: unknown[];
    claims?: unknown[];
    [key: string]: unknown;
  } | null;
  prose: Array<{ id: string; status: string; note: string }>;
  malformedStructured: boolean;
  errors: string[];
}
export function isBuildEvaluationResult(value: unknown): boolean;
export function isBuildChallengeResult(value: unknown): boolean;
export function parseBuildCognitiveResult(
  reportText: string,
  options?: {
    expectedBuildId?: string;
    expectedIntentRevision?: number;
    expectedAuthoritativeRevision?: string | null;
  },
): CognitiveResult;
export function cognitiveResultToDirectives(
  parsed: CognitiveResult,
): CognitiveDirective[];
export function structuredResultContractBlock(
  kind: "evaluate" | "challenge",
  record: BuildRecord,
): string;
