export const CREATOR_REFERENCE_SCHEMA: "pathcode.p7.creator-reference.v1";

export type CreatorReference = {
  schema: typeof CREATOR_REFERENCE_SCHEMA;
  referenceId: string;
  kind: "uploaded" | "linked";
  owner: { buildId: string; bindingId: string; projectRoot: string };
  createdAt: string;
  source: { filename: string; mediaType: string } | { url: string; label: string | null };
  blob: { filename: string; byteLength: number; sha256: string } | null;
};

type Failure = { ok: false; code: string; message: string };
type Read = { ok: true; reference: CreatorReference } | Failure;

export function storeUploadedCreatorReference(input: {
  runtimeRoot: string;
  buildId: string;
  bytes: Uint8Array;
  filename: string;
  mediaType: string;
}): Read;
export function createLinkedCreatorReference(input: {
  runtimeRoot: string;
  buildId: string;
  url: string;
  label?: string | null;
}): Read;
export function readCreatorReference(input: {
  runtimeRoot: string;
  buildId: string;
  referenceId: string;
}): Read;
export function listCreatorReferences(input: {
  runtimeRoot: string;
  buildId: string;
}): { ok: true; references: CreatorReference[] } | Failure;
export function resolveUploadedCreatorReferenceBlob(input: {
  runtimeRoot: string;
  buildId: string;
  referenceId: string;
}): { ok: true; path: string; reference: CreatorReference } | Failure;
