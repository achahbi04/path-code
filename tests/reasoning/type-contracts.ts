/**
 * Compile-time contract proofs for Phase 5A Reasoning Ledger types.
 * Checked by `tsc` / `npm run typecheck`. Not executed by Vitest.
 *
 * Ambient declare const values are compile-time witnesses, not runtime evidence.
 */

import type { WorkspaceBoundary } from "../../src/domain/workspace.js";
import type {
  EditAuthorization,
  PreparedChange,
} from "../../src/editing/types.js";
import type { EngineeringRunRecord } from "../../src/engineering-run/types.js";
import type {
  LocalProcessAuthorization,
  PreparedLocalProcess,
} from "../../src/execution/types.js";
import type { RepositoryEntry } from "../../src/inventory/types.js";
import type { ManifestEvidence } from "../../src/metadata/types.js";
import type { ContentObservation } from "../../src/reader/types.js";
import type {
  DeferredContentCheckRequirement,
  EngineeringRunCitation,
  ExecutionVerificationRequirement,
  ObservationVerificationRequirement,
  ProposedClaim,
  ProposedEvidenceReference,
  ReasoningHypothesis,
  ReasoningProposal,
  ReasoningRefusal,
  ReasoningRefusalCode,
  ReferenceBoundClaim,
  ReferenceBoundClaimShape,
  ReferenceBoundContext,
  ReferenceBoundReasoning,
} from "../../src/reasoning/index.js";
import type { RepositorySnapshot } from "../../src/snapshot/types.js";
import type {
  PreparedValidationPlan,
  ValidationAuthorization,
} from "../../src/validation/types.js";

// --- Compile-time witnesses (not runtime evidence) ---

declare const entryWitness: RepositoryEntry;
declare const contentWitness: ContentObservation;
declare const manifestWitness: ManifestEvidence;
declare const workspaceWitness: WorkspaceBoundary;
declare const snapshotWitness: RepositorySnapshot;
declare const engineeringRunWitness: EngineeringRunRecord;
declare const boundClaimWitness: ReferenceBoundClaim;
declare const preparedChangeWitness: PreparedChange;
declare const editAuthWitness: EditAuthorization;
declare const preparedProcessWitness: PreparedLocalProcess;
declare const processAuthWitness: LocalProcessAuthorization;
declare const preparedValidationWitness: PreparedValidationPlan;
declare const validationAuthWitness: ValidationAuthorization;

const boundContext: ReferenceBoundContext = {
  workspace: workspaceWitness,
  snapshot: snapshotWitness,
};

const observationReq: ObservationVerificationRequirement = {
  method: "OBSERVATION",
};
const deferredReq: DeferredContentCheckRequirement = {
  method: "DEFERRED_CONTENT_CHECK",
};
const executionReq: ExecutionVerificationRequirement = {
  method: "EXECUTION",
  checkKinds: ["TYPECHECK"],
  checkPurpose: "assert symbol presence via future check",
};

// =============================================================================
// T01 — All six proposed claim variants; incomplete citations remain proposed
// =============================================================================

const proposedPath: ProposedEvidenceReference = {
  kind: "REPOSITORY_RELATIVE_PATH",
  relativePath: "src/example.ts",
};
const proposedId: ProposedEvidenceReference = {
  kind: "EVIDENCE_ID",
  id: "ev-1",
};

