/**
 * Prepare an immutable ExecutionEvidencePlan — association only, no execution.
 */

import type { Result } from "../../domain/result.js";
import { failure, success } from "../../domain/result.js";
import {
  resolveRegisteredPreparedValidationPlan,
  type PreparedCheckAssociation,
} from "../../validation/binding.js";
import type { ValidationCheckKind } from "../../validation/types.js";
import { resolveRegisteredBoundReasoningAssociation } from "../association.js";
import type {
  NonEmptyReadonlyArray,
  ReferenceBoundClaim,
} from "../types.js";
import {
  MAX_ASSIGNMENT_ROWS,
  MAX_EXECUTION_CLAIMS,
  MAX_SELECTED_CHECKS_PER_CLAIM,
  isNonEmptyIdWithinLimit,
} from "./bounds.js";
import { evidenceFailure, type ExecutionEvidenceFailure } from "./failures.js";
import {
  nextEvidencePlanCorrelationId,
  registerExecutionEvidencePlan,
  type RetainedPreparedCheck,
} from "./registry.js";
import type {
  ClaimCheckAssignmentInput,
  ExecutionEvidencePlan,
  FrozenClaimCheckAssignment,
  PrepareExecutionEvidencePlanInput,
} from "./types.js";

function isExecutionClaim(
  claim: ReferenceBoundClaim,
): claim is ReferenceBoundClaim & {
  kind: "DEFINES" | "BEHAVES";
  requiredVerification: {
    method: "EXECUTION";
    checkKinds: NonEmptyReadonlyArray<ValidationCheckKind>;
  };
} {
  return (
    (claim.kind === "DEFINES" || claim.kind === "BEHAVES") &&
    claim.requiredVerification.method === "EXECUTION"
  );
}

function asNonEmptyIds(
  ids: readonly string[],
): NonEmptyReadonlyArray<string> | undefined {
  if (ids.length === 0) {
    return undefined;
  }
  return ids as NonEmptyReadonlyArray<string>;
}

function asNonEmptyKinds(
  kinds: readonly ValidationCheckKind[],
): NonEmptyReadonlyArray<ValidationCheckKind> | undefined {
  if (kinds.length === 0) {
    return undefined;
  }
  return kinds as NonEmptyReadonlyArray<ValidationCheckKind>;
}

function copyAssignments(
  assignments: readonly ClaimCheckAssignmentInput[],
): Result<ClaimCheckAssignmentInput[], ExecutionEvidenceFailure> {
  if (!Array.isArray(assignments)) {
    return failure(
      evidenceFailure("INVALID_INPUT", "assignments must be an array"),
    );
  }
  if (assignments.length > MAX_ASSIGNMENT_ROWS) {
    return failure(
      evidenceFailure(
        "LIMIT_EXCEEDED",
        `Assignment rows exceed ${MAX_ASSIGNMENT_ROWS}`,
      ),
    );
  }
  const copied: ClaimCheckAssignmentInput[] = [];
  for (const row of assignments) {
    if (row === null || typeof row !== "object") {
      return failure(
        evidenceFailure("INVALID_INPUT", "assignment row must be an object"),
      );
    }
    if (typeof row.claimId !== "string" || !isNonEmptyIdWithinLimit(row.claimId)) {
      return failure(
        evidenceFailure("INVALID_INPUT", "assignment claimId is invalid"),
      );
    }
    if (!Array.isArray(row.selectedCheckIds)) {
      return failure(
        evidenceFailure(
          "INVALID_CLAIM_CHECK_MAPPING",
          "selectedCheckIds must be an array",
        ),
      );
    }
    const selected: string[] = [];
    for (const id of row.selectedCheckIds) {
      if (typeof id !== "string" || !isNonEmptyIdWithinLimit(id)) {
        return failure(
          evidenceFailure(
            "INVALID_CLAIM_CHECK_MAPPING",
            "selected check id is invalid",
          ),
        );
      }
      selected.push(id);
    }
    copied.push(
      Object.freeze({
        claimId: row.claimId,
        selectedCheckIds: Object.freeze([...selected]),
      }),
    );
  }
  return success(copied);
}

function observationInDeclared(
  observation: { readonly entry?: unknown },
  declared: readonly { readonly entry?: unknown }[],
): boolean {
  for (const item of declared) {
    if (item === observation) {
      return true;
    }
  }
  return false;
}

