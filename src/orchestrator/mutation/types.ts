/**
 * Phase 5D3 — types for the authorized mutation session.
 */

import type { EngineeringBrain, BrainContextBlock, BrainInvocationReceipt } from "../../brain/types.js";
import type { WorkspaceBoundary } from "../../domain/workspace.js";
import type {
  EditAuthorization,
  KnowledgeInvalidation,
  PreparedChange,
  PreparedCreation,
  PreparedMutation,
} from "../../editing/types.js";
import type { MultiFilePlanResult } from "../../editing/multi-file-types.js";
import type { RepositoryEntry } from "../../inventory/types.js";
import type { ContentObservation } from "../../reader/types.js";
import type { ReferenceBoundReasoning } from "../../reasoning/types.js";
import type { ReferenceCatalog } from "../../reasoning/catalog.js";
import type { ClaimCheckAssignmentInput } from "../../reasoning/gate2/types.js";
import type { RepositorySnapshot } from "../../snapshot/types.js";
import type {
  PreparedValidationPlan,
  ValidationAuthorization,
  ValidationCheckSpec,
} from "../../validation/types.js";
import type { CycleOutcome } from "../types.js";
import type { MUTATION_RECORD_SCHEMA_VERSION } from "./bounds.js";
import type {
  MutationSessionConfigurationFailure,
  MutationSessionFailure,
} from "./failures.js";

export type MutationTargetKind = "REPLACE_TEXT" | "CREATE_TEXT";

export type ReplaceTextTargetSpec = {
  readonly kind: "REPLACE_TEXT";
  readonly contentObservation: ContentObservation;
  readonly entry: RepositoryEntry;
};

export type CreateTextTargetSpec = {
  readonly kind: "CREATE_TEXT";
  readonly parentDirectory: RepositoryEntry;
  readonly leafName: string;
};

export type MutationTargetSpec = ReplaceTextTargetSpec | CreateTextTargetSpec;

export type MutationTargetDescription = {
  readonly targetId: string;
  readonly kind: MutationTargetKind;
  readonly relativePath: string;
  /** Model-visible catalog handle for the required supporting evidence, when resolved. */
  readonly evidenceHandle?: string;
};

/**
 * Provider-neutral edit grounding score for one permitted target.
 * Owned by the mutation session — adapters transport it unchanged.
 */
export type MutationGroundingRequirement = {
  readonly targetId: string;
  readonly mutationKind: MutationTargetKind;
  readonly requiredSupportingClaimKind: "CONTENT" | "EXISTS";
  readonly requiredEvidenceReference: string;
  readonly requiredRelationship: {
    readonly reasoningClaimsMustIncludeRequiredKind: true;
    readonly claimProposedSubjectMustCiteRequiredEvidenceReference: true;
    readonly changeSupportingClaimIdsMustIncludeThatClaimId: true;
  };
};

export type MutationGroundingRequirementsDocument = {
  readonly title: "GROUNDING REQUIREMENTS";
  readonly schemaVersion: 1;
  readonly targets: readonly MutationGroundingRequirement[];
};

/**
 * Provider-neutral post-edit EXECUTION claim score derived from blueprint
 * claim→check assignments. Adapters transport it unchanged.
 */
export type PostEditExecutionClaimRequirement = {
  readonly claimId: string;
  readonly requiredClaimKind: "DEFINES" | "BEHAVES";
  readonly requiredCheckKinds: readonly ("TYPECHECK" | "TARGETED_TEST")[];
  readonly requiredEvidenceReference: string;
  readonly requiredRelationship: {
    readonly claimProposedSubjectMustCiteRequiredEvidenceReference: true;
  };
};

export type PostEditExecutionClaimRequirementsDocument = {
  readonly title: "POST_EDIT_EXECUTION_CLAIM_REQUIREMENTS";
  readonly schemaVersion: 1;
  readonly requiredClaims: readonly PostEditExecutionClaimRequirement[];
};

export type ValidationBlueprint = {
  readonly checks: readonly ValidationCheckSpec[];
  readonly claimCheckAssignments: readonly ClaimCheckAssignmentInput[];
  readonly supportingObservations: readonly ContentObservation[];
  readonly postEditInstructionText: string;
  readonly postEditContextBlocks: readonly BrainContextBlock[];
  readonly maxBrainAttempts?: number;
};

export type EngineeringMutationSessionSpec = {
  readonly workspace: WorkspaceBoundary;
  readonly snapshot: RepositorySnapshot;
  readonly catalog: ReferenceCatalog;
  readonly brain: EngineeringBrain;
  readonly permittedTargets: readonly MutationTargetSpec[];
  readonly disclosedObservations: readonly ContentObservation[];
  readonly validationBlueprint: ValidationBlueprint;
};

export type MutationControlPhase =
  | "READY"
  | "PROPOSING"
  | "AWAITING_EDIT_AUTHORIZATION"
  | "APPLYING"
  | "REOBSERVING"
  | "AWAITING_VALIDATION_AUTHORIZATION"
  | "VALIDATING"
  | "FINALIZED";

export type MutationDisposition =
  | "NOT_DISPATCHED"
  | "ALL_APPLIED"
  | "PARTIAL"
  | "COMMITTED_FAILURE"
  | "REFUSED"
  | "WRITE_OUTCOME_UNCONFIRMED";

export type ReobservationDisposition =
  | "NOT_RUN"
  | "SUCCEEDED"
  | "FAILED";

