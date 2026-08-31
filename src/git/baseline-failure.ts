/**
 * Git baseline failure vocabulary — distinct from discovery failures.
 * Public error text must not include raw path-bearing Git stdout/stderr.
 */

import type { JsonObject } from "../domain/json.js";

export type GitBaselineFailureCode =
  | "GIT_NOT_AVAILABLE"
  | "NOT_A_GIT_REPOSITORY"
  | "NOT_A_WORKTREE"
  | "GIT_ROOT_OUTSIDE_WORKSPACE"
  | "GIT_STATE_FAILED"
  | "GIT_OUTPUT_TOO_LARGE"
  | "GIT_TIMEOUT"
  | "GIT_STATUS_PARSE_FAILED"
  | "GIT_LS_FILES_PARSE_FAILED"
  | "GIT_IGNORE_PARSE_FAILED"
  | "GIT_DENIED_PATH_LEAK_DETECTED"
  | "GIT_PATH_INVALID"
  | "DENIAL_ROOT_RESOLUTION_FAILED";

export type GitBaselineFailure = {
  readonly code: GitBaselineFailureCode;
  readonly message: string;
  readonly details?: JsonObject;
};

export function gitBaselineFailure(
  code: GitBaselineFailureCode,
  message: string,
  details?: JsonObject,
): GitBaselineFailure {
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}
