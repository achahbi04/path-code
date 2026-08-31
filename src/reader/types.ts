/**
 * Bounded repository-content reader types.
 *
 * ContentObservation exists ONLY after full-byte observation.
 * DENIED / TOO_LARGE / STALE_ENTRY / UNREADABLE / NOT_REGULAR_FILE
 * are RepositoryReadOutcome variants and never carry ContentObservation.
 */

import type { RepositoryEntry } from "../inventory/types.js";

export type ContentFingerprint = {
  readonly algorithm: "sha256";
  readonly hex: string;
  readonly byteLength: number;
};

export type BinaryClassificationReason = "NUL_BYTE" | "INVALID_UTF8";

export type StaleEntryReason =
  | "CANONICAL_PATH_CHANGED"
  | "PATH_OUTSIDE_WORKSPACE"
  | "PATH_NOT_FOUND"
  | "CANONICALIZATION_FAILED"
  | "TARGET_KIND_CHANGED"
  | "OPEN_HANDLE_IDENTITY_MISMATCH";

export type UnreadableStage = "OPEN" | "STAT" | "READ" | "PATH_STAT";

export type ReaderWarningCode = "HANDLE_CLOSE_FAILED";

export type ReaderWarning = {
  readonly code: ReaderWarningCode;
  readonly message: string;
  readonly details?: {
    readonly fsCode?: string;
  };
};

type ContentObservationCommon = {
  readonly entry: RepositoryEntry;
  readonly byteLength: number;
  readonly fingerprint: ContentFingerprint;
};

export type TextContentObservationData = ContentObservationCommon & {
  readonly kind: "TEXT";
  readonly encoding: "UTF-8";
  readonly text: string;
};

export type BinaryContentObservationData = ContentObservationCommon & {
  readonly kind: "BINARY";
  readonly binaryReason: BinaryClassificationReason;
};

export type ContentObservationData =
  | TextContentObservationData
  | BinaryContentObservationData;

/**
 * Successfully observed repository content — produced only by the reader
 * after full-byte observation within the effective bound.
 */
export type ContentObservation = ContentObservationData & {
  readonly __contentObservationBrand: never;
};

export type RepositoryReadOutcome =
  | {
      readonly status: "READ";
      readonly observation: ContentObservation;
      readonly warnings?: readonly ReaderWarning[];
    }
  | {
      readonly status: "DENIED";
      readonly relativePath: string;
      readonly warnings?: readonly ReaderWarning[];
    }
  | {
      readonly status: "TOO_LARGE";
      readonly byteLengthObserved: number;
      readonly maxBytes: number;
      readonly warnings?: readonly ReaderWarning[];
    }
  | {
      readonly status: "STALE_ENTRY";
      readonly reason: StaleEntryReason;
      readonly warnings?: readonly ReaderWarning[];
    }
  | {
      readonly status: "NOT_REGULAR_FILE";
      readonly physicalKind: RepositoryEntry["physicalKind"];
      readonly warnings?: readonly ReaderWarning[];
    }
  | {
      readonly status: "UNREADABLE";
      readonly stage: UnreadableStage;
      readonly fsCode?: string;
      readonly warnings?: readonly ReaderWarning[];
    };

export type ReaderOptions = {
  readonly maxBytes?: number;
};
