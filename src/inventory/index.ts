/**
 * Public inventory surface — traversal and observation only.
 *
 * No content reading, hashing, Git, or configuration loading.
 */

export { inventory } from "./traverse.js";
export {
  DEFAULT_SYSTEM_PRUNED_DIRECTORIES,
  LOCALE_INDEPENDENT_NAME_COMPARE,
  MAX_INVENTORY_OBSERVATIONS,
  MAX_TRAVERSAL_DEPTH,
} from "./constants.js";
export type {
  InventoryObservation,
  InventoryPartialReason,
  NonEmptyPartialReasons,
  TraversalCompletion,
} from "./disposition.js";
export type {
  InventoryFailure,
  InventoryFailureCode,
} from "./failure.js";
export {
  isLexicallyDenied,
  isPhysicallyDenied,
  prepareDenyPathPlan,
} from "./denial.js";
export type {
  DenyPathPlan,
  DenyPathRuleRecord,
  PhysicalDenyRootStatus,
} from "./denial.js";
export type {
  EffectiveInventoryLimits,
  InventoryOptions,
  LexicalEntryKind,
  PhysicalTargetKind,
  RepositoryEntry,
  RepositoryEntryData,
  RepositoryInventory,
  RepositoryInventoryData,
} from "./types.js";
