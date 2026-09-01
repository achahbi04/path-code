/**
 * Deterministic lexical relevance scoring for Phase 2E search.
 */

import { EXACT_BASENAME_SCORE_BONUS, MATCH_STRENGTH } from "./constants.js";
import {
  basename,
  basenameStem,
  fileExtension,
  normalizeSearchText,
  splitPathComponents,
} from "./normalize.js";
import type { CandidateMatchReason } from "./types.js";
import type { SearchQuery } from "./types.js";
import type { RepositoryEntry } from "../inventory/types.js";

export type TermMatchEvaluation = {
  readonly strength: number;
  readonly reasons: readonly CandidateMatchReason[];
  readonly basenameStemExactCount: number;
  readonly pathComponentExactCount: number;
};

export function evaluateTermMatch(
  term: string,
  relativePath: string,
): TermMatchEvaluation {
  const normalizedPath = normalizeSearchText(relativePath);
  const pathComponents = splitPathComponents(normalizedPath);
  const normalizedBasename = basename(normalizedPath);
  const normalizedStem = basenameStem(normalizedPath);
  const reasons: CandidateMatchReason[] = [];

  if (normalizedStem === term) {
    reasons.push({ kind: "BASENAME_TOKEN_MATCH", term });
    return {
      strength: MATCH_STRENGTH.BASENAME_STEM_EXACT,
      reasons,
      basenameStemExactCount: 1,
      pathComponentExactCount: 0,
    };
  }

  const exactComponent = pathComponents.find((component) => component === term);
  if (exactComponent !== undefined) {
    reasons.push({
      kind: "PATH_COMPONENT_MATCH",
      term,
      component: exactComponent,
    });
    return {
      strength: MATCH_STRENGTH.PATH_COMPONENT_EXACT,
      reasons,
      basenameStemExactCount: 0,
      pathComponentExactCount: 1,
    };
  }

  if (normalizedBasename.includes(term)) {
    reasons.push({ kind: "BASENAME_TOKEN_MATCH", term });
    return {
      strength: MATCH_STRENGTH.BASENAME_SUBSTRING,
      reasons,
      basenameStemExactCount: 0,
      pathComponentExactCount: 0,
    };
  }

  if (normalizedPath.includes(term)) {
    reasons.push({ kind: "PATH_SUBSTRING_MATCH", term });
    return {
      strength: MATCH_STRENGTH.PATH_SUBSTRING,
      reasons,
      basenameStemExactCount: 0,
      pathComponentExactCount: 0,
    };
  }

  return {
    strength: MATCH_STRENGTH.NO_MATCH,
    reasons: [],
    basenameStemExactCount: 0,
    pathComponentExactCount: 0,
  };
}

export type CandidateScoreEvaluation = {
  readonly relevanceScore: number;
  readonly matchReasons: readonly CandidateMatchReason[];
  readonly basenameStemExactCount: number;
  readonly pathComponentExactCount: number;
  readonly matches: boolean;
};

export function scoreCandidate(
  query: SearchQuery,
  entry: RepositoryEntry,
): CandidateScoreEvaluation {
  const relativePath = entry.relativePath;
  const normalizedBasename = normalizeSearchText(basename(relativePath));
  const matchReasons: CandidateMatchReason[] = [];
  let relevanceScore = 0;
  let basenameStemExactCount = 0;
  let pathComponentExactCount = 0;

  if (query.normalizedExactBasename !== undefined) {
    if (normalizedBasename !== query.normalizedExactBasename) {
      return {
        relevanceScore: 0,
        matchReasons: [],
        basenameStemExactCount: 0,
        pathComponentExactCount: 0,
        matches: false,
      };
    }
    matchReasons.push({
      kind: "EXACT_BASENAME_MATCH",
      basename: basename(relativePath),
    });
    relevanceScore += EXACT_BASENAME_SCORE_BONUS;
  }

  if (query.normalizedExtensions !== undefined) {
    const entryExtension = normalizeSearchText(fileExtension(relativePath));
    const extensionMatched = query.normalizedExtensions.some(
      (extension) => entryExtension === extension,
    );
    if (!extensionMatched) {
      return {
        relevanceScore: 0,
        matchReasons: [],
        basenameStemExactCount: 0,
        pathComponentExactCount: 0,
        matches: false,
      };
    }
    for (const extension of query.normalizedExtensions) {
      if (entryExtension === extension) {
        matchReasons.push({ kind: "EXTENSION_FILTER_MATCH", extension });
      }
    }
  }

  if (query.normalizedScopePrefix !== undefined) {
    const normalizedPath = normalizeSearchText(relativePath);
    const pathComponents = splitPathComponents(normalizedPath);
    const prefixComponents = splitPathComponents(query.normalizedScopePrefix);
    const prefixMatched =
      normalizedPath === query.normalizedScopePrefix ||
      (prefixComponents.length > 0 &&
        pathComponents.length >= prefixComponents.length &&
        prefixComponents.every(
          (component, index) => pathComponents[index] === component,
        ));
    if (!prefixMatched) {
      return {
        relevanceScore: 0,
        matchReasons: [],
        basenameStemExactCount: 0,
        pathComponentExactCount: 0,
        matches: false,
      };
    }
    matchReasons.push({
      kind: "SCOPE_PREFIX_MATCH",
      scopePrefix: query.scopePrefix ?? query.normalizedScopePrefix,
    });
  }

  if (query.entryKinds !== undefined && query.entryKinds.length > 0) {
    if (!query.entryKinds.includes(entry.lexicalKind)) {
      return {
        relevanceScore: 0,
        matchReasons: [],
        basenameStemExactCount: 0,
        pathComponentExactCount: 0,
        matches: false,
      };
    }
  }

  for (const term of query.normalizedTerms) {
    const evaluation = evaluateTermMatch(term, relativePath);
    if (evaluation.strength === MATCH_STRENGTH.NO_MATCH) {
      return {
        relevanceScore: 0,
        matchReasons: [],
        basenameStemExactCount: 0,
        pathComponentExactCount: 0,
        matches: false,
      };
    }
    relevanceScore += evaluation.strength;
    basenameStemExactCount += evaluation.basenameStemExactCount;
    pathComponentExactCount += evaluation.pathComponentExactCount;
    matchReasons.push(...evaluation.reasons);
  }

  return {
    relevanceScore,
    matchReasons,
    basenameStemExactCount,
    pathComponentExactCount,
    matches: true,
  };
}