const proposedExists: ProposedClaim = {
  kind: "EXISTS",
  claimId: "c-exists",
  statement: "entry may exist",
  proposedSubject: proposedPath,
  proposedCitations: [],
};
const proposedContent: ProposedClaim = {
  kind: "CONTENT",
  claimId: "c-content",
  statement: "bytes were observed",
  proposedSubject: proposedId,
  proposedCitations: [proposedId],
};
const proposedDepends: ProposedClaim = {
  kind: "DEPENDS_DECLARED",
  claimId: "c-depends",
  statement: "dependency declared",
  proposedSubject: proposedPath,
  proposedCitations: [],
  dependencyName: "typescript",
};
const proposedContains: ProposedClaim = {
  kind: "CONTAINS",
  claimId: "c-contains",
  statement: "needle may appear",
  proposedSubject: proposedPath,
  proposedCitations: [],
  needle: "export type Foo",
};
const proposedDefines: ProposedClaim = {
  kind: "DEFINES",
  claimId: "c-defines",
  statement: "symbol may be defined",
  proposedSubject: proposedPath,
  proposedCitations: [proposedPath],
  symbolName: "Foo",
};
const proposedBehaves: ProposedClaim = {
  kind: "BEHAVES",
  claimId: "c-behaves",
  statement: "scenario may hold",
  proposedSubject: proposedPath,
  proposedCitations: [],
  scenarioDescription: "returns success for valid input",
};

const proposal: ReasoningProposal = {
  schemaVersion: 1,
  proposalId: "p-1",
  requestedOutcome: "describe current module layout",
  claims: [
    proposedExists,
    proposedContent,
    proposedDepends,
    proposedContains,
    proposedDefines,
    proposedBehaves,
  ],
  hypotheses: [],
};
void proposal;

// =============================================================================
// T02 — Valid shape witnesses for every bound-kind/source/method combination
// =============================================================================

const shapeExists: ReferenceBoundClaimShape = {
  kind: "EXISTS",
  claimId: "b-exists",
  statement: "entry observed in snapshot context",
  bindingStage: "REFERENCES_ONLY",
  context: boundContext,
  subject: entryWitness,
  requiredVerification: observationReq,
};
const shapeContent: ReferenceBoundClaimShape = {
  kind: "CONTENT",
  claimId: "b-content",
  statement: "content observation referenced",
  bindingStage: "REFERENCES_ONLY",
  context: boundContext,
  subject: contentWitness,
  requiredVerification: observationReq,
};
const shapeDepends: ReferenceBoundClaimShape = {
  kind: "DEPENDS_DECLARED",
  claimId: "b-depends",
  statement: "manifest declares dependency",
  bindingStage: "REFERENCES_ONLY",
  context: boundContext,
  subject: manifestWitness,
  dependencyName: "typescript",
  requiredVerification: observationReq,
};
const shapeContains: ReferenceBoundClaimShape = {
  kind: "CONTAINS",
  claimId: "b-contains",
  statement: "needle search deferred",
  bindingStage: "REFERENCES_ONLY",
  context: boundContext,
  subject: contentWitness,
  needle: "export type Foo",
  requiredVerification: deferredReq,
};
const shapeDefines: ReferenceBoundClaimShape = {
  kind: "DEFINES",
  claimId: "b-defines",
  statement: "symbol requires execution check",
  bindingStage: "REFERENCES_ONLY",
  context: boundContext,
  subjects: [contentWitness],
  symbolName: "Foo",
  requiredVerification: executionReq,
};
const shapeBehaves: ReferenceBoundClaimShape = {
  kind: "BEHAVES",
  claimId: "b-behaves",
  statement: "behavior requires execution check",
  bindingStage: "REFERENCES_ONLY",
  context: boundContext,
  subjects: [contentWitness],
  scenarioDescription: "returns success for valid input",
  requiredVerification: executionReq,
};
void shapeExists;
void shapeContent;
void shapeDepends;
void shapeContains;
void shapeDefines;
void shapeBehaves;

const boundReasoning: ReferenceBoundReasoning = {
  context: boundContext,
  claims: [boundClaimWitness],
  hypotheses: [],
};
void boundReasoning;

// =============================================================================
// T03 — Raw proposed claim/bundle is not assignable to reference-bound counterpart
// =============================================================================

// @ts-expect-error T03 ProposedClaim is not ReferenceBoundClaim
const _t03Claim: ReferenceBoundClaim = proposedExists;
// @ts-expect-error T03 ReasoningProposal is not ReferenceBoundReasoning
const _t03Bundle: ReferenceBoundReasoning = proposal;
// Opacity separately: valid unbranded shape still lacks the private brand.
// @ts-expect-error T03 ReferenceBoundClaimShape is not opaque ReferenceBoundClaim
const _t03Opacity: ReferenceBoundClaim = shapeExists;
void _t03Claim;
void _t03Bundle;
void _t03Opacity;

