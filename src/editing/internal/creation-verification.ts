/**
 * Operation-bound post-creation verification authority (Phase 3 Amendment 1).
 *
 * Opaque token minting and operation binding only — no filesystem I/O.
 * Physical verification read lives in atomic-fs behind this token boundary.
 * Not exported from the public editing barrel.
 */

declare const publishedCreationVerificationBrand: unique symbol;

export type PublishedCreationVerificationTarget = {
  readonly [publishedCreationVerificationBrand]: true;
};

export type CreationAfterStateEvidence = {
  readonly kind: "CREATION_AFTER_STATE_EVIDENCE";
  readonly publicationId: string;
  readonly observedHex: string;
  readonly observedByteLength: number;
};

type TargetRecord = {
  readonly absolutePath: string;
  readonly publicationId: string;
  readonly operationIdentity: object;
};

const targetRecords = new WeakMap<
  PublishedCreationVerificationTarget,
  TargetRecord
>();

/**
 * Minted only after successful no-overwrite publication for THIS operation.
 * Not a public authority constructor.
 */
export function mintPublishedCreationVerificationTarget(input: {
  readonly absolutePath: string;
  readonly operationIdentity: object;
}): PublishedCreationVerificationTarget {
  const publicationId = `pub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const token = Object.freeze({
    [Symbol.for("path-code.publishedCreationVerification")]: true,
  }) as unknown as PublishedCreationVerificationTarget;
  targetRecords.set(token, {
    absolutePath: input.absolutePath,
    publicationId,
    operationIdentity: input.operationIdentity,
  });
  return token;
}

export function publishedCreationTargetBoundToOperation(
  target: PublishedCreationVerificationTarget,
  operationIdentity: object,
): boolean {
  const record = targetRecords.get(target);
  return record !== undefined && record.operationIdentity === operationIdentity;
}

/**
 * Resolve the absolute path encoded by a publication-earned token after
 * operation-identity binding check. Callers must not treat the returned path
 * as caller-selectable read authority.
 */
export function resolvePublishedCreationTarget(
  target: PublishedCreationVerificationTarget,
  operationIdentity: object,
): { readonly absolutePath: string; readonly publicationId: string } {
  const record = targetRecords.get(target);
  if (record === undefined) {
    throw new Error("PublishedCreationVerificationTarget is not registered");
  }
  if (record.operationIdentity !== operationIdentity) {
    throw new Error(
      "PublishedCreationVerificationTarget is not bound to this creation operation",
    );
  }
  return {
    absolutePath: record.absolutePath,
    publicationId: record.publicationId,
  };
}
