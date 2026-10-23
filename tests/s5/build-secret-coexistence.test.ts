import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildCoordinatorService, createBuildRecordSkeleton, readBuildEvents, readBuildRecord, writeBuildRecord } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";
// @ts-expect-error The focused .mjs helper is exercised directly as runtime code.
import { verifiedSafeLocalSecretNames } from "../../scripts/pathcode-cli/build/runtime/local-env-coexistence.mjs";

// Every operation below reads only its own exact names; other verified-safe
// local bindings of the same environment may merely coexist in .env.local.
const NAMES = ["MANAGEMENT_TOKEN", "PROVISION_PASSWORD", "DATABASE_URL", "GH_INTEGRATION_CRED", "STRIPE_VERIFY_CRED", "SIBLING_A", "SIBLING_B"];
const value = (name: string) => `SENTINEL_VALUE_${name}`;
const envFile = (names: string[]) => names.map((n) => `${n}=${value(n)}\n`).join("");
const leaks = (input: unknown, allowed: string[]) =>
  NAMES.filter((n) => !allowed.includes(n) && JSON.stringify(input).includes(value(n)));

const dirs: string[] = []; const services: any[] = [];
afterEach(async () => { for (const s of services.splice(0)) await s.close(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function world() {
  const root = mkdtempSync(join(tmpdir(), "path-coexist-")); dirs.push(root);
  const project = join(root, "project"); mkdirSync(join(project, "supabase", "migrations"), { recursive: true });
  const git = (...a: string[]) => execFileSync("git", a, { cwd: project, encoding: "utf8" }).trim();
  git("init", "-q"); writeFileSync(join(project, ".gitignore"), ".env.local\n");
  writeFileSync(join(project, "supabase", "migrations", "20260101000000_init.sql"), "select 1;\n");
  git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "init");
  const sha = git("rev-parse", "HEAD");
  const record = createBuildRecordSkeleton({ outcome: "coexistence" }); record.projectBindings.push({ bindingId: "b", projectRoot: project });
  record.loop.status = "paused"; record.authoritativeSha = sha; writeBuildRecord(root, record);
  const calls: Record<string, any[]> = { regions: [], create: [], list: [], health: [], provider: [], connection: [], migrations: [], github: [], stripe: [] };
  const integration = (key: string) => ({ providerKey: key, adapterVersion: `synthetic.${key}.v1`,
    verify: async (input: any) => { calls[key]!.push(input); return { ok: true, providerAccountRef: `acct_${key}`,
      capabilities: key === "stripe" ? ["stripe.account.read", "stripe.mode.test"] : ["repos.read"] }; } });
  const service = await (createBuildCoordinatorService as any)({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
    databaseOperationAdapters: { supabase: {
      availableRegions: async (i: any) => { calls.regions!.push(i); return { ok: true, regions: [] }; },
      createProject: async (i: any) => { calls.create!.push(i); return { ok: true, projectRef: "projectref1", projectName: i.name,
        organizationSlug: i.organizationSlug, region: i.region, projectStatus: "COMING_UP" }; },
      listProjects: async (i: any) => { calls.list!.push(i); return { ok: true, matches: [], truncated: false }; },
      health: async (i: any) => { calls.health!.push(i); return { ok: true, projectStatus: "ACTIVE_HEALTHY" }; },
      migrations: { observe: async (i: any) => { calls.migrations!.push(i); return { ok: true, versions: [] }; } } } },
    databaseVerificationAdapters: { supabase: {
      provider: { provider: "supabase", adapterVersion: "synthetic.management.v1", verify: async (i: any) => { calls.provider!.push(i);
        return { ok: true, projectRef: "projectref1", organizationSlug: "org-1", region: "eu-north-1", projectStatus: "ACTIVE_HEALTHY" }; } },
      connection: { provider: "supabase", adapterVersion: "synthetic.postgres.v1", verify: async (i: any) => { calls.connection!.push(i);
        return { ok: true, serverVersion: "PostgreSQL synthetic" }; } } } },
    integrationVerificationAdapters: { github: integration("github"), stripe: integration("stripe") } });
  services.push(service); await service.whenReady;
  const call = (method: string, p: any = {}) => service.dispatch("build." + method, { buildId: record.buildId, ...p });
  const envRev = async () => (await call("environments.list")).revision;
  const bind = async (variableName: string) => (await call("environments.mutate", { action: "bind_secret", expectedEnvironmentRevision: await envRev(),
    input: { environmentId, variableName, backend: "local_env_file" } }));
  const verifyLocal = async (variableName: string) => call("environments.verifyLocal", { environmentId, variableName, expectedEnvironmentRevision: await envRev() });
  const env = await call("environments.mutate", { action: "create_environment", expectedEnvironmentRevision: 0, input: { name: "dev" } });
  const environmentId = env.environmentId as string;
  writeFileSync(join(project, ".env.local"), envFile(NAMES));
  const refs: Record<string, string> = {};
  for (const n of NAMES) { const b = await bind(n); if (!b.ok) throw new Error(n + " " + JSON.stringify(b)); refs[n] = b.secretRef; }
  for (const n of NAMES) { const v = await verifyLocal(n); if (!v.ok) throw new Error(n + " " + JSON.stringify(v)); }
  const made = await call("databases.mutate", { action: "create_database", expectedDatabaseRevision: 0,
    input: { provider: "supabase", label: "Coexist DB", environmentId, source: "path_provisioned" } });
  await call("databases.mutate", { action: "bind_management_credential", expectedDatabaseRevision: made.revision,
    input: { databaseId: made.databaseId, secretRef: refs.MANAGEMENT_TOKEN } });
  const rv = async () => ({ db: (await call("databases.list")).revision, env: await envRev() });
  const databaseId = made.databaseId as string;
  const ops = {
    regions: async () => { const r = await rv(); return call("databases.availableRegions", { databaseId, organizationSlug: "org-1",
      expectedDatabaseRevision: r.db, expectedEnvironmentRevision: r.env }); },
    verifyProvider: async () => { const r = await rv(); return call("databases.verifyProvider", { databaseId,
      expectedDatabaseRevision: r.db, expectedEnvironmentRevision: r.env }); },
    verifyConnection: async () => { const r = await rv(); return call("databases.verifyConnection", { databaseId,
      expectedDatabaseRevision: r.db, expectedEnvironmentRevision: r.env }); },
    migrations: async () => { const r = await rv(); return call("databases.observeMigrations", { databaseId,
      expectedDatabaseRevision: r.db, expectedEnvironmentRevision: r.env, expectedAuthoritativeSha: sha }); },
    integration: async (key: string) => { const l = await call("integrations.list"); const item = l.items.find((i: any) => i.providerKey === key);
      return call("integrations.verify", { integrationId: item.integrationId, bindingId: item.bindings[0].bindingId,
        expectedIntegrationRevision: l.revision, expectedEnvironmentRevision: await envRev() }); },
    prepare: async () => { const r = await rv(); return call("databases.provisionPrepare", { databaseId, expectedDatabaseRevision: r.db,
      expectedEnvironmentRevision: r.env, organizationSlug: "org-1", region: "eu-north-1",
      provisionPasswordSecretRef: refs.PROVISION_PASSWORD, acknowledgeProviderBilling: true }); },
    execute: async (operationId: string) => { const r = await rv(); return call("databases.provisionExecute", { operationId,
      expectedDatabaseRevision: r.db, expectedEnvironmentRevision: r.env }); },
    observe: async (operationId: string) => { const r = await rv(); return call("databases.provisionObserve", { operationId,
      expectedDatabaseRevision: r.db, expectedEnvironmentRevision: r.env }); },
  };
  const addIntegration = async (key: string, role: string, secretRef: string) => {
    const created = await call("integrations.mutate", { action: "create_integration", expectedIntegrationRevision: (await call("integrations.list")).revision,
      input: { providerKey: key, label: key } });
    const binding = await call("integrations.mutate", { action: "bind_environment", expectedIntegrationRevision: created.revision,
      input: { integrationId: created.integrationId, environmentId } });
    const cred = await call("integrations.mutate", { action: "bind_credential", expectedIntegrationRevision: binding.revision,
      input: { integrationId: created.integrationId, bindingId: binding.bindingId, role, secretRef } });
    expect(cred.ok).toBe(true);
  };
  await addIntegration("github", "token", refs.GH_INTEGRATION_CRED!);
  await addIntegration("stripe", "secret_key", refs.STRIPE_VERIFY_CRED!);
  const total = () => Object.values(calls).reduce((n, v) => n + v.length, 0);
  const durable = async () => JSON.stringify({ record: readBuildRecord(root, record.buildId), events: readBuildEvents(root, record.buildId) });
  return { root, project, record, sha, call, calls, ops, refs, environmentId, databaseId, bind, verifyLocal, envRev, total, durable };
}
type World = Awaited<ReturnType<typeof world>>;

/** Drive the whole provisioning → verification → migration chain with every sibling present. */
async function happyChain(w: World) {
  const results: any[] = [];
  const regions = await w.ops.regions(); results.push(regions); expect(regions).toMatchObject({ ok: true });
  const prepared = await w.ops.prepare(); results.push(prepared); expect(prepared).toMatchObject({ ok: true, state: "prepared" });
  const executed = await w.ops.execute(prepared.operationId); results.push(executed); expect(executed).toMatchObject({ ok: true, state: "observed" });
  const observed = await w.ops.observe(prepared.operationId); results.push(observed); expect(observed).toMatchObject({ ok: true, state: "completed" });
  const list = await w.call("databases.list");
  const bound = await w.call("databases.mutate", { action: "bind_database_url", expectedDatabaseRevision: list.revision,
    input: { databaseId: w.databaseId, secretRef: w.refs.DATABASE_URL } }); expect(bound.ok).toBe(true);
  const provider = await w.ops.verifyProvider(); results.push(provider); expect(provider).toMatchObject({ ok: true, providerObservation: { state: "ready" } });
  const connection = await w.ops.verifyConnection(); results.push(connection); expect(connection).toMatchObject({ ok: true, connectionObservation: { state: "ready" } });
  const migrations = await w.ops.migrations(); results.push(migrations); expect(migrations).toMatchObject({ ok: true });
  for (const key of ["github", "stripe"]) { const r = await w.ops.integration(key); results.push(r); expect(r).toMatchObject({ ok: true, verification: { state: "ready" } }); }
  return results;
}

describe("shared coexistence helper", () => {
  it("returns only configured, verified-present, verified-safe local secret bindings", () => {
    const base = { kind: "secret", backend: "local_env_file", bindingState: "configured", presenceState: "verified_present", safetyState: "verified_safe" };
    expect(verifiedSafeLocalSecretNames([
      { ...base, variableName: "OK" }, { ...base, variableName: "VERCEL", backend: "vercel_env" },
      { ...base, variableName: "UNVERIFIED", presenceState: "unknown" }, { ...base, variableName: "MISSING", presenceState: "verified_missing" },
      { ...base, variableName: "UNSAFE", safetyState: "verified_unsafe" }, { ...base, variableName: "UNCONFIGURED", bindingState: "pending" },
      { kind: "config", variableName: "CONFIG" }]))
      .toEqual(["OK"]);
    expect(verifiedSafeLocalSecretNames(undefined)).toEqual([]);
  });
});

describe("multi-secret coexistence across operational credential consumers", () => {
  it("reaches every adapter with only its own credential while verified-safe siblings coexist, and persists no sibling value", async () => {
    const w = await world(); const results = await happyChain(w);
    const only = (input: unknown, names: string[]) => { expect(leaks(input, names)).toEqual([]); };
    expect(w.calls.regions).toHaveLength(1); expect(Object.keys(w.calls.regions![0]).sort()).toEqual(["credential", "organizationSlug"]);
    expect(w.calls.regions![0].credential).toBe(value("MANAGEMENT_TOKEN")); only(w.calls.regions, ["MANAGEMENT_TOKEN"]);
    expect(w.calls.create).toHaveLength(1); only(w.calls.create, ["MANAGEMENT_TOKEN", "PROVISION_PASSWORD"]);
    expect(JSON.stringify(w.calls.create)).toContain(value("MANAGEMENT_TOKEN")); expect(JSON.stringify(w.calls.create)).toContain(value("PROVISION_PASSWORD"));
    expect(w.calls.health).toHaveLength(1); only(w.calls.health, ["MANAGEMENT_TOKEN"]); expect(JSON.stringify(w.calls.health)).not.toContain(value("PROVISION_PASSWORD"));
    expect(w.calls.list).toHaveLength(0);
    expect(w.calls.provider).toEqual([{ credential: value("MANAGEMENT_TOKEN"), projectRef: "projectref1" }]);
    expect(w.calls.connection).toHaveLength(1); expect(w.calls.connection![0].databaseUrl).toBe(value("DATABASE_URL")); only(w.calls.connection, ["DATABASE_URL"]);
    expect(w.calls.migrations).toEqual([{ databaseUrl: value("DATABASE_URL"), projectRef: "projectref1" }]);
    expect(w.calls.github).toEqual([{ credentials: { token: value("GH_INTEGRATION_CRED") } }]);
    expect(w.calls.stripe).toEqual([{ credentials: { secret_key: value("STRIPE_VERIFY_CRED") } }]);
    // No secret value of any kind reaches the authority, the events or any response.
    expect(NAMES.filter((n) => (JSON.stringify(results) + "").includes(value(n)))).toEqual([]);
    const stored = await w.durable(); expect(NAMES.filter((n) => stored.includes(value(n)))).toEqual([]);
  });

  // prepare() makes the binding authority (needs no pending operation); apply() puts the
  // offending assignment into .env.local.
  type Variant = { prepare: (w: World) => Promise<void>; apply: (w: World) => void };
  const extraLine = (w: World, name: string) => writeFileSync(join(w.project, ".env.local"), envFile(NAMES) + `${name}=x\n`);
  const variants: Array<[string, Variant]> = [
    ["an extra unbound .env.local name", { prepare: async () => {}, apply: (w) => extraLine(w, "UNBOUND_EXTRA") }],
    ["an extra bound but unverified secret", { prepare: async (w) => { expect((await w.bind("UNVERIFIED_EXTRA")).ok).toBe(true); },
      apply: (w) => extraLine(w, "UNVERIFIED_EXTRA") }],
    ["an extra verified-unsafe secret", { prepare: async (w) => { expect((await w.bind("UNSAFE_EXTRA")).ok).toBe(true);
      extraLine(w, "UNSAFE_EXTRA"); writeFileSync(join(w.project, ".gitignore"), "");
      expect(await w.verifyLocal("UNSAFE_EXTRA")).toMatchObject({ ok: true, safetyState: "verified_unsafe" });
      writeFileSync(join(w.project, ".gitignore"), ".env.local\n"); writeFileSync(join(w.project, ".env.local"), envFile(NAMES)); },
      apply: (w) => extraLine(w, "UNSAFE_EXTRA") }],
  ];
  it.each(variants)("rejects %s before any provider call for repeatable operations", async (_label, variant) => {
    const w = await world(); await happyChain(w); await variant.prepare(w);
    const before = w.total(); variant.apply(w);
    const attempts = [w.ops.regions, w.ops.verifyProvider, w.ops.verifyConnection, w.ops.migrations,
      () => w.ops.integration("github"), () => w.ops.integration("stripe")];
    for (const attempt of attempts) { const r = await attempt();
      expect(r.ok === false || [r.providerObservation?.state, r.connectionObservation?.state, r.verification?.state, r.observation?.state].every((state) => state !== "ready")).toBe(true);
      expect(JSON.stringify(r)).not.toContain("SENTINEL_VALUE_"); }
    expect(w.total()).toBe(before);
  });
  it.each(variants)("rejects %s before provision execute or observe reach the provider", async (_label, variant) => {
    const w = await world(); await variant.prepare(w);
    const prepared = await w.ops.prepare(); expect(prepared.ok).toBe(true);
    variant.apply(w); expect(await w.ops.execute(prepared.operationId)).toMatchObject({ ok: false });
    expect(w.calls.create).toHaveLength(0);
    writeFileSync(join(w.project, ".env.local"), envFile(NAMES));
    expect(await w.ops.execute(prepared.operationId)).toMatchObject({ ok: true, state: "observed" });
    expect(w.calls.create).toHaveLength(1);
    variant.apply(w); expect(await w.ops.observe(prepared.operationId)).toMatchObject({ ok: false });
    expect(w.calls.health).toHaveLength(0); expect(w.calls.list).toHaveLength(0);
    writeFileSync(join(w.project, ".env.local"), envFile(NAMES));
    expect(await w.ops.observe(prepared.operationId)).toMatchObject({ ok: true, state: "completed" });
    expect(w.calls.health).toHaveLength(1);
  });

  it("fails closed when the required credential material is missing, before any adapter call", async () => {
    const w = await world(); await happyChain(w); const before = w.total();
    writeFileSync(join(w.project, ".env.local"), envFile(NAMES.filter((n) => n !== "MANAGEMENT_TOKEN" && n !== "DATABASE_URL" && n !== "GH_INTEGRATION_CRED" && n !== "STRIPE_VERIFY_CRED")));
    for (const attempt of [w.ops.regions, w.ops.verifyProvider, w.ops.verifyConnection, w.ops.migrations,
      () => w.ops.integration("github"), () => w.ops.integration("stripe")]) expect(JSON.stringify(await attempt())).not.toContain("SENTINEL_VALUE_");
    expect(w.total()).toBe(before);
  });
  it("still detects a required credential changing across the provider call", async () => {
    const w = await world(); await happyChain(w);
    let changed = 0; const w2 = w;
    for (const key of ["regions", "verifyProvider", "verifyConnection", "migrations"] as const) {
      const name = key === "verifyConnection" || key === "migrations" ? "DATABASE_URL" : "MANAGEMENT_TOKEN";
      const target = { regions: w.calls.regions, verifyProvider: w.calls.provider, verifyConnection: w.calls.connection, migrations: w.calls.migrations }[key]!;
      const original = target.push.bind(target);
      target.push = (...items: any[]) => { writeFileSync(join(w2.project, ".env.local"),
        envFile(NAMES).replace(value(name), value(name) + "_CHANGED")); changed++; return original(...items); };
      const result = await w.ops[key]();
      target.push = original; writeFileSync(join(w.project, ".env.local"), envFile(NAMES));
      expect(result).toMatchObject({ ok: false, code: "DATABASE_CREDENTIAL_CHANGED" });
    }
    expect(changed).toBe(4);
  });
  it("keeps the resolver strict for a name outside the revision-checked environment authority", async () => {
    const { resolveExactLocalEnvValues } = await import("../../scripts/pathcode-cli/build/runtime/local-env-resolve.mjs") as any;
    const w = await world(); writeFileSync(join(w.project, ".env.local"), envFile(NAMES) + "NOT_ALLOWED=x\n");
    expect(resolveExactLocalEnvValues({ projectRoot: w.project, exactNames: ["MANAGEMENT_TOKEN"], allowedNativeNames: NAMES }))
      .toMatchObject({ ok: false, code: "LOCAL_ENV_NATIVE_LOAD_UNSAFE" });
    expect(resolveExactLocalEnvValues({ projectRoot: w.project, exactNames: ["SIBLING_A"], allowedNativeNames: ["MANAGEMENT_TOKEN"] }))
      .toMatchObject({ ok: false, code: "SECRET_BINDING_INVALID" });
    expect(readFileSync(join(w.project, ".env.local"), "utf8")).toContain("NOT_ALLOWED");
  });
});
