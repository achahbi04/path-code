/**
 * Phase 2E search engine — deterministic in-memory candidate retrieval.
 *
 * Search does not read. No filesystem access. No reader execution.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { LOCALE_INDEPENDENT_NAME_COMPARE } from "../inventory/constants.js";
import { MAX_SEARCH_RESULTS } from "./constants.js";
import { searchFailure, type SearchFailure } from "./failure.js";
import {
  boundaryMatchesSearchLexical,
  lexicalDepth,
} from "./normalize.js";
import { validateSearchQuery } from "./query.js";
import { scoreCandidate } from "./score.js";
import type {
  RepositoryCandidate,
  RepositoryCandidateData,
  RepositorySearchCorpus,
  RepositorySearchResult,
  RepositorySearchResultData,
  SearchLimitation,
  SearchOptions,
  SearchQueryInput,
  SearchUnavailableSignal,
} from "./types.js";

function brandRepositoryCandidate(data: RepositoryCandidateData): RepositoryCandidate {
  return data as RepositoryCandidate;
}

function brandRepositorySearchResult(
  data: RepositorySearchResultData,
): RepositorySearchResult {
  return data as RepositorySearchResult;
}

function validateSearchOptions(
  options: SearchOptions | undefined,
): Result<number, SearchFailure> {
  const requested = options?.maxResults ?? MAX_SEARCH_RESULTS;
  if (!Number.isFinite(requested) || !Number.isInteger(requested)) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_OPTIONS",
        "maxResults must be a finite integer",
      ),
    );
  }
  if (requested <= 0) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_OPTIONS",
        "maxResults must be a positive integer",
      ),
    );
  }
  if (requested > MAX_SEARCH_RESULTS) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_OPTIONS",
        "maxResults cannot exceed the hard production ceiling",
        { hardCeiling: MAX_SEARCH_RESULTS },
      ),
    );
  }
  return success(requested);
}

function collectSourceLimitations(
  corpus: RepositorySearchCorpus,
): SearchLimitation[] {
  const limitations: SearchLimitation[] = [];

  if (corpus.inventoryTraversalCompletion.kind === "PARTIAL") {
    limitations.push({
      kind: "INVENTORY_PARTIAL",
      reasons: corpus.inventoryTraversalCompletion.reasons,
    });
  }

  if (corpus.metadataCompletion.kind === "PARTIAL") {
    limitations.push({
      kind: "METADATA_PARTIAL",
      reasons: corpus.metadataCompletion.reasons,
    });
  }

  for (const boundary of corpus.boundaries) {
    if (boundary.kind === "DENIED") {
      limitations.push({
        kind: "DENIED_BOUNDARY_PRESENT",
        relativePath: boundary.relativePath,
      });
    } else {
      limitations.push({
        kind: "SYSTEM_PRUNED_BOUNDARY_PRESENT",
        relativePath: boundary.relativePath,
        reason: boundary.reason,
      });
    }
  }

  limitations.sort((a, b) => {
    const keyA = JSON.stringify(a);
    const keyB = JSON.stringify(b);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
  return limitations;
}

function collectUnavailableSignals(
  corpus: RepositorySearchCorpus,
  normalizedTerms: readonly string[],
  normalizedScopePrefix: string | undefined,
): SearchUnavailableSignal[] {
  const signals: SearchUnavailableSignal[] = [];

  for (const boundary of corpus.boundaries) {
    if (
      !boundaryMatchesSearchLexical(
        boundary.relativePath,
        normalizedTerms,
        normalizedScopePrefix,
      )
    ) {
      continue;
    }
    if (boundary.kind === "DENIED") {
      signals.push({
        kind: "DENIED_BOUNDARY_MATCH",
        relativePath: boundary.relativePath,
      });
    } else {
      signals.push({
        kind: "SYSTEM_PRUNED_BOUNDARY_MATCH",
        relativePath: boundary.relativePath,
        reason: boundary.reason,
      });
    }
  }

  signals.sort((a, b) => {
    const keyA = JSON.stringify(a);
    const keyB = JSON.stringify(b);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
  return signals;
}

type RankedCandidate = RepositoryCandidateData & {
  readonly basenameStemExactCount: number;
  readonly pathComponentExactCount: number;
};

function compareCandidates(a: RankedCandidate, b: RankedCandidate): number {
  if (a.relevanceScore !== b.relevanceScore) {
    return b.relevanceScore - a.relevanceScore;
  }
  if (a.basenameStemExactCount !== b.basenameStemExactCount) {
    return b.basenameStemExactCount - a.basenameStemExactCount;
  }
  if (a.pathComponentExactCount !== b.pathComponentExactCount) {
    return b.pathComponentExactCount - a.pathComponentExactCount;
  }
  if (a.lexicalDepth !== b.lexicalDepth) {
    return a.lexicalDepth - b.lexicalDepth;
  }
  if (a.relativePath.length !== b.relativePath.length) {
    return a.relativePath.length - b.relativePath.length;
  }
  return LOCALE_INDEPENDENT_NAME_COMPARE(a.relativePath, b.relativePath);
}

/**
 * Search an earned corpus and return bounded, deterministic candidates.
 */
