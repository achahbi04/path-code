/**
 * Phase 5E1 — bounded private admission state. No I/O.
 * Synchronous reservation; never refunds after admit.
 */

import type { OpenAIAdapterNarrowingLimits, OpenAIBudgetSnapshot } from "./types.js";
import {
  DEFAULT_CUMULATIVE_OUTPUT_TOKENS,
  DEFAULT_CUMULATIVE_REQUEST_BODY_BYTES,
  DEFAULT_MAX_PROPOSAL_TEXT_UTF8_BYTES,
  DEFAULT_MAX_REQUEST_BODY_BYTES,
  DEFAULT_MAX_RESPONSE_ENVELOPE_BYTES,
  DEFAULT_MAX_TRANSPORT_ATTEMPTS,
  HARD_CUMULATIVE_OUTPUT_TOKENS,
  HARD_CUMULATIVE_REQUEST_BODY_BYTES,
  HARD_MAX_OUTPUT_TOKENS_PER_ATTEMPT,
  HARD_MAX_PROPOSAL_TEXT_UTF8_BYTES,
  HARD_MAX_REQUEST_BODY_BYTES,
  HARD_MAX_RESPONSE_ENVELOPE_BYTES,
  HARD_MAX_TRANSPORT_ATTEMPTS,
  MAX_IN_FLIGHT,
} from "./types.js";

export type EffectiveOpenAILimits = {
  readonly maxTransportAttempts: number;
  readonly maxRequestBodyBytes: number;
  readonly cumulativeRequestBodyBytes: number;
  readonly maxOutputTokensPerAttempt: number;
  readonly cumulativeOutputTokens: number;
  readonly maxResponseEnvelopeBytes: number;
  readonly maxProposalTextUtf8Bytes: number;
};

export type AdmissionRejectCode =
  | "BUSY"
  | "ATTEMPTS_EXHAUSTED"
  | "REQUEST_BODY_TOO_LARGE"
  | "CUMULATIVE_REQUEST_BYTES_EXCEEDED"
  | "OUTPUT_TOKENS_TOO_LARGE"
  | "CUMULATIVE_OUTPUT_TOKENS_EXCEEDED"
  | "INTEGER_OVERFLOW";

export type AdmissionReject = {
  readonly code: AdmissionRejectCode;
  readonly message: string;
};

export type AdmissionGrant = {
  readonly releaseSlot: () => void;
};

function narrow(
  hard: number,
  requested: number | undefined,
  label: string,
): number | { error: string } {
  if (requested === undefined) return hard;
  if (!Number.isSafeInteger(requested) || requested < 1) {
    return { error: `${label} must be a positive safe integer` };
  }
  if (requested > hard) {
    return { error: `${label} may not exceed hard ceiling ${hard}` };
  }
  return requested;
}

export function resolveOpenAILimits(
  narrowing: OpenAIAdapterNarrowingLimits | undefined,
  modelOutputCeiling: number,
): EffectiveOpenAILimits | { error: string } {
  if (
    !Number.isSafeInteger(modelOutputCeiling) ||
    modelOutputCeiling < 1 ||
    modelOutputCeiling > HARD_MAX_OUTPUT_TOKENS_PER_ATTEMPT
  ) {
    return { error: "model maxOutputTokensCeiling invalid" };
  }

  const attempts = narrow(
    Math.min(DEFAULT_MAX_TRANSPORT_ATTEMPTS, HARD_MAX_TRANSPORT_ATTEMPTS),
    narrowing?.maxTransportAttempts,
    "maxTransportAttempts",
  );
  if (typeof attempts === "object") return attempts;

  const reqBody = narrow(
    Math.min(DEFAULT_MAX_REQUEST_BODY_BYTES, HARD_MAX_REQUEST_BODY_BYTES),
    narrowing?.maxRequestBodyBytes,
    "maxRequestBodyBytes",
  );
  if (typeof reqBody === "object") return reqBody;

  const cumReq = narrow(
    Math.min(
      DEFAULT_CUMULATIVE_REQUEST_BODY_BYTES,
      HARD_CUMULATIVE_REQUEST_BODY_BYTES,
    ),
    narrowing?.cumulativeRequestBodyBytes,
    "cumulativeRequestBodyBytes",
  );
  if (typeof cumReq === "object") return cumReq;

  const outPer = narrow(
    Math.min(modelOutputCeiling, HARD_MAX_OUTPUT_TOKENS_PER_ATTEMPT),
    narrowing?.maxOutputTokensPerAttempt,
    "maxOutputTokensPerAttempt",
  );
  if (typeof outPer === "object") return outPer;

  const cumOut = narrow(
    Math.min(DEFAULT_CUMULATIVE_OUTPUT_TOKENS, HARD_CUMULATIVE_OUTPUT_TOKENS),
    narrowing?.cumulativeOutputTokens,
    "cumulativeOutputTokens",
  );
  if (typeof cumOut === "object") return cumOut;

  const envBytes = narrow(
    Math.min(
      DEFAULT_MAX_RESPONSE_ENVELOPE_BYTES,
      HARD_MAX_RESPONSE_ENVELOPE_BYTES,
    ),
    narrowing?.maxResponseEnvelopeBytes,
    "maxResponseEnvelopeBytes",
  );
  if (typeof envBytes === "object") return envBytes;

  const textBytes = narrow(
    Math.min(
      DEFAULT_MAX_PROPOSAL_TEXT_UTF8_BYTES,
      HARD_MAX_PROPOSAL_TEXT_UTF8_BYTES,
    ),
    narrowing?.maxProposalTextUtf8Bytes,
    "maxProposalTextUtf8Bytes",
  );
  if (typeof textBytes === "object") return textBytes;

  if (cumReq < reqBody) {
    return { error: "cumulativeRequestBodyBytes must be >= maxRequestBodyBytes" };
  }
  if (cumOut < outPer) {
    return { error: "cumulativeOutputTokens must be >= maxOutputTokensPerAttempt" };
  }

  return {
    maxTransportAttempts: attempts,
    maxRequestBodyBytes: reqBody,
    cumulativeRequestBodyBytes: cumReq,
    maxOutputTokensPerAttempt: outPer,
    cumulativeOutputTokens: cumOut,
    maxResponseEnvelopeBytes: envBytes,
    maxProposalTextUtf8Bytes: textBytes,
  };
}

