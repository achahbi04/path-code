/**
 * Phase 5D3 Authorized Mutation Arc — package-internal barrel.
 * Not exported from src/index.ts or src/orchestrator/index.ts.
 */

export {
  DEFAULT_POST_EDIT_BRAIN_ATTEMPTS,
  EDIT_ENVELOPE_SCHEMA_VERSION,
  MAX_AFTER_TEXT_UTF8_BYTES,
  MAX_EMBEDDED_REASONING_UTF8_BYTES,
  MAX_MUTATION_TARGETS,
  MAX_POST_EDIT_BRAIN_ATTEMPTS,
  MAX_POST_EDIT_CONTENT_INPUTS,
  MAX_REOBSERVATION_CONTENT_BYTES,
  MAX_SUPPORTING_CLAIM_IDS,
  MAX_TOTAL_AFTER_TEXT_UTF8_BYTES,
  MIN_MUTATION_TARGETS,
  MIN_POST_EDIT_BRAIN_ATTEMPTS,
  MIN_SUPPORTING_CLAIM_IDS,
  MUTATION_RECORD_SCHEMA_VERSION,
  PATHCODE_POLICY_FILENAME,
  utf8ByteLength,
} from "./bounds.js";

export {
  configurationFailure,
  sessionFailure,
  type MutationFailureArtifacts,
  type MutationSessionConfigurationFailure,
  type MutationSessionConfigurationFailureCode,
  type MutationSessionFailure,
  type MutationSessionFailureCode,
} from "./failures.js";

export {
  openEngineeringMutationSession,
  summarizeMutationSession,
} from "./session.js";

export type {
  CreateTextTargetSpec,
  EngineeringMutationSession,
  EngineeringMutationSessionSpec,
  MutationArtifacts,
  MutationControlPhase,
  MutationDisposition,
  MutationReview,
  MutationReviewView,
  MutationSessionDescriptorView,
  MutationSessionRecord,
  MutationSessionSummary,
  MutationStrongLabel,
  MutationTargetDescription,
  MutationTargetKind,
  MutationTargetSpec,
  MutationValidationOutcome,
  MutationValidationReview,
  MutationValidationReviewView,
  OpenMutationSessionResult,
  PreparedAuthorizationPair,
  ReobservationDisposition,
  ReplaceTextTargetSpec,
  ValidationBlueprint,
  ValidationDisposition,
} from "./types.js";
