/**
 * Phase 5D2 Engineering Cycle — bounded Brain → Gate 1 → authorized validation conductor.
 * Never mints approval/authorization. Never edits repository code.
 */

import { randomUUID } from "node:crypto";

import { readMonotonicMs, readWallMs } from "../brain/clock.js";
import {
  HARD_MAX_TIMEOUT_MS as BRAIN_HARD_MAX_TIMEOUT_MS,
  isNonemptyBoundedId,
  utf8ByteLength,
} from "../brain/bounds.js";
import type { BrainInvocationReceipt } from "../brain/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  LOCAL_PROCESS_FINAL_CLEANUP_DEADLINE_MS,
  LOCAL_PROCESS_TERMINATION_GRACE_MS,
} from "../execution/bounds.js";
import { executeEngineeringRun } from "../engineering-run/index.js";
import type { EngineeringRunRecord } from "../engineering-run/types.js";
import {
  bindReasoningProposalJson,
  inspectLiveReferenceCatalogAssociation,
} from "../reasoning/index.js";
import type { ReferenceBoundReasoning } from "../reasoning/types.js";
import {
  checkExecutionEvidenceAssessmentApplicability,
  evaluateExecutionEvidence,
  prepareExecutionEvidencePlan,
} from "../reasoning/gate2/index.js";
import type {
  ClaimCheckAssignmentInput,
  ExecutionEvidenceAssessment,
} from "../reasoning/gate2/types.js";
import type {
  PreparedValidationPlan,
  ValidationAuthorization,
} from "../validation/types.js";
import {
  CYCLE_RECORD_SCHEMA_VERSION,
  DEFAULT_BRAIN_ATTEMPT_TIMEOUT_MS,
  DEFAULT_CYCLE_ADMISSION_MS,
  DEFAULT_MAX_BRAIN_ATTEMPTS,
  MAX_CYCLE_ADMISSION_MS,
  MAX_MAX_BRAIN_ATTEMPTS,
  MAX_RETAINED_ATTEMPT_RECORDS,
  MIN_CYCLE_ADMISSION_MS,
  MIN_MAX_BRAIN_ATTEMPTS,
  isSafePositiveInt,
} from "./bounds.js";
import {
  configurationFailure,
  cycleFailure,
  type CycleOriginCode,
  type CycleTerminalState,
} from "./failures.js";
import {
  buildDiagnosticText,
  dispositionForApplicabilityFailure,
  dispositionForGate1Failure,
} from "./feedback.js";
import {
  buildBrainRequest,
  buildContextPacket,
  validateOriginalBlocksForRevision,
} from "./packet.js";
import {
  mayAdmitProposalRevision,
  preflightValidationAuthorization,
  recheckBoundReasoningApplicability,
} from "./seams.js";
import type {
  AttemptGate1Outcome,
  CapturedBrain,
  CycleArtifacts,
  CycleAttemptRecord,
  CycleControlPhase,
  CycleDescriptorView,
  CycleOutcome,
  CycleRecord,
  EngineeringCycle,
  EngineeringCycleOptions,
  EngineeringCycleSession,
  EngineeringCycleTask,
  FrozenSessionView,
  OpenEngineeringCycleResult,
  ValidationDisposition,
} from "./types.js";

const LIMITATIONS: readonly string[] = Object.freeze([
  "CycleRecord/CycleSummary are telemetry — not EvidenceRecord, CompletionReport, gate assessment, or authority",
  "Admission deadline is a stop-request deadline, not hard real-time proof that all I/O or child processes stopped",
  "Borrowed Brain/catalog are not disposed by the cycle; adapter work may remain PENDING after consumer settlement",
  "Optional Validation stop signal restricts between-check scheduling only — no active-process cancellation claim",
  "No automatic code editing, candidate promotion, content search, persistence, or live provider in this slice",
  "Outstanding CONTAINS / unassessed EXECUTION / hypotheses remain outstanding even if some evidence was accepted",
  "Caller-authorized Validation may write process artifacts under OS permissions; coordinator itself does not write",
]);

type StopCause = "CALLER_ABORT" | "CLOSE" | "DEADLINE";

type InternalState = {
  readonly session: FrozenSessionView;
  readonly cycleId: string;
  readonly maxBrainAttempts: number;
  readonly cycleAdmissionMs: number;
  readonly brainAttemptTimeoutMs: number;
  phase: CycleControlPhase;
  closed: boolean;
  runEntered: boolean;
  busy: boolean;
  stopLatched: boolean;
  stopCause: StopCause | null;
  stopRequestedAtWallMs: number | null;
  drainStartedAtMs: number | null;
  ownedAbort: AbortController;
  deadlineTimer: ReturnType<typeof setTimeout> | null;
  callerAbortHandler: (() => void) | null;
  callerSignal: AbortSignal | null;
  admissionStartedAtMs: number | null;
};

