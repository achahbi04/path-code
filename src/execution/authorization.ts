/**
 * Explicit local-process authorization — binds exact prepared object identity.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  nextAuthorizationId,
  registerAuthorization,
} from "./internal/registry.js";
import { isLocalProcessPlatformSupported } from "./preparation.js";
import { isExecuteProcessDisabled } from "./policy.js";
import type {
  ExplicitLocalProcessApproval,
  LocalProcessAuthorization,
  LocalProcessAuthorizationFailure,
  PreparedLocalProcess,
} from "./types.js";

export function explicitLocalProcessApproval(): ExplicitLocalProcessApproval {
  return Object.freeze({ kind: "EXPLICIT_LOCAL_PROCESS_APPROVAL" });
}

function authFailure(
  code: LocalProcessAuthorizationFailure["code"],
  message: string,
): LocalProcessAuthorizationFailure {
  return { code, message };
}

function issueAuthorization(
  prepared: PreparedLocalProcess,
): LocalProcessAuthorization {
  const authorization = Object.freeze({
    authorizationId: nextAuthorizationId(),
    preparedRef: prepared,
    issuedAtMs: Date.now(),
  });
  const branded = authorization as unknown as LocalProcessAuthorization;
  registerAuthorization(branded, prepared);
  return branded;
}

export async function authorizePreparedLocalProcess(
  prepared: PreparedLocalProcess,
  explicitApproval: ExplicitLocalProcessApproval,
  resolvedConfig: ResolvedProjectConfig,
): Promise<Result<LocalProcessAuthorization, LocalProcessAuthorizationFailure>> {
  if (!isLocalProcessPlatformSupported()) {
    return failure(
      authFailure(
        "UNSUPPORTED_EXECUTION_PLATFORM",
        "Local process execution V1 supports macOS and Linux only",
      ),
    );
  }

  if (
    explicitApproval === null ||
    typeof explicitApproval !== "object" ||
    explicitApproval.kind !== "EXPLICIT_LOCAL_PROCESS_APPROVAL"
  ) {
    return failure(
      authFailure(
        "APPROVAL_REQUIRED",
        "Explicit local-process approval is required for authorization",
      ),
    );
  }

  if (prepared.config !== resolvedConfig) {
    return failure(
      authFailure(
        "PREPARED_IDENTITY_MISMATCH",
        "ResolvedProjectConfig must match the configuration captured at preparation",
      ),
    );
  }

  if (isExecuteProcessDisabled(resolvedConfig)) {
    return failure(
      authFailure(
        "ACTION_DISABLED",
        "EXECUTE_PROCESS is disabled by project configuration",
      ),
    );
  }

  return success(issueAuthorization(prepared));
}
