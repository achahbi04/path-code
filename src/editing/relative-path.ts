/**
 * Relative path composition for creation targets — parent + leaf only.
 */

import path from "node:path";

import { normalizeRelativePath } from "../inventory/denial.js";

export function childRelativePath(
  parentRelativePath: string,
  leafName: string,
): string {
  if (parentRelativePath === ".") {
    return normalizeRelativePath(leafName);
  }
  return normalizeRelativePath(path.posix.join(parentRelativePath, leafName));
}
