/**
 * Private Gate 2 registration — authenticates plan/assessment by WeakMap identity.
 */

import type { EngineeringRunRecord } from "../../engineering-run/types.js";
import type { PreparedLocalProcess } from "../../execution/types.js";
import type {
  PreparedValidationPlan,
  ValidationCheckKind,
} from "../../validation/types.js";
import type { ContentObservation } from "../../reader/types.js";
import type { ReferenceCatalog } from "../catalog.js";
import type {
  ReferenceBoundClaim,
  ReferenceBoundReasoning,
} from "../types.js";
import type { ReferenceCatalogInternal } from "../internal/registry.js";
import type {
  ExecutionEvidenceAssessment,
  ExecutionEvidencePlan,
  FrozenClaimCheckAssignment,
  RetainedExecutionCitation,
} from "./types.js";

export type RetainedPreparedCheck = {
  readonly id: string;
  readonly kind: ValidationCheckKind;
  readonly preparedProcess: PreparedLocalProcess;
};

export type ExecutionEvidencePlanRegistration = {
  readonly plan: ExecutionEvidencePlan;
  readonly reasoning: ReferenceBoundReasoning;
  readonly catalogHandle: ReferenceCatalog;
  readonly catalog: ReferenceCatalogInternal;
  readonly validationPlan: PreparedValidationPlan;
  readonly assignments: readonly FrozenClaimCheckAssignment[];
  readonly orderedChecks: readonly RetainedPreparedCheck[];
  readonly executionClaims: readonly ReferenceBoundClaim[];
  readonly nonExecutionClaimIds: readonly string[];
  readonly declaredObservations: readonly ContentObservation[];
};

export type ExecutionEvidenceAssessmentRegistration = {
  readonly assessment: ExecutionEvidenceAssessment;
  readonly planRegistration: ExecutionEvidencePlanRegistration;
  readonly engineeringRun: EngineeringRunRecord;
  readonly citations: readonly RetainedExecutionCitation[];
  readonly originalPlanCriterionSatisfied: boolean;
  readonly originalCheckVerdicts: ReadonlyMap<string, string>;
};

const planRegistry = new WeakMap<
  ExecutionEvidencePlan,
  ExecutionEvidencePlanRegistration
>();
const assessmentRegistry = new WeakMap<
  ExecutionEvidenceAssessment,
  ExecutionEvidenceAssessmentRegistration
>();

let planCounter = 0;
let assessmentCounter = 0;

export function nextEvidencePlanCorrelationId(): string {
  planCounter += 1;
  return `execution-evidence-plan-${planCounter}`;
}

export function nextAssessmentCorrelationId(): string {
  assessmentCounter += 1;
  return `execution-evidence-assessment-${assessmentCounter}`;
}

export function registerExecutionEvidencePlan(
  plan: ExecutionEvidencePlan,
  registration: ExecutionEvidencePlanRegistration,
): void {
  planRegistry.set(plan, registration);
}

export function lookupExecutionEvidencePlan(
  plan: ExecutionEvidencePlan,
): ExecutionEvidencePlanRegistration | undefined {
  return planRegistry.get(plan);
}

export function registerExecutionEvidenceAssessment(
  assessment: ExecutionEvidenceAssessment,
  registration: ExecutionEvidenceAssessmentRegistration,
): void {
  assessmentRegistry.set(assessment, registration);
}

export function lookupExecutionEvidenceAssessment(
  assessment: ExecutionEvidenceAssessment,
): ExecutionEvidenceAssessmentRegistration | undefined {
  return assessmentRegistry.get(assessment);
}

/** Test-only. */
export function resetExecutionEvidenceRegistryForTests(): void {
  planCounter = 0;
  assessmentCounter = 0;
}