function copyAssignments(
  rows: readonly ClaimCheckAssignmentInput[],
): ClaimCheckAssignmentInput[] {
  return rows.map((row) =>
    Object.freeze({
      claimId: row.claimId,
      selectedCheckIds: Object.freeze([...row.selectedCheckIds]),
    }),
  );
}

function freezeTask(task: EngineeringCycleTask): EngineeringCycleTask {
  return Object.freeze({
    correlationId: task.correlationId,
    instructionText: task.instructionText,
    contextBlocks: Object.freeze(
      task.contextBlocks.map((b) =>
        Object.freeze({
          blockId: b.blockId,
          role: b.role,
          text: b.text,
          referenceHandles: Object.freeze([...b.referenceHandles]),
        }),
      ),
    ),
  });
}

function validateTask(
  task: EngineeringCycleTask,
): Result<EngineeringCycleTask, ReturnType<typeof cycleFailure>> {
  if (task === null || typeof task !== "object") {
    return failure(cycleFailure("INVALID_TASK", "task must be an object"));
  }
  if (
    typeof task.correlationId !== "string" ||
    !isNonemptyBoundedId(task.correlationId)
  ) {
    return failure(cycleFailure("INVALID_TASK", "correlationId invalid"));
  }
  if (
    typeof task.instructionText !== "string" ||
    task.instructionText.length === 0 ||
    utf8ByteLength(task.instructionText) < 1
  ) {
    return failure(cycleFailure("INVALID_TASK", "instructionText required"));
  }
  if (!Array.isArray(task.contextBlocks)) {
    return failure(cycleFailure("INVALID_TASK", "contextBlocks must be array"));
  }
  return success(freezeTask(task));
}

function remainingAdmissionMs(state: InternalState): number {
  if (state.admissionStartedAtMs === null) {
    return state.cycleAdmissionMs;
  }
  const elapsed = readMonotonicMs() - state.admissionStartedAtMs;
  return Math.max(0, state.cycleAdmissionMs - elapsed);
}

function latchStop(state: InternalState, cause: StopCause): void {
  if (state.stopLatched) {
    return;
  }
  state.stopLatched = true;
  state.stopCause = cause;
  state.stopRequestedAtWallMs = readWallMs();
  try {
    state.ownedAbort.abort();
  } catch {
    // ignore
  }
}

function clearOwnedTimer(state: InternalState): void {
  if (state.deadlineTimer !== null) {
    clearTimeout(state.deadlineTimer);
    state.deadlineTimer = null;
  }
}

function detachCaller(state: InternalState): void {
  if (state.callerSignal !== null && state.callerAbortHandler !== null) {
    state.callerSignal.removeEventListener("abort", state.callerAbortHandler);
  }
  state.callerAbortHandler = null;
  state.callerSignal = null;
}

function brainAttemptTimeout(state: InternalState): number {
  const remaining = remainingAdmissionMs(state);
  const configured = Math.min(
    state.brainAttemptTimeoutMs,
    BRAIN_HARD_MAX_TIMEOUT_MS,
  );
  return Math.min(configured, Math.max(0, remaining));
}

function processBudgetMs(plan: PreparedValidationPlan): number {
  let sum = 0;
  for (const check of plan.checks) {
    sum +=
      check.preparedProcess.timeoutMs +
      LOCAL_PROCESS_TERMINATION_GRACE_MS +
      LOCAL_PROCESS_FINAL_CLEANUP_DEADLINE_MS;
  }
  return sum;
}

function collectOutstanding(reasoning: ReferenceBoundReasoning | null): {
  execution: string[];
  contains: string[];
  hypotheses: string[];
} {
  const execution: string[] = [];
  const contains: string[] = [];
  const hypotheses: string[] = [];
  if (reasoning === null) {
    return { execution, contains, hypotheses };
  }
  for (const claim of reasoning.claims) {
    if (claim.kind === "CONTAINS") {
      contains.push(claim.claimId);
    } else if (
      (claim.kind === "DEFINES" || claim.kind === "BEHAVES") &&
      claim.requiredVerification.method === "EXECUTION"
    ) {
      execution.push(claim.claimId);
    }
  }
  for (const h of reasoning.hypotheses) {
    hypotheses.push(h.hypothesisId);
  }
  return { execution, contains, hypotheses };
}

