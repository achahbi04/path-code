/** P7.2 — factual Build turn inputs, sourced only from P7.0 references. */

import {
  listCreatorReferences,
  readCreatorReference,
  resolveUploadedCreatorReferenceBlob,
} from "./references.mjs";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const CURSOR_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const failure = (code, message) => ({ ok: false, code, message });

function inputFromRecord(reference) {
  const base = {
    referenceId: reference.referenceId,
    kind: reference.kind,
    owner: reference.owner,
    createdAt: reference.createdAt,
  };
  return reference.kind === "uploaded"
    ? {
        ...base,
        source: { filename: reference.source.filename, mediaType: reference.source.mediaType },
        blob: { byteLength: reference.blob.byteLength, sha256: reference.blob.sha256 },
      }
    : { ...base, source: { url: reference.source.url, label: reference.source.label }, blob: null };
}

/** Capture the references present when an engineering child is selected. No blob paths or bytes persist. */
export function snapshotCreatorReferenceInput({ runtimeRoot, buildId, bindingId, projectRoot }) {
  const listed = listCreatorReferences({ runtimeRoot, buildId });
  if (!listed.ok) return listed;
  if (listed.references.some((reference) => reference.owner.bindingId !== bindingId || reference.owner.projectRoot !== projectRoot)) {
    return failure("REFERENCE_OWNERSHIP_MISMATCH", "Reference does not belong to this Build binding");
  }
  return { ok: true, references: listed.references.map(inputFromRecord) };
}

/** Re-read every ID through P7.0; caller-provided metadata or paths never become authority. */
export function validateCreatorReferenceInput({ runtimeRoot, buildId, projectRoot, references }) {
  if (!Array.isArray(references)) return failure("INVALID_REFERENCE_INPUT", "Invalid turn references");
  const seen = new Set();
  const records = [];
  for (const input of references) {
    if (!input || typeof input.referenceId !== "string" || seen.has(input.referenceId)) {
      return failure("INVALID_REFERENCE_INPUT", "Invalid or duplicate turn reference identity");
    }
    seen.add(input.referenceId);
    const read = readCreatorReference({ runtimeRoot, buildId, referenceId: input.referenceId });
    if (!read.ok) return read;
    if (read.reference.owner.projectRoot !== projectRoot ||
        JSON.stringify(input) !== JSON.stringify(inputFromRecord(read.reference))) {
      return failure("REFERENCE_OWNERSHIP_MISMATCH", "Turn reference does not match its Build record");
    }
    records.push(read.reference);
  }
  return { ok: true, records };
}

/** Prepare only the input shape the already selected adapter demonstrably supports. */
export function prepareCreatorReferencesForEngine({ runtimeRoot, buildId, projectRoot, references, engineId, engineMode }) {
  const validated = validateCreatorReferenceInput({ runtimeRoot, buildId, projectRoot, references });
  if (!validated.ok) return validated;
  const lines = [];
  const attachments = [];
  for (const record of validated.records) {
    if (record.kind === "linked") {
      lines.push(`- Link ${record.referenceId}: ${record.source.url} (creator supplied; PATH did not fetch it)`);
      continue;
    }
    if (engineId === "antigravity" ||
        (engineId === "cursor" && !CURSOR_IMAGE_TYPES.has(record.source.mediaType)) ||
        (engineId === "copilot" && engineMode !== "native_sdk")) {
      return failure("REFERENCE_INPUT_UNSUPPORTED", `${engineId} ${engineMode || "adapter"} cannot receive uploaded reference ${record.referenceId}`);
    }
    if (engineId !== "cursor" && engineId !== "copilot") {
      return failure("REFERENCE_INPUT_UNSUPPORTED", "Selected engine has no supported uploaded-reference input");
    }
    const resolved = resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId, referenceId: record.referenceId });
    if (!resolved.ok) return resolved;
    if (resolved.reference.blob.sha256 !== record.blob.sha256 ||
        resolved.reference.blob.byteLength !== record.blob.byteLength) {
      return failure("REFERENCE_BLOB_MISMATCH", "Reference bytes changed after the turn snapshot");
    }
    let bytes;
    try {
      bytes = readFileSync(resolved.path);
    } catch {
      return failure("REFERENCE_BLOB_MISSING", "Uploaded reference bytes are no longer readable");
    }
    if (bytes.length !== record.blob.byteLength || createHash("sha256").update(bytes).digest("hex") !== record.blob.sha256) {
      return failure("REFERENCE_BLOB_MISMATCH", "Reference bytes changed after the turn snapshot");
    }
    const data = bytes.toString("base64");
    attachments.push(engineId === "cursor"
      ? { referenceId: record.referenceId, type: "image", data, mimeType: record.source.mediaType }
      : { referenceId: record.referenceId, type: "blob", data, mimeType: record.source.mediaType, displayName: record.source.filename });
    lines.push(`- Uploaded ${record.referenceId}: ${record.source.filename} (${record.source.mediaType}, ${record.blob.byteLength} bytes; attached through ${engineId})`);
  }
  return {
    ok: true,
    contextText: lines.length ? `Creator references for this turn:\n${lines.join("\n")}` : "",
    attachments,
  };
}
