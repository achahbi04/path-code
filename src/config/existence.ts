/**
 * Narrow fixed-entry existence probe for PATHCODE.md at the workspace root.
 *
 * Distinguishes absent configuration from a present-but-unresolvable entry.
 * This is NOT a general path or file-read capability.
 */

import { lstat } from "node:fs/promises";
import path from "node:path";

import type { CanonicalPath } from "../domain/workspace.js";
import { PATHCODE_FILENAME } from "./constants.js";

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/**
 * Returns true when a directory entry named PATHCODE.md exists at the canonical root.
 */
export async function configEntryExists(
  workspaceRoot: CanonicalPath,
): Promise<boolean> {
  const entryPath = path.join(workspaceRoot, PATHCODE_FILENAME);
  try {
    await lstat(entryPath);
    return true;
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }
    // Non-ENOENT failures imply an entry may exist but is not stat-able here.
    return true;
  }
}
