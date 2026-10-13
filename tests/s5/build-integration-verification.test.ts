import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  createBuildCoordinatorService, createBuildRecordSkeleton, readBuildEvents, readBuildRecord, writeBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";
const METHODS = { BUILD_ENVIRONMENT_MUTATE: "build.environments.mutate", BUILD_ENVIRONMENT_VERIFY_LOCAL: "build.environments.verifyLocal",
  BUILD_INTEGRATION_MUTATE: "build.integrations.mutate", BUILD_INTEGRATION_VERIFY: "build.integrations.verify" };

const dirs: string[] = [];
const services: Array<Awaited<ReturnType<typeof createBuildCoordinatorService>>> = [];
const temp = (prefix: string) => { const path = mkdtempSync(join(tmpdir(), prefix)); dirs.push(path); return path; };
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function setup(adapter?: { providerKey: "github"; adapterVersion: string; verify: (input: any) => Promise<any> }) {
  const root = temp("p12-2-");
  const runtimeRoot = join(root, "runtime");
  const projectRoot = join(root, "project");
  const git = (args: string[]) => spawnSync("git", args, { cwd: projectRoot, encoding: "utf8" });
  const { mkdirSync } = await import("node:fs"); mkdirSync(projectRoot);
  expect(git(["init", "-q"]).status).toBe(0);
  writeFileSync(join(projectRoot, ".gitignore"), ".env.local\n");
  const build = createBuildRecordSkeleton({ outcome: "P12 verification" });
  build.projectBindings.push({ bindingId: `binding-${build.buildId}`, projectRoot });
  build.loop.status = "paused";
  writeBuildRecord(runtimeRoot, build);
  const service = await createBuildCoordinatorService({ runtimeRoot, packageRoot: resolvePathPackageRoot(), fakeMode: true,
    ...(adapter ? { integrationVerificationAdapters: { github: adapter } } : {}) });
  await service.whenReady; services.push(service);
  const dispatch = (method: string, params: Record<string, unknown> = {}) => service.dispatch(method, params);
  const mutateP9 = (action: string, expectedEnvironmentRevision: number, input: Record<string, unknown>) =>
    dispatch(METHODS.BUILD_ENVIRONMENT_MUTATE,
      { buildId: build.buildId, action, expectedEnvironmentRevision, input });
  const environment = await mutateP9("create_environment", 0, { name: "development" });
  if (!environment.ok) throw new Error(environment.code);
  return { root, runtimeRoot, projectRoot, buildId: build.buildId, environmentId: environment.environmentId as string,
    dispatch, mutateP9, git };
}

async function makeLocalCredential(x: Awaited<ReturnType<typeof setup>>, value: string, verifyPresence = true) {
  const bound = await x.mutateP9("bind_secret", 1,
    { environmentId: x.environmentId, variableName: "INTEGRATION_TOKEN", backend: "local_env_file" });
  if (!bound.ok) throw new Error(bound.code);
  writeFileSync(join(x.projectRoot, ".env.local"), `INTEGRATION_TOKEN=${value}\n`);
  if (verifyPresence) {
    const verified = await x.dispatch(METHODS.BUILD_ENVIRONMENT_VERIFY_LOCAL, {
      buildId: x.buildId, environmentId: x.environmentId, variableName: "INTEGRATION_TOKEN", expectedEnvironmentRevision: 2,
    });
    if (!verified.ok) throw new Error(verified.code);
  }
  return { secretRef: bound.secretRef as string, environmentRevision: verifyPresence ? 3 : 2 };
}

async function makeIntegration(x: Awaited<ReturnType<typeof setup>>, secretRef?: string) {
  const created = await x.dispatch(METHODS.BUILD_INTEGRATION_MUTATE, { buildId: x.buildId,
    action: "create_integration", expectedIntegrationRevision: 0, input: { providerKey: "github", label: "Source" } });
  if (!created.ok) throw new Error(created.code);
  const binding = await x.dispatch(METHODS.BUILD_INTEGRATION_MUTATE, { buildId: x.buildId,
    action: "bind_environment", expectedIntegrationRevision: 1,
    input: { integrationId: created.integrationId, environmentId: x.environmentId } });
  if (!binding.ok) throw new Error(binding.code);
  let revision = 2;
  if (secretRef) {
    const credential = await x.dispatch(METHODS.BUILD_INTEGRATION_MUTATE, { buildId: x.buildId,
      action: "bind_credential", expectedIntegrationRevision: revision,
      input: { integrationId: created.integrationId, bindingId: binding.bindingId, role: "token", secretRef } });
    if (!credential.ok) throw new Error(credential.code);
    revision = credential.revision;
  }
  return { integrationId: created.integrationId as string, bindingId: binding.bindingId as string, revision: revision as number };
}

