/**
 * Phase 5D1 — Engineering Brain facade + bounded invocation controller.
 *
 * Single-flight reservation is synchronous before any await and before adapter
 * invocation. Dispatch budget is consumed immediately before the adapter call.
 * Timeout does not prove remote work or billing stopped.
 */

import { randomUUID } from "node:crypto";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  DEFAULT_MAX_DISPATCHES,
  HARD_MAX_DISPATCHES,
  MIN_MAX_DISPATCHES,
  MAX_RESPONSE_UTF8_BYTES,
  isSafePositiveInt,
  utf8ByteLength,
} from "./bounds.js";
import { readMonotonicMs, readWallMs } from "./clock.js";
import {
  configurationFailure,
  invocationFailure,
  type BrainConfigurationFailure,
  type BrainInvocationFailure,
  type BrainInvocationFailureCode,
} from "./failures.js";
import {
  normalizeInvocationRequest,
  resolveEffectiveCeilings,
} from "./normalize.js";
import { finalizeReceipt, observeUsage } from "./receipt.js";
import type {
  AdapterSettlementObservation,
  BrainDescriptorView,
  BrainInvocationRequest,
  BrainInvocationSuccess,
  EngineeringBrain,
  EngineeringBrainAdapter,
  EngineeringBrainAdapterReply,
  EngineeringBrainNarrowingLimits,
  FrozenNormalizedAdapterPacket,
  UntrustedBrainResponse,
} from "./types.js";

type TerminalDecision =
  | { readonly kind: "SUCCESS"; readonly response: UntrustedBrainResponse; readonly reply: EngineeringBrainAdapterReply }
  | {
      readonly kind: "FAILURE";
      readonly code: BrainInvocationFailureCode;
      readonly message: string;
      readonly retryAfterMs?: number;
      readonly reply?: EngineeringBrainAdapterReply;
    };

type OperationState = {
  readonly operationId: string;
  readonly invocationId: string;
  readonly correlationId: string | null;
  readonly startedWallMs: number;
  readonly startedMonoMs: number;
  readonly deadlineMonoMs: number;
  readonly childController: AbortController;
  readonly callerSignal: AbortSignal | undefined;
  deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  callerAbortHandler: (() => void) | undefined;
  dispatched: boolean;
  budgetConsumed: 0 | 1;
  abortRequested: boolean;
  adapterSettlement: AdapterSettlementObservation;
  terminal: TerminalDecision | undefined;
  consumerSettled: boolean;
  preparedRequestUtf8Bytes: number | null;
  responseProfile: FrozenNormalizedAdapterPacket["responseProfile"] | null;
  purpose: FrozenNormalizedAdapterPacket["purpose"] | null;
  configuredMaxOutputTokens: number | null;
  configuredTimeoutMs: number | null;
  configuredMaxResponseUtf8Bytes: number | null;
  /** Drop heavy packet refs after consumer terminal when possible. */
  packet: FrozenNormalizedAdapterPacket | undefined;
};

type BrainState = {
  disposed: boolean;
  inFlight: OperationState | null;
  dispatchedCount: number;
  readonly maxDispatches: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilities: EngineeringBrainAdapter["descriptor"]["capabilities"];
  readonly invokeAdapter: EngineeringBrainAdapter["invoke"];
  readonly narrowing: EngineeringBrainNarrowingLimits | undefined;
  readonly maxTimeoutMsCeiling: number | undefined;
  readonly maxOutputTokensCeiling: number | undefined;
  readonly maxResponseUtf8BytesCeiling: number | undefined;
  readonly maxPreparedRequestUtf8BytesCeiling: number | undefined;
};

