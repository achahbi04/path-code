/**
 * Phase 5D2 Engineering Orchestrator — public types.
 */

import type { EngineeringBrain } from "../brain/types.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { EngineeringRunRecord } from "../engineering-run/types.js";
import type {
  ExecutionEvidenceAssessment,
  ClaimCheckAssignmentInput,
} from "../reasoning/gate2/types.js";
import type { ReferenceBoundReasoning } from "../reasoning/types.js";
import type { ReferenceCatalog } from "../reasoning/catalog.js";
import type { RepositorySnapshot } from "../snapshot/types.js";
import type {
  PreparedValidationPlan,
  ValidationAuthorization,
} from "../validation/types.js";
import type { BrainContextBlock, BrainReferenceDescriptor } from "../brain/types.js";
import type { BrainInvocationReceipt } from "../brain/types.js";
import type {
  CYCLE_RECORD_SCHEMA_VERSION,
} from "./bounds.js";
import type {
  CycleConfigurationFailure,
  CycleFailure,
  CycleOriginCode,
  CycleTerminalState,
} from "./failures.js";

export type EngineeringCycleMode = "BIND_ONLY" | "BIND_AND_VALIDATE";

export type BindOnlySession = {
  readonly mode: "BIND_ONLY";
  readonly workspace: WorkspaceBoundary;
  readonly snapshot: RepositorySnapshot;
  readonly catalog: ReferenceCatalog;
  readonly brain: EngineeringBrain;
};

export type BindAndValidateSession = {
  readonly mode: "BIND_AND_VALIDATE";
  readonly workspace: WorkspaceBoundary;
  readonly snapshot: RepositorySnapshot;
  readonly catalog: ReferenceCatalog;
  readonly brain: EngineeringBrain;
  readonly validationPlan: PreparedValidationPlan;
  readonly validationAuthorization: ValidationAuthorization;
  readonly claimCheckAssignments: readonly ClaimCheckAssignmentInput[];
};

export type EngineeringCycleSession = BindOnlySession | BindAndValidateSession;

export type EngineeringCycleOptions = {
  readonly maxBrainAttempts?: number;
  readonly cycleAdmissionMs?: number;
  readonly brainAttemptTimeoutMs?: number;
};

export type EngineeringCycleTask = {
  readonly correlationId: string;
  readonly instructionText: string;
  readonly contextBlocks: readonly BrainContextBlock[];
};

export type CycleControlPhase =
  | "IDLE"
  | "VALIDATING_SESSION"
  | "BUILDING_REQUEST"
  | "AWAITING_BRAIN"
  | "BINDING"
  | "REVISING"
  | "RECHECKING_BOUND_REASONING"
  | "PREPARING_EXECUTION_EVIDENCE"
  | "RECHECKING_EXECUTION_PRECONDITIONS"
  | "EXECUTING_ENGINEERING_RUN"
  | "EVALUATING_GATE2"
  | "FINAL_APPLICABILITY"
  | "DRAINING"
  | "FINALIZED";

export type ValidationDisposition =
  | "NOT_REQUESTED"
  | "NO_EXECUTION_OBLIGATIONS"
  | "DISPATCHED"
  | "NOT_DISPATCHED_BUDGET"
  | "NOT_DISPATCHED_STOP"
  | "NOT_DISPATCHED_FAILED"
  | "SETTLED";

export type AttemptGate1Outcome =
  | {
      readonly kind: "BOUND";
      readonly code: null;
    }
  | {
      readonly kind: "REFUSAL" | "INPUT" | "CATALOG" | "UNKNOWN";
      readonly code: string;
      readonly claimId?: string;
    };

export type CycleAttemptRecord = {
  readonly attemptIndex: number;
  readonly correlationId: string;
  readonly purpose: "PROPOSE_REASONING" | "REVISE_REASONING";
  readonly brainOutcome: "SUCCESS" | "FAILURE" | "NOT_DISPATCHED";
  readonly brainFailureCode: string | null;
  readonly brainReceipt: BrainInvocationReceipt | null;
  readonly adapterDispatched: boolean;
  readonly gate1Outcome: AttemptGate1Outcome | null;
  readonly revised: boolean;
};

