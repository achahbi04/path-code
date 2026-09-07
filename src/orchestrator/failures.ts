/**
 * Phase 5D2 Engineering Orchestrator — failure and terminal types.
 */

export type CycleConfigurationFailureCode =
  | "INVALID_SESSION"
  | "INVALID_MODE"
  | "INVALID_OPTIONS"
  | "CATALOG_UNAVAILABLE"
  | "CONTEXT_MISMATCH"
  | "VALIDATION_SPEC_INCOMPLETE"
  | "AUTHORIZATION_INCOMPATIBLE"
  | "PACKET_CANNOT_RESERVE_REVISION"
  | "BRAIN_IDENTITY_INVALID";

export type CycleConfigurationFailure = {
  readonly kind: "CONFIGURATION";
  readonly code: CycleConfigurationFailureCode;
  readonly message: string;
};

export type CycleFailureCode =
  | "BUSY"
  | "CYCLE_ALREADY_RUN"
  | "CYCLE_CLOSED"
  | "INVALID_TASK"
  | "INTERNAL_CONTRACT";

export type CycleFailure = {
  readonly kind: "CYCLE_CALL";
  readonly code: CycleFailureCode;
  readonly message: string;
};

export type CycleTerminalState =
  | "BOUND"
  | "SUBSTANTIATED"
  | "NOT_SUBSTANTIATED"
  | "EXHAUSTED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

export type CycleOriginCode =
  | "REFERENCE_BOUND"
  | "EXECUTION_EVIDENCE_ACCEPTED"
  | "EXECUTION_EVIDENCE_NOT_ESTABLISHED"
  | "REVISION_EXHAUSTED"
  | "EVIDENCE_STALE"
  | "SCOPE_DENIED"
  | "UNVERIFIABLE_CONTEXT"
  | "CATALOG_INVALID"
  | "INPUT_TERMINAL"
  | "BRAIN_FAILED"
  | "BRAIN_TIMED_OUT"
  | "GATE1_FAILED"
  | "GATE2_PREPARE_FAILED"
  | "GATE2_EVALUATE_FAILED"
  | "ENGINEERING_RUN_FAILED"
  | "INSUFFICIENT_EXECUTION_BUDGET"
  | "APPLICABILITY_FAILED"
  | "AUTHORIZATION_INCOMPATIBLE"
  | "CANCELLED"
  | "TIMED_OUT"
  | "INTERNAL_CONTRACT"
  | "NO_EXECUTION_OBLIGATIONS"
  | "STOP_DURING_EXECUTION";

export function configurationFailure(
  code: CycleConfigurationFailureCode,
  message: string,
): CycleConfigurationFailure {
  return { kind: "CONFIGURATION", code, message };
}

export function cycleFailure(
  code: CycleFailureCode,
  message: string,
): CycleFailure {
  return { kind: "CYCLE_CALL", code, message };
}
