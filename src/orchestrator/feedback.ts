/**
 * Gate 1 refusal → revision eligibility and safe diagnostic templates.
 * Does not copy arbitrary error.message into model context.
 */

import type { ReasoningBindFailure } from "../reasoning/failures.js";
import type { ReasoningInputFailureCode } from "../reasoning/failures.js";
import type { CycleOriginCode } from "./failures.js";

const ELIGIBLE_INPUT: ReadonlySet<ReasoningInputFailureCode> = new Set([
  "INVALID_JSON",
  "DUPLICATE_CLAIM_ID",
  "DUPLICATE_HYPOTHESIS_ID",
  "DANGLING_INFERENCE_BASIS",
]);

export type Gate1Disposition =
  | { readonly action: "REVISE"; readonly code: string; readonly claimId?: string }
  | {
      readonly action: "TERMINAL";
      readonly origin: CycleOriginCode;
      readonly code: string;
      readonly claimId?: string;
    };

export function dispositionForGate1Failure(
  error: ReasoningBindFailure,
): Gate1Disposition {
  if (error.kind === "REFUSAL") {
    const code = error.refusal.code;
    if (
      code === "UNBOUND_CLAIM" ||
      code === "EVIDENCE_IDENTITY_MISMATCH" ||
      code === "GROUNDING_OVERCLAIM"
    ) {
      return {
        action: "REVISE",
        code,
        claimId: error.refusal.claimId,
      };
    }
    if (code === "STALE_EVIDENCE") {
      return {
        action: "TERMINAL",
        origin: "EVIDENCE_STALE",
        code,
        claimId: error.refusal.claimId,
      };
    }
    if (code === "CLAIM_OUTSIDE_ADMITTED_SET") {
      return {
        action: "TERMINAL",
        origin: "SCOPE_DENIED",
        code,
        claimId: error.refusal.claimId,
      };
    }
    if (code === "UNVERIFIABLE_IN_PRECONDITION") {
      return {
        action: "TERMINAL",
        origin: "UNVERIFIABLE_CONTEXT",
        code,
        claimId: error.refusal.claimId,
      };
    }
    return {
      action: "TERMINAL",
      origin: "INTERNAL_CONTRACT",
      code: String(code),
      claimId: error.refusal.claimId,
    };
  }

  if (error.kind === "INPUT") {
    if (ELIGIBLE_INPUT.has(error.code)) {
      return { action: "REVISE", code: error.code };
    }
    return {
      action: "TERMINAL",
      origin: "INPUT_TERMINAL",
      code: error.code,
    };
  }

  if (error.kind === "CATALOG") {
    return {
      action: "TERMINAL",
      origin: "CATALOG_INVALID",
      code: error.code,
    };
  }

  return {
    action: "TERMINAL",
    origin: "INTERNAL_CONTRACT",
    code: "UNKNOWN_GATE1_DISCRIMINANT",
  };
}

/** Fixed safe diagnostic templates — no raw messages, stacks, or paths. */
export function buildDiagnosticText(
  disposition: Gate1Disposition,
): string {
  const claim =
    "claimId" in disposition && disposition.claimId !== undefined
      ? ` claim=${disposition.claimId}`
      : "";
  if (disposition.action === "REVISE") {
    return `Gate1 refusal code=${disposition.code}${claim}. Revise the reasoning proposal JSON only. Do not invent authority, plans, approvals, or filesystem paths.`;
  }
  return `Gate1 terminal code=${disposition.code}${claim}.`;
}

export function dispositionForApplicabilityFailure(
  error: ReasoningBindFailure,
): Gate1Disposition {
  // Applicability failures are always terminal (no revision against stale inputs).
  if (error.kind === "REFUSAL") {
    if (error.refusal.code === "STALE_EVIDENCE") {
      return {
        action: "TERMINAL",
        origin: "EVIDENCE_STALE",
        code: error.refusal.code,
        claimId: error.refusal.claimId,
      };
    }
    return {
      action: "TERMINAL",
      origin: "APPLICABILITY_FAILED",
      code: error.refusal.code,
      claimId: error.refusal.claimId,
    };
  }
  if (error.kind === "CATALOG") {
    return {
      action: "TERMINAL",
      origin: "CATALOG_INVALID",
      code: error.code,
    };
  }
  if (error.kind === "INPUT") {
    return {
      action: "TERMINAL",
      origin: "INPUT_TERMINAL",
      code: error.code,
    };
  }
  return {
    action: "TERMINAL",
    origin: "INTERNAL_CONTRACT",
    code: "UNKNOWN_APPLICABILITY",
  };
}
