/**
 * Bounded applicability check for a ValidationPlanResult — no process rerun.
 */

import { loadProjectConfig } from "../config/loader.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import { lookupValidationResult } from "./internal/registry.js";
import { verifyDeclaredInputsCurrent } from "./subject.js";
import type {
  PreparedValidationPlan,
  ValidationApplicabilityFailure,
  ValidationApplicabilitySuccess,
  ValidationPlanResult,
} from "./types.js";

function appFailure(
  code: ValidationApplicabilityFailure["code"],
  message: string,
): ValidationApplicabilityFailure {
  return { code, message };
}

export async function checkValidationResultApplicability(
  result: ValidationPlanResult,
  plan: PreparedValidationPlan,
  workspace: WorkspaceBoundary,
): Promise<Result<ValidationApplicabilitySuccess, ValidationApplicabilityFailure>> {
  const entry = lookupValidationResult(result);
  if (entry === undefined) {
    return failure(
      appFailure(
        "RESULT_NOT_REGISTERED",
        "ValidationPlanResult is not registered or was reconstructed/copied",
      ),
    );
  }
  if (entry.planRef !== plan || entry.result !== result) {
    return failure(
      appFailure("PLAN_MISMATCH", "Result is not bound to the supplied plan"),
    );
  }
  if (plan.workspace !== workspace || result.workspaceRoot !== plan.workspaceRoot) {
    return failure(
      appFailure("WORKSPACE_MISMATCH", "Result/plan workspace does not match caller"),
    );
  }
  if (result.snapshotGeneration !== plan.snapshot.generation) {
    return failure(
      appFailure("SUBJECT_MISMATCH", "Result snapshot generation does not match plan"),
    );
  }
  if (!result.applicabilityValid || !result.planCriterionSatisfied) {
    return failure(
      appFailure(
        "RESULT_NOT_APPLICABLE",
        "Result was marked non-applicable or did not satisfy plan criterion",
      ),
    );
  }

  const config = await loadProjectConfig(workspace);
  if (!config.ok) {
    return failure(appFailure("CONFIG_CHANGED", config.error.message));
  }
  if (config.value !== plan.config) {
    // Identity may differ after reload even if equal content; verify declared inputs
    // against freshly loaded config and refuse if content/policy changed.
  }

  const verified = await verifyDeclaredInputsCurrent(
    plan.snapshot,
    workspace,
    config.value,
    plan.declaredEntries,
  );
  if (!verified.ok) {
    return failure(
      appFailure(
        verified.error.code === "SUBJECT_STALE" ? "SUBJECT_STALE" : "SUBJECT_UNVERIFIABLE",
        verified.error.message,
      ),
    );
  }

  return success({ applicable: true, result });
}
