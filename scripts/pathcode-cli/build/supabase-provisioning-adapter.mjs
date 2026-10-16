import https from "node:https";

export const SUPABASE_PROVISIONING_ADAPTER_VERSION = "supabase.project.provision.v1";
const LIMIT = 64 * 1024;
const fail = (state, code) => ({ ok: false, state, code });
const safe = (v, max = 120) => typeof v === "string" && v.length > 0 && v.length <= max &&
  !/[\u0000-\u001f\u007f-\u009f]/.test(v);
function fixedRequest({ path, method, token, body, query }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ protocol: "https:", hostname: "api.supabase.com", port: 443, method,
      path: `${path}${query || ""}`, rejectUnauthorized: true,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": "PATH-Code",
        ...(body ? { "Content-Type": "application/json" } : {}) } }, (res) => {
      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > LIMIT) { req.destroy(); res.destroy(); reject(new Error("unsafe response")); return; }
      const chunks = []; let total = 0;
      res.on("data", (chunk) => { total += chunk.length; if (total > LIMIT) { req.destroy(); res.destroy(); reject(new Error("unsafe response")); }
        else chunks.push(chunk); });
      res.on("end", () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    const timer = setTimeout(() => req.destroy(new Error("timeout")), 30_000);
    req.on("close", () => clearTimeout(timer)); req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
function parse(response) {
  try { const body = Buffer.isBuffer(response?.body) ? response.body : Buffer.from(String(response?.body ?? ""));
    return body.length <= LIMIT ? JSON.parse(body.toString("utf8")) : null; } catch { return null; }
}
function classification(status, operation) {
  if (status === 401) return fail("action_required", "DATABASE_PROVIDER_CREDENTIAL_REJECTED");
  if (status === 403) return fail("action_required", "DATABASE_PROVIDER_PERMISSION_REQUIRED");
  if (operation !== "create" && status === 404) return fail("action_required", "DATABASE_PROVIDER_PROJECT_NOT_FOUND");
  if (operation === "create" && [400, 402, 422].includes(status)) return fail("action_required", "DATABASE_PROVISION_REJECTED");
  if (status >= 300 && status < 400) return fail("uncertain", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
  if (status === 429 || status >= 500) return fail("uncertain", "DATABASE_PROVIDER_UNAVAILABLE");
  return fail("uncertain", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
}
export function createSupabaseProvisioningAdapter({ executor = fixedRequest } = {}) {
  const call = async (path, method, token, body, query) => { try { return await executor({ protocol: "https:", hostname: "api.supabase.com",
    port: 443, path, method, rejectUnauthorized: true, token, body, query }); }
    catch { return null; } };
  const tokenValid = (token) => typeof token === "string" && token.length > 0 && token.length <= 16_384 && !/[\r\n\0]/.test(token);
  return Object.freeze({
    provider: "supabase", adapterVersion: SUPABASE_PROVISIONING_ADAPTER_VERSION,
    async availableRegions(input) {
      if (!input || Object.keys(input).sort().join(",") !== "credential,organizationSlug" || !tokenValid(input.credential) ||
          !/^[A-Za-z0-9_-]{1,80}$/.test(input.organizationSlug)) return fail("action_required", "DATABASE_PROVIDER_CREDENTIAL_REJECTED");
      const response = await call("/v1/projects/available-regions", "GET", input.credential, null,
        `?organization_slug=${encodeURIComponent(input.organizationSlug)}`);
      if (!response) return fail("unavailable", "DATABASE_PROVIDER_UNAVAILABLE");
      if (response.statusCode !== 200) return classification(response.statusCode, "regions");
      const payload = parse(response); const list = payload?.all?.specific;
      if (!Array.isArray(list) || list.length > 100) return fail("unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
      const regions = [];
      for (const item of list) {
        if (!item || typeof item !== "object" || item.type !== "specific" || !safe(item.code, 80) || !safe(item.name, 120) ||
            !safe(item.provider, 40) || (item.status !== undefined && !safe(item.status, 40))) continue;
        regions.push({ code: item.code, name: item.name, provider: item.provider, status: item.status ?? null });
      }
      return { ok: true, regions };
    },
    async createProject(input) {
      if (!input || Object.keys(input).sort().join(",") !== "credential,dbPassword,name,organizationSlug,region" ||
          !tokenValid(input.credential) || typeof input.dbPassword !== "string" || input.dbPassword.length < 1 ||
          input.dbPassword.length > 256 || /[\r\n\0]/.test(input.dbPassword) || !safe(input.name, 80) ||
          !/^[A-Za-z0-9_-]{1,80}$/.test(input.organizationSlug) || !/^[A-Za-z0-9_-]{1,80}$/.test(input.region))
        return fail("action_required", "DATABASE_PROVISION_REQUEST_INVALID");
      const response = await call("/v1/projects", "POST", input.credential,
        { name: input.name, organization_slug: input.organizationSlug, region: input.region, db_pass: input.dbPassword });
      if (!response) return fail("uncertain", "DATABASE_PROVIDER_UNAVAILABLE");
      if (response.statusCode !== 201) return classification(response.statusCode, "create");
      const p = parse(response);
      if (!p || !safe(p.ref, 80) || p.name !== input.name ||
          p.organization_slug !== undefined && p.organization_slug !== input.organizationSlug ||
          p.region !== undefined && p.region !== input.region || (p.status !== undefined && !safe(p.status, 80)))
        return fail("uncertain", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
      return { ok: true, projectRef: p.ref, projectName: p.name,
        organizationSlug: p.organization_slug ?? input.organizationSlug, region: p.region ?? input.region,
        projectStatus: p.status ?? null };
    },
    async listProjects(input) {
      if (!input || Object.keys(input).sort().join(",") !== "credential,organizationSlug,projectName" || !tokenValid(input.credential))
        return fail("action_required", "DATABASE_PROVIDER_CREDENTIAL_REJECTED");
      const query = `?offset=0&limit=100&search=${encodeURIComponent(input.projectName)}`;
      const response = await call(`/v1/organizations/${encodeURIComponent(input.organizationSlug)}/projects`, "GET", input.credential, null, query);
      if (!response) return fail("unavailable", "DATABASE_PROVIDER_UNAVAILABLE");
      if (response.statusCode !== 200) return classification(response.statusCode, "list");
      const p = parse(response); const projects = p?.projects;
      if (!Array.isArray(projects) || projects.length > 100) return fail("unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
      const matches = projects.filter((item) => item?.name === input.projectName)
        .map((item) => ({ projectRef: item.ref, projectName: item.name, organizationSlug: input.organizationSlug,
          region: item.region, projectStatus: item.status }))
        .filter((item) => safe(item.projectRef, 80) && safe(item.region, 80) && safe(item.projectStatus, 80));
      const pagination = p.pagination;
      const truncated = !pagination || !Number.isSafeInteger(pagination.count) || pagination.count > projects.length || projects.length === 100;
      return { ok: true, matches, truncated };
    },
    async health(input) {
      if (!input || Object.keys(input).sort().join(",") !== "credential,projectRef" || !tokenValid(input.credential) ||
          !/^[A-Za-z0-9_-]{1,80}$/.test(input.projectRef)) return fail("action_required", "DATABASE_PROVIDER_CREDENTIAL_REJECTED");
      const response = await call(`/v1/projects/${encodeURIComponent(input.projectRef)}/health`, "GET", input.credential, null, "?services=db");
      if (!response) return fail("unavailable", "DATABASE_PROVIDER_UNAVAILABLE");
      if (response.statusCode !== 200) return classification(response.statusCode, "health");
      const p = parse(response);
      if (!Array.isArray(p) || p.length > 32) return fail("unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
      const db = p.filter((item) => item?.name === "db");
      if (db.length !== 1 || !["COMING_UP", "ACTIVE_HEALTHY", "UNHEALTHY"].includes(db[0].status))
        return fail("unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE");
      return { ok: true, projectStatus: db[0].status };
    },
  });
}
