/**
 * Canonical path identity and workspace boundary contracts.
 *
 * CanonicalPath is a type-level brand only.
 * Construction/canonicalization and containment enforcement belong to Phase 1C+.
 *
 * Containment itself is a pure path-semantics concern for Phase 1C
 * (e.g. isInsideRoot under path.posix / path.win32) and is intentionally
 * NOT part of WorkspaceBoundary.
 */

import type { JsonObject } from "./json.js";
import type { Result } from "./result.js";

/**
 * Branded path identity. Raw strings are not assignable without an intentional cast.
 * This is NOT a runtime security boundary.
 */
export type CanonicalPath = string & {
  readonly __brand: "CanonicalPath";
};

/**
 * Trust-boundary / validation rejection codes for workspace path admission.
 *
 * Deliberately separate from FailureRecord:
 * - WorkspacePathFailure = path validation at a trust boundary
 *   (malformed input, missing target, canonicalization failure, outside workspace)
 *   before an engineering action may have occurred.
 * - FailureRecord = failed engineering action, requiring evidence and diagnosis.
 *
 * Do not merge these layers into a generic error hierarchy.
 */
export type WorkspacePathFailureCode =
  | "INVALID_PATH_INPUT"
  | "PATH_NOT_FOUND"
  | "CANONICALIZATION_FAILED"
  | "PATH_OUTSIDE_WORKSPACE";

/**
 * Explicit structured failure for workspace path admission.
 * Not a FailureRecord — no action/evidence/diagnosis required to reject a path.
 */
export type WorkspacePathFailure = {
  readonly code: WorkspacePathFailureCode;
  readonly message: string;
  readonly details?: JsonObject;
};

/**
 * Authority-bearing workspace path admission surface.
 *
 * Declaration only in Phase 1B — no filesystem behavior here.
 *
 * canonicalize:
 * raw path → physical canonicalization → containment → CanonicalPath
 * or explicit WorkspacePathFailure.
 *
 * isInside / resolveSymlinkTarget are intentionally absent:
 * - containment is Phase 1C pure path semantics
 * - physical symlink resolution belongs inside canonicalize
 */
export interface WorkspaceBoundary {
  canonicalize(
    inputPath: string,
  ): Promise<Result<CanonicalPath, WorkspacePathFailure>>;
}
