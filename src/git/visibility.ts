/**
 * Git visibility scoping against Phase 2A deny-path semantics.
 *
 * Command-level pathspec exclusion is data minimization only.
 * Parser-level denial checking is the authoritative security boundary.
 */

import path from "node:path";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { CanonicalPath } from "../domain/workspace.js";
import type { DenyPathPlan } from "../inventory/denial.js";
import { isLexicallyDenied } from "../inventory/denial.js";
import {
  gitBaselineFailure,
  type GitBaselineFailure,
} from "./baseline-failure.js";
import { GIT_PATHSPEC_UNSAFE_CHARS } from "./constants.js";
import {
  componentsMatchPrefix,
  gitPathToWorkspaceRelative,
  splitComponents,
  validateGitRelativePath,
} from "./path-map.js";
import type { CommandExclusionStatus } from "./types.js";

export type GitVisibilityScope = {
  readonly plan: DenyPathPlan;
  readonly gitRootWorkspaceRelative: string;
  /** Git-root-relative physical denial prefixes (component paths). */
  readonly physicalGitDenyPrefixes: readonly string[];
  readonly commandExclusionStatuses: readonly CommandExclusionStatus[];
  readonly pathspecExclusions: readonly string[];
};

function isPathspecExpressible(configuredPath: string): boolean {
  if (configuredPath.length === 0) {
    return false;
  }
  if (configuredPath.startsWith("-")) {
    return false;
  }
  if (GIT_PATHSPEC_UNSAFE_CHARS.test(configuredPath)) {
    return false;
  }
  if (configuredPath.includes(" ") || configuredPath.includes("\t")) {
    return false;
  }
  if (configuredPath.includes(":") || configuredPath.includes("\\")) {
    return false;
  }
  return true;
}

function physicalRootToGitRelative(
  physicalRoot: CanonicalPath,
  gitRoot: CanonicalPath,
): string | null {
  const relative = path.relative(gitRoot, physicalRoot);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  const normalized = relative.replace(/\\/g, "/");
  return normalized === "" ? "" : normalized;
}

export function buildGitVisibilityScope(
  plan: DenyPathPlan,
  gitRoot: CanonicalPath,
  gitRootWorkspaceRelative: string,
): GitVisibilityScope {
  const commandExclusionStatuses: CommandExclusionStatus[] = [];
  const pathspecExclusions: string[] = [];
  const physicalGitDenyPrefixes: string[] = [];

  for (const rule of plan.rules) {
    if (isPathspecExpressible(rule.configuredPath)) {
      commandExclusionStatuses.push({
        kind: "COMMAND_EXCLUSION_APPLIED",
        configuredPath: rule.configuredPath,
      });
      // Literal-ish pathspec exclude for safe names only.
      pathspecExclusions.push(`:(exclude,top)${rule.configuredPath}`);
      pathspecExclusions.push(`:(exclude,top)${rule.configuredPath}/**`);
    } else {
      commandExclusionStatuses.push({
        kind: "COMMAND_EXCLUSION_NOT_EXPRESSIBLE",
        configuredPath: rule.configuredPath,
      });
    }

    if (rule.physicalRootStatus.kind === "RESOLVED") {
      const gitRelative = physicalRootToGitRelative(
        rule.physicalRootStatus.root,
        gitRoot,
      );
      if (gitRelative !== null) {
        physicalGitDenyPrefixes.push(gitRelative);
      }
    }
  }

  return {
    plan,
    gitRootWorkspaceRelative,
    physicalGitDenyPrefixes,
    commandExclusionStatuses,
    pathspecExclusions,
  };
}

/**
 * Authoritative parser-level visibility check for a Git-root-relative path.
 */
export function isGitPathDenied(
  gitRelativePath: string,
  scope: GitVisibilityScope,
): Result<boolean, GitBaselineFailure> {
  const validated = validateGitRelativePath(gitRelativePath);
  if (!validated.ok) {
    return validated;
  }

  const workspaceRelative = gitPathToWorkspaceRelative(
    validated.value,
    scope.gitRootWorkspaceRelative,
  );
  if (!workspaceRelative.ok) {
    return workspaceRelative;
  }

  if (isLexicallyDenied(workspaceRelative.value, scope.plan)) {
    return success(true);
  }

  const candidate = splitComponents(validated.value);
  for (const prefix of scope.physicalGitDenyPrefixes) {
    const boundary = splitComponents(prefix);
    if (boundary.length === 0) {
      // Physical deny root equals git root — treat all paths as denied.
      return success(true);
    }
    if (componentsMatchPrefix(candidate, boundary)) {
      return success(true);
    }
  }

  return success(false);
}

/**
 * Fail closed if a denied Git path reaches the parser visibility boundary.
 */
export function assertGitPathVisible(
  gitRelativePath: string,
  scope: GitVisibilityScope,
): Result<string, GitBaselineFailure> {
  const denied = isGitPathDenied(gitRelativePath, scope);
  if (!denied.ok) {
    return denied;
  }
  if (denied.value) {
    return failure(
      gitBaselineFailure(
        "GIT_DENIED_PATH_LEAK_DETECTED",
        "Git reported a path beneath a deny-path boundary",
        { capability: "parser-visibility" },
      ),
    );
  }

  const validated = validateGitRelativePath(gitRelativePath);
  if (!validated.ok) {
    return validated;
  }
  return success(validated.value);
}

export function appendPathspecArgs(
  args: readonly string[],
  exclusions: readonly string[],
): string[] {
  if (exclusions.length === 0) {
    return [...args];
  }
  return [...args, "--", ...exclusions];
}
