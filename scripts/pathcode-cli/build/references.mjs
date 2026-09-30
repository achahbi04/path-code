/** P7.0 — Build-owned creator references. Input context, never product files. */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAg9RuntimeDirs } from "../ag9/layout.mjs";
import { BUILD_RECORD_SCHEMA } from "./record.mjs";

export const CREATOR_REFERENCE_SCHEMA = "pathcode.p7.creator-reference.v1";
const BUILD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const REFERENCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function failure(code, message) { return { ok: false, code, message }; }

function directory(path, create = false) {
  if (create && !existsSync(path)) mkdirSync(path, { mode: 0o700 });
  if (!existsSync(path)) return false;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe reference directory: ${path}`);
  return true;
}

function regularFile(path) {
  if (!existsSync(path)) return false;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Unsafe reference file: ${path}`);
  return true;
}

function buildContext(runtimeRoot, buildId) {
  if (typeof buildId !== "string" || !BUILD_ID.test(buildId)) return failure("INVALID_BUILD_ID", "Invalid Build identity");
  try {
    const root = realpathSync(runtimeRoot);
    const metadata = resolveAg9RuntimeDirs(root).metadata;
    const builds = join(metadata, "builds");
    if (!directory(metadata) || !directory(builds)) return failure("BUILD_NOT_FOUND", "Build record not found");
    const recordPath = join(builds, `${buildId}.build.json`);
    if (!regularFile(recordPath)) return failure("BUILD_NOT_FOUND", "Build record not found");
    const build = JSON.parse(readFileSync(recordPath, "utf8"));
    if (build?.schema !== BUILD_RECORD_SCHEMA || build?.buildId !== buildId) {
      return failure("INVALID_BUILD_RECORD", "Build identity does not match its record");
    }
    const binding = build.projectBindings?.[0];
    if (typeof binding?.bindingId !== "string" || !binding.bindingId ||
        typeof binding.projectRoot !== "string" || !binding.projectRoot) {
      return failure("BUILD_NOT_BOUND", "Build has no project binding");
    }
    return {
      ok: true,
      metadata,
      referencesRoot: join(metadata, "build-references"),
      buildId,
      bindingId: binding.bindingId,
      projectRoot: binding.projectRoot,
    };
  } catch (error) {
    return failure("REFERENCE_STORAGE_UNAVAILABLE", error instanceof Error ? error.message : String(error));
  }
}

function referenceDirectory(context, create = false) {
  if (!directory(context.referencesRoot, create)) return null;
  const path = join(context.referencesRoot, context.buildId);
  return directory(path, create) ? path : null;
}

function validFilename(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 255 &&
    value !== "." && value !== ".." && !/[\\/\x00-\x1f\x7f]/.test(value);
}

function validMediaType(value) {
  return typeof value === "string" && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(value) && value.length <= 120;
}

function linkedUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some((key) => /(?:token|secret|password|api[_-]?key|signature|authorization|auth)/i.test(key))) return null;
    return url.href;
  } catch { return null; }
}

function metadataFor(context, referenceId, kind, source, blob) {
  return {
    schema: CREATOR_REFERENCE_SCHEMA,
    referenceId,
    kind,
    owner: { buildId: context.buildId, bindingId: context.bindingId, projectRoot: context.projectRoot },
    createdAt: new Date().toISOString(),
    source,
    blob,
  };
}