function freezeCapabilities(
  caps: EngineeringBrainAdapter["descriptor"]["capabilities"],
): EngineeringBrainAdapter["descriptor"]["capabilities"] {
  return Object.freeze({
    textInput: true as const,
    textOutput: true as const,
    acceptedResponseProfiles: Object.freeze(
      caps.acceptedResponseProfiles.map((p) => Object.freeze({ ...p })),
    ),
    honorsOutputTokenLimit: caps.honorsOutputTokenLimit,
    cancellationDeclared: caps.cancellationDeclared,
    ...(caps.maxInputUtf8Bytes !== undefined
      ? { maxInputUtf8Bytes: caps.maxInputUtf8Bytes }
      : {}),
    ...(caps.maxOutputUtf8Bytes !== undefined
      ? { maxOutputUtf8Bytes: caps.maxOutputUtf8Bytes }
      : {}),
    ...(caps.maxOutputTokens !== undefined
      ? { maxOutputTokens: caps.maxOutputTokens }
      : {}),
    ...(caps.maxTimeoutMs !== undefined
      ? { maxTimeoutMs: caps.maxTimeoutMs }
      : {}),
    ...(caps.contextWindowTokens !== undefined
      ? { contextWindowTokens: caps.contextWindowTokens }
      : {}),
    ...(caps.nativeSchemaConstrainedGeneration !== undefined
      ? {
          nativeSchemaConstrainedGeneration:
            caps.nativeSchemaConstrainedGeneration,
        }
      : {}),
  });
}

function safeAbortReason(): Error {
  return new Error("engineering-brain-abort");
}

function clearOperationResources(op: OperationState): void {
  if (op.deadlineTimer !== undefined) {
    clearTimeout(op.deadlineTimer);
    op.deadlineTimer = undefined;
  }
  if (op.callerAbortHandler !== undefined && op.callerSignal !== undefined) {
    op.callerSignal.removeEventListener("abort", op.callerAbortHandler);
    op.callerAbortHandler = undefined;
  }
}

function latchTerminal(op: OperationState, decision: TerminalDecision): boolean {
  if (op.terminal !== undefined) {
    return false;
  }
  op.terminal = decision;
  return true;
}

function buildZeroDispatchReceipt(
  state: BrainState,
  args: {
    invocationId: string | null;
    correlationId: string | null;
    code: BrainInvocationFailureCode;
    startedWallMs: number;
    startedMonoMs: number;
    abortRequested: boolean;
    responseProfile?: FrozenNormalizedAdapterPacket["responseProfile"] | null;
    purpose?: FrozenNormalizedAdapterPacket["purpose"] | null;
    configuredMaxOutputTokens?: number | null;
    configuredTimeoutMs?: number | null;
    configuredMaxResponseUtf8Bytes?: number | null;
    preparedRequestUtf8Bytes?: number | null;
  },
) {
  const finishedWallMs = readWallMs();
  const finishedMonoMs = readMonotonicMs();
  return finalizeReceipt({
    invocationId: args.invocationId,
    correlationId: args.correlationId,
    providerId: state.providerId,
    modelId: state.modelId,
    responseProfile: args.responseProfile ?? null,
    purpose: args.purpose ?? null,
    configuredMaxOutputTokens: args.configuredMaxOutputTokens ?? null,
    configuredTimeoutMs: args.configuredTimeoutMs ?? null,
    configuredMaxResponseUtf8Bytes: args.configuredMaxResponseUtf8Bytes ?? null,
    preparedRequestUtf8Bytes: args.preparedRequestUtf8Bytes ?? null,
    responseUtf8Bytes: null,
    startedAtWallMs: args.startedWallMs,
    finishedAtWallMs: finishedWallMs,
    startedMonoMs: args.startedMonoMs,
    finishedMonoMs,
    adapterDispatched: false,
    attemptCount: 0,
    budgetConsumed: 0,
    outcome: "FAILURE",
    failureCode: args.code,
    abortRequested: args.abortRequested,
    adapterSettlement: { status: "NOT_DISPATCHED" },
    usage: { availability: "UNKNOWN" },
    providerRequestId: null,
    providerReportedModelId: null,
    telemetryWarnings: [],
  });
}

