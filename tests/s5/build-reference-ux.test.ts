/** P7.1 Builder conversation references use the P7.0 Build-owned authority. */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildRecordSkeleton, resolveBuildRecordPath, writeBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { listCreatorReferences, resolveUploadedCreatorReferenceBlob } from "../../scripts/pathcode-cli/build/references.mjs";
import { startPathBuildSurface } from "../../scripts/pathcode-cli/build/surface/server.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const temps: string[] = [];
const temp = (name: string) => { const path = mkdtempSync(join(tmpdir(), `path-p71-${name}-`)); temps.push(path); return path; };
let surface: Awaited<ReturnType<typeof startPathBuildSurface>> | null = null;
afterEach(async () => {
  if (surface) { await surface.stop({ teardownOwned: true }); surface = null; }
  for (const path of temps.splice(0)) rmSync(path, { recursive: true, force: true });
});

function build(runtimeRoot: string, projectRoot: string, buildId: string) {
  const record = createBuildRecordSkeleton({ outcome: "Create a product", buildId });
  record.projectBindings.push({ bindingId: `binding-${buildId}`, projectRoot });
  record.loop.status = "paused";
  writeBuildRecord(runtimeRoot, record);
}

async function start(runtimeRoot: string) {
  surface = await startPathBuildSurface({
    packageRoot: resolvePathPackageRoot(), runtimeRoot, fakeMode: true,
    autoLoop: false, openBrowser: false, port: 0,
  });
  return surface.url;
}

async function json(base: string, path: string, init?: RequestInit) {
  const response = await fetch(new URL(path, base), init);
  return { status: response.status, body: await response.json() as any };
}

