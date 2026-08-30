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
import type { JsonObject } from "../../src/domain/json.js";
import type { KnowledgeState } from "../../src/domain/knowledge.js";
import type { ModelResponse } from "../../src/domain/provider.js";
import type { Result } from "../../src/domain/result.js";
import type { ToolResult } from "../../src/domain/tool.js";
import type {
  CanonicalPath,
  WorkspaceBoundary,
  WorkspacePathFailure,
} from "../../src/domain/workspace.js";
import {
  createWorkspaceBoundary,
} from "../../src/workspace/index.js";
import * as workspacePublic from "../../src/workspace/index.js";

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

// ---------------------------------------------------------------------------
// WorkspaceBoundary amendment evidence
// ---------------------------------------------------------------------------

type WorkspaceBoundaryKeys = keyof WorkspaceBoundary;

type ExpectTrue<T extends true> = T;
type ExpectFalse<T extends false> = T;

type CanonicalizeReturn = ReturnType<WorkspaceBoundary["canonicalize"]>;

type _CanonicalizeIsAsyncResult = ExpectTrue<
  CanonicalizeReturn extends Promise<Result<CanonicalPath, WorkspacePathFailure>>
    ? true
    : false
>;

// canonicalize does NOT return bare CanonicalPath
type _CanonicalizeNotBare = ExpectFalse<
  CanonicalizeReturn extends CanonicalPath ? true : false
>;

// isInside and resolveSymlinkTarget are absent
type _IsInsideAbsent = ExpectTrue<
  "isInside" extends WorkspaceBoundaryKeys ? false : true
>;
type _ResolveSymlinkAbsent = ExpectTrue<
  "resolveSymlinkTarget" extends WorkspaceBoundaryKeys ? false : true
>;

const _boundaryKeysOk: [_IsInsideAbsent, _ResolveSymlinkAbsent] = [true, true];

// Attempted use of removed methods must fail compilation.
declare const _boundary: WorkspaceBoundary;

// @ts-expect-error WorkspaceBoundary must not expose isInside
_boundary.isInside;

// @ts-expect-error WorkspaceBoundary must not expose resolveSymlinkTarget
_boundary.resolveSymlinkTarget;

// Bare CanonicalPath return type is rejected for canonicalize implementations.
const _badBareCanonicalize: WorkspaceBoundary = {
  // @ts-expect-error canonicalize must return Promise<Result<...>>, not CanonicalPath
  canonicalize(_inputPath: string): CanonicalPath {
    return "/tmp/project" as CanonicalPath;
  },
};

// WorkspacePathFailure.details is JSON-safe (JsonObject), not arbitrary.
const _validFailureDetails: WorkspacePathFailure = {
  code: "PATH_NOT_FOUND",
  message: "missing",
  details: { input: "relative/path" } satisfies JsonObject,
};

const _invalidFailureDetails: WorkspacePathFailure = {
  code: "INVALID_PATH_INPUT",
  message: "bad",
  // @ts-expect-error details must be JsonObject (JSON-safe), not a Date
  details: { when: new Date() },
};

// ---------------------------------------------------------------------------
// Phase 1C factory / brand surface evidence
// ---------------------------------------------------------------------------

type FactoryReturn = Awaited<ReturnType<typeof createWorkspaceBoundary>>;
type _FactoryReturnsResult = ExpectTrue<
  FactoryReturn extends Result<WorkspaceBoundary, WorkspacePathFailure>
    ? true
    : false
>;

type FailureBranch = Extract<FactoryReturn, { readonly ok: false }>;
type _FailureHasNoValue = ExpectTrue<
  "value" extends keyof FailureBranch ? false : true
>;

// @ts-expect-error brandCanonicalPath must not be part of the public workspace API
workspacePublic.brandCanonicalPath;

// Silence unused binding warnings under noUnusedLocals while keeping type probes live.
void _rawPath;
void _completionMissingNotValidated;
void _toolResultMissingEvidence;
void _retryWithoutFailure;
void _failureWithoutDiagnosis;
void _exhaustiveProbe;
void _authoritySmuggle;
void _authorityKeyExcluded;
void _boundaryKeysOk;
void _badBareCanonicalize;
void _validFailureDetails;
void _invalidFailureDetails;
type _Keep = [
  _CanonicalizeIsAsyncResult,
  _CanonicalizeNotBare,
  _IsInsideAbsent,
  _ResolveSymlinkAbsent,
  _FactoryReturnsResult,
  _FailureHasNoValue,
];
type _ForceKeep = _Keep;
void 0 as unknown as _ForceKeep;
