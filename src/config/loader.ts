/**
 * PATHCODE.md configuration loader.
 *
 * Loads and represents repository-authored configuration only.
 * Does not apply restrictions or mutate WorkspaceBoundary authority.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import { PATHCODE_FILENAME } from "./constants.js";
import { configEntryExists } from "./existence.js";
import { configFailure, type ConfigFailure } from "./failure.js";
import { parseProjectConfigContent } from "./parser.js";
import { readBoundedConfigFile } from "./reader.js";
import { defaultProjectConfig, type ProjectConfig } from "./types.js";

/**
 * Load project configuration from the fixed PATHCODE.md filename inside
 * an already-authorized WorkspaceBoundary.
 */
export async function loadProjectConfig(
  workspace: WorkspaceBoundary,
): Promise<Result<ProjectConfig, ConfigFailure>> {
  const rootResult = await workspace.canonicalize(".");
  if (!rootResult.ok) {
    return failure(
      configFailure(
        "CONFIG_UNREADABLE",
        "Failed to obtain authorized workspace root",
        { workspaceCode: rootResult.error.code },
      ),
    );
  }

  const workspaceRoot = rootResult.value;
  const entryExists = await configEntryExists(workspaceRoot);
  if (!entryExists) {
    return success(defaultProjectConfig());
  }

  const canonicalResult = await workspace.canonicalize(PATHCODE_FILENAME);
  if (!canonicalResult.ok) {
    if (canonicalResult.error.code === "PATH_NOT_FOUND") {
      return failure(
        configFailure(
          "CONFIG_UNREADABLE",
          "PATHCODE.md entry exists but its target cannot be resolved",
        ),
      );
    }

    return failure(
      configFailure(
        "CONFIG_PATH_REJECTED",
        "PATHCODE.md path was rejected by workspace admission",
        { workspaceCode: canonicalResult.error.code },
      ),
    );
  }

  const readResult = await readBoundedConfigFile(canonicalResult.value);
  if (!readResult.ok) {
    return readResult;
  }

  return parseProjectConfigContent(readResult.value);
}
