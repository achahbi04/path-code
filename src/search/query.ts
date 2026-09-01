/**
 * Search query validation and normalization.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  MAX_SEARCH_BASENAME_BYTES,
  MAX_SEARCH_EXTENSIONS,
  MAX_SEARCH_EXTENSION_BYTES,
  MAX_SEARCH_QUERY_BYTES,
  MAX_SEARCH_SCOPE_PREFIX_BYTES,
  MAX_SEARCH_TERM_BYTES,
  MAX_SEARCH_TERMS,
} from "./constants.js";
import { searchFailure, type SearchFailure } from "./failure.js";
import {
  containsNulByte,
  isAbsoluteWorkspaceRelativePath,
  normalizeSearchText,
  scopePrefixHasParentEscape,
  utf8ByteLength,
} from "./normalize.js";
import type { SearchQuery, SearchQueryInput } from "./types.js";

function brandSearchQuery(data: SearchQueryInput & {
  terms: readonly string[];
  normalizedTerms: readonly string[];
  normalizedExactBasename?: string;
  normalizedExtensions?: readonly string[];
  normalizedScopePrefix?: string;
}): SearchQuery {
  return data as SearchQuery;
}

function deduplicateNormalizedTerms(terms: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const term of terms) {
    const normalized = normalizeSearchText(term.trim());
    if (normalized.length === 0) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function hasEffectiveCriterion(input: SearchQueryInput): boolean {
  if (input.exactBasename !== undefined && input.exactBasename.trim().length > 0) {
    return true;
  }
  if (input.scopePrefix !== undefined && input.scopePrefix.trim().length > 0) {
    return true;
  }
  if (input.entryKinds !== undefined && input.entryKinds.length > 0) {
    return true;
  }
  if (input.extensions !== undefined && input.extensions.length > 0) {
    return true;
  }
  if (input.terms !== undefined && input.terms.some((term) => term.trim().length > 0)) {
    return true;
  }
  return false;
}

function validateTerms(
  terms: readonly string[] | undefined,
): Result<readonly string[], SearchFailure> {
  if (terms === undefined) {
    return success([]);
  }
  if (terms.length > MAX_SEARCH_TERMS) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_QUERY",
        "Search query contains too many terms",
        { maxTerms: MAX_SEARCH_TERMS },
      ),
    );
  }

  const normalizedTerms: string[] = [];
  for (const rawTerm of terms) {
    if (containsNulByte(rawTerm)) {
      return failure(
        searchFailure("INVALID_SEARCH_QUERY", "Search term contains a NUL byte"),
      );
    }
    const trimmed = rawTerm.trim();
    if (trimmed.length === 0) {
      return failure(
        searchFailure("INVALID_SEARCH_QUERY", "Search term is empty after trimming"),
      );
    }
    if (utf8ByteLength(trimmed) > MAX_SEARCH_TERM_BYTES) {
      return failure(
        searchFailure(
          "INVALID_SEARCH_QUERY",
          "Search term exceeds the per-term byte bound",
          { maxTermBytes: MAX_SEARCH_TERM_BYTES },
        ),
      );
    }
    normalizedTerms.push(normalizeSearchText(trimmed));
  }

  const deduped = deduplicateNormalizedTerms(terms);
  let aggregateBytes = 0;
  for (const term of deduped) {
    aggregateBytes += utf8ByteLength(term);
  }
  if (aggregateBytes > MAX_SEARCH_QUERY_BYTES) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_QUERY",
        "Normalized search terms exceed the aggregate byte bound",
        { maxQueryBytes: MAX_SEARCH_QUERY_BYTES },
      ),
    );
  }

  return success(deduped);
}

function validateExactBasename(
  exactBasename: string | undefined,
): Result<
  { exactBasename?: string; normalizedExactBasename?: string },
  SearchFailure
> {
  if (exactBasename === undefined) {
    return success({});
  }
  if (containsNulByte(exactBasename)) {
    return failure(
      searchFailure("INVALID_SEARCH_QUERY", "exactBasename contains a NUL byte"),
    );
  }
  const trimmed = exactBasename.trim();
  if (trimmed.length === 0) {
    return failure(
      searchFailure("INVALID_SEARCH_QUERY", "exactBasename is empty after trimming"),
    );
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_QUERY",
        "exactBasename must not contain path separators",
      ),
    );
  }
  if (utf8ByteLength(trimmed) > MAX_SEARCH_BASENAME_BYTES) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_QUERY",
        "exactBasename exceeds the byte bound",
        { maxBasenameBytes: MAX_SEARCH_BASENAME_BYTES },
      ),
    );
  }
  return success({
    exactBasename: trimmed,
    normalizedExactBasename: normalizeSearchText(trimmed),
  });
}

function validateExtensions(
  extensions: readonly string[] | undefined,
): Result<
  { extensions?: readonly string[]; normalizedExtensions?: readonly string[] },
  SearchFailure
> {
  if (extensions === undefined) {
    return success({});
  }
  if (extensions.length > MAX_SEARCH_EXTENSIONS) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_QUERY",
        "Search query contains too many extensions",
        { maxExtensions: MAX_SEARCH_EXTENSIONS },
      ),
    );
  }

  const normalized: string[] = [];
  for (const extension of extensions) {
    if (containsNulByte(extension)) {
      return failure(
        searchFailure("INVALID_SEARCH_QUERY", "Extension contains a NUL byte"),
      );
    }
    if (!extension.startsWith(".")) {
      return failure(
        searchFailure(
          "INVALID_SEARCH_QUERY",
          "Extension filter must start with a leading dot",
        ),
      );
    }
    if (extension.includes("/") || extension.includes("\\")) {
      return failure(
        searchFailure(
          "INVALID_SEARCH_QUERY",
          "Extension filter must not contain path separators",
        ),
      );
    }
    if (utf8ByteLength(extension) > MAX_SEARCH_EXTENSION_BYTES) {
      return failure(
        searchFailure(
          "INVALID_SEARCH_QUERY",
          "Extension exceeds the byte bound",
          { maxExtensionBytes: MAX_SEARCH_EXTENSION_BYTES },
        ),
      );
    }
    normalized.push(normalizeSearchText(extension));
  }

  return success({
    extensions,
    normalizedExtensions: normalized,
  });
}

function validateScopePrefix(
  scopePrefix: string | undefined,
): Result<
  { scopePrefix?: string; normalizedScopePrefix?: string },
  SearchFailure
> {
  if (scopePrefix === undefined) {
    return success({});
  }
  if (containsNulByte(scopePrefix)) {
    return failure(
      searchFailure("INVALID_SEARCH_QUERY", "scopePrefix contains a NUL byte"),
    );
  }
  const trimmed = scopePrefix.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) {
    return failure(
      searchFailure("INVALID_SEARCH_QUERY", "scopePrefix is empty after trimming"),
    );
  }
  if (isAbsoluteWorkspaceRelativePath(trimmed)) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_QUERY",
        "scopePrefix must be workspace-relative, not absolute",
      ),
    );
  }
  if (scopePrefixHasParentEscape(trimmed)) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_QUERY",
        "scopePrefix must not contain parent-directory escapes",
      ),
    );
  }
  if (utf8ByteLength(trimmed) > MAX_SEARCH_SCOPE_PREFIX_BYTES) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_QUERY",
        "scopePrefix exceeds the byte bound",
        { maxScopePrefixBytes: MAX_SEARCH_SCOPE_PREFIX_BYTES },
      ),
    );
  }
  return success({
    scopePrefix: trimmed,
    normalizedScopePrefix: normalizeSearchText(trimmed),
  });
}

/**
 * Validate caller search input into an earned SearchQuery.
 */
