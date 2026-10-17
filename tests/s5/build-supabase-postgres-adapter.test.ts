import { describe, expect, it, vi } from "vitest";
// @ts-expect-error Internal adapter client injection is intentionally not exported through the public Build declarations.
import { createSupabasePostgresAdapter, SUPABASE_POSTGRES_ADAPTER_VERSION, SUPABASE_READ_ONLY_PROBE } from "../../scripts/pathcode-cli/build/supabase-postgres-adapter.mjs";

const ref = "project-ref-123";
const secret = "SYNTHETIC_DATABASE_URL_SENTINEL";
const direct = `postgres://postgres:pass%40word@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
function fakeClient(result: any, error: any = null) {
  const state = { options: null as any, connects: 0, queries: [] as string[], ends: 0 };
  class Client {
    constructor(options: any) { state.options = options; }
    async connect() { state.connects++; if (error?.stage === "connect") throw error; }
    async query(sql: string) { state.queries.push(sql); if (error) throw error; return result; }
    async end() { state.ends++; }
  }
  return { Client, state };
}

describe("Supabase PostgreSQL fixed probe adapter", () => {
  it("validates a direct URL with sslmode=require, enables encrypted TLS, and issues one fixed query", async () => {
    const fake = fakeClient({ rows: [{ ok: 1, server_version: "PostgreSQL 17.4" }] });
    const adapter = createSupabasePostgresAdapter({ Client: fake.Client as any });
    const result = await adapter.verify({ databaseUrl: direct, projectRef: ref });
    expect(result).toEqual({ ok: true, serverVersion: "PostgreSQL 17.4" });
    expect(adapter.adapterVersion).toBe(SUPABASE_POSTGRES_ADAPTER_VERSION);
    expect(fake.state.options).toMatchObject({ host: `db.${ref}.supabase.co`, port: 5432,
      database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000,
      query_timeout: 10_000, statement_timeout: 10_000 });
    expect(fake.state.options.password).toBe("pass@word");
    expect(fake.state.queries).toEqual([SUPABASE_READ_ONLY_PROBE]);
    expect(fake.state.connects).toBe(1);
    expect(fake.state.ends).toBe(1);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(direct);
    expect(JSON.stringify(result)).not.toContain("pass@word");
  });

  it("accepts a project-bound Session pooler username on port 5432 and defaults to encrypted require", async () => {
    const fake = fakeClient({ rows: [{ ok: "1", server_version: "PostgreSQL 16" }] });
    const adapter = createSupabasePostgresAdapter({ Client: fake.Client as any });
    const databaseUrl = `postgres://role.${ref}:pw@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`;
    await expect(adapter.verify({ databaseUrl, projectRef: ref })).resolves.toEqual({ ok: true, serverVersion: "PostgreSQL 16" });
    expect(fake.state.options).toMatchObject({ host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432,
      user: `role.${ref}`, ssl: { rejectUnauthorized: false } });
    expect(fake.state.connects).toBe(1);
    expect(fake.state.queries).toEqual([SUPABASE_READ_ONLY_PROBE]);
  });

  it("rejects verify-full before constructing a client when no CA binding exists", async () => {
    let constructed = 0;
    class Client { constructor() { constructed++; } }
    const result = await createSupabasePostgresAdapter({ Client: Client as any }).verify({
      databaseUrl: `postgresql://postgres:pw@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`, projectRef: ref });
    expect(result).toEqual({ ok: false, state: "action_required", code: "DATABASE_SSL_CA_REQUIRED" });
    expect(constructed).toBe(0);
  });

  it.each([
    [`postgres://postgres:pw@db.other.supabase.co:5432/postgres`, "DATABASE_URL_PROJECT_MISMATCH"],
    [`postgres://postgres:pw@aws.pooler.supabase.com:5432/postgres`, "DATABASE_URL_PROJECT_MISMATCH"],
    [`postgres://postgres:pw@localhost:5432/postgres`, "DATABASE_URL_UNSAFE"],
    [`postgres://postgres:pw@127.0.0.1:5432/postgres`, "DATABASE_URL_UNSAFE"],
    [`mysql://postgres:pw@db.${ref}.supabase.co:5432/postgres`, "DATABASE_URL_UNSAFE"],
    [`postgres://@db.${ref}.supabase.co:5432/postgres`, "DATABASE_URL_UNSAFE"],
    [`postgres://postgres:pw@db.${ref}.supabase.co:5432/other`, "DATABASE_URL_UNSAFE"],
    [`postgres://postgres:pw@db.${ref}.supabase.co:5432/postgres?sslmode=disable`, "DATABASE_URL_UNSAFE"],
    [`postgres://postgres:pw@db.${ref}.supabase.co:5432/postgres?sslmode=allow`, "DATABASE_URL_UNSAFE"],
    [`postgres://postgres:pw@db.${ref}.supabase.co:5432/postgres?sslmode=prefer`, "DATABASE_URL_UNSAFE"],
    [`postgres://postgres:pw@db.${ref}.supabase.co:5432/postgres?application_name=x`, "DATABASE_URL_UNSAFE"],
    [`postgres://postgres:pw@db.${ref}.supabase.co:5432/postgres?sslmode=require&sslmode=require`, "DATABASE_URL_UNSAFE"],
    [`postgres://postgres:pw%ZZ@db.${ref}.supabase.co:5432/postgres`, "DATABASE_URL_UNSAFE"],
  ])("rejects unsafe URL forms", async (databaseUrl, code) => {
    let created = 0;
    class Client { constructor() { created++; } }
    const adapter = createSupabasePostgresAdapter({ Client: Client as any });
    await expect(adapter.verify({ databaseUrl, projectRef: ref })).resolves.toMatchObject({ state: "action_required", code });
    expect(created).toBe(0);
  });

  it("reduces auth, transport, and malformed fixed-probe results without exposing URL", async () => {
    const auth = fakeClient(null, Object.assign(new Error(secret), { code: "28P01" }));
    const authResult = await createSupabasePostgresAdapter({ Client: auth.Client as any }).verify({ databaseUrl: direct, projectRef: ref });
    await expect(Promise.resolve(authResult))
      .resolves.toEqual({ ok: false, state: "action_required", code: "DATABASE_CREDENTIAL_REJECTED" });
    const broken = fakeClient({ rows: [] });
    await expect(createSupabasePostgresAdapter({ Client: broken.Client as any }).verify({ databaseUrl: direct, projectRef: ref }))
      .resolves.toEqual({ ok: false, state: "unavailable", code: "DATABASE_RESPONSE_UNSAFE" });
    expect(broken.state.queries).toEqual([SUPABASE_READ_ONLY_PROBE]);
    expect(broken.state.connects).toBe(1);
    expect(broken.state.ends).toBe(1);
    expect(JSON.stringify({ auth: authResult })).not.toContain(secret);
  });

  it("destroys the client at the fixed connection/query deadline", async () => {
    vi.useFakeTimers();
    try {
      let destroyed = 0; let ended = 0;
      class HangingClient {
        connection = { stream: { destroy: () => { destroyed++; } } };
        async connect() {}
        query() { return new Promise(() => {}); }
        async end() { ended++; }
      }
      const pending = createSupabasePostgresAdapter({ Client: HangingClient as any }).verify({ databaseUrl: direct, projectRef: ref });
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(pending).resolves.toEqual({ ok: false, state: "unavailable", code: "DATABASE_CONNECTION_UNAVAILABLE" });
      expect(destroyed).toBe(1); expect(ended).toBe(1);
    } finally { vi.useRealTimers(); }
  });
});
