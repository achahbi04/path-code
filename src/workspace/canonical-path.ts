/**
 * Private CanonicalPath branding and physical resolution helpers.
 * Brand application is NOT part of the public Path Code API.
 */

import { realpath } from "node:fs/promises";

import type { CanonicalPath } from "../domain/workspace.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspacePathFailure } from "../domain/workspace.js";
import { workspacePathFailure } from "./failure.js";

/**
 * Apply the CanonicalPath brand to a verified physical path.
 * Must remain module-private — never re-export from the public package surface.
 */
export function brandCanonicalPath(physicalPath: string): CanonicalPath {
  return physicalPath as CanonicalPath;
}

type NodeErrnoException = Error & {
  readonly code?: string;
};

function isNodeErrnoException(error: unknown): error is NodeErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

/**
 * Map host filesystem errors to WorkspacePathFailure without exposing raw Errors.
 */
export function mapFilesystemError(error: unknown): WorkspacePathFailure {
  if (isNodeErrnoException(error)) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return workspacePathFailure("PATH_NOT_FOUND", "Path does not exist", {
        fsCode: code,
      });
    }
    return workspacePathFailure(
      "CANONICALIZATION_FAILED",
      "Filesystem canonicalization failed",
      code === undefined ? undefined : { fsCode: code },
    );
  }

  return workspacePathFailure(
    "CANONICALIZATION_FAILED",
    "Filesystem canonicalization failed",
  );
}

/**
 * Physically resolve an existing path. Does not brand or check containment.
 */
export async function physicalRealpath(
  target: string,
): Promise<Result<string, WorkspacePathFailure>> {
  try {
    const resolved = await realpath(target);
    return success(resolved);
  } catch (error: unknown) {
    return failure(mapFilesystemError(error));
  }
}
