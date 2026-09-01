/**
 * Collect an in-memory Git state baseline.
 *
 * Git annotates existing RepositoryEntry values. It never creates them.
 * Production capability is read-only.
 */

import path from "node:path";

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import {
  isLexicallyDenied,
  isPhysicallyDenied,
  prepareDenyPathPlan,
} from "../inventory/denial.js";
import { repositoryEntries } from "../inventory/membership.js";
import type { RepositoryEntry, RepositoryInventory } from "../inventory/types.js";
import {
  gitBaselineFailure,
  type GitBaselineFailure,
} from "./baseline-failure.js";
import { observeIgnoredPaths } from "./check-ignore.js";
import { discoverGitRepository } from "./discovery.js";
import { isGitlinkMode, parseLsFilesStage } from "./ls-files.js";
import {
  gitPathToWorkspaceRelative,
  workspacePathToGitRelative,
} from "./path-map.js";
import {
  parsePorcelainV2Status,
  statusRecordToEntryState,
  type ParsedStatusRecord,
} from "./porcelain.js";
import { runGitState, stripGitStdoutTerminator } from "./runner.js";
import type {
  GitBranchState,
  GitEntryAnnotation,
  GitHeadState,
  GitPathObservation,
  GitStateBaseline,
  GitStateBaselineData,
  UnmappedVisibleGitObservation,
} from "./types.js";
import {
  appendPathspecArgs,
  buildGitVisibilityScope,
} from "./visibility.js";


function brandBaseline(data: GitStateBaselineData): GitStateBaseline {
  return data as GitStateBaseline;
}

function isOid(value: string): boolean {
  return /^[0-9a-f]{40,64}$/i.test(value);
}

async function readHeadState(
  gitRoot: string,
): Promise<Result<GitHeadState, GitBaselineFailure>> {
  const headCommit = await runGitState({
    cwd: gitRoot,
    args: ["rev-parse", "--verify", "--quiet", "HEAD"],
  });

  if (headCommit.ok) {
    const oid = stripGitStdoutTerminator(headCommit.value.stdout);
    if (!isOid(oid)) {
      return failure(
        gitBaselineFailure("GIT_STATE_FAILED", "HEAD object id was malformed"),
      );
    }
    return success({ kind: "COMMIT", oid: oid.toLowerCase() });
  }

  const symbolic = await runGitState({
    cwd: gitRoot,
    args: ["symbolic-ref", "--quiet", "HEAD"],
  });
  if (symbolic.ok) {
    return success({ kind: "UNBORN" });
  }

  return failure(
    gitBaselineFailure("GIT_STATE_FAILED", "Failed to resolve HEAD state"),
  );
}

async function readBranchState(
  gitRoot: string,
): Promise<Result<GitBranchState, GitBaselineFailure>> {
  const attached = await runGitState({
    cwd: gitRoot,
    args: ["symbolic-ref", "--quiet", "--short", "HEAD"],
  });
  if (attached.ok) {
    const name = stripGitStdoutTerminator(attached.value.stdout);
    if (name.length === 0) {
      return failure(
        gitBaselineFailure("GIT_STATE_FAILED", "Attached branch name was empty"),
      );
    }
    return success({ kind: "ATTACHED", name });
  }
  return success({ kind: "DETACHED" });
}

function makeObservation(
  gitRelativePath: string,
  gitRootWorkspaceRelative: string,
  state: GitPathObservation["state"],
  originalGitRelativePath?: string,
): Result<GitPathObservation, GitBaselineFailure> {
  const workspaceRelative = gitPathToWorkspaceRelative(
    gitRelativePath,
    gitRootWorkspaceRelative,
  );
  if (!workspaceRelative.ok) {
    return workspaceRelative;
  }
  return success({
    gitRelativePath,
    workspaceRelativePath: workspaceRelative.value,
    state,
    provenance: "PRE_EXISTING",
    ...(originalGitRelativePath === undefined
      ? {}
      : { originalGitRelativePath }),
  });
}


/**
 * Collect Git state baseline for an authorized workspace and inventory.
 */
