/**
 * Phase 5A Reasoning Ledger contracts — types only.
 *
 * Untrusted proposals, reference-bound shapes, verification obligations,
 * inference/uncertainty, Engineering Run citations, and structured refusals.
 * No binder, parser, validator, registry, or runtime enforcement.
 */

import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { EngineeringRunRecord } from "../engineering-run/types.js";
import type { RepositoryEntry } from "../inventory/types.js";
import type { ManifestEvidence } from "../metadata/types.js";
import type { ContentObservation } from "../reader/types.js";
import type { RepositorySnapshot } from "../snapshot/types.js";
import type { ValidationCheckKind } from "../validation/types.js";

/** Local nonempty readonly tuple helper. */
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

/**
 * Six claim families — reasoning-local vocabulary.
 * Does not extend global ActionClass, EvidenceKind, or KnowledgeState.
 */
export type ReasoningClaimKind =
  | "EXISTS"
  | "CONTENT"
  | "DEPENDS_DECLARED"
  | "CONTAINS"
  | "DEFINES"
  | "BEHAVES";

/**
 * Untrusted evidence identifier or repository-relative path hint.
 * Strings are requests to resolve — never earned authority.
 */
export type ProposedEvidenceReference =
  | {
      readonly kind: "EVIDENCE_ID";
      readonly id: string;
    }
  | {
      readonly kind: "REPOSITORY_RELATIVE_PATH";
      readonly relativePath: string;
    };

type ProposedClaimCommon = {
  readonly claimId: string;
  readonly statement: string;
  readonly proposedSubject: ProposedEvidenceReference;
  readonly proposedCitations: readonly ProposedEvidenceReference[];
};

/**
 * Untrusted proposed claim. Kind-specific strings state the proposition;
 * they are not evidence that it is true. Empty citations remain representable.
 */
export type ProposedClaim =
  | (ProposedClaimCommon & {
      readonly kind: "EXISTS";
    })
  | (ProposedClaimCommon & {
      readonly kind: "CONTENT";
    })
  | (ProposedClaimCommon & {
      readonly kind: "DEPENDS_DECLARED";
      readonly dependencyName: string;
    })
  | (ProposedClaimCommon & {
      readonly kind: "CONTAINS";
      readonly needle: string;
    })
  | (ProposedClaimCommon & {
      readonly kind: "DEFINES";
      readonly symbolName: string;
    })
  | (ProposedClaimCommon & {
      readonly kind: "BEHAVES";
      readonly scenarioDescription: string;
    });

/**
 * Reasoning-local epistemic labels — not new global KnowledgeState values.
 * Claim-ID links are unresolved correlations until a later binder resolves them.
 */
export type ReasoningHypothesis =
  | {
      readonly hypothesisId: string;
      readonly epistemic: "INFERRED";
      readonly statement: string;
      readonly supportingClaimIds: NonEmptyReadonlyArray<string>;
    }
  | {
      readonly hypothesisId: string;
      readonly epistemic: "UNVERIFIED";
      readonly statement: string;
      readonly supportingClaimIds?: readonly string[];
    };

/** Proposal envelope schema version — type-level only. */
export type ReasoningProposalSchemaVersion = 1;

/**
 * Untrusted reasoning proposal. No EditContract, PreparedChange, shell command,
 * authority token, or auto-execute field.
 */
export type ReasoningProposal = {
  readonly schemaVersion: ReasoningProposalSchemaVersion;
  readonly proposalId: string;
  readonly requestedOutcome: string;
  readonly claims: readonly ProposedClaim[];
  readonly hypotheses: readonly ReasoningHypothesis[];
};

/** Bound claims carry References Only — not verified, fresh, or authorized. */
export type ReferenceBindingStage = "REFERENCES_ONLY";

export type ReferenceBoundContext = {
  readonly workspace: WorkspaceBoundary;
  readonly snapshot: RepositorySnapshot;
};

/** Observation obligation — not a recorded OBSERVED/PROVEN verdict. */
export type ObservationVerificationRequirement = {
  readonly method: "OBSERVATION";
};

