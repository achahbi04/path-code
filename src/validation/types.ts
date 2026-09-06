/**
 * Phase 4B Validation types — package-internal.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { ValidationOutcome } from "../domain/evidence.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type {
  ExplicitLocalProcessApproval,
  LocalProcessAuthorization,
  LocalProcessRequest,
  LocalProcessResult,
  PreparedLocalProcess,
} from "../execution/types.js";
import type { ContentObservation } from "../reader/types.js";
import type { RepositoryEntry } from "../inventory/types.js";
import type { RepositorySnapshot } from "../snapshot/types.js";

export type ValidationCheckKind =
  | "TYPECHECK"
  | "LINT"
  | "BUILD"
  | "TARGETED_TEST";

export type ValidationCriterionId =
  "EXIT_CODE_ZERO_WITH_COMPLETE_EXECUTION_EVIDENCE";

export type ValidationScopeId = "DECLARED_OBSERVED_INPUTS";

export type ValidationCheckSpec = {
  readonly id: string;
  readonly kind: ValidationCheckKind;
  readonly request: LocalProcessRequest;
};

export type ValidationSubjectInput = {
  readonly snapshot: RepositorySnapshot;
  readonly declaredObservations: readonly ContentObservation[];
};

export type PreparedValidationCheck = {
  readonly id: string;
  readonly kind: ValidationCheckKind;
  readonly preparedProcess: PreparedLocalProcess;
};

declare const preparedValidationPlanBrand: unique symbol;

export type PreparedValidationPlan = {
  readonly [preparedValidationPlanBrand]: true;
  readonly planId: string;
  readonly checks: readonly PreparedValidationCheck[];
  readonly workspace: WorkspaceBoundary;
  readonly workspaceRoot: string;
  readonly config: ResolvedProjectConfig;
  readonly snapshot: RepositorySnapshot;
  readonly declaredEntries: readonly RepositoryEntry[];
  readonly declaredObservations: readonly ContentObservation[];
  readonly criterionId: ValidationCriterionId;
  readonly scopeId: ValidationScopeId;
  readonly preparedAtMs: number;
};

declare const validationAuthorizationBrand: unique symbol;

export type ValidationAuthorization = {
  readonly [validationAuthorizationBrand]: true;
  readonly authorizationId: string;
  readonly planRef: PreparedValidationPlan;
  readonly processAuthorizations: ReadonlyMap<string, LocalProcessAuthorization>;
  readonly issuedAtMs: number;
};

export type ValidationCheckVerdict =
  | "PASS"
  | "FAIL"
  | "EXECUTION_INCONCLUSIVE"
  | "REFUSED"
  | "NOT_ATTEMPTED";

export type ValidationCheckResult = {
  readonly checkId: string;
  readonly kind: ValidationCheckKind;
  readonly verdict: ValidationCheckVerdict;
  readonly processResult: LocalProcessResult | null;
  readonly refusalCode: string | null;
  readonly refusalMessage: string | null;
  readonly subjectVerifiedBefore: boolean;
  readonly subjectVerifiedAfter: boolean | null;
};

declare const validationPlanResultBrand: unique symbol;

export type ValidationPlanResult = {
  readonly [validationPlanResultBrand]: true;
  readonly resultId: string;
  readonly planId: string;
  readonly criterionId: ValidationCriterionId;
  readonly scopeId: ValidationScopeId;
  readonly workspaceRoot: string;
  readonly snapshotGeneration: RepositorySnapshot["generation"];
  readonly checkResults: readonly ValidationCheckResult[];
  readonly aggregateOutcome: ValidationOutcome;
  readonly planCriterionSatisfied: boolean;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly wallDurationMs: number;
  readonly accumulatedProcessDurationMs: number;
  readonly applicabilityValid: boolean;
};

export type ValidationPreparationFailureCode =
  | "EMPTY_PLAN"
  | "TOO_MANY_CHECKS"
  | "DUPLICATE_CHECK_ID"
  | "INVALID_CHECK_ID"
  | "INVALID_KIND"
  | "EMPTY_SUBJECT"
  | "SUBJECT_INCOMPATIBLE"
  | "OBSERVATION_NOT_IN_SNAPSHOT"
  | "LIMITS_INVALID"
  | "TIMEOUT_SUM_EXCEEDED"
  | "CAPTURE_AGGREGATE_EXCEEDED"
  | "PROCESS_PREPARE_FAILED"
  | "ACTION_DISABLED"
  | "WORKSPACE_INVALID";

export type ValidationPreparationFailure = {
  readonly code: ValidationPreparationFailureCode;
  readonly message: string;
};

export type ValidationAuthorizationFailureCode =
  | "APPROVAL_REQUIRED"
  | "APPROVAL_INCOMPLETE"
  | "ACTION_DISABLED"
  | "PROCESS_AUTHORIZE_FAILED"
  | "PLAN_IDENTITY_MISMATCH"
  | "AUTHORIZATION_ALREADY_CONSUMED"
  | "AUTHORIZATION_NOT_REGISTERED"
  | "CONFIG_UNREADABLE"
  | "POLICY_CHANGED";

export type ValidationAuthorizationFailure = {
  readonly code: ValidationAuthorizationFailureCode;
  readonly message: string;
};

export type ValidationExecutionFailureCode =
  | ValidationAuthorizationFailureCode
  | "SUBJECT_STALE"
  | "SUBJECT_UNVERIFIABLE"
  | "CONFIG_UNREADABLE"
  | "POLICY_CHANGED"
  | "PROCESS_EXECUTE_FAILED";

export type ValidationExecutionFailure = {
  readonly code: ValidationExecutionFailureCode;
  readonly message: string;
  readonly authorizationConsumed?: boolean;
};

export type ValidationApplicabilityFailureCode =
  | "RESULT_NOT_REGISTERED"
  | "PLAN_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "SUBJECT_MISMATCH"
  | "SUBJECT_STALE"
  | "SUBJECT_UNVERIFIABLE"
  | "CONFIG_CHANGED"
  | "RESULT_NOT_APPLICABLE";

export type ValidationApplicabilityFailure = {
  readonly code: ValidationApplicabilityFailureCode;
  readonly message: string;
};

export type ValidationApplicabilitySuccess = {
  readonly applicable: true;
  readonly result: ValidationPlanResult;
};

/** Caller-supplied approvals keyed by check id — never minted by Validation. */
export type ValidationApprovalMap = ReadonlyMap<
  string,
  ExplicitLocalProcessApproval
>;
