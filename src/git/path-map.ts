/**
 * Pure lexical mapping between Git-root-relative and workspace-relative paths.
 * Performs no filesystem admission and creates no CanonicalPath.
 */

import path from "node:path";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  gitBaselineFailure,
  type GitBaselineFailure,
} from "./baseline-failure.js";

function splitComponents(relativePath: string): readonly string[] {
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  if (normalized === "." || normalized === "") {
    return [];
  }
  return normalized.split("/").filter((segment) => segment.length > 0);
}

/**
 * Validate a Git-root-relative path and reject absolute / escaping forms.
 */
export function validateGitRelativePath(
  gitRelativePath: string,
): Result<string, GitBaselineFailure> {
  if (gitRelativePath.length === 0) {
    return failure(
      gitBaselineFailure("GIT_PATH_INVALID", "Git path record was empty"),
    );
  }
  if (gitRelativePath.includes("\0")) {
    return failure(
      gitBaselineFailure("GIT_PATH_INVALID", "Git path contained a null byte"),
    );
  }
  if (path.posix.isAbsolute(gitRelativePath) || path.win32.isAbsolute(gitRelativePath)) {
    return failure(
      gitBaselineFailure(
        "GIT_PATH_INVALID",
        "Git path record was absolute",
      ),
    );
  }
  if (/^[A-Za-z]:/.test(gitRelativePath)) {
    return failure(
      gitBaselineFailure(
        "GIT_PATH_INVALID",
        "Git path record used a drive letter",
      ),
    );
  }

  const components = splitComponents(gitRelativePath);
  if (components.some((segment) => segment === "..")) {
    return failure(
      gitBaselineFailure(
        "GIT_PATH_INVALID",
        "Git path record escaped the repository root",
      ),
    );
  }

  return success(components.join("/"));
}

/**
 * Map a Git-root-relative path into a workspace-relative path given the
 * workspace-relative location of the Git root ("" when roots coincide).
 */
export function gitPathToWorkspaceRelative(
  gitRelativePath: string,
  gitRootWorkspaceRelative: string,
): Result<string, GitBaselineFailure> {
  const validated = validateGitRelativePath(gitRelativePath);
  if (!validated.ok) {
    return validated;
  }

  const rootComponents = splitComponents(gitRootWorkspaceRelative);
  if (rootComponents.some((segment) => segment === "..")) {
    return failure(
      gitBaselineFailure(
        "GIT_PATH_INVALID",
        "Git root workspace-relative mapping was invalid",
      ),
    );
  }

  const combined = [...rootComponents, ...splitComponents(validated.value)];
  return success(combined.length === 0 ? "." : combined.join("/"));
}

/**
 * Map a workspace-relative path into a Git-root-relative path, or null when
 * the path is outside the Git worktree.
 */
export function workspacePathToGitRelative(
  workspaceRelativePath: string,
  gitRootWorkspaceRelative: string,
): string | null {
  const pathComponents = splitComponents(workspaceRelativePath);
  const rootComponents = splitComponents(gitRootWorkspaceRelative);

  if (rootComponents.length === 0) {
    return pathComponents.join("/");
  }

  if (pathComponents.length < rootComponents.length) {
    return null;
  }

  for (let index = 0; index < rootComponents.length; index += 1) {
    if (pathComponents[index] !== rootComponents[index]) {
      return null;
    }
  }

  return pathComponents.slice(rootComponents.length).join("/");
}

export function componentsMatchPrefix(
  candidate: readonly string[],
  boundary: readonly string[],
): boolean {
  if (boundary.length === 0 || candidate.length < boundary.length) {
    return false;
  }
  for (let index = 0; index < boundary.length; index += 1) {
    if (candidate[index] !== boundary[index]) {
      return false;
    }
  }
  return true;
}

export { splitComponents };
