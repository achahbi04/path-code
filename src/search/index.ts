/**
 * Phase 2E search and candidate retrieval.
 * Side-effect free on import. Search does not read.
 */

export {
  buildRepositorySearchCorpus,
} from "./corpus.js";
export {
  searchRepository,
} from "./engine.js";
export {
  MAX_SEARCH_RESULTS,
  MAX_SEARCH_TERMS,
  MAX_SEARCH_TERM_BYTES,
  MAX_SEARCH_QUERY_BYTES,
  MAX_SEARCH_EXTENSIONS,
  MAX_SEARCH_EXTENSION_BYTES,
  MAX_SEARCH_BASENAME_BYTES,
  MAX_SEARCH_SCOPE_PREFIX_BYTES,
  EXACT_BASENAME_SCORE_BONUS,
  MATCH_STRENGTH,
} from "./constants.js";
export {
  searchTermsFromText,
  validateSearchQuery,
} from "./query.js";
export { evaluateTermMatch, scoreCandidate } from "./score.js";
export type {
  CandidateMatchReason,
  RepositoryCandidate,
  RepositoryCandidateData,
  RepositorySearchCorpus,
  RepositorySearchCorpusData,
  RepositorySearchResult,
  RepositorySearchResultData,
  SearchLimitation,
  SearchOptions,
  SearchQuery,
  SearchQueryInput,
  SearchSelectionCompletion,
  SearchSourceCompletion,
  SearchUnavailableSignal,
  SearchFailure,
  SearchFailureCode,
} from "./types.js";
