/**
 * Engineering Self-Observation — public runtime surface (read-only).
 */

export type {
  AdmissibilityClass,
  CapabilityObservation,
  CitationResolutionOutcome,
  CommitCitation,
  DerivedCapabilityState,
  DocumentCitation,
  FreezeEvidence,
  GapCitation,
  ModuleCitation,
  ObligationCitation,
  PhaseAuditEvidence,
  RecordedFigure,
  SameCommitFreezeEvidence,
  TwoCommitFreezeEvidence,
  UnverifiedDerivation,
  VerifiedCapabilityState,
} from "./types.js";

export type { CapabilityLedger, CapabilityRecord } from "./capability-types.js";

export {
  MAX_CAPABILITIES,
  MAX_EVIDENCE_DOCUMENT_BYTES,
  MAX_GAPS,
  MAX_PRODUCTION_SCOPES_PER_FREEZE,
  MAX_TOTAL_CITATIONS,
} from "./capability-types.js";

export type {
  GapLedger,
  GapLifecycle,
  GapRecord,
  ReviewClassification,
  ReviewedGapRecord,
  UnreviewedGapRecord,
} from "./gap-types.js";

export { isReviewedGap, isUnreviewedGap } from "./gap-types.js";

export type { LedgerVerification } from "./verification-types.js";
export { isLedgerVerificationBoundToLedgers } from "./verification-types.js";

export {
  getCanonicalCapabilityLedger,
  CANONICAL_CAPABILITY_LEDGER,
} from "./capability-ledger-data.js";

export {
  getCanonicalGapLedger,
  CANONICAL_GAP_LEDGER,
} from "./gap-ledger-data.js";

export { renderGapLedgerMarkdown } from "./gap-render.js";

export {
  deriveAllCapabilityObservations,
  deriveCapabilityObservation,
  findCapabilityObservation,
} from "./derivation.js";

export {
  checkBootstrapIntegrity,
  detectImpossibleProgression,
  findDependencyCycles,
  findDuplicateCapabilityIds,
  findMissingDependencies,
} from "./bootstrap.js";

export type { BootstrapViolation } from "./bootstrap.js";

export { deepFreeze } from "./freeze.js";
