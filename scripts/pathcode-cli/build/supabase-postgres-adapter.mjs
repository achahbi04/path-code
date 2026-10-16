import pg from "pg";

export const SUPABASE_POSTGRES_ADAPTER_VERSION = "supabase.postgres.verify.v1";
export const SUPABASE_READ_ONLY_PROBE = "SELECT 1 AS ok, current_setting('server_version') AS server_version";
const fail = (state, code) => ({ ok: false, state, code });
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const PROJECT = /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/;

export function parseSupabaseDatabaseUrl(raw, expectedProjectRef) {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 4096 || CONTROL.test(raw))
    return { error: "DATABASE_URL_UNSAFE" };
  let url;
  try { url = new URL(raw); } catch { return { error: "DATABASE_URL_UNSAFE" }; }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash || !url.username || !url.password || !url.hostname ||
      url.pathname !== "/postgres") return { error: "DATABASE_URL_UNSAFE" };
  let username, password;
  try { username = decodeURIComponent(url.username); password = decodeURIComponent(url.password); }
  catch { return { error: "DATABASE_URL_UNSAFE" }; }
  if (!username || !password || CONTROL.test(username) || CONTROL.test(password)) return { error: "DATABASE_URL_UNSAFE" };
  if (url.search) {
    const params = [...url.searchParams.entries()];
    if (params.length !== 1 || params[0][0] !== "sslmode" || !["require", "verify-full"].includes(params[0][1]))
      return { error: "DATABASE_URL_UNSAFE" };
  }
  const port = url.port ? Number(url.port) : 5432;
  if (![5432, 6543].includes(port)) return { error: "DATABASE_URL_UNSAFE" };
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || /^\d+(?:\.\d+){3}$/.test(host) || host.includes(":"))
    return { error: "DATABASE_URL_UNSAFE" };
  const direct = /^db\.([a-z0-9-]+)\.supabase\.co$/.exec(host);
  const pooler = /^([a-z0-9.-]+)\.pooler\.supabase\.com$/.test(host);
  if (!direct && !pooler) return { error: "DATABASE_URL_UNSAFE" };
  if (direct && direct[1] !== expectedProjectRef) return { error: "DATABASE_URL_PROJECT_MISMATCH" };
  if (pooler && !(username === `postgres.${expectedProjectRef}` || username.endsWith(`.${expectedProjectRef}`)))
    return { error: "DATABASE_URL_PROJECT_MISMATCH" };
  if (!PROJECT.test(expectedProjectRef)) return { error: "DATABASE_URL_UNSAFE" };
  return { host, port, user: username, password, database: "postgres" };
}

function authFailure(error) {
  return ["28P01", "28000", "42501"].includes(error?.code);
}

function boundedEnd(client) {
  return Promise.race([Promise.resolve().then(() => client.end()).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 1_000))]);
}

export function createSupabasePostgresAdapter({ Client = pg.Client } = {}) {
  return Object.freeze({
    provider: "supabase",
    adapterVersion: SUPABASE_POSTGRES_ADAPTER_VERSION,
    async verify(input) {
      if (!input || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).sort().join(",") !== "databaseUrl,projectRef")
        return fail("action_required", "DATABASE_URL_UNSAFE");
      const parsed = parseSupabaseDatabaseUrl(input.databaseUrl, input.projectRef);
      if (parsed.error) return fail("action_required", parsed.error);
      let client;
      try {
        client = new Client({ host: parsed.host, port: parsed.port, user: parsed.user, password: parsed.password,
          database: parsed.database, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10_000,
          query_timeout: 10_000, statement_timeout: 10_000, application_name: "PATH-Code" });
      } catch { return fail("unavailable", "DATABASE_CONNECTION_UNAVAILABLE"); }
      let timeout;
      try {
        const execution = (async () => {
          await client.connect();
          const result = await client.query(SUPABASE_READ_ONLY_PROBE);
          if (!result || !Array.isArray(result.rows) || result.rows.length !== 1 ||
              result.rows[0]?.ok !== 1 && result.rows[0]?.ok !== "1" ||
              typeof result.rows[0]?.server_version !== "string" || result.rows[0].server_version.length < 1 ||
              result.rows[0].server_version.length > 120 || CONTROL.test(result.rows[0].server_version))
            return fail("unavailable", "DATABASE_RESPONSE_UNSAFE");
          return { ok: true, serverVersion: result.rows[0].server_version };
        })();
        const deadline = new Promise((resolve) => { timeout = setTimeout(() => {
          client.connection?.stream?.destroy();
          resolve(null);
        }, 10_000); });
        const result = await Promise.race([execution, deadline]);
        if (result === null) return fail("unavailable", "DATABASE_CONNECTION_UNAVAILABLE");
        return result;
      } catch (error) {
        return authFailure(error) ? fail("action_required", "DATABASE_CREDENTIAL_REJECTED") :
          fail("unavailable", "DATABASE_CONNECTION_UNAVAILABLE");
      } finally {
        clearTimeout(timeout);
        await boundedEnd(client);
      }
    },
  });
}
