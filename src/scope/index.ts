/**
 * Phase 5G scope contracts — package-internal barrel.
 *
 * Deliberately NOT re-exported from `src/index.ts`. Admitting a scope is a
 * step inside a host session, not a public capability of the package.
 */

export {
  ENGINEERING_SCOPE_PLAN_SCHEMA_VERSION,
  MAX_SCOPE_CONTEXT_PATHS,
  MAX_SCOPE_EDITABLE_TARGETS,
  MAX_SCOPE_NOTES,
  MAX_SCOPE_NOTE_UTF8_BYTES,
  MAX_SCOPE_PLAN_UTF8_BYTES,
  MAX_SCOPE_REASON_UTF8_BYTES,
  MAX_SCOPE_RELATIVE_PATH_UTF8_BYTES,
  MAX_SCOPE_TASK_SUMMARY_UTF8_BYTES,
  MAX_SCOPE_VALIDATION_CANDIDATE_IDS,
} from "./bounds.js";

export { parseEngineeringScopePlan } from "./parse.js";

export {
  classifyScopePathSensitivity,
  normalizeRepositoryRelativePath,
} from "./policy.js";

export { admitScopePlan } from "./validate.js";
export type { ScopeAdmissionInput } from "./validate.js";

export type {
  AdmittedContextPath,
  AdmittedEditableTarget,
  ApprovedScope,
  EngineeringScopePlan,
  ProposedEditableTarget,
  ScopeChangeKind,
  ScopeFailure,
  ScopeFailureCode,
  SensitivePathPolicyOptions,
  SensitivePathReasonCode,
  SensitivePathVerdict,
} from "./types.js";