const verify = (x: Awaited<ReturnType<typeof setup>>, integration: { integrationId: string; bindingId: string; revision: number }, environmentRevision: number, extra = {}) =>
  x.dispatch(METHODS.BUILD_INTEGRATION_VERIFY, { buildId: x.buildId,
    integrationId: integration.integrationId, bindingId: integration.bindingId,
    expectedIntegrationRevision: integration.revision, expectedEnvironmentRevision: environmentRevision, ...extra });

describe("P12.2 credential bridge and verification boundary", () => {
  it("resolves only the exact P9 local secret, invokes one injected adapter, and persists only reduced safe facts", async () => {
    const sentinel = "P12_EPHEMERAL_GITHUB_TOKEN_SENTINEL";
    let calls = 0;
    let adapterInput: any;
    const x = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1", verify: async (input) => {
      calls++; adapterInput = input;
      return { ok: true, providerAccountRef: "account_synthetic_7", capabilities: ["repos.read"] };
    } });
    const { secretRef, environmentRevision } = await makeLocalCredential(x, sentinel);
    const integration = await makeIntegration(x, secretRef);
    const result = await verify(x, integration, environmentRevision);
    expect(result).toMatchObject({ ok: true, revision: 4, verification: { state: "ready",
      adapterVersion: "synthetic.github.identity.v1", providerAccountRef: "account_synthetic_7",
      capabilities: ["repos.read"], failureCode: null } });
    expect(calls).toBe(1);
    expect(Object.keys(adapterInput)).toEqual(["credentials"]);
    expect(Object.keys(adapterInput.credentials)).toEqual(["token"]);
    expect(adapterInput.credentials.token).toBe(sentinel);
    expect(readBuildRecord(x.runtimeRoot, x.buildId)?.environments?.revision).toBe(environmentRevision);
    expect(JSON.stringify({ result, record: readBuildRecord(x.runtimeRoot, x.buildId),
      events: readBuildEvents(x.runtimeRoot, x.buildId), list: await x.dispatch("build.integrations.list", { buildId: x.buildId }),
      read: await x.dispatch("build.integrations.read", { buildId: x.buildId, integrationId: integration.integrationId }) }))
      .not.toContain(sentinel);
    const events = readBuildEvents(x.runtimeRoot, x.buildId);
    const verificationEvents = events.filter((event: any) => event.type === "integration.verified");
    expect(verificationEvents).toHaveLength(1);
    const verificationEvent = verificationEvents[0];
    expect(verificationEvent).toBeTruthy();
    expect(JSON.stringify(verificationEvent)).not.toContain(secretRef);
    expect(JSON.stringify(verificationEvent)).not.toContain("account_synthetic_7");
  });

  it("rejects caller credential fields and stale/mismatched authority before invoking an adapter", async () => {
    let calls = 0;
    const x = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1",
      verify: async () => { calls++; return { ok: true, providerAccountRef: "acct", capabilities: [] }; } });
    const { secretRef, environmentRevision } = await makeLocalCredential(x, "opaque-token");
    const integration = await makeIntegration(x, secretRef);
    expect(await verify(x, integration, environmentRevision, { token: "forbidden" }))
      .toEqual({ ok: false, code: "INTEGRATION_VERIFICATION_INVALID" });
    expect(await verify(x, integration, environmentRevision, { verification: { state: "ready",
      adapterVersion: "synthetic.github.identity.v1", providerAccountRef: "forged", capabilities: [],
      verifiedAt: new Date().toISOString(), failureCode: null } }))
      .toEqual({ ok: false, code: "INTEGRATION_VERIFICATION_INVALID" });
    expect(await verify(x, integration, environmentRevision - 1)).toEqual({ ok: false, code: "INTEGRATION_ENVIRONMENT_STALE" });
    expect(await verify(x, { ...integration, revision: integration.revision - 1 }, environmentRevision))
      .toEqual({ ok: false, code: "INTEGRATION_REVISION_STALE" });
    expect(await x.dispatch(METHODS.BUILD_INTEGRATION_VERIFY, { buildId: "foreign-build",
      integrationId: integration.integrationId, bindingId: integration.bindingId,
      expectedIntegrationRevision: integration.revision, expectedEnvironmentRevision: environmentRevision }))
      .toMatchObject({ ok: false, code: "BUILD_NOT_FOUND" });
    expect(await x.dispatch(METHODS.BUILD_INTEGRATION_VERIFY, { buildId: x.buildId,
      integrationId: "00000000-0000-4000-8000-000000000001", bindingId: integration.bindingId,
      expectedIntegrationRevision: integration.revision, expectedEnvironmentRevision: environmentRevision }))
      .toMatchObject({ ok: false, code: "INTEGRATION_NOT_FOUND" });
    expect(await x.dispatch(METHODS.BUILD_INTEGRATION_VERIFY, { buildId: x.buildId,
      integrationId: integration.integrationId, bindingId: "00000000-0000-4000-8000-000000000099",
      expectedIntegrationRevision: integration.revision, expectedEnvironmentRevision: environmentRevision }))
      .toMatchObject({ ok: false, code: "INTEGRATION_BINDING_NOT_FOUND" });
    expect(calls).toBe(0);
  });

  it("writes action_required for a missing required token without calling the adapter", async () => {
    let calls = 0;
    const x = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1",
      verify: async () => { calls++; return { ok: true, providerAccountRef: "acct", capabilities: [] }; } });
    const integration = await makeIntegration(x);
    const result = await verify(x, integration, 1);
    expect(result).toMatchObject({ ok: true, revision: 3, verification: {
      state: "action_required", adapterVersion: null, providerAccountRef: null, capabilities: [], failureCode: "CREDENTIAL_REQUIRED",
    } });
    expect(calls).toBe(0);
  });

  it("requires P9 local credential admission and exact source names before adapter execution", async () => {
    let calls = 0;
    const x = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1",
      verify: async () => { calls++; return { ok: true, providerAccountRef: "acct", capabilities: [] }; } });
    const { secretRef, environmentRevision } = await makeLocalCredential(x, "opaque-token", false);
    const integration = await makeIntegration(x, secretRef);
    expect(await verify(x, integration, environmentRevision)).toMatchObject({ ok: true,
      verification: { state: "action_required", failureCode: "CREDENTIAL_NOT_READY" } });
    expect(calls).toBe(0);

    const y = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1",
      verify: async () => { calls++; return { ok: true, providerAccountRef: "acct", capabilities: [] }; } });
    const ready = await makeLocalCredential(y, "opaque-token");
    const integrationY = await makeIntegration(y, ready.secretRef);
    await y.mutateP9("set_config", ready.environmentRevision, { environmentId: y.environmentId,
      variableName: "FEATURE_FLAG", value: "CONFIG_ONLY_SENTINEL" });
    writeFileSync(join(y.projectRoot, ".env.local"), "INTEGRATION_TOKEN=opaque-token\nFEATURE_FLAG=CONFIG_ONLY_SENTINEL\n");
    const rejected = await verify(y, integrationY, ready.environmentRevision + 1);
    expect(rejected).toMatchObject({ ok: true, verification: { state: "action_required", failureCode: "CREDENTIAL_SOURCE_UNSAFE" } });
    expect(calls).toBe(0);
    expect(JSON.stringify(rejected)).not.toContain("CONFIG_ONLY_SENTINEL");
  });

  it("rejects a P9 local secret outside this P12 binding while admitting the exact bound credential", async () => {
    const valueA = "P12_BOUND_CREDENTIAL_A_SENTINEL";
    const valueB = "P12_UNBOUND_CREDENTIAL_B_VALUE_SENTINEL";
    let calls = 0;
    const x = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1", verify: async ({ credentials }) => {
      calls++;
      expect(credentials.token).toBe(valueA);
      return { ok: true, providerAccountRef: "account_synthetic", capabilities: ["repos.read"] };
    } });
    const credentialA = await makeLocalCredential(x, valueA);
    const credentialB = await x.mutateP9("bind_secret", credentialA.environmentRevision, {
      environmentId: x.environmentId, variableName: "SECONDARY_LOCAL_SECRET", backend: "local_env_file",
    });
    expect(credentialB).toMatchObject({ ok: true, revision: credentialA.environmentRevision + 1 });
    writeFileSync(join(x.projectRoot, ".env.local"),
      `INTEGRATION_TOKEN=${valueA}\nSECONDARY_LOCAL_SECRET=${valueB}\n`);
    const p9Ready = await x.dispatch(METHODS.BUILD_ENVIRONMENT_VERIFY_LOCAL, {
      buildId: x.buildId, environmentId: x.environmentId, variableName: "SECONDARY_LOCAL_SECRET",
      expectedEnvironmentRevision: credentialB.revision,
    });
    expect(p9Ready).toMatchObject({ ok: true, revision: credentialB.revision + 1 });
    const environmentRevision = p9Ready.revision as number;
    const integration = await makeIntegration(x, credentialA.secretRef as string);

    const rejected = await verify(x, integration, environmentRevision);
    expect(rejected).toMatchObject({ ok: true, verification: {
      state: "action_required", failureCode: "CREDENTIAL_SOURCE_UNSAFE",
    } });
    expect(rejected.verification.state).not.toBe("ready");
    expect(calls).toBe(0);
    const rejectedRecord = readBuildRecord(x.runtimeRoot, x.buildId);
    const rejectedEvents = readBuildEvents(x.runtimeRoot, x.buildId);
    const rejectedList = await x.dispatch("build.integrations.list", { buildId: x.buildId });
    const rejectedRead = await x.dispatch("build.integrations.read", { buildId: x.buildId, integrationId: integration.integrationId });
    const p12Projection = JSON.stringify({ rejected, integrations: rejectedRecord?.integrations, rejectedEvents,
      rejectedList, rejectedRead });
    expect(p12Projection).not.toContain(valueA);
    expect(p12Projection).not.toContain(valueB);
    expect(JSON.stringify({ rejectedRecord, rejectedEvents, rejected, rejectedList, rejectedRead }))
      .not.toContain(valueB);
    expect(JSON.stringify(rejected)).not.toContain("SECONDARY_LOCAL_SECRET");
    expect(JSON.stringify(rejectedEvents.filter((event: any) => event.type === "integration.verified")))
      .not.toContain("SECONDARY_LOCAL_SECRET");
    expect(rejectedRecord?.integrations?.items[0]?.bindings[0]?.verification.state).toBe("action_required");

    writeFileSync(join(x.projectRoot, ".env.local"), `INTEGRATION_TOKEN=${valueA}\n`);
    const accepted = await verify(x, { ...integration, revision: rejected.revision as number }, environmentRevision);
    expect(accepted).toMatchObject({ ok: true, verification: { state: "ready",
      adapterVersion: "synthetic.github.identity.v1", providerAccountRef: "account_synthetic" } });
    expect(calls).toBe(1);
  });

  it("keeps Vercel credential material unavailable and never invokes an adapter", async () => {
    let calls = 0;
    const x = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1",
      verify: async () => { calls++; return { ok: true, providerAccountRef: "acct", capabilities: [] }; } });
    const env = await x.mutateP9("bind_secret", 1,
      { environmentId: x.environmentId, variableName: "INTEGRATION_TOKEN", backend: "vercel_env" });
    const integration = await makeIntegration(x, env.secretRef as string);
    const result = await verify(x, integration, 2);
    expect(result).toMatchObject({ ok: true, revision: 4, verification: { state: "unavailable",
      adapterVersion: null, providerAccountRef: null, capabilities: [], failureCode: "CREDENTIAL_MATERIAL_UNAVAILABLE" } });
    expect(calls).toBe(0);
  });

  it("uses no default executable adapter and records adapter unavailable without reading local material", async () => {
    const x = await setup();
    const { secretRef, environmentRevision } = await makeLocalCredential(x, "opaque-token");
    const integration = await makeIntegration(x, secretRef);
    rmSync(join(x.projectRoot, ".env.local"));
    const result = await verify(x, integration, environmentRevision);
    expect(result).toMatchObject({ ok: true, verification: { state: "unavailable",
      adapterVersion: null, failureCode: "INTEGRATION_ADAPTER_UNAVAILABLE" } });
  });

  it.each([
    [{ ok: false, code: "PROVIDER_CREDENTIAL_REJECTED" }, "action_required", "PROVIDER_CREDENTIAL_REJECTED"],
    [{ ok: false, code: "PROVIDER_UNAVAILABLE" }, "unavailable", "PROVIDER_UNAVAILABLE"],
    [new Error("RAW_PROVIDER_SENTINEL"), "unavailable", "PROVIDER_UNAVAILABLE"],
    [{ ok: true, providerAccountRef: "acct", capabilities: [], raw: "RAW_PROVIDER_SENTINEL" }, "unavailable", "PROVIDER_RESPONSE_UNSAFE"],
  ] as const)("reduces provider failures without exposing payload or thrown text", async (output, state, code) => {
    let calls = 0;
    const x = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1", verify: async () => {
      calls++; if (output instanceof Error) throw output; return output;
    } });
    const { secretRef, environmentRevision } = await makeLocalCredential(x, "opaque-token");
    const integration = await makeIntegration(x, secretRef);
    const result = await verify(x, integration, environmentRevision);
    expect(result).toMatchObject({ ok: true, verification: { state, failureCode: code,
      adapterVersion: "synthetic.github.identity.v1", providerAccountRef: null, capabilities: [] } });
    expect(calls).toBe(1);
    expect(JSON.stringify({ result, record: readBuildRecord(x.runtimeRoot, x.buildId), events: readBuildEvents(x.runtimeRoot, x.buildId) }))
      .not.toContain("RAW_PROVIDER_SENTINEL");
  });

  it("discards a P12-stale result while allowing a concurrent P12 mutation during the adapter call", async () => {
    let begin!: () => void; let release!: () => void; let calls = 0;
    const started = new Promise<void>((resolve) => { begin = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const x = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1", verify: async () => {
      calls++; begin(); await held; return { ok: true, providerAccountRef: "acct", capabilities: [] };
    } });
    const { secretRef, environmentRevision } = await makeLocalCredential(x, "opaque-token");
    const integration = await makeIntegration(x, secretRef);
    const pending = verify(x, integration, environmentRevision);
    await started;
    const rename = await x.dispatch(METHODS.BUILD_INTEGRATION_MUTATE, { buildId: x.buildId,
      action: "rename_integration", expectedIntegrationRevision: integration.revision,
      input: { integrationId: integration.integrationId, label: "Renamed" } });
    expect(rename).toMatchObject({ ok: true, revision: integration.revision + 1 });
    release();
    expect(await pending).toEqual({ ok: false, code: "INTEGRATION_AUTHORITY_STALE" });
    expect(calls).toBe(1);
    expect(readBuildEvents(x.runtimeRoot, x.buildId).filter((event: any) => event.type === "integration.verified")).toHaveLength(0);
  });

  it("discards P9-stale results and detects local secret changes without retry", async () => {
    let begin!: () => void; let release!: () => void; let calls = 0;
    const started = new Promise<void>((resolve) => { begin = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const x = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1", verify: async () => {
      calls++; begin(); await held; return { ok: true, providerAccountRef: "acct", capabilities: [] };
    } });
    const { secretRef, environmentRevision } = await makeLocalCredential(x, "value-a");
    const integration = await makeIntegration(x, secretRef);
    const pending = verify(x, integration, environmentRevision);
    await started;
    expect(await x.mutateP9("set_config", environmentRevision, { environmentId: x.environmentId,
      variableName: "FEATURE_FLAG", value: "on" })).toMatchObject({ ok: true, revision: environmentRevision + 1 });
    release();
    expect(await pending).toEqual({ ok: false, code: "INTEGRATION_ENVIRONMENT_STALE" });
    expect(calls).toBe(1);

    let begin2!: () => void; let release2!: () => void; const started2 = new Promise<void>((resolve) => { begin2 = resolve; });
    const held2 = new Promise<void>((resolve) => { release2 = resolve; });
    const y = await setup({ providerKey: "github", adapterVersion: "synthetic.github.identity.v1", verify: async () => {
      calls++; begin2(); await held2; return { ok: true, providerAccountRef: "acct", capabilities: [] };
    } });
    const local = await makeLocalCredential(y, "value-a"); const iy = await makeIntegration(y, local.secretRef);
    const pending2 = verify(y, iy, local.environmentRevision); await started2;
    writeFileSync(join(y.projectRoot, ".env.local"), "INTEGRATION_TOKEN=value-b\n");
    release2();
    expect(await pending2).toEqual({ ok: false, code: "INTEGRATION_CREDENTIAL_CHANGED" });
    expect(calls).toBe(2);
    expect(readBuildRecord(y.runtimeRoot, y.buildId)?.integrations?.items[0]?.bindings[0]?.verification.state).toBe("unverified");
  });

  it("supports only the explicit verify protocol and keeps adapters outside PATH network code", () => {
    expect(METHODS.BUILD_INTEGRATION_VERIFY).toBe("build.integrations.verify");
    const source = readFileSync(new URL("../../scripts/pathcode-cli/build/integration-verification.mjs", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["']node:(?:http|https)|\bfetch\s*\(/);
    expect(source).not.toContain("api.github.com");
  });
});