export function searchRepository(
  corpus: RepositorySearchCorpus,
  input: SearchQueryInput,
  options?: SearchOptions,
): Result<RepositorySearchResult, SearchFailure> {
  const queryResult = validateSearchQuery(input);
  if (!queryResult.ok) {
    return queryResult;
  }

  const optionsResult = validateSearchOptions(options);
  if (!optionsResult.ok) {
    return optionsResult;
  }

  const query = queryResult.value;
  const maxResults = optionsResult.value;

  const unavailableSignals = collectUnavailableSignals(
    corpus,
    query.normalizedTerms,
    query.normalizedScopePrefix,
  );

  const ranked: RankedCandidate[] = [];

  for (const entry of corpus.admittedEntries) {
    const evaluation = scoreCandidate(query, entry);
    if (!evaluation.matches) {
      continue;
    }

    const mapEntry = corpus.mapEntriesByEntry.get(entry);
    ranked.push({
      entry,
      relevanceScore: evaluation.relevanceScore,
      matchReasons: evaluation.matchReasons,
      relativePath: entry.relativePath,
      lexicalDepth: lexicalDepth(entry.relativePath),
      lexicalKind: entry.lexicalKind,
      basenameStemExactCount: evaluation.basenameStemExactCount,
      pathComponentExactCount: evaluation.pathComponentExactCount,
      ...(mapEntry === undefined ? {} : { mapEntry }),
    });
  }

  ranked.sort(compareCandidates);

  const observedMatchCount = ranked.length;
  const truncated = observedMatchCount > maxResults;
  const selected = ranked.slice(0, maxResults).map((candidate) =>
    brandRepositoryCandidate({
      entry: candidate.entry,
      relevanceScore: candidate.relevanceScore,
      matchReasons: candidate.matchReasons,
      relativePath: candidate.relativePath,
      lexicalDepth: candidate.lexicalDepth,
      lexicalKind: candidate.lexicalKind,
      ...(candidate.mapEntry === undefined ? {} : { mapEntry: candidate.mapEntry }),
    }),
  );

  return success(
    brandRepositorySearchResult({
      query,
      candidates: selected,
      observedMatchCount,
      sourceCompletion: {
        inventoryTraversalCompletion: corpus.inventoryTraversalCompletion,
        metadataCompletion: corpus.metadataCompletion,
      },
      selectionCompletion: truncated
        ? { kind: "PARTIAL_RESULT_LIMIT" }
        : { kind: "COMPLETE" },
      unavailableSignals,
      limitations: collectSourceLimitations(corpus),
    }),
  );
}
