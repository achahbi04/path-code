/**
 * Phase 2E search and candidate retrieval types.
 *
 * Search does not read. Candidate authority comes from RepositoryEntry references
 * earned during inventory traversal — never from lexical ranking alone.
 */

import type { TraversalCompletion } from "../inventory/disposition.js";
import type { LexicalEntryKind, RepositoryEntry } from "../inventory/types.js";
import type {
  MetadataCompletion,
  MetadataPartialReason,
  RepositoryMap,
  RepositoryMapEntry,
} from "../metadata/types.js";
import type { InventoryPartialReason } from "../inventory/disposition.js";

export type CandidateMatchReason =
  | { readonly kind: "EXACT_BASENAME_MATCH"; readonly basename: string }
  | { readonly kind: "BASENAME_TOKEN_MATCH"; readonly term: string }
  | { readonly kind: "PATH_COMPONENT_MATCH"; readonly term: string; readonly component: string }
  | { readonly kind: "PATH_SUBSTRING_MATCH"; readonly term: string }
  | { readonly kind: "EXTENSION_FILTER_MATCH"; readonly extension: string }
  | { readonly kind: "SCOPE_PREFIX_MATCH"; readonly scopePrefix: string };

export type SearchQueryInput = {
  readonly terms?: readonly string[];
  readonly exactBasename?: string;
  readonly extensions?: readonly string[];
  readonly scopePrefix?: string;
  readonly entryKinds?: readonly LexicalEntryKind[];
};

export type SearchQueryData = {
  readonly terms: readonly string[];
  readonly normalizedTerms: readonly string[];
  readonly exactBasename?: string;
  readonly normalizedExactBasename?: string;
  readonly extensions?: readonly string[];
  readonly normalizedExtensions?: readonly string[];
  readonly scopePrefix?: string;
  readonly normalizedScopePrefix?: string;
  readonly entryKinds?: readonly LexicalEntryKind[];
};

/**
 * Validated search query — produced only by query validation.
 */
export type SearchQuery = SearchQueryData & {
  readonly __searchQueryBrand: never;
};

export type SearchOptions = {
  readonly maxResults?: number;
};

export type RepositoryCandidateData = {
  readonly entry: RepositoryEntry;
  readonly relevanceScore: number;
  readonly matchReasons: readonly CandidateMatchReason[];
  readonly relativePath: string;
  readonly lexicalDepth: number;
  readonly lexicalKind: LexicalEntryKind;
  readonly mapEntry?: RepositoryMapEntry;
};

/**
 * Earned repository candidate — produced only by the search engine.
 */
export type RepositoryCandidate = RepositoryCandidateData & {
  readonly __repositoryCandidateBrand: never;
};

export type SearchSourceCompletion = {
  readonly inventoryTraversalCompletion: TraversalCompletion;
  readonly metadataCompletion: MetadataCompletion;
};

export type SearchSelectionCompletion =
  | { readonly kind: "COMPLETE" }
  | { readonly kind: "PARTIAL_RESULT_LIMIT" };

export type SearchUnavailableSignal =
  | { readonly kind: "DENIED_BOUNDARY_MATCH"; readonly relativePath: string }
  | {
      readonly kind: "SYSTEM_PRUNED_BOUNDARY_MATCH";
      readonly relativePath: string;
      readonly reason: string;
    };

export type SearchLimitation =
  | {
      readonly kind: "INVENTORY_PARTIAL";
      readonly reasons: readonly [InventoryPartialReason, ...InventoryPartialReason[]];
    }
  | {
      readonly kind: "METADATA_PARTIAL";
      readonly reasons: readonly [MetadataPartialReason, ...MetadataPartialReason[]];
    }
  | { readonly kind: "DENIED_BOUNDARY_PRESENT"; readonly relativePath: string }
  | {
      readonly kind: "SYSTEM_PRUNED_BOUNDARY_PRESENT";
      readonly relativePath: string;
      readonly reason: string;
    };

export type RepositorySearchResultData = {
  readonly query: SearchQuery;
  readonly candidates: readonly RepositoryCandidate[];
  readonly observedMatchCount: number;
  readonly sourceCompletion: SearchSourceCompletion;
  readonly selectionCompletion: SearchSelectionCompletion;
  readonly unavailableSignals: readonly SearchUnavailableSignal[];
  readonly limitations: readonly SearchLimitation[];
};

/**
 * Earned repository search result — produced only by the search engine.
 */
export type RepositorySearchResult = RepositorySearchResultData & {
  readonly __repositorySearchResultBrand: never;
};

export type RepositorySearchCorpusData = {
  readonly inventoryTraversalCompletion: TraversalCompletion;
  readonly metadataCompletion: MetadataCompletion;
  readonly boundaries: RepositoryMap["boundaries"];
  readonly admittedEntries: readonly RepositoryEntry[];
  readonly mapEntriesByEntry: ReadonlyMap<RepositoryEntry, RepositoryMapEntry>;
};

/**
 * Earned in-memory search corpus — produced only by buildRepositorySearchCorpus.
 */
export type RepositorySearchCorpus = RepositorySearchCorpusData & {
  readonly __repositorySearchCorpusBrand: never;
};

export type { SearchFailure, SearchFailureCode } from "./failure.js";
