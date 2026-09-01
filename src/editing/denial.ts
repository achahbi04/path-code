/**
 * Authoritative deny-path evaluation for editing preparation/authorization.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { ResolvedProjectConfig } from "../config/types.js";
import {
  isLexicallyDenied,
  isPhysicallyDenied,
  prepareDenyPathPlan,
} from "../inventory/denial.js";
import type { PreparationFailure } from "./types.js";

export async function refuseIfTargetDenied(
  relativePath: string,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): Promise<Result<true, PreparationFailure>> {
  const planResult = await prepareDenyPathPlan(
    workspace,
    config.restrictions.deniedPaths,
  );
  if (!planResult.ok) {
    return failure({
      code: "TARGET_DENIED",
      message: "Configured deny-path boundary could not be resolved",
    });
  }
  const plan = planResult.value;

  if (isLexicallyDenied(relativePath, plan)) {
    return failure({
      code: "TARGET_DENIED",
      message: `Target path is lexically denied: ${relativePath}`,
    });
  }

  const canonical = await workspace.canonicalize(relativePath);
  if (!canonical.ok) {
    if (canonical.error.code === "PATH_OUTSIDE_WORKSPACE") {
      return failure({
        code: "TARGET_DENIED",
        message: "Target path is outside the workspace boundary",
      });
    }
    return success(true);
  }

  if (isPhysicallyDenied(canonical.value, plan)) {
    return failure({
      code: "TARGET_DENIED",
      message: `Target path is physically denied: ${relativePath}`,
    });
  }

  return success(true);
}
