import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createBuildCoordinatorService, createBuildRecordSkeleton, readBuildEvents, readBuildRecord, writeBuildRecord } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const dirs: string[] = [];
const services: any[] = [];
const temp = (prefix: string) => { const p = mkdtempSync(join(tmpdir(), prefix)); dirs.push(p); return p; };
afterEach(async () => { for (const s of services.splice(0)) await s.close(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function setup(adapters: any = {}) {
  const root = temp("p13-2-verify-"); const runtimeRoot = join(root, "runtime"); const projectRoot = join(root, "project");
  mkdirSync(projectRoot); const git = (args: string[]) => spawnSync("git", args, { cwd: projectRoot, encoding: "utf8" });
  expect(git(["init", "-q"]).status).toBe(0); writeFileSync(join(projectRoot, ".gitignore"), ".env.local\n");
  const build = createBuildRecordSkeleton({ outcome: "Synthetic P13.2" });
  build.projectBindings.push({ bindingId: `binding-${build.buildId}`, projectRoot }); build.loop.status = "paused";
  writeBuildRecord(runtimeRoot, build);
  const service = await createBuildCoordinatorService({ runtimeRoot, packageRoot: resolvePathPackageRoot(), fakeMode: true,
    databaseVerificationAdapters: adapters }); await service.whenReady; services.push(service);
  const call = (method: string, params: any = {}) => service.dispatch(method, { buildId: build.buildId, ...params });
  const p9 = (action: string, revision: number, input: any) => call("build.environments.mutate", {
    action, expectedEnvironmentRevision: revision, input });
  const env = await p9("create_environment", 0, { name: "development" });
  const variableName = "P13_CREDENTIAL";
  const syntheticCredential = "SYNTHETIC_P13_CREDENTIAL_SENTINEL";
  const bound = await p9("bind_secret", 1, { environmentId: env.environmentId, variableName, backend: "local_env_file" });
  const refs = { MANAGEMENT_TOKEN: bound.secretRef as string, DATABASE_URL: bound.secretRef as string };
  writeFileSync(join(projectRoot, ".env.local"), `${variableName}=${syntheticCredential}\n`);
  const verified = await call("build.environments.verifyLocal", { environmentId: env.environmentId, variableName,
    expectedEnvironmentRevision: 2 });
  expect(verified.ok).toBe(true);
  const envRevision = 3;
  const created = await call("build.databases.mutate", { action: "create_database", expectedDatabaseRevision: 0,
    input: { provider: "supabase", label: "Synthetic DB", environmentId: env.environmentId, source: "existing" } });
  const targeted = await call("build.databases.mutate", { action: "set_provider_target", expectedDatabaseRevision: 1,
    input: { databaseId: created.databaseId, organizationSlug: null, projectRef: "project-ref-123", region: null } });
  const management = await call("build.databases.mutate", { action: "bind_management_credential", expectedDatabaseRevision: 2,
    input: { databaseId: created.databaseId, secretRef: refs.MANAGEMENT_TOKEN } });
  const url = await call("build.databases.mutate", { action: "bind_database_url", expectedDatabaseRevision: 3,
    input: { databaseId: created.databaseId, secretRef: refs.DATABASE_URL } });
  expect([created.ok, targeted.ok, management.ok, url.ok]).toEqual([true, true, true, true]);
  return { root, runtimeRoot, projectRoot, buildId: build.buildId, environmentId: env.environmentId,
    databaseId: created.databaseId, call, p9, envRevision, refs, databaseRevision: url.revision };
}

describe("P13.2 database credential and observation boundary", () => {
  it("runs provider and connection adapters once, outside lock, and persists only safe observations", async () => {
    let release!: (value: any) => void; let entered!: () => void; const began = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise((resolve) => { release = resolve; }); const calls: string[] = [];
    const adapters = { supabase: {
      provider: { provider: "supabase", adapterVersion: "synthetic.management.v1", verify: async (input: any) => {
        calls.push("provider"); expect(input).toEqual({ credential: "SYNTHETIC_P13_CREDENTIAL_SENTINEL", projectRef: "project-ref-123" });
        entered(); return held;
      } },
      connection: { provider: "supabase", adapterVersion: "synthetic.postgres.v1", verify: async (input: any) => {
        calls.push("connection"); expect(input.databaseUrl).toBe("SYNTHETIC_P13_CREDENTIAL_SENTINEL");
        return { ok: true, serverVersion: "PostgreSQL synthetic" };
      } },
    } };
    const x = await setup(adapters);
    const providerPromise = x.call("build.databases.verifyProvider", { databaseId: x.databaseId,
      expectedDatabaseRevision: x.databaseRevision, expectedEnvironmentRevision: x.envRevision });
    await began;
    const concurrentlyRead = await x.call("build.databases.list");
    expect(concurrentlyRead.ok).toBe(true);
    release({ ok: true, projectRef: "project-ref-123", organizationSlug: "synthetic-team", region: "eu-north-1", projectStatus: "ACTIVE_HEALTHY" });
    const provider = await providerPromise;
    expect(provider).toMatchObject({ ok: true, revision: x.databaseRevision + 1,
      providerObservation: { state: "ready", projectStatus: "ACTIVE_HEALTHY", failureCode: null },
      providerTarget: { organizationSlug: "synthetic-team", region: "eu-north-1" } });
    const connection = await x.call("build.databases.verifyConnection", { databaseId: x.databaseId,
      expectedDatabaseRevision: provider.revision, expectedEnvironmentRevision: x.envRevision });
    expect(connection).toMatchObject({ ok: true, revision: provider.revision + 1,
      connectionObservation: { state: "ready", adapterVersion: "synthetic.postgres.v1", serverVersion: "PostgreSQL synthetic", failureCode: null } });
    expect(calls).toEqual(["provider", "connection"]);
    const record = readBuildRecord(x.runtimeRoot, x.buildId)!; const events = readBuildEvents(x.runtimeRoot, x.buildId);
    const safe = JSON.stringify({ record, provider, connection, events });
    expect(safe).not.toContain("SYNTHETIC_P13_CREDENTIAL_SENTINEL");
    const eventJson = JSON.stringify(events);
    const responseJson = JSON.stringify({ provider, connection });
    for (const secretRef of [x.refs.MANAGEMENT_TOKEN, x.refs.DATABASE_URL]) {
      expect(eventJson).not.toContain(secretRef);
      expect(responseJson).not.toContain(secretRef);
    }
    expect(events.filter((e: any) => e.type?.startsWith("database.")).map((e: any) => e.type)).toContain("database.provider_verified");
    expect(events.some((e: any) => e.type === "database.connection_verified")).toBe(true);
  });

  it("does not resolve or invoke an absent adapter and records bounded unavailable state", async () => {
    const x = await setup({});
    unlinkSync(join(x.projectRoot, ".env.local"));
    const result = await x.call("build.databases.verifyProvider", { databaseId: x.databaseId,
      expectedDatabaseRevision: x.databaseRevision, expectedEnvironmentRevision: x.envRevision });
    expect(result).toMatchObject({ ok: true, providerObservation: { state: "unavailable", failureCode: "DATABASE_PROVIDER_ADAPTER_UNAVAILABLE" } });
  });

  it("requires project and credential identities before provider execution", async () => {
    let calls = 0;
    const x = await setup({ supabase: { provider: { provider: "supabase", adapterVersion: "synthetic.management.v1",
      verify: async () => { calls++; return { ok: false, state: "unavailable", code: "DATABASE_PROVIDER_UNAVAILABLE" }; } } } });
    const record = readBuildRecord(x.runtimeRoot, x.buildId)!;
    record.databases!.items[0]!.providerTarget.projectRef = null;
    writeBuildRecord(x.runtimeRoot, record);
    const noProject = await x.call("build.databases.verifyProvider", { databaseId: x.databaseId,
      expectedDatabaseRevision: x.databaseRevision, expectedEnvironmentRevision: x.envRevision });
    expect(noProject).toMatchObject({ ok: true, providerObservation: { state: "action_required", failureCode: "DATABASE_PROJECT_REF_REQUIRED" } });
    expect(calls).toBe(0);
    const target = await x.call("build.databases.mutate", { action: "set_provider_target", expectedDatabaseRevision: noProject.revision,
      input: { databaseId: x.databaseId, organizationSlug: null, projectRef: "project-ref-123", region: null } });
    const unbound = await x.call("build.databases.mutate", { action: "unbind_management_credential", expectedDatabaseRevision: target.revision,
      input: { databaseId: x.databaseId } });
    expect([target.ok, unbound.ok]).toEqual([true, true]);
    const noCredential = await x.call("build.databases.verifyProvider", { databaseId: x.databaseId,
      expectedDatabaseRevision: unbound.revision, expectedEnvironmentRevision: x.envRevision });
    expect(noCredential).toMatchObject({ ok: true, providerObservation: { state: "action_required", failureCode: "DATABASE_CREDENTIAL_REQUIRED" } });
    expect(calls).toBe(0);
  });

  it("does not resolve or invoke an adapter for Vercel-backed management credentials", async () => {
    let calls = 0;
    const x = await setup({ supabase: { provider: { provider: "supabase", adapterVersion: "synthetic.management.v1",
      verify: async () => { calls++; return { ok: true, projectRef: "project-ref-123", organizationSlug: null, region: null, projectStatus: null }; } } } });
    const unbound = await x.call("build.databases.mutate", { action: "unbind_management_credential",
      expectedDatabaseRevision: x.databaseRevision, input: { databaseId: x.databaseId } });
    const removed = await x.p9("unbind_secret", x.envRevision, { environmentId: x.environmentId, variableName: "P13_CREDENTIAL" });
    const external = await x.p9("bind_secret", x.envRevision + 1,
      { environmentId: x.environmentId, variableName: "SUPABASE_MANAGEMENT", backend: "vercel_env" });
    const rebound = await x.call("build.databases.mutate", { action: "bind_management_credential",
      expectedDatabaseRevision: unbound.revision, input: { databaseId: x.databaseId, secretRef: external.secretRef } });
    expect([unbound.ok, removed.ok, external.ok, rebound.ok]).toEqual([true, true, true, true]);
    const result = await x.call("build.databases.verifyProvider", { databaseId: x.databaseId,
      expectedDatabaseRevision: rebound.revision, expectedEnvironmentRevision: external.revision });
    expect(result).toMatchObject({ ok: true, providerObservation: { state: "unavailable",
      failureCode: "DATABASE_CREDENTIAL_MATERIAL_UNAVAILABLE" } });
    expect(calls).toBe(0);
  });

  it("reduces bounded provider failures and connection failures to their separate canonical planes", async () => {
    const adapters = { supabase: {
      provider: { provider: "supabase", adapterVersion: "synthetic.management.v1",
        verify: async () => ({ ok: false, state: "action_required", code: "DATABASE_PROVIDER_PERMISSION_REQUIRED" }) },
      connection: { provider: "supabase", adapterVersion: "synthetic.postgres.v1",
        verify: async () => ({ ok: false, state: "unavailable", code: "DATABASE_CONNECTION_UNAVAILABLE" }) },
    } };
    const x = await setup(adapters);
    const provider = await x.call("build.databases.verifyProvider", { databaseId: x.databaseId,
      expectedDatabaseRevision: x.databaseRevision, expectedEnvironmentRevision: x.envRevision });
    expect(provider).toMatchObject({ ok: true, providerObservation: { state: "action_required",
      failureCode: "DATABASE_PROVIDER_PERMISSION_REQUIRED", projectStatus: null } });
    const connection = await x.call("build.databases.verifyConnection", { databaseId: x.databaseId,
      expectedDatabaseRevision: provider.revision, expectedEnvironmentRevision: x.envRevision });
    expect(connection).toMatchObject({ ok: true, connectionObservation: { state: "unavailable",
      adapterVersion: "synthetic.postgres.v1", failureCode: "DATABASE_CONNECTION_UNAVAILABLE", serverVersion: null } });
  });

  it("admits only the exact P13-bound local credential and maps unrelated assignments safely", async () => {
    let calls = 0;
    const x = await setup({ supabase: { provider: { provider: "supabase", adapterVersion: "synthetic.management.v1",
      verify: async () => { calls++; return { ok: true, projectRef: "project-ref-123", organizationSlug: null, region: null, projectStatus: null }; } } } });
    writeFileSync(join(x.projectRoot, ".env.local"), "P13_CREDENTIAL=SYNTHETIC_P13_CREDENTIAL_SENTINEL\nUNBOUND_LOCAL_SECRET=must-not-enter\n");
    const result = await x.call("build.databases.verifyProvider", { databaseId: x.databaseId,
      expectedDatabaseRevision: x.databaseRevision, expectedEnvironmentRevision: x.envRevision });
    expect(result).toMatchObject({ ok: true, providerObservation: { state: "action_required", failureCode: "DATABASE_CREDENTIAL_SOURCE_UNSAFE" } });
    expect(calls).toBe(0);
    expect(JSON.stringify(result)).not.toContain("UNBOUND_LOCAL_SECRET");
    expect(JSON.stringify(readBuildEvents(x.runtimeRoot, x.buildId))).not.toContain("must-not-enter");
  });

  it("blocks pending restore before credential resolution or adapter execution", async () => {
    let calls = 0;
    const x = await setup({ supabase: { provider: { provider: "supabase", adapterVersion: "synthetic.management.v1",
      verify: async () => { calls++; return { ok: true, projectRef: "project-ref-123", organizationSlug: null, region: null, projectStatus: null }; } } } });
    const record = readBuildRecord(x.runtimeRoot, x.buildId)!; record.pendingRestore = { pending: true } as any; writeBuildRecord(x.runtimeRoot, record);
    const result = await x.call("build.databases.verifyProvider", { databaseId: x.databaseId,
      expectedDatabaseRevision: x.databaseRevision, expectedEnvironmentRevision: x.envRevision });
    expect(result).toEqual({ ok: false, code: "RESTORE_PENDING" }); expect(calls).toBe(0);
  });

  it("detects P13 authority, P9 revision, and local credential races without retry or write", async () => {
    for (const race of ["credential", "p13", "p9"] as const) {
      let release!: (value: any) => void; let entered!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; }); const held = new Promise((resolve) => { release = resolve; });
      let calls = 0;
      const adapters = { supabase: { provider: { provider: "supabase", adapterVersion: "synthetic.management.v1",
        verify: async () => { calls++; entered(); return held; } } } };
      const x = await setup(adapters); const before = readBuildRecord(x.runtimeRoot, x.buildId)!.databases!.items[0]!.providerObservation;
      const pending = x.call("build.databases.verifyProvider", { databaseId: x.databaseId,
        expectedDatabaseRevision: x.databaseRevision, expectedEnvironmentRevision: x.envRevision }); await started;
      if (race === "credential") writeFileSync(join(x.projectRoot, ".env.local"), "P13_CREDENTIAL=CHANGED_SYNTHETIC_VALUE\n");
      if (race === "p13") {
        const changed = await x.call("build.databases.mutate", { action: "rename_database", expectedDatabaseRevision: x.databaseRevision,
          input: { databaseId: x.databaseId, label: "Renamed during verification" } });
        expect(changed.ok).toBe(true);
      }
      if (race === "p9") {
        const changed = await x.p9("bind_secret", x.envRevision, { environmentId: x.environmentId,
          variableName: "OTHER_SECRET", backend: "vercel_env" });
        expect(changed.ok).toBe(true);
      }
      release({ ok: true, projectRef: "project-ref-123", organizationSlug: null, region: null, projectStatus: null });
      const result = await pending;
      if (race === "credential") expect(result.code).toBe("DATABASE_CREDENTIAL_CHANGED");
      else if (race === "p13") expect(result.code).toBe("DATABASE_AUTHORITY_STALE");
      else expect(result.code).toBe("DATABASE_ENVIRONMENT_STALE");
      expect(calls).toBe(1);
      const after = readBuildRecord(x.runtimeRoot, x.buildId)!.databases!.items[0]!.providerObservation;
      expect(after).toEqual(before);
    }
  });

  it.each(["credential", "p13", "p9", "binding"] as const)(
    "discards an in-flight connection observation when %s authority changes without retry",
    async (race) => {
      let release!: (value: any) => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const held = new Promise((resolve) => { release = resolve; });
      let adapterCalls = 0;
      const adapters = { supabase: { connection: { provider: "supabase", adapterVersion: "synthetic.postgres.v1",
        verify: async (input: any) => {
          adapterCalls++;
          expect(input.projectRef).toBe("project-ref-123");
          expect(typeof input.databaseUrl).toBe("string");
          entered();
          return held;
        } } } };
      const x = await setup(adapters);
      const beforeRecord = readBuildRecord(x.runtimeRoot, x.buildId)!;
      const beforeObservation = structuredClone(beforeRecord.databases!.items[0]!.connectionObservation);
      const beforeConnectionEvents = readBuildEvents(x.runtimeRoot, x.buildId)
        .filter((event: any) => event.type === "database.connection_verified").length;
      const pending = x.call("build.databases.verifyConnection", { databaseId: x.databaseId,
        expectedDatabaseRevision: x.databaseRevision, expectedEnvironmentRevision: x.envRevision });
      await started;

      if (race === "credential") {
        writeFileSync(join(x.projectRoot, ".env.local"), "P13_CREDENTIAL=CHANGED_SYNTHETIC_VALUE\n");
      } else if (race === "p13") {
        const changed = await x.call("build.databases.mutate", { action: "rename_database",
          expectedDatabaseRevision: x.databaseRevision,
          input: { databaseId: x.databaseId, label: "Renamed during connection verification" } });
        expect(changed.ok).toBe(true);
      } else if (race === "p9") {
        const changed = await x.p9("bind_secret", x.envRevision, { environmentId: x.environmentId,
          variableName: "OTHER_CONNECTION_SECRET", backend: "vercel_env" });
        expect(changed.ok).toBe(true);
      } else {
        const unbound = await x.p9("unbind_secret", x.envRevision, { environmentId: x.environmentId,
          variableName: "P13_CREDENTIAL" });
        expect(unbound.ok).toBe(true);
        const rebound = await x.p9("bind_secret", unbound.revision, { environmentId: x.environmentId,
          variableName: "P13_CREDENTIAL", backend: "local_env_file" });
        expect(rebound.ok).toBe(true);
        expect(rebound.secretRef).not.toBe(x.refs.DATABASE_URL);
      }

      release({ ok: true, serverVersion: "PostgreSQL synthetic" });
      const result = await pending;
      const expectedCode = race === "credential" ? "DATABASE_CREDENTIAL_CHANGED" :
        race === "p13" ? "DATABASE_AUTHORITY_STALE" : "DATABASE_ENVIRONMENT_STALE";
      expect(result).toMatchObject({ ok: false, code: expectedCode });
      // The held adapter is the only connection execution; stale results do not retry.
      expect(adapterCalls).toBe(1);
      const afterRecord = readBuildRecord(x.runtimeRoot, x.buildId)!;
      expect(afterRecord.databases!.items[0]!.connectionObservation).toEqual(beforeObservation);
      const events = readBuildEvents(x.runtimeRoot, x.buildId);
      expect(events.filter((event: any) => event.type === "database.connection_verified")).toHaveLength(beforeConnectionEvents);
    },
  );
});
