/**
 * Phase 2F freshness and in-memory snapshot integrity.
 * Side-effect free on import except verification operations explicitly invoked.
 */

export { buildRepositorySnapshot } from "./snapshot.js";
export { verifyRepositorySnapshot } from "./verify.js";
export {
  MAX_ENTRY_VERIFICATIONS_PER_OPERATION,
  MAX_CONTENT_VERIFICATIONS_PER_OPERATION,
  MAX_ENTRY_VERIFICATION_CONCURRENCY,
  MAX_CONTENT_VERIFICATION_CONCURRENCY,
} from "./constants.js";
export type {
  RepositorySnapshot,
  RepositorySnapshotData,
  SnapshotBuildInput,
  SnapshotGeneration,
  EntryStatIdentity,
  EntryVerificationResult,
  EntryVerificationState,
  ContentVerificationResult,
  ContentVerificationState,
  DerivedKnowledgeVerificationResult,
  DerivedVerificationState,
  FreshnessAssessment,
  FreshnessAssessmentData,
  FreshnessHonesty,
  GitBaselineFreshnessState,
  VerificationRequest,
  VerificationOptions,
  EffectiveVerificationLimits,
  AssessmentCompletion,
  NotVerifiedReason,
  UnverifiableReason,
  SnapshotFailure,
  SnapshotFailureCode,
} from "./types.js";
