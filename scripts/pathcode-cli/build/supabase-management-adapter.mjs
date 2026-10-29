import https from "node:https";

export const SUPABASE_MANAGEMENT_ADAPTER_VERSION = "supabase.management.project.v1";
const MAX_BODY = 64 * 1024;
const fail = (state, code) => ({ ok: false, state, code });
const safeRef = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);

export function executeSupabaseManagementRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request({ protocol: "https:", hostname: "api.supabase.com", port: 443,
      path: options.path, method: options.method || "GET", headers: options.headers, rejectUnauthorized: true }, (res) => {
      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > MAX_BODY) {
        res.destroy(); req.destroy(); reject(new Error("response unsafe")); return;
      }
      const chunks = []; let total = 0;
      res.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_BODY) { res.destroy(); req.destroy(); reject(new Error("response unsafe")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    const deadline = setTimeout(() => req.destroy(new Error("timeout")), 10_000);
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
    req.end(options.body);
  });
}

function responseFailure(status) {
  if (status === 401) return fail("action_required", "DATABASE_PROVIDER_CREDENTIAL_REJECTED");
  if (status === 403) return fail("action_required", "DATABASE_PROVIDER_PERMISSION_REQUIRED");
  if (status === 404) return fail("action_required", "DATABASE_PROVIDER_PROJECT_NOT_FOUND");
  if (status === 429 || status >= 500) return fail("unavailable", "DATABASE_PROVIDER_UNAVAILABLE");
  if (status >= 300 && status < 400) return fail("unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
  return fail("unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
}

export function createSupabaseManagementAdapter({ executor = executeSupabaseManagementRequest } = {}) {
  return Object.freeze({
    provider: "supabase",
    adapterVersion: SUPABASE_MANAGEMENT_ADAPTER_VERSION,
    async verify(input) {
      if (!input || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).sort().join(",") !== "credential,projectRef" ||
          typeof input.credential !== "string" || input.credential.length < 1 || input.credential.length > 16_384 ||
          /[\r\n\0]/.test(input.credential) || !safeRef(input.projectRef))
        return fail("action_required", "DATABASE_PROVIDER_CREDENTIAL_REJECTED");
      let response;
      try {
        response = await executor({ protocol: "https:", hostname: "api.supabase.com", port: 443,
          path: `/v1/projects/${encodeURIComponent(input.projectRef)}`, method: "GET", rejectUnauthorized: true,
          headers: { Accept: "application/json", Authorization: `Bearer ${input.credential}`, "User-Agent": "PATH-Code" } });
      } catch { return fail("unavailable", "DATABASE_PROVIDER_UNAVAILABLE"); }
      const status = response?.statusCode;
      if (status !== 200) return responseFailure(status);
      let payload;
      try {
        const body = Buffer.isBuffer(response.body) ? response.body : Buffer.from(String(response.body ?? ""));
        if (body.byteLength > MAX_BODY) return fail("unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
        payload = JSON.parse(body.toString("utf8"));
      } catch { return fail("unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE"); }
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || !safeRef(payload.ref) || payload.ref !== input.projectRef)
        return fail("unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
      const optional = (key) => payload[key] === undefined ? null : safeRef(payload[key]) ? payload[key] : undefined;
      const organizationSlug = optional("organization_slug"); const region = optional("region"); const projectStatus = optional("status");
      if (organizationSlug === undefined || region === undefined || projectStatus === undefined)
        return fail("unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
      return { ok: true, projectRef: payload.ref, organizationSlug, region, projectStatus };
    },
  });
}
