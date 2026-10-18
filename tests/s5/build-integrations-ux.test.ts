import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildRecordSkeleton, readBuildRecord, resolveBuildRecordPath, writeBuildRecord } from "../../scripts/pathcode-cli/build/record.mjs";
import { readBuildEvents } from "../../scripts/pathcode-cli/build/index.mjs";
import { startPathBuildSurface } from "../../scripts/pathcode-cli/build/surface/server.mjs";
import { frameEngineerObjective } from "../../scripts/pathcode-cli/build/objectives.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const roots: string[] = [];
let surface: Awaited<ReturnType<typeof startPathBuildSurface>> | null = null;
function temp() { const root = mkdtempSync(join(tmpdir(), "path-p124-")); roots.push(root); return root; }
function fixture(buildId: string) {
  const projectRoot = temp(); const runtimeRoot = temp();
  writeFileSync(join(projectRoot, ".gitignore"), ".env.local\n");
  const build = createBuildRecordSkeleton({ outcome: "Integration UX fixture", buildId });
  build.projectBindings.push({ bindingId: `${buildId}-binding`, projectRoot });
  build.loop.status = "paused";
  build.coordinator = { autoRun: false, owner: "path-build-coordinator" };
  writeBuildRecord(runtimeRoot, build);
  return { projectRoot, runtimeRoot, buildId };
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
const integrationRoute = (buildId: string) => `/api/builds/${encodeURIComponent(buildId)}/integrations`;
const environmentRoute = (buildId: string) => `/api/builds/${encodeURIComponent(buildId)}/environments`;
async function mutateEnvironment(base: string, buildId: string, action: string, revision: number, input: object) {
  return request(base, `${environmentRoute(buildId)}/mutate`, post({ action, expectedEnvironmentRevision: revision, input }));
}
async function mutateIntegration(base: string, buildId: string, action: string, revision: number, input: object) {
  return request(base, `${integrationRoute(buildId)}/mutate`, post({ action, expectedIntegrationRevision: revision, input }));
}
afterEach(async () => {
  if (surface) { await surface.stop({ teardownOwned: true }); surface = null; }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("P12.4 Builder integrations", () => {
  it("reads legacy authority without writes and safely manages P9-backed credential references through HTTP", async () => {
    const f = fixture("p124-http"); const base = await start(f.runtimeRoot);
    const secretSentinel = "P124_SYNTHETIC_SECRET_SENTINEL";
    writeFileSync(join(f.projectRoot, ".env.local"), `PRODUCT_TOKEN=${secretSentinel}\n`);
    const recordPath = resolveBuildRecordPath(f.runtimeRoot, f.buildId);
    const legacyBytes = readFileSync(recordPath, "utf8");
    const catalog = await request(base, `${integrationRoute(f.buildId)}/catalog`);
    expect(catalog).toMatchObject({ status: 200, body: { ok: true, items: [
      { providerKey: "github", displayName: "GitHub", credentialRoles: [{ role: "token", required: true }] },
      { providerKey: "stripe", displayName: "Stripe", credentialRoles: [{ role: "secret_key", required: true }] },
    ] } });
    expect(JSON.stringify(catalog.body)).not.toMatch(/https?:|origin|endpoint|authorization/i);
    const empty = await request(base, integrationRoute(f.buildId));
    expect(empty).toMatchObject({ status: 200, body: { ok: true, revision: 0, items: [], environments: [] } });
    expect(readFileSync(recordPath, "utf8")).toBe(legacyBytes);

    const created = await mutateIntegration(base, f.buildId, "create_integration", 0, { providerKey: "github", label: "GitHub workspace" });
    expect(created).toMatchObject({ status: 200, body: { ok: true, revision: 1 } });
    const integrationId = created.body.integrationId;
    const environment = await mutateEnvironment(base, f.buildId, "create_environment", 0, { name: "Development" });
    const environmentId = environment.body.environmentId;
    const secret = await mutateEnvironment(base, f.buildId, "bind_secret", 1,
      { environmentId, variableName: "PRODUCT_TOKEN", backend: "vercel_env" });
    const config = await mutateEnvironment(base, f.buildId, "set_config", 2,
      { environmentId, variableName: "PUBLIC_FLAG", value: "ordinary-value-sentinel" });
    expect(config.status).toBe(200);
    const otherEnvironment = await mutateEnvironment(base, f.buildId, "create_environment", 3, { name: "Other" });
    await mutateEnvironment(base, f.buildId, "bind_secret", 4,
      { environmentId: otherEnvironment.body.environmentId, variableName: "OTHER_TOKEN", backend: "vercel_env" });

    const boundEnvironment = await mutateIntegration(base, f.buildId, "bind_environment", 1,
      { integrationId, environmentId });
    expect(boundEnvironment).toMatchObject({ status: 200, body: { revision: 2 } });
    const bindingId = boundEnvironment.body.bindingId;
    const missingRequired = await request(base, `${integrationRoute(f.buildId)}/verify`, post({ integrationId, bindingId,
      expectedIntegrationRevision: 2, expectedEnvironmentRevision: 5 }));
    expect(missingRequired).toMatchObject({ status: 200, body: { ok: true, revision: 3,
      verification: { state: "action_required", failureCode: "CREDENTIAL_REQUIRED" } } });
    const badConfigChoice = await mutateIntegration(base, f.buildId, "bind_credential", 3,
      { integrationId, bindingId, role: "token", variableName: "PUBLIC_FLAG" });
    expect(badConfigChoice).toMatchObject({ status: 404, body: { code: "INTEGRATION_SECRET_REF_NOT_FOUND" } });
    const foreignEnvironmentChoice = await mutateIntegration(base, f.buildId, "bind_credential", 3,
      { integrationId, bindingId, role: "token", variableName: "OTHER_TOKEN" });
    expect(foreignEnvironmentChoice).toMatchObject({ status: 404, body: { code: "INTEGRATION_SECRET_REF_NOT_FOUND" } });
    const browserRefRejected = await mutateIntegration(base, f.buildId, "bind_credential", 3,
      { integrationId, bindingId, role: "token", variableName: "PRODUCT_TOKEN", secretRef: "browser-supplied-ref" });
    expect(browserRefRejected).toMatchObject({ status: 400, body: { code: "INTEGRATION_MUTATION_INVALID" } });
    expect(secret.status).toBe(200);
    const credential = await mutateIntegration(base, f.buildId, "bind_credential", 3,
      { integrationId, bindingId, role: "token", variableName: "PRODUCT_TOKEN" });
    expect(credential).toMatchObject({ status: 200, body: { ok: true, revision: 4, integrationId, bindingId } });
    expect(JSON.stringify(credential.body)).not.toContain("secretRef");

    const beforeRead = readFileSync(recordPath, "utf8");
    const verificationEventCount = readBuildEvents(f.runtimeRoot, f.buildId).filter((event) => event.type === "integration.verified").length;
    const listed = await request(base, integrationRoute(f.buildId));
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ revision: 4, environmentRevision: 5,
      items: [{ integrationId, providerDisplayName: "GitHub", bindings: [{ bindingId, environmentId,
        environmentName: "Development", credentials: [{ role: "token", variableName: "PRODUCT_TOKEN", backend: "vercel_env", resolved: true }],
        verification: { state: "unverified" } }] }] });
    expect(listed.body.environments).toHaveLength(2);
    expect(listed.body.environments.find((item: any) => item.environmentId === environmentId)).toMatchObject({
      name: "Development", variables: [{ kind: "secret", variableName: "PRODUCT_TOKEN", backend: "vercel_env" }],
    });
    expect(listed.body.environments.every((item: any) => item.variables.every((variable: any) => variable.kind === "secret"))).toBe(true);
    expect(JSON.stringify(listed.body)).not.toContain("secretRef");
    expect(JSON.stringify(listed.body)).not.toContain("providerAccountRef");
    expect(JSON.stringify(listed.body)).not.toContain("ordinary-value-sentinel");
    expect(JSON.stringify(listed.body)).not.toContain(secretSentinel);
    expect(JSON.stringify(listed.body)).not.toContain("Authorization");
    expect(JSON.stringify(listed.body)).not.toContain(f.projectRoot);
    expect(readFileSync(recordPath, "utf8")).toBe(beforeRead);
    expect(readBuildEvents(f.runtimeRoot, f.buildId).filter((event) => event.type === "integration.verified")).toHaveLength(verificationEventCount);

    const verifyBody = { integrationId, bindingId, expectedIntegrationRevision: 4, expectedEnvironmentRevision: 5 };
    const verified = await request(base, `${integrationRoute(f.buildId)}/verify`, post(verifyBody));
    expect(verified).toMatchObject({ status: 200, body: { ok: true, revision: 5,
      verification: { state: "unavailable", adapterVersion: null,
        failureCode: "CREDENTIAL_MATERIAL_UNAVAILABLE" } } });
    expect(JSON.stringify(verified.body)).not.toContain("providerAccountRef");
    expect(JSON.stringify(verified.body)).not.toContain("secretRef");
    expect(JSON.stringify(verified.body)).not.toContain(secretSentinel);
    expect(readFileSync(recordPath, "utf8")).not.toContain(secretSentinel);
    expect(JSON.stringify(readBuildEvents(f.runtimeRoot, f.buildId))).not.toContain(secretSentinel);
    const extraCredentialRejected = await request(base, `${integrationRoute(f.buildId)}/verify`, post({ ...verifyBody, token: "must-not-be-accepted" }));
    expect(extraCredentialRejected).toMatchObject({ status: 400, body: { code: "INTEGRATION_VERIFICATION_INVALID" } });
    const stale = await mutateIntegration(base, f.buildId, "rename_integration", 4, { integrationId, label: "Stale name" });
    expect(stale).toMatchObject({ status: 409, body: { code: "INTEGRATION_REVISION_STALE" } });

    let record = readBuildRecord(f.runtimeRoot, f.buildId)!;
    record.pendingRestore = { restoreId: "pending-restore" } as any;
    writeBuildRecord(f.runtimeRoot, record);
    expect((await request(base, integrationRoute(f.buildId))).status).toBe(200);
    expect(await mutateIntegration(base, f.buildId, "rename_integration", 5, { integrationId, label: "Blocked" }))
      .toMatchObject({ status: 409, body: { code: "RESTORE_PENDING" } });
    expect(await request(base, `${integrationRoute(f.buildId)}/verify`, post({ ...verifyBody, expectedIntegrationRevision: 5 })))
      .toMatchObject({ status: 409, body: { code: "RESTORE_PENDING" } });
    record = readBuildRecord(f.runtimeRoot, f.buildId)!;
    delete record.pendingRestore;
    writeBuildRecord(f.runtimeRoot, record);

    expect(await mutateIntegration(base, f.buildId, "delete_integration", 5, { integrationId }))
      .toMatchObject({ status: 409, body: { code: "INTEGRATION_NOT_EMPTY" } });
    expect(await mutateIntegration(base, f.buildId, "unbind_credential", 5, { integrationId, bindingId, role: "token" }))
      .toMatchObject({ status: 200, body: { revision: 6 } });
    expect(await mutateIntegration(base, f.buildId, "unbind_environment", 6, { integrationId, bindingId }))
      .toMatchObject({ status: 200, body: { revision: 7 } });
    expect(await mutateIntegration(base, f.buildId, "delete_integration", 7, { integrationId }))
      .toMatchObject({ status: 200, body: { revision: 8 } });
  }, 45_000);

  it("projects stale adapter status without mutating authority and gives engineering only factual metadata", async () => {
    const f = fixture("p124-projection"); const base = await start(f.runtimeRoot);
    const integration = await mutateIntegration(base, f.buildId, "create_integration", 0, { providerKey: "github", label: "Project GitHub" });
    const integrationId = integration.body.integrationId;
    expect(await mutateIntegration(base, f.buildId, "rename_integration", 1,
      { integrationId, label: "Project GitHub Renamed" })).toMatchObject({ status: 200, body: { revision: 2 } });
    const env = await mutateEnvironment(base, f.buildId, "create_environment", 0, { name: "Development" });
    const environmentId = env.body.environmentId;
    await mutateEnvironment(base, f.buildId, "bind_secret", 1, { environmentId, variableName: "PRODUCT_GITHUB_TOKEN", backend: "vercel_env" });
    const bound = await mutateIntegration(base, f.buildId, "bind_environment", 2, { integrationId, environmentId });
    const bindingId = bound.body.bindingId;
    await mutateIntegration(base, f.buildId, "bind_credential", 3,
      { integrationId, bindingId, role: "token", variableName: "PRODUCT_GITHUB_TOKEN" });
    let record = readBuildRecord(f.runtimeRoot, f.buildId)!;
    const canonicalIntegration = record.integrations!.items[0]!;
    const binding = canonicalIntegration.bindings[0]!;
    binding.verification = { state: "ready", adapterVersion: "github.identity.v0", providerAccountRef: "github:user:98765",
      capabilities: ["github.identity.read"], verifiedAt: "2026-01-02T03:04:05.000Z", failureCode: null };
    writeBuildRecord(f.runtimeRoot, record);
    const before = readFileSync(resolveBuildRecordPath(f.runtimeRoot, f.buildId), "utf8");
    const projection = await request(base, integrationRoute(f.buildId));
    expect(projection).toMatchObject({ status: 200, body: { items: [{ bindings: [{ needsReverification: true,
      verification: { state: "ready", adapterVersion: "github.identity.v0", capabilities: ["github.identity.read"] },
      credentials: [{ role: "token", variableName: "PRODUCT_GITHUB_TOKEN" }] }] }] } });
    expect(JSON.stringify(projection.body)).not.toContain("secretRef");
    expect(JSON.stringify(projection.body)).not.toContain("providerAccountRef");
    expect(JSON.stringify(projection.body)).not.toContain("github:user:98765");
    expect(readFileSync(resolveBuildRecordPath(f.runtimeRoot, f.buildId), "utf8")).toBe(before);

    const objective = frameEngineerObjective(readBuildRecord(f.runtimeRoot, f.buildId), "Build the requested product");
    expect(objective).toContain("CONFIGURED PRODUCT INTEGRATIONS");
    expect(objective).toContain("Integration: GitHub");
    expect(objective).toContain("Environment: Development");
    expect(objective).toContain("Credential role token: PRODUCT_GITHUB_TOKEN");
    expect(objective).toContain("Verification: ready");
    expect(objective).toContain("github.identity.read");
    expect(objective).not.toContain("secretRef");
    expect(objective).not.toContain("github:user:98765");
    expect(objective).not.toContain(binding.credentials[0]!.secretRef);

    canonicalIntegration.bindings[0]!.credentials[0]!.secretRef = "unresolved-p9-reference";
    writeBuildRecord(f.runtimeRoot, record);
    const unresolved = await request(base, integrationRoute(f.buildId));
    expect(JSON.stringify(unresolved.body)).not.toContain("unresolved-p9-reference");
    expect(unresolved.body.items[0].bindings[0].credentials[0]).toMatchObject({ role: "token", resolved: false });
    expect(unresolved.body.items[0].bindings[0].credentials[0]).not.toHaveProperty("variableName");
    const staleObjective = frameEngineerObjective(readBuildRecord(f.runtimeRoot, f.buildId), "Build the requested product");
    expect(staleObjective).toContain("Credential role token: unresolved");
    expect(staleObjective).not.toContain("PRODUCT_GITHUB_TOKEN");
    expect(staleObjective).not.toContain("unresolved-p9-reference");
  }, 45_000);

  it("keeps verification explicit and the Browser surface free of credential and provider transports", async () => {
    const html = readFileSync(new URL("../../scripts/pathcode-cli/build/surface/public/index.html", import.meta.url), "utf8");
    const app = readFileSync(new URL("../../scripts/pathcode-cli/build/surface/public/app.js", import.meta.url), "utf8");
    const css = readFileSync(new URL("../../scripts/pathcode-cli/build/surface/public/app.css", import.meta.url), "utf8");
    expect(html).toContain("Manage integrations…");
    expect(html).toContain('id="integrationsDialog"');
    expect(app).toContain('"Verify"');
    expect(html).not.toContain("secretRef");
    expect(html).not.toMatch(/type=["']password["']/i);
    expect(app).toContain("/integrations/catalog");
    expect(app).toContain("/integrations/mutate");
    expect(app).toContain("/integrations/verify");
    expect(app).not.toContain("secretRef");
    expect(app).not.toMatch(/type=["']password["']/i);
    expect(app).not.toMatch(/\b(?:localStorage|sessionStorage)\b/);
    expect(app).not.toContain("api.github.com");
    expect(app).not.toContain("vercel.com");
    expect(css).toContain("integrations-dialog");
    expect(app).not.toMatch(/fetch\s*\(\s*["']https?:/i);
    const refreshFunction = app.slice(app.indexOf("async function refreshIntegrations"), app.indexOf("async function mutateIntegration"));
    expect(refreshFunction).not.toContain("/integrations/verify");
  });
});