function finalizeRecord(input: {
  readonly state: InternalState;
  readonly callerCorrelationId: string;
  readonly terminalState: CycleTerminalState;
  readonly originCode: CycleOriginCode;
  readonly attempts: readonly CycleAttemptRecord[];
  readonly validationDisposition: ValidationDisposition;
  readonly planId: string | null;
  readonly engineeringRunId: string | null;
  readonly assessmentCorrelationId: string | null;
  readonly gate2Decision: string | null;
  readonly boundReasoning: ReferenceBoundReasoning | null;
  readonly assessedExecutionIds: readonly string[];
  readonly startedAtWallMs: number;
  readonly adapterSettlementStatus: string | null;
}): CycleRecord {
  const finishedAtWallMs = readWallMs();
  const durationMs =
    input.state.admissionStartedAtMs === null
      ? 0
      : Math.max(0, readMonotonicMs() - input.state.admissionStartedAtMs);
  const drainDurationMs =
    input.state.drainStartedAtMs === null
      ? null
      : Math.max(0, readMonotonicMs() - input.state.drainStartedAtMs);

  const outstanding = collectOutstanding(input.boundReasoning);
  const assessed = new Set(input.assessedExecutionIds);
  const unassessedExecution = outstanding.execution.filter(
    (id) => !assessed.has(id),
  );

  let brainDispatchCount = 0;
  for (const a of input.attempts) {
    if (a.adapterDispatched) {
      brainDispatchCount += 1;
    }
  }

  return Object.freeze({
    schemaVersion: CYCLE_RECORD_SCHEMA_VERSION,
    cycleId: input.state.cycleId,
    callerCorrelationId: input.callerCorrelationId,
    mode: input.state.session.mode,
    phase: "FINALIZED" as const,
    terminalState: input.terminalState,
    originCode: input.originCode,
    brainAttemptCount: input.attempts.length,
    brainDispatchCount,
    revisionCount: Math.max(0, input.attempts.length - 1),
    attempts: Object.freeze(input.attempts.slice(0, MAX_RETAINED_ATTEMPT_RECORDS)),
    validationDisposition: input.validationDisposition,
    validationRequested: input.state.session.mode === "BIND_AND_VALIDATE",
    validationEligible:
      input.validationDisposition === "DISPATCHED" ||
      input.validationDisposition === "SETTLED" ||
      input.validationDisposition === "NO_EXECUTION_OBLIGATIONS",
    validationDispatched:
      input.validationDisposition === "DISPATCHED" ||
      input.validationDisposition === "SETTLED",
    validationSettled: input.validationDisposition === "SETTLED",
    planId: input.planId,
    engineeringRunId: input.engineeringRunId,
    assessmentCorrelationId: input.assessmentCorrelationId,
    gate2Decision: input.gate2Decision,
    outstandingExecutionClaimIds: Object.freeze(unassessedExecution),
    deferredContainsClaimIds: Object.freeze(outstanding.contains),
    outstandingHypothesisIds: Object.freeze(outstanding.hypotheses),
    startedAtWallMs: input.startedAtWallMs,
    finishedAtWallMs,
    durationMs,
    stopRequestedAtWallMs: input.state.stopRequestedAtWallMs,
    stopCause: input.state.stopCause,
    drainDurationMs,
    adapterSettlementStatus: input.adapterSettlementStatus,
    limitations: LIMITATIONS,
  });
}

function outcomeOf(
  record: CycleRecord,
  artifacts: CycleArtifacts,
): CycleOutcome {
  return Object.freeze({
    record,
    artifacts: Object.freeze({
      boundReasoning: artifacts.boundReasoning,
      engineeringRun: artifacts.engineeringRun,
      assessment: artifacts.assessment,
    }),
  });
}

function gate1OutcomeFromFailure(
  error: Parameters<typeof dispositionForGate1Failure>[0],
): AttemptGate1Outcome {
  const d = dispositionForGate1Failure(error);
  if (error.kind === "REFUSAL") {
    return {
      kind: "REFUSAL",
      code: error.refusal.code,
      claimId: error.refusal.claimId,
    };
  }
  if (error.kind === "INPUT") {
    return { kind: "INPUT", code: error.code };
  }
  if (error.kind === "CATALOG") {
    return { kind: "CATALOG", code: error.code };
  }
  return { kind: "UNKNOWN", code: d.code };
}

