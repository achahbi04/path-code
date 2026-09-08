/**
 * Phase 5D3 Authorized Mutation Arc — failure types.
 */

export type MutationSessionConfigurationFailureCode =
  | "INVALID_SESSION"
  | "INVALID_TARGETS"
  | "INVALID_BLUEPRINT"
  | "CONTEXT_MISMATCH"
  | "CATALOG_UNAVAILABLE"
  | "BRAIN_IDENTITY_INVALID"
  | "UNSUPPORTED_CAPABILITY"
  | "POLICY_TARGET_FORBIDDEN"
  | "DUPLICATE_OR_ALIAS_TARGET"
  | "LIMIT_EXCEEDED"
  /** Phase 6A: recoveryProtection REQUIRED without a usable recovery store. */
  | "RECOVERY_CONFIGURATION_INVALID";

export type MutationSessionConfigurationFailure = {
  readonly kind: "CONFIGURATION";
  readonly code: MutationSessionConfigurationFailureCode;
  readonly message: string;
};

export type MutationSessionFailureCode =
  | "BUSY"
  | "SESSION_CLOSED"
  | "INVALID_STATE"
  | "INVALID_TASK"
  | "INVALID_REVIEW"
  | "INVALID_AUTHORIZATION"
  | "PROPOSAL_REFUSED"
  | "ENVELOPE_INVALID"
  | "GATE1_FAILED"
  | "PREPARATION_FAILED"
  /**
   * Phase 6A: recoveryProtection REQUIRED and the durable checkpoint could not
   * be captured, persisted and read back. Zero mutation writes were dispatched.
   */
  | "RECOVERY_CHECKPOINT_NOT_ESTABLISHED"
  | "MUTATION_REFUSED"
  | "MUTATION_PARTIAL"
  | "MUTATION_COMMITTED_FAILURE"
  | "WRITE_OUTCOME_UNCONFIRMED"
  | "REOBSERVATION_FAILED"
  | "VALIDATION_PREPARATION_FAILED"
  | "VALIDATION_FAILED"
  | "STOP_REQUESTED"
  | "INTERNAL_CONTRACT";

export type MutationSessionFailure = {
  readonly kind: "MUTATION_CALL";
  readonly code: MutationSessionFailureCode;
  readonly message: string;
  readonly artifacts?: MutationFailureArtifacts;
};

export type MutationFailureArtifacts = {
  readonly mutationOutcome?: unknown;
  readonly reobservation?: unknown;
  readonly cycleOutcome?: unknown;
};

export function configurationFailure(
  code: MutationSessionConfigurationFailureCode,
  message: string,
): MutationSessionConfigurationFailure {
  return { kind: "CONFIGURATION", code, message };
}

export function sessionFailure(
  code: MutationSessionFailureCode,
  message: string,
  artifacts?: MutationFailureArtifacts,
): MutationSessionFailure {
  return artifacts === undefined
    ? { kind: "MUTATION_CALL", code, message }
    : { kind: "MUTATION_CALL", code, message, artifacts };
}
