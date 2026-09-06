/**
 * Reference binding gate — resolve citations, check currentness, mint REFERENCES_ONLY.
 * Successful binding is not semantic certification or action authority.
 */

import { loadProjectConfig } from "../config/loader.js";
import type { ProjectRestrictions } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { RepositoryEntry } from "../inventory/types.js";
import type { ManifestEvidence } from "../metadata/types.js";
import type { ContentObservation } from "../reader/types.js";
import {
  MAX_CONTENT_VERIFICATIONS_PER_OPERATION,
  verifyRepositorySnapshot,
} from "../snapshot/index.js";
import type { ReferenceCatalog } from "./catalog.js";
import { requireLiveCatalog } from "./catalog.js";
import {
  MAX_CUMULATIVE_CONTENT_VERIFICATION_BYTES,
  MAX_UNIQUE_CONTENT_INPUTS_PER_CALL,
} from "./bounds.js";
import {
  catalogFailure,
  claimRefusal,
  type ReasoningBindFailure,
} from "./failures.js";
import {
  type CatalogRecord,
  type ReferenceCatalogInternal,
  registerBoundReasoning,
} from "./internal/registry.js";
import { parseReasoningProposalJson } from "./parse.js";
import type {
  ExecutionVerificationRequirement,
  NonEmptyReadonlyArray,
  ProposedClaim,
  ProposedEvidenceReference,
  ReferenceBoundClaim,
  ReferenceBoundClaimShape,
  ReferenceBoundContext,
  ReferenceBoundReasoning,
  ReasoningProposal,
} from "./types.js";

export type ReasoningBindSuccess = {
  readonly reasoning: ReferenceBoundReasoning;
};

type ResolvedSource =
  | { readonly kind: "ENTRY"; readonly record: CatalogRecord & { evidenceKind: "ENTRY" } }
  | {
      readonly kind: "CONTENT";
      readonly record: CatalogRecord & { evidenceKind: "CONTENT" };
    }
  | {
      readonly kind: "MANIFEST";
      readonly record: CatalogRecord & { evidenceKind: "MANIFEST" };
    };

type ClaimSourceBag = {
  readonly entries: RepositoryEntry[];
  readonly observations: ContentObservation[];
  readonly manifests: ManifestEvidence[];
};

