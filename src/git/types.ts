/**
 * Phase 2C Git state baseline types.
 *
 * Git annotates. Git does not admit.
 * GitPathObservation ≠ RepositoryEntry.
 */

import type { Provenance } from "../domain/knowledge.js";
import type { CanonicalPath } from "../domain/workspace.js";
import type { RepositoryEntry } from "../inventory/types.js";
import type { TraversalCompletion } from "../inventory/disposition.js";

export type GitObjectId = string;

export type GitHeadState =
  | { readonly kind: "COMMIT"; readonly oid: GitObjectId }
  | { readonly kind: "UNBORN" };

export type GitBranchState =
  | { readonly kind: "ATTACHED"; readonly name: string }
  | { readonly kind: "DETACHED" };

export type GitRepositoryAvailability =
  | {
      readonly kind: "GIT_REPOSITORY";
      readonly root: CanonicalPath;
      readonly head: GitHeadState;
      readonly branch: GitBranchState;
    }
  | { readonly kind: "NOT_GIT_REPOSITORY" };

export type GitChangeKind =
  | "CLEAN"
  | "ADDED"
  | "MODIFIED"
  | "DELETED"
  | "RENAMED"
  | "COPIED"
  | "TYPE_CHANGED";

export type GitTrackedFileState = {
  readonly kind: "TRACKED";
  readonly indexState: GitChangeKind;
  readonly worktreeState: GitChangeKind;
  readonly originalPath?: string;
  readonly score?: number;
  readonly submoduleStatus?: string;
  readonly mode?: string;
};

export type GitUnmergedState = {
  readonly kind: "UNMERGED";
  readonly stages: string;
};

export type GitUntrackedState = {
  readonly kind: "UNTRACKED";
};

export type GitIgnoredState = {
  readonly kind: "IGNORED";
};

export type GitNotApplicableState = {
  readonly kind:
    | "NOT_DIRECTLY_TRACKED"
    | "NOT_APPLICABLE_DIRECTORY"
    | "NOT_IN_GIT_WORKTREE"
    | "GIT_ADMINISTRATIVE";
};

export type GitEntryState =
  | GitTrackedFileState
  | GitUnmergedState
  | GitUntrackedState
  | GitIgnoredState
  | GitNotApplicableState;

/**
 * Lexical Git observation — never carries CanonicalPath authority.
 */
export type GitPathObservation = {
  readonly gitRelativePath: string;
  readonly workspaceRelativePath: string;
  readonly state: GitEntryState;
  readonly provenance: Provenance;
  readonly originalGitRelativePath?: string;
};

export type GitEntryAnnotation = {
  readonly entry: RepositoryEntry;
  readonly observation: GitPathObservation;
};

export type UnmappedVisibleGitObservation = {
  readonly kind: "UNMAPPED_VISIBLE_GIT_OBSERVATION";
  readonly observation: GitPathObservation;
};

export type CommandExclusionStatus =
  | { readonly kind: "COMMAND_EXCLUSION_APPLIED"; readonly configuredPath: string }
  | {
      readonly kind: "COMMAND_EXCLUSION_NOT_EXPRESSIBLE";
      readonly configuredPath: string;
    };

export type GitStateBaselineData = {
  readonly availability: GitRepositoryAvailability;
  readonly annotations: readonly GitEntryAnnotation[];
  readonly unmappedVisibleObservations: readonly UnmappedVisibleGitObservation[];
  readonly inventoryTraversalCompletion: TraversalCompletion;
  readonly provenance: Provenance;
  readonly commandExclusionStatuses: readonly CommandExclusionStatus[];
};

/**
 * Earned Git state baseline — produced only by collectGitStateBaseline.
 */
export type GitStateBaseline = GitStateBaselineData & {
  readonly __gitStateBaselineBrand: never;
};
