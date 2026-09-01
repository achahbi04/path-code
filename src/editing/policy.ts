/**
 * Narrow Phase 3 mutation mapping to frozen Phase 1E disable-action vocabulary.
 */

import type { ActionClass } from "../domain/authority.js";
import type { ResolvedProjectConfig } from "../config/types.js";
import type { MutationAction } from "./types.js";

/** Authoritative mapping — MODIFY_EXISTING_FILE only; CREATE_FILE has no ActionClass. */
export const DISABLE_ACTION_FOR_MODIFY_EXISTING_FILE: ActionClass = "EDIT";

export function isModifyExistingFileDisabled(
  config: ResolvedProjectConfig,
): boolean {
  return config.restrictions.disabledActions.includes(
    DISABLE_ACTION_FOR_MODIFY_EXISTING_FILE,
  );
}

export function isMutationActionDisabledByConfig(
  action: MutationAction,
  config: ResolvedProjectConfig,
): boolean {
  if (action === "MODIFY_EXISTING_FILE") {
    return isModifyExistingFileDisabled(config);
  }
  return false;
}
