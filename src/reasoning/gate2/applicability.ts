/**
 * Fresh applicability for a historical ExecutionEvidenceAssessment.
 * Does not rerun processes, upgrade verdicts, or grant edit permission.
 */

import type { Result } from "../../domain/result.js";
import { failure, success } from "../../domain/result.js";
import { checkEngineeringRunApplicability } from "../../engineering-run/index.js";
import { checkReferenceBoundReasoningApplicability } from "../applicability.js";
import { requireLiveCatalog } from "../catalog.js";
import type { ReasoningApplicabilityFailure } from "../failures.js";
import { evidenceFailure, type ExecutionEvidenceFailure } from "./failures.js";
import { lookupExecutionEvidenceAssessment } from "./registry.js";
import type {
  ExecutionEvidenceApplicabilityObservation,
  ExecutionEvidenceAssessment,
} from "./types.js";

function formatReasoningApplicabilityFailure(
  error: ReasoningApplicabilityFailure,
): { message: string; causeCode: string } {
  if (error.kind === "REFUSAL") {
    return {
      message: error.refusal.reason,
      causeCode: error.refusal.code,
    };
  }
  return { message: error.message, causeCode: error.code };
}

/**
 * Authenticate assessment and return a NEW point-in-time applicability observation.
 * Historical assessment remains immutable.
 */
export async function checkExecutionEvidenceAssessmentApplicability(
  assessment: ExecutionEvidenceAssessment,
): Promise<
  Result<ExecutionEvidenceApplicabilityObservation, ExecutionEvidenceFailure>
> {
  const registration = lookupExecutionEvidenceAssessment(assessment);
  if (
    registration === undefined ||
    registration.assessment !== assessment
  ) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        "ExecutionEvidenceAssessment is not registered or was reconstructed/copied",
      ),
    );
  }

  const planReg = registration.planRegistration;
  const liveCatalog = requireLiveCatalog(planReg.catalogHandle);
  if (!liveCatalog.ok) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        liveCatalog.error.message,
        liveCatalog.error.code,
      ),
    );
  }

  const engApp = await checkEngineeringRunApplicability(
    registration.engineeringRun,
    planReg.validationPlan,
    planReg.validationPlan.workspace,
  );
  if (!engApp.ok) {
    return failure(
      evidenceFailure(
        "APPLICABILITY_NOT_ESTABLISHED",
        engApp.error.message,
        engApp.error.code,
      ),
    );
  }

  const reasoningApp = await checkReferenceBoundReasoningApplicability(
    planReg.reasoning,
    planReg.catalogHandle,
  );
  if (!reasoningApp.ok) {
    const formatted = formatReasoningApplicabilityFailure(reasoningApp.error);
    return failure(
      evidenceFailure(
        "APPLICABILITY_NOT_ESTABLISHED",
        formatted.message,
        formatted.causeCode,
      ),
    );
  }

  const applicable =
    engApp.value.applicable === true && reasoningApp.value.applicable === true;

  return success(
    Object.freeze({
      observedAtMs: Date.now(),
      applicable,
      code: applicable
        ? null
        : !engApp.value.applicable
          ? engApp.value.code
          : "REASONING_NOT_APPLICABLE",
      message: applicable
        ? null
        : !engApp.value.applicable
          ? engApp.value.message
          : "Bound reasoning applicability was not established",
      assessmentCorrelationId: assessment.assessmentCorrelationId,
    }),
  );
}
