import https from "node:https";

export const GITHUB_IDENTITY_ADAPTER_VERSION = "github.identity.v1";
export const GITHUB_IDENTITY_API_VERSION = "2026-03-10";
export const GITHUB_IDENTITY_RESPONSE_MAX_BYTES = 64 * 1024;
export const GITHUB_IDENTITY_TIMEOUT_MS = 10_000;

const PROVIDER_CREDENTIAL_REJECTED = Object.freeze({ ok: false, code: "PROVIDER_CREDENTIAL_REJECTED" });
const PROVIDER_UNAVAILABLE = Object.freeze({ ok: false, code: "PROVIDER_UNAVAILABLE" });
const PROVIDER_RESPONSE_UNSAFE = Object.freeze({ ok: false, code: "PROVIDER_RESPONSE_UNSAFE" });
const SUCCESS_CAPABILITIES = Object.freeze(["github.identity.read"]);

function safeGitHubIdentityResponse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!Number.isSafeInteger(value.id) || value.id <= 0) return null;
  if (typeof value.login !== "string" || value.login.length < 1 || value.login.length > 80 ||
      value.login.trim() !== value.login || /[\u0000-\u001f\u007f-\u009f]/u.test(value.login)) return null;
  return Object.freeze({
    ok: true,
    providerAccountRef: `github:user:${value.id}`,
    capabilities: [...SUCCESS_CAPABILITIES],
  });
}

function statusFailure(statusCode) {
  if (statusCode === 401) return PROVIDER_CREDENTIAL_REJECTED;
  if (statusCode === 403 || statusCode === 429 || (statusCode >= 500 && statusCode <= 599))
    return PROVIDER_UNAVAILABLE;
  if (statusCode !== 200) return PROVIDER_RESPONSE_UNSAFE;
  return null;
}

function requestGitHubIdentity(token, requestImpl) {
  const requestOptions = Object.freeze({
    protocol: "https:",
    hostname: "api.github.com",
    port: 443,
    path: "/user",
    method: "GET",
    headers: Object.freeze({
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_IDENTITY_API_VERSION,
      "User-Agent": "PATH-Code",
    }),
    rejectUnauthorized: true,
  });

  return new Promise((resolve) => {
    let settled = false;
    let request;
    let deadline;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(result);
    };

    deadline = setTimeout(() => {
      finish(PROVIDER_UNAVAILABLE);
      request?.destroy?.();
    }, GITHUB_IDENTITY_TIMEOUT_MS);

    try {
      request = requestImpl(requestOptions, (response) => {
        const statusCode = Number(response.statusCode);
        const failure = statusFailure(statusCode);
        if (failure) {
          finish(failure);
          response.destroy?.();
          return;
        }

        const contentLength = response.headers?.["content-length"];
        if (contentLength !== undefined && /^\d+$/.test(String(contentLength)) &&
            Number(contentLength) > GITHUB_IDENTITY_RESPONSE_MAX_BYTES) {
          finish(PROVIDER_RESPONSE_UNSAFE);
          response.destroy?.();
          request.destroy();
          return;
        }

        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > GITHUB_IDENTITY_RESPONSE_MAX_BYTES) {
            finish(PROVIDER_RESPONSE_UNSAFE);
            response.destroy?.();
            request.destroy();
            return;
          }
          chunks.push(buffer);
        });
        response.once("error", () => finish(PROVIDER_UNAVAILABLE));
        response.once("end", () => {
          if (settled) return;
          let parsed;
          try {
            parsed = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
          } catch {
            finish(PROVIDER_RESPONSE_UNSAFE);
            return;
          }
          finish(safeGitHubIdentityResponse(parsed) ?? PROVIDER_RESPONSE_UNSAFE);
        });
      });
      request.once("error", () => finish(PROVIDER_UNAVAILABLE));
      request.setTimeout(GITHUB_IDENTITY_TIMEOUT_MS, () => {
        finish(PROVIDER_UNAVAILABLE);
        request.destroy();
      });
      request.end();
    } catch {
      request?.destroy?.();
      finish(PROVIDER_UNAVAILABLE);
    }
  });
}

/** Creates the fixed, read-only GitHub authenticated-user adapter. */
export function createGitHubIdentityAdapter({ requestImpl = https.request } = {}) {
  return Object.freeze({
    providerKey: "github",
    adapterVersion: GITHUB_IDENTITY_ADAPTER_VERSION,
    async verify(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) ||
          (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) ||
          Reflect.ownKeys(input).length !== 1 || !Object.hasOwn(input, "credentials")) return PROVIDER_CREDENTIAL_REJECTED;
      const credentials = input.credentials;
      if (!credentials || typeof credentials !== "object" || Array.isArray(credentials) ||
          (Object.getPrototypeOf(credentials) !== Object.prototype && Object.getPrototypeOf(credentials) !== null) ||
          Reflect.ownKeys(credentials).length !== 1 || !Object.hasOwn(credentials, "token")) return PROVIDER_CREDENTIAL_REJECTED;
      const token = credentials.token;
      if (typeof token !== "string" || token.length < 1 || token.length > 16_384 || /[\r\n\u0000]/u.test(token))
        return PROVIDER_CREDENTIAL_REJECTED;
      return requestGitHubIdentity(token, requestImpl);
    },
  });
}

export const githubIdentityResponseReducer = safeGitHubIdentityResponse;
