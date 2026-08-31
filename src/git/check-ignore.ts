/**
 * Parse git check-ignore --stdin -z output.
 * Output: NUL-terminated paths that ARE ignored.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  gitBaselineFailure,
  type GitBaselineFailure,
} from "./baseline-failure.js";
import {
  assertGitPathVisible,
  type GitVisibilityScope,
} from "./visibility.js";

export function parseCheckIgnoreOutput(
  output: string,
  scope: GitVisibilityScope,
  requestedGitPaths: ReadonlySet<string>,
): Result<ReadonlySet<string>, GitBaselineFailure> {
  const ignored = new Set<string>();
  if (output.length === 0) {
    return success(ignored);
  }

  const parts = output.split("\0");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }

  for (const token of parts) {
    if (token.length === 0) {
      continue;
    }
    const visible = assertGitPathVisible(token, scope);
    if (!visible.ok) {
      return visible;
    }
    if (!requestedGitPaths.has(visible.value)) {
      return failure(
        gitBaselineFailure(
          "GIT_IGNORE_PARSE_FAILED",
          "check-ignore returned a path outside the requested admitted set",
        ),
      );
    }
    ignored.add(visible.value);
  }

  return success(ignored);
}