function publishMetadata(directoryPath, reference) {
  const finalPath = join(directoryPath, `${reference.referenceId}.json`);
  const temporary = join(directoryPath, `${reference.referenceId}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(reference, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    linkSync(temporary, finalPath); // atomic and never replaces another reference
  } finally {
    try { unlinkSync(temporary); } catch { /* no temporary file */ }
  }
}

/** Accept bytes only; callers never supply a source filesystem path. */
export function storeUploadedCreatorReference({ runtimeRoot, buildId, bytes, filename, mediaType }) {
  const context = buildContext(runtimeRoot, buildId);
  if (!context.ok) return context;
  if (!validFilename(filename)) return failure("INVALID_REFERENCE_FILENAME", "Filename must be a plain filename");
  if (!validMediaType(mediaType)) return failure("INVALID_REFERENCE_MEDIA_TYPE", "Invalid media type");
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_UPLOAD_BYTES) {
    return failure("INVALID_REFERENCE_BYTES", "Upload must be bytes of at most 25 MiB");
  }
  let blobPath = null;
  let blobCreated = false;
  try {
    const directoryPath = referenceDirectory(context, true);
    const referenceId = randomUUID();
    blobPath = join(directoryPath, `${referenceId}.blob`);
    const payload = Buffer.from(bytes);
    const reference = metadataFor(context, referenceId, "uploaded",
      { filename, mediaType },
      { filename: `${referenceId}.blob`, byteLength: payload.byteLength, sha256: createHash("sha256").update(payload).digest("hex") });
    writeFileSync(blobPath, payload, { flag: "wx", mode: 0o600 });
    blobCreated = true;
    publishMetadata(directoryPath, reference);
    return { ok: true, reference };
  } catch (error) {
    if (blobCreated) try { unlinkSync(blobPath); } catch { /* absent or inaccessible */ }
    return failure("REFERENCE_WRITE_FAILED", error instanceof Error ? error.message : String(error));
  }
}

/** A link is recorded as a link; no remote bytes are fetched. */
export function createLinkedCreatorReference({ runtimeRoot, buildId, url, label = null }) {
  const context = buildContext(runtimeRoot, buildId);
  if (!context.ok) return context;
  const href = linkedUrl(url);
  if (!href) return failure("INVALID_REFERENCE_URL", "Link must be an HTTP(S) URL without credentials");
  if (label !== null && (typeof label !== "string" || label.length > 200 || /[\x00-\x1f\x7f]/.test(label))) {
    return failure("INVALID_REFERENCE_LABEL", "Invalid link label");
  }
  try {
    const directoryPath = referenceDirectory(context, true);
    const reference = metadataFor(context, randomUUID(), "linked", { url: href, label }, null);
    publishMetadata(directoryPath, reference);
    return { ok: true, reference };
  } catch (error) {
    return failure("REFERENCE_WRITE_FAILED", error instanceof Error ? error.message : String(error));
  }
}

function readReferenceInContext(context, referenceId) {
  if (typeof referenceId !== "string" || !REFERENCE_ID.test(referenceId)) {
    return failure("INVALID_REFERENCE_ID", "Invalid reference identity");
  }
  try {
    const directoryPath = referenceDirectory(context);
    if (!directoryPath) return failure("REFERENCE_NOT_FOUND", "Reference not found");
    const path = join(directoryPath, `${referenceId}.json`);
    if (!regularFile(path)) return failure("REFERENCE_NOT_FOUND", "Reference not found");
    const reference = JSON.parse(readFileSync(path, "utf8"));
    if (reference?.schema !== CREATOR_REFERENCE_SCHEMA || reference.referenceId !== referenceId ||
        !["uploaded", "linked"].includes(reference.kind) ||
        reference.owner?.buildId !== context.buildId ||
        reference.owner?.bindingId !== context.bindingId ||
        reference.owner?.projectRoot !== context.projectRoot ||
        typeof reference.createdAt !== "string" || !Number.isFinite(Date.parse(reference.createdAt))) {
      return failure("INVALID_REFERENCE_RECORD", "Reference metadata does not match its Build context");
    }
    if (reference.kind === "uploaded" &&
        (!validFilename(reference.source?.filename) || !validMediaType(reference.source?.mediaType) ||
         reference.blob?.filename !== `${referenceId}.blob` ||
         !Number.isSafeInteger(reference.blob?.byteLength) || reference.blob.byteLength < 0 ||
         !/^[a-f0-9]{64}$/.test(reference.blob?.sha256 || ""))) {
      return failure("INVALID_REFERENCE_RECORD", "Invalid uploaded reference metadata");
    }
    if (reference.kind === "linked" && (reference.blob !== null || linkedUrl(reference.source?.url) !== reference.source?.url ||
        (reference.source?.label !== null && (typeof reference.source?.label !== "string" ||
          reference.source.label.length > 200 || /[\x00-\x1f\x7f]/.test(reference.source.label))))) {
      return failure("INVALID_REFERENCE_RECORD", "Invalid linked reference metadata");
    }
    return { ok: true, reference };
  } catch (error) {
    return failure("REFERENCE_READ_FAILED", error instanceof Error ? error.message : String(error));
  }
}

export function readCreatorReference({ runtimeRoot, buildId, referenceId }) {
  const context = buildContext(runtimeRoot, buildId);
  return context.ok ? readReferenceInContext(context, referenceId) : context;
}

export function listCreatorReferences({ runtimeRoot, buildId }) {
  const context = buildContext(runtimeRoot, buildId);
  if (!context.ok) return context;
  try {
    const directoryPath = referenceDirectory(context);
    if (!directoryPath) return { ok: true, references: [] };
    const references = [];
    for (const name of readdirSync(directoryPath).filter((entry) => entry.endsWith(".json")).sort()) {
      const read = readReferenceInContext(context, name.slice(0, -5));
      if (!read.ok) return read;
      references.push(read.reference);
    }
    references.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.referenceId.localeCompare(b.referenceId));
    return { ok: true, references };
  } catch (error) {
    return failure("REFERENCE_READ_FAILED", error instanceof Error ? error.message : String(error));
  }
}

/** Resolve only the blob named by validated metadata, checking bytes before handoff. */
export function resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId, referenceId }) {
  const context = buildContext(runtimeRoot, buildId);
  if (!context.ok) return context;
  const read = readReferenceInContext(context, referenceId);
  if (!read.ok) return read;
  if (read.reference.kind !== "uploaded") return failure("REFERENCE_HAS_NO_BLOB", "Linked references have no local blob");
  try {
    const path = join(referenceDirectory(context), `${referenceId}.blob`);
    if (!regularFile(path)) return failure("REFERENCE_BLOB_MISSING", "Uploaded reference blob is missing");
    const bytes = readFileSync(path);
    if (bytes.byteLength !== read.reference.blob.byteLength ||
        createHash("sha256").update(bytes).digest("hex") !== read.reference.blob.sha256) {
      return failure("REFERENCE_BLOB_MISMATCH", "Uploaded reference bytes do not match metadata");
    }
    return { ok: true, path, reference: read.reference };
  } catch (error) {
    return failure("REFERENCE_READ_FAILED", error instanceof Error ? error.message : String(error));
  }
}
