/**
 * Inventory traversal failure vocabulary.
 */

import type { JsonObject } from "../domain/json.js";

export type InventoryFailureCode =
  | "INVALID_INVENTORY_OPTIONS"
  | "DENIAL_ROOT_RESOLUTION_FAILED"
  | "WORKSPACE_ROOT_UNREADABLE";

export type InventoryFailure = {
  readonly code: InventoryFailureCode;
  readonly message: string;
  readonly details?: JsonObject;
};

export function inventoryFailure(
  code: InventoryFailureCode,
  message: string,
  details?: JsonObject,
): InventoryFailure {
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}
