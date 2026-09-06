/**
 * Phase 4D Engineering Run types — package-internal composition surface.
 */

import type { ValidationOutcome } from "../domain/evidence.js";
import type {
  RunEvidenceApplicabilityObservation,
  RunEvidenceCounts,
  RunEvidenceRecord,
} from "../run-evidence/types.js";
import type { RepositorySnapshot } from "../snapshot/types.js";
import type {
  PreparedValidationPlan,
  ValidationCriterionId,
  ValidationPlanResult,
  ValidationScopeId,
} from "../validation/types.js";

export const ENGINEERING_RUN_SCHEMA_VERSION = 1 as const;

export type EngineeringRunSchemaVersion = typeof ENGINEERING_RUN_SCHEMA_VERSION;

declare const engineeringRunBrand: unique symbol;

/**
 * Historical composition record. References authentic Validation + Run Evidence
 * objects; does not duplicate stdout/stderr/env/argv trees.
 */
export type EngineeringRunRecord = {
  readonly [engineeringRunBrand]: true;
  readonly schemaVersion: EngineeringRunSchemaVersion;
  readonly engineeringRunId: string;
  readonly planId: string;
  readonly validationResultId: string;
  readonly runEvidenceId: string;
  readonly criterionId: ValidationCriterionId;
  readonly scopeId: ValidationScopeId;
  readonly workspaceRoot: string;
  readonly snapshotGeneration: RepositorySnapshot["generation"];
  readonly declaredObservationPaths: readonly string[];
  readonly aggregateOutcome: ValidationOutcome;
  readonly planCriterionSatisfied: boolean;
  readonly counts: RunEvidenceCounts;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly wallDurationMs: number;
  readonly accumulatedProcessDurationMs: number;
  readonly composedAtMs: number;
  readonly limitations: readonly string[];
  /** Authentic Validation result — object identity, not a clone. */
  readonly validationResult: ValidationPlanResult;
  /** Authentic Run Evidence — object identity, not a clone. */
  readonly runEvidence: RunEvidenceRecord;
};

export type EngineeringRunSummary = {
  readonly historicalInformationalOnly: true;
  readonly notAuthority: true;
  readonly schemaVersion: EngineeringRunSchemaVersion;
  readonly engineeringRunId: string;
  readonly planId: string;
  readonly validationResultId: string;
  readonly runEvidenceId: string;
  readonly criterionId: ValidationCriterionId;
  readonly scopeId: ValidationScopeId;
  readonly snapshotGeneration: RepositorySnapshot["generation"];
  readonly declaredObservationPaths: readonly string[];
  readonly checkCount: number;
  readonly counts: RunEvidenceCounts;
  readonly aggregateOutcome: ValidationOutcome;
  readonly planCriterionSatisfied: boolean;
  readonly wallDurationMs: number;
  readonly accumulatedProcessDurationMs: number;
  readonly limitations: readonly string[];
};

export type EngineeringRunApplicabilityObservation =
  RunEvidenceApplicabilityObservation;

export type EngineeringRunFailureCode =
  | "VALIDATION_EXECUTION_FAILED"
  | "RUN_EVIDENCE_BUILD_FAILED"
  | "PLAN_IDENTITY_MISMATCH"
  | "INTERNAL_INVARIANT";

export type EngineeringRunFailure = {
  readonly code: EngineeringRunFailureCode;
  readonly message: string;
  readonly causeCode?: string;
};

export type EngineeringRunApplicabilityFailureCode =
  | "RUN_NOT_REGISTERED"
  | "PLAN_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "EVIDENCE_ASSOCIATION_FAILED";

export type EngineeringRunApplicabilityFailure = {
  readonly code: EngineeringRunApplicabilityFailureCode;
  readonly message: string;
  readonly causeCode?: string;
};

/** Internal association — not summary-exported. */
export type EngineeringRunAssociation = {
  readonly run: EngineeringRunRecord;
  readonly plan: PreparedValidationPlan;
  readonly validationResult: ValidationPlanResult;
  readonly runEvidence: RunEvidenceRecord;
};