function restrictionsEqual(
  left: ProjectRestrictions,
  right: ProjectRestrictions,
): boolean {
  if (left.deniedPaths.length !== right.deniedPaths.length) {
    return false;
  }
  for (let i = 0; i < left.deniedPaths.length; i += 1) {
    if (left.deniedPaths[i] !== right.deniedPaths[i]) {
      return false;
    }
  }
  if (left.disabledActions.length !== right.disabledActions.length) {
    return false;
  }
  for (let i = 0; i < left.disabledActions.length; i += 1) {
    if (left.disabledActions[i] !== right.disabledActions[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Strict repository-relative path hint syntax.
 * Exact lexical comparison key — no normalization-based admission.
 */
export function isStrictRepositoryRelativePathHint(pathHint: string): boolean {
  if (pathHint.length === 0) {
    return false;
  }
  if (pathHint.includes("\0")) {
    return false;
  }
  if (pathHint.includes("\\")) {
    return false;
  }
  if (pathHint.startsWith("/")) {
    return false;
  }
  // Drive / UNC-style absolute hints
  if (/^[A-Za-z]:/.test(pathHint) || pathHint.startsWith("//")) {
    return false;
  }
  if (pathHint.endsWith("/")) {
    return false;
  }
  const segments = pathHint.split("/");
  for (const segment of segments) {
    if (segment.length === 0 || segment === "." || segment === "..") {
      return false;
    }
  }
  return true;
}

function correlationFor(ref: ProposedEvidenceReference): string {
  if (ref.kind === "EVIDENCE_ID") {
    return `id:${ref.id}`;
  }
  return `path:${ref.relativePath}`;
}

/**
 * Resolve one evidence reference against the live catalog for an expected kind.
 * Exported for focused private-path bypass diagnostics only — not a public binder shortcut.
 */
export function resolveCatalogReference(
  catalog: ReferenceCatalogInternal,
  ref: ProposedEvidenceReference,
  expectedKind: "ENTRY" | "CONTENT" | "MANIFEST",
  claimId: string,
): Result<ResolvedSource, ReasoningBindFailure> {
  if (ref.kind === "EVIDENCE_ID") {
    const record = catalog.byHandle.get(ref.id);
    if (record === undefined) {
      return failure(
        claimRefusal(
          "UNBOUND_CLAIM",
          claimId,
          "Evidence handle is not issued by this catalog",
          correlationFor(ref),
        ),
      );
    }
    if (record.evidenceKind !== expectedKind) {
      return failure(
        claimRefusal(
          "EVIDENCE_IDENTITY_MISMATCH",
          claimId,
          "Evidence handle category does not match claim requirement",
          correlationFor(ref),
        ),
      );
    }
    if (record.evidenceKind === "ENTRY") {
      return success({ kind: "ENTRY", record });
    }
    if (record.evidenceKind === "CONTENT") {
      return success({ kind: "CONTENT", record });
    }
    return success({ kind: "MANIFEST", record });
  }

  if (!isStrictRepositoryRelativePathHint(ref.relativePath)) {
    return failure(
      claimRefusal(
        "CLAIM_OUTSIDE_ADMITTED_SET",
        claimId,
        "Path hint is not a strict repository-relative path",
        correlationFor(ref),
      ),
    );
  }

  const pathMap =
    expectedKind === "ENTRY"
      ? catalog.entryByPath
      : expectedKind === "CONTENT"
        ? catalog.contentByPath
        : catalog.manifestByPath;
  const matches = pathMap.get(ref.relativePath) ?? [];
  if (matches.length === 0) {
    return failure(
      claimRefusal(
        "UNBOUND_CLAIM",
        claimId,
        "Path hint does not match a selected catalog record",
        correlationFor(ref),
      ),
    );
  }
  if (matches.length > 1) {
    return failure(
      claimRefusal(
        "EVIDENCE_IDENTITY_MISMATCH",
        claimId,
        "Path hint matches multiple eligible catalog records",
        correlationFor(ref),
      ),
    );
  }
  const record = matches[0]!;
  if (record.evidenceKind === "ENTRY") {
    return success({ kind: "ENTRY", record });
  }
  if (record.evidenceKind === "CONTENT") {
    return success({ kind: "CONTENT", record });
  }
  return success({ kind: "MANIFEST", record });
}

function underlyingEntry(source: ResolvedSource): RepositoryEntry {
  return source.record.entry;
}

function underlyingObservation(
  source: ResolvedSource,
): ContentObservation | undefined {
  if (source.kind === "CONTENT") {
    return source.record.observation;
  }
  if (source.kind === "MANIFEST") {
    return source.record.observation;
  }
  return undefined;
}

function sameSupportingSource(
  subject: ResolvedSource,
  citation: ResolvedSource,
): boolean {
  if (subject.kind === "ENTRY" && citation.kind === "ENTRY") {
    return subject.record.entry === citation.record.entry;
  }
  const left = underlyingObservation(subject);
  const right = underlyingObservation(citation);
  if (left !== undefined && right !== undefined) {
    return left === right;
  }
  return underlyingEntry(subject) === underlyingEntry(citation);
}

async function verifyEntriesCurrent(
  catalog: ReferenceCatalogInternal,
  entries: readonly RepositoryEntry[],
  claimId: string,
  currentConfig: import("../config/types.js").ResolvedProjectConfig,
): Promise<ReasoningBindFailure | undefined> {
  if (entries.length === 0) {
    return undefined;
  }
  const unique = [...new Set(entries)];
  const assessment = await verifyRepositorySnapshot(
    catalog.snapshot,
    catalog.workspace,
    currentConfig,
    {
      entries: unique,
      content: "NONE",
    },
  );
  if (!assessment.ok) {
    return claimRefusal(
      "STALE_EVIDENCE",
      claimId,
      "Entry verification could not complete",
    );
  }
  for (const entry of unique) {
    const result = assessment.value.entryResults.find(
      (item) => item.entry === entry,
    );
    if (result === undefined) {
      return claimRefusal(
        "STALE_EVIDENCE",
        claimId,
        "Cited entry missing from verification assessment",
      );
    }
    if (result.state === "DENIED") {
      return claimRefusal(
        "CLAIM_OUTSIDE_ADMITTED_SET",
        claimId,
        "Cited entry is denied by current restrictions",
      );
    }
    if (result.state !== "CURRENT_IDENTITY") {
      return claimRefusal(
        "STALE_EVIDENCE",
        claimId,
        "Cited entry is not positively current",
      );
    }
  }
  return undefined;
}

/**
 * Full-content currentness through the existing snapshot verifier.
 * Positive VERIFIED_CURRENT only — never metadata equality alone.
 */
export async function verifyContentObservationsCurrent(
  catalog: ReferenceCatalogInternal,
  observations: readonly ContentObservation[],
  claimId: string,
  currentConfig: import("../config/types.js").ResolvedProjectConfig,
): Promise<ReasoningBindFailure | undefined> {
  if (observations.length === 0) {
    return undefined;
  }
  const uniqueEntries: RepositoryEntry[] = [];
  const seen = new Set<RepositoryEntry>();
  for (const observation of observations) {
    if (!seen.has(observation.entry)) {
      seen.add(observation.entry);
      uniqueEntries.push(observation.entry);
    }
  }

  const maxContent = Math.min(
    MAX_UNIQUE_CONTENT_INPUTS_PER_CALL,
    MAX_CONTENT_VERIFICATIONS_PER_OPERATION,
    uniqueEntries.length,
  );

  const assessment = await verifyRepositorySnapshot(
    catalog.snapshot,
    catalog.workspace,
    currentConfig,
    {
      entries: uniqueEntries,
      content: uniqueEntries,
      options: {
        maxContentVerifications: maxContent,
        maxEntryVerifications: uniqueEntries.length,
      },
    },
  );
  if (!assessment.ok) {
    return claimRefusal(
      "STALE_EVIDENCE",
      claimId,
      "Content verification could not complete",
    );
  }

  if (assessment.value.assessmentCompletion.kind === "PARTIAL") {
    return claimRefusal(
      "STALE_EVIDENCE",
      claimId,
      "Verification budget exhausted before positive currentness",
    );
  }

  for (const entry of uniqueEntries) {
    const entryResult = assessment.value.entryResults.find(
      (item) => item.entry === entry,
    );
    const contentResult = assessment.value.contentResults.find(
      (item) => item.entry === entry,
    );
    if (entryResult === undefined || contentResult === undefined) {
      return claimRefusal(
        "STALE_EVIDENCE",
        claimId,
        "Cited source missing from verification assessment",
      );
    }
    if (entryResult.state === "DENIED" || contentResult.state === "DENIED") {
      return claimRefusal(
        "CLAIM_OUTSIDE_ADMITTED_SET",
        claimId,
        "Cited source is denied by current restrictions",
      );
    }
    if (entryResult.state !== "CURRENT_IDENTITY") {
      return claimRefusal(
        "STALE_EVIDENCE",
        claimId,
        "Cited entry identity is not positively current",
      );
    }
    if (contentResult.state !== "VERIFIED_CURRENT") {
      return claimRefusal(
        "STALE_EVIDENCE",
        claimId,
        "Cited content is not positively verified current",
      );
    }
  }
  return undefined;
}

function mintBoundClaim(shape: ReferenceBoundClaimShape): ReferenceBoundClaim {
  return shape as ReferenceBoundClaim;
}

function asNonEmpty<T>(items: readonly T[]): NonEmptyReadonlyArray<T> | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return items as NonEmptyReadonlyArray<T>;
}

function definesObligation(symbolName: string): ExecutionVerificationRequirement {
  return {
    method: "EXECUTION",
    checkKinds: ["TYPECHECK"],
    checkPurpose: `Confirm definition of ${symbolName}`,
  };
}

function behavesObligation(
  scenarioDescription: string,
): ExecutionVerificationRequirement {
  return {
    method: "EXECUTION",
    checkKinds: ["TARGETED_TEST"],
    checkPurpose: `Confirm behavior: ${scenarioDescription}`,
  };
}

async function bindOneClaim(
  claim: ProposedClaim,
  catalog: ReferenceCatalogInternal,
  context: ReferenceBoundContext,
  currentConfig: import("../config/types.js").ResolvedProjectConfig,
  contentBudget: {
    uniqueEntries: Set<RepositoryEntry>;
    cumulativeBytes: number;
  },
): Promise<Result<{ claim: ReferenceBoundClaim; sources: ClaimSourceBag }, ReasoningBindFailure>> {
  const sources: ClaimSourceBag = {
    entries: [],
    observations: [],
    manifests: [],
  };

  const noteBudget = (
    observation: ContentObservation,
  ): ReasoningBindFailure | undefined => {
    if (!contentBudget.uniqueEntries.has(observation.entry)) {
      if (contentBudget.uniqueEntries.size >= MAX_UNIQUE_CONTENT_INPUTS_PER_CALL) {
        return claimRefusal(
          "STALE_EVIDENCE",
          claim.claimId,
          "Unique content verification input ceiling exceeded",
        );
      }
      contentBudget.uniqueEntries.add(observation.entry);
      contentBudget.cumulativeBytes += observation.byteLength;
      if (
        contentBudget.cumulativeBytes > MAX_CUMULATIVE_CONTENT_VERIFICATION_BYTES
      ) {
        return claimRefusal(
          "STALE_EVIDENCE",
          claim.claimId,
          "Cumulative content verification budget exceeded",
        );
      }
    }
    return undefined;
  };

  if (claim.kind === "EXISTS") {
    const subject = resolveCatalogReference(
      catalog,
      claim.proposedSubject,
      "ENTRY",
      claim.claimId,
    );
    if (!subject.ok) {
      return subject;
    }
    for (const citation of claim.proposedCitations) {
      const resolved = resolveCatalogReference(
        catalog,
        citation,
        "ENTRY",
        claim.claimId,
      );
      if (!resolved.ok) {
        return resolved;
      }
      if (!sameSupportingSource(subject.value, resolved.value)) {
        return failure(
          claimRefusal(
            "EVIDENCE_IDENTITY_MISMATCH",
            claim.claimId,
            "Citation does not support the EXISTS subject",
            correlationFor(citation),
          ),
        );
      }
    }
    sources.entries.push(subject.value.record.entry);
    const stale = await verifyEntriesCurrent(
      catalog,
      sources.entries,
      claim.claimId,
      currentConfig,
    );
    if (stale !== undefined) {
      return failure(stale);
    }
    const bound = mintBoundClaim({
      claimId: claim.claimId,
      statement: claim.statement,
      bindingStage: "REFERENCES_ONLY",
      context,
      kind: "EXISTS",
      subject: subject.value.record.entry,
      requiredVerification: { method: "OBSERVATION" },
    });
    return success({ claim: bound, sources });
  }

  if (claim.kind === "CONTENT" || claim.kind === "CONTAINS") {
    const subject = resolveCatalogReference(
      catalog,
      claim.proposedSubject,
      "CONTENT",
      claim.claimId,
    );
    if (!subject.ok) {
      return subject;
    }
    if (subject.value.kind !== "CONTENT") {
      return failure(
        claimRefusal(
          "EVIDENCE_IDENTITY_MISMATCH",
          claim.claimId,
          "Content subject resolved to unexpected category",
        ),
      );
    }
    for (const citation of claim.proposedCitations) {
      const resolved = resolveCatalogReference(
        catalog,
        citation,
        "CONTENT",
        claim.claimId,
      );
      if (!resolved.ok) {
        return resolved;
      }
      if (!sameSupportingSource(subject.value, resolved.value)) {
        return failure(
          claimRefusal(
            "EVIDENCE_IDENTITY_MISMATCH",
            claim.claimId,
            "Citation does not support the content subject",
            correlationFor(citation),
          ),
        );
      }
    }
    const observation = subject.value.record.observation;
    const budgetError = noteBudget(observation);
    if (budgetError !== undefined) {
      return failure(budgetError);
    }
    sources.observations.push(observation);
    const stale = await verifyContentObservationsCurrent(
      catalog,
      sources.observations,
      claim.claimId,
      currentConfig,
    );
    if (stale !== undefined) {
      return failure(stale);
    }
    if (claim.kind === "CONTENT") {
      const bound = mintBoundClaim({
        claimId: claim.claimId,
        statement: claim.statement,
        bindingStage: "REFERENCES_ONLY",
        context,
        kind: "CONTENT",
        subject: observation,
        requiredVerification: { method: "OBSERVATION" },
      });
      return success({ claim: bound, sources });
    }
    const bound = mintBoundClaim({
      claimId: claim.claimId,
      statement: claim.statement,
      bindingStage: "REFERENCES_ONLY",
      context,
      kind: "CONTAINS",
      subject: observation,
      needle: claim.needle,
      requiredVerification: { method: "DEFERRED_CONTENT_CHECK" },
    });
    return success({ claim: bound, sources });
  }

  if (claim.kind === "DEPENDS_DECLARED") {
    const subject = resolveCatalogReference(
      catalog,
      claim.proposedSubject,
      "MANIFEST",
      claim.claimId,
    );
    if (!subject.ok) {
      return subject;
    }
    if (subject.value.kind !== "MANIFEST") {
      return failure(
        claimRefusal(
          "EVIDENCE_IDENTITY_MISMATCH",
          claim.claimId,
          "Manifest subject resolved to unexpected category",
        ),
      );
    }
    for (const citation of claim.proposedCitations) {
      const resolved = resolveCatalogReference(
        catalog,
        citation,
        "MANIFEST",
        claim.claimId,
      );
      if (!resolved.ok) {
        return resolved;
      }
      if (!sameSupportingSource(subject.value, resolved.value)) {
        return failure(
          claimRefusal(
            "EVIDENCE_IDENTITY_MISMATCH",
            claim.claimId,
            "Citation does not support the dependency subject",
            correlationFor(citation),
          ),
        );
      }
    }
    const evidence = subject.value.record.evidence;
    const fact = evidence.fact;
    if (
      fact.kind !== "DECLARED_PACKAGE_DEPENDENCY" ||
      fact.packageName !== claim.dependencyName
    ) {
      return failure(
        claimRefusal(
          "GROUNDING_OVERCLAIM",
          claim.claimId,
          "Declared dependency fact does not support the requested dependencyName",
        ),
      );
    }
    const budgetError = noteBudget(evidence.observation);
    if (budgetError !== undefined) {
      return failure(budgetError);
    }
    sources.manifests.push(evidence);
    sources.observations.push(evidence.observation);
    const stale = await verifyContentObservationsCurrent(
      catalog,
      [evidence.observation],
      claim.claimId,
      currentConfig,
    );
    if (stale !== undefined) {
      return failure(stale);
    }
    const bound = mintBoundClaim({
      claimId: claim.claimId,
      statement: claim.statement,
      bindingStage: "REFERENCES_ONLY",
      context,
      kind: "DEPENDS_DECLARED",
      subject: evidence,
      dependencyName: claim.dependencyName,
      requiredVerification: { method: "OBSERVATION" },
    });
    return success({ claim: bound, sources });
  }

  // DEFINES / BEHAVES — nonempty content source set
  const refs: ProposedEvidenceReference[] = [
    claim.proposedSubject,
    ...claim.proposedCitations,
  ];
  if (refs.length < 1) {
    return failure(
      claimRefusal(
        "UNBOUND_CLAIM",
        claim.claimId,
        "DEFINES/BEHAVES require nonempty content sources",
      ),
    );
  }
  const observations: ContentObservation[] = [];
  const seen = new Set<ContentObservation>();
  for (const ref of refs) {
    const resolved = resolveCatalogReference(
      catalog,
      ref,
      "CONTENT",
      claim.claimId,
    );
    if (!resolved.ok) {
      return resolved;
    }
    if (resolved.value.kind !== "CONTENT") {
      return failure(
        claimRefusal(
          "EVIDENCE_IDENTITY_MISMATCH",
          claim.claimId,
          "DEFINES/BEHAVES source resolved to unexpected category",
        ),
      );
    }
    const observation = resolved.value.record.observation;
    if (!seen.has(observation)) {
      seen.add(observation);
      observations.push(observation);
      const budgetError = noteBudget(observation);
      if (budgetError !== undefined) {
        return failure(budgetError);
      }
    }
  }
  const nonempty = asNonEmpty(observations);
  if (nonempty === undefined) {
    return failure(
      claimRefusal(
        "UNBOUND_CLAIM",
        claim.claimId,
        "DEFINES/BEHAVES require nonempty content sources",
      ),
    );
  }
  sources.observations.push(...observations);
  const stale = await verifyContentObservationsCurrent(
    catalog,
    observations,
    claim.claimId,
    currentConfig,
  );
  if (stale !== undefined) {
    return failure(stale);
  }

  if (claim.kind === "DEFINES") {
    const bound = mintBoundClaim({
      claimId: claim.claimId,
      statement: claim.statement,
      bindingStage: "REFERENCES_ONLY",
      context,
      kind: "DEFINES",
      subjects: nonempty,
      symbolName: claim.symbolName,
      requiredVerification: definesObligation(claim.symbolName),
    });
    return success({ claim: bound, sources });
  }

  const bound = mintBoundClaim({
    claimId: claim.claimId,
    statement: claim.statement,
    bindingStage: "REFERENCES_ONLY",
    context,
    kind: "BEHAVES",
    subjects: nonempty,
    scenarioDescription: claim.scenarioDescription,
    requiredVerification: behavesObligation(claim.scenarioDescription),
  });
  return success({ claim: bound, sources });
}

/**
 * Single externally reachable bind entry — parses JSON and enforces the gate.
 */
export async function bindReasoningProposalJson(
  jsonText: string,
  liveCatalog: ReferenceCatalog,
): Promise<Result<ReasoningBindSuccess, ReasoningBindFailure>> {
  const catalogResult = requireLiveCatalog(liveCatalog);
  if (!catalogResult.ok) {
    return catalogResult;
  }
  const catalog = catalogResult.value;

  const parsed = parseReasoningProposalJson(jsonText);
  if (!parsed.ok) {
    return parsed;
  }
  // Own/copy proposal-derived arrays before awaits
  const proposal: ReasoningProposal = {
    schemaVersion: parsed.value.schemaVersion,
    proposalId: parsed.value.proposalId,
    requestedOutcome: parsed.value.requestedOutcome,
    claims: Object.freeze([...parsed.value.claims]),
    hypotheses: Object.freeze([...parsed.value.hypotheses]),
  };

  const configResult = await loadProjectConfig(catalog.workspace);
  if (!configResult.ok) {
    return failure(
      catalogFailure("CONFIG_FAILURE", "Project configuration could not be loaded"),
    );
  }
  const currentConfig = configResult.value;
  if (
    !restrictionsEqual(
      currentConfig.restrictions,
      catalog.snapshot.config.restrictions,
    )
  ) {
    return failure(
      catalogFailure(
        "RESTRICTIONS_CHANGED",
        "Effective restrictions changed relative to the catalog snapshot",
      ),
    );
  }

  const context: ReferenceBoundContext = Object.freeze({
    workspace: catalog.workspace,
    snapshot: catalog.snapshot,
  });

  const boundClaims: ReferenceBoundClaim[] = [];
  const retained = new Map<
    string,
    {
      readonly entries: readonly RepositoryEntry[];
      readonly observations: readonly ContentObservation[];
      readonly manifests: readonly ManifestEvidence[];
    }
  >();
  const contentBudget = {
    uniqueEntries: new Set<RepositoryEntry>(),
    cumulativeBytes: 0,
  };

  for (const claim of proposal.claims) {
    const bound = await bindOneClaim(
      claim,
      catalog,
      context,
      currentConfig,
      contentBudget,
    );
    if (!bound.ok) {
      return bound;
    }
    boundClaims.push(bound.value.claim);
    retained.set(claim.claimId, {
      entries: Object.freeze([...bound.value.sources.entries]),
      observations: Object.freeze([...bound.value.sources.observations]),
      manifests: Object.freeze([...bound.value.sources.manifests]),
    });
  }

  // Recheck effective restrictions before success
  const reloaded = await loadProjectConfig(catalog.workspace);
  if (!reloaded.ok) {
    return failure(
      catalogFailure("CONFIG_FAILURE", "Project configuration could not be reloaded"),
    );
  }
  if (
    !restrictionsEqual(
      reloaded.value.restrictions,
      catalog.snapshot.config.restrictions,
    )
  ) {
    return failure(
      catalogFailure(
        "RESTRICTIONS_CHANGED",
        "Effective restrictions changed during binding",
      ),
    );
  }
  if (catalog.disposed) {
    return failure(
      catalogFailure("DISPOSED_CATALOG", "Catalog was disposed during binding"),
    );
  }

  const reasoning: ReferenceBoundReasoning = Object.freeze({
    context,
    claims: Object.freeze(boundClaims),
    hypotheses: proposal.hypotheses,
  });

  registerBoundReasoning(reasoning, {
    reasoning,
    catalog,
    retainedClaimSources: retained,
  });

  return success({ reasoning });
}
