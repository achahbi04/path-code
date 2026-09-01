/**
 * Phase 3A explicit authorization — binds exact prepared object identity.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { ResolvedProjectConfig } from "../config/types.js";
import { refuseIfTargetDenied } from "./denial.js";
import { isTargetUnmergedInGitContext } from "./git-policy.js";
import { isMutationActionDisabledByConfig } from "./policy.js";
import {
  nextAuthorizationId,
  registerAuthorization,
} from "./internal/registry.js";
import type {
  AuthorizationFailure,
  AuthorizePreparedChangeOptions,
  EditAuthorization,
  ExplicitEditApproval,
  PreparedChange,
} from "./types.js";

export function explicitEditApproval(): ExplicitEditApproval {
  return Object.freeze({ kind: "EXPLICIT_EDIT_APPROVAL" });
}

function authorizationFailure(
  code: AuthorizationFailure["code"],
  message: string,
): AuthorizationFailure {
  return { code, message };
}

function targetRelativePath(prepared: PreparedChange): string {
  return prepared.action === "MODIFY_EXISTING_FILE"
    ? prepared.target.relativePath
    : prepared.targetRelativePath;
}

function targetEntry(prepared: PreparedChange) {
  return prepared.action === "MODIFY_EXISTING_FILE"
    ? prepared.target
    : prepared.parent;
}

function beforeFingerprint(
  prepared: PreparedChange,
): EditAuthorization["beforeFingerprint"] {
  return prepared.action === "MODIFY_EXISTING_FILE"
    ? prepared.beforeFingerprint
    : null;
}

function issueEditAuthorization(prepared: PreparedChange): EditAuthorization {
  const authorization = Object.freeze({
    authorizationId: nextAuthorizationId(),
    preparedRef: prepared,
    action: prepared.action,
    targetRelativePath: targetRelativePath(prepared),
    beforeFingerprint: beforeFingerprint(prepared),
    afterFingerprint: prepared.afterFingerprint,
    afterByteLength: prepared.afterByteLength,
    issuedAtMs: Date.now(),
  });
  const branded = authorization as unknown as EditAuthorization;
  registerAuthorization(branded, prepared);
  return branded;
}

export async function authorizePreparedChange(
  prepared: PreparedChange,
  explicitApproval: ExplicitEditApproval,
  resolvedConfig: ResolvedProjectConfig,
  options?: AuthorizePreparedChangeOptions,
): Promise<Result<EditAuthorization, AuthorizationFailure>> {
  if (explicitApproval.kind !== "EXPLICIT_EDIT_APPROVAL") {
    return failure(
      authorizationFailure(
        "APPROVAL_REQUIRED",
        "Explicit edit approval is required for authorization",
      ),
    );
  }

  if (prepared.config !== resolvedConfig) {
    return failure(
      authorizationFailure(
        "PREPARED_IDENTITY_MISMATCH",
        "ResolvedProjectConfig must match the configuration captured at preparation",
      ),
    );
  }

  if (isMutationActionDisabledByConfig(prepared.action, resolvedConfig)) {
    return failure(
      authorizationFailure(
        "ACTION_DISABLED",
        `${prepared.action} is disabled by project configuration`,
      ),
    );
  }

  const relativePath = targetRelativePath(prepared);
  const denied = await refuseIfTargetDenied(
    relativePath,
    prepared.workspace,
    resolvedConfig,
  );
  if (!denied.ok) {
    return failure({
      code: "TARGET_DENIED",
      message: denied.error.message,
    });
  }

  const gitContext = options?.gitContext;
  if (gitContext !== undefined) {
    const entry = targetEntry(prepared);
    if (isTargetUnmergedInGitContext(entry, relativePath, gitContext)) {
      return failure(
        authorizationFailure(
          "GIT_UNMERGED",
          "Target is unmerged/conflicted in supplied Git context",
        ),
      );
    }
  }

  return success(issueEditAuthorization(prepared));
}