export function validateSearchQuery(
  input: SearchQueryInput,
): Result<SearchQuery, SearchFailure> {
  if (!hasEffectiveCriterion(input)) {
    return failure(
      searchFailure(
        "INVALID_SEARCH_QUERY",
        "Search query must include at least one effective criterion",
      ),
    );
  }

  const termsResult = validateTerms(input.terms);
  if (!termsResult.ok) {
    return termsResult;
  }

  const basenameResult = validateExactBasename(input.exactBasename);
  if (!basenameResult.ok) {
    return basenameResult;
  }

  const extensionsResult = validateExtensions(input.extensions);
  if (!extensionsResult.ok) {
    return extensionsResult;
  }

  const scopeResult = validateScopePrefix(input.scopePrefix);
  if (!scopeResult.ok) {
    return scopeResult;
  }

  const rawTerms = input.terms ?? [];
  const query = brandSearchQuery({
    terms: rawTerms,
    normalizedTerms: termsResult.value,
    ...(input.exactBasename === undefined
      ? {}
      : { exactBasename: basenameResult.value.exactBasename }),
    ...(basenameResult.value.normalizedExactBasename === undefined
      ? {}
      : { normalizedExactBasename: basenameResult.value.normalizedExactBasename }),
    ...(extensionsResult.value.extensions === undefined
      ? {}
      : { extensions: extensionsResult.value.extensions }),
    ...(extensionsResult.value.normalizedExtensions === undefined
      ? {}
      : { normalizedExtensions: extensionsResult.value.normalizedExtensions }),
    ...(scopeResult.value.scopePrefix === undefined
      ? {}
      : { scopePrefix: scopeResult.value.scopePrefix }),
    ...(scopeResult.value.normalizedScopePrefix === undefined
      ? {}
      : { normalizedScopePrefix: scopeResult.value.normalizedScopePrefix }),
    ...(input.entryKinds === undefined ? {} : { entryKinds: input.entryKinds }),
  });

  return success(query);
}

/**
 * Split bounded literal text into lexical search terms without semantic inference.
 */
export function searchTermsFromText(text: string): readonly string[] {
  if (containsNulByte(text)) {
    return [];
  }
  const parts = text.trim().split(/\s+/).filter((part) => part.length > 0);
  return parts.slice(0, MAX_SEARCH_TERMS);
}
