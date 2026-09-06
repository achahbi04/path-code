/**
 * Phase 5C Gate 2 — package-internal execution evidence surface.
 * Not exported from the package root or the Phase 5B five-function barrel.
 */

export { prepareExecutionEvidencePlan } from "./prepare.js";
export { evaluateExecutionEvidence } from "./evaluate.js";
export { checkExecutionEvidenceAssessmentApplicability } from "./applicability.js";

export type {
  ClaimCheckAssignmentInput,
  ClaimEvidenceStatus,
  ExecutionEvidenceApplicabilityObservation,
  ExecutionEvidenceAssessment,
  ExecutionEvidenceDecision,
  ExecutionEvidencePlan,
  FrozenClaimCheckAssignment,
  PrepareExecutionEvidencePlanInput,
} from "./types.js";

export type {
  ExecutionEvidenceFailure,
  ExecutionEvidenceFailureCode,
} from "./failures.js";
