import pg from "pg";
import { parseSupabaseDatabaseUrl } from "./supabase-postgres-adapter.mjs";

export const SUPABASE_MIGRATION_QUERY = "SELECT version::text AS version FROM supabase_migrations.schema_migrations ORDER BY version LIMIT 5001";
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const fail = (code) => ({ ok: false, code });
const undefinedRelation = (e) => e?.code === "42P01";
const auth = (e) => ["28P01", "28000", "42501"].includes(e?.code);

function boundedEnd(client) {
  return Promise.race([Promise.resolve().then(() => client.end()).catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1000))]);
}
export function createSupabaseMigrationAdapter({ Client = pg.Client } = {}) {
  return Object.freeze({ provider: "supabase", adapterVersion: "supabase.migrations.observe.v1", async observe(input) {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).sort().join(",") !== "databaseUrl,projectRef")
      return fail("DATABASE_URL_UNSAFE");
    const parsed = parseSupabaseDatabaseUrl(input.databaseUrl, input.projectRef);
    if (parsed.error) return fail(parsed.error);
    let client;
    try { client = new Client({ host: parsed.host, port: parsed.port, user: parsed.user, password: parsed.password,
      database: parsed.database, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10_000,
      query_timeout: 10_000, statement_timeout: 10_000, application_name: "PATH-Code" }); }
    catch { return fail("DATABASE_CONNECTION_UNAVAILABLE"); }
    let timer;
    try {
      const run = async () => { await client.connect(); const result = await client.query(SUPABASE_MIGRATION_QUERY);
        if (!Array.isArray(result?.rows) || result.rows.length > 5000) return fail("DATABASE_MIGRATION_RESPONSE_UNSAFE");
        const versions = [];
        for (const row of result.rows) { if (!row || Object.keys(row).length !== 1 || typeof row.version !== "string" ||
          !VERSION.test(row.version) || CONTROL.test(row.version)) return fail("DATABASE_MIGRATION_RESPONSE_UNSAFE"); versions.push(row.version); }
        return { ok: true, versions }; };
      const timeout = new Promise((resolve) => { timer = setTimeout(() => { client.connection?.stream?.destroy(); resolve(null); }, 10_000); });
      const result = await Promise.race([run(), timeout]);
      return result === null ? fail("DATABASE_CONNECTION_UNAVAILABLE") : result;
    } catch (error) {
      if (undefinedRelation(error)) return { ok: true, versions: [] };
      return auth(error) ? fail("DATABASE_CREDENTIAL_REJECTED") : fail("DATABASE_CONNECTION_UNAVAILABLE");
    } finally { clearTimeout(timer); await boundedEnd(client); }
  } });
}
