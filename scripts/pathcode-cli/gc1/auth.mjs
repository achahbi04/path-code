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
        const headers = await impersonated.getRequestHeaders();
        return headers && typeof headers === "object" ? { ...headers } : {};
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
