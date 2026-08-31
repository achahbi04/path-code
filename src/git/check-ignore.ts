/**
 * Git-native ignore observation via fixed check-ignore capability.
 *
 * Transport: execFile + `git check-ignore --stdin -z` with bounded batches.
 * Git rejects `-z` without `--stdin`; pathnames are NUL-framed on stdin.
 * No spawn. No custom .gitignore parser.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  gitBaselineFailure,
  type GitBaselineFailure,
} from "./baseline-failure.js";
import {
  MAX_CHECK_IGNORE_ARGUMENT_BYTES,
  MAX_CHECK_IGNORE_PATHS_PER_BATCH,
} from "./constants.js";
import {
  runGitCheckIgnore,
  type GitRunSuccess,
} from "./runner.js";
import {
  assertGitPathVisible,
  type GitVisibilityScope,
} from "./visibility.js";

/**
 * Conservative UTF-8 stdin byte estimate for one check-ignore --stdin -z
 * pathname payload. Each pathname contributes UTF-8 length + one trailing NUL.
 */
export function estimateCheckIgnoreArgvBytes(
  paths: readonly string[],
): number {
  let total = 0;
  for (const pathName of paths) {
    total += Buffer.byteLength(pathName, "utf8") + 1;
  }
  return total;
}

function singlePathArgvBytes(pathName: string): number {
  return estimateCheckIgnoreArgvBytes([pathName]);
}

/**
 * Deterministically partition admitted pathname candidates into bounded
 * check-ignore batches. Preserves input order. Does not deduplicate.
 *
 * A single pathname that alone exceeds the stdin-byte ceiling fails explicitly.
 */
export function partitionCheckIgnoreBatches(
  candidates: readonly string[],
): Result<readonly (readonly string[])[], GitBaselineFailure> {
  const batches: string[][] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (current.length > 0) {
      batches.push(current);
      current = [];
    }
  };

  for (const pathName of candidates) {
    const alone = singlePathArgvBytes(pathName);
    if (alone > MAX_CHECK_IGNORE_ARGUMENT_BYTES) {
      return failure(
        gitBaselineFailure(
          "GIT_STATE_FAILED",
          "check-ignore pathname exceeds the fixed stdin byte ceiling",
        ),
      );
    }

    const nextCount = current.length + 1;
    const nextBytes = estimateCheckIgnoreArgvBytes([...current, pathName]);
    if (
      current.length > 0 &&
      (nextCount > MAX_CHECK_IGNORE_PATHS_PER_BATCH ||
        nextBytes > MAX_CHECK_IGNORE_ARGUMENT_BYTES)
    ) {
      flush();
    }

    current.push(pathName);
  }

  flush();
  return success(batches);
}

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

/**
 * Merge validated check-ignore batch results. Any batch failure fails closed.
 * Used by production observation and by tests with a substituted executor.
 */
export async function reduceCheckIgnoreBatches(
  batches: readonly (readonly string[])[],
  executeBatch: (
    paths: readonly string[],
  ) => Promise<Result<GitRunSuccess, GitBaselineFailure>>,
  scope: GitVisibilityScope,
  requestedGitPaths: ReadonlySet<string>,
): Promise<Result<ReadonlySet<string>, GitBaselineFailure>> {
  const ignored = new Set<string>();

  for (const batch of batches) {
    const result = await executeBatch(batch);
    if (!result.ok) {
      return result;
    }
    const parsed = parseCheckIgnoreOutput(
      result.value.stdout,
      scope,
      requestedGitPaths,
    );
    if (!parsed.ok) {
      return parsed;
    }
    for (const pathName of parsed.value) {
      ignored.add(pathName);
    }
  }

  return success(ignored);
}

/**
 * Observe Git ignore status for admitted, visibility-permitted pathnames.
 * Every candidate is queried exactly once across deterministic batches.
 */
export async function observeIgnoredPaths(
  cwd: string,
  candidates: readonly string[],
  scope: GitVisibilityScope,
): Promise<Result<ReadonlySet<string>, GitBaselineFailure>> {
  if (candidates.length === 0) {
    return success(new Set());
  }

  const batches = partitionCheckIgnoreBatches(candidates);
  if (!batches.ok) {
    return batches;
  }

  const requested = new Set(candidates);
  return reduceCheckIgnoreBatches(
    batches.value,
    (paths) => runGitCheckIgnore({ cwd, paths }),
    scope,
    requested,
  );
}