/**
 * Content-search check is not provided by 5A.
 * This obligation does not claim implemented verification or semantic success.
 */
export type DeferredContentCheckRequirement = {
  readonly method: "DEFERRED_CONTENT_CHECK";
};

/**
 * Execution verification obligation — not a command, plan, permission, or result.
 * Uses existing Validation check-kind vocabulary.
 */
export type ExecutionVerificationRequirement = {
  readonly method: "EXECUTION";
  readonly checkKinds: NonEmptyReadonlyArray<ValidationCheckKind>;
  readonly checkPurpose: string;
};

type BoundClaimCommon = {
  readonly claimId: string;
  readonly statement: string;
  readonly bindingStage: ReferenceBindingStage;
  readonly context: ReferenceBoundContext;
};

/**
 * Kind-correlated reference-bound field shape (unbranded).
 * Not authenticated. Used so compile tests can exercise field relationships
 * separately from the opacity brand.
 */
export type ReferenceBoundClaimShape =
  | (BoundClaimCommon & {
      readonly kind: "EXISTS";
      readonly subject: RepositoryEntry;
      readonly requiredVerification: ObservationVerificationRequirement;
    })
  | (BoundClaimCommon & {
      readonly kind: "CONTENT";
      readonly subject: ContentObservation;
      readonly requiredVerification: ObservationVerificationRequirement;
    })
  | (BoundClaimCommon & {
      readonly kind: "DEPENDS_DECLARED";
      readonly subject: ManifestEvidence;
      readonly dependencyName: string;
      readonly requiredVerification: ObservationVerificationRequirement;
    })
  | (BoundClaimCommon & {
      readonly kind: "CONTAINS";
      readonly subject: ContentObservation;
      readonly needle: string;
      readonly requiredVerification: DeferredContentCheckRequirement;
    })
  | (BoundClaimCommon & {
      readonly kind: "DEFINES";
      readonly subjects: NonEmptyReadonlyArray<ContentObservation>;
      readonly symbolName: string;
      readonly requiredVerification: ExecutionVerificationRequirement;
    })
  | (BoundClaimCommon & {
      readonly kind: "BEHAVES";
      readonly subjects: NonEmptyReadonlyArray<ContentObservation>;
      readonly scenarioDescription: string;
      readonly requiredVerification: ExecutionVerificationRequirement;
    });

declare const referenceBoundClaimBrand: unique symbol;

/**
 * Compile-time-opaque bound claim. Raw ProposedClaim is not assignable.
 * No brand constructor or binder is implemented in 5A.
 */
export type ReferenceBoundClaim = ReferenceBoundClaimShape & {
  readonly [referenceBoundClaimBrand]: true;
};

/**
 * Bound reasoning group. Distinct from the untrusted proposal.
 * Contains no action authorization or overall task-completion verdict.
 */
export type ReferenceBoundReasoning = {
  readonly context: ReferenceBoundContext;
  readonly claims: readonly ReferenceBoundClaim[];
  readonly hypotheses: readonly ReasoningHypothesis[];
};

/**
 * Citation of an authentic Engineering Run record for later Gate 2 association.
 * Does not certify claim truth; failed runs remain citable history.
 */
export type EngineeringRunCitation = {
  readonly meaning: "CITED_RUN_ONLY";
  readonly claimId: string;
  readonly run: EngineeringRunRecord;
  readonly selectedCheckIds: NonEmptyReadonlyArray<string>;
};

/**
 * Reasoning-local refusal codes — machine meaning; prose does not authorize.
 */
export type ReasoningRefusalCode =
  | "UNBOUND_CLAIM"
  | "EVIDENCE_IDENTITY_MISMATCH"
  | "STALE_EVIDENCE"
  | "GROUNDING_OVERCLAIM"
  | "UNVERIFIABLE_IN_PRECONDITION"
  | "CLAIM_OUTSIDE_ADMITTED_SET";

export type ReasoningRefusal = {
  readonly code: ReasoningRefusalCode;
  readonly claimId: string;
  readonly reason: string;
  readonly referenceCorrelation?: string;
};