function normalizeAdapterReply(
  op: OperationState,
  reply: unknown,
  maxResponseUtf8Bytes: number,
): TerminalDecision {
  if (reply === null || typeof reply !== "object") {
    return {
      kind: "FAILURE",
      code: "MALFORMED_ADAPTER_RESPONSE",
      message: "adapter reply is not an object",
    };
  }
  const r = reply as EngineeringBrainAdapterReply;
  if (typeof r.kind !== "string" || typeof r.invocationId !== "string") {
    return {
      kind: "FAILURE",
      code: "MALFORMED_ADAPTER_RESPONSE",
      message: "adapter reply missing kind/invocationId",
    };
  }
  if (r.invocationId !== op.invocationId) {
    return {
      kind: "FAILURE",
      code: "MALFORMED_ADAPTER_RESPONSE",
      message: "adapter reply invocationId does not match",
    };
  }

  if (r.kind === "FAILURE") {
    const map: Record<string, BrainInvocationFailureCode> = {
      AUTHENTICATION: "AUTHENTICATION_FAILURE",
      RATE_LIMIT: "RATE_LIMITED",
      UNAVAILABLE: "PROVIDER_UNAVAILABLE",
      TRANSPORT: "TRANSPORT_FAILURE",
      OTHER: "TRANSPORT_FAILURE",
    };
    return {
      kind: "FAILURE",
      code: map[r.failureClass] ?? "TRANSPORT_FAILURE",
      message: "adapter reported provider failure",
      ...(typeof r.retryAfterMs === "number" && isSafePositiveInt(r.retryAfterMs)
        ? { retryAfterMs: r.retryAfterMs }
        : {}),
      reply: r,
    };
  }
  if (r.kind === "REFUSAL") {
    return {
      kind: "FAILURE",
      code: "PROVIDER_REFUSAL",
      message: "provider refused the request",
      reply: r,
    };
  }
  if (r.kind === "INCOMPLETE") {
    return {
      kind: "FAILURE",
      code: "INCOMPLETE_OUTPUT",
      message: "adapter reported incomplete generation",
      reply: r,
    };
  }
  if (r.kind !== "COMPLETE") {
    return {
      kind: "FAILURE",
      code: "MALFORMED_ADAPTER_RESPONSE",
      message: "adapter reply kind is unknown",
    };
  }
  if (typeof r.text !== "string") {
    return {
      kind: "FAILURE",
      code: "MALFORMED_ADAPTER_RESPONSE",
      message: "complete reply text must be a string",
    };
  }
  if (r.text.length === 0) {
    return {
      kind: "FAILURE",
      code: "EMPTY_RESPONSE",
      message: "complete reply text is empty",
      reply: r,
    };
  }
  const bytes = utf8ByteLength(r.text);
  if (bytes > maxResponseUtf8Bytes) {
    return {
      kind: "FAILURE",
      code: "RESPONSE_TOO_LARGE",
      message: "response exceeds configured byte ceiling",
      reply: r,
    };
  }
  if (r.toolCalls !== undefined) {
    if (!Array.isArray(r.toolCalls) || r.toolCalls.length > 0) {
      return {
        kind: "FAILURE",
        code: "UNEXPECTED_TOOL_CALLS",
        message: "tool-call-bearing reply is not usable for this profile",
        reply: r,
      };
    }
  }
  const response: UntrustedBrainResponse = Object.freeze({
    meaning: "UNTRUSTED_RESPONSE_TEXT" as const,
    text: r.text,
    responseProfile: op.responseProfile!,
  });
  return { kind: "SUCCESS", response, reply: r };
}

function releaseIfOwner(state: BrainState, op: OperationState): void {
  if (state.inFlight === op) {
    state.inFlight = null;
  }
}

/**
 * Reserve the in-flight slot. Must run synchronously before adapter dispatch.
 * Falsification probes may temporarily reorder this relative to adapter invoke;
 * do not weaken independent budget checks to manufacture an escape.
 */
function reserveInFlightSlot(state: BrainState, op: OperationState): void {
  state.inFlight = op;
}

function consumeDispatchBudget(state: BrainState, op: OperationState): void {
  state.dispatchedCount += 1;
  op.dispatched = true;
  op.budgetConsumed = 1;
  op.adapterSettlement = { status: "PENDING" };
}