export function openEngineeringCycle(
  session: EngineeringCycleSession,
  options?: EngineeringCycleOptions,
): OpenEngineeringCycleResult {
  if (session === null || typeof session !== "object") {
    return failure(
      configurationFailure("INVALID_SESSION", "session must be an object"),
    );
  }
  if (session.mode !== "BIND_ONLY" && session.mode !== "BIND_AND_VALIDATE") {
    return failure(configurationFailure("INVALID_MODE", "unsupported mode"));
  }
  if (
    session.workspace === undefined ||
    session.snapshot === undefined ||
    session.catalog === undefined ||
    session.brain === undefined
  ) {
    return failure(
      configurationFailure("INVALID_SESSION", "missing required session fields"),
    );
  }
  if (
    typeof session.brain.invoke !== "function" ||
    typeof session.brain.describe !== "function"
  ) {
    return failure(
      configurationFailure("BRAIN_IDENTITY_INVALID", "brain methods missing"),
    );
  }

  const maxBrainAttempts =
    options?.maxBrainAttempts === undefined
      ? DEFAULT_MAX_BRAIN_ATTEMPTS
      : options.maxBrainAttempts;
  const cycleAdmissionMs =
    options?.cycleAdmissionMs === undefined
      ? DEFAULT_CYCLE_ADMISSION_MS
      : options.cycleAdmissionMs;
  const brainAttemptTimeoutMs =
    options?.brainAttemptTimeoutMs === undefined
      ? DEFAULT_BRAIN_ATTEMPT_TIMEOUT_MS
      : options.brainAttemptTimeoutMs;

  if (
    !isSafePositiveInt(maxBrainAttempts) ||
    maxBrainAttempts < MIN_MAX_BRAIN_ATTEMPTS ||
    maxBrainAttempts > MAX_MAX_BRAIN_ATTEMPTS
  ) {
    return failure(
      configurationFailure("INVALID_OPTIONS", "maxBrainAttempts out of range"),
    );
  }
  if (
    !isSafePositiveInt(cycleAdmissionMs) ||
    cycleAdmissionMs < MIN_CYCLE_ADMISSION_MS ||
    cycleAdmissionMs > MAX_CYCLE_ADMISSION_MS
  ) {
    return failure(
      configurationFailure("INVALID_OPTIONS", "cycleAdmissionMs out of range"),
    );
  }
  if (
    !isSafePositiveInt(brainAttemptTimeoutMs) ||
    brainAttemptTimeoutMs > BRAIN_HARD_MAX_TIMEOUT_MS
  ) {
    return failure(
      configurationFailure(
        "INVALID_OPTIONS",
        "brainAttemptTimeoutMs out of range",
      ),
    );
  }

  const catalogAssoc = inspectLiveReferenceCatalogAssociation(session.catalog);
  if (!catalogAssoc.ok) {
    return failure(
      configurationFailure(
        "CATALOG_UNAVAILABLE",
        catalogAssoc.error.message,
      ),
    );
  }
  if (
    catalogAssoc.value.workspace !== session.workspace ||
    catalogAssoc.value.snapshot !== session.snapshot
  ) {
    return failure(
      configurationFailure(
        "CONTEXT_MISMATCH",
        "Session workspace/snapshot do not match live catalog association",
      ),
    );
  }

  let validationPlan: PreparedValidationPlan | null = null;
  let validationAuthorization: ValidationAuthorization | null = null;
  let assignments: ClaimCheckAssignmentInput[] = [];

  if (session.mode === "BIND_AND_VALIDATE") {
    if (
      session.validationPlan === undefined ||
      session.validationAuthorization === undefined ||
      session.claimCheckAssignments === undefined
    ) {
      return failure(
        configurationFailure(
          "VALIDATION_SPEC_INCOMPLETE",
          "BIND_AND_VALIDATE requires plan, authorization, and assignments",
        ),
      );
    }
    const compat = preflightValidationAuthorization(
      session.validationPlan,
      session.validationAuthorization,
    );
    if (!compat.ok) {
      return failure(
        configurationFailure(
          "AUTHORIZATION_INCOMPATIBLE",
          compat.error.message,
        ),
      );
    }
    if (
      compat.value.workspace !== session.workspace ||
      compat.value.snapshot !== session.snapshot
    ) {
      return failure(
        configurationFailure(
          "CONTEXT_MISMATCH",
          "Validation plan context does not match session catalog context",
        ),
      );
    }
    if (!Array.isArray(session.claimCheckAssignments)) {
      return failure(
        configurationFailure(
          "VALIDATION_SPEC_INCOMPLETE",
          "claimCheckAssignments must be an array",
        ),
      );
    }
    assignments = copyAssignments(session.claimCheckAssignments);
    validationPlan = session.validationPlan;
    validationAuthorization = session.validationAuthorization;
  }

  const descriptors = catalogAssoc.value.descriptors.map((d) =>
    Object.freeze({
      handle: d.handle,
      evidenceKind: d.evidenceKind,
      ...(d.relativePath !== undefined ? { relativePath: d.relativePath } : {}),
    }),
  );

  const capturedBrain: CapturedBrain = Object.freeze({
    brain: session.brain,
    invoke: session.brain.invoke.bind(session.brain),
    describe: session.brain.describe.bind(session.brain),
  });

  const frozenSession: FrozenSessionView = Object.freeze({
    mode: session.mode,
    workspace: session.workspace,
    snapshot: session.snapshot,
    catalog: session.catalog,
    brain: capturedBrain,
    descriptors: Object.freeze(descriptors),
    validationPlan,
    validationAuthorization,
    claimCheckAssignments: Object.freeze(assignments),
  });

  const state: InternalState = {
    session: frozenSession,
    cycleId: randomUUID(),
    maxBrainAttempts,
    cycleAdmissionMs,
    brainAttemptTimeoutMs,
    phase: "IDLE",
    closed: false,
    runEntered: false,
    busy: false,
    stopLatched: false,
    stopCause: null,
    stopRequestedAtWallMs: null,
    drainStartedAtMs: null,
    ownedAbort: new AbortController(),
    deadlineTimer: null,
    callerAbortHandler: null,
    callerSignal: null,
    admissionStartedAtMs: null,
  };

  const cycle: EngineeringCycle = {
    describe(): CycleDescriptorView {
      let stopState: CycleDescriptorView["stopState"] = "NONE";
      if (state.phase === "FINALIZED") {
        stopState = "SETTLED";
      } else if (state.phase === "DRAINING") {
        stopState = "DRAINING";
      } else if (state.stopLatched) {
        stopState = "STOP_REQUESTED";
      }
      return Object.freeze({
        cycleId: state.cycleId,
        mode: state.session.mode,
        phase: state.phase,
        closed: state.closed,
        runEntered: state.runEntered,
        busy: state.busy,
        stopState,
        maxBrainAttempts: state.maxBrainAttempts,
        cycleAdmissionMs: state.cycleAdmissionMs,
      });
    },
    close(): void {
      if (state.closed && state.stopLatched) {
        return;
      }
      state.closed = true;
      latchStop(state, "CLOSE");
      clearOwnedTimer(state);
    },
    async run(task, runOptions) {
      // Synchronous reservation BEFORE first await.
      if (state.busy) {
        return failure(cycleFailure("BUSY", "cycle run already in progress"));
      }
      if (state.runEntered) {
        return failure(
          cycleFailure("CYCLE_ALREADY_RUN", "cycle already entered run"),
        );
      }
      if (state.closed) {
        return failure(cycleFailure("CYCLE_CLOSED", "cycle is closed"));
      }

      const taskResult = validateTask(task);
      if (!taskResult.ok) {
        return taskResult;
      }
      const frozenTask = taskResult.value;

      const packetCheck = validateOriginalBlocksForRevision(
        frozenTask.contextBlocks,
        frozenTask.instructionText,
        state.session.descriptors,
        state.maxBrainAttempts > 1,
      );
      if (!packetCheck.ok) {
        return failure(
          cycleFailure("INVALID_TASK", packetCheck.error.message),
        );
      }

      state.busy = true;
      state.runEntered = true;
      state.phase = "VALIDATING_SESSION";
      state.admissionStartedAtMs = readMonotonicMs();
      const startedAtWallMs = readWallMs();

      const attempts: CycleAttemptRecord[] = [];
      let diagnosticText: string | null = null;
      let boundReasoning: ReferenceBoundReasoning | null = null;
      let engineeringRun: EngineeringRunRecord | null = null;
      let assessment: ExecutionEvidenceAssessment | null = null;
      let validationDisposition: ValidationDisposition =
        state.session.mode === "BIND_AND_VALIDATE"
          ? "NOT_REQUESTED"
          : "NOT_REQUESTED";
      let lastAdapterSettlement: string | null = null;
      let assessedExecutionIds: string[] = [];

      const finish = (
        terminalState: CycleTerminalState,
        originCode: CycleOriginCode,
        extras?: {
          readonly gate2Decision?: string | null;
          readonly planId?: string | null;
          readonly engineeringRunId?: string | null;
          readonly assessmentCorrelationId?: string | null;
        },
      ): Result<CycleOutcome, never> => {
        clearOwnedTimer(state);
        detachCaller(state);
        state.phase = "FINALIZED";
        state.busy = false;
        const record = finalizeRecord({
          state,
          callerCorrelationId: frozenTask.correlationId,
          terminalState,
          originCode,
          attempts,
          validationDisposition,
          planId:
            extras?.planId ??
            state.session.validationPlan?.planId ??
            null,
          engineeringRunId:
            extras?.engineeringRunId ?? engineeringRun?.engineeringRunId ?? null,
          assessmentCorrelationId:
            extras?.assessmentCorrelationId ??
            assessment?.assessmentCorrelationId ??
            null,
          gate2Decision: extras?.gate2Decision ?? assessment?.decision ?? null,
          boundReasoning,
          assessedExecutionIds,
          startedAtWallMs,
          adapterSettlementStatus: lastAdapterSettlement,
        });
        return success(
          outcomeOf(record, {
            boundReasoning,
            engineeringRun,
            assessment,
          }),
        );
      };

      try {
        state.callerSignal = runOptions?.signal ?? null;
        if (state.callerSignal !== null) {
          if (state.callerSignal.aborted) {
            latchStop(state, "CALLER_ABORT");
          } else {
            const handler = () => {
              latchStop(state, "CALLER_ABORT");
            };
            state.callerAbortHandler = handler;
            state.callerSignal.addEventListener("abort", handler, {
              once: true,
            });
          }
        }

        state.deadlineTimer = setTimeout(() => {
          latchStop(state, "DEADLINE");
        }, state.cycleAdmissionMs);
        // Ensure timer does not keep the process alive.
        if (
          typeof state.deadlineTimer === "object" &&
          state.deadlineTimer !== null &&
          "unref" in state.deadlineTimer &&
          typeof state.deadlineTimer.unref === "function"
        ) {
          state.deadlineTimer.unref();
        }

        if (state.stopLatched) {
          return finish(
            state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
            state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
          );
        }

        // Re-check catalog liveness and validation unused status before Brain.
        const live = inspectLiveReferenceCatalogAssociation(
          state.session.catalog,
        );
        if (!live.ok) {
          return finish("FAILED", "CATALOG_INVALID");
        }
        if (state.session.mode === "BIND_AND_VALIDATE") {
          const compat = preflightValidationAuthorization(
            state.session.validationPlan!,
            state.session.validationAuthorization!,
          );
          if (!compat.ok) {
            return finish("FAILED", "AUTHORIZATION_INCOMPATIBLE");
          }
          // Authorization must remain unused after preflight.
          if (!compat.value.unused) {
            return finish("FAILED", "AUTHORIZATION_INCOMPATIBLE");
          }
        }

        for (
          let attemptIndex = 0;
          attemptIndex < MAX_MAX_BRAIN_ATTEMPTS;
          attemptIndex += 1
        ) {
          if (state.stopLatched) {
            return finish(
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
            );
          }

          // Initial attempt always admitted; revisions gated solely by mayAdmit.
          if (
            attemptIndex > 0 &&
            !mayAdmitProposalRevision(attemptIndex, state.maxBrainAttempts)
          ) {
            return finish("EXHAUSTED", "REVISION_EXHAUSTED");
          }

          const liveAgain = inspectLiveReferenceCatalogAssociation(
            state.session.catalog,
          );
          if (!liveAgain.ok) {
            return finish("FAILED", "CATALOG_INVALID");
          }

          state.phase =
            attemptIndex === 0 ? "BUILDING_REQUEST" : "REVISING";
          const purpose =
            attemptIndex === 0 ? "PROPOSE_REASONING" : "REVISE_REASONING";
          const attemptCorrelationId = `${frozenTask.correlationId}:a${attemptIndex + 1}`;
          const timeoutMs = brainAttemptTimeout(state);
          if (timeoutMs < 1) {
            latchStop(state, "DEADLINE");
            return finish("TIMED_OUT", "TIMED_OUT");
          }

          const context = buildContextPacket(
            state.session.descriptors,
            frozenTask.contextBlocks,
            diagnosticText,
          );
          const request = buildBrainRequest({
            correlationId: attemptCorrelationId,
            purpose,
            taskText: frozenTask.instructionText,
            context,
            timeoutMs,
          });

          state.phase = "AWAITING_BRAIN";
          const brainPromise = state.session.brain.invoke(request, {
            signal: state.ownedAbort.signal,
          });
          const brainResult = await brainPromise.catch((err: unknown) => {
            void err;
            return null;
          });

          if (state.stopLatched) {
            state.phase = "DRAINING";
            state.drainStartedAtMs = readMonotonicMs();
            // Drain already-started brain promise (settled above).
            return finish(
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
            );
          }

          if (brainResult === null) {
            attempts.push(
              Object.freeze({
                attemptIndex,
                correlationId: attemptCorrelationId,
                purpose,
                brainOutcome: "FAILURE",
                brainFailureCode: "ADAPTER_EXCEPTION",
                brainReceipt: null,
                adapterDispatched: false,
                gate1Outcome: null,
                revised: false,
              }),
            );
            return finish("FAILED", "BRAIN_FAILED");
          }

          if (!brainResult.ok) {
            const receipt: BrainInvocationReceipt | null =
              brainResult.error.receipt ?? null;
            lastAdapterSettlement =
              receipt?.adapterSettlement.status ?? null;
            attempts.push(
              Object.freeze({
                attemptIndex,
                correlationId: attemptCorrelationId,
                purpose,
                brainOutcome: "FAILURE",
                brainFailureCode: brainResult.error.code,
                brainReceipt: receipt,
                adapterDispatched: receipt?.adapterDispatched === true,
                gate1Outcome: null,
                revised: false,
              }),
            );
            if (brainResult.error.code === "TIMED_OUT") {
              return finish("FAILED", "BRAIN_TIMED_OUT");
            }
            if (
              brainResult.error.code === "CANCELLED" &&
              state.stopLatched
            ) {
              return finish(
                state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
                state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
              );
            }
            return finish("FAILED", "BRAIN_FAILED");
          }

          lastAdapterSettlement =
            brainResult.value.receipt.adapterSettlement.status;
          const proposalText = brainResult.value.response.text;

          state.phase = "BINDING";
          const bindResult = await bindReasoningProposalJson(
            proposalText,
            state.session.catalog,
          );

          if (state.stopLatched) {
            state.phase = "DRAINING";
            state.drainStartedAtMs = readMonotonicMs();
            return finish(
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
            );
          }

          if (!bindResult.ok) {
            const disposition = dispositionForGate1Failure(bindResult.error);
            attempts.push(
              Object.freeze({
                attemptIndex,
                correlationId: attemptCorrelationId,
                purpose,
                brainOutcome: "SUCCESS",
                brainFailureCode: null,
                brainReceipt: brainResult.value.receipt,
                adapterDispatched: true,
                gate1Outcome: gate1OutcomeFromFailure(bindResult.error),
                revised: disposition.action === "REVISE",
              }),
            );

            if (disposition.action === "TERMINAL") {
              return finish("FAILED", disposition.origin);
            }

            // Eligible revision — only if attempts remain.
            if (
              !mayAdmitProposalRevision(
                attemptIndex + 1,
                state.maxBrainAttempts,
              )
            ) {
              return finish("EXHAUSTED", "REVISION_EXHAUSTED");
            }
            diagnosticText = buildDiagnosticText(disposition);
            continue;
          }

          attempts.push(
            Object.freeze({
              attemptIndex,
              correlationId: attemptCorrelationId,
              purpose,
              brainOutcome: "SUCCESS",
              brainFailureCode: null,
              brainReceipt: brainResult.value.receipt,
              adapterDispatched: true,
              gate1Outcome: Object.freeze({ kind: "BOUND", code: null }),
              revised: false,
            }),
          );
          boundReasoning = bindResult.value.reasoning;

          // Post-bind applicability recheck.
          state.phase = "RECHECKING_BOUND_REASONING";
          const applicability =
            await recheckBoundReasoningApplicability(
              boundReasoning,
              state.session.catalog,
            );
          if (state.stopLatched) {
            return finish(
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
            );
          }
          if (!applicability.ok) {
            const d = dispositionForApplicabilityFailure(applicability.error);
            if (d.action !== "TERMINAL") {
              return finish("FAILED", "INTERNAL_CONTRACT");
            }
            return finish("FAILED", d.origin);
          }

          // Bind-only, or no EXECUTION obligations.
          const outstanding = collectOutstanding(boundReasoning);
          if (
            state.session.mode === "BIND_ONLY" ||
            outstanding.execution.length === 0
          ) {
            validationDisposition =
              state.session.mode === "BIND_AND_VALIDATE"
                ? "NO_EXECUTION_OBLIGATIONS"
                : "NOT_REQUESTED";
            return finish(
              "BOUND",
              outstanding.execution.length === 0 &&
                state.session.mode === "BIND_AND_VALIDATE"
                ? "NO_EXECUTION_OBLIGATIONS"
                : "REFERENCE_BOUND",
            );
          }

          // Validation path.
          state.phase = "PREPARING_EXECUTION_EVIDENCE";
          const evidencePlanResult = await prepareExecutionEvidencePlan({
            reasoning: boundReasoning,
            catalog: state.session.catalog,
            validationPlan: state.session.validationPlan!,
            assignments: state.session.claimCheckAssignments,
          });
          if (state.stopLatched) {
            return finish(
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
            );
          }
          if (!evidencePlanResult.ok) {
            validationDisposition = "NOT_DISPATCHED_FAILED";
            return finish("FAILED", "GATE2_PREPARE_FAILED");
          }

          state.phase = "RECHECKING_EXECUTION_PRECONDITIONS";
          if (state.stopLatched) {
            validationDisposition = "NOT_DISPATCHED_STOP";
            return finish(
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
            );
          }
          const livePre = inspectLiveReferenceCatalogAssociation(
            state.session.catalog,
          );
          if (!livePre.ok) {
            validationDisposition = "NOT_DISPATCHED_FAILED";
            return finish("FAILED", "CATALOG_INVALID");
          }
          const authPre = preflightValidationAuthorization(
            state.session.validationPlan!,
            state.session.validationAuthorization!,
          );
          if (!authPre.ok) {
            validationDisposition = "NOT_DISPATCHED_FAILED";
            return finish("FAILED", "AUTHORIZATION_INCOMPATIBLE");
          }
          const budget = processBudgetMs(state.session.validationPlan!);
          if (budget > remainingAdmissionMs(state)) {
            validationDisposition = "NOT_DISPATCHED_BUDGET";
            return finish("FAILED", "INSUFFICIENT_EXECUTION_BUDGET");
          }

          state.phase = "EXECUTING_ENGINEERING_RUN";
          validationDisposition = "DISPATCHED";
          const runPromise = executeEngineeringRun(
            state.session.validationPlan!,
            state.session.validationAuthorization!,
            { signal: state.ownedAbort.signal },
          );

          if (state.stopLatched) {
            state.phase = "DRAINING";
            state.drainStartedAtMs = readMonotonicMs();
          }
          const runResult = await runPromise;
          if (state.stopLatched) {
            if (runResult.ok) {
              engineeringRun = runResult.value;
            }
            validationDisposition = runResult.ok
              ? "SETTLED"
              : "NOT_DISPATCHED_STOP";
            return finish(
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
              "STOP_DURING_EXECUTION",
            );
          }

          if (!runResult.ok) {
            validationDisposition = "SETTLED";
            return finish("FAILED", "ENGINEERING_RUN_FAILED");
          }
          engineeringRun = runResult.value;
          validationDisposition = "SETTLED";

          state.phase = "EVALUATING_GATE2";
          const evalResult = await evaluateExecutionEvidence(
            evidencePlanResult.value,
            engineeringRun,
          );
          if (state.stopLatched) {
            return finish(
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
            );
          }
          if (!evalResult.ok) {
            return finish("FAILED", "GATE2_EVALUATE_FAILED");
          }
          assessment = evalResult.value;
          assessedExecutionIds = assessment.claimStatuses
            .filter((c) => c.evidenceEstablished)
            .map((c) => c.claimId);

          if (assessment.decision === "EXECUTION_EVIDENCE_NOT_ESTABLISHED") {
            return finish("NOT_SUBSTANTIATED", "EXECUTION_EVIDENCE_NOT_ESTABLISHED", {
              gate2Decision: assessment.decision,
            });
          }

          state.phase = "FINAL_APPLICABILITY";
          const finalApp =
            await checkExecutionEvidenceAssessmentApplicability(assessment);
          if (state.stopLatched) {
            return finish(
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
              state.stopCause === "DEADLINE" ? "TIMED_OUT" : "CANCELLED",
            );
          }
          if (!finalApp.ok || !finalApp.value.applicable) {
            return finish("FAILED", "APPLICABILITY_FAILED");
          }
          const liveFinal = inspectLiveReferenceCatalogAssociation(
            state.session.catalog,
          );
          if (!liveFinal.ok) {
            return finish("FAILED", "CATALOG_INVALID");
          }

          return finish("SUBSTANTIATED", "EXECUTION_EVIDENCE_ACCEPTED", {
            gate2Decision: assessment.decision,
          });
        }

        return finish("EXHAUSTED", "REVISION_EXHAUSTED");
      } catch (err) {
        void err;
        clearOwnedTimer(state);
        detachCaller(state);
        state.phase = "FINALIZED";
        state.busy = false;
        const record = finalizeRecord({
          state,
          callerCorrelationId: frozenTask.correlationId,
          terminalState: "FAILED",
          originCode: "INTERNAL_CONTRACT",
          attempts,
          validationDisposition,
          planId: state.session.validationPlan?.planId ?? null,
          engineeringRunId: engineeringRun?.engineeringRunId ?? null,
          assessmentCorrelationId:
            assessment?.assessmentCorrelationId ?? null,
          gate2Decision: assessment?.decision ?? null,
          boundReasoning,
          assessedExecutionIds,
          startedAtWallMs,
          adapterSettlementStatus: lastAdapterSettlement,
        });
        return success(
          outcomeOf(record, {
            boundReasoning,
            engineeringRun,
            assessment,
          }),
        );
      }
    },
  };

  return success(cycle);
}

/** Test / falsification seam — not a production export surface for callers. */
export const __orchestratorTestSeams = {
  remainingAdmissionMs,
  brainAttemptTimeout,
  dispositionForGate1Failure,
  validateOriginalBlocksForRevision,
};
