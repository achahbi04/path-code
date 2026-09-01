/**
 * Ledger verifier core — resolves citations and issues LedgerVerification.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkBootstrapIntegrity,
  detectImpossibleProgression,
  findDependencyCycles,
  findDuplicateCapabilityIds,
  findMissingDependencies,
  renderGapLedgerMarkdown,
  type CapabilityLedger,
  type CapabilityRecord,
  type CitationResolutionOutcome,
  type GapLedger,
  type GapRecord,
} from "../../src/selfobs/index.js";
import { isReviewedGap } from "../../src/selfobs/gap-types.js";
import {
  MAX_CAPABILITIES,
  MAX_EVIDENCE_DOCUMENT_BYTES,
  MAX_GAPS,
  MAX_TOTAL_CITATIONS,
} from "../../src/selfobs/capability-types.js";
import { issueLedgerVerification } from "../../src/selfobs/internal/issue-verification.js";
import type { LedgerVerification } from "../../src/selfobs/verification-types.js";

import {
  gitCommitExists,
  gitDiffNameOnly,
  gitFileExistsAtCommit,
  gitIsAncestor,
  gitReadFileAtCommit,
  gitRevParseHead,
} from "./git-readonly.js";
import { assertExactFullSha, assertSafeRepoRelativePath } from "./path-safety.js";

export type VerifierFailure = Readonly<{
  readonly code: string;
  readonly message: string;
}>;

export type VerifierResult = Readonly<{
  readonly ok: boolean;
  readonly verifiedAtHead: string;
  readonly failures: readonly VerifierFailure[];
  readonly verification?: LedgerVerification;
}>;

function fail(code: string, message: string): VerifierFailure {
  return { code, message };
}

function citationKey(parts: readonly string[]): string {
  return parts.join("|");
}

function validateGapRecordSchema(record: GapRecord): VerifierFailure[] {
  const failures: VerifierFailure[] = [];
  if (record.reviewClassification === "NON_BLOCKING_LIMITATION") {
    if (!record.whyNonBlocking) {
      failures.push(
        fail("GAP_SCHEMA", `${record.id}: NON_BLOCKING_LIMITATION missing whyNonBlocking`),
      );
    }
    if (record.lifecycle === "ACCEPTED_PERMANENT") {
      if (!record.permanentReason) {
        failures.push(
          fail(
            "GAP_SCHEMA",
            `${record.id}: ACCEPTED_PERMANENT missing permanentReason`,
          ),
        );
      }
    } else if (!record.missingEvidence || !record.closureCondition) {
      failures.push(
        fail(
          "GAP_SCHEMA",
          `${record.id}: NON_BLOCKING_LIMITATION missing missingEvidence or closureCondition`,
        ),
      );
    }
  }
  if (
    record.lifecycle === "OPEN_REQUIRES_EXTERNAL_CONDITION" &&
    !record.requiredCondition
  ) {
    failures.push(
      fail(
        "GAP_SCHEMA",
        `${record.id}: OPEN_REQUIRES_EXTERNAL_CONDITION missing requiredCondition`,
      ),
    );
  }
  if (record.lifecycle === "ACCEPTED_PERMANENT" && !record.permanentReason) {
    failures.push(
      fail("GAP_SCHEMA", `${record.id}: ACCEPTED_PERMANENT missing permanentReason`),
    );
  }
  if (record.lifecycle === "CLOSED") {
    if (!record.closedByCommit || !record.closureEvidence) {
      failures.push(
        fail("GAP_SCHEMA", `${record.id}: CLOSED missing closure fields`),
      );
    }
  }
  return failures;
}

function countCitations(ledger: CapabilityLedger): number {
  let total = 0;
  for (const record of ledger.records) {
    total += record.declarationEvidence.length;
    total += record.implementationEvidence.length;
    total += record.proofObligations.length;
    total += record.knownLimitations.length;
    total += record.recordedFigures?.length ?? 0;
    if (record.phaseAuditEvidence) {
      total += 2;
    }
    if (record.freezeEvidence) {
      total += 1;
    }
  }
  return total;
}

export async function verifyLedgers(
  repoRoot: string,
  capabilityLedger: CapabilityLedger,
  gapLedger: GapLedger,
): Promise<VerifierResult> {
  const failures: VerifierFailure[] = [];
  const outcomes: CitationResolutionOutcome[] = [];

  const verifiedAtHead = await gitRevParseHead(repoRoot);

  if (capabilityLedger.records.length > MAX_CAPABILITIES) {
    failures.push(fail("BOUNDS", "Capability count exceeds MAX_CAPABILITIES"));
  }
  if (gapLedger.records.length > MAX_GAPS) {
    failures.push(fail("BOUNDS", "Gap count exceeds MAX_GAPS"));
  }
  if (countCitations(capabilityLedger) > MAX_TOTAL_CITATIONS) {
    failures.push(fail("BOUNDS", "Citation count exceeds MAX_TOTAL_CITATIONS"));
  }

  for (const dup of findDuplicateCapabilityIds(capabilityLedger.records)) {
    failures.push(fail("DUPLICATE_CAPABILITY", dup));
  }
  for (const missing of findMissingDependencies(capabilityLedger.records)) {
    failures.push(fail("MISSING_DEPENDENCY", missing));
  }
  for (const cycle of findDependencyCycles(capabilityLedger.records)) {
    failures.push(fail("DEPENDENCY_CYCLE", cycle));
  }
  for (const violation of checkBootstrapIntegrity(capabilityLedger)) {
    failures.push(fail(violation.code, violation.message));
  }
  for (const record of capabilityLedger.records) {
    const impossible = detectImpossibleProgression(record);
    if (impossible) {
      failures.push(fail("IMPOSSIBLE_PROGRESSION", impossible));
    }
  }

  const gapIds = new Set(gapLedger.records.map((r) => r.id));
  const gapIdList = gapLedger.records.map((r) => r.id);
  const gapDuplicates = gapIdList.filter(
    (id, index) => gapIdList.indexOf(id) !== index,
  );
  for (const dup of gapDuplicates) {
    failures.push(fail("DUPLICATE_GAP", dup));
  }

  for (const record of gapLedger.records) {
    failures.push(...validateGapRecordSchema(record));
  }

  for (const record of capabilityLedger.records) {
    for (const gap of record.knownLimitations) {
      if (!gapIds.has(gap.id)) {
        failures.push(
          fail("MISSING_GAP", `${record.capabilityId} cites missing ${gap.id}`),
        );
      }
    }
  }

  for (const record of gapLedger.records) {
    if (isReviewedGap(record) && record.lifecycle === "CLOSED" && record.closedByCommit) {
      try {
        assertExactFullSha(record.closedByCommit, "closedByCommit");
      } catch (error) {
        failures.push(
          fail(
            "GAP_CLOSURE_SHA",
            `${record.id}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
        continue;
      }
      const exists = await gitCommitExists(repoRoot, record.closedByCommit);
      const key = citationKey(["gapClosed", record.id, record.closedByCommit]);
      outcomes.push({
        citationKey: key,
        resolved: exists,
        ...(exists ? {} : { reason: "commit does not exist" }),
      });
      if (!exists) {
        failures.push(
          fail(
            "GAP_CLOSURE_COMMIT_UNRESOLVED",
            `${record.id}: closedByCommit ${record.closedByCommit} does not resolve to a Git commit`,
          ),
        );
      } else {
        const ancestor = await gitIsAncestor(
          repoRoot,
          record.closedByCommit,
          verifiedAtHead,
        );
        if (!ancestor) {
          failures.push(
            fail("GAP_CLOSURE", `${record.id}: closedByCommit not ancestor of HEAD`),
          );
        }
      }
    }
  }

  for (const record of capabilityLedger.records) {
    await resolveCapabilityRecord(
      repoRoot,
      verifiedAtHead,
      record,
      outcomes,
      failures,
    );
  }

  const rendered = renderGapLedgerMarkdown(gapLedger);
  const gapLedgerPath = join(repoRoot, "docs/GAP_LEDGER.md");
  let onDisk: string;
  try {
    onDisk = readFileSync(gapLedgerPath, "utf8");
  } catch {
    failures.push(fail("GAP_LEDGER_DOC_DRIFT", "docs/GAP_LEDGER.md unreadable"));
    onDisk = "";
  }
  if (onDisk !== rendered) {
    failures.push(
      fail(
        "GAP_LEDGER_DOC_DRIFT",
        "docs/GAP_LEDGER.md does not match machine-readable Gap Ledger v1 render",
      ),
    );
  }

  const verification =
    failures.length === 0
      ? issueLedgerVerification({
          verifiedAtHead,
          capabilityLedger,
          gapLedger,
          citationOutcomes: outcomes,
        })
      : undefined;

  return {
    ok: failures.length === 0,
    verifiedAtHead,
    failures,
    ...(verification !== undefined ? { verification } : {}),
  };
}

async function resolveCapabilityRecord(
  repoRoot: string,
  verifiedAtHead: string,
  record: CapabilityRecord,
  outcomes: CitationResolutionOutcome[],
  failures: VerifierFailure[],
): Promise<void> {
  for (const citation of record.declarationEvidence) {
    try {
      assertSafeRepoRelativePath(citation.path, "DocumentCitation.path");
      assertExactFullSha(citation.atCommit, "DocumentCitation.atCommit");
    } catch (error) {
      failures.push(
        fail(
          "CITATION_PATH",
          `${record.capabilityId}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      continue;
    }
    const key = citationKey(["document", citation.path, citation.atCommit]);
    const exists = await gitFileExistsAtCommit(
      repoRoot,
      citation.path,
      citation.atCommit,
    );
    outcomes.push({
      citationKey: key,
      resolved: exists,
      ...(exists ? {} : { reason: "document missing at commit" }),
    });
    if (!exists) {
      failures.push(
        fail(
          "MISSING_DOCUMENT",
          `${record.capabilityId}: ${citation.path}@${citation.atCommit}`,
        ),
      );
    }
  }

  for (const citation of record.implementationEvidence) {
    try {
      assertSafeRepoRelativePath(citation.path, "ModuleCitation.path");
      assertExactFullSha(citation.atCommit, "ModuleCitation.atCommit");
    } catch (error) {
      failures.push(
        fail(
          "CITATION_PATH",
          `${record.capabilityId}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      continue;
    }
    const key = citationKey(["module", citation.path, citation.atCommit]);
    const exists = await gitFileExistsAtCommit(
      repoRoot,
      citation.path,
      citation.atCommit,
    );
    outcomes.push({
      citationKey: key,
      resolved: exists,
      ...(exists ? {} : { reason: "module missing at commit" }),
    });
    if (!exists) {
      failures.push(
        fail(
          "MISSING_MODULE",
          `${record.capabilityId}: ${citation.path}@${citation.atCommit}`,
        ),
      );
    }
  }

  for (const obligation of record.proofObligations) {
    try {
      assertSafeRepoRelativePath(obligation.inDocument, "ObligationCitation.inDocument");
      assertExactFullSha(obligation.atCommit, "ObligationCitation.atCommit");
    } catch (error) {
      failures.push(
        fail(
          "CITATION_PATH",
          `${record.capabilityId}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      continue;
    }
    const key = citationKey([
      "obligation",
      obligation.id,
      obligation.inDocument,
      obligation.atCommit,
    ]);
    let resolved = false;
    try {
      const content = await gitReadFileAtCommit(
        repoRoot,
        obligation.inDocument,
        obligation.atCommit,
      );
      if (content.length > MAX_EVIDENCE_DOCUMENT_BYTES) {
        failures.push(
          fail("DOCUMENT_BOUNDS", `${obligation.inDocument} exceeds evidence byte limit`),
        );
      } else {
        resolved = content.includes(obligation.exactEvidenceNeedle);
      }
    } catch {
      resolved = false;
    }
    outcomes.push({ citationKey: key, resolved });
    if (!resolved) {
      failures.push(
        fail(
          "MISSING_OBLIGATION",
          `${record.capabilityId}: ${obligation.id} needle missing`,
        ),
      );
    }
  }

  for (const figure of record.recordedFigures ?? []) {
    try {
      assertSafeRepoRelativePath(figure.inDocument, "RecordedFigure.inDocument");
      assertExactFullSha(figure.atCommit, "RecordedFigure.atCommit");
    } catch (error) {
      failures.push(
        fail(
          "CITATION_PATH",
          `${record.capabilityId}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      continue;
    }
    const key = citationKey([
      "recordedFigure",
      figure.inDocument,
      figure.atCommit,
      figure.exactEvidenceNeedle,
    ]);
    let resolved = false;
    try {
      const content = await gitReadFileAtCommit(
        repoRoot,
        figure.inDocument,
        figure.atCommit,
      );
      resolved = content.includes(figure.exactEvidenceNeedle);
    } catch {
      resolved = false;
    }
    outcomes.push({ citationKey: key, resolved });
    if (!resolved) {
      failures.push(
        fail(
          "FIGURE_MISMATCH",
          `${record.capabilityId}: recorded figure needle missing in ${figure.inDocument}`,
        ),
      );
    }
  }

  if (record.freezeEvidence) {
    await resolveFreezeEvidence(
      repoRoot,
      verifiedAtHead,
      record,
      record.freezeEvidence,
      outcomes,
      failures,
    );
  }

  if (record.phaseAuditEvidence) {
    await resolvePhaseAuditEvidence(
      repoRoot,
      verifiedAtHead,
      record,
      record.phaseAuditEvidence,
      outcomes,
      failures,
    );
  }
}

async function resolveFreezeEvidence(
  repoRoot: string,
  verifiedAtHead: string,
  record: CapabilityRecord,
  freeze: NonNullable<CapabilityRecord["freezeEvidence"]>,
  outcomes: CitationResolutionOutcome[],
  failures: VerifierFailure[],
): Promise<void> {
  if (freeze.kind === "sameCommit") {
    const key = citationKey([
      "freeze",
      freeze.kind,
      freeze.implementationCommit,
      freeze.reportPath,
    ]);
    const resolved = await verifySameCommitFreeze(
      repoRoot,
      verifiedAtHead,
      freeze.implementationCommit,
      freeze.reportPath,
      failures,
      record.capabilityId,
    );
    outcomes.push({ citationKey: key, resolved });
    return;
  }

  const key = citationKey([
    "freeze",
    freeze.kind,
    freeze.implementationCommit,
    freeze.evidenceCommit,
    freeze.reportPath,
  ]);
  const resolved = await verifyTwoCommitFreeze(
    repoRoot,
    verifiedAtHead,
    freeze.implementationCommit,
    freeze.evidenceCommit,
    freeze.reportPath,
    failures,
    record.capabilityId,
  );
  outcomes.push({ citationKey: key, resolved });
}

async function verifySameCommitFreeze(
  repoRoot: string,
  verifiedAtHead: string,
  implementationCommit: string,
  reportPath: string,
  failures: VerifierFailure[],
  capabilityId: string,
): Promise<boolean> {
  assertExactFullSha(implementationCommit, "implementationCommit");
  assertSafeRepoRelativePath(reportPath, "reportPath");
  const exists = await gitCommitExists(repoRoot, implementationCommit);
  if (!exists) {
    failures.push(
      fail("FREEZE", `${capabilityId}: implementation commit missing`),
    );
    return false;
  }
  const ancestor = await gitIsAncestor(
    repoRoot,
    implementationCommit,
    verifiedAtHead,
  );
  if (!ancestor) {
    failures.push(
      fail("FREEZE", `${capabilityId}: implementation commit not ancestor of HEAD`),
    );
    return false;
  }
  const reportExists = await gitFileExistsAtCommit(
    repoRoot,
    reportPath,
    implementationCommit,
  );
  if (!reportExists) {
    failures.push(
      fail("FREEZE", `${capabilityId}: freeze report missing at implementation commit`),
    );
    return false;
  }
  return true;
}

async function verifyTwoCommitFreeze(
  repoRoot: string,
  verifiedAtHead: string,
  implementationCommit: string,
  evidenceCommit: string,
  reportPath: string,
  failures: VerifierFailure[],
  capabilityId: string,
): Promise<boolean> {
  assertExactFullSha(implementationCommit, "implementationCommit");
  assertExactFullSha(evidenceCommit, "evidenceCommit");
  assertSafeRepoRelativePath(reportPath, "reportPath");

  const implExists = await gitCommitExists(repoRoot, implementationCommit);
  const evidenceExists = await gitCommitExists(repoRoot, evidenceCommit);
  if (!implExists || !evidenceExists) {
    failures.push(fail("FREEZE", `${capabilityId}: two-commit pair commit missing`));
    return false;
  }
  const aToB = await gitIsAncestor(repoRoot, implementationCommit, evidenceCommit);
  const bToHead = await gitIsAncestor(repoRoot, evidenceCommit, verifiedAtHead);
  if (!aToB || !bToHead) {
    failures.push(
      fail("FREEZE", `${capabilityId}: two-commit ancestry chain invalid`),
    );
    return false;
  }
  const reportExists = await gitFileExistsAtCommit(
    repoRoot,
    reportPath,
    evidenceCommit,
  );
  if (!reportExists) {
    failures.push(
      fail("FREEZE", `${capabilityId}: freeze report missing at evidence commit`),
    );
    return false;
  }
  let reportContent = "";
  try {
    reportContent = await gitReadFileAtCommit(
      repoRoot,
      reportPath,
      evidenceCommit,
    );
  } catch {
    failures.push(
      fail("FREEZE", `${capabilityId}: cannot read freeze report at evidence commit`),
    );
    return false;
  }
  if (!reportContent.includes(implementationCommit)) {
    failures.push(
      fail(
        "FREEZE",
        `${capabilityId}: evidence report does not name full implementation SHA`,
      ),
    );
    return false;
  }
  const productionChanges = await gitDiffNameOnly(
    repoRoot,
    implementationCommit,
    evidenceCommit,
  );
  if (productionChanges.length > 0) {
    failures.push(
      fail(
        "FREEZE",
        `${capabilityId}: evidence commit introduces production src changes: ${productionChanges.join(", ")}`,
      ),
    );
    return false;
  }
  return true;
}

async function resolvePhaseAuditEvidence(
  repoRoot: string,
  verifiedAtHead: string,
  record: CapabilityRecord,
  audit: NonNullable<CapabilityRecord["phaseAuditEvidence"]>,
  outcomes: CitationResolutionOutcome[],
  failures: VerifierFailure[],
): Promise<void> {
  assertSafeRepoRelativePath(audit.auditReportPath, "auditReportPath");
  assertSafeRepoRelativePath(audit.closureDocumentPath, "closureDocumentPath");
  assertExactFullSha(audit.auditCommit, "auditCommit");
  assertExactFullSha(audit.closureCommit, "closureCommit");

  const auditKey = citationKey(["phaseAudit", audit.auditReportPath, audit.auditCommit]);
  const closureKey = citationKey([
    "phaseClosure",
    audit.closureDocumentPath,
    audit.closureCommit,
  ]);

  let auditResolved = false;
  let closureResolved = false;

  const auditExists = await gitFileExistsAtCommit(
    repoRoot,
    audit.auditReportPath,
    audit.auditCommit,
  );
  if (!auditExists) {
    failures.push(
      fail("PHASE_AUDIT", `${record.capabilityId}: audit report missing`),
    );
  } else {
    try {
      const content = await gitReadFileAtCommit(
        repoRoot,
        audit.auditReportPath,
        audit.auditCommit,
      );
      auditResolved =
        content.includes(audit.auditConclusionNeedle) &&
        (await gitIsAncestor(repoRoot, audit.auditCommit, verifiedAtHead));
    } catch {
      auditResolved = false;
    }
    if (!auditResolved) {
      failures.push(
        fail("PHASE_AUDIT", `${record.capabilityId}: audit conclusion/ancestry unresolved`),
      );
    }
  }

  const closureExists = await gitFileExistsAtCommit(
    repoRoot,
    audit.closureDocumentPath,
    audit.closureCommit,
  );
  if (!closureExists) {
    failures.push(
      fail("PHASE_CLOSURE", `${record.capabilityId}: closure document missing`),
    );
  } else {
    try {
      const content = await gitReadFileAtCommit(
        repoRoot,
        audit.closureDocumentPath,
        audit.closureCommit,
      );
      closureResolved =
        content.includes(audit.auditCheckpointNeedle) &&
        (await gitIsAncestor(repoRoot, audit.closureCommit, verifiedAtHead));
    } catch {
      closureResolved = false;
    }
    if (!closureResolved) {
      failures.push(
        fail(
          "PHASE_CLOSURE",
          `${record.capabilityId}: closure checkpoint binding unresolved`,
        ),
      );
    }
  }

  outcomes.push({ citationKey: auditKey, resolved: auditResolved });
  outcomes.push({ citationKey: closureKey, resolved: closureResolved });
}
