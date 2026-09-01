/**
 * Gap Ledger v1 record types — classification and lifecycle are orthogonal.
 */

export type ReviewClassification =
  | "BLOCKING_INVARIANT"
  | "SCHEDULED_DEFERRED"
  | "NON_BLOCKING_LIMITATION"
  | "OPTIMIZATION";

export type GapLifecycle =
  | "OPEN"
  | "CLOSED"
  | "OPEN_REQUIRES_EXTERNAL_CONDITION"
  | "ACCEPTED_PERMANENT";

export type ReviewedGapRecord = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly sourceCheckpoint: string;
  readonly description: string;
  readonly proposedClass?: ReviewClassification;
  readonly reviewClassification: ReviewClassification;
  readonly lifecycle: GapLifecycle;
  readonly whyNonBlocking?: string;
  readonly missingEvidence?: string;
  readonly closureCondition?: string;
  readonly requiredCondition?: string;
  readonly permanentReason?: string;
  readonly closedByCommit?: string;
  readonly closureEvidence?: string;
  readonly notes?: string;
}>;

export type UnreviewedGapRecord = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly sourceCheckpoint: string;
  readonly description: string;
  readonly proposedClass: ReviewClassification;
  readonly reviewClassification: null;
  readonly lifecycle: "OPEN";
  readonly notes?: string;
}>;

export type GapRecord = ReviewedGapRecord | UnreviewedGapRecord;

export type GapLedger = Readonly<{
  readonly revision: string;
  readonly records: readonly GapRecord[];
}>;

export function isReviewedGap(record: GapRecord): record is ReviewedGapRecord {
  return record.reviewClassification !== null;
}

export function isUnreviewedGap(record: GapRecord): record is UnreviewedGapRecord {
  return record.reviewClassification === null;
}
