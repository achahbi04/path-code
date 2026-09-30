/** P7.0 Build-owned reference bytes and metadata, with no Builder UI or engine. */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createBuildRecordSkeleton, readBuildRecord, resolveBuildRecordPath, writeBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { createLinkedCreatorReference, listCreatorReferences, readCreatorReference, resolveUploadedCreatorReferenceBlob, storeUploadedCreatorReference } from "../../scripts/pathcode-cli/build/references.mjs";
import { resolveProjectModelPreferencesPath, writeProjectModelPreference } from "../../scripts/pathcode-cli/model-plane/preference-config.mjs";

const temporary: string[] = [];
function temp(label: string) { const path = mkdtempSync(join(tmpdir(), `path-p70-${label}-`)); temporary.push(path); return path; }
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

function build(runtimeRoot: string, projectRoot: string, buildId: string) {
  const record = createBuildRecordSkeleton({ outcome: "Build a small product", buildId });
  record.projectBindings.push({ bindingId: `bind-${buildId}`, projectRoot });
  writeBuildRecord(runtimeRoot, record);
  return record;
}

describe("P7.0 creator references", () => {
  it("stores uploaded bytes durably under the owning Build, with stable metadata and digest", () => {
    const runtimeRoot = temp("runtime");
    const projectRoot = temp("product");
    const buildId = "build-one";
    build(runtimeRoot, projectRoot, buildId);
    const productPath = join(projectRoot, "product.txt");
    writeFileSync(productPath, "product source stays unchanged\n");
    const recordBefore = readFileSync(resolveBuildRecordPath(runtimeRoot, buildId), "utf8");
    const bytes = Buffer.from("reference image bytes\0", "utf8");
    const stored = storeUploadedCreatorReference({ runtimeRoot, buildId, bytes, filename: "sample.png", mediaType: "image/png" });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    const id = stored.reference.referenceId;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored.reference).toMatchObject({
      schema: "pathcode.p7.creator-reference.v1",
      referenceId: id,
      kind: "uploaded",
      owner: { buildId, bindingId: "bind-build-one", projectRoot },
      source: { filename: "sample.png", mediaType: "image/png" },
      blob: { byteLength: bytes.length },
    });
    expect(stored.reference.blob?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Number.isFinite(Date.parse(stored.reference.createdAt))).toBe(true);
    const resolved = resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId, referenceId: id });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(readFileSync(resolved.path)).toEqual(bytes);
    expect(relative(projectRoot, resolved.path).startsWith("..")).toBe(true);
    expect(readCreatorReference({ runtimeRoot, buildId, referenceId: id })).toEqual(stored);
    expect(readFileSync(productPath, "utf8")).toBe("product source stays unchanged\n");
    expect(readFileSync(resolveBuildRecordPath(runtimeRoot, buildId), "utf8")).toBe(recordBefore);
    expect(readBuildRecord(runtimeRoot, buildId)?.children).toEqual([]);
    expect(readBuildRecord(runtimeRoot, buildId)?.adoptionHistory).toBeUndefined();
  });

  it("records an external link without fetching or creating a local blob", () => {
    const runtimeRoot = temp("runtime");
    const projectRoot = temp("product");
    build(runtimeRoot, projectRoot, "build-link");
    const linked = createLinkedCreatorReference({ runtimeRoot, buildId: "build-link", url: "https://example.com/design?node=1", label: "Design" });
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    expect(linked.reference).toMatchObject({ kind: "linked", source: { url: "https://example.com/design?node=1", label: "Design" }, blob: null });
    expect(resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId: "build-link", referenceId: linked.reference.referenceId })).toMatchObject({ ok: false, code: "REFERENCE_HAS_NO_BLOB" });
    expect(createLinkedCreatorReference({ runtimeRoot, buildId: "build-link", url: "file:///etc/passwd" })).toMatchObject({ ok: false, code: "INVALID_REFERENCE_URL" });
    expect(createLinkedCreatorReference({ runtimeRoot, buildId: "build-link", url: "https://example.com/?api_key=secret" })).toMatchObject({ ok: false, code: "INVALID_REFERENCE_URL" });
    expect(createLinkedCreatorReference({ runtimeRoot, buildId: "build-link", url: "https://user:pass@example.com/" })).toMatchObject({ ok: false, code: "INVALID_REFERENCE_URL" });
  });

  it("confines identities and duplicate filenames to their owning Build", () => {
    const runtimeRoot = temp("runtime");
    const projectA = temp("product-a");
    const projectB = temp("product-b");
    build(runtimeRoot, projectA, "build-a");
    build(runtimeRoot, projectB, "build-b");
    const first = storeUploadedCreatorReference({ runtimeRoot, buildId: "build-a", bytes: Buffer.from("A"), filename: "same.png", mediaType: "image/png" });
    const second = storeUploadedCreatorReference({ runtimeRoot, buildId: "build-a", bytes: Buffer.from("B"), filename: "same.png", mediaType: "image/png" });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.reference.referenceId).not.toBe(second.reference.referenceId);
    const one = resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId: "build-a", referenceId: first.reference.referenceId });
    const two = resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId: "build-a", referenceId: second.reference.referenceId });
    expect(one.ok && two.ok).toBe(true);
    if (one.ok && two.ok) {
      expect(readFileSync(one.path, "utf8")).toBe("A");
      expect(readFileSync(two.path, "utf8")).toBe("B");
    }
    expect(readCreatorReference({ runtimeRoot, buildId: "build-b", referenceId: first.reference.referenceId })).toMatchObject({ ok: false, code: "REFERENCE_NOT_FOUND" });
    expect(resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId: "build-b", referenceId: first.reference.referenceId })).toMatchObject({ ok: false, code: "REFERENCE_NOT_FOUND" });
    expect(listCreatorReferences({ runtimeRoot, buildId: "build-b" })).toEqual({ ok: true, references: [] });
    expect(listCreatorReferences({ runtimeRoot, buildId: "build-a" }).ok).toBe(true);
    expect(storeUploadedCreatorReference({ runtimeRoot, buildId: "build-a", bytes: Buffer.from("bad"), filename: "../escape", mediaType: "image/png" })).toMatchObject({ ok: false, code: "INVALID_REFERENCE_FILENAME" });
    expect(storeUploadedCreatorReference({ runtimeRoot, buildId: "build-a", bytes: Buffer.from("bad"), filename: "..\\escape", mediaType: "image/png" })).toMatchObject({ ok: false, code: "INVALID_REFERENCE_FILENAME" });
    expect(readCreatorReference({ runtimeRoot, buildId: "build-a", referenceId: "../build-b" })).toMatchObject({ ok: false, code: "INVALID_REFERENCE_ID" });
    expect(listCreatorReferences({ runtimeRoot, buildId: "../build-b" })).toMatchObject({ ok: false, code: "INVALID_BUILD_ID" });
    expect(existsSync(join(runtimeRoot, "metadata", "escape"))).toBe(false);
  });

  it("reads and lists without mutation and leaves P6 model state and Build history intact", () => {
    const runtimeRoot = temp("runtime");
    const projectRoot = temp("product");
    build(runtimeRoot, projectRoot, "build-read");
    writeProjectModelPreference({ projectRoot, engineId: "cursor", modelId: "auto" });
    const prefPath = resolveProjectModelPreferencesPath(projectRoot);
    const prefBefore = readFileSync(prefPath, "utf8");
    const recordPath = resolveBuildRecordPath(runtimeRoot, "build-read");
    const recordBefore = readFileSync(recordPath, "utf8");
    const emptyRoot = join(runtimeRoot, "metadata", "build-references");
    expect(listCreatorReferences({ runtimeRoot, buildId: "build-read" })).toEqual({ ok: true, references: [] });
    expect(existsSync(emptyRoot)).toBe(false);
    const stored = storeUploadedCreatorReference({ runtimeRoot, buildId: "build-read", bytes: Buffer.from("stored"), filename: "asset.txt", mediaType: "text/plain" });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    const namesBefore = readdirSync(join(emptyRoot, "build-read")).sort();
    readCreatorReference({ runtimeRoot, buildId: "build-read", referenceId: stored.reference.referenceId });
    listCreatorReferences({ runtimeRoot, buildId: "build-read" });
    resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId: "build-read", referenceId: stored.reference.referenceId });
    expect(readdirSync(join(emptyRoot, "build-read")).sort()).toEqual(namesBefore);
    expect(readFileSync(recordPath, "utf8")).toBe(recordBefore);
    expect(readFileSync(prefPath, "utf8")).toBe(prefBefore);
  });

  it("rejects symlink escapes and detects tampered uploaded bytes", () => {
    const runtimeRoot = temp("runtime");
    const projectRoot = temp("product");
    const outside = temp("outside");
    build(runtimeRoot, projectRoot, "build-safe");
    const root = join(runtimeRoot, "metadata", "build-references");
    symlinkSync(outside, root);
    expect(storeUploadedCreatorReference({ runtimeRoot, buildId: "build-safe", bytes: Buffer.from("x"), filename: "x.txt", mediaType: "text/plain" })).toMatchObject({ ok: false, code: "REFERENCE_WRITE_FAILED" });
    expect(readdirSync(outside)).toEqual([]);
    rmSync(root);
    const stored = storeUploadedCreatorReference({ runtimeRoot, buildId: "build-safe", bytes: Buffer.from("original"), filename: "x.txt", mediaType: "text/plain" });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    const blob = resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId: "build-safe", referenceId: stored.reference.referenceId });
    expect(blob.ok).toBe(true);
    if (!blob.ok) return;
    writeFileSync(blob.path, "tampered");
    expect(resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId: "build-safe", referenceId: stored.reference.referenceId })).toMatchObject({ ok: false, code: "REFERENCE_BLOB_MISMATCH" });
  });
});
