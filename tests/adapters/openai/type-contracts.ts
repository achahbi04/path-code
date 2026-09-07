/**
 * Phase 5E1 F31 — compile-time separation proofs (type-only; not runtime).
 */

import type {
  OpenAIAdapter,
  OpenAIAdapterDiagnostics,
} from "../../../src/adapters/openai/index.js";
import type { EngineeringBrainAdapterReply } from "../../../src/brain/types.js";
import type { EditAuthorization } from "../../../src/editing/types.js";
import type { ReferenceBoundReasoning } from "../../../src/reasoning/types.js";
import type { ExecutionEvidenceAssessment } from "../../../src/reasoning/gate2/types.js";
import type { EvidenceRecord } from "../../../src/domain/evidence.js";
import type { CompletionReport } from "../../../src/domain/completion.js";

declare const reply: EngineeringBrainAdapterReply;
declare const diag: OpenAIAdapterDiagnostics;
declare const adapter: OpenAIAdapter;

declare function asAuth(value: EditAuthorization): void;
declare function asBound(value: ReferenceBoundReasoning): void;
declare function asAssessment(value: ExecutionEvidenceAssessment): void;
declare function asEvidence(value: EvidenceRecord): void;
declare function asCompletion(value: CompletionReport): void;

// @ts-expect-error adapter reply is not EditAuthorization
asAuth(reply);
// @ts-expect-error adapter reply is not ReferenceBoundReasoning
asBound(reply);
// @ts-expect-error diagnostics are not ExecutionEvidenceAssessment
asAssessment(diag);
// @ts-expect-error diagnostics are not EvidenceRecord
asEvidence(diag);
// @ts-expect-error diagnostics are not CompletionReport
asCompletion(diag);

type CreateParams = Parameters<
  typeof import("../../../src/adapters/openai/index.js").createOpenAIAdapter
>;
type Config = CreateParams[0];

type AssertNoFetchSeam = Config extends { fetch?: unknown }
  ? never
  : Config extends { transport?: unknown }
    ? never
    : true;
const _noFetchSeam: AssertNoFetchSeam = true;
void _noFetchSeam;
void adapter;
