/** P8.2C — Builder reads P8 projection and requests only confirmed S2 restore. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createBuildRecordSkeleton, readBuildRecord, resolveBuildRecordPath, writeBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { startPathBuildSurface } from "../../scripts/pathcode-cli/build/surface/server.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const roots: string[] = [];
let surface: Awaited<ReturnType<typeof startPathBuildSurface>> | null = null;
const temp = () => { const root = mkdtempSync(join(tmpdir(), "path-p82c-")); roots.push(root); return root; };
afterEach(async () => {
  if (surface) { await surface.stop({ teardownOwned: true }); surface = null; }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, args: string[]) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function fixture() {
  const root = temp(); const runtimeRoot = temp();
  git(root, ["init", "--template="]);
  git(root, ["config", "user.name", "PATH Test"]);
  git(root, ["config", "user.email", "path@example.test"]);
  writeFileSync(join(root, "product.txt"), "first\n");
  git(root, ["add", "product.txt"]); git(root, ["commit", "-m", "first"]);
  const first = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "product.txt"), "second\n");
  git(root, ["add", "product.txt"]); git(root, ["commit", "-m", "second"]);
  const second = git(root, ["rev-parse", "HEAD"]);
  const record = createBuildRecordSkeleton({ outcome: "Build a product", buildId: "build-one" });
  record.projectBindings.push({ bindingId: "binding-one", projectRoot: root });
  record.productBranch = git(root, ["symbolic-ref", "--short", "HEAD"]);
  record.authoritativeSha = second;
  record.adoptionHistory = [
    { buildId: record.buildId, projectRoot: root, adoptedSha: first, sourceSha: first, mode: "merge", adoptedAt: "2026-01-01T00:00:00.000Z" },
    { buildId: record.buildId, projectRoot: root, adoptedSha: second, sourceSha: second, mode: "merge", adoptedAt: "2026-01-02T00:00:00.000Z" },
  ];
  record.loop.status = "paused";
  record.coordinator = { autoRun: false, owner: "path-build-coordinator" };
  writeBuildRecord(runtimeRoot, record);
  return { root, runtimeRoot, first, second, record };
}

async function start(runtimeRoot: string) {
  surface = await startPathBuildSurface({ packageRoot: resolvePathPackageRoot(), runtimeRoot,
    fakeMode: true, autoLoop: false, openBrowser: false, port: 0 });
  return surface.url;
}

async function request(base: string, path: string, init?: RequestInit) {
  const response = await fetch(new URL(path, base), init);
  return { status: response.status, body: await response.json() as any };
}

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("P8.2C Builder Versions", () => {
  it("lists, reads and compares only canonical Build versions without mutating product authority", async () => {
    const f = fixture(); const base = await start(f.runtimeRoot);
    const recordPath = resolveBuildRecordPath(f.runtimeRoot, f.record.buildId);
    const before = readFileSync(recordPath, "utf8");
    const head = git(f.root, ["rev-parse", "HEAD"]);
    expect((await request(base, "/api/builds/build-one/versions"))).toMatchObject({ status: 200, body: {
      ok: true, current: { sha: f.second, adoptionIndex: 1 }, versions: [
        { adoptionIndex: 0, sha: f.first, current: false }, { adoptionIndex: 1, sha: f.second, current: true },
      ], restorePending: false,
    } });
    expect((await request(base, "/api/builds/build-one/versions/0"))).toMatchObject({ status: 200, body: { ok: true, version: { sha: f.first } } });
    expect((await request(base, "/api/builds/build-one/versions/compare?base=adoption%3A0&target=current"))).toMatchObject({ status: 200, body: {
      ok: true, base: { sha: f.first }, target: { sha: f.second }, files: [{ path: "product.txt", status: "M" }],
    } });
    expect((await request(base, `/api/builds/build-one/versions/compare?base=${f.first}&target=current`)).body.code).toBe("INVALID_VERSION_SELECTOR");
    expect((await request(base, "/api/builds/build-one/versions/9")).body.code).toBe("VERSION_NOT_FOUND");
    expect(readFileSync(recordPath, "utf8")).toBe(before);
    expect(git(f.root, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(f.root, ["status", "--porcelain=v1", "-uall"])).toBe("");
  }, 120_000);

  it("passes only canonical selector and expected SHA to S2; stale, foreign and malformed requests cannot restore", async () => {
    const f = fixture(); const base = await start(f.runtimeRoot);
    const before = readBuildRecord(f.runtimeRoot, f.record.buildId)!;
    expect((await request(base, "/api/builds/build-one/versions/restore", post({ adoptionIndex: 0, expectedAuthoritativeSha: f.first })))).toMatchObject({ status: 409, body: { code: "STALE_AUTHORITY" } });
    expect((await request(base, "/api/builds/build-one/versions/restore", post({ adoptionIndex: 0, expectedAuthoritativeSha: f.second, targetSha: f.first })))).toMatchObject({ status: 400, body: { code: "INVALID_RESTORE_REQUEST" } });
    expect((await request(base, "/api/builds/build-one/versions/restore", post({ adoptionIndex: 9, expectedAuthoritativeSha: f.second })))).toMatchObject({ status: 404, body: { code: "VERSION_NOT_FOUND" } });
    expect(readBuildRecord(f.runtimeRoot, f.record.buildId)!.adoptionHistory).toEqual(before.adoptionHistory);
    const restored = await request(base, "/api/builds/build-one/versions/restore", post({ adoptionIndex: 0, expectedAuthoritativeSha: f.second }));
    expect(restored).toMatchObject({ status: 200, body: { ok: true } });
    const after = readBuildRecord(f.runtimeRoot, f.record.buildId)!;
    expect(after.authoritativeSha).toBe(restored.body.adoptedSha);
    expect(after.adoptionHistory).toHaveLength(3);
    expect(after.adoptionHistory!.slice(0, 2)).toEqual(before.adoptionHistory);
    expect(after.adoptionHistory![2]).toMatchObject({ mode: "historical_restore", restoreTargetAdoptionIndex: 0 });
    expect((await request(base, "/api/builds/build-one/versions")).body).toMatchObject({
      current: { sha: after.authoritativeSha, adoptionIndex: 2 }, versions: [
        { sha: f.first }, { sha: f.second }, { sha: after.authoritativeSha, current: true },
      ],
    });
    const noOp = await request(base, "/api/builds/build-one/versions/restore", post({ adoptionIndex: 0, expectedAuthoritativeSha: after.authoritativeSha }));
    expect(noOp).toMatchObject({ status: 200, body: { ok: true, noOp: true } });
    expect(readBuildRecord(f.runtimeRoot, f.record.buildId)!.adoptionHistory).toHaveLength(3);
  }, 120_000);

  it("shows pending restore factually and leaves mutation authority outside the UI layer", async () => {
    const f = fixture(); const base = await start(f.runtimeRoot);
    const record = readBuildRecord(f.runtimeRoot, f.record.buildId)!;
    record.pendingRestore = { operationId: "11111111-1111-4111-8111-111111111111", expectedAuthoritativeSha: f.second,
      targetAdoptionIndex: 0, targetSha: f.first, targetTreeSha: git(f.root, ["rev-parse", `${f.first}^{tree}`]),
      candidateSha: null, createdAt: "2026-01-01T00:00:00.000Z" };
    writeBuildRecord(f.runtimeRoot, record);
    expect((await request(base, "/api/builds/build-one/versions")).body.restorePending).toBe(true);
    expect((await request(base, "/api/builds/build-one/versions/restore", post({ adoptionIndex: 0, expectedAuthoritativeSha: f.second })))).toMatchObject({ status: 409, body: { code: "RESTORE_PENDING" } });
    const publicDir = join(resolvePathPackageRoot(), "scripts/pathcode-cli/build/surface/public");
    const html = readFileSync(join(publicDir, "index.html"), "utf8");
    const client = readFileSync(join(publicDir, "app.js"), "utf8");
    const server = readFileSync(join(resolvePathPackageRoot(), "scripts/pathcode-cli/build/surface/server.mjs"), "utf8");
    expect(html).toContain('id="versionsDialog"');
    expect(html).toContain('id="confirmVersionRestoreDialog"');
    expect(html).toContain("Your later versions remain in history");
    expect(client).toContain('returnValue === "confirm"');
    expect(client).toContain("void submitVersionRestore(intent)");
    expect(client).toContain("await refreshVersions(intent.buildId)");
    expect(client).toContain("const listed = await refreshVersions(buildId)");
    expect(server).toContain("compareProductVersions({ runtimeRoot, buildId, base, target })");
    expect(server).toContain("coordinator.restoreHistoricalVersion(buildId, body.adoptionIndex, body.expectedAuthoritativeSha)");
    expect(server).not.toMatch(/git\([^\n]*restore/);
  }, 120_000);

  it("reports unavailable history and prevents a different Build from using its selector", async () => {
    const f = fixture();
    const other = createBuildRecordSkeleton({ outcome: "Another product", buildId: "build-two" });
    other.projectBindings.push({ bindingId: "binding-two", projectRoot: f.root });
    writeBuildRecord(f.runtimeRoot, other);
    const base = await start(f.runtimeRoot);
    expect((await request(base, "/api/builds/build-two/versions/0")).body.code).toBe("VERSION_NOT_FOUND");
    expect((await request(base, "/api/builds/build-two/versions/restore", post({ adoptionIndex: 0, expectedAuthoritativeSha: f.second }))).body.ok).toBe(false);
    const record = readBuildRecord(f.runtimeRoot, f.record.buildId)!;
    (record.adoptionHistory![0] as { adoptedSha: string }).adoptedSha = "a".repeat(40);
    writeBuildRecord(f.runtimeRoot, record);
    expect((await request(base, "/api/builds/build-one/versions")).body.versions[0].git.resolvable).toBe(false);
    expect((await request(base, "/api/builds/build-one/versions/restore", post({ adoptionIndex: 0, expectedAuthoritativeSha: f.second })))).toMatchObject({ status: 409, body: { code: "VERSION_UNRESOLVED" } });
    expect(git(f.root, ["rev-parse", "HEAD"])).toBe(f.second);
    expect(readBuildRecord(f.runtimeRoot, f.record.buildId)!.adoptionHistory).toHaveLength(2);
  }, 120_000);
});
