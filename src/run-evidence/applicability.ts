/**
 * Fresh applicability for a registered Run Evidence record — delegates to Validation.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import { checkValidationResultApplicability } from "../validation/index.js";
import type { PreparedValidationPlan } from "../validation/types.js";
import { lookupRunEvidence } from "./internal/registry.js";
import type {
  RunEvidenceApplicabilityFailure,
  RunEvidenceApplicabilityObservation,
  RunEvidenceRecord,
} from "./types.js";

function appFailure(
  code: RunEvidenceApplicabilityFailure["code"],
  message: string,
): RunEvidenceApplicabilityFailure {
  return { code, message };
}

export async function checkRunEvidenceApplicability(
  evidence: RunEvidenceRecord,
  plan: PreparedValidationPlan,
  workspace: WorkspaceBoundary,
): Promise<
  Result<RunEvidenceApplicabilityObservation, RunEvidenceApplicabilityFailure>
> {
  const association = lookupRunEvidence(evidence);
  if (association === undefined) {
    return failure(
      appFailure(
        "EVIDENCE_NOT_REGISTERED",
        "RunEvidenceRecord is not registered or was reconstructed/copied",
      ),
    );
  }
  if (association.plan !== plan || association.evidence !== evidence) {
    return failure(
      appFailure("PLAN_MISMATCH", "Evidence is not bound to the supplied plan"),
    );
  }
  if (association.plan.workspace !== workspace) {
    return failure(
      appFailure(
        "WORKSPACE_MISMATCH",
        "Evidence/plan workspace does not match caller",
      ),
    );
  }

  const observedAtMs = Date.now();
  const assessment = await checkValidationResultApplicability(
    association.result,
    association.plan,
    workspace,
  );
  if (!assessment.ok) {
    return success({
      observedAtMs,
      applicable: false,
      code: assessment.error.code,
      message: assessment.error.message,
    });
  }
  return success({
    observedAtMs,
    applicable: true,
    code: null,
    message: null,
  });
}
