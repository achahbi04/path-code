/**
 * Metadata / repository-map failure vocabulary.
 */

import type { JsonObject } from "../domain/json.js";

export type MetadataFailureCode =
  | "INVALID_METADATA_OPTIONS"
  | "GIT_BASELINE_INCOMPATIBLE";

export type MetadataFailure = {
  readonly code: MetadataFailureCode;
  readonly message: string;
  readonly details?: JsonObject;
};

export function metadataFailure(
  code: MetadataFailureCode,
  message: string,
  details?: JsonObject,
): MetadataFailure {
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}