export function createEngineeringBrain(
  reviewedAdapter: EngineeringBrainAdapter,
  optionalNarrowingLimits?: EngineeringBrainNarrowingLimits,
): Result<EngineeringBrain, BrainConfigurationFailure> {
  if (
    reviewedAdapter === null ||
    typeof reviewedAdapter !== "object" ||
    typeof reviewedAdapter.invoke !== "function" ||
    reviewedAdapter.descriptor === null ||
    typeof reviewedAdapter.descriptor !== "object"
  ) {
    return failure(
      configurationFailure("INVALID_ADAPTER", "reviewed adapter is invalid"),
    );
  }

  const descriptor = reviewedAdapter.descriptor;
  if (
    typeof descriptor.providerId !== "string" ||
    typeof descriptor.modelId !== "string" ||
    descriptor.capabilities === null ||
    typeof descriptor.capabilities !== "object"
  ) {
    return failure(
      configurationFailure("INVALID_DESCRIPTOR", "adapter descriptor is invalid"),
    );
  }
  if (
    utf8ByteLength(descriptor.providerId) < 1 ||
    utf8ByteLength(descriptor.providerId) > 128 ||
    utf8ByteLength(descriptor.modelId) < 1 ||
    utf8ByteLength(descriptor.modelId) > 128
  ) {
    return failure(
      configurationFailure("INVALID_DESCRIPTOR", "provider/model id bounds"),
    );
  }

  const caps = descriptor.capabilities;
  if (
    caps.textInput !== true ||
    caps.textOutput !== true ||
    !Array.isArray(caps.acceptedResponseProfiles) ||
    caps.acceptedResponseProfiles.length < 1 ||
    typeof caps.honorsOutputTokenLimit !== "boolean" ||
    typeof caps.cancellationDeclared !== "boolean"
  ) {
    return failure(
      configurationFailure(
        "INVALID_CAPABILITIES",
        "adapter capabilities are incomplete for this profile",
      ),
    );
  }

  let maxDispatches = DEFAULT_MAX_DISPATCHES;
  if (optionalNarrowingLimits?.maxDispatches !== undefined) {
    const n = optionalNarrowingLimits.maxDispatches;
    if (
      !isSafePositiveInt(n) ||
      n < MIN_MAX_DISPATCHES ||
      n > HARD_MAX_DISPATCHES
    ) {
      return failure(
        configurationFailure("INVALID_LIMITS", "maxDispatches out of range"),
      );
    }
    maxDispatches = n;
  }

  // Capture method with required receiver semantics.
  const invokeAdapter = reviewedAdapter.invoke.bind(reviewedAdapter);
  const frozenCaps = freezeCapabilities(caps);
  const frozenNarrowing =
    optionalNarrowingLimits === undefined
      ? undefined
      : Object.freeze({ ...optionalNarrowingLimits });

  const state: BrainState = {
    disposed: false,
    inFlight: null,
    dispatchedCount: 0,
    maxDispatches,
    providerId: descriptor.providerId,
    modelId: descriptor.modelId,
    capabilities: frozenCaps,
    invokeAdapter,
    narrowing: frozenNarrowing,
    maxTimeoutMsCeiling: frozenNarrowing?.maxTimeoutMs ?? caps.maxTimeoutMs,
    maxOutputTokensCeiling:
      frozenNarrowing?.maxOutputTokens ?? caps.maxOutputTokens,
    maxResponseUtf8BytesCeiling:
      frozenNarrowing?.maxResponseUtf8Bytes ?? caps.maxOutputUtf8Bytes,
    maxPreparedRequestUtf8BytesCeiling:
      frozenNarrowing?.maxPreparedRequestUtf8Bytes ?? caps.maxInputUtf8Bytes,
  };

  const brain: EngineeringBrain = {
    describe(): BrainDescriptorView {
      return Object.freeze({
        providerId: state.providerId,
        modelId: state.modelId,
        capabilities: state.capabilities,
        maxDispatches: state.maxDispatches,
        dispatchedCount: state.dispatchedCount,
        disposed: state.disposed,
        busy: state.inFlight !== null,
      });
    },

    dispose(): void {
      if (state.disposed) {
        return;
      }
      state.disposed = true;
      const active = state.inFlight;
      if (active !== undefined && active !== null) {
        // Latch dispose-cancel before notifying adapter abort listeners.
        latchTerminal(active, {
          kind: "FAILURE",
          code: "CANCELLED",
          message: "brain disposed during invocation",
        });
        active.abortRequested = true;
        if (!active.childController.signal.aborted) {
          active.childController.abort(safeAbortReason());
        }
        clearOperationResources(active);
        // Slot retained until adapter settles if dispatched.
        if (!active.dispatched) {
          releaseIfOwner(state, active);
        }
      }
    },

    async invoke(
      request: BrainInvocationRequest,
      options?: { readonly signal?: AbortSignal },
    ): Promise<Result<BrainInvocationSuccess, BrainInvocationFailure>> {
      const startedWallMs = readWallMs();
      const startedMonoMs = readMonotonicMs();
      const callerSignal = options?.signal;

      if (state.disposed) {
        const receipt = buildZeroDispatchReceipt(state, {
          invocationId: null,
          correlationId: null,
          code: "DISPOSED",
          startedWallMs,
          startedMonoMs,
          abortRequested: false,
        });
        return failure(
          invocationFailure("DISPOSED", "brain instance is disposed", receipt),
        );
      }
      if (state.inFlight !== null) {
        const receipt = buildZeroDispatchReceipt(state, {
          invocationId: null,
          correlationId: null,
          code: "BUSY",
          startedWallMs,
          startedMonoMs,
          abortRequested: false,
        });
        return failure(
          invocationFailure("BUSY", "brain instance has an in-flight call", receipt),
        );
      }
      if (state.dispatchedCount >= state.maxDispatches) {
        const receipt = buildZeroDispatchReceipt(state, {
          invocationId: null,
          correlationId: null,
          code: "BUDGET_EXHAUSTED",
          startedWallMs,
          startedMonoMs,
          abortRequested: false,
        });
        return failure(
          invocationFailure(
            "BUDGET_EXHAUSTED",
            "per-instance dispatch budget exhausted",
            receipt,
          ),
        );
      }

      const ceilings = resolveEffectiveCeilings(
        state.narrowing,
        state.maxOutputTokensCeiling,
        state.maxTimeoutMsCeiling,
        state.maxResponseUtf8BytesCeiling,
        state.maxPreparedRequestUtf8BytesCeiling,
      );
      if (!ceilings.ok) {
        const code =
          ceilings.error.code === "UNSUPPORTED_CAPABILITY"
            ? "UNSUPPORTED_CAPABILITY"
            : ceilings.error.code === "LIMIT_EXCEEDED"
              ? "LIMIT_EXCEEDED"
              : "INVALID_REQUEST";
        const receipt = buildZeroDispatchReceipt(state, {
          invocationId: null,
          correlationId: null,
          code,
          startedWallMs,
          startedMonoMs,
          abortRequested: false,
        });
        return failure(
          invocationFailure(code, ceilings.error.message, receipt),
        );
      }

      const prepared = normalizeInvocationRequest(
        request,
        ceilings.value,
        state.capabilities.acceptedResponseProfiles,
        state.capabilities.honorsOutputTokenLimit,
      );
      if (!prepared.ok) {
        const code =
          prepared.error.code === "UNSUPPORTED_CAPABILITY"
            ? "UNSUPPORTED_CAPABILITY"
            : prepared.error.code === "LIMIT_EXCEEDED"
              ? "LIMIT_EXCEEDED"
              : "INVALID_REQUEST";
        const receipt = buildZeroDispatchReceipt(state, {
          invocationId: null,
          correlationId:
            typeof (request as { correlationId?: unknown }).correlationId ===
            "string"
              ? ((request as { correlationId: string }).correlationId.length <=
                  128
                  ? (request as { correlationId: string }).correlationId
                  : null)
              : null,
          code,
          startedWallMs,
          startedMonoMs,
          abortRequested: false,
        });
        return failure(
          invocationFailure(code, prepared.error.message, receipt),
        );
      }

      if (
        state.capabilities.maxInputUtf8Bytes !== undefined &&
        prepared.value.preparedRequestUtf8Bytes >
          state.capabilities.maxInputUtf8Bytes
      ) {
        const receipt = buildZeroDispatchReceipt(state, {
          invocationId: null,
          correlationId: prepared.value.correlationId,
          code: "UNSUPPORTED_CAPABILITY",
          startedWallMs,
          startedMonoMs,
          abortRequested: false,
          responseProfile: prepared.value.responseProfile,
          purpose: prepared.value.purpose,
          configuredMaxOutputTokens: prepared.value.limits.maxOutputTokens,
          configuredTimeoutMs: prepared.value.limits.timeoutMs,
          configuredMaxResponseUtf8Bytes:
            prepared.value.limits.maxResponseUtf8Bytes,
          preparedRequestUtf8Bytes: prepared.value.preparedRequestUtf8Bytes,
        });
        return failure(
          invocationFailure(
            "UNSUPPORTED_CAPABILITY",
            "prepared request exceeds adapter maxInputUtf8Bytes",
            receipt,
          ),
        );
      }

      const preAbort =
        callerSignal !== undefined && callerSignal.aborted === true;
      if (preAbort) {
        const receipt = buildZeroDispatchReceipt(state, {
          invocationId: null,
          correlationId: prepared.value.correlationId,
          code: "CANCELLED",
          startedWallMs,
          startedMonoMs,
          abortRequested: true,
          responseProfile: prepared.value.responseProfile,
          purpose: prepared.value.purpose,
          configuredMaxOutputTokens: prepared.value.limits.maxOutputTokens,
          configuredTimeoutMs: prepared.value.limits.timeoutMs,
          configuredMaxResponseUtf8Bytes:
            prepared.value.limits.maxResponseUtf8Bytes,
          preparedRequestUtf8Bytes: prepared.value.preparedRequestUtf8Bytes,
        });
        return failure(
          invocationFailure(
            "CANCELLED",
            "caller signal was already aborted",
            receipt,
          ),
        );
      }

      const invocationId = randomUUID();
      const childController = new AbortController();
      const deadlineMonoMs = startedMonoMs + prepared.value.limits.timeoutMs;
      const op: OperationState = {
        operationId: randomUUID(),
        invocationId,
        correlationId: prepared.value.correlationId,
        startedWallMs,
        startedMonoMs,
        deadlineMonoMs,
        childController,
        callerSignal,
        deadlineTimer: undefined,
        callerAbortHandler: undefined,
        dispatched: false,
        budgetConsumed: 0,
        abortRequested: false,
        adapterSettlement: { status: "NOT_DISPATCHED" },
        terminal: undefined,
        consumerSettled: false,
        preparedRequestUtf8Bytes: prepared.value.preparedRequestUtf8Bytes,
        responseProfile: prepared.value.responseProfile,
        purpose: prepared.value.purpose,
        configuredMaxOutputTokens: prepared.value.limits.maxOutputTokens,
        configuredTimeoutMs: prepared.value.limits.timeoutMs,
        configuredMaxResponseUtf8Bytes:
          prepared.value.limits.maxResponseUtf8Bytes,
        packet: undefined,
      };

      // Synchronous single-flight reservation BEFORE first await and BEFORE adapter.
      reserveInFlightSlot(state, op);

      const packet: FrozenNormalizedAdapterPacket = Object.freeze({
        ...prepared.value.packetWithoutInvocationId,
        invocationId,
      });
      op.packet = packet;

      let consumerResolve!: (
        value: Result<BrainInvocationSuccess, BrainInvocationFailure>,
      ) => void;
      const consumerPromise = new Promise<
        Result<BrainInvocationSuccess, BrainInvocationFailure>
      >((resolve) => {
        consumerResolve = resolve;
      });

      const publishConsumer = (): void => {
        if (op.consumerSettled || op.terminal === undefined) {
          return;
        }
        op.consumerSettled = true;
        clearOperationResources(op);

        const finishedWallMs = readWallMs();
        const finishedMonoMs = readMonotonicMs();
        const decision = op.terminal;

        let responseUtf8Bytes: number | null = null;
        let usageObs = observeUsage(undefined);
        let providerRequestId: string | null = null;
        let providerReportedModelId: string | null = null;
        const warnings: string[] = [...usageObs.warnings];

        if (decision.kind === "SUCCESS") {
          responseUtf8Bytes = utf8ByteLength(decision.response.text);
          usageObs = observeUsage(decision.reply.usage);
          warnings.push(...usageObs.warnings);
          providerRequestId = decision.reply.providerRequestId ?? null;
          providerReportedModelId =
            decision.reply.providerReportedModelId ?? null;
        } else if (decision.reply !== undefined) {
          usageObs = observeUsage(decision.reply.usage);
          warnings.push(...usageObs.warnings);
          providerRequestId = decision.reply.providerRequestId ?? null;
          providerReportedModelId =
            decision.reply.providerReportedModelId ?? null;
          if (
            decision.reply.kind === "COMPLETE" &&
            typeof decision.reply.text === "string"
          ) {
            // Do not retain oversized text as success; byte count optional.
            const b = utf8ByteLength(decision.reply.text);
            if (b <= MAX_RESPONSE_UTF8_BYTES) {
              responseUtf8Bytes = b;
            }
          }
        }

        const settlement: AdapterSettlementObservation = op.adapterSettlement;

        const receipt = finalizeReceipt({
          invocationId: op.invocationId,
          correlationId: op.correlationId,
          providerId: state.providerId,
          modelId: state.modelId,
          responseProfile: op.responseProfile,
          purpose: op.purpose,
          configuredMaxOutputTokens: op.configuredMaxOutputTokens,
          configuredTimeoutMs: op.configuredTimeoutMs,
          configuredMaxResponseUtf8Bytes: op.configuredMaxResponseUtf8Bytes,
          preparedRequestUtf8Bytes: op.preparedRequestUtf8Bytes,
          responseUtf8Bytes,
          startedAtWallMs: op.startedWallMs,
          finishedAtWallMs: finishedWallMs,
          startedMonoMs: op.startedMonoMs,
          finishedMonoMs,
          adapterDispatched: op.dispatched,
          attemptCount: op.dispatched ? 1 : 0,
          budgetConsumed: op.budgetConsumed,
          outcome: decision.kind === "SUCCESS" ? "SUCCESS" : "FAILURE",
          failureCode: decision.kind === "SUCCESS" ? null : decision.code,
          abortRequested: op.abortRequested,
          adapterSettlement: settlement,
          usage: usageObs.usage,
          providerRequestId,
          providerReportedModelId,
          telemetryWarnings: warnings,
        });

        // Drop heavy packet after consumer publication.
        op.packet = undefined;

        if (decision.kind === "SUCCESS") {
          consumerResolve(
            success(
              Object.freeze({
                response: decision.response,
                receipt,
              }),
            ),
          );
        } else {
          consumerResolve(
            failure(
              invocationFailure(
                decision.code,
                decision.message,
                receipt,
                decision.retryAfterMs,
              ),
            ),
          );
        }

        // Release slot only if adapter settled or never dispatched.
        if (
          !op.dispatched ||
          op.adapterSettlement.status === "SETTLED"
        ) {
          releaseIfOwner(state, op);
        }
      };

      const requestAbortAndLatch = (
        code: BrainInvocationFailureCode,
        message: string,
      ): void => {
        // Latch BEFORE notifying adapter-controlled abort listeners.
        const latched = latchTerminal(op, { kind: "FAILURE", code, message });
        op.abortRequested = true;
        if (!op.childController.signal.aborted) {
          op.childController.abort(safeAbortReason());
        }
        if (latched) {
          publishConsumer();
        }
      };

      op.deadlineTimer = setTimeout(() => {
        requestAbortAndLatch("TIMED_OUT", "invocation timed out");
      }, prepared.value.limits.timeoutMs);

      if (callerSignal !== undefined) {
        const onAbort = (): void => {
          requestAbortAndLatch("CANCELLED", "caller aborted the invocation");
        };
        op.callerAbortHandler = onAbort;
        callerSignal.addEventListener("abort", onAbort);
      }

      // Recheck before dispatch.
      if (state.disposed) {
        requestAbortAndLatch("CANCELLED", "brain disposed before dispatch");
        return consumerPromise;
      }
      if (callerSignal?.aborted) {
        requestAbortAndLatch("CANCELLED", "caller aborted before dispatch");
        return consumerPromise;
      }
      if (readMonotonicMs() >= op.deadlineMonoMs) {
        requestAbortAndLatch("TIMED_OUT", "deadline reached before dispatch");
        return consumerPromise;
      }

      // Consume dispatch immediately before adapter call — no intervening await.
      consumeDispatchBudget(state, op);

      let adapterPromise: Promise<EngineeringBrainAdapterReply>;
      try {
        adapterPromise = state.invokeAdapter(packet, {
          signal: childController.signal,
          invocationId,
        });
      } catch {
        op.adapterSettlement = {
          status: "SETTLED",
          settledAtWallMs: readWallMs(),
        };
        latchTerminal(op, {
          kind: "FAILURE",
          code: "ADAPTER_EXCEPTION",
          message: "adapter threw synchronously",
        });
        publishConsumer();
        releaseIfOwner(state, op);
        return consumerPromise;
      }

      if (
        adapterPromise === null ||
        typeof adapterPromise !== "object" ||
        typeof (adapterPromise as Promise<unknown>).then !== "function"
      ) {
        op.adapterSettlement = {
          status: "SETTLED",
          settledAtWallMs: readWallMs(),
        };
        latchTerminal(op, {
          kind: "FAILURE",
          code: "MALFORMED_ADAPTER_RESPONSE",
          message: "adapter did not return a Promise",
        });
        publishConsumer();
        releaseIfOwner(state, op);
        return consumerPromise;
      }

      // Observe real adapter settlement — not a timeout race wrapper.
      void Promise.resolve(adapterPromise).then(
        (reply) => {
          op.adapterSettlement = {
            status: "SETTLED",
            settledAtWallMs: readWallMs(),
          };

          if (op.consumerSettled) {
            // Late result: discard; release if still owner.
            releaseIfOwner(state, op);
            return;
          }

          // Recheck monotonic deadline / cancel / dispose before success.
          if (state.disposed || op.abortRequested || callerSignal?.aborted) {
            latchTerminal(op, {
              kind: "FAILURE",
              code: op.abortRequested || callerSignal?.aborted
                ? readMonotonicMs() >= op.deadlineMonoMs
                  ? "TIMED_OUT"
                  : "CANCELLED"
                : "CANCELLED",
              message: "invocation aborted before completion acceptance",
            });
            // Prefer already-latched timeout if present.
            publishConsumer();
            releaseIfOwner(state, op);
            return;
          }
          if (readMonotonicMs() >= op.deadlineMonoMs) {
            latchTerminal(op, {
              kind: "FAILURE",
              code: "TIMED_OUT",
              message: "monotonic deadline reached before completion acceptance",
            });
            // Still request abort for cooperativeness; latch already set.
            op.abortRequested = true;
            if (!op.childController.signal.aborted) {
              op.childController.abort(safeAbortReason());
            }
            publishConsumer();
            releaseIfOwner(state, op);
            return;
          }

          const decision = normalizeAdapterReply(
            op,
            reply,
            op.configuredMaxResponseUtf8Bytes ?? MAX_RESPONSE_UTF8_BYTES,
          );
          // Recheck after normalization too.
          if (readMonotonicMs() >= op.deadlineMonoMs) {
            latchTerminal(op, {
              kind: "FAILURE",
              code: "TIMED_OUT",
              message: "monotonic deadline reached after normalization",
            });
            op.abortRequested = true;
            if (!op.childController.signal.aborted) {
              op.childController.abort(safeAbortReason());
            }
            publishConsumer();
            releaseIfOwner(state, op);
            return;
          }
          if (op.abortRequested || state.disposed || callerSignal?.aborted) {
            latchTerminal(op, {
              kind: "FAILURE",
              code: "CANCELLED",
              message: "invocation cancelled after normalization",
            });
            publishConsumer();
            releaseIfOwner(state, op);
            return;
          }

          latchTerminal(op, decision);
          publishConsumer();
          releaseIfOwner(state, op);
        },
        () => {
          op.adapterSettlement = {
            status: "SETTLED",
            settledAtWallMs: readWallMs(),
          };
          if (op.consumerSettled) {
            releaseIfOwner(state, op);
            return;
          }
          latchTerminal(op, {
            kind: "FAILURE",
            code: "ADAPTER_EXCEPTION",
            message: "adapter promise rejected",
          });
          publishConsumer();
          releaseIfOwner(state, op);
        },
      );

      return consumerPromise;
    },
  };

  return success(Object.freeze(brain));
}