// =============================================================================
// T04 — Path/ID/plain data cannot replace earned artifact types in bound shapes
// =============================================================================

function acceptExistsSubject(subject: RepositoryEntry): ReferenceBoundClaimShape {
  return {
    kind: "EXISTS",
    claimId: "x",
    statement: "x",
    bindingStage: "REFERENCES_ONLY",
    context: boundContext,
    subject,
    requiredVerification: observationReq,
  };
}
function acceptContentSubject(subject: ContentObservation): ReferenceBoundClaimShape {
  return {
    kind: "CONTENT",
    claimId: "x",
    statement: "x",
    bindingStage: "REFERENCES_ONLY",
    context: boundContext,
    subject,
    requiredVerification: observationReq,
  };
}
function acceptDependsSubject(subject: ManifestEvidence): ReferenceBoundClaimShape {
  return {
    kind: "DEPENDS_DECLARED",
    claimId: "x",
    statement: "x",
    bindingStage: "REFERENCES_ONLY",
    context: boundContext,
    subject,
    dependencyName: "typescript",
    requiredVerification: observationReq,
  };
}

// @ts-expect-error T04 path string is not RepositoryEntry
acceptExistsSubject("src/example.ts");
// @ts-expect-error T04 evidence id string is not ContentObservation
acceptContentSubject("ev-1");
// @ts-expect-error T04 plain object is not ManifestEvidence
acceptDependsSubject({ packageName: "typescript" });

// =============================================================================
// T05 — Wrong evidence category for CONTENT or DEPENDS_DECLARED is rejected
// =============================================================================

// @ts-expect-error T05 RepositoryEntry is wrong evidence for CONTENT
acceptContentSubject(entryWitness);
// @ts-expect-error T05 ContentObservation is wrong evidence for DEPENDS_DECLARED
acceptDependsSubject(contentWitness);

// =============================================================================
// T06 — DEFINES/BEHAVES cannot choose OBSERVATION or omit execution requirement
// =============================================================================

function acceptDefinesVerification(
  requiredVerification: ExecutionVerificationRequirement,
): ReferenceBoundClaimShape {
  return {
    kind: "DEFINES",
    claimId: "x",
    statement: "x",
    bindingStage: "REFERENCES_ONLY",
    context: boundContext,
    subjects: [contentWitness],
    symbolName: "Foo",
    requiredVerification,
  };
}
function acceptBehavesVerification(
  requiredVerification: ExecutionVerificationRequirement,
): ReferenceBoundClaimShape {
  return {
    kind: "BEHAVES",
    claimId: "x",
    statement: "x",
    bindingStage: "REFERENCES_ONLY",
    context: boundContext,
    subjects: [contentWitness],
    scenarioDescription: "scenario",
    requiredVerification,
  };
}

// @ts-expect-error T06 DEFINES cannot use OBSERVATION verification
acceptDefinesVerification(observationReq);
// @ts-expect-error T06 BEHAVES cannot omit execution requirement fields
acceptBehavesVerification({ method: "EXECUTION" });

// =============================================================================
// T07 — CONTAINS cannot claim implemented content verification or semantic success
// =============================================================================

function acceptContainsVerification(
  requiredVerification: DeferredContentCheckRequirement,
): ReferenceBoundClaimShape {
  return {
    kind: "CONTAINS",
    claimId: "x",
    statement: "x",
    bindingStage: "REFERENCES_ONLY",
    context: boundContext,
    subject: contentWitness,
    needle: "x",
    requiredVerification,
  };
}

// @ts-expect-error T07 CONTAINS cannot use OBSERVATION as if search succeeded
acceptContainsVerification(observationReq);
// @ts-expect-error T07 CONTAINS cannot use EXECUTION semantic success
acceptContainsVerification(executionReq);

