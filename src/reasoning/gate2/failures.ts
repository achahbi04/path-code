/**
 * Gate 2 local failure vocabulary — does not amend global ledger/evidence kinds.
 */

export type ExecutionEvidenceFailureCode =
  | "INVALID_INPUT"
  | "LIMIT_EXCEEDED"
  | "UNREGISTERED_ARTIFACT"
  | "INVALID_CLAIM_CHECK_MAPPING"
  | "NO_EXECUTION_OBLIGATIONS"
  | "CONTEXT_MISMATCH"
  | "PLAN_RUN_MISMATCH"
  | "SOURCE_NOT_IN_VALIDATION_SCOPE"
  | "UNSUPPORTED_CRITERION"
  | "CHECK_NOT_PASSED"
  | "APPLICABILITY_NOT_ESTABLISHED";

export type ExecutionEvidenceFailure = {
  readonly code: ExecutionEvidenceFailureCode;
  readonly message: string;
  readonly causeCode?: string;
};

export function evidenceFailure(
  code: ExecutionEvidenceFailureCode,
  message: string,
  causeCode?: string,
): ExecutionEvidenceFailure {
  return causeCode === undefined
    ? { code, message }
    : { code, message, causeCode };
}
