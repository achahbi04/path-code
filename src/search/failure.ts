/**
 * Search failure vocabulary.
 */

import type { JsonObject } from "../domain/json.js";

export type SearchFailureCode =
  | "INVALID_SEARCH_QUERY"
  | "INVALID_SEARCH_OPTIONS"
  | "SEARCH_SOURCE_INCOMPATIBLE";

export type SearchFailure = {
  readonly code: SearchFailureCode;
  readonly message: string;
  readonly details?: JsonObject;
};

export function searchFailure(
  code: SearchFailureCode,
  message: string,
  details?: JsonObject,
): SearchFailure {
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}
