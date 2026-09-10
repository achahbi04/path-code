/**
 * Phase 5G General Engineering Session — scope plan contract types.
 *
 * A scope plan is a *proposal*: it selects paths the model would like to edit
 * and read, plus validation candidates it would like run. It carries no
 * authority. Nothing here is admitted until it has been checked against a
 * trusted inventory and the sensitive-path policy, and then approved by a
 * human at the SCOPE prompt.
 */

import type { RepositoryEntry } from "../inventory/types.js";
import type { ENGINEERING_SCOPE_PLAN_SCHEMA_VERSION } from "./bounds.js";

export type ScopeChangeKind = "REPLACE_TEXT" | "CREATE_TEXT";

export type ScopeFailureCode =
  | "SCOPE_PLAN_MALFORMED_JSON"
  | "SCOPE_PLAN_NOT_OBJECT"
  | "SCOPE_PLAN_TOO_LARGE"
  | "SCOPE_PLAN_UNKNOWN_FIELD"
  | "SCOPE_PLAN_MISSING_FIELD"
  | "SCOPE_PLAN_UNSUPPORTED_VERSION"
  | "SCOPE_PLAN_INVALID_FIELD"
  | "SCOPE_PLAN_BOUNDS_EXCEEDED"
  | "SCOPE_PLAN_DUPLICATE_PATH"
  | "SCOPE_PATH_NOT_ADMITTED"
  | "SCOPE_PATH_SENSITIVE"
  | "SCOPE_PATH_KIND_MISMATCH"
  | "SCOPE_CREATE_PARENT_NOT_ADMITTED"
  | "SCOPE_CREATE_TARGET_EXISTS"
  | "SCOPE_VALIDATION_CANDIDATE_UNKNOWN"
  | "SCOPE_NO_EDITABLE_TARGET"
  | "SCOPE_HYDRATION_DOES_NOT_COVER_EDITABLE"
  | "SCOPE_HYDRATION_DOES_NOT_COVER_CONTEXT";

export type ScopeFailure = {
  readonly code: ScopeFailureCode;
  readonly message: string;
};

/** One editable target as *proposed* by the model. Not yet admitted. */
export type ProposedEditableTarget = {
  readonly relativePath: string;
  readonly changeKind: ScopeChangeKind;
  readonly reason: string;
};

/**
 * Structurally valid, bounded scope plan reconstructed from untrusted text.
 * Field presence and shape are guaranteed; path meaning is not.
 *
 * `hydrationPaths` (H) is optional and additive. When omitted, consumers treat
 * effective H as E ∪ P ∪ validation-needed for backward compatibility.
 */
export type EngineeringScopePlan = {
  readonly schemaVersion: typeof ENGINEERING_SCOPE_PLAN_SCHEMA_VERSION;
  readonly taskSummary: string;
  readonly editableTargets: readonly ProposedEditableTarget[];
  readonly contextPaths: readonly string[];
  readonly validationCandidateIds: readonly string[];
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
  /** Exact hydration path set (H). Optional; see ApprovedScope.hydrationPaths. */
  readonly hydrationPaths?: readonly string[];
};

export type SensitivePathReasonCode =
  | "GIT_ADMINISTRATIVE"
  | "DEPENDENCY_TREE"
  | "ENVIRONMENT_SECRET"
  | "PRIVATE_KEY_MATERIAL"
  | "RECOVERY_STORE"
  | "PATH_CODE_RUNTIME_SOURCE"
  | "PATH_NOT_REPOSITORY_RELATIVE";

export type SensitivePathVerdict =
  | { readonly sensitive: false; readonly normalizedPath: string }
  | {
      readonly sensitive: true;
      readonly reasonCode: SensitivePathReasonCode;
      readonly detail: string;
    };

export type SensitivePathPolicyOptions = {
  /**
   * Extra repository-relative prefixes the host refuses for this workspace —
   * for example a vendored Path Code runtime checkout.
   */
  readonly forbiddenRelativePrefixes?: readonly string[];
  /**
   * Set when a recovery store root nevertheless resolves inside the target
   * repository. The General Session refuses that arrangement outright; this
   * exists so the policy stays correct for any other host.
   */
  readonly recoveryStoreRelativePrefix?: string | null;
};

/** An editable target that survived inventory and policy admission. */
export type AdmittedEditableTarget =
  | {
      readonly changeKind: "REPLACE_TEXT";
      readonly relativePath: string;
      readonly reason: string;
      readonly entry: RepositoryEntry;
    }
  | {
      readonly changeKind: "CREATE_TEXT";
      readonly relativePath: string;
      readonly reason: string;
      readonly parentEntry: RepositoryEntry;
      readonly leafName: string;
    };

export type AdmittedContextPath = {
  readonly relativePath: string;
  readonly entry: RepositoryEntry;
};

/**
 * The approved scope: exactly the paths a human may be asked about, bound to
 * inventory entries that were admitted by the workspace boundary.
 *
 * When `hydrationPaths` (H) is omitted, treat effective H as
 * E ∪ P ∪ validation-needed for backward compatibility with plans that only
 * declare editable (E) and context (P) sets.
 */
export type ApprovedScope = {
  readonly taskSummary: string;
  readonly editableTargets: readonly AdmittedEditableTarget[];
  readonly contextPaths: readonly AdmittedContextPath[];
  readonly validationCandidateIds: readonly string[];
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
  /** Admitted hydration paths (H). Present only when the plan supplied H. */
  readonly hydrationPaths?: readonly AdmittedContextPath[];
};
