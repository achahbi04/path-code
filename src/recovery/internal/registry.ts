/**
 * In-memory recovery registries — non-persistent, non-serializable.
 *
 * Authority lives in object identity held by these WeakMaps: a reconstructed
 * or model-fabricated review/authorization object is unknown here and is
 * therefore refused. Nothing in this module performs I/O.
 */

import type {
  Checkpoint,
  CheckpointEntryManifest,
  RecoveryAuthorization,
  RecoveryReview,
  RecoveryStore,
} from "../types.js";

export type ReviewEntryState = {
  readonly manifest: CheckpointEntryManifest;
  /** Verified pre-state bytes, when the pre blob passed integrity. */
  readonly preBytes: Readonly<Uint8Array> | null;
  readonly intendedPostDigestHex: string;
};

export type ReviewRegistryEntry = {
  readonly checkpoint: Checkpoint;
  readonly store: RecoveryStore;
  readonly entryStateById: ReadonlyMap<string, ReviewEntryState>;
};

export type AuthorizationRegistryEntry = {
  readonly reviewRef: RecoveryReview;
  readonly authorizedEntryIds: ReadonlySet<string>;
  consumed: boolean;
};

const checkpointStores = new WeakMap<Checkpoint, RecoveryStore>();
const reviews = new WeakMap<RecoveryReview, ReviewRegistryEntry>();
const authorizations = new WeakMap<
  RecoveryAuthorization,
  AuthorizationRegistryEntry
>();

let reviewCounter = 0;
let authorizationCounter = 0;
let recoveryCounter = 0;

export function bindCheckpointStore(
  checkpoint: Checkpoint,
  store: RecoveryStore,
): void {
  checkpointStores.set(checkpoint, store);
}

export function lookupCheckpointStore(
  checkpoint: Checkpoint,
): RecoveryStore | undefined {
  return checkpointStores.get(checkpoint);
}

export function nextReviewId(): string {
  reviewCounter += 1;
  return `recovery-review-${reviewCounter}`;
}

export function nextRecoveryAuthorizationId(): string {
  authorizationCounter += 1;
  return `recovery-auth-${authorizationCounter}`;
}

export function nextRecoveryId(): string {
  recoveryCounter += 1;
  return `recovery-${recoveryCounter}`;
}

export function registerReview(
  review: RecoveryReview,
  entry: ReviewRegistryEntry,
): void {
  reviews.set(review, entry);
}

export function lookupReview(
  review: RecoveryReview,
): ReviewRegistryEntry | undefined {
  return reviews.get(review);
}

export function registerRecoveryAuthorization(
  authorization: RecoveryAuthorization,
  entry: AuthorizationRegistryEntry,
): void {
  authorizations.set(authorization, entry);
}

export function lookupRecoveryAuthorizationEntry(
  authorization: RecoveryAuthorization,
): AuthorizationRegistryEntry | undefined {
  return authorizations.get(authorization);
}

export function markRecoveryAuthorizationConsumed(
  authorization: RecoveryAuthorization,
): void {
  const entry = authorizations.get(authorization);
  if (entry !== undefined) {
    entry.consumed = true;
  }
}

/** Test-only counter reset — not exported from the recovery barrel. */
export function resetRecoveryRegistryForTests(): void {
  reviewCounter = 0;
  authorizationCounter = 0;
  recoveryCounter = 0;
}
