/**
 * Named coordinator predicates — falsification targets for P1–P3.
 * Production cycle imports these; probes may temporarily weaken one.
 */

import type { Result } from "../domain/result.js";
import type { ReferenceCatalog } from "../reasoning/catalog.js";
import type { ReferenceBoundReasoning } from "../reasoning/types.js";
import { checkReferenceBoundReasoningApplicability } from "../reasoning/applicability.js";
import type { ReasoningApplicabilityFailure } from "../reasoning/failures.js";
import type { ReferenceBoundApplicabilitySuccess } from "../reasoning/applicability.js";
import {
  inspectValidationPlanAuthorizationCompatibility,
  type ValidationPlanAuthorizationCompatibility,
} from "../validation/binding.js";
import type { ValidationBindingFailure } from "../validation/binding.js";
import type {
  PreparedValidationPlan,
  ValidationAuthorization,
} from "../validation/types.js";

/** P1 — supplied-authorization preflight (must refuse before Brain). */
export function preflightValidationAuthorization(
  plan: PreparedValidationPlan,
  authorization: ValidationAuthorization,
): Result<
  ValidationPlanAuthorizationCompatibility,
  ValidationBindingFailure
> {
  return inspectValidationPlanAuthorizationCompatibility(plan, authorization);
}

/** P2 — revision ceiling admission. */
export function mayAdmitProposalRevision(
  completedAttempts: number,
  maxBrainAttempts: number,
): boolean {
  return completedAttempts < maxBrainAttempts;
}

/** P3 — between-stage Gate 1 applicability recheck. */
export async function recheckBoundReasoningApplicability(
  reasoning: ReferenceBoundReasoning,
  catalog: ReferenceCatalog,
): Promise<
  Result<ReferenceBoundApplicabilitySuccess, ReasoningApplicabilityFailure>
> {
  return checkReferenceBoundReasoningApplicability(reasoning, catalog);
}
