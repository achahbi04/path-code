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
import * as canonicalPathModule from "../../src/workspace/canonical-path.js";
import {
  collectGitStateBaseline,
  discoverGitRepository,
  type GitDiscoveryFailure,
  type GitPathObservation,
  type GitRepository,
  type GitStateBaseline,
  type GitStateBaselineData,
  type UnmappedVisibleGitObservation,
} from "../../src/git/index.js";
import * as gitPublic from "../../src/git/index.js";
import {
  loadProjectConfig,
  type ProjectConfig,
  type ProjectRestrictions,
  type RepositoryGuidance,
  type ResolvedProjectConfig,
} from "../../src/config/index.js";
import { defaultProjectConfig } from "../../src/config/types.js";
import * as configPublic from "../../src/config/index.js";
import type { PlatformId, PlatformInfo } from "../../src/platform/types.js";
import { detectPlatform } from "../../src/platform/detect.js";
import * as rootPublic from "../../src/index.js";
import { inventory } from "../../src/inventory/index.js";
import * as inventoryPublic from "../../src/inventory/index.js";
import type {
  RepositoryEntry,
  RepositoryEntryData,
  RepositoryInventory,
  RepositoryInventoryData,
} from "../../src/inventory/index.js";
import type { TraversalCompletion } from "../../src/inventory/disposition.js";
import { readRepositoryContent } from "../../src/reader/index.js";
import * as readerPublic from "../../src/reader/index.js";
import type {
  ContentObservation,
  ContentObservationData,
  RepositoryReadOutcome,
} from "../../src/reader/index.js";

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

// @ts-expect-error brandCanonicalPath must not be exported from canonical-path module
canonicalPathModule.brandCanonicalPath;

// ---------------------------------------------------------------------------
// Phase 1D discovery contract evidence
// ---------------------------------------------------------------------------

type DiscoverReturn = Awaited<ReturnType<typeof discoverGitRepository>>;
type _DiscoverConsumesBoundary = ExpectTrue<
  Parameters<typeof discoverGitRepository>[0] extends WorkspaceBoundary
    ? true
    : false
>;
type _DiscoverSuccessRootIsCanonical = ExpectTrue<
  Extract<DiscoverReturn, { readonly ok: true }>["value"]["root"] extends CanonicalPath
    ? true
    : false
>;
type DiscoverFailure = Extract<DiscoverReturn, { readonly ok: false }>;
type _DiscoverFailureHasNoRepo = ExpectTrue<
  "value" extends keyof DiscoverFailure ? false : true
>;

// Raw Git text cannot be assigned directly to GitRepository.root
// @ts-expect-error raw string is not CanonicalPath / GitRepository.root
const _rawGitRoot: GitRepository = { root: "/tmp/repo" };

type _GitFailureIsStructured = ExpectTrue<
  GitDiscoveryFailure["code"] extends
    | "GIT_NOT_AVAILABLE"
    | "NOT_A_GIT_REPOSITORY"
    | "NOT_A_WORKTREE"
    | "GIT_ROOT_OUTSIDE_WORKSPACE"
    | "GIT_DISCOVERY_FAILED"
    ? true
    : false
>;

// @ts-expect-error private Git runner must not be on the public git barrel
gitPublic.runGit;

// ---------------------------------------------------------------------------
// Phase 1E configuration contract evidence
// ---------------------------------------------------------------------------

type LoadReturn = Awaited<ReturnType<typeof loadProjectConfig>>;
type _LoadConsumesBoundary = ExpectTrue<
  Parameters<typeof loadProjectConfig>[0] extends WorkspaceBoundary ? true : false
>;
type LoadFailure = Extract<LoadReturn, { readonly ok: false }>;
type _LoadFailureHasNoConfig = ExpectTrue<
  "value" extends keyof LoadFailure ? false : true
>;

type RestrictionsKeys = keyof ProjectRestrictions;
type _NoAllowPathField = ExpectTrue<
  "allowPaths" extends RestrictionsKeys ? false : true
>;
type _NoGrantActionField = ExpectTrue<
  "grantActions" extends RestrictionsKeys ? false : true
>;
type _NoWorkspaceRootField = ExpectTrue<
  "workspaceRoot" extends RestrictionsKeys ? false : true
>;

type GuidanceTrust = RepositoryGuidance["trust"];
type _GuidanceTrustIsExplicit = ExpectTrue<
  GuidanceTrust extends "UNTRUSTED_REPOSITORY" ? true : false
>;

type AbsentConfig = Extract<ProjectConfig, { source: { kind: "ABSENT" } }>;
type _AbsentHasNoGuidance = ExpectTrue<
  "guidance" extends keyof AbsentConfig ? false : true
>;
// @ts-expect-error bounded reader must not be exported from config public API
configPublic.readBoundedConfigFile;

// @ts-expect-error parser must not be exported from config public API
configPublic.parseProjectConfigContent;

// @ts-expect-error configFailure factory must not be exported from config public API
configPublic.configFailure;

// @ts-expect-error defaultProjectConfig must not be on the public config barrel
configPublic.defaultProjectConfig;

