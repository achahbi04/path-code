/** P9.3 Builder is a redacted controller over accepted P9 coordinator authority. */
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildRecordSkeleton, readBuildRecord, resolveBuildRecordPath, writeBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { startPathBuildSurface } from "../../scripts/pathcode-cli/build/surface/server.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const roots: string[] = [];
let surface: Awaited<ReturnType<typeof startPathBuildSurface>> | null = null;
function temp() { const root = mkdtempSync(join(tmpdir(), "path-p93-")); roots.push(root); return root; }
afterEach(async () => {
  if (surface) { await surface.stop({ teardownOwned: true }); surface = null; }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const projectRoot = temp(); const runtimeRoot = temp();
  const git = (args: string[]) => spawnSync("git", args, { cwd: projectRoot, encoding: "utf8" });
  expect(git(["init", "-q"]).status).toBe(0);
  writeFileSync(join(projectRoot, ".gitignore"), ".env.local\n");
  const build = createBuildRecordSkeleton({ outcome: "Product", buildId: "p93-build" });
  build.projectBindings.push({ bindingId: "p93-binding", projectRoot });
  build.loop.status = "paused";
  build.coordinator = { autoRun: false, owner: "path-build-coordinator" };
  writeBuildRecord(runtimeRoot, build);
  return { projectRoot, runtimeRoot, git };
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
const route = "/api/builds/p93-build/environments";
const mutate = (base: string, action: string, expectedEnvironmentRevision: number, input: object) =>
  request(base, `${route}/mutate`, post({ action, expectedEnvironmentRevision, input }));

describe("P9.3 Builder environments", () => {
  it("opens read-only, renders redacted canonical state, and routes revision guarded config/secret edits", async () => {
    const f = fixture(); const base = await start(f.runtimeRoot);
    const before = readFileSync(resolveBuildRecordPath(f.runtimeRoot, "p93-build"), "utf8");
    expect(await request(base, route)).toMatchObject({ status: 200, body: { ok: true, revision: 0, items: [] } });
    expect(readFileSync(resolveBuildRecordPath(f.runtimeRoot, "p93-build"), "utf8")).toBe(before);
    const created = await mutate(base, "create_environment", 0, { name: "My environment" });
    expect(created).toMatchObject({ status: 200, body: { ok: true, revision: 1 } });
    const envId = created.body.environmentId;
    expect(envId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await mutate(base, "rename_environment", 1, { environmentId: envId, name: "Renamed" }))
      .toMatchObject({ status: 200, body: { revision: 2 } });
    expect((await request(base, route)).body.items[0]).toMatchObject({ environmentId: envId, name: "Renamed" });
    expect(await mutate(base, "set_config", 2, { environmentId: envId, variableName: "FEATURE_FLAG", value: "on" }))
      .toMatchObject({ status: 200, body: { revision: 3 } });
    expect(await mutate(base, "set_config", 3, { environmentId: envId, variableName: "FEATURE_FLAG", value: "off" }))
      .toMatchObject({ status: 200, body: { revision: 4 } });
    expect(await mutate(base, "bind_secret", 4, { environmentId: envId, variableName: "FEATURE_FLAG", backend: "local_env_file" }))
      .toMatchObject({ status: 409, body: { code: "VARIABLE_KIND_CONFLICT" } });
    const converted = await mutate(base, "bind_secret", 4,
      { environmentId: envId, variableName: "FEATURE_FLAG", backend: "local_env_file", replace: true });
    expect(converted).toMatchObject({ status: 200, body: { revision: 5 } });
    expect(JSON.stringify(converted.body)).not.toContain("secretRef");
    const item = (await request(base, route)).body.items[0].variables[0];
    expect(item).toMatchObject({ kind: "secret", backend: "local_env_file", descriptor: { source: ".env.local" },
      bindingState: "configured", presenceState: "unknown", safetyState: "unknown" });
    expect(item).not.toHaveProperty("secretRef");
    expect(JSON.stringify(await request(base, `${route}/${envId}`))).not.toContain("secretRef");
    expect(JSON.stringify(await request(base, route))).not.toContain(f.projectRoot);
    expect(await mutate(base, "delete_environment", 5, { environmentId: envId }))
      .toMatchObject({ status: 409, body: { code: "ENVIRONMENT_NOT_EMPTY" } });
    expect(await mutate(base, "set_config", 4, { environmentId: envId, variableName: "OTHER", value: "x" }))
      .toMatchObject({ status: 409, body: { code: "ENVIRONMENT_REVISION_STALE" } });
    expect(await mutate(base, "unbind_secret", 5, { environmentId: envId, variableName: "FEATURE_FLAG" }))
      .toMatchObject({ status: 200, body: { backendMaterialChanged: false, revision: 6 } });
    expect(await mutate(base, "delete_environment", 6, { environmentId: envId }))
      .toMatchObject({ status: 200, body: { revision: 7 } });
    expect((await request(base, route)).body.items).toEqual([]);
  }, 45_000);

  it("does not accept secret values or browser secretRefs and keeps Vercel presence unknown", async () => {
    const f = fixture(); const base = await start(f.runtimeRoot);
    const envId = (await mutate(base, "create_environment", 0, { name: "Provider" })).body.environmentId;
    const sentinel = "P93_SECRET_SENTINEL";
    expect(await mutate(base, "bind_secret", 1,
      { environmentId: envId, variableName: "PRODUCT_KEY", backend: "vercel_env", value: sentinel }))
      .toMatchObject({ status: 400, body: { ok: false } });
    const bound = await mutate(base, "bind_secret", 1,
      { environmentId: envId, variableName: "PRODUCT_KEY", backend: "vercel_env" });
    expect(bound).toMatchObject({ status: 200, body: { revision: 2 } });
    expect(bound.body).not.toHaveProperty("secretRef");
    expect(await mutate(base, "set_vercel_locator", 2,
      { environmentId: envId, variableName: "PRODUCT_KEY", projectRef: "prj_factual", targetRef: "production" }))
      .toMatchObject({ status: 200, body: { revision: 3 } });
    expect(await mutate(base, "set_vercel_locator", 3,
      { environmentId: envId, variableName: "PRODUCT_KEY", secretRef: "caller-ref", projectRef: "other" }))
      .toMatchObject({ status: 400, body: { code: "ENVIRONMENT_REQUEST_INVALID" } });
    const listed = (await request(base, route)).body;
    expect(listed.items[0].variables[0]).toMatchObject({ backend: "vercel_env", presenceState: "unknown",
      descriptor: { projectRef: "prj_factual", targetRef: "production" } });
    expect(JSON.stringify(listed)).not.toContain("secretRef");
    expect(JSON.stringify(listed)).not.toContain(sentinel);
    expect(readFileSync(resolveBuildRecordPath(f.runtimeRoot, "p93-build"), "utf8")).not.toContain(sentinel);
    expect(await request(base, `${route}/verify-local`,
      post({ environmentId: envId, variableName: "PRODUCT_KEY", expectedEnvironmentRevision: 3 })))
      .toMatchObject({ status: 404, body: { code: "SECRET_BINDING_NOT_FOUND" } });
  }, 45_000);

  it("verifies local safety without exposing values and sends only an environmentId for runtime selection", async () => {
    const f = fixture(); const base = await start(f.runtimeRoot);
    const envId = (await mutate(base, "create_environment", 0, { name: "Local" })).body.environmentId;
    await mutate(base, "set_config", 1, { environmentId: envId, variableName: "FEATURE_FLAG", value: "on" });
    await mutate(base, "bind_secret", 2, { environmentId: envId, variableName: "PRODUCT_KEY", backend: "local_env_file" });
    writeFileSync(join(f.projectRoot, ".env.local"), "PRODUCT_KEY=P93_LOCAL_SECRET_SENTINEL\n");
    const verified = await request(base, `${route}/verify-local`,
      post({ environmentId: envId, variableName: "PRODUCT_KEY", expectedEnvironmentRevision: 3 }));
    expect(verified).toMatchObject({ status: 200, body: { presenceState: "verified_present", safetyState: "verified_safe" } });
    expect(JSON.stringify(verified)).not.toContain("P93_LOCAL_SECRET_SENTINEL");
    writeFileSync(join(f.projectRoot, "package.json"), JSON.stringify({ scripts: { start: "node server.mjs" } }));
    writeFileSync(join(f.projectRoot, "server.mjs"), `
      import { createServer } from 'node:http';
      createServer((req, res) => res.end(JSON.stringify({ selected: process.env.PRODUCT_KEY === 'P93_LOCAL_SECRET_SENTINEL',
        config: process.env.FEATURE_FLAG }))).listen(Number(process.env.PORT), process.env.HOST);
    `);
    expect(await request(base, "/api/builds/p93-build/runtime/restart",
      post({ environmentId: envId, secretRef: "forbidden" }))).toMatchObject({ status: 400, body: { code: "ENVIRONMENT_SELECTION_INVALID" } });
    const unselected = await request(base, "/api/builds/p93-build/runtime/start", post({}));
    expect(unselected).toMatchObject({ status: 200, body: { ok: true } });
    expect(await (await fetch(unselected.body.runtime.url)).json()).toEqual({ selected: false });
    const started = await request(base, "/api/builds/p93-build/runtime/restart", post({ environmentId: envId }));
    expect(started).toMatchObject({ status: 200, body: { ok: true } });
    expect(await (await fetch(started.body.runtime.url)).json()).toEqual({ selected: true, config: "on" });
    expect(JSON.stringify(started.body)).not.toContain("P93_LOCAL_SECRET_SENTINEL");
    expect(JSON.stringify(started.body)).not.toContain("secretRef");
    expect(JSON.stringify(readBuildRecord(f.runtimeRoot, "p93-build"))).not.toContain("P93_LOCAL_SECRET_SENTINEL");
    expect((await request(base, "/api/builds/p93-build/runtime/restart", post({ environmentId: "Local" }))).body.ok).toBe(false);
  }, 60_000);

  it("shows only bounded local verification facts for tracked, unignored, missing, and malformed files", async () => {
    const f = fixture(); const base = await start(f.runtimeRoot);
    const envId = (await mutate(base, "create_environment", 0, { name: "Local" })).body.environmentId;
    await mutate(base, "bind_secret", 1, { environmentId: envId, variableName: "PRODUCT_KEY", backend: "local_env_file" });
    const file = join(f.projectRoot, ".env.local");
    writeFileSync(file, "PRODUCT_KEY=LOCAL_VALUE_SENTINEL\n");
    expect(f.git(["add", "-f", ".env.local"]).status).toBe(0);
    const verify = (revision: number) => request(base, `${route}/verify-local`,
      post({ environmentId: envId, variableName: "PRODUCT_KEY", expectedEnvironmentRevision: revision }));
    expect(await verify(2)).toMatchObject({ status: 200, body: { revision: 3,
      presenceState: "unknown", safetyState: "verified_unsafe" } });
    expect(f.git(["rm", "--cached", ".env.local"]).status).toBe(0);
    writeFileSync(join(f.projectRoot, ".gitignore"), "");
    expect(await verify(3)).toMatchObject({ status: 200, body: { revision: 4,
      presenceState: "unknown", safetyState: "verified_unsafe" } });
    writeFileSync(join(f.projectRoot, ".gitignore"), ".env.local\n");
    writeFileSync(file, "# no assignment\n");
    expect(await verify(4)).toMatchObject({ status: 200, body: { revision: 5,
      presenceState: "verified_missing", safetyState: "verified_safe" } });
    writeFileSync(file, "PRODUCT_KEY=$(unsafe)\n");
    const malformed = await verify(5);
    expect(malformed).toMatchObject({ status: 400, body: { code: "LOCAL_ENV_SYNTAX_UNSUPPORTED" } });
    expect(JSON.stringify(malformed)).not.toContain("LOCAL_VALUE_SENTINEL");
    expect(JSON.stringify(malformed)).not.toContain("$(unsafe)");
    expect(readFileSync(resolveBuildRecordPath(f.runtimeRoot, "p93-build"), "utf8")).not.toContain("LOCAL_VALUE_SENTINEL");
  }, 45_000);

  it("contains the creator UI controls without secret-value fields or browser provider calls", () => {
    const root = join(resolvePathPackageRoot(), "scripts/pathcode-cli/build/surface");
    const html = readFileSync(join(root, "public/index.html"), "utf8");
    const client = readFileSync(join(root, "public/app.js"), "utf8");
    expect(html).toContain('id="environmentsDialog"');
    expect(html).toContain('id="runtimeEnvironmentSelect"');
    expect(client).toContain("This does not delete its value from .env.local or Vercel.");
    expect(html).not.toMatch(/id="(?:local|vercel)SecretValue"/);
    expect(client).toContain("expectedEnvironmentRevision: environmentState.revision");
    expect(client).toContain("await refreshEnvironments(buildId)");
    expect(client).toContain("window.confirm");
    expect(client).not.toContain("secretRef");
    expect(client).not.toContain("localStorage");
    expect(client).not.toContain("sessionStorage");
    expect(client).not.toMatch(/fetch\([^\n]*vercel/i);
  });

  it("keeps reads available but blocks environment mutation and verification during pending restore", async () => {
    const f = fixture(); const base = await start(f.runtimeRoot);
    const envId = (await mutate(base, "create_environment", 0, { name: "Local" })).body.environmentId;
    await mutate(base, "bind_secret", 1, { environmentId: envId, variableName: "PRODUCT_KEY", backend: "local_env_file" });
    const record = readBuildRecord(f.runtimeRoot, "p93-build")!;
    record.pendingRestore = { operationId: "11111111-1111-4111-8111-111111111111",
      expectedAuthoritativeSha: "a".repeat(40), targetAdoptionIndex: 0,
      targetSha: "b".repeat(40), targetTreeSha: "c".repeat(40), candidateSha: null,
      createdAt: "2026-01-01T00:00:00.000Z" };
    writeBuildRecord(f.runtimeRoot, record);
    expect((await request(base, route)).body.items).toHaveLength(1);
    expect(await mutate(base, "rename_environment", 2, { environmentId: envId, name: "Other" }))
      .toMatchObject({ status: 409, body: { code: "RESTORE_PENDING" } });
    expect(await request(base, `${route}/verify-local`, post({ environmentId: envId,
      variableName: "PRODUCT_KEY", expectedEnvironmentRevision: 2 })))
      .toMatchObject({ status: 409, body: { code: "RESTORE_PENDING" } });
    expect(readBuildRecord(f.runtimeRoot, "p93-build")!.environments!.revision).toBe(2);
  }, 45_000);
});
