/**
 * Configuration load failure vocabulary.
 *
 * ConfigFailure is a trust-boundary / input-validation failure — intentionally
 * distinct from FailureRecord (no engineering action diagnosis required).
 */

import type { JsonObject } from "../domain/json.js";

export type ConfigFailureCode =
  | "CONFIG_UNREADABLE"
  | "CONFIG_NOT_FILE"
  | "CONFIG_TOO_LARGE"
  | "CONFIG_INVALID_ENCODING"
  | "CONFIG_MALFORMED"
  | "CONFIG_AUTHORITY_INCREASE_REJECTED"
  | "CONFIG_PATH_REJECTED";

export type ConfigFailure = {
  readonly code: ConfigFailureCode;
  readonly message: string;
  readonly details?: JsonObject;
};

export function configFailure(
  code: ConfigFailureCode,
  message: string,
  details?: JsonObject,
): ConfigFailure {
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}
