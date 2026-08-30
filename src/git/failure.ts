/**
 * Git discovery failure vocabulary.
 * Capability-local — distinct from FailureRecord and WorkspacePathFailure.
 */

import type { JsonObject } from "../domain/json.js";

export type GitDiscoveryFailureCode =
  | "GIT_NOT_AVAILABLE"
  | "NOT_A_GIT_REPOSITORY"
  | "NOT_A_WORKTREE"
  | "GIT_ROOT_OUTSIDE_WORKSPACE"
  | "GIT_DISCOVERY_FAILED";

export type GitDiscoveryFailure = {
  readonly code: GitDiscoveryFailureCode;
  readonly message: string;
  readonly details?: JsonObject;
};

export function gitDiscoveryFailure(
  code: GitDiscoveryFailureCode,
  message: string,
  details?: JsonObject,
): GitDiscoveryFailure {
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}
