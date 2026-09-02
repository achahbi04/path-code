/**
 * Narrow Phase 3 mutation mapping to Phase 1 ActionClass vocabulary
 * (Phase 1 Action Class Amendment 1 + Phase 3 Safe Editing Amendment 1).
 */

import type { ActionClass } from "../domain/authority.js";
import type { ResolvedProjectConfig } from "../config/types.js";
import type { MutationAction } from "./types.js";

/** Authoritative mapping — MODIFY_EXISTING_FILE → EDIT. */
export const DISABLE_ACTION_FOR_MODIFY_EXISTING_FILE: ActionClass = "EDIT";

/** Authoritative mapping — CREATE_FILE → CREATE_FILE (Amendment 1). */
export const DISABLE_ACTION_FOR_CREATE_FILE: ActionClass = "CREATE_FILE";

export function isModifyExistingFileDisabled(
  config: ResolvedProjectConfig,
): boolean {
  return config.restrictions.disabledActions.includes(
    DISABLE_ACTION_FOR_MODIFY_EXISTING_FILE,
  );
}

export function isCreateFileDisabled(config: ResolvedProjectConfig): boolean {
  return config.restrictions.disabledActions.includes(
    DISABLE_ACTION_FOR_CREATE_FILE,
  );
}

export function isMutationActionDisabledByConfig(
  action: MutationAction,
  config: ResolvedProjectConfig,
): boolean {
  if (action === "MODIFY_EXISTING_FILE") {
    return isModifyExistingFileDisabled(config);
  }
  if (action === "CREATE_FILE") {
    return isCreateFileDisabled(config);
  }
  return false;
}