type ContainsShape = Extract<ReferenceBoundClaimShape, { kind: "CONTAINS" }>;
function acceptContainsShape(shape: ContainsShape): void {
  void shape;
}
acceptContainsShape({
  kind: "CONTAINS",
  claimId: "x",
  statement: "x",
  bindingStage: "REFERENCES_ONLY",
  context: boundContext,
  subject: contentWitness,
  needle: "x",
  requiredVerification: deferredReq,
  // @ts-expect-error T07 no isVerified / truth upgrade on CONTAINS shape
  isVerified: true,
});

// =============================================================================
// T08 — Hypotheses are not bound claims; INFERRED basis nonempty
// =============================================================================

const inferredOk: ReasoningHypothesis = {
  hypothesisId: "h-1",
  epistemic: "INFERRED",
  statement: "no match in admitted scope",
  supportingClaimIds: ["c-contains"],
};
const unverifiedOk: ReasoningHypothesis = {
  hypothesisId: "h-2",
  epistemic: "UNVERIFIED",
  statement: "assumed layout",
};
void inferredOk;
void unverifiedOk;

// @ts-expect-error T08 INFERRED requires nonempty supportingClaimIds
const _t08EmptyBasis: ReasoningHypothesis = {
  hypothesisId: "h-bad",
  epistemic: "INFERRED",
  statement: "x",
  supportingClaimIds: [],
};
// @ts-expect-error T08 hypothesis is not a ReferenceBoundClaim
const _t08AsBound: ReferenceBoundClaim = inferredOk;
// @ts-expect-error T08 hypothesis is not a ProposedClaim
const _t08AsProposed: ProposedClaim = unverifiedOk;
void _t08EmptyBasis;
void _t08AsBound;
void _t08AsProposed;

// =============================================================================
// T09 — Proposed/bound claims are not edit, process, or Validation authorization
// =============================================================================

// @ts-expect-error T09 ProposedClaim is not PreparedChange
const _t09Prepared: PreparedChange = proposedExists;
// @ts-expect-error T09 ReferenceBoundClaim is not EditAuthorization
const _t09EditAuth: EditAuthorization = boundClaimWitness;
// @ts-expect-error T09 ReasoningProposal is not LocalProcessAuthorization
const _t09ProcAuth: LocalProcessAuthorization = proposal;
// @ts-expect-error T09 ReferenceBoundReasoning is not ValidationAuthorization
const _t09ValAuth: ValidationAuthorization = boundReasoning;
// @ts-expect-error T09 ProposedClaim is not PreparedLocalProcess
const _t09PrepProc: PreparedLocalProcess = proposedDefines;
// @ts-expect-error T09 ReferenceBoundClaim is not PreparedValidationPlan
const _t09ValPlan: PreparedValidationPlan = boundClaimWitness;
void _t09Prepared;
void _t09EditAuth;
void _t09ProcAuth;
void _t09ValAuth;
void _t09PrepProc;
void _t09ValPlan;
void preparedChangeWitness;
void editAuthWitness;
void preparedProcessWitness;
void processAuthWitness;
void preparedValidationWitness;
void validationAuthWitness;

// =============================================================================
// T10 — Engineering Run citation requires actual record + nonempty check IDs
// =============================================================================

const citationOk: EngineeringRunCitation = {
  meaning: "CITED_RUN_ONLY",
  claimId: "c-defines",
  run: engineeringRunWitness,
  selectedCheckIds: ["check-1"],
};
void citationOk;

function acceptCitation(
  run: EngineeringRunRecord,
  selectedCheckIds: EngineeringRunCitation["selectedCheckIds"],
): EngineeringRunCitation {
  return {
    meaning: "CITED_RUN_ONLY",
    claimId: "c-defines",
    run,
    selectedCheckIds,
  };
}

// @ts-expect-error T10 string resultId is not EngineeringRunRecord
acceptCitation("run-id-only", ["check-1"]);
// @ts-expect-error T10 empty check IDs are rejected
acceptCitation(engineeringRunWitness, []);
// @ts-expect-error T10 JSON object is not EngineeringRunRecord
acceptCitation({ engineeringRunId: "x" }, ["check-1"]);

