import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createBuildCoordinatorService, createBuildRecordSkeleton, DATABASES_SCHEMA, emptyBuildDatabaseAuthority,
  listBuildDatabaseCatalog, listBuildDatabases, readBuildDatabase, prepareBuildDatabaseMutation,
  readBuildRecord, resolveBuildRecordPath, readBuildEvents, writeBuildRecord,
} from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const at = "2026-01-02T03:04:05.000Z";
const PENDING = {
  operationId: "10000000-0000-4000-8000-000000000001", kind: "provision", databaseId: "20000000-0000-4000-8000-000000000002",
  provider: "supabase", state: "prepared", expectedDatabaseRevision: 1,
  environmentId: "30000000-0000-4000-8000-000000000003", managementSecretRef: "management_ref",
  provisionPasswordSecretRef: "provision_password_ref", organizationSlug: "example-org", region: "eu-north-1",
  providerProjectName: "path-acceptance-db", createdAt: at, updatedAt: at, failureCode: null,
};

describe("P13.1 database authority", () => {
  let root = "";
  let service: Awaited<ReturnType<typeof createBuildCoordinatorService>> | null = null;
  const builds: string[] = [];
  let environmentCount = 0;
  afterEach(async () => {
    await service?.close(); service = null;
    if (root) rmSync(root, { recursive: true, force: true });
    root = ""; builds.length = 0; environmentCount = 0;
  });

  function setupBuild(label = "Build") {
    if (!root) root = mkdtempSync(join(tmpdir(), "path-p13-databases-"));
    const record = createBuildRecordSkeleton({ outcome: label });
    record.projectBindings.push({ bindingId: `binding-${record.buildId}`, projectRoot: join(root, record.buildId) });
    record.loop.status = "paused";
    writeBuildRecord(root, record); builds.push(record.buildId);
    return record.buildId;
  }
  async function coordinator(scopedBuildId?: string) {
    if (!service) {
      service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
        ...(scopedBuildId ? { scopedBuildId } : {}) });
      await service.whenReady;
    }
    return service;
  }
  async function environment(buildId: string, variableNames = ["MANAGEMENT_TOKEN", "DATABASE_URL", "CONFIG_VALUE"]) {
    const c = await coordinator();
    const listed = await c.dispatch("build.environments.list", { buildId });
    if (!listed.ok) throw new Error(listed.code);
    let revision = listed.revision;
    const created = await c.dispatch("build.environments.mutate", { buildId, action: "create_environment",
      expectedEnvironmentRevision: revision++, input: { name: `environment-${++environmentCount}` } });
    if (!created.ok) throw new Error(created.code);
    const refs: Record<string, string> = {};
    for (const name of variableNames) {
      const result = await c.dispatch("build.environments.mutate", { buildId, action: name === "CONFIG_VALUE" ? "set_config" : "bind_secret",
        expectedEnvironmentRevision: revision++, input: name === "CONFIG_VALUE"
          ? { environmentId: created.environmentId, variableName: name, value: "synthetic-config-value" }
          : { environmentId: created.environmentId, variableName: name, backend: "vercel_env" } });
      if (!result.ok) throw new Error(result.code);
      if (result.secretRef) refs[name] = result.secretRef;
    }
    return { environmentId: created.environmentId as string, revision, refs };
  }
  function mutate(buildId: string, action: "create_database" | "rename_database" | "delete_database" | "set_provider_target" |
    "bind_management_credential" | "unbind_management_credential" | "bind_database_url" | "unbind_database_url",
  revision: number, input: Record<string, unknown>) {
    const result = prepareBuildDatabaseMutation(root, buildId, { action, expectedDatabaseRevision: revision, input });
    if (result.ok) writeBuildRecord(root, result.record);
    return result;
  }
  function create(buildId: string, envId: string, label = "Application DB", source: "existing" | "path_provisioned" = "existing") {
    return mutate(buildId, "create_database", 0, { provider: "supabase", label, environmentId: envId, source });
  }
  function setObserved(record: any, databaseId: string) {
    const item = record.databases.items.find((row: any) => row.databaseId === databaseId);
    item.providerObservation = { state: "ready", projectStatus: "ACTIVE_HEALTHY", observedAt: at, failureCode: null };
    item.connectionObservation = { state: "ready", adapterVersion: "postgres.connection.v1", serverVersion: "PostgreSQL 17.2", observedAt: at, failureCode: null };
    item.migrationObservation = { state: "in_sync", sourceSha: "a".repeat(40), localDigest: "b".repeat(64), localCount: 2,
      localHeadVersion: "20260102030405", remoteCount: 2, remoteHeadVersion: "20260102030405", observedAt: at, failureCode: null };
  }

  it("reads deterministic legacy empty authority and a metadata-only Supabase catalog without writes", () => {
    const buildId = setupBuild(); const path = resolveBuildRecordPath(root, buildId);
    const before = readFileSync(path, "utf8");
    expect(emptyBuildDatabaseAuthority()).toEqual({ schema: DATABASES_SCHEMA, revision: 0, items: [], pendingOperation: null, operationHistory: [] });
    expect(listBuildDatabases(root, buildId)).toEqual({ ok: true, buildId, ...emptyBuildDatabaseAuthority() });
    expect(readBuildDatabase(root, buildId, "missing")).toEqual({ ok: false, code: "DATABASE_NOT_FOUND" });
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(readBuildRecord(root, buildId)?.databases).toBeUndefined();
    expect(listBuildDatabaseCatalog()).toEqual([{ provider: "supabase", displayName: "Supabase", engine: "postgres",
      credentialRoles: [{ role: "management_token", required: false }, { role: "database_url", required: false }] }]);
    expect(JSON.stringify(listBuildDatabaseCatalog())).not.toMatch(/https?:|endpoint|hostname|port/i);
  });

  it("creates existing and PATH-provisioned authority with exact initial observations and one revision per mutation", async () => {
    const buildId = setupBuild(); const env = await environment(buildId);
    expect(create(buildId, "foreign-environment")).toMatchObject({ ok: false, code: "DATABASE_ENVIRONMENT_NOT_FOUND" });
    expect(mutate(buildId, "create_database", 0, { provider: "postgres", label: "Bad", environmentId: env.environmentId, source: "existing" }))
      .toMatchObject({ ok: false, code: "DATABASE_PROVIDER_UNSUPPORTED" });
    expect(mutate(buildId, "create_database", 0, { provider: "supabase", engine: "postgres", label: "Bad", environmentId: env.environmentId, source: "existing" }))
      .toMatchObject({ ok: false, code: "DATABASE_MUTATION_INVALID" });
    const first = create(buildId, env.environmentId);
    expect(first).toMatchObject({ ok: true, revision: 1, provider: "supabase" });
    const second = mutate(buildId, "create_database", 1,
      { provider: "supabase", label: "Provisioned DB", environmentId: env.environmentId, source: "path_provisioned" });
    expect(second).toMatchObject({ ok: true, revision: 2 });
    const listed = listBuildDatabases(root, buildId);
    expect(listed).toMatchObject({ ok: true, revision: 2, items: [
      { provider: "supabase", engine: "postgres", source: "existing", providerTarget: { organizationSlug: null, projectRef: null, region: null },
        credentials: { managementSecretRef: null, databaseUrlSecretRef: null },
        providerObservation: { state: "unverified", projectStatus: null, observedAt: null, failureCode: null },
        connectionObservation: { state: "unverified", adapterVersion: null, serverVersion: null, observedAt: null, failureCode: null },
        migrationObservation: { state: "unknown", sourceSha: null, localDigest: null, localCount: 0, localHeadVersion: null, remoteCount: null, remoteHeadVersion: null, observedAt: null, failureCode: null } },
      { source: "path_provisioned" },
    ] });
    expect(readBuildRecord(root, buildId)?.databases).toEqual(listed.ok ? {
      schema: listed.schema, revision: listed.revision, items: listed.items, pendingOperation: null, operationHistory: [],
    } : null);
    expect(readBuildRecord(root, buildId)?.databases).toBeDefined();
  });

  it("enforces label safety, uniqueness, rename stability, explicit metadata-only delete acknowledgement", async () => {
    const buildId = setupBuild(); const env = await environment(buildId);
    const one = create(buildId, env.environmentId, "Primary DB"); if (!one.ok) throw new Error(one.code);
    expect(mutate(buildId, "create_database", 1, { provider: "supabase", label: "primary db", environmentId: env.environmentId, source: "existing" }))
      .toMatchObject({ ok: false, code: "DATABASE_LABEL_CONFLICT" });
    expect(mutate(buildId, "create_database", 1, { provider: "supabase", label: "Bearer fake-secret", environmentId: env.environmentId, source: "existing" }))
      .toMatchObject({ ok: false, code: "DATABASE_LABEL_INVALID" });
    const before = readBuildRecord(root, buildId)!; setObserved(before, one.databaseId); writeBuildRecord(root, before);
    const renamed = mutate(buildId, "rename_database", 1, { databaseId: one.databaseId, label: "Primary Store" });
    expect(renamed).toMatchObject({ ok: true, revision: 2 });
    expect(readBuildDatabase(root, buildId, one.databaseId)).toMatchObject({ ok: true, database: {
      label: "Primary Store", providerObservation: { state: "ready" }, connectionObservation: { state: "ready" }, migrationObservation: { state: "in_sync" },
    } });
    expect(mutate(buildId, "rename_database", 2, { databaseId: one.databaseId, label: "Primary Store" }))
      .toMatchObject({ ok: false, code: "DATABASE_UNCHANGED" });
    expect(mutate(buildId, "delete_database", 2, { databaseId: one.databaseId, acknowledgeExternalResourceRetained: false }))
      .toMatchObject({ ok: false, code: "DATABASE_EXTERNAL_RESOURCE_ACK_REQUIRED" });
    const p9Before = readBuildRecord(root, buildId)?.environments;
    expect(mutate(buildId, "delete_database", 2, { databaseId: one.databaseId, acknowledgeExternalResourceRetained: true }))
      .toMatchObject({ ok: true, revision: 3, providerResourceChanged: false, credentialMaterialChanged: false });
    expect(readBuildRecord(root, buildId)?.environments).toEqual(p9Before);
    expect(readBuildDatabase(root, buildId, one.databaseId)).toMatchObject({ ok: false, code: "DATABASE_NOT_FOUND" });
  });

  it("sets existing provider targets only from bounded metadata and resets all observations", async () => {
    const buildId = setupBuild(); const env = await environment(buildId);
    const made = create(buildId, env.environmentId); if (!made.ok) throw new Error(made.code);
    const record = readBuildRecord(root, buildId)!; setObserved(record, made.databaseId); writeBuildRecord(root, record);
    expect(mutate(buildId, "set_provider_target", 1, { databaseId: made.databaseId, organizationSlug: "org", projectRef: null, region: "eu-north-1" }))
      .toMatchObject({ ok: false, code: "DATABASE_PROJECT_REF_REQUIRED" });
    expect(mutate(buildId, "set_provider_target", 1, { databaseId: made.databaseId, organizationSlug: "org", projectRef: "proj_123", region: "eu-north-1", url: "https://bad" }))
      .toMatchObject({ ok: false, code: "DATABASE_MUTATION_INVALID" });
    const changed = mutate(buildId, "set_provider_target", 1,
      { databaseId: made.databaseId, organizationSlug: "org", projectRef: "proj_123", region: "eu-north-1" });
    expect(changed).toMatchObject({ ok: true, revision: 2 });
    expect(readBuildDatabase(root, buildId, made.databaseId)).toMatchObject({ ok: true, database: {
      providerTarget: { organizationSlug: "org", projectRef: "proj_123", region: "eu-north-1" },
      providerObservation: { state: "unverified" }, connectionObservation: { state: "unverified" }, migrationObservation: { state: "unknown" },
    } });
    const provisioned = mutate(buildId, "create_database", 2,
      { provider: "supabase", label: "PATH DB", environmentId: env.environmentId, source: "path_provisioned" });
    if (!provisioned.ok) throw new Error(provisioned.code);
    expect(mutate(buildId, "set_provider_target", 3, { databaseId: provisioned.databaseId,
      organizationSlug: "org", projectRef: "manual", region: "eu" }))
      .toMatchObject({ ok: false, code: "DATABASE_PROVIDER_TARGET_MANAGED_BY_PROVISIONING" });
  });

  it("binds only exact same-environment P9 secrets and applies role-specific observation resets", async () => {
    const buildId = setupBuild(); const env = await environment(buildId); const otherEnv = await environment(buildId);
    const made = create(buildId, env.environmentId); if (!made.ok) throw new Error(made.code);
    const record = readBuildRecord(root, buildId)!; setObserved(record, made.databaseId); writeBuildRecord(root, record);
    const foreignRef = otherEnv.refs.MANAGEMENT_TOKEN!;
    expect(mutate(buildId, "bind_management_credential", 1, { databaseId: made.databaseId, secretRef: foreignRef }))
      .toMatchObject({ ok: false, code: "DATABASE_SECRET_REF_NOT_FOUND" });
    expect(mutate(buildId, "bind_management_credential", 1, { databaseId: made.databaseId, secretRef: "missing_ref" }))
      .toMatchObject({ ok: false, code: "DATABASE_SECRET_REF_NOT_FOUND" });
    expect(mutate(buildId, "bind_management_credential", 1, { databaseId: made.databaseId, secretRef: env.refs.CONFIG_VALUE }))
      .toMatchObject({ ok: false, code: "DATABASE_SECRET_REF_NOT_FOUND" });
    expect(mutate(buildId, "bind_management_credential", 1, { databaseId: made.databaseId,
      secretRef: env.refs.MANAGEMENT_TOKEN })).toMatchObject({ ok: true, revision: 2 });
    expect(readBuildDatabase(root, buildId, made.databaseId)).toMatchObject({ ok: true, database: {
      credentials: { managementSecretRef: env.refs.MANAGEMENT_TOKEN, databaseUrlSecretRef: null },
      providerObservation: { state: "unverified" }, connectionObservation: { state: "ready" }, migrationObservation: { state: "in_sync" },
    } });
    expect(mutate(buildId, "bind_management_credential", 2, { databaseId: made.databaseId, secretRef: env.refs.MANAGEMENT_TOKEN }))
      .toMatchObject({ ok: false, code: "DATABASE_CREDENTIAL_ALREADY_BOUND" });
    expect(mutate(buildId, "bind_database_url", 2, { databaseId: made.databaseId, secretRef: env.refs.DATABASE_URL }))
      .toMatchObject({ ok: true, revision: 3 });
    expect(readBuildDatabase(root, buildId, made.databaseId)).toMatchObject({ ok: true, database: {
      providerObservation: { state: "unverified" }, connectionObservation: { state: "unverified" }, migrationObservation: { state: "unknown" },
    } });
    const synthetic = readBuildRecord(root, buildId)!; setObserved(synthetic, made.databaseId); writeBuildRecord(root, synthetic);
    expect(mutate(buildId, "unbind_management_credential", 3, { databaseId: made.databaseId })).toMatchObject({ ok: true, revision: 4 });
    expect(readBuildDatabase(root, buildId, made.databaseId)).toMatchObject({ ok: true, database: {
      providerObservation: { state: "unverified" }, connectionObservation: { state: "ready" }, migrationObservation: { state: "in_sync" },
    } });
    expect(mutate(buildId, "unbind_database_url", 4, { databaseId: made.databaseId })).toMatchObject({ ok: true, revision: 5 });
    expect(readBuildDatabase(root, buildId, made.databaseId)).toMatchObject({ ok: true, database: {
      providerObservation: { state: "unverified" }, connectionObservation: { state: "unverified" }, migrationObservation: { state: "unknown" },
    } });
  });

  it("validates coherent observations and strict future provision operation/history shapes", async () => {
    const buildId = setupBuild(); const env = await environment(buildId);
    const made = create(buildId, env.environmentId, "Provisionable DB", "path_provisioned"); if (!made.ok) throw new Error(made.code);
    const base = readBuildRecord(root, buildId)!;
    const original = structuredClone(base.databases!);
    const makeReady = () => { const next = structuredClone(base); setObserved(next, made.databaseId); return next; };
    const badCases = [
      (() => { const x = makeReady() as any; x.databases.items[0].providerObservation.observedAt = null; return x; })(),
      (() => { const x = makeReady() as any; x.databases.items[0].connectionObservation.adapterVersion = null; return x; })(),
      (() => { const x = makeReady() as any; x.databases.items[0].providerObservation.failureCode = "MISSING"; return x; })(),
      (() => { const x = makeReady() as any; x.databases.items[0].migrationObservation.localDigest = "nope"; return x; })(),
      (() => { const x = structuredClone(base) as any; x.databases.items[0].extra = true; return x; })(),
      (() => { const x = structuredClone(base) as any; x.databases.items.push({ ...structuredClone(x.databases.items[0]), label: "second label" }); return x; })(),
      (() => { const x = structuredClone(base) as any; x.databases.items.push({ ...structuredClone(x.databases.items[0]),
        databaseId: "90000000-0000-4000-8000-000000000009" }); return x; })(),
    ];
    for (const bad of badCases) { writeBuildRecord(root, bad); expect(listBuildDatabases(root, buildId)).toMatchObject({ ok: false, code: "DATABASES_INVALID" }); }
    const validReady = makeReady(); writeBuildRecord(root, validReady);
    expect(listBuildDatabases(root, buildId)).toMatchObject({ ok: true, items: [{ providerObservation: { state: "ready" }, connectionObservation: { state: "ready" } }] });
    const provisioned = structuredClone(base) as any; provisioned.databases.pendingOperation = structuredClone(PENDING);
    provisioned.databases.pendingOperation.databaseId = made.databaseId;
    provisioned.databases.pendingOperation.environmentId = env.environmentId;
    writeBuildRecord(root, provisioned);
    expect(listBuildDatabases(root, buildId)).toMatchObject({ ok: true, pendingOperation: { kind: "provision", state: "prepared" } });
    for (const invalidOp of [
      { ...PENDING, kind: "query" }, { ...PENDING, managementToken: "plaintext sentinel" },
      { ...PENDING, organizationSlug: undefined },
    ]) {
      const malformed = structuredClone(provisioned) as any; malformed.databases.pendingOperation = invalidOp as any; writeBuildRecord(root, malformed);
      expect(listBuildDatabases(root, buildId)).toMatchObject({ ok: false, code: "DATABASES_INVALID" });
    }
    const history = structuredClone(base) as any;
    history.databases.operationHistory = [{ operationId: PENDING.operationId, kind: "provision", databaseId: made.databaseId,
      provider: "supabase", providerProjectName: "path-acceptance-db", organizationSlug: "example-org", region: "eu-north-1",
      state: "completed", providerProjectRef: "ref_123", createdAt: at, completedAt: at, failureCode: null }];
    writeBuildRecord(root, history); expect(listBuildDatabases(root, buildId)).toMatchObject({ ok: true });
    history.databases.operationHistory[0].managementSecretRef = "must-not-be-retained";
    writeBuildRecord(root, history); expect(listBuildDatabases(root, buildId)).toMatchObject({ ok: false, code: "DATABASES_INVALID" });
    const validHistory = { operationId: "40000000-0000-4000-8000-000000000004", kind: "provision", databaseId: made.databaseId,
      provider: "supabase", providerProjectName: "path-acceptance-db", organizationSlug: "example-org", region: "eu-north-1",
      state: "completed", providerProjectRef: "ref_123", createdAt: at, completedAt: at, failureCode: null };
    for (const entries of [
      [validHistory, { ...validHistory }],
      [{ ...validHistory, completedAt: null }],
      [{ ...validHistory, state: "safe_stop", completedAt: at }],
    ]) {
      const malformed = structuredClone(base) as any; malformed.databases.operationHistory = entries; writeBuildRecord(root, malformed);
      expect(listBuildDatabases(root, buildId)).toMatchObject({ ok: false, code: "DATABASES_INVALID" });
    }
    expect(original.items[0]?.providerObservation.state).toBe("unverified");
  });

  it("rejects material/SQL fields, preserves Build and emits no event on failures", async () => {
    const buildId = setupBuild(); const env = await environment(buildId); const made = create(buildId, env.environmentId);
    if (!made.ok) throw new Error(made.code);
    const path = resolveBuildRecordPath(root, buildId); const before = readFileSync(path, "utf8");
    const sentinel = "P13_SECRET_SQL_SENTINEL";
    for (const badInput of [
      { databaseId: made.databaseId, databaseUrl: sentinel }, { databaseId: made.databaseId, password: sentinel },
      { databaseId: made.databaseId, sql: sentinel }, { databaseId: made.databaseId, query: sentinel },
      { databaseId: made.databaseId, host: "localhost" },
    ]) {
      const rejected = mutate(buildId, "rename_database", 1, badInput);
      expect(rejected).toMatchObject({ ok: false, code: "DATABASE_MUTATION_INVALID" });
      expect(JSON.stringify(rejected)).not.toContain(sentinel);
    }
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(JSON.stringify(readBuildEvents(root, buildId))).not.toContain(sentinel);
    expect(JSON.stringify(listBuildDatabases(root, buildId))).not.toContain(sentinel);
    expect(JSON.stringify(readBuildDatabase(root, buildId, made.databaseId))).not.toContain(sentinel);
  });

  it("isolates database, environment, and P9 secret identities across Builds", async () => {
    const a = setupBuild("A"); const b = setupBuild("B"); const envA = await environment(a); const envB = await environment(b);
    const beforeB = readFileSync(resolveBuildRecordPath(root, b), "utf8");
    const dbA = create(a, envA.environmentId); if (!dbA.ok) throw new Error(dbA.code);
    expect(mutate(b, "rename_database", 0, { databaseId: dbA.databaseId, label: "Hijack" })).toMatchObject({ ok: false, code: "DATABASE_NOT_FOUND" });
    expect(create(b, envA.environmentId)).toMatchObject({ ok: false, code: "DATABASE_ENVIRONMENT_NOT_FOUND" });
    const dbB = create(b, envB.environmentId); if (!dbB.ok) throw new Error(dbB.code);
    expect(mutate(b, "bind_management_credential", 1, { databaseId: dbB.databaseId, secretRef: envA.refs.MANAGEMENT_TOKEN }))
      .toMatchObject({ ok: false, code: "DATABASE_SECRET_REF_NOT_FOUND" });
    const bAfterCreate = readFileSync(resolveBuildRecordPath(root, b), "utf8");
    expect(bAfterCreate).not.toBe(beforeB);
    expect(readFileSync(resolveBuildRecordPath(root, b), "utf8")).toBe(bAfterCreate);
    expect(readBuildDatabase(root, b, dbA.databaseId)).toMatchObject({ ok: false, code: "DATABASE_NOT_FOUND" });
  });

  it("serializes coordinator mutations, emits bounded events, and honors scoped Build access", async () => {
    const buildId = setupBuild(); const env = await environment(buildId); const c = await coordinator();
    expect(await c.dispatch("build.databases.catalog", {})).toMatchObject({ ok: true,
      providers: [{ provider: "supabase", engine: "postgres" }] });
    expect(await c.dispatch("build.databases.list", { buildId })).toMatchObject({ ok: true, revision: 0, items: [] });
    const input = { provider: "supabase", label: "Coordinator DB", environmentId: env.environmentId, source: "existing" };
    const results = await Promise.all([0, 1].map(() => c.dispatch("build.databases.mutate",
      { buildId, action: "create_database", expectedDatabaseRevision: 0, input })));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => result.code === "DATABASE_REVISION_STALE")).toHaveLength(1);
    const event = readBuildEvents(root, buildId).find((item) => item.type === "database.mutated");
    expect(event).toMatchObject({ type: "database.mutated", data: { action: "create_database", provider: "supabase", revision: 1 } });
    expect(JSON.stringify(event)).not.toContain(env.refs.MANAGEMENT_TOKEN);
    expect(readBuildEvents(root, buildId).filter((item) => item.type === "database.mutated")).toHaveLength(1);
    expect(await c.dispatch("build.databases.read", { buildId, databaseId: results.find((x) => x.ok)!.databaseId }))
      .toMatchObject({ ok: true, database: { provider: "supabase" } });
    expect(await c.dispatch("build.databases.mutate", { buildId, action: "rename_database",
      expectedDatabaseRevision: 1, input: { databaseId: results.find((x) => x.ok)!.databaseId, label: "blocked", token: "no" } }))
      .toMatchObject({ ok: false, code: "DATABASE_MUTATION_INVALID" });
    const scoped = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      scopedBuildId: buildId });
    try {
      await scoped.whenReady;
      expect(await scoped.dispatch("build.databases.catalog", {})).toMatchObject({ ok: true });
      expect(await scoped.dispatch("build.databases.list", { buildId })).toMatchObject({ ok: true, revision: 1 });
      const foreignBuild = setupBuild("Foreign scoped build");
      expect(await scoped.dispatch("build.databases.list", { buildId: foreignBuild }))
        .toMatchObject({ ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" });
    } finally { await scoped.close(); }
  });

  it("keeps reads available during restore and blocks mutations before writes/events", async () => {
    const buildId = setupBuild(); const env = await environment(buildId); const made = create(buildId, env.environmentId);
    if (!made.ok) throw new Error(made.code);
    let record = readBuildRecord(root, buildId)!; record.pendingRestore = { operationId: "restore", expectedAuthoritativeSha: "a", targetAdoptionIndex: 0,
      targetSha: "b", targetTreeSha: "c", candidateSha: null, createdAt: at }; writeBuildRecord(root, record);
    const before = readFileSync(resolveBuildRecordPath(root, buildId), "utf8");
    expect(listBuildDatabases(root, buildId)).toMatchObject({ ok: true, revision: 1 });
    const result = prepareBuildDatabaseMutation(root, buildId, { action: "rename_database", expectedDatabaseRevision: 1,
      input: { databaseId: made.databaseId, label: "blocked" } });
    expect(result).toMatchObject({ ok: false, code: "RESTORE_PENDING" });
    expect(readFileSync(resolveBuildRecordPath(root, buildId), "utf8")).toBe(before);
    expect(readBuildEvents(root, buildId).filter((item) => item.type === "database.mutated")).toHaveLength(0);
  });

  it("exposes no observation/provision/query/migration method and contains no network, SQL, or database client", async () => {
    const buildId = setupBuild(); const c = await coordinator();
    for (const absentMethod of ["build.databases.verify", "build.databases.provision", "build.databases.query", "build.databases.migrate"])
      expect(await c.dispatch(absentMethod, { buildId })).toMatchObject({ ok: false, code: "METHOD_NOT_FOUND" });
    const protocol = readFileSync(new URL("../../scripts/pathcode-cli/build/coordinator/protocol.mjs", import.meta.url), "utf8");
    expect(protocol).not.toMatch(/build\.databases\.(?:verify|provision|query|migrate)/);
    const source = readFileSync(new URL("../../scripts/pathcode-cli/build/databases.mjs", import.meta.url), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(|from\s+["']node:(?:http|https|net|child_process)/i);
    expect(source).not.toMatch(/from\s+["'](?:pg|postgres|@supabase\/supabase-js)/i);
    expect(source).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b/i);
  });
});
