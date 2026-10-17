import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildCoordinatorService, createBuildRecordSkeleton, readBuildRecord, readBuildEvents, writeBuildRecord } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";
// @ts-expect-error The focused .mjs module is exercised directly as runtime code.
import { createSupabaseMigrationAdapter, SUPABASE_MIGRATION_QUERY } from "../../scripts/pathcode-cli/build/supabase-migration-adapter.mjs";

const url = "postgresql://postgres:synthetic-password@db.project123.supabase.co:5432/postgres?sslmode=require";
async function migrationFixture(migrationFiles: Array<[string, string]>, remote: (input: any) => Promise<any>) {
  const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p13-migration-matrix-"));
  const projectRoot = join(runtimeRoot, "project"); mkdirSync(projectRoot);
  execFileSync("git", ["init", "-q", projectRoot]);
  execFileSync("git", ["-C", projectRoot, "config", "user.email", "synthetic@example.invalid"]);
  execFileSync("git", ["-C", projectRoot, "config", "user.name", "Synthetic Fixture"]);
  mkdirSync(join(projectRoot, "supabase", "migrations"), { recursive: true });
  for (const [filename, contents] of migrationFiles) writeFileSync(join(projectRoot, "supabase", "migrations", filename), contents);
  writeFileSync(join(projectRoot, ".gitignore"), ".env.local\n");
  execFileSync("git", ["-C", projectRoot, "add", "-A"]);
  execFileSync("git", ["-C", projectRoot, "commit", "-qm", "synthetic migration state", "--allow-empty"]);
  const sha = execFileSync("git", ["-C", projectRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  writeFileSync(join(projectRoot, ".env.local"), "DATABASE_URL=postgresql://postgres:synthetic-password@db.project123.supabase.co:5432/postgres?sslmode=require\n");
  const record = createBuildRecordSkeleton({ outcome: "synthetic migration" }); record.authoritativeSha = sha;
  record.projectBindings.push({ bindingId: "synthetic", projectRoot }); record.loop.status = "paused"; writeBuildRecord(runtimeRoot, record);
  let remoteCalls = 0;
  const service = await createBuildCoordinatorService({ runtimeRoot, packageRoot: resolvePathPackageRoot(), fakeMode: true,
    databaseVerificationAdapters: { supabase: { connection: { provider: "supabase", adapterVersion: "supabase.postgres.verify.v1",
      verify: async () => ({ ok: true, serverVersion: "PostgreSQL 17.0" }) } } },
    databaseOperationAdapters: { supabase: { migrations: { observe: async (input: any) => { remoteCalls++; return remote(input); } } } } });
  await service.whenReady;
  const env = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "create_environment",
    expectedEnvironmentRevision: 0, input: { name: "synthetic" } });
  let envRevision = env.revision;
  const secret = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "bind_secret",
    expectedEnvironmentRevision: envRevision++, input: { environmentId: env.environmentId, variableName: "DATABASE_URL", backend: "local_env_file" } });
  await service.dispatch("build.environments.verifyLocal", { buildId: record.buildId, environmentId: env.environmentId,
    variableName: "DATABASE_URL", expectedEnvironmentRevision: envRevision++ });
  const created = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "create_database",
    expectedDatabaseRevision: 0, input: { provider: "supabase", label: "Migration DB", environmentId: env.environmentId, source: "existing" } });
  const bound = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "bind_database_url",
    expectedDatabaseRevision: created.revision, input: { databaseId: created.databaseId, secretRef: secret.secretRef } });
  const targeted = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "set_provider_target",
    expectedDatabaseRevision: bound.revision, input: { databaseId: created.databaseId, organizationSlug: "org-1", projectRef: "project123", region: "eu-north-1" } });
  const connected = await service.dispatch("build.databases.verifyConnection", { buildId: record.buildId, databaseId: created.databaseId,
    expectedDatabaseRevision: targeted.revision, expectedEnvironmentRevision: envRevision });
  return { runtimeRoot, projectRoot, record, service, env, secret, envRevision, sha, databaseId: created.databaseId,
    revision: connected.revision, remoteCalls: () => remoteCalls, observe: (expectedAuthoritativeSha = sha, revision = connected.revision) =>
      service.dispatch("build.databases.observeMigrations", { buildId: record.buildId, databaseId: created.databaseId,
        expectedDatabaseRevision: revision, expectedEnvironmentRevision: envRevision, expectedAuthoritativeSha }) };
}
describe("Supabase migration history adapter", () => {
  it("uses encrypted require TLS and exactly one fixed read-only migration query", async () => {
    const seen: any = { options: null, queries: [] };
    class Client {
      constructor(options: any) { seen.options = options; }
      async connect() { seen.connects = (seen.connects || 0) + 1; }
      async query(value: string) { seen.queries.push(value); return { rows: [{ version: "20260101000000" }] }; }
      async end() { seen.ends = (seen.ends || 0) + 1; }
    }
    const adapter = createSupabaseMigrationAdapter({ Client: Client as any });
    expect(await adapter.observe({ databaseUrl: url, projectRef: "project123" })).toEqual({ ok: true, versions: ["20260101000000"] });
    expect(seen.connects).toBe(1); expect(seen.queries).toEqual([SUPABASE_MIGRATION_QUERY]);
    expect(seen.options.ssl).toEqual({ rejectUnauthorized: false });
    expect(seen.options).toMatchObject({ connectionTimeoutMillis: 10_000, query_timeout: 10_000, statement_timeout: 10_000,
      application_name: "PATH-Code" });
    expect(seen.ends).toBe(1);
  });
  it("accepts a project-bound Session pooler on 5432 with encrypted require TLS", async () => {
    const seen: any = { connects: 0, queries: [] };
    class Client {
      constructor(options: any) { seen.options = options; }
      async connect() { seen.connects++; }
      async query(query: string) { seen.queries.push(query); return { rows: [] }; }
      async end() {}
    }
    const poolerUrl = "postgresql://postgres.project123:pw@aws-1-eu-central-1.pooler.supabase.com:5432/postgres";
    const result = await createSupabaseMigrationAdapter({ Client: Client as any }).observe({ databaseUrl: poolerUrl, projectRef: "project123" });
    expect(result).toEqual({ ok: true, versions: [] });
    expect(seen.connects).toBe(1);
    expect(seen.queries).toEqual([SUPABASE_MIGRATION_QUERY]);
    expect(seen.options).toMatchObject({ host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432,
      user: "postgres.project123", ssl: { rejectUnauthorized: false } });
  });
  it("rejects verify-full before constructing a client when no CA binding exists", async () => {
    let constructed = 0;
    class Client { constructor() { constructed++; } }
    const verifyFullUrl = "postgresql://postgres:pw@db.project123.supabase.co:5432/postgres?sslmode=verify-full";
    expect(await createSupabaseMigrationAdapter({ Client: Client as any }).observe({ databaseUrl: verifyFullUrl, projectRef: "project123" }))
      .toEqual({ ok: false, code: "DATABASE_SSL_CA_REQUIRED" });
    expect(constructed).toBe(0);
  });
  it("treats only undefined relation as empty and rejects excessive rows", async () => {
    class Missing { async connect() {} async query() { throw Object.assign(new Error("private"), { code: "42P01" }); } async end() {} }
    expect(await createSupabaseMigrationAdapter({ Client: Missing as any }).observe({ databaseUrl: url, projectRef: "project123" }))
      .toEqual({ ok: true, versions: [] });
    class TooMany { async connect() {} async query() { return { rows: Array.from({ length: 5001 }, () => ({ version: "20260101000000" })) }; } async end() {} }
    expect(await createSupabaseMigrationAdapter({ Client: TooMany as any }).observe({ databaseUrl: url, projectRef: "project123" }))
      .toEqual({ ok: false, code: "DATABASE_MIGRATION_RESPONSE_UNSAFE" });
  });
  it("keeps URL material out of bounded results", async () => {
    const result = await createSupabaseMigrationAdapter({ Client: class {} as any }).observe({ databaseUrl: "not-a-url", projectRef: "project123" });
    expect(JSON.stringify(result)).not.toContain("not-a-url");
    expect(JSON.stringify(result)).not.toContain(url);
    expect(JSON.stringify(result)).not.toContain("synthetic-password");
  });
  it("reduces malformed history rows and authentication failures without leaking driver errors", async () => {
    class Malformed { async connect() {} async query() { return { rows: [{ version: "2026\nprivate" }] }; } async end() {} }
    const malformed = await createSupabaseMigrationAdapter({ Client: Malformed as any }).observe({ databaseUrl: url, projectRef: "project123" });
    expect(malformed).toEqual({ ok: false, code: "DATABASE_MIGRATION_RESPONSE_UNSAFE" });
    class AuthFailure { async connect() { throw Object.assign(new Error("private URL password-sentinel"), { code: "28P01" }); } async query() { throw new Error("must not query"); } async end() {} }
    const rejected = await createSupabaseMigrationAdapter({ Client: AuthFailure as any }).observe({ databaseUrl: url, projectRef: "project123" });
    expect(rejected).toEqual({ ok: false, code: "DATABASE_CREDENTIAL_REJECTED" });
    expect(JSON.stringify(rejected)).not.toContain("sentinel");
  });
  it("bounds connect/query failures to one connection and one query with no retry", async () => {
    for (const phase of ["connect", "query"] as const) {
      const seen = { connects: 0, queries: 0, ends: 0 };
      class Failure {
        async connect() { seen.connects++; if (phase === "connect") throw Object.assign(new Error("private"), { code: "ETIMEDOUT" }); }
        async query() { seen.queries++; if (phase === "query") throw Object.assign(new Error("private"), { code: "57014" }); return { rows: [] }; }
        async end() { seen.ends++; }
      }
      const result = await createSupabaseMigrationAdapter({ Client: Failure as any }).observe({ databaseUrl: url, projectRef: "project123" });
      expect(result).toEqual({ ok: false, code: "DATABASE_CONNECTION_UNAVAILABLE" });
      expect(seen.connects).toBe(1); expect(seen.queries).toBe(phase === "connect" ? 0 : 1); expect(seen.ends).toBe(1);
    }
  });
  it("executes one query for an absent migration table without a fallback", async () => {
    const seen = { connects: 0, queries: [] as string[] };
    class Missing {
      async connect() { seen.connects++; }
      async query(query: string) { seen.queries.push(query); throw Object.assign(new Error("private"), { code: "42P01" }); }
      async end() {}
    }
    expect(await createSupabaseMigrationAdapter({ Client: Missing as any }).observe({ databaseUrl: url, projectRef: "project123" }))
      .toEqual({ ok: true, versions: [] });
    expect(seen.connects).toBe(1); expect(seen.queries).toEqual([SUPABASE_MIGRATION_QUERY]);
  });

  it("observes the committed authoritative migration inventory through explicit coordinator authority", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "path-p13-migration-runtime-"));
    const projectRoot = join(runtimeRoot, "project"); mkdirSync(projectRoot);
    let service: Awaited<ReturnType<typeof createBuildCoordinatorService>> | null = null;
    try {
      execFileSync("git", ["init", "-q", projectRoot]);
      execFileSync("git", ["-C", projectRoot, "config", "user.email", "synthetic@example.invalid"]);
      execFileSync("git", ["-C", projectRoot, "config", "user.name", "Synthetic Fixture"]);
      mkdirSync(join(projectRoot, "supabase", "migrations"), { recursive: true });
      writeFileSync(join(projectRoot, "supabase", "migrations", "20260101000000_init.sql"), "-- synthetic identity only\n");
      writeFileSync(join(projectRoot, ".gitignore"), ".env.local\n");
      execFileSync("git", ["-C", projectRoot, "add", ".gitignore", "supabase/migrations/20260101000000_init.sql"]);
      execFileSync("git", ["-C", projectRoot, "commit", "-qm", "synthetic migration"]);
      const sha = execFileSync("git", ["-C", projectRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      writeFileSync(join(projectRoot, ".env.local"), "DATABASE_URL=postgresql://postgres:synthetic-password@db.project123.supabase.co:5432/postgres?sslmode=require\n");
      const record = createBuildRecordSkeleton({ outcome: "synthetic migration" }); record.authoritativeSha = sha;
      record.projectBindings.push({ bindingId: "synthetic", projectRoot }); record.loop.status = "paused"; writeBuildRecord(runtimeRoot, record);
      let remoteCalls = 0;
      service = await createBuildCoordinatorService({ runtimeRoot, packageRoot: resolvePathPackageRoot(), fakeMode: true,
        databaseVerificationAdapters: { supabase: { connection: { provider: "supabase",
          adapterVersion: "supabase.postgres.verify.v1", verify: async () => ({ ok: true, serverVersion: "PostgreSQL 17.0" }) } } },
        databaseOperationAdapters: { supabase: { migrations: { observe: async () => { remoteCalls++; return { ok: true,
          versions: ["20260101000000"] }; } } } } }); await service.whenReady;
      const env = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "create_environment",
        expectedEnvironmentRevision: 0, input: { name: "synthetic" } });
      let envRevision = env.revision;
      const secret = await service.dispatch("build.environments.mutate", { buildId: record.buildId, action: "bind_secret",
        expectedEnvironmentRevision: envRevision++, input: { environmentId: env.environmentId, variableName: "DATABASE_URL", backend: "local_env_file" } });
      const ready = await service.dispatch("build.environments.verifyLocal", { buildId: record.buildId, environmentId: env.environmentId,
        variableName: "DATABASE_URL", expectedEnvironmentRevision: envRevision++ });
      expect(ready.ok).toBe(true);
      const created = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "create_database",
        expectedDatabaseRevision: 0, input: { provider: "supabase", label: "Migration DB", environmentId: env.environmentId, source: "existing" } });
      let databaseRevision = created.revision;
      const bound = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "bind_database_url",
        expectedDatabaseRevision: databaseRevision++, input: { databaseId: created.databaseId, secretRef: secret.secretRef } });
      const targeted = await service.dispatch("build.databases.mutate", { buildId: record.buildId, action: "set_provider_target",
        expectedDatabaseRevision: bound.revision, input: { databaseId: created.databaseId, organizationSlug: "org-1",
          projectRef: "project123", region: "eu-north-1" } });
      const connected = await service.dispatch("build.databases.verifyConnection", { buildId: record.buildId,
        databaseId: created.databaseId, expectedDatabaseRevision: targeted.revision, expectedEnvironmentRevision: envRevision });
      const observed = await service.dispatch("build.databases.observeMigrations", { buildId: record.buildId,
        databaseId: created.databaseId, expectedDatabaseRevision: connected.revision, expectedEnvironmentRevision: envRevision,
        expectedAuthoritativeSha: sha });
      expect(observed).toMatchObject({ ok: true, migrationObservation: { state: "in_sync", sourceSha: sha,
        localCount: 1, remoteCount: 1, localHeadVersion: "20260101000000", remoteHeadVersion: "20260101000000" } });
      expect(remoteCalls).toBe(1);
    } finally { await service?.close(); rmSync(runtimeRoot, { recursive: true, force: true }); }
  });
  it("compares empty, pending, remote-ahead, and middle-mismatch histories mechanically", async () => {
    const cases: Array<[Array<[string, string]>, string[], string, number]> = [
      [[], [], "none", 0],
      [[ ["20260101000000_a.sql", "A"], ["20260102000000_b.sql", "B"] ], ["20260101000000"], "pending", 2],
      [[ ["20260101000000_a.sql", "A"] ], ["20260101000000", "20260102000000"], "diverged", 1],
      [[ ["20260101000000_a.sql", "A"], ["20260102000000_b.sql", "B"], ["20260103000000_c.sql", "C"] ],
        ["20260101000000", "20260102000099"], "diverged", 3],
    ];
    for (const [files, versions, state, count] of cases) {
      const fixture = await migrationFixture(files, async () => ({ ok: true, versions }));
      try {
        const result = await fixture.observe();
        expect(result).toMatchObject({ ok: true, migrationObservation: { state, localCount: count, remoteCount: versions.length } });
        expect(fixture.remoteCalls()).toBe(1);
      } finally { await fixture.service.close(); rmSync(fixture.runtimeRoot, { recursive: true, force: true }); }
    }
  });
  it("keeps local facts on remote failure and skips remote work when local inventory fails", async () => {
    const remoteFailure = await migrationFixture([["20260101000000_a.sql", "A"]], async () => ({ ok: false, code: "DATABASE_CONNECTION_UNAVAILABLE" }));
    try {
      const result = await remoteFailure.observe();
      expect(result).toMatchObject({ migrationObservation: { state: "unavailable", sourceSha: remoteFailure.sha,
        localCount: 1, localHeadVersion: "20260101000000", remoteCount: null, remoteHeadVersion: null } });
      expect(remoteFailure.remoteCalls()).toBe(1);
    } finally { await remoteFailure.service.close(); rmSync(remoteFailure.runtimeRoot, { recursive: true, force: true }); }
    const localFailure = await migrationFixture([], async () => ({ ok: true, versions: [] }));
    try {
      const invalidSha = "f".repeat(40); const record = readBuildRecord(localFailure.runtimeRoot, localFailure.record.buildId) as any;
      record.authoritativeSha = invalidSha; writeBuildRecord(localFailure.runtimeRoot, record);
      const result = await localFailure.observe(invalidSha);
      expect(result).toMatchObject({ migrationObservation: { state: "unavailable", failureCode: "DATABASE_MIGRATION_SOURCE_UNAVAILABLE" } });
      expect(localFailure.remoteCalls()).toBe(0);
    } finally { await localFailure.service.close(); rmSync(localFailure.runtimeRoot, { recursive: true, force: true }); }
  });
  it.each(["credential", "database", "environment", "sha"] as const)("rejects a held migration observation after %s authority changes", async (change) => {
    let release!: (value: any) => void; let entered!: () => void; let calls = 0;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<any>((resolve) => { release = resolve; });
    const fixture = await migrationFixture([["20260101000000_a.sql", "A"]], async () => { calls++; entered(); return held; });
    try {
      const before = await fixture.service.dispatch("build.databases.list", { buildId: fixture.record.buildId });
      const beforeItem = before.items[0];
      const eventsBefore = readBuildEvents(fixture.runtimeRoot, fixture.record.buildId).filter((e: any) => e.type === "database.migrations_observed").length;
      const pending = fixture.observe(); await enteredPromise;
      if (change === "credential") writeFileSync(join(fixture.projectRoot, ".env.local"), "DATABASE_URL=postgresql://postgres:changed-synthetic@db.project123.supabase.co:5432/postgres?sslmode=require\n");
      if (change === "database") await fixture.service.dispatch("build.databases.mutate", { buildId: fixture.record.buildId, action: "rename_database",
        expectedDatabaseRevision: fixture.revision, input: { databaseId: fixture.databaseId, label: "Migration DB renamed" } });
      if (change === "environment") await fixture.service.dispatch("build.environments.mutate", { buildId: fixture.record.buildId, action: "rename_environment",
        expectedEnvironmentRevision: fixture.envRevision, input: { environmentId: fixture.env.environmentId, name: "renamed" } });
      if (change === "sha") {
        writeFileSync(join(fixture.projectRoot, "synthetic.txt"), "new commit");
        execFileSync("git", ["-C", fixture.projectRoot, "add", "synthetic.txt"]);
        execFileSync("git", ["-C", fixture.projectRoot, "commit", "-qm", "advance fixture source"]);
        const record = readBuildRecord(fixture.runtimeRoot, fixture.record.buildId) as any;
        record.authoritativeSha = execFileSync("git", ["-C", fixture.projectRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
        writeBuildRecord(fixture.runtimeRoot, record);
      }
      release({ ok: true, versions: ["20260101000000"] });
      const result = await pending;
      const expected = change === "credential" ? "DATABASE_CREDENTIAL_CHANGED" : change === "database" ? "DATABASE_AUTHORITY_STALE" :
        change === "environment" ? "DATABASE_ENVIRONMENT_STALE" : "DATABASE_MIGRATION_SOURCE_STALE";
      expect(result.code).toBe(expected); expect(calls).toBe(1);
      const after = await fixture.service.dispatch("build.databases.list", { buildId: fixture.record.buildId });
      expect(after.items[0].migrationObservation).toEqual(beforeItem.migrationObservation);
      expect(readBuildEvents(fixture.runtimeRoot, fixture.record.buildId).filter((e: any) => e.type === "database.migrations_observed")).toHaveLength(eventsBefore);
    } finally { await fixture.service.close(); rmSync(fixture.runtimeRoot, { recursive: true, force: true }); }
  });
  it("writes migration observation only, and emits a bounded event", async () => {
    const fixture = await migrationFixture([["20260101000000_filename-secret.sql", "private SQL sentinel"]], async () => ({ ok: true, versions: ["20260101000000"] }));
    try {
      const before = await fixture.service.dispatch("build.databases.list", { buildId: fixture.record.buildId });
      const result = await fixture.observe();
      const after = await fixture.service.dispatch("build.databases.list", { buildId: fixture.record.buildId });
      const strip = (item: any) => { const copy = structuredClone(item); delete copy.migrationObservation; delete copy.updatedAt; return copy; };
      expect(strip(after.items[0])).toEqual(strip(before.items[0]));
      const event = readBuildEvents(fixture.runtimeRoot, fixture.record.buildId).find((e: any) => e.type === "database.migrations_observed");
      if (!event) throw new Error("migration observation event missing");
      expect(JSON.stringify(event)).not.toContain("secretRef");
      expect(event.data).toEqual({ databaseId: fixture.databaseId, provider: "supabase", state: "in_sync", revision: result.revision,
        sourceSha: fixture.sha, localCount: 1, remoteCount: 1 });
      expect(JSON.stringify(event)).not.toContain("DATABASE_URL"); expect(JSON.stringify(event)).not.toContain("filename-secret");
      expect(JSON.stringify(event)).not.toContain("private SQL sentinel");
      expect(JSON.stringify(result)).not.toContain("private SQL sentinel");
    } finally { await fixture.service.close(); rmSync(fixture.runtimeRoot, { recursive: true, force: true }); }
  });
});
