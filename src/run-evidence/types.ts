/**
 * Phase 4C Run Evidence types — package-internal.
 */

import type { ValidationOutcome } from "../domain/evidence.js";
import type { LocalProcessResult } from "../execution/types.js";
import type {
  PreparedValidationPlan,
  ValidationCheckKind,
  ValidationCheckVerdict,
  ValidationCriterionId,
  ValidationPlanResult,
  ValidationScopeId,
} from "../validation/types.js";
import type { RepositorySnapshot } from "../snapshot/types.js";

export const RUN_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type RunEvidenceSchemaVersion = typeof RUN_EVIDENCE_SCHEMA_VERSION;

export type RunEvidenceProcessSummary = {
  readonly present: boolean;
  readonly resultId: string | null;
  readonly outcome: LocalProcessResult["outcome"] | null;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean | null;
  readonly overflow: boolean | null;
  readonly durationMs: number | null;
  readonly stdoutComplete: boolean | null;
  readonly stderrComplete: boolean | null;
  readonly stdoutCapturedBytes: number | null;
  readonly stderrCapturedBytes: number | null;
  readonly stdoutTruncated: boolean | null;
  readonly stderrTruncated: boolean | null;
  readonly terminationNotConfirmed: boolean | null;
  readonly descendantMayRemainAlive: boolean | null;
};

export type RunEvidenceCheckRow = {
  readonly checkId: string;
  readonly kind: ValidationCheckKind;
  readonly verdict: ValidationCheckVerdict;
  readonly refusalCode: string | null;
  readonly refusalMessage: string | null;
  readonly subjectVerifiedBefore: boolean;
  readonly subjectVerifiedAfter: boolean | null;
  readonly process: RunEvidenceProcessSummary;
};

export type RunEvidenceCounts = {
  readonly plannedChecks: number;
  readonly checksWithProcessResult: number;
  readonly pass: number;
  readonly fail: number;
  readonly executionInconclusive: number;
  readonly refused: number;
  readonly notAttempted: number;
};

declare const runEvidenceBrand: unique symbol;

export type RunEvidenceRecord = {
  readonly [runEvidenceBrand]: true;
  readonly evidenceId: string;
  readonly schemaVersion: RunEvidenceSchemaVersion;
  readonly planId: string;
  readonly validationResultId: string;
  readonly criterionId: ValidationCriterionId;
  readonly scopeId: ValidationScopeId;
  readonly workspaceRoot: string;
  readonly snapshotGeneration: RepositorySnapshot["generation"];
  readonly declaredObservationPaths: readonly string[];
  readonly checkRows: readonly RunEvidenceCheckRow[];
  readonly counts: RunEvidenceCounts;
  readonly aggregateOutcome: ValidationOutcome;
  readonly planCriterionSatisfied: boolean;
  readonly originalApplicabilityValid: boolean;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly wallDurationMs: number;
  readonly accumulatedProcessDurationMs: number;
  readonly limitations: readonly string[];
  readonly assembledAtMs: number;
};

export type RunEvidenceSummary = {
  readonly historicalInformationalOnly: true;
  readonly notAuthority: true;
  readonly schemaVersion: RunEvidenceSchemaVersion;
  readonly evidenceId: string;
  readonly planId: string;
  readonly validationResultId: string;
  readonly criterionId: ValidationCriterionId;
  readonly scopeId: ValidationScopeId;
  readonly snapshotGeneration: RepositorySnapshot["generation"];
  readonly declaredObservationPaths: readonly string[];
  readonly checkRows: readonly {
    readonly checkId: string;
    readonly kind: ValidationCheckKind;
    readonly verdict: ValidationCheckVerdict;
    readonly refusalCode: string | null;
    readonly subjectVerifiedBefore: boolean;
    readonly subjectVerifiedAfter: boolean | null;
    readonly process: RunEvidenceProcessSummary;
  }[];
  readonly counts: RunEvidenceCounts;
  readonly aggregateOutcome: ValidationOutcome;
  readonly planCriterionSatisfied: boolean;
  readonly originalApplicabilityValid: boolean;
  readonly wallDurationMs: number;
  readonly accumulatedProcessDurationMs: number;
  readonly limitations: readonly string[];
};

export type RunEvidenceApplicabilityObservation = {
  readonly observedAtMs: number;
  readonly applicable: boolean;
  readonly code: string | null;
  readonly message: string | null;
};

export type RunEvidenceBuildFailureCode =
  | "RESULT_NOT_REGISTERED"
  | "PLAN_MISMATCH"
  | "WORKSPACE_MISMATCH";

export type RunEvidenceBuildFailure = {
  readonly code: RunEvidenceBuildFailureCode;
  readonly message: string;
};

export type RunEvidenceApplicabilityFailureCode =
  | "EVIDENCE_NOT_REGISTERED"
  | "PLAN_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "VALIDATION_NOT_APPLICABLE";

export type RunEvidenceApplicabilityFailure = {
  readonly code: RunEvidenceApplicabilityFailureCode;
  readonly message: string;
};

/** Internal association retained for delegated applicability — not summary-exported. */
export type RunEvidenceAssociation = {
  readonly evidence: RunEvidenceRecord;
  readonly plan: PreparedValidationPlan;
  readonly result: ValidationPlanResult;
  readonly processResults: ReadonlyMap<string, LocalProcessResult | null>;
};