export async function collectGitStateBaseline(
  workspace: WorkspaceBoundary,
  inventory: RepositoryInventory,
  config: ResolvedProjectConfig,
): Promise<Result<GitStateBaseline, GitBaselineFailure>> {
  const discovery = await discoverGitRepository(workspace);
  if (!discovery.ok) {
    if (discovery.error.code === "NOT_A_GIT_REPOSITORY") {
      return success(
        brandBaseline({
          availability: { kind: "NOT_GIT_REPOSITORY" },
          annotations: [],
          unmappedVisibleObservations: [],
          inventoryTraversalCompletion: inventory.traversalCompletion,
          provenance: "PRE_EXISTING",
          commandExclusionStatuses: [],
        }),
      );
    }
    if (discovery.error.code === "GIT_NOT_AVAILABLE") {
      return failure(
        gitBaselineFailure("GIT_NOT_AVAILABLE", discovery.error.message),
      );
    }
    if (discovery.error.code === "NOT_A_WORKTREE") {
      return failure(
        gitBaselineFailure("NOT_A_WORKTREE", discovery.error.message),
      );
    }
    if (discovery.error.code === "GIT_ROOT_OUTSIDE_WORKSPACE") {
      return failure(
        gitBaselineFailure(
          "GIT_ROOT_OUTSIDE_WORKSPACE",
          discovery.error.message,
        ),
      );
    }
    return failure(
      gitBaselineFailure("GIT_STATE_FAILED", discovery.error.message, {
        cause: discovery.error.code,
      }),
    );
  }

  const gitRoot = discovery.value.root;
  const workspaceRootResult = await workspace.canonicalize(".");
  if (!workspaceRootResult.ok) {
    return failure(
      gitBaselineFailure(
        "GIT_STATE_FAILED",
        "Failed to obtain authorized workspace root",
      ),
    );
  }

  const relativeRoot = path
    .relative(workspaceRootResult.value, gitRoot)
    .replace(/\\/g, "/");
  const gitRootWorkspaceRelative =
    relativeRoot === "" || relativeRoot === "." ? "" : relativeRoot;

  const planResult = await prepareDenyPathPlan(
    workspace,
    config.restrictions.deniedPaths,
  );
  if (!planResult.ok) {
    return failure(
      gitBaselineFailure(
        "DENIAL_ROOT_RESOLUTION_FAILED",
        "Unexpected failure resolving configured deny-path boundary",
        planResult.error.details,
      ),
    );
  }

  const scope = buildGitVisibilityScope(
    planResult.value,
    gitRoot,
    gitRootWorkspaceRelative,
  );

  const head = await readHeadState(gitRoot);
  if (!head.ok) {
    return head;
  }
  const branch = await readBranchState(gitRoot);
  if (!branch.ok) {
    return branch;
  }

  const statusArgs = appendPathspecArgs(
    ["status", "--porcelain=v2", "-z", "--untracked-files=all"],
    scope.pathspecExclusions,
  );
  const statusResult = await runGitState({ cwd: gitRoot, args: statusArgs });
  if (!statusResult.ok) {
    return statusResult;
  }
  const statusRecords = parsePorcelainV2Status(statusResult.value.stdout, scope);
  if (!statusRecords.ok) {
    return statusRecords;
  }

  const lsArgs = appendPathspecArgs(
    ["ls-files", "--stage", "-z"],
    scope.pathspecExclusions,
  );
  const lsResult = await runGitState({ cwd: gitRoot, args: lsArgs });
  if (!lsResult.ok) {
    return lsResult;
  }
  const lsRecords = parseLsFilesStage(lsResult.value.stdout, scope);
  if (!lsRecords.ok) {
    return lsRecords;
  }

  const statusByPath = new Map<string, ParsedStatusRecord>();
  for (const record of statusRecords.value) {
    const existing = statusByPath.get(record.gitRelativePath);
    if (existing !== undefined && existing.kind !== record.kind) {
      return failure(
        gitBaselineFailure(
          "GIT_STATUS_PARSE_FAILED",
          "Conflicting Git status classifications for one path",
        ),
      );
    }
    statusByPath.set(record.gitRelativePath, record);
  }

  const trackedModes = new Map<string, string>();
  for (const record of lsRecords.value) {
    trackedModes.set(record.gitRelativePath, record.mode);
  }

  const entries = repositoryEntries(inventory);
  const entryByWorkspacePath = new Map<string, RepositoryEntry>();
  for (const entry of entries) {
    entryByWorkspacePath.set(entry.relativePath, entry);
  }

  const annotations: GitEntryAnnotation[] = [];
  const annotatedGitPaths = new Set<string>();
  const ignoreCandidates: string[] = [];

  for (const entry of entries) {
    const gitRelative = workspacePathToGitRelative(
      entry.relativePath,
      scope.gitRootWorkspaceRelative,
    );

    if (gitRelative === null) {
      annotations.push({
        entry,
        observation: {
          gitRelativePath: "",
          workspaceRelativePath: entry.relativePath,
          state: { kind: "NOT_IN_GIT_WORKTREE" },
          provenance: "PRE_EXISTING",
        },
      });
      continue;
    }

    if (entry.relativePath === ".git" && entry.physicalKind === "FILE") {
      annotations.push({
        entry,
        observation: {
          gitRelativePath: gitRelative,
          workspaceRelativePath: entry.relativePath,
          state: { kind: "GIT_ADMINISTRATIVE" },
          provenance: "PRE_EXISTING",
        },
      });
      annotatedGitPaths.add(gitRelative);
      continue;
    }

    if (entry.physicalKind === "DIRECTORY") {
      annotations.push({
        entry,
        observation: {
          gitRelativePath: gitRelative,
          workspaceRelativePath: entry.relativePath,
          state: { kind: "NOT_APPLICABLE_DIRECTORY" },
          provenance: "PRE_EXISTING",
        },
      });
      annotatedGitPaths.add(gitRelative);
      continue;
    }

    const status = statusByPath.get(gitRelative);
    const mode = trackedModes.get(gitRelative);

    if (status !== undefined) {
      const state = statusRecordToEntryState(status);
      const observationResult = makeObservation(
        gitRelative,
        scope.gitRootWorkspaceRelative,
        state,
        status.kind === "CHANGED" ? status.originalGitRelativePath : undefined,
      );
      if (!observationResult.ok) {
        return observationResult;
      }
      annotations.push({ entry, observation: observationResult.value });
      annotatedGitPaths.add(gitRelative);
      continue;
    }

    if (mode !== undefined) {
      const state = isGitlinkMode(mode)
        ? ({
            kind: "TRACKED" as const,
            indexState: "CLEAN" as const,
            worktreeState: "CLEAN" as const,
            mode,
            submoduleStatus: "gitlink",
          })
        : ({
            kind: "TRACKED" as const,
            indexState: "CLEAN" as const,
            worktreeState: "CLEAN" as const,
            mode,
          });
      const observationResult = makeObservation(
        gitRelative,
        scope.gitRootWorkspaceRelative,
        state,
      );
      if (!observationResult.ok) {
        return observationResult;
      }
      annotations.push({ entry, observation: observationResult.value });
      annotatedGitPaths.add(gitRelative);
      continue;
    }

    ignoreCandidates.push(gitRelative);
  }

  let ignoredPaths = new Set<string>();
  if (ignoreCandidates.length > 0) {
    const ignoreResult = await observeIgnoredPaths(
      gitRoot,
      ignoreCandidates,
      scope,
    );
    if (!ignoreResult.ok) {
      return ignoreResult;
    }
    ignoredPaths = new Set(ignoreResult.value);
  }

  for (const gitRelative of ignoreCandidates) {
    const workspaceRelativeResult = gitPathToWorkspaceRelative(
      gitRelative,
      scope.gitRootWorkspaceRelative,
    );
    if (!workspaceRelativeResult.ok) {
      return workspaceRelativeResult;
    }
    const entry = entryByWorkspacePath.get(workspaceRelativeResult.value);
    if (entry === undefined) {
      continue;
    }
    const state = ignoredPaths.has(gitRelative)
      ? ({ kind: "IGNORED" } as const)
      : ({ kind: "UNTRACKED" } as const);
    const observationResult = makeObservation(
      gitRelative,
      scope.gitRootWorkspaceRelative,
      state,
    );
    if (!observationResult.ok) {
      return observationResult;
    }
    annotations.push({ entry, observation: observationResult.value });
    annotatedGitPaths.add(gitRelative);
  }

  const unmappedVisibleObservations: UnmappedVisibleGitObservation[] = [];

  for (const [gitRelative, record] of statusByPath) {
    if (annotatedGitPaths.has(gitRelative)) {
      continue;
    }
    const workspaceRelativeResult = gitPathToWorkspaceRelative(
      gitRelative,
      scope.gitRootWorkspaceRelative,
    );
    if (!workspaceRelativeResult.ok) {
      return workspaceRelativeResult;
    }
    if (isLexicallyDenied(workspaceRelativeResult.value, scope.plan)) {
      return failure(
        gitBaselineFailure(
          "GIT_DENIED_PATH_LEAK_DETECTED",
          "Git reported a path beneath a deny-path boundary",
          { capability: "unmapped-visibility" },
        ),
      );
    }
    const canonical = await workspace.canonicalize(workspaceRelativeResult.value);
    if (canonical.ok && isPhysicallyDenied(canonical.value, scope.plan)) {
      return failure(
        gitBaselineFailure(
          "GIT_DENIED_PATH_LEAK_DETECTED",
          "Git reported a path beneath a deny-path boundary",
          { capability: "unmapped-visibility" },
        ),
      );
    }
    const state = statusRecordToEntryState(record);
    const observationResult = makeObservation(
      gitRelative,
      scope.gitRootWorkspaceRelative,
      state,
      record.kind === "CHANGED" ? record.originalGitRelativePath : undefined,
    );
    if (!observationResult.ok) {
      return observationResult;
    }
    unmappedVisibleObservations.push({
      kind: "UNMAPPED_VISIBLE_GIT_OBSERVATION",
      observation: observationResult.value,
    });
  }

  return success(
    brandBaseline({
      availability: {
        kind: "GIT_REPOSITORY",
        root: gitRoot,
        head: head.value,
        branch: branch.value,
      },
      annotations,
      unmappedVisibleObservations,
      inventoryTraversalCompletion: inventory.traversalCompletion,
      provenance: "PRE_EXISTING",
      commandExclusionStatuses: scope.commandExclusionStatuses,
    }),
  );
}

/** Exported parser seam for synthetic denied-path falsification tests. */
export { parsePorcelainV2Status } from "./porcelain.js";
export { buildGitVisibilityScope, assertGitPathVisible } from "./visibility.js";