export type CycleRecord = {
  readonly schemaVersion: typeof CYCLE_RECORD_SCHEMA_VERSION;
  readonly cycleId: string;
  readonly callerCorrelationId: string;
  readonly mode: EngineeringCycleMode;
  readonly phase: CycleControlPhase;
  readonly terminalState: CycleTerminalState;
  readonly originCode: CycleOriginCode;
  readonly brainAttemptCount: number;
  readonly brainDispatchCount: number;
  readonly revisionCount: number;
  readonly attempts: readonly CycleAttemptRecord[];
  readonly validationDisposition: ValidationDisposition;
  readonly validationRequested: boolean;
  readonly validationEligible: boolean;
  readonly validationDispatched: boolean;
  readonly validationSettled: boolean;
  readonly planId: string | null;
  readonly engineeringRunId: string | null;
  readonly assessmentCorrelationId: string | null;
  readonly gate2Decision: string | null;
  readonly outstandingExecutionClaimIds: readonly string[];
  readonly deferredContainsClaimIds: readonly string[];
  readonly outstandingHypothesisIds: readonly string[];
  readonly startedAtWallMs: number;
  readonly finishedAtWallMs: number;
  readonly durationMs: number;
  readonly stopRequestedAtWallMs: number | null;
  readonly stopCause: "CALLER_ABORT" | "CLOSE" | "DEADLINE" | null;
  readonly drainDurationMs: number | null;
  readonly adapterSettlementStatus: string | null;
  readonly limitations: readonly string[];
};

export type CycleSummary = {
  readonly schemaVersion: typeof CYCLE_RECORD_SCHEMA_VERSION;
  readonly cycleId: string;
  readonly callerCorrelationId: string;
  readonly mode: EngineeringCycleMode;
  readonly terminalState: CycleTerminalState;
  readonly originCode: CycleOriginCode;
  readonly brainAttemptCount: number;
  readonly brainDispatchCount: number;
  readonly revisionCount: number;
  readonly validationDisposition: ValidationDisposition;
  readonly planId: string | null;
  readonly engineeringRunId: string | null;
  readonly assessmentCorrelationId: string | null;
  readonly gate2Decision: string | null;
  readonly outstandingExecutionClaimIds: readonly string[];
  readonly deferredContainsClaimIds: readonly string[];
  readonly durationMs: number;
  readonly stopCause: CycleRecord["stopCause"];
};

export type CycleArtifacts = {
  readonly boundReasoning: ReferenceBoundReasoning | null;
  readonly engineeringRun: EngineeringRunRecord | null;
  readonly assessment: ExecutionEvidenceAssessment | null;
};

export type CycleOutcome = {
  readonly record: CycleRecord;
  readonly artifacts: CycleArtifacts;
};

export type CycleDescriptorView = {
  readonly cycleId: string;
  readonly mode: EngineeringCycleMode;
  readonly phase: CycleControlPhase;
  readonly closed: boolean;
  readonly runEntered: boolean;
  readonly busy: boolean;
  readonly stopState: "NONE" | "STOP_REQUESTED" | "DRAINING" | "SETTLED";
  readonly maxBrainAttempts: number;
  readonly cycleAdmissionMs: number;
};

export type EngineeringCycle = {
  readonly run: (
    task: EngineeringCycleTask,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<
    import("../domain/result.js").Result<CycleOutcome, CycleFailure>
  >;
  readonly describe: () => CycleDescriptorView;
  readonly close: () => void;
};

export type OpenEngineeringCycleResult = import("../domain/result.js").Result<
  EngineeringCycle,
  CycleConfigurationFailure
>;

export type CapturedBrain = {
  readonly brain: EngineeringBrain;
  readonly invoke: EngineeringBrain["invoke"];
  readonly describe: EngineeringBrain["describe"];
};

export type FrozenSessionView = {
  readonly mode: EngineeringCycleMode;
  readonly workspace: WorkspaceBoundary;
  readonly snapshot: RepositorySnapshot;
  readonly catalog: ReferenceCatalog;
  readonly brain: CapturedBrain;
  readonly descriptors: readonly BrainReferenceDescriptor[];
  readonly validationPlan: PreparedValidationPlan | null;
  readonly validationAuthorization: ValidationAuthorization | null;
  readonly claimCheckAssignments: readonly ClaimCheckAssignmentInput[];
};