// ---------------------------------------------------------------------------
// Phase 2 Pre-2A resolved configuration provenance evidence
// ---------------------------------------------------------------------------

declare function acceptResolved(value: ResolvedProjectConfig): void;

declare const plainConfig: ProjectConfig;

// @ts-expect-error plain ProjectConfig has no resolved provenance
acceptResolved(plainConfig);

const fallbackConfig = defaultProjectConfig();

// @ts-expect-error default config is not successfully resolved config
acceptResolved(fallbackConfig);

const syntheticAbsent: ProjectConfig = {
  source: { kind: "ABSENT" },
  restrictions: {
    deniedPaths: [],
    disabledActions: [],
  },
  unknownDirectives: [],
};

// @ts-expect-error synthetic ABSENT object is not resolved provenance
acceptResolved(syntheticAbsent);

type LoadSuccess = Extract<LoadReturn, { readonly ok: true }>["value"];
type _LoadSuccessIsResolved = ExpectTrue<
  LoadSuccess extends ResolvedProjectConfig ? true : false
>;
type _ResolvedExtendsProjectConfig = ExpectTrue<
  ResolvedProjectConfig extends ProjectConfig ? true : false
>;
type _PlainDoesNotExtendResolved = ExpectFalse<
  ProjectConfig extends ResolvedProjectConfig ? true : false
>;

// ---------------------------------------------------------------------------
// Phase 2A inventory provenance evidence
// ---------------------------------------------------------------------------

declare function acceptRepositoryEntry(value: RepositoryEntry): void;
declare function acceptRepositoryInventory(value: RepositoryInventory): void;

declare const earnedCanonicalPath: CanonicalPath;

const forgedEntry: RepositoryEntryData = {
  canonicalPath: earnedCanonicalPath,
  relativePath: "src/main.ts",
  lexicalKind: "FILE",
  physicalKind: "FILE",
  size: 1,
  mtimeMs: 0,
};

// @ts-expect-error RepositoryEntry requires earned inventory provenance
acceptRepositoryEntry(forgedEntry);

const forgedInventory: RepositoryInventoryData = {
  observations: [],
  traversalCompletion: { kind: "COMPLETE" },
  denyPathRules: [],
};

// @ts-expect-error RepositoryInventory requires earned inventory provenance
acceptRepositoryInventory(forgedInventory);

declare function runInventory(
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): ReturnType<typeof inventory>;

// @ts-expect-error inventory requires ResolvedProjectConfig, not plain ProjectConfig
runInventory(_boundary, plainConfig);

// @ts-expect-error inventory requires ResolvedProjectConfig, not default fallback
runInventory(_boundary, fallbackConfig);

const emptyPartial: TraversalCompletion = {
  kind: "PARTIAL",
  // @ts-expect-error PARTIAL requires a non-empty reasons list
  reasons: [],
};

type InventoryReturn = Awaited<ReturnType<typeof inventory>>;
type InventorySuccess = Extract<InventoryReturn, { readonly ok: true }>["value"];
type _InventorySuccessIsBranded = ExpectTrue<
  InventorySuccess extends RepositoryInventory ? true : false
>;

// @ts-expect-error RepositoryEntry branding helper must not be on inventory public API
inventoryPublic.brandRepositoryEntry;

// @ts-expect-error RepositoryInventory branding helper must not be on inventory public API
inventoryPublic.asRepositoryInventory;

void emptyPartial;

// ---------------------------------------------------------------------------
// Phase 2C Git baseline provenance evidence (RI-017)
// ---------------------------------------------------------------------------

declare function acceptRepositoryEntryFromGit(value: RepositoryEntry): void;
declare function acceptGitBaseline(value: GitStateBaseline): void;

declare const rawGitPath: string;
// @ts-expect-error raw Git path string is not RepositoryEntry
acceptRepositoryEntryFromGit(rawGitPath);

declare const gitPathObservation: GitPathObservation;
// @ts-expect-error GitPathObservation is not RepositoryEntry
acceptRepositoryEntryFromGit(gitPathObservation);

const forgedGitBaseline: GitStateBaselineData = {
  availability: { kind: "NOT_GIT_REPOSITORY" },
  annotations: [],
  unmappedVisibleObservations: [],
  inventoryTraversalCompletion: { kind: "COMPLETE" },
  provenance: "PRE_EXISTING",
  commandExclusionStatuses: [],
};

// @ts-expect-error GitStateBaseline requires earned collection provenance
acceptGitBaseline(forgedGitBaseline);

declare const unmapped: UnmappedVisibleGitObservation;
// @ts-expect-error unmapped observation has no RepositoryEntry field
unmapped.entry;

type _UnmappedHasNoEntry = ExpectTrue<
  "entry" extends keyof UnmappedVisibleGitObservation ? false : true
>;

type GitBaselineReturn = Awaited<ReturnType<typeof collectGitStateBaseline>>;
type _GitBaselineSuccessIsBranded = ExpectTrue<
  Extract<GitBaselineReturn, { readonly ok: true }>["value"] extends GitStateBaseline
    ? true
    : false
>;

