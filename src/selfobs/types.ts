/**
 * Engineering Self-Observation — shared evidence and observation types.
 */

export type AdmissibilityClass = "MECHANICALLY_VERIFIABLE" | "REPOSITORY_RECORDED";

export type CommitCitation = Readonly<{
  readonly kind: "commit";
  readonly sha: string;
  readonly meaning: string;
  readonly admissibility: AdmissibilityClass;
}>;

export type DocumentCitation = Readonly<{
  readonly kind: "document";
  readonly path: string;
  readonly atCommit: string;
  readonly meaning: string;
  readonly admissibility: AdmissibilityClass;
}>;

export type ModuleCitation = Readonly<{
  readonly kind: "module";
  readonly path: string;
  readonly atCommit: string;
  readonly meaning: string;
  readonly admissibility: AdmissibilityClass;
}>;

export type ObligationCitation = Readonly<{
  readonly kind: "obligation";
  readonly id: string;
  readonly inDocument: string;
  readonly atCommit: string;
  readonly exactEvidenceNeedle: string;
  readonly admissibility: AdmissibilityClass;
}>;

export type GapCitation = Readonly<{
  readonly kind: "gap";
  readonly id: string;
  readonly admissibility: AdmissibilityClass;
}>;

export type RecordedFigure = Readonly<{
  readonly kind: "recordedFigure";
  readonly label: string;
  readonly value: string;
  readonly exactEvidenceNeedle: string;
  readonly inDocument: string;
  readonly atCommit: string;
  readonly admissibility: "REPOSITORY_RECORDED";
}>;

export type SameCommitFreezeEvidence = Readonly<{
  readonly kind: "sameCommit";
  readonly implementationCommit: string;
  readonly reportPath: string;
}>;

export type TwoCommitFreezeEvidence = Readonly<{
  readonly kind: "twoCommit";
  readonly implementationCommit: string;
  readonly evidenceCommit: string;
  readonly reportPath: string;
  readonly productionScopes: readonly string[];
}>;

export type FreezeEvidence = SameCommitFreezeEvidence | TwoCommitFreezeEvidence;

export type PhaseAuditEvidence = Readonly<{
  readonly auditReportPath: string;
  readonly auditCommit: string;
  readonly auditConclusionNeedle: string;
  readonly closureDocumentPath: string;
  readonly closureCommit: string;
  readonly auditCheckpointNeedle: string;
}>;

export type DerivedCapabilityState =
  | "DECLARED"
  | "IMPLEMENTED"
  | "PASS_FROZEN"
  | "PHASE_VERIFIED";

export type UnverifiedDerivation = Readonly<{
  readonly kind: "UNVERIFIED_DERIVATION";
  readonly capabilityId: string;
  readonly candidateState: DerivedCapabilityState;
}>;

export type VerifiedCapabilityState = Readonly<{
  readonly kind: "VERIFIED_CAPABILITY_STATE";
  readonly capabilityId: string;
  readonly state: DerivedCapabilityState;
  readonly verifiedAtHead: string;
}>;

export type CapabilityObservation = UnverifiedDerivation | VerifiedCapabilityState;

export type CitationResolutionOutcome = Readonly<{
  readonly citationKey: string;
  readonly resolved: boolean;
  readonly reason?: string;
}>;
