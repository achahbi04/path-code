/**
 * Reader failure vocabulary — trust-boundary / option / restriction failures
 * that prevent a RepositoryReadOutcome from being produced.
 */

import type { JsonObject } from "../domain/json.js";

export type ReaderFailureCode =
  | "INVALID_READER_OPTIONS"
  | "DENIAL_ROOT_RESOLUTION_FAILED";

export type ReaderFailure = {
  readonly code: ReaderFailureCode;
  readonly message: string;
  readonly details?: JsonObject;
};

export function readerFailure(
  code: ReaderFailureCode,
  message: string,
  details?: JsonObject,
): ReaderFailure {
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}
