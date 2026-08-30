/**
 * Workspace path failure helpers.
 * Reuses Phase 1B WorkspacePathFailure vocabulary — trust-boundary only.
 */

import type {
  WorkspacePathFailure,
  WorkspacePathFailureCode,
} from "../domain/workspace.js";
import type { JsonObject } from "../domain/json.js";

export function workspacePathFailure(
  code: WorkspacePathFailureCode,
  message: string,
  details?: JsonObject,
): WorkspacePathFailure {
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}
