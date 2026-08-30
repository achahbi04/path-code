/**
 * WorkspaceBoundary runtime implementation.
 *
 * RAW PATH → validate → resolve vs workspace root → realpath → containment → brand
 */

import path from "node:path";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type {
  CanonicalPath,
  WorkspaceBoundary,
  WorkspacePathFailure,
} from "../domain/workspace.js";
import {
  brandCanonicalPath,
  physicalRealpath,
} from "./canonical-path.js";
import { workspacePathFailure } from "./failure.js";
import { isInsideRoot } from "./path-semantics.js";

/**
 * Validate raw path input at the Path Code trust boundary.
 * Rejects empty, whitespace-only, and null-byte inputs deliberately.
 */
export function validatePathInput(
  input: string,
): Result<string, WorkspacePathFailure> {
  if (typeof input !== "string") {
    return failure(
      workspacePathFailure("INVALID_PATH_INPUT", "Path input must be a string"),
    );
  }

  if (input.length === 0 || input.trim().length === 0) {
    return failure(
      workspacePathFailure(
        "INVALID_PATH_INPUT",
        "Path input must not be empty or whitespace-only",
      ),
    );
  }

  if (input.includes("\0")) {
    return failure(
      workspacePathFailure(
        "INVALID_PATH_INPUT",
        "Path input must not contain a null byte",
      ),
    );
  }

  return success(input);
}

function createBoundary(canonicalRoot: CanonicalPath): WorkspaceBoundary {
  return {
    async canonicalize(
      inputPath: string,
    ): Promise<Result<CanonicalPath, WorkspacePathFailure>> {
      const validated = validatePathInput(inputPath);
      if (!validated.ok) {
        return validated;
      }

      // Relative inputs resolve against the canonical workspace root — never cwd.
      const lexicalTarget = path.isAbsolute(validated.value)
        ? validated.value
        : path.resolve(canonicalRoot, validated.value);

      const physical = await physicalRealpath(lexicalTarget);
      if (!physical.ok) {
        return physical;
      }

      if (!isInsideRoot(canonicalRoot, physical.value, path)) {
        return failure(
          workspacePathFailure(
            "PATH_OUTSIDE_WORKSPACE",
            "Physical path target is outside the workspace",
          ),
        );
      }

      return success(brandCanonicalPath(physical.value));
    },
  };
}

/**
 * Create a WorkspaceBoundary whose root has earned physical canonical identity.
 *
 * Relative rootInput is resolved with path.resolve for establishment only.
 * Subsequent canonicalize() calls never consult process.cwd().
 */
export async function createWorkspaceBoundary(
  rootInput: string,
): Promise<Result<WorkspaceBoundary, WorkspacePathFailure>> {
  const validated = validatePathInput(rootInput);
  if (!validated.ok) {
    return validated;
  }

  const lexicalRoot = path.isAbsolute(validated.value)
    ? validated.value
    : path.resolve(validated.value);

  const physical = await physicalRealpath(lexicalRoot);
  if (!physical.ok) {
    return physical;
  }

  const canonicalRoot = brandCanonicalPath(physical.value);
  return success(createBoundary(canonicalRoot));
}
