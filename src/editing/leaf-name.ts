/**
 * Single-leaf name validation for CREATE_FILE preparation.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";

export type LeafNameFailure = {
  readonly code: "INVALID_LEAF_NAME";
  readonly message: string;
};

export function validateLeafName(leafName: string): Result<string, LeafNameFailure> {
  if (leafName.length === 0) {
    return failure({
      code: "INVALID_LEAF_NAME",
      message: "Leaf name must be non-empty",
    });
  }
  if (leafName === "." || leafName === "..") {
    return failure({
      code: "INVALID_LEAF_NAME",
      message: "Leaf name must not be . or ..",
    });
  }
  if (leafName.includes("\0")) {
    return failure({
      code: "INVALID_LEAF_NAME",
      message: "Leaf name must not contain NUL",
    });
  }
  if (leafName.includes("/") || leafName.includes("\\")) {
    return failure({
      code: "INVALID_LEAF_NAME",
      message: "Leaf name must not contain path separators",
    });
  }
  if (leafName.startsWith("/")) {
    return failure({
      code: "INVALID_LEAF_NAME",
      message: "Leaf name must not be absolute",
    });
  }
  return success(leafName);
}
