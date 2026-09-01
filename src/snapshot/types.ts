/**
 * Phase 2F snapshot and freshness types.
 *
 * Three verification dimensions remain structurally separate:
 * entry identity, content bytes, and derived knowledge.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { GitStateBaseline } from "../git/types.js";
import type { TraversalCompletion } from "../inventory/disposition.js";
import type { RepositoryEntry, RepositoryInventory } from "../inventory/types.js";
import type {
  MetadataCompletion,
  ProjectIdentityClaim,
  RepositoryMap,
} from "../metadata/types.js";
import type { ContentObservation } from "../reader/types.js";
import type { RepositorySearchCorpus } from "../search/types.js";

export type SnapshotGeneration = {
  readonly __snapshotGenerationBrand: never;
};

export type EntryStatIdentity = {
  readonly dev: number;
  readonly ino: number;
};

export type RepositorySnapshotData = {
  readonly generation: SnapshotGeneration;
  readonly assembledAt: number;
  readonly workspace: WorkspaceBoundary;
  readonly config: ResolvedProjectConfig;
  readonly inventory: RepositoryInventory;
  readonly gitBaseline?: GitStateBaseline;
  readonly repositoryMap?: RepositoryMap;
  readonly searchCorpus?: RepositorySearchCorpus;
  readonly contentObservations: readonly ContentObservation[];
  readonly contentObservationByEntry: ReadonlyMap<RepositoryEntry, ContentObservation>;
  readonly entryStatIdentities: ReadonlyMap<RepositoryEntry, EntryStatIdentity>;
  readonly inventoryTraversalCompletion: TraversalCompletion;
  readonly metadataCompletion?: MetadataCompletion;
};

/**
 * Earned in-memory knowledge generation — produced only by buildRepositorySnapshot.
 */
export type RepositorySnapshot = RepositorySnapshotData & {
  readonly __repositorySnapshotBrand: never;
};

export type EntryVerificationState =
  | "CURRENT_IDENTITY"
  | "STALE_DELETED"
  | "STALE_TARGET_CHANGED"
  | "STALE_TYPE_CHANGED"
  | "STALE_OUTSIDE_WORKSPACE"
  | "DENIED"
  | "UNREADABLE"
  | "NOT_VERIFIED";

export type ContentVerificationState =
  | "VERIFIED_CURRENT"
  | "STALE_CONTENT"
  | "REVALIDATION_REQUIRED"
  | "UNVERIFIABLE"
  | "DENIED"
  | "UNREADABLE"
  | "NOT_VERIFIED";

export type DerivedVerificationState =
  | "SUPPORTED"
  | "UNSUPPORTED_STALE_EVIDENCE"
  | "LIMITED"
  | "SOURCE_STALE"
  | "UNVERIFIED"
  | "NOT_VERIFIED";

export type GitBaselineFreshnessState = "POINT_IN_TIME" | "RECOLLECT_REQUIRED_FOR_CURRENTNESS";

export type NotVerifiedReason =
  | "BUDGET_EXHAUSTED"
  | "NOT_REQUESTED"
  | "NO_BASELINE_CONTENT_OBSERVATION";

export type UnverifiableReason = "NO_BASELINE_CONTENT_OBSERVATION" | "TOO_LARGE";

export type EntryVerificationResultData = {
  readonly entry: RepositoryEntry;
  readonly relativePath: string;
  readonly state: EntryVerificationState;
  readonly verifiedAt: number;
  readonly notVerifiedReason?: NotVerifiedReason;
};

export type EntryVerificationResult = EntryVerificationResultData & {
  readonly __entryVerificationBrand: never;
};

export type ContentVerificationResultData = {
  readonly entry: RepositoryEntry;
  readonly relativePath: string;
  readonly state: ContentVerificationState;
  readonly verifiedAt: number;
  readonly baselineObservation?: ContentObservation;
  readonly observedContent?: ContentObservation;
  readonly notVerifiedReason?: NotVerifiedReason;
  readonly unverifiableReason?: UnverifiableReason;
};

export type ContentVerificationResult = ContentVerificationResultData & {
  readonly __contentVerificationBrand: never;
};

export type DerivedKnowledgeVerificationResultData = {
  readonly kind:
    | "MANIFEST_EVIDENCE"
    | "OBSERVED_IDENTITY_CLAIM"
    | "REPOSITORY_MAP"
    | "SEARCH_CORPUS"
    | "SEARCH_RESULT";
  readonly state: DerivedVerificationState;
  readonly relativePath?: string;
  readonly scopeRelativePath?: string;
  readonly claim?: ProjectIdentityClaim;
};

export type DerivedKnowledgeVerificationResult =
  DerivedKnowledgeVerificationResultData & {
    readonly __derivedKnowledgeVerificationBrand: never;
  };

export type AssessmentCompletion =
  | { readonly kind: "COMPLETE" }
  | {
      readonly kind: "PARTIAL";
      readonly reasons: readonly (
        | { readonly kind: "ENTRY_BUDGET_EXHAUSTED" }
        | { readonly kind: "CONTENT_BUDGET_EXHAUSTED" }
      )[];
    };

export type FreshnessHonesty = {
  readonly verifiedObservationsOnly: true;
  readonly newEntriesNotDetectable: true;
  readonly repositoryUnchangedClaim: false;
};

export type FreshnessAssessmentData = {
  readonly snapshot: RepositorySnapshot;
  readonly generation: SnapshotGeneration;
  readonly assessedAt: number;
  readonly entryResults: readonly EntryVerificationResult[];
  readonly contentResults: readonly ContentVerificationResult[];
  readonly derivedResults: readonly DerivedKnowledgeVerificationResult[];
  readonly gitBaselineState?: GitBaselineFreshnessState;
  readonly assessmentCompletion: AssessmentCompletion;
  readonly honesty: FreshnessHonesty;
};

/**
 * Earned freshness assessment — produced only by verifyRepositorySnapshot.
 */
export type FreshnessAssessment = FreshnessAssessmentData & {
  readonly __freshnessAssessmentBrand: never;
};

export type VerificationOptions = {
  readonly maxEntryVerifications?: number;
  readonly maxContentVerifications?: number;
  readonly maxEntryConcurrency?: number;
  readonly maxContentConcurrency?: number;
};

export type EffectiveVerificationLimits = {
  readonly maxEntryVerifications: number;
  readonly maxContentVerifications: number;
  readonly maxEntryConcurrency: number;
  readonly maxContentConcurrency: number;
};

export type VerificationRequest = {
  readonly entries: "ALL" | readonly RepositoryEntry[];
  readonly content: "NONE" | "ALL" | readonly RepositoryEntry[];
  readonly options?: VerificationOptions;
};

export type SnapshotBuildInput = {
  readonly workspace: WorkspaceBoundary;
  readonly config: ResolvedProjectConfig;
  readonly inventory: RepositoryInventory;
  readonly gitBaseline?: GitStateBaseline;
  readonly repositoryMap?: RepositoryMap;
  readonly searchCorpus?: RepositorySearchCorpus;
  readonly contentObservations?: readonly ContentObservation[];
  readonly entryStatIdentities?: ReadonlyMap<RepositoryEntry, EntryStatIdentity>;
};

export type { SnapshotFailure, SnapshotFailureCode } from "./failure.js";
