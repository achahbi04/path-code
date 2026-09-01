/**
 * Snapshot / freshness failure vocabulary.
 */

import type { JsonObject } from "../domain/json.js";

export type SnapshotFailureCode =
  | "INVALID_VERIFICATION_OPTIONS"
  | "SNAPSHOT_ARTIFACTS_INCOMPATIBLE"
  | "ENTRY_NOT_IN_SNAPSHOT"
  | "VERIFICATION_FAILED";

export type SnapshotFailure = {
  readonly code: SnapshotFailureCode;
  readonly message: string;
  readonly details?: JsonObject;
};

export function snapshotFailure(
  code: SnapshotFailureCode,
  message: string,
  details?: JsonObject,
): SnapshotFailure {
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}
