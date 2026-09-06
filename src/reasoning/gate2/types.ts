/**
 * Gate 2 type-only surfaces — package-internal.
 */

import type { EngineeringRunRecord } from "../../engineering-run/types.js";
import type { ValidationCheckKind } from "../../validation/types.js";
import type { ReferenceCatalog } from "../catalog.js";
import type {
  EngineeringRunCitation,
  NonEmptyReadonlyArray,
  ReferenceBoundReasoning,
} from "../types.js";
import type { PreparedValidationPlan } from "../../validation/types.js";

export type ClaimCheckAssignmentInput = {
  readonly claimId: string;
  readonly selectedCheckIds: readonly string[];
};

export type PrepareExecutionEvidencePlanInput = {
  readonly reasoning: ReferenceBoundReasoning;
  readonly catalog: ReferenceCatalog;
  readonly validationPlan: PreparedValidationPlan;
  readonly assignments: readonly ClaimCheckAssignmentInput[];
};

export type FrozenClaimCheckAssignment = {
  readonly claimId: string;
  readonly claimKind: "DEFINES" | "BEHAVES";
  readonly requiredCheckKinds: NonEmptyReadonlyArray<ValidationCheckKind>;
  readonly selectedCheckIds: NonEmptyReadonlyArray<string>;
  readonly selectedCheckKinds: NonEmptyReadonlyArray<ValidationCheckKind>;
};

declare const executionEvidencePlanBrand: unique symbol;

export type ExecutionEvidencePlan = {
  readonly [executionEvidencePlanBrand]: true;
  readonly planCorrelationId: string;
  readonly reasoningCorrelationId: string;
  readonly validationPlanId: string;
  readonly assignmentCount: number;
  readonly executionObligationCount: number;
};

export type ExecutionEvidenceDecision =
  | "EXECUTION_EVIDENCE_ACCEPTED"
  | "EXECUTION_EVIDENCE_NOT_ESTABLISHED";

export type ClaimEvidenceStatus = {
  readonly claimId: string;
  readonly claimKind: "DEFINES" | "BEHAVES";
  readonly selectedCheckIds: readonly string[];
  readonly evidenceEstablished: boolean;
};

declare const executionEvidenceAssessmentBrand: unique symbol;

/**
 * Safe public assessment view — no raw run/plan/source graphs.
 */
export type ExecutionEvidenceAssessment = {
  readonly [executionEvidenceAssessmentBrand]: true;
  readonly assessmentCorrelationId: string;
  readonly evidencePlanCorrelationId: string;
  readonly engineeringRunId: string;
  readonly validationPlanId: string;
  readonly decision: ExecutionEvidenceDecision;
  readonly criterionId: string;
  readonly scopeId: string;
  readonly claimStatuses: readonly ClaimEvidenceStatus[];
  readonly assessedAtMs: number;
  readonly currentnessApplicable: boolean;
  readonly currentnessReasonCode: string | null;
  readonly outstandingNonExecutionClaimIds: readonly string[];
  readonly limitations: readonly string[];
};

export type ExecutionEvidenceApplicabilityObservation = {
  readonly observedAtMs: number;
  readonly applicable: boolean;
  readonly code: string | null;
  readonly message: string | null;
  readonly assessmentCorrelationId: string;
};

/** Private citation retention shape — authentic run object identity. */
export type RetainedExecutionCitation = EngineeringRunCitation;

export type { EngineeringRunRecord, ReferenceBoundReasoning, ReferenceCatalog };
