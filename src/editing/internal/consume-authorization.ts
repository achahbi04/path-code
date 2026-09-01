/**
 * Internal one-shot authorization handoff — performs no project I/O.
 */

import type { Result } from "../../domain/result.js";
import { failure, success } from "../../domain/result.js";
import type {
  AuthorizationFailure,
  EditAuthorization,
  EditCommitGrant,
  PreparedChange,
} from "../types.js";
import {
  lookupAuthorizationEntry,
  markAuthorizationConsumed,
} from "./registry.js";

function authorizationFailure(
  code: AuthorizationFailure["code"],
  message: string,
): AuthorizationFailure {
  return { code, message };
}

function editCommitGrant(
  authorization: EditAuthorization,
  preparedRef: PreparedChange,
): EditCommitGrant {
  return Object.freeze({
    authorization,
    preparedRef,
  }) as unknown as EditCommitGrant;
}

export function consumeEditAuthorization(
  authorization: EditAuthorization,
  prepared: PreparedChange,
): Result<EditCommitGrant, AuthorizationFailure> {
  const entry = lookupAuthorizationEntry(authorization);
  if (entry === undefined) {
    return failure(
      authorizationFailure(
        "AUTHORIZATION_NOT_REGISTERED",
        "EditAuthorization is not registered or was reconstructed",
      ),
    );
  }
  if (entry.consumed) {
    return failure(
      authorizationFailure(
        "AUTHORIZATION_ALREADY_CONSUMED",
        "EditAuthorization has already been consumed",
      ),
    );
  }
  if (entry.preparedRef !== prepared) {
    return failure(
      authorizationFailure(
        "PREPARED_IDENTITY_MISMATCH",
        "EditAuthorization is not bound to this prepared object identity",
      ),
    );
  }
  if (authorization.preparedRef !== prepared) {
    return failure(
      authorizationFailure(
        "PREPARED_IDENTITY_MISMATCH",
        "Authorization token is not bound to this prepared object identity",
      ),
    );
  }

  markAuthorizationConsumed(authorization);
  return success(editCommitGrant(authorization, prepared));
}
