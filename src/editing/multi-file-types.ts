/**
 * Phase 3D multi-file coordination types — opaque plan and honest results.
 */

import type { Result } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type {
  CreateFileResult,
  EditAuthorization,
  KnowledgeInvalidation,
  PreparedChange,
  ReplaceExistingFileResult,
} from "./types.js";

export type MultiFilePlanEntry = {
  readonly prepared: PreparedChange;
  readonly authorization: EditAuthorization;
};

export type MultiFilePlanBuildFailureCode =
  | "PLAN_TARGET_COUNT_OUT_OF_BOUNDS"
  | "PLAN_TARGET_BYTES_EXCEEDED"
  | "PLAN_TOTAL_PROPOSED_BYTES_EXCEEDED"
  | "PLAN_WORKSPACE_MISMATCH"
  | "DUPLICATE_PREPARED_CHANGE"
  | "DUPLICATE_AUTHORIZATION";

export type MultiFilePlanBuildFailure = {
  readonly code: MultiFilePlanBuildFailureCode;
  readonly message: string;
};

export type MultiFilePlanData = {
  readonly planId: string;
  readonly entries: readonly MultiFilePlanEntry[];
  readonly workspace: WorkspaceBoundary;
  readonly maxFiles: number;
  readonly maxTotalProposedAfterBytes: number;
  readonly maxEditFileBytes: number;
};

export type MultiFilePlan = MultiFilePlanData & {
  readonly __multiFilePlanBrand: never;
};

export type MultiFilePreflightReasonCode =
  | "CONFIG_RELOAD_FAILED"
  | "TARGET_DENIED"
  | "ACTION_DISABLED"
  | "AUTHORIZATION_NOT_REGISTERED"
  | "AUTHORIZATION_ALREADY_CONSUMED"
  | "PREPARED_IDENTITY_MISMATCH"
  | "TARGET_COLLISION"
  | "TARGET_STALE"
  | "TARGET_ALREADY_EXISTS"
  | "ABSENCE_UNVERIFIABLE"
  | "PARENT_NOT_ADMITTED"
  | "NOT_REGULAR_FILE"
  | "UNSUPPORTED_ATOMIC_REPLACE_PLATFORM"
  | "UNSUPPORTED_ATOMIC_CREATE_PLATFORM"
  | "GIT_UNMERGED"
  | "HARD_LINK_REFUSED"
  | "SYMLINK_REFUSED"
  | "CANONICALIZATION_FAILED";

export type MultiFilePreflightOutcome =
  | {
      readonly kind: "PREFLIGHT_FAILED";
      readonly reasons: readonly MultiFilePreflightReasonCode[];
    }
  | {
      readonly kind: "PREFLIGHT_READY_BUT_PLAN_REFUSED";
    };

export type MultiFileExecutionTargetOutcome =
  | {
      readonly kind: "APPLIED";
      readonly nestedResult: ReplaceExistingFileResult | CreateFileResult;
    }
  | {
      readonly kind: "REFUSED_PRECOMMIT";
      readonly nestedResult: ReplaceExistingFileResult | CreateFileResult;
    }
  | {
      readonly kind: "FAILED_PRECOMMIT";
      readonly nestedResult: ReplaceExistingFileResult | CreateFileResult;
    }
  | {
      readonly kind: "COMMITTED_FAILURE";
      readonly nestedResult: ReplaceExistingFileResult | CreateFileResult;
    }
  | {
      readonly kind: "NOT_ATTEMPTED";
    };

export type MultiFilePlanTargetOutcome =
  | MultiFilePreflightOutcome
  | MultiFileExecutionTargetOutcome;

export type MultiFilePlanStatus =
  | "ALL_APPLIED"
  | "REFUSED_AT_PREFLIGHT"
  | "STOPPED_BEFORE_ANY_COMMIT"
  | "PARTIALLY_COMMITTED";

export type MultiFilePlanResultData = {
  readonly planStatus: MultiFilePlanStatus;
  readonly targetOutcomes: readonly MultiFilePlanTargetOutcome[];
  readonly knowledgeInvalidations: readonly KnowledgeInvalidation[];
};

export type MultiFilePlanResult = MultiFilePlanResultData & {
  readonly __multiFilePlanResultBrand: never;
};

export type CreateMultiFilePlanResult = Result<
  MultiFilePlan,
  MultiFilePlanBuildFailure
>;

/** Internal test seam — production binds real replace/create. */
export type MultiFileTargetOperations = {
  readonly replaceExistingFile: typeof import("./replace-existing-file.js").replaceExistingFile;
  readonly createFile: typeof import("./create-file.js").createFile;
};

export type ExecuteMultiFilePlanOptions = {
  readonly gitContext?: import("../git/types.js").GitStateBaseline;
  /** Internal test seam only — not a public authority surface. */
  readonly targetOps?: MultiFileTargetOperations;
};