// =============================================================================
// T11 — Readonly arrays reject mutation through the declared API
// =============================================================================

// @ts-expect-error T11 claims array is readonly
proposal.claims.push(proposedExists);
// @ts-expect-error T11 citations array is readonly
proposedContent.proposedCitations.push(proposedId);
// @ts-expect-error T11 supportingClaimIds is readonly
inferredOk.supportingClaimIds.push("extra");
// @ts-expect-error T11 selectedCheckIds is readonly
citationOk.selectedCheckIds.push("extra");
// @ts-expect-error T11 bound claims array is readonly
boundReasoning.claims.push(boundClaimWitness);

// =============================================================================
// T12 — Exhaustive narrowing for claim kinds and refusal codes
// =============================================================================

function assertNever(value: never): never {
  return value;
}

function narrowProposedKind(claim: ProposedClaim): string {
  switch (claim.kind) {
    case "EXISTS":
      return claim.claimId;
    case "CONTENT":
      return claim.claimId;
    case "DEPENDS_DECLARED":
      return claim.dependencyName;
    case "CONTAINS":
      return claim.needle;
    case "DEFINES":
      return claim.symbolName;
    case "BEHAVES":
      return claim.scenarioDescription;
    default:
      return assertNever(claim);
  }
}

function narrowBoundKind(shape: ReferenceBoundClaimShape): string {
  switch (shape.kind) {
    case "EXISTS":
      return shape.subject.relativePath;
    case "CONTENT":
      return shape.subject.fingerprint.hex;
    case "DEPENDS_DECLARED":
      return shape.dependencyName;
    case "CONTAINS":
      return shape.needle;
    case "DEFINES":
      return shape.symbolName;
    case "BEHAVES":
      return shape.scenarioDescription;
    default:
      return assertNever(shape);
  }
}

function narrowRefusal(code: ReasoningRefusalCode): string {
  switch (code) {
    case "UNBOUND_CLAIM":
      return code;
    case "EVIDENCE_IDENTITY_MISMATCH":
      return code;
    case "STALE_EVIDENCE":
      return code;
    case "GROUNDING_OVERCLAIM":
      return code;
    case "UNVERIFIABLE_IN_PRECONDITION":
      return code;
    case "CLAIM_OUTSIDE_ADMITTED_SET":
      return code;
    default:
      return assertNever(code);
  }
}

void narrowProposedKind(proposedExists);
void narrowBoundKind(shapeExists);
void narrowRefusal("UNBOUND_CLAIM");

const refusals: readonly ReasoningRefusal[] = [
  { code: "UNBOUND_CLAIM", claimId: "c1", reason: "no citations" },
  {
    code: "EVIDENCE_IDENTITY_MISMATCH",
    claimId: "c2",
    reason: "identity mismatch",
  },
  { code: "STALE_EVIDENCE", claimId: "c3", reason: "stale" },
  { code: "GROUNDING_OVERCLAIM", claimId: "c4", reason: "overclaim" },
  {
    code: "UNVERIFIABLE_IN_PRECONDITION",
    claimId: "c5",
    reason: "unverifiable",
  },
  {
    code: "CLAIM_OUTSIDE_ADMITTED_SET",
    claimId: "c6",
    reason: "outside set",
  },
];
void refusals;

// Unhandled variant must fail: omit CONTAINS from a consumer.
function incompleteBoundConsumer(shape: ReferenceBoundClaimShape): string {
  switch (shape.kind) {
    case "EXISTS":
      return "exists";
    case "CONTENT":
      return "content";
    case "DEPENDS_DECLARED":
      return "depends";
    case "DEFINES":
      return "defines";
    case "BEHAVES":
      return "behaves";
    default:
      // @ts-expect-error T12 unhandled CONTAINS leaves non-never remainder
      return assertNever(shape);
  }
}
void incompleteBoundConsumer;
