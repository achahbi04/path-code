/**
 * EXECUTE_PROCESS ActionClass mapping for local process execution.
 */

import type { ActionClass } from "../domain/authority.js";
import type { ResolvedProjectConfig } from "../config/types.js";

/** Authoritative mapping — local process execution → EXECUTE_PROCESS. */
export const DISABLE_ACTION_FOR_EXECUTE_PROCESS: ActionClass = "EXECUTE_PROCESS";

export function isExecuteProcessDisabled(
  config: ResolvedProjectConfig,
): boolean {
  return config.restrictions.disabledActions.includes(
    DISABLE_ACTION_FOR_EXECUTE_PROCESS,
  );
}