describe("P7.1 Builder creator references", () => {
  it("opens and lists without reference writes, then stores only explicit uploads and links for the current Build", async () => {
    const runtimeRoot = temp("runtime");
    const projectA = temp("project-a");
    const projectB = temp("project-b");
    build(runtimeRoot, projectA, "build-a");
    build(runtimeRoot, projectB, "build-b");
    const recordA = resolveBuildRecordPath(runtimeRoot, "build-a");
    const referencesRoot = join(runtimeRoot, "metadata", "build-references");
    const base = await start(runtimeRoot);
    expect((await fetch(new URL("/?buildId=build-a", base))).status).toBe(200);
    expect((await json(base, "/api/builds/build-a")).status).toBe(200);
    expect(await json(base, "/api/builds/build-a/references")).toEqual({ status: 200, body: { ok: true, references: [] } });
    expect(existsSync(referencesRoot)).toBe(false);
    const before = readFileSync(recordA, "utf8");

    const bytes = Buffer.from("creator image bytes");
    const upload = await json(base, "/api/builds/build-a/references/upload", {
      method: "POST", headers: { "Content-Type": "image/png", "X-Reference-Filename": encodeURIComponent("reference.png") }, body: bytes,
    });
    expect(upload.status).toBe(200);
    expect(upload.body).toMatchObject({ ok: true, reference: { kind: "uploaded", filename: "reference.png", mediaType: "image/png", byteLength: bytes.length } });
    expect(upload.body.reference).not.toHaveProperty("blob");
    expect(upload.body.reference).not.toHaveProperty("owner");
    expect(upload.body.reference).not.toHaveProperty("schema");
    expect(upload.body.reference).not.toHaveProperty("sha256");
    const id = upload.body.reference.referenceId;
    const authoritative = listCreatorReferences({ runtimeRoot, buildId: "build-a" });
    expect(authoritative.ok && authoritative.references).toHaveLength(1);
    const blob = resolveUploadedCreatorReferenceBlob({ runtimeRoot, buildId: "build-a", referenceId: id });
    expect(blob.ok).toBe(true);
    if (blob.ok) {
      expect(readFileSync(blob.path)).toEqual(bytes);
      expect(blob.path).not.toContain("reference.png");
    }
    expect((await json(base, `/api/builds/build-a/references/${id}`)).body.reference).toEqual(upload.body.reference);

    // This URL has no reachable service. Creating its metadata must still succeed.
    const link = await json(base, "/api/builds/build-a/references/link", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://127.0.0.1:1/design" }),
    });
    expect(link).toMatchObject({ status: 200, body: { ok: true, reference: { kind: "linked", url: "http://127.0.0.1:1/design" } } });
    expect((await json(base, "/api/builds/build-a/references")).body.references.map((r: any) => r.referenceId).sort()).toEqual([id, link.body.reference.referenceId].sort());
    expect(readdirSync(join(referencesRoot, "build-a")).filter((name) => name.endsWith(".blob"))).toHaveLength(1);
    expect(readFileSync(recordA, "utf8")).toBe(before);
    expect(readdirSync(projectA)).toEqual([]);
  }, 120_000);

  it("keeps Build identities separate and never turns failed input into a durable card", async () => {
    const runtimeRoot = temp("runtime");
    const outside = temp("outside");
    build(runtimeRoot, temp("project-a"), "build-a");
    build(runtimeRoot, temp("project-b"), "build-b");
    const base = await start(runtimeRoot);
    const upload = (buildId: string, filename: string, text: string) => json(base, `/api/builds/${buildId}/references/upload`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-Reference-Filename": encodeURIComponent(filename) }, body: Buffer.from(text),
    });
    const first = await upload("build-a", "same.txt", "first");
    const second = await upload("build-a", "same.txt", "second");
    const other = await upload("build-b", "other.txt", "other");
    expect([first.status, second.status, other.status]).toEqual([200, 200, 200]);
    expect(first.body.reference.referenceId).not.toBe(second.body.reference.referenceId);
    const aList = (await json(base, "/api/builds/build-a/references")).body.references;
    const bList = (await json(base, "/api/builds/build-b/references")).body.references;
    expect(aList.map((r: any) => r.filename)).toEqual(["same.txt", "same.txt"]);
    expect(bList.map((r: any) => r.filename)).toEqual(["other.txt"]);
    expect((await json(base, `/api/builds/build-a/references/${other.body.reference.referenceId}`)).status).toBe(404);
    expect((await json(base, `/api/builds/build-b/references/${first.body.reference.referenceId}`)).status).toBe(404);
    expect((await json(base, "/api/builds/build-a/references/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await json(base, "/api/builds/build-a/references/%2E%2E%2Fbuild-b")).status).toBe(400);
    expect((await json(base, "/api/builds/build-absent/references")).status).toBe(404);

    const unsafe = await upload("build-a", "../../escape.txt", "unsafe");
    expect(unsafe).toMatchObject({ status: 400, body: { ok: false, code: "INVALID_REFERENCE_FILENAME" } });
    const badLink = await json(base, "/api/builds/build-a/references/link", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "file:///etc/passwd" }),
    });
    expect(badLink).toMatchObject({ status: 400, body: { ok: false, code: "INVALID_REFERENCE_URL" } });
    const badMetadata = await json(base, "/api/builds/build-a/references/upload", {
      method: "POST", headers: { "Content-Type": "invalid" }, body: Buffer.from("bad"),
    });
    expect(badMetadata).toMatchObject({ status: 400, body: { ok: false, code: "INVALID_REFERENCE_FILENAME" } });
    const badType = await json(base, "/api/builds/build-a/references/upload", {
      method: "POST", headers: { "Content-Type": "invalid", "X-Reference-Filename": "safe.txt" }, body: Buffer.from("bad"),
    });
    expect(badType).toMatchObject({ status: 400, body: { ok: false, code: "INVALID_REFERENCE_MEDIA_TYPE" } });
    expect((await json(base, "/api/builds/build-a/references")).body.references).toHaveLength(2);

    const root = join(runtimeRoot, "metadata", "build-references");
    rmSync(root, { recursive: true });
    symlinkSync(outside, root);
    const failed = await upload("build-a", "safe.txt", "storage failure");
    expect(failed).toMatchObject({ status: 500, body: { ok: false, code: "REFERENCE_WRITE_FAILED" } });
    expect(readdirSync(outside)).toEqual([]);
  }, 120_000);

  it("keeps the conversation controls factual and separate from engineering dispatch", () => {
    const publicDir = join(resolvePathPackageRoot(), "scripts/pathcode-cli/build/surface/public");
    const html = readFileSync(join(publicDir, "index.html"), "utf8");
    const client = readFileSync(join(publicDir, "app.js"), "utf8");
    const server = readFileSync(join(resolvePathPackageRoot(), "scripts/pathcode-cli/build/surface/server.mjs"), "utf8");
    expect(html).toContain('id="referenceUploadBtn"');
    expect(html).toContain('id="referenceFile"');
    expect(html).toContain('id="referenceLinkForm"');
    expect(html).toContain('id="referenceList"');
    expect(html).toContain("not yet used in engineering turns");
    expect(client).toContain("body: file");
    expect(client).toContain("renderReferences(body.references || [])");
    expect(client).toContain("clearReferenceUi();");
    expect(server).toContain("storeUploadedCreatorReference({");
    expect(server).toContain("createLinkedCreatorReference({ runtimeRoot, buildId");
    expect(server).toContain("listCreatorReferences({ runtimeRoot, buildId }");
    expect(server).not.toMatch(/fetch\(reference\.source|fetch\(body\?\.url/);
  });
});
