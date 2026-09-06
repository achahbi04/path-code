/**
 * Compile-time contract proofs for Phase 5D1 Engineering Brain.
 * Checked by `tsc` / `npm run typecheck`. Not executed by Vitest.
 */

import type { EvidenceRecord } from "../../src/domain/evidence.js";
import type { CompletionReport } from "../../src/domain/completion.js";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../../src/domain/provider.js";
import type {
  ExecutionEvidenceAssessment,
} from "../../src/reasoning/gate2/types.js";
import type {
  ReferenceBoundReasoning,
} from "../../src/reasoning/types.js";
import type {
  BrainInvocationReceipt,
  BrainInvocationSummary,
  UntrustedBrainResponse,
  BrainInvocationRequest,
  EngineeringBrainAdapter,
} from "../../src/brain/index.js";
import type {
  EditAuthorization,
} from "../../src/editing/types.js";
import type {
  LocalProcessAuthorization,
} from "../../src/execution/types.js";
import type {
  ValidationAuthorization,
} from "../../src/validation/types.js";

declare const response: UntrustedBrainResponse;
declare const receipt: BrainInvocationReceipt;
declare const summary: BrainInvocationSummary;
declare const bound: ReferenceBoundReasoning;
declare const assessment: ExecutionEvidenceAssessment;
declare const evidence: EvidenceRecord;
declare const completion: CompletionReport;
declare const editAuth: EditAuthorization;
declare const processAuth: LocalProcessAuthorization;
declare const validationAuth: ValidationAuthorization;
declare const provider: ModelProvider;
declare const adapter: EngineeringBrainAdapter;

// D01 — foundation types remain available; brain does not replace ModelProvider.
const _providerId: string = provider.id;
const _complete: (req: ModelRequest) => Promise<ModelResponse> = provider.complete.bind(provider);
void _providerId;
void _complete;
void adapter.invoke;

// D23 — untrusted response is not bound reasoning / assessment / authority.
type ResponseIsNotBound = UntrustedBrainResponse extends ReferenceBoundReasoning
  ? never
  : true;
type ResponseIsNotAssessment = UntrustedBrainResponse extends ExecutionEvidenceAssessment
  ? never
  : true;
type ResponseIsNotEditAuth = UntrustedBrainResponse extends EditAuthorization
  ? never
  : true;
type ResponseIsNotProcessAuth = UntrustedBrainResponse extends LocalProcessAuthorization
  ? never
  : true;
type ResponseIsNotValidationAuth = UntrustedBrainResponse extends ValidationAuthorization
  ? never
  : true;

const r1: ResponseIsNotBound = true;
const r2: ResponseIsNotAssessment = true;
const r3: ResponseIsNotEditAuth = true;
const r4: ResponseIsNotProcessAuth = true;
const r5: ResponseIsNotValidationAuth = true;
void r1;
void r2;
void r3;
void r4;
void r5;
void response;
void bound;
void assessment;

// D23 — receipt/summary are not EvidenceRecord / CompletionReport / gate acceptance.
type ReceiptNotEvidence = BrainInvocationReceipt extends EvidenceRecord ? never : true;
type ReceiptNotCompletion = BrainInvocationReceipt extends CompletionReport ? never : true;
type SummaryNotEvidence = BrainInvocationSummary extends EvidenceRecord ? never : true;
type SummaryNotCompletion = BrainInvocationSummary extends CompletionReport ? never : true;

const e1: ReceiptNotEvidence = true;
const e2: ReceiptNotCompletion = true;
const e3: SummaryNotEvidence = true;
const e4: SummaryNotCompletion = true;
void e1;
void e2;
void e3;
void e4;
void receipt;
void summary;
void evidence;
void completion;
void editAuth;
void processAuth;
void validationAuth;

// Live authority artifacts rejected from packet at the type level (no such fields).
type RequestKeys = keyof BrainInvocationRequest;
type HasExecute = "execute" extends RequestKeys ? true : false;
type HasApproved = "approved" extends RequestKeys ? true : false;
type HasTools = "tools" extends RequestKeys ? true : false;
const noExecute: HasExecute = false;
const noApproved: HasApproved = false;
const noTools: HasTools = false;
void noExecute;
void noApproved;
void noTools;

// Meaning discriminant is explicitly untrusted.
const meaningCheck: UntrustedBrainResponse["meaning"] = "UNTRUSTED_RESPONSE_TEXT";
void meaningCheck;
