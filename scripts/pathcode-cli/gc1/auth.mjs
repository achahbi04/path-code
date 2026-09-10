/**
 * Phase GC1-a — impersonated ADC for the Control SA.
 *
 * Production path: Application Default Credentials + Impersonated credentials.
 * NEVER accepts, parses, reads, or requires a static SA JSON key.
 *
 * google-auth-library is imported dynamically so the mock/canonical path never
 * loads it unless this module is explicitly invoked (live smoke / GCP transport).
 */

import {
  GC1_AUTH_SCOPE,
  GC1_CONTROL_SA,
  GC1_ERROR,
} from "./constants.mjs";

/**
 * Convert google-auth Headers / plain objects into a plain record.
 * Fetch `Headers` has no enumerable own props — `{...headers}` is `{}` (the
 * CREDENTIALS_MISSING live-smoke defect). Always go through this helper.
 * @param {unknown} headers
 * @returns {Record<string, string>}
 */
export function headersToPlainRecord(headers) {
  if (!headers) return {};
  if (typeof headers.forEach === "function") {
    /** @type {Record<string, string>} */
    const out = {};
    headers.forEach((value, key) => {
      out[String(key)] = String(value);
    });
    return out;
  }
  if (typeof headers === "object") {
    /** @type {Record<string, string>} */
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value != null) out[key] = String(value);
    }
    return out;
  }
  return {};
}

/**
 * Build request headers that ALWAYS carry Authorization: Bearer <token>.
 * Prefer getAccessToken(); never rely on object-spread of a Headers instance.
 * @param {{ getAccessToken: () => Promise<string>, getRequestHeaders?: () => Promise<unknown> }} auth
 * @returns {Promise<Record<string, string>>}
 */
export async function buildBearerAuthHeaders(auth) {
  const token = await auth.getAccessToken();
  if (!token || typeof token !== "string") {
    const err = new Error(
      `${GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE}: empty impersonated token for request`,
    );
    err.code = GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE;
    throw err;
  }
  let extra = {};
  if (typeof auth.getRequestHeaders === "function") {
    try {
      extra = headersToPlainRecord(await auth.getRequestHeaders());
    } catch {
      // Token alone is sufficient for Workstations REST.
    }
  }
  // Drop any prior Authorization from extra; force the impersonated bearer.
  const normalized = { ...extra };
  for (const key of Object.keys(normalized)) {
    if (key.toLowerCase() === "authorization") delete normalized[key];
  }
  return {
    ...normalized,
    Authorization: `Bearer ${token}`,
  };
}

/** @param {Record<string, string>|Headers|unknown} headers */
export function hasBearerAuthorization(headers) {
  const record = headersToPlainRecord(headers);
  const authz =
    record.Authorization ||
    record.authorization ||
    Object.entries(record).find(([k]) => k.toLowerCase() === "authorization")?.[1];
  return typeof authz === "string" && /^Bearer\s+\S+/i.test(authz);
}

/**
 * @param {object} [opts]
 * @param {string} [opts.targetPrincipal]
 * @param {string[]} [opts.targetScopes]
 * @returns {Promise<{ getAccessToken: () => Promise<string>, getRequestHeaders: () => Promise<Record<string,string>>, targetPrincipal: string }>}
 */
export async function createImpersonatedControlAuth(opts = {}) {
  const targetPrincipal = opts.targetPrincipal || GC1_CONTROL_SA;
  const targetScopes = opts.targetScopes || [GC1_AUTH_SCOPE];

  // Refuse any JSON-key shaped input — hard fence.
  if (opts.credentials || opts.keyFilename || opts.keyFile || opts.client_email) {
    const err = new Error(
      `${GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE}: static SA JSON keys are refused; use ADC impersonation only`,
    );
    err.code = GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE;
    throw err;
  }

  let GoogleAuth;
  let Impersonated;
  try {
    const mod = await import("google-auth-library");
    GoogleAuth = mod.GoogleAuth;
    Impersonated = mod.Impersonated;
  } catch (cause) {
    const err = new Error(
      `${GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE}: google-auth-library unavailable`,
      { cause },
    );
    err.code = GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE;
    throw err;
  }

  try {
    const auth = new GoogleAuth({ scopes: targetScopes });
    const sourceClient = await auth.getClient();
    const impersonated = new Impersonated({
      sourceClient,
      targetPrincipal,
      targetScopes,
      lifetime: 3600,
    });

    return {
      targetPrincipal,
      kind: "impersonated-adc",
      async getAccessToken() {
        const res = await impersonated.getAccessToken();
        const token = typeof res === "string" ? res : res?.token;
        if (!token) {
          const err = new Error(
            `${GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE}: empty impersonated token`,
          );
          err.code = GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE;
          throw err;
        }
        return token;
      },
      async getRequestHeaders() {
        // Always return a plain record — never a Fetch Headers instance.
        // `{...headers}` on a Headers object is `{}` (CREDENTIALS_MISSING bug).
        const headers = await impersonated.getRequestHeaders();
        const record = headersToPlainRecord(headers);
        if (!hasBearerAuthorization(record)) {
          const res = await impersonated.getAccessToken();
          const token = typeof res === "string" ? res : res?.token;
          if (!token) {
            const err = new Error(
              `${GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE}: empty impersonated token`,
            );
            err.code = GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE;
            throw err;
          }
          return { ...record, Authorization: `Bearer ${token}` };
        }
        return record;
      },
      /** @internal test/introspection — never pass into workstation payloads */
      _impersonatedClient: impersonated,
    };
  } catch (cause) {
    if (cause?.code === GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE) throw cause;
    const err = new Error(
      `${GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE}: impersonation failed — refusing billable work`,
      { cause },
    );
    err.code = GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE;
    throw err;
  }
}

/**
 * Construct real GCP transport only when live-smoke env gate is set.
 * Canonical suite must never call this successfully without GC1_LIVE_SMOKE=1.
 */
export function assertLiveSmokeAuthorized() {
  if (process.env.GC1_LIVE_SMOKE !== "1") {
    const err = new Error(
      `${GC1_ERROR.LIVE_SMOKE_FORBIDDEN}: GcpWorkstationTransport requires GC1_LIVE_SMOKE=1`,
    );
    err.code = GC1_ERROR.LIVE_SMOKE_FORBIDDEN;
    throw err;
  }
}
