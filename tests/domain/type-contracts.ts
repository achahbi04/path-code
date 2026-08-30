/**
 * Compile-time contract tests for Phase 1B.
 * Checked by `tsc` / `npm run typecheck`. Not executed by Vitest.
 */

import type { AuthorityDecision } from "../../src/domain/authority.js";
import type { CompletionReport } from "../../src/domain/completion.js";
import type {
  FailureRecord,
  RetryRequest,
} from "../../src/domain/failure.js";
import type { KnowledgeState } from "../../src/domain/knowledge.js";
import type { ModelResponse } from "../../src/domain/provider.js";
import type { ToolResult } from "../../src/domain/tool.js";
import type { CanonicalPath } from "../../src/domain/workspace.js";

// 1. raw string is NOT assignable to CanonicalPath
// @ts-expect-error raw string is not assignable to CanonicalPath
const _rawPath: CanonicalPath = "/tmp/project";

// 2. CompletionReport without notValidated fails compilation
// @ts-expect-error notValidated is required on CompletionReport
const _completionMissingNotValidated: CompletionReport = {
  completed: true,
  outcome: "PROVEN",
  evidence: [],
};

// 3. ToolResult without evidence fails compilation
// @ts-expect-error evidence is required on ToolResult
const _toolResultMissingEvidence: ToolResult = {
  toolName: "read_file",
  actionClass: "READ",
  outcome: { ok: true },
  provenance: "PRE_EXISTING",
};

// 4. retry representation without diagnosed FailureRecord fails compilation
// @ts-expect-error RetryRequest requires a FailureRecord (which itself requires diagnosis)
const _retryWithoutFailure: RetryRequest = {
  attempt: 1,
};

// Also: FailureRecord without diagnosis is invalid
// @ts-expect-error diagnosis is required on FailureRecord
const _failureWithoutDiagnosis: FailureRecord = {
  action: "EDIT",
  code: "INTERNAL_ERROR",
  message: "failed",
  evidence: [],
};

// 5. discriminated unions use exhaustive handling
function assertNever(value: never): never {
  throw new Error(`unexpected value: ${String(value)}`);
}

function knowledgeStateLabel(state: KnowledgeState): string {
  switch (state) {
    case "KNOWN":
      return "known";
    case "UNKNOWN":
      return "unknown";
    case "INSPECTED":
      return "inspected";
    case "CHANGED":
      return "changed";
    case "STALE":
      return "stale";
    case "RE_READ_REQUIRED":
      return "re-read-required";
    case "VERIFIED":
      return "verified";
    case "FAILED":
      return "failed";
    case "PARTIALLY_VERIFIED":
      return "partially-verified";
    default:
      return assertNever(state);
  }
}

const _exhaustiveProbe: string = knowledgeStateLabel("VERIFIED");

// 6. ModelResponse cannot carry AuthorityDecision / grant ActionClass
const _authoritySmuggle: ModelResponse = {
  content: "x",
  toolCalls: [],
  // @ts-expect-error ModelResponse must not accept AuthorityDecision
  authority: "ALLOW" as AuthorityDecision,
};

// Prove AuthorityDecision is not part of the ModelResponse structural contract.
type ModelResponseKeys = keyof ModelResponse;
type AuthorityMustNotBeModelKey = AuthorityDecision extends ModelResponseKeys
  ? never
  : true;
const _authorityKeyExcluded: AuthorityMustNotBeModelKey = true;

// Silence unused binding warnings under noUnusedLocals while keeping type probes live.
void _rawPath;
void _completionMissingNotValidated;
void _toolResultMissingEvidence;
void _retryWithoutFailure;
void _failureWithoutDiagnosis;
void _exhaustiveProbe;
void _authoritySmuggle;
void _authorityKeyExcluded;
