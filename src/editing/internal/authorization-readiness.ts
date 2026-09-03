/**
 * Private non-consuming authorization readiness (Phase 3D preflight).
 * Not exported from the public editing barrel.
 */

import { lookupAuthorizationEntry } from "./registry.js";
import type { EditAuthorization, PreparedChange } from "../types.js";
import type { MultiFilePreflightReasonCode } from "../multi-file-types.js";

export type AuthorizationReadiness =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: MultiFilePreflightReasonCode;
    };

/**
 * Read-only registry inspection — issues nothing, consumes nothing.
 */
export function inspectAuthorizationReadiness(
  authorization: EditAuthorization,
  prepared: PreparedChange,
): AuthorizationReadiness {
  const entry = lookupAuthorizationEntry(authorization);
  if (entry === undefined) {
    return { ok: false, reason: "AUTHORIZATION_NOT_REGISTERED" };
  }
  if (entry.consumed) {
    return { ok: false, reason: "AUTHORIZATION_ALREADY_CONSUMED" };
  }
  if (entry.preparedRef !== prepared) {
    return { ok: false, reason: "PREPARED_IDENTITY_MISMATCH" };
  }
  if (authorization.action !== prepared.action) {
    return { ok: false, reason: "PREPARED_IDENTITY_MISMATCH" };
  }
  return { ok: true };
}