/**
 * Private admission gate used by the adapter. Exported for P1 falsification
 * targeting of the cumulative-output predicate only.
 */
export function wouldExceedCumulativeOutput(
  reservedOutputTokens: number,
  requestedMaxOutputTokens: number,
  cumulativeOutputTokens: number,
): boolean {
  if (
    !Number.isSafeInteger(reservedOutputTokens) ||
    !Number.isSafeInteger(requestedMaxOutputTokens) ||
    !Number.isSafeInteger(cumulativeOutputTokens)
  ) {
    return true;
  }
  const next = reservedOutputTokens + requestedMaxOutputTokens;
  if (!Number.isSafeInteger(next)) return true;
  return next > cumulativeOutputTokens;
}

export class OpenAIAdmissionBudget {
  private reservedAttempts = 0;
  private reservedRequestBytes = 0;
  private reservedOutputTokens = 0;
  private inFlight = 0;
  private readonly limits: EffectiveOpenAILimits;

  constructor(limits: EffectiveOpenAILimits) {
    this.limits = limits;
  }

  snapshot(): OpenAIBudgetSnapshot {
    return Object.freeze({
      reservedAttempts: this.reservedAttempts,
      maxTransportAttempts: this.limits.maxTransportAttempts,
      reservedRequestBytes: this.reservedRequestBytes,
      cumulativeRequestBodyBytes: this.limits.cumulativeRequestBodyBytes,
      reservedOutputTokens: this.reservedOutputTokens,
      cumulativeOutputTokens: this.limits.cumulativeOutputTokens,
      inFlight: this.inFlight,
    });
  }

  /**
   * Synchronously reserve attempt + bytes + output tokens + in-flight slot.
   * On success, counters are permanently consumed; releaseSlot only clears inFlight.
   */
  tryAdmit(args: {
    readonly bodyBytes: number;
    readonly requestedMaxOutputTokens: number;
  }): AdmissionGrant | AdmissionReject {
    if (this.inFlight >= MAX_IN_FLIGHT) {
      return { code: "BUSY", message: "adapter transport in flight" };
    }
    if (args.bodyBytes > this.limits.maxRequestBodyBytes) {
      return {
        code: "REQUEST_BODY_TOO_LARGE",
        message: "HTTP request body exceeds per-attempt ceiling",
      };
    }
    if (args.requestedMaxOutputTokens > this.limits.maxOutputTokensPerAttempt) {
      return {
        code: "OUTPUT_TOKENS_TOO_LARGE",
        message: "requested output tokens exceed per-attempt ceiling",
      };
    }
    if (this.reservedAttempts + 1 > this.limits.maxTransportAttempts) {
      return {
        code: "ATTEMPTS_EXHAUSTED",
        message: "transport attempt budget exhausted",
      };
    }
    const nextBytes = this.reservedRequestBytes + args.bodyBytes;
    if (!Number.isSafeInteger(nextBytes)) {
      return { code: "INTEGER_OVERFLOW", message: "request byte counter overflow" };
    }
    if (nextBytes > this.limits.cumulativeRequestBodyBytes) {
      return {
        code: "CUMULATIVE_REQUEST_BYTES_EXCEEDED",
        message: "cumulative request-body budget exceeded",
      };
    }
    if (
      wouldExceedCumulativeOutput(
        this.reservedOutputTokens,
        args.requestedMaxOutputTokens,
        this.limits.cumulativeOutputTokens,
      )
    ) {
      return {
        code: "CUMULATIVE_OUTPUT_TOKENS_EXCEEDED",
        message: "cumulative reserved output-token budget exceeded",
      };
    }

    // Reserve ALL counters before any transport / await. Never refunded.
    this.reservedAttempts += 1;
    this.reservedRequestBytes = nextBytes;
    this.reservedOutputTokens += args.requestedMaxOutputTokens;
    this.inFlight += 1;
    let released = false;
    return {
      releaseSlot: () => {
        if (released) return;
        released = true;
        if (this.inFlight > 0) this.inFlight -= 1;
      },
    };
  }
}
