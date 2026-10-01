export type CreatorReferenceInput = {
  referenceId: string;
  kind: "uploaded" | "linked";
  owner: { buildId: string; bindingId: string; projectRoot: string };
  createdAt: string;
  source: { filename: string; mediaType: string } | { url: string; label: string | null };
  blob: { byteLength: number; sha256: string } | null;
};
type Failure = { ok: false; code: string; message: string };
export function snapshotCreatorReferenceInput(input: {
  runtimeRoot: string; buildId: string; bindingId: string; projectRoot: string;
}): { ok: true; references: CreatorReferenceInput[] } | Failure;
export function validateCreatorReferenceInput(input: {
  runtimeRoot: string; buildId: string; projectRoot: string; references: CreatorReferenceInput[];
}): { ok: true; records: import("./references.mjs").CreatorReference[] } | Failure;
export function prepareCreatorReferencesForEngine(input: {
  runtimeRoot: string; buildId: string; projectRoot: string; references: CreatorReferenceInput[];
  engineId: string; engineMode?: string;
}): { ok: true; contextText: string; attachments: Array<{ referenceId: string; type: "image" | "blob"; data: string; mimeType: string; displayName?: string }> } | Failure;