// @ts-expect-error GitStateBaseline branding helper must not be public
gitPublic.brandGitStateBaseline;

// @ts-expect-error private Git check-ignore runner must not be on the public git barrel
gitPublic.runGitCheckIgnore;

// ---------------------------------------------------------------------------
// Phase 2B reader provenance evidence
// ---------------------------------------------------------------------------

declare function runReader(
  entry: RepositoryEntry,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): ReturnType<typeof readRepositoryContent>;

declare const resolvedForReader: ResolvedProjectConfig;

// @ts-expect-error raw string is not RepositoryEntry
runReader("/tmp/file.txt", _boundary, resolvedForReader);

// @ts-expect-error CanonicalPath alone is not RepositoryEntry
runReader(earnedCanonicalPath, _boundary, resolvedForReader);

// @ts-expect-error reader requires ResolvedProjectConfig, not plain ProjectConfig
runReader(forgedEntry as RepositoryEntry, _boundary, plainConfig);

declare const tooLargeOutcome: Extract<
  RepositoryReadOutcome,
  { readonly status: "TOO_LARGE" }
>;

// @ts-expect-error TOO_LARGE has no ContentObservation
tooLargeOutcome.observation;

declare const deniedOutcome: Extract<
  RepositoryReadOutcome,
  { readonly status: "DENIED" }
>;

// @ts-expect-error DENIED has no ContentObservation
deniedOutcome.observation;

declare const unreadableOutcome: Extract<
  RepositoryReadOutcome,
  { readonly status: "UNREADABLE" }
>;

// @ts-expect-error UNREADABLE has no ContentObservation
unreadableOutcome.observation;

declare const staleOutcome: Extract<
  RepositoryReadOutcome,
  { readonly status: "STALE_ENTRY" }
>;

// @ts-expect-error STALE_ENTRY has no ContentObservation
staleOutcome.observation;

declare function acceptContentObservation(value: ContentObservation): void;

const forgedObservation: ContentObservationData = {
  kind: "TEXT",
  entry: forgedEntry as RepositoryEntry,
  byteLength: 0,
  encoding: "UTF-8",
  text: "",
  fingerprint: {
    algorithm: "sha256",
    hex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    byteLength: 0,
  },
};

// @ts-expect-error ContentObservation requires earned reader provenance
acceptContentObservation(forgedObservation);

// @ts-expect-error ContentObservation branding helper must not be on reader public API
readerPublic.brandContentObservation;

// @ts-expect-error reader must not be on package root
rootPublic.readRepositoryContent;

type _TooLargeHasNoObservation = ExpectTrue<
  "observation" extends keyof Extract<
    RepositoryReadOutcome,
    { readonly status: "TOO_LARGE" }
  >
    ? false
    : true
>;

// ---------------------------------------------------------------------------
// Phase 1F platform / CLI contract evidence
// ---------------------------------------------------------------------------

type _PlatformIdClosed = ExpectTrue<
  PlatformId extends "macos" | "linux" | "windows" ? true : false
>;
type _NoExtraPlatformId = ExpectTrue<
  "freebsd" extends PlatformId ? false : true
>;

type DetectReturn = ReturnType<typeof detectPlatform>;
type DetectFailure = Extract<DetectReturn, { readonly ok: false }>;
type _UnsupportedHasNoPlatformInfo = ExpectTrue<
  "value" extends keyof DetectFailure ? false : true
>;

// Successful PlatformInfo cannot be constructed from unsupported mapping result type alone.
type DetectSuccess = Extract<DetectReturn, { readonly ok: true }>["value"];
type _SuccessIsPlatformInfo = ExpectTrue<
  DetectSuccess extends PlatformInfo ? true : false
>;

// @ts-expect-error CLI runCli must not be on package root
rootPublic.runCli;

// @ts-expect-error platform detectPlatform must not be on package root
rootPublic.detectPlatform;

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
void _rawGitRoot;
type _Keep = [
  _CanonicalizeIsAsyncResult,
  _CanonicalizeNotBare,
  _IsInsideAbsent,
  _ResolveSymlinkAbsent,
  _FactoryReturnsResult,
  _FailureHasNoValue,
  _DiscoverConsumesBoundary,
  _DiscoverSuccessRootIsCanonical,
  _DiscoverFailureHasNoRepo,
  _GitFailureIsStructured,
  _LoadConsumesBoundary,
  _LoadFailureHasNoConfig,
  _NoAllowPathField,
  _NoGrantActionField,
  _NoWorkspaceRootField,
  _GuidanceTrustIsExplicit,
  _AbsentHasNoGuidance,
  _LoadSuccessIsResolved,
  _ResolvedExtendsProjectConfig,
  _PlainDoesNotExtendResolved,
  _InventorySuccessIsBranded,
  _UnmappedHasNoEntry,
  _GitBaselineSuccessIsBranded,
  _TooLargeHasNoObservation,
  _PlatformIdClosed,
  _NoExtraPlatformId,
  _UnsupportedHasNoPlatformInfo,
  _SuccessIsPlatformInfo,
];
type _ForceKeep = _Keep;
void 0 as unknown as _ForceKeep;
