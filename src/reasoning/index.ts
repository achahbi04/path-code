/**
 * Phase 5B Reasoning Ledger — package-internal surface.
 * Types plus explicitly approved runtime reference-binding operations.
 * Not exported from the package root.
 */

export type {
  DeferredContentCheckRequirement,
  EngineeringRunCitation,
  ExecutionVerificationRequirement,
  NonEmptyReadonlyArray,
  ObservationVerificationRequirement,
  ProposedClaim,
  ProposedEvidenceReference,
  ReasoningClaimKind,
  ReasoningHypothesis,
  ReasoningProposal,
  ReasoningProposalSchemaVersion,
  ReasoningRefusal,
  ReasoningRefusalCode,
  ReferenceBindingStage,
  ReferenceBoundClaim,
  ReferenceBoundClaimShape,
  ReferenceBoundContext,
  ReferenceBoundReasoning,
} from "./types.js";

export type {
  ReasoningApplicabilityFailure,
  ReasoningBindFailure,
  ReasoningCatalogFailure,
  ReasoningCatalogFailureCode,
  ReasoningClaimRefusalFailure,
  ReasoningInputFailure,
  ReasoningInputFailureCode,
} from "./failures.js";

export type {
  CreateReferenceCatalogInput,
  LiveReferenceCatalogAssociation,
  ReferenceCatalog,
  ReferenceCatalogSelection,
  ReferenceDescriptor,
  ReferenceEvidenceKind,
} from "./catalog.js";

export type { ReasoningBindSuccess } from "./bind.js";
export type { ReferenceBoundApplicabilitySuccess } from "./applicability.js";

export {
  createReferenceCatalog,
  describeReferenceCatalog,
  disposeReferenceCatalog,
  inspectLiveReferenceCatalogAssociation,
} from "./catalog.js";

export { bindReasoningProposalJson } from "./bind.js";
export { checkReferenceBoundReasoningApplicability } from "./applicability.js";
