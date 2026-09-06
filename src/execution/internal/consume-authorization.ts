/**
 * Internal one-shot authorization handoff — performs no process I/O.
 */

import type { Result } from "../../domain/result.js";
import { failure, success } from "../../domain/result.js";
import type {
  LocalProcessAuthorization,
  LocalProcessAuthorizationFailure,
  LocalProcessCommitGrant,
  PreparedLocalProcess,
} from "../types.js";
import {
  lookupAuthorizationEntry,
  markAuthorizationConsumed,
} from "./registry.js";

function authFailure(
  code: LocalProcessAuthorizationFailure["code"],
  message: string,
): LocalProcessAuthorizationFailure {
  return { code, message };
}

function commitGrant(
  authorization: LocalProcessAuthorization,
  preparedRef: PreparedLocalProcess,
): LocalProcessCommitGrant {
  return Object.freeze({
    authorization,
    preparedRef,
  }) as unknown as LocalProcessCommitGrant;
}

export function consumeLocalProcessAuthorization(
  authorization: LocalProcessAuthorization,
  prepared: PreparedLocalProcess,
): Result<LocalProcessCommitGrant, LocalProcessAuthorizationFailure> {
  const entry = lookupAuthorizationEntry(authorization);
  if (entry === undefined) {
    return failure(
      authFailure(
        "AUTHORIZATION_NOT_REGISTERED",
        "LocalProcessAuthorization is not registered or was reconstructed",
      ),
    );
  }
  if (entry.consumed) {
    return failure(
      authFailure(
        "AUTHORIZATION_ALREADY_CONSUMED",
        "LocalProcessAuthorization has already been consumed",
      ),
    );
  }
  if (entry.preparedRef !== prepared) {
    return failure(
      authFailure(
        "PREPARED_IDENTITY_MISMATCH",
        "LocalProcessAuthorization is not bound to this prepared object identity",
      ),
    );
  }
  if (authorization.preparedRef !== prepared) {
    return failure(
      authFailure(
        "PREPARED_IDENTITY_MISMATCH",
        "Authorization token is not bound to this prepared object identity",
      ),
    );
  }

  markAuthorizationConsumed(authorization);
  return success(commitGrant(authorization, prepared));
}
