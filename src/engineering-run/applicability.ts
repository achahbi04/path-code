/**
 * Fresh applicability for a registered Engineering Run — delegates to Run Evidence.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import { checkRunEvidenceApplicability } from "../run-evidence/index.js";
import type { PreparedValidationPlan } from "../validation/types.js";
import { lookupEngineeringRun } from "./internal/registry.js";
import type {
  EngineeringRunApplicabilityFailure,
  EngineeringRunApplicabilityObservation,
  EngineeringRunRecord,
} from "./types.js";

function appFailure(
  code: EngineeringRunApplicabilityFailure["code"],
  message: string,
  causeCode?: string,
): EngineeringRunApplicabilityFailure {
  return causeCode === undefined
    ? { code, message }
    : { code, message, causeCode };
}

/**
 * Point-in-time applicability observation. Never mutates the historical run.
 * Never upgrades a historical failure to PASS.
 */
export async function checkEngineeringRunApplicability(
  run: EngineeringRunRecord,
  plan: PreparedValidationPlan,
  workspace: WorkspaceBoundary,
): Promise<
  Result<
    EngineeringRunApplicabilityObservation,
    EngineeringRunApplicabilityFailure
  >
> {
  const association = lookupEngineeringRun(run);
  if (association === undefined) {
    return failure(
      appFailure(
        "RUN_NOT_REGISTERED",
        "EngineeringRunRecord is not registered or was reconstructed/copied",
      ),
    );
  }
  if (association.plan !== plan || association.run !== run) {
    return failure(
      appFailure(
        "PLAN_MISMATCH",
        "Engineering Run is not bound to the supplied plan",
      ),
    );
  }
  if (association.plan.workspace !== workspace) {
    return failure(
      appFailure(
        "WORKSPACE_MISMATCH",
        "Engineering Run / plan workspace does not match caller",
      ),
    );
  }
  if (association.runEvidence !== run.runEvidence) {
    return failure(
      appFailure(
        "EVIDENCE_ASSOCIATION_FAILED",
        "Engineering Run does not retain its authentic RunEvidenceRecord",
      ),
    );
  }

  const delegated = await checkRunEvidenceApplicability(
    association.runEvidence,
    association.plan,
    workspace,
  );
  if (!delegated.ok) {
    return failure(
      appFailure(
        "EVIDENCE_ASSOCIATION_FAILED",
        delegated.error.message,
        delegated.error.code,
      ),
    );
  }
  return success(delegated.value);
}