export type ValidationDisposition =
  | "NOT_AUTHORIZED"
  | "NOT_RUN"
  | "ACCEPTED"
  | "NOT_ACCEPTED"
  | "FAILED"
  | "INTERRUPTED";

export type MutationStrongLabel =
  | "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED"
  | "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED"
  | "MUTATION_PARTIAL_OR_FAILED"
  | "MUTATION_NOT_DISPATCHED"
  | "PROPOSAL_ONLY"
  | "SESSION_REFUSED";

export type PreparedAuthorizationPair = {
  readonly prepared: PreparedChange;
  readonly authorization: EditAuthorization;
};

export type MutationReviewView = {
  readonly reviewId: string;
  readonly order: readonly {
    readonly changeId: string;
    readonly targetId: string;
    readonly kind: MutationTargetKind;
    readonly relativePath: string;
    readonly afterText: string;
    readonly prepared: PreparedChange;
  }[];
  readonly boundReasoning: ReferenceBoundReasoning;
  readonly brainReceipt: BrainInvocationReceipt;
};

export type MutationReview = {
  readonly reviewId: string;
  readonly view: MutationReviewView;
  readonly __mutationReviewBrand: never;
};

export type MutationValidationReviewView = {
  readonly reviewId: string;
  readonly preparedPlan: PreparedValidationPlan;
  readonly postEditSnapshot: RepositorySnapshot;
  readonly postEditCatalog: ReferenceCatalog;
  readonly claimCheckAssignments: readonly ClaimCheckAssignmentInput[];
  readonly mutationArtifacts: MutationArtifacts;
  readonly afterByteComparisons: readonly {
    readonly targetId: string;
    readonly matched: true;
    readonly relativePath: string;
  }[];
};

export type MutationValidationReview = {
  readonly reviewId: string;
  readonly view: MutationValidationReviewView;
  readonly __mutationValidationReviewBrand: never;
};

export type SingleFileMutationOutcome =
  | {
      readonly kind: "REPLACE";
      readonly prepared: PreparedMutation;
      readonly result: Awaited<
        ReturnType<typeof import("../../editing/replace-existing-file.js").replaceExistingFile>
      >;
    }
  | {
      readonly kind: "CREATE";
      readonly prepared: PreparedCreation;
      readonly result: Awaited<
        ReturnType<typeof import("../../editing/create-file.js").createFile>
      >;
    };

export type MutationArtifacts = {
  readonly disposition: MutationDisposition;
  readonly singleFile?: SingleFileMutationOutcome;
  readonly multiFile?: MultiFilePlanResult;
  readonly knowledgeInvalidations: readonly KnowledgeInvalidation[];
  readonly appliedCount: number;
  readonly plannedCount: number;
};

export type MutationValidationOutcome = {
  readonly label: MutationStrongLabel;
  readonly record: MutationSessionRecord;
  readonly artifacts: {
    readonly mutation: MutationArtifacts;
    readonly validationReview?: MutationValidationReviewView;
    readonly cycle?: CycleOutcome;
  };
};

export type MutationSessionRecord = {
  readonly schemaVersion: typeof MUTATION_RECORD_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly phase: MutationControlPhase;
  readonly mutationDisposition: MutationDisposition;
  readonly reobservationDisposition: ReobservationDisposition;
  readonly validationDisposition: ValidationDisposition;
  readonly stopRequested: boolean;
  readonly label: MutationStrongLabel;
  readonly inPlaceNoRollbackPolicy: true;
  readonly noGitCommit: true;
};

export type MutationSessionDescriptorView = {
  readonly sessionId: string;
  readonly phase: MutationControlPhase;
  readonly targetCount: number;
  readonly stopRequested: boolean;
  readonly proposeConsumed: boolean;
  readonly applyConsumed: boolean;
  readonly validateConsumed: boolean;
};

export type MutationSessionSummary = {
  readonly sessionId: string;
  readonly phase: MutationControlPhase;
  readonly mutationDisposition: MutationDisposition;
  readonly reobservationDisposition: ReobservationDisposition;
  readonly validationDisposition: ValidationDisposition;
  readonly label: MutationStrongLabel;
  readonly stopRequested: boolean;
  readonly appliedCount: number | null;
  readonly plannedCount: number | null;
  readonly inPlaceNoRollbackPolicy: true;
  readonly noGitCommit: true;
};

export type EngineeringMutationSession = {
  propose(
    task: { correlationId: string; instructionText: string },
    options?: { signal?: AbortSignal },
  ): Promise<
    | { ok: true; value: MutationReview }
    | { ok: false; error: MutationSessionFailure; record: MutationSessionRecord }
  >;
  apply(
    review: MutationReview,
    pairs: readonly PreparedAuthorizationPair[],
    options?: { signal?: AbortSignal },
  ): Promise<
    | { ok: true; value: MutationValidationReview }
    | { ok: false; error: MutationSessionFailure; record: MutationSessionRecord }
  >;
  validate(
    validationReview: MutationValidationReview,
    authorization: ValidationAuthorization,
    options?: { signal?: AbortSignal },
  ): Promise<
    | { ok: true; value: MutationValidationOutcome }
    | { ok: false; error: MutationSessionFailure; record: MutationSessionRecord }
  >;
  describe(): MutationSessionDescriptorView;
  close(): void;
};

export type OpenMutationSessionResult =
  | { ok: true; value: EngineeringMutationSession }
  | { ok: false; error: MutationSessionConfigurationFailure };
