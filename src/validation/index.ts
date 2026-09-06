/**
 * Phase 4B Validation — internal Path Code surface.
 * Not exported from the package root.
 */

export {
  DEFAULT_VALIDATION_CAPTURE_BYTES,
  MAX_VALIDATION_CHECKS,
  MAX_VALIDATION_PLAN_CAPTURE_BYTES,
  MAX_VALIDATION_PLAN_TIMEOUT_SUM_MS,
  VALIDATION_CRITERION_ID,
  VALIDATION_SCOPE_ID,
} from "./bounds.js";

export { classifyLocalProcessForValidation } from "./classifier.js";
export { prepareValidationPlan } from "./preparation.js";
export { authorizeValidationPlan } from "./authorization.js";
export { executeValidationPlan } from "./execute.js";
export { checkValidationResultApplicability } from "./applicability.js";
export { resolveRegisteredValidationBinding } from "./binding.js";
export {
  actionClassForCheckKind,
  isCheckKindDisabled,
  isValidationExecutionDisabled,
} from "./policy.js";

export type {
  RegisteredValidationBinding,
  ValidationBindingFailure,
  ValidationBindingFailureCode,
} from "./binding.js";
export type {
  PreparedValidationCheck,
  PreparedValidationPlan,
  ValidationApprovalMap,
  ValidationApplicabilityFailure,
  ValidationApplicabilityFailureCode,
  ValidationApplicabilitySuccess,
  ValidationAuthorization,
  ValidationAuthorizationFailure,
  ValidationAuthorizationFailureCode,
  ValidationCheckKind,
  ValidationCheckResult,
  ValidationCheckSpec,
  ValidationCheckVerdict,
  ValidationCriterionId,
  ValidationExecutionFailure,
  ValidationExecutionFailureCode,
  ValidationPlanResult,
  ValidationPreparationFailure,
  ValidationPreparationFailureCode,
  ValidationScopeId,
  ValidationSubjectInput,
} from "./types.js";