/**
 * Authenticate reasoning/catalog/Validation plan and freeze claim→check mapping.
 * Grants no process permission and does not execute.
 */
export async function prepareExecutionEvidencePlan(
  input: PrepareExecutionEvidencePlanInput,
): Promise<Result<ExecutionEvidencePlan, ExecutionEvidenceFailure>> {
  if (input === null || typeof input !== "object") {
    return failure(evidenceFailure("INVALID_INPUT", "input must be an object"));
  }

  const assignmentsCopy = copyAssignments(input.assignments);
  if (!assignmentsCopy.ok) {
    return assignmentsCopy;
  }
  const assignments = assignmentsCopy.value;

  const bound = resolveRegisteredBoundReasoningAssociation(
    input.reasoning,
    input.catalog,
  );
  if (!bound.ok) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        bound.error.message,
        bound.error.code,
      ),
    );
  }

  const prepared = resolveRegisteredPreparedValidationPlan(input.validationPlan);
  if (!prepared.ok) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        prepared.error.message,
        prepared.error.code,
      ),
    );
  }

  const reasoning = bound.value.reasoning;
  const catalog = bound.value.catalog;
  const plan = prepared.value.plan;

  if (
    reasoning.context.workspace !== catalog.workspace ||
    reasoning.context.snapshot !== catalog.snapshot
  ) {
    return failure(
      evidenceFailure(
        "CONTEXT_MISMATCH",
        "Bound reasoning context does not match registered catalog context",
      ),
    );
  }
  if (
    plan.workspace !== reasoning.context.workspace ||
    plan.snapshot !== reasoning.context.snapshot
  ) {
    return failure(
      evidenceFailure(
        "CONTEXT_MISMATCH",
        "Validation plan workspace/snapshot is not the bound reasoning context",
      ),
    );
  }

  const executionClaims = reasoning.claims.filter(isExecutionClaim);
  if (executionClaims.length === 0) {
    return failure(
      evidenceFailure(
        "NO_EXECUTION_OBLIGATIONS",
        "Reasoning contains no EXECUTION obligations",
      ),
    );
  }
  if (executionClaims.length > MAX_EXECUTION_CLAIMS) {
    return failure(
      evidenceFailure(
        "LIMIT_EXCEEDED",
        `EXECUTION claims exceed ${MAX_EXECUTION_CLAIMS}`,
      ),
    );
  }

  const claimById = new Map<string, ReferenceBoundClaim>();
  for (const claim of reasoning.claims) {
    claimById.set(claim.claimId, claim);
  }

  const checkById = new Map<string, PreparedCheckAssociation>();
  for (const check of prepared.value.checks) {
    checkById.set(check.id, check);
  }

  if (assignments.length !== executionClaims.length) {
    return failure(
      evidenceFailure(
        "INVALID_CLAIM_CHECK_MAPPING",
        "Every EXECUTION claim requires exactly one assignment row",
      ),
    );
  }

  const seenClaimIds = new Set<string>();
  const frozenAssignments: FrozenClaimCheckAssignment[] = [];

  for (const row of assignments) {
    if (seenClaimIds.has(row.claimId)) {
      return failure(
        evidenceFailure(
          "INVALID_CLAIM_CHECK_MAPPING",
          "Duplicate claim assignment",
        ),
      );
    }
    seenClaimIds.add(row.claimId);

    const claim = claimById.get(row.claimId);
    if (claim === undefined) {
      return failure(
        evidenceFailure(
          "INVALID_CLAIM_CHECK_MAPPING",
          "Unknown claim ID within registered reasoning",
        ),
      );
    }
    if (!isExecutionClaim(claim)) {
      return failure(
        evidenceFailure(
          "INVALID_CLAIM_CHECK_MAPPING",
          "Assignment targets a non-EXECUTION claim",
        ),
      );
    }

    if (row.selectedCheckIds.length === 0) {
      return failure(
        evidenceFailure(
          "INVALID_CLAIM_CHECK_MAPPING",
          "selectedCheckIds must be nonempty",
        ),
      );
    }
    if (row.selectedCheckIds.length > MAX_SELECTED_CHECKS_PER_CLAIM) {
      return failure(
        evidenceFailure(
          "LIMIT_EXCEEDED",
          `Selected checks per claim exceed ${MAX_SELECTED_CHECKS_PER_CLAIM}`,
        ),
      );
    }

    const selectedSeen = new Set<string>();
    const selectedKinds: ValidationCheckKind[] = [];
    for (const checkId of row.selectedCheckIds) {
      if (selectedSeen.has(checkId)) {
        return failure(
          evidenceFailure(
            "INVALID_CLAIM_CHECK_MAPPING",
            "Duplicate selected check ID in assignment",
          ),
        );
      }
      selectedSeen.add(checkId);
      const check = checkById.get(checkId);
      if (check === undefined) {
        return failure(
          evidenceFailure(
            "INVALID_CLAIM_CHECK_MAPPING",
            "Selected check ID is not in the registered prepared Validation plan",
          ),
        );
      }
      const requiredKinds = claim.requiredVerification.checkKinds;
      if (!requiredKinds.includes(check.kind)) {
        return failure(
          evidenceFailure(
            "INVALID_CLAIM_CHECK_MAPPING",
            "Selected check kind is not among the claim's required kinds",
          ),
        );
      }
      selectedKinds.push(check.kind);
    }

    for (const requiredKind of claim.requiredVerification.checkKinds) {
      if (!selectedKinds.includes(requiredKind)) {
        return failure(
          evidenceFailure(
            "INVALID_CLAIM_CHECK_MAPPING",
            "Assignment does not cover every required check kind",
          ),
        );
      }
    }

    for (const subject of claim.subjects) {
      if (!observationInDeclared(subject, plan.declaredObservations)) {
        return failure(
          evidenceFailure(
            "SOURCE_NOT_IN_VALIDATION_SCOPE",
            "EXECUTION claim source observation is not among declared Validation inputs",
          ),
        );
      }
    }

    const selectedIds = asNonEmptyIds(row.selectedCheckIds);
    const kinds = asNonEmptyKinds(selectedKinds);
    const required = asNonEmptyKinds(claim.requiredVerification.checkKinds);
    if (
      selectedIds === undefined ||
      kinds === undefined ||
      required === undefined
    ) {
      return failure(
        evidenceFailure(
          "INVALID_CLAIM_CHECK_MAPPING",
          "Nonempty association required",
        ),
      );
    }

    frozenAssignments.push(
      Object.freeze({
        claimId: claim.claimId,
        claimKind: claim.kind,
        requiredCheckKinds: required,
        selectedCheckIds: selectedIds,
        selectedCheckKinds: kinds,
      }),
    );
  }

  for (const claim of executionClaims) {
    if (!seenClaimIds.has(claim.claimId)) {
      return failure(
        evidenceFailure(
          "INVALID_CLAIM_CHECK_MAPPING",
          "EXECUTION claim lacks an assignment",
        ),
      );
    }
  }

  const orderedChecks: RetainedPreparedCheck[] = prepared.value.checks.map(
    (check) =>
      Object.freeze({
        id: check.id,
        kind: check.kind,
        preparedProcess: check.preparedProcess,
      }),
  );

  const nonExecutionClaimIds = reasoning.claims
    .filter((c) => !isExecutionClaim(c))
    .map((c) => c.claimId);

  const publicPlan = Object.freeze({
    planCorrelationId: nextEvidencePlanCorrelationId(),
    reasoningCorrelationId: `reasoning-${reasoning.claims.map((c) => c.claimId).join("+").slice(0, 64)}`,
    validationPlanId: plan.planId,
    assignmentCount: frozenAssignments.length,
    executionObligationCount: executionClaims.length,
  }) as unknown as ExecutionEvidencePlan;

  registerExecutionEvidencePlan(publicPlan, {
    plan: publicPlan,
    reasoning,
    catalogHandle: input.catalog,
    catalog,
    validationPlan: plan,
    assignments: Object.freeze([...frozenAssignments]),
    orderedChecks: Object.freeze(orderedChecks),
    executionClaims: Object.freeze([...executionClaims]),
    nonExecutionClaimIds: Object.freeze([...nonExecutionClaimIds]),
    declaredObservations: plan.declaredObservations,
  });

  return success(publicPlan);
}
