/**
 * Narrow read-only projection — non-consuming EditAuthorization readiness.
 * Does not mint, consume, or rewrite authorization registry entries.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { inspectAuthorizationReadiness } from "./internal/authorization-readiness.js";
import type {
  AuthorizationFailure,
  EditAuthorization,
  PreparedChange,
} from "./types.js";

export type PreparedEditAuthorizationCompatibility = {
  readonly unused: true;
  readonly preparedMatches: true;
};

/**
 * Authenticate that an already-issued EditAuthorization is registered,
 * unused, and bound to the exact prepared change. Consumes nothing.
 */
export function inspectPreparedEditAuthorizationCompatibility(
  authorization: EditAuthorization,
  prepared: PreparedChange,
): Result<PreparedEditAuthorizationCompatibility, AuthorizationFailure> {
  const readiness = inspectAuthorizationReadiness(authorization, prepared);
  if (!readiness.ok) {
    const code: AuthorizationFailure["code"] =
      readiness.reason === "AUTHORIZATION_NOT_REGISTERED" ||
      readiness.reason === "AUTHORIZATION_ALREADY_CONSUMED" ||
      readiness.reason === "PREPARED_IDENTITY_MISMATCH"
        ? readiness.reason
        : "PREPARED_IDENTITY_MISMATCH";
    return failure({
      code,
      message: `EditAuthorization is incompatible with prepared change (${readiness.reason})`,
    });
  }
  if (authorization.preparedRef !== prepared) {
    return failure({
      code: "PREPARED_IDENTITY_MISMATCH",
      message: "EditAuthorization.preparedRef does not match prepared object",
    });
  }
  return success({ unused: true, preparedMatches: true });
}
