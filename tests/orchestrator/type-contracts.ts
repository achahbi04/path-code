/**
 * Compile-only type contracts for Phase 5D2 cycle wrappers.
 * These files are typechecked; they are not runtime Vitest cases.
 */

import type { CycleOutcome, CycleRecord, CycleSummary } from "../../src/orchestrator/types.js";
import type { ValidationAuthorization } from "../../src/validation/types.js";
import type { PreparedMutation } from "../../src/editing/types.js";
import type { ReferenceBoundReasoning } from "../../src/reasoning/types.js";
import type { ExecutionEvidenceAssessment } from "../../src/reasoning/gate2/types.js";
import type { EvidenceRecord } from "../../src/domain/evidence.js";
import type { CompletionReport } from "../../src/domain/completion.js";

declare function acceptRecord(value: CycleRecord): void;
declare function acceptSummary(value: CycleSummary): void;
declare function acceptOutcome(value: CycleOutcome): void;

declare const record: CycleRecord;
declare const summary: CycleSummary;
declare const outcome: CycleOutcome;

acceptRecord(record);
acceptSummary(summary);
acceptOutcome(outcome);

// E23 — wrappers are not authority / prepared edit / bound reasoning / assessment / evidence / completion
declare function asAuth(value: ValidationAuthorization): void;
declare function asEdit(value: PreparedMutation): void;
declare function asBound(value: ReferenceBoundReasoning): void;
declare function asAssessment(value: ExecutionEvidenceAssessment): void;
declare function asEvidence(value: EvidenceRecord): void;
declare function asCompletion(value: CompletionReport): void;

// @ts-expect-error CycleRecord is not ValidationAuthorization
asAuth(record);
// @ts-expect-error CycleSummary is not PreparedMutation
asEdit(summary);
// @ts-expect-error CycleOutcome is not ReferenceBoundReasoning
asBound(outcome);
// @ts-expect-error CycleRecord is not ExecutionEvidenceAssessment
asAssessment(record);
// @ts-expect-error CycleRecord is not EvidenceRecord
asEvidence(record);
// @ts-expect-error CycleSummary is not CompletionReport
asCompletion(summary);

type BadMode = {
  mode: "BIND_AND_VALIDATE";
  // missing validation fields
};

declare function open(session: import("../../src/orchestrator/types.js").EngineeringCycleSession): void;
// @ts-expect-error incomplete BIND_AND_VALIDATE session
open({ mode: "BIND_AND_VALIDATE" } as BadMode);
