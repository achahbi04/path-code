import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import https from "node:https";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error The focused .mjs module is exercised directly as runtime code.
import { createSupabaseProvisioningAdapter } from "../../scripts/pathcode-cli/build/supabase-provisioning-adapter.mjs";

const token = "synthetic-management-credential";
describe("Supabase provisioning adapter synthetic boundary", () => {
  it("lists only bounded specific regions with fixed organization query", async () => {
    let request: any;
    const adapter = createSupabaseProvisioningAdapter({ executor: async (value: any) => { request = value; return { statusCode: 200,
      body: Buffer.from(JSON.stringify({ all: { specific: [{ type: "specific", code: "eu-north-1", name: "Stockholm", provider: "AWS" }],
        smartGroup: [{ code: "emea" }] } })) }; } });
    expect(await adapter.availableRegions({ credential: token, organizationSlug: "org-1" })).toEqual({ ok: true,
      regions: [{ code: "eu-north-1", name: "Stockholm", provider: "AWS", status: null }] });
    expect(request).toMatchObject({ hostname: "api.supabase.com", port: 443, path: "/v1/projects/available-regions",
      method: "GET", query: "?organization_slug=org-1" });
    expect(JSON.stringify(request)).not.toContain("desired_instance_size");
  });
  it("creates once using the current bounded fixed request and reduces provider identity", async () => {
    const seen: any[] = [];
    const adapter = createSupabaseProvisioningAdapter({ executor: async (request: any) => { seen.push(request); return { statusCode: 201,
      body: Buffer.from(JSON.stringify({ ref: "project123", name: "db-abc", organization_slug: "org-1", region: "eu-north-1",
        status: "COMING_UP", extra: { ignored: true } })) }; } });
    const result = await adapter.createProject({ credential: token, dbPassword: "synthetic-db-password", name: "db-abc",
      organizationSlug: "org-1", region: "eu-north-1" });
    expect(result).toEqual({ ok: true, projectRef: "project123", projectName: "db-abc", organizationSlug: "org-1",
      region: "eu-north-1", projectStatus: "COMING_UP" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ protocol: "https:", hostname: "api.supabase.com", port: 443, method: "POST", path: "/v1/projects", rejectUnauthorized: true });
    expect(seen[0].body).toEqual({ name: "db-abc", organization_slug: "org-1", region: "eu-north-1", db_pass: "synthetic-db-password" });
    expect(seen[0].body).not.toHaveProperty("plan");
    expect(seen[0].body).not.toHaveProperty("desired_instance_size");
    expect(seen[0].token).toBe(token);
    expect(JSON.stringify(result)).not.toContain("synthetic");
  });
  it("classifies definite create rejections exactly and never retries", async () => {
    for (const [statusCode, state, code] of [
      [400, "action_required", "DATABASE_PROVISION_REJECTED"],
      [401, "action_required", "DATABASE_PROVIDER_CREDENTIAL_REJECTED"],
      [402, "action_required", "DATABASE_PROVISION_REJECTED"],
      [403, "action_required", "DATABASE_PROVIDER_PERMISSION_REQUIRED"],
      [422, "action_required", "DATABASE_PROVISION_REJECTED"],
    ] as const) {
      let calls = 0;
      const adapter = createSupabaseProvisioningAdapter({ executor: async () => { calls++; return { statusCode, body: Buffer.from("private response") }; } });
      const result = await adapter.createProject({ credential: "token-sentinel", dbPassword: "password-sentinel", name: "db-a",
        organizationSlug: "org-a", region: "eu-north-1" });
      expect(result).toEqual({ ok: false, state, code }); expect(calls).toBe(1);
      expect(JSON.stringify(result)).not.toContain("sentinel");
    }
  });
  it("keeps ambiguous create outcomes uncertain, bounded, and redacted", async () => {
    const cases: Array<[string, (request: any) => any]> = [
      ["5xx", () => ({ statusCode: 503, body: Buffer.from("secret body") })],
      ["redirect", () => ({ statusCode: 307, body: Buffer.from("") })],
      ["malformed success", () => ({ statusCode: 201, body: Buffer.from("{") })],
      ["name mismatch", () => ({ statusCode: 201, body: Buffer.from(JSON.stringify({ ref: "project123", name: "other" })) })],
      ["organization mismatch", () => ({ statusCode: 201, body: Buffer.from(JSON.stringify({ ref: "project123", name: "db-a", organization_slug: "other" })) })],
      ["region mismatch", () => ({ statusCode: 201, body: Buffer.from(JSON.stringify({ ref: "project123", name: "db-a", region: "other" })) })],
      ["network", () => { throw new Error("token-sentinel password-sentinel"); }],
    ];
    for (const [, response] of cases) {
      let calls = 0;
      const adapter = createSupabaseProvisioningAdapter({ executor: async (request: any) => { calls++; return response(request); } });
      const result = await adapter.createProject({ credential: "token-sentinel", dbPassword: "password-sentinel", name: "db-a",
        organizationSlug: "org-a", region: "eu-north-1" });
      expect(result).toMatchObject({ ok: false, state: "uncertain" }); expect(calls).toBe(1);
      expect(JSON.stringify(result)).not.toContain("sentinel");
    }
  });
  it("keeps ambiguous transport outcomes uncertain and never retries", async () => {
    let calls = 0;
    const adapter = createSupabaseProvisioningAdapter({ executor: async () => { calls++; throw Error("synthetic error"); } });
    expect(await adapter.createProject({ credential: token, dbPassword: "synthetic-db-password", name: "db-abc",
      organizationSlug: "org-1", region: "eu-north-1" })).toEqual({ ok: false, state: "uncertain", code: "DATABASE_PROVIDER_UNAVAILABLE" });
    expect(calls).toBe(1);
  });
  it("uses one fixed project listing and health request shape", async () => {
    const requests: any[] = [];
    const adapter = createSupabaseProvisioningAdapter({ executor: async (request: any) => { requests.push(request);
      return request.path.endsWith("/health") ? { statusCode: 200, body: Buffer.from('[{"name":"db","status":"ACTIVE_HEALTHY"}]') } :
        { statusCode: 200, body: Buffer.from(JSON.stringify({ projects: [{ ref: "project123", name: "db-abc",
          organization_slug: "org-1", region: "eu-north-1", status: "ACTIVE" }], pagination: { count: 1, offset: 0, limit: 100 } })) }; } });
    const listed = await adapter.listProjects({ credential: token, organizationSlug: "org-1", projectName: "db-abc" });
    expect(listed).toMatchObject({ ok: true, matches: [{ projectRef: "project123" }], truncated: false });
    expect(requests[0].path).toBe("/v1/organizations/org-1/projects");
    expect(requests[0].query).toBe("?offset=0&limit=100&search=db-abc");
    expect(await adapter.health({ credential: token, projectRef: "project123" })).toEqual({ ok: true, projectStatus: "ACTIVE_HEALTHY" });
    expect(requests[1].path).toBe("/v1/projects/project123/health");
  });
  it("reduces exact project-name matches, truncation, and malformed listings without creating", async () => {
    const responses = [
      { projects: [{ ref: "p1", name: "db-abcd-extra", region: "eu-north-1", status: "ACTIVE" }], pagination: { count: 1 } },
      { projects: [{ ref: "p1", name: "db-abcd", region: "eu-north-1", status: "ACTIVE" }], pagination: { count: 1 } },
      { projects: [{ ref: "p1", name: "db-abcd", region: "eu-north-1", status: "ACTIVE" }, { ref: "p2", name: "db-abcd", region: "eu-north-1", status: "ACTIVE" }], pagination: { count: 2 } },
      { projects: [], pagination: { count: 101 } },
      { projects: "malformed" },
    ];
    let calls = 0; let creates = 0;
    for (const body of responses) {
      calls = 0;
      const adapter = createSupabaseProvisioningAdapter({ executor: async (request: any) => { calls++; if (request.method === "POST") creates++;
        return { statusCode: 200, body: Buffer.from(JSON.stringify(body)) }; } });
      const result = await adapter.listProjects({ credential: token, organizationSlug: "org-1", projectName: "db-abcd" });
      expect(calls).toBe(1);
      if (body.projects === "malformed") expect(result).toEqual({ ok: false, state: "unavailable", code: "DATABASE_PROVIDER_RESPONSE_UNSAFE" });
      else if (body.pagination?.count === 101) expect(result).toMatchObject({ ok: true, matches: [], truncated: true });
      else if ((body.projects as any[]).length === 2) expect((result as any).matches.map((item: any) => item.projectRef)).toEqual(["p1", "p2"]);
      else expect(result).toMatchObject({ ok: true, matches: (body.projects as any[])[0]?.name === "db-abcd" ? [{ projectRef: "p1" }] : [], truncated: false });
    }
    expect(creates).toBe(0);
  });
  it("accepts only bounded health evidence and does not turn HTTP 200 into readiness", async () => {
    for (const [body, expected] of [
      ['[{"name":"db","status":"ACTIVE_HEALTHY"}]', { ok: true, projectStatus: "ACTIVE_HEALTHY" }],
      ['[{"name":"db","status":"COMING_UP"}]', { ok: true, projectStatus: "COMING_UP" }],
      ['[{"name":"db","status":"UNHEALTHY"}]', { ok: true, projectStatus: "UNHEALTHY" }],
      ['[{"name":"api","status":"ACTIVE_HEALTHY"}]', { ok: false, state: "unavailable", code: "DATABASE_PROVIDER_RESPONSE_UNSAFE" }],
      ['{"name":"db"}', { ok: false, state: "unavailable", code: "DATABASE_PROVIDER_RESPONSE_UNSAFE" }],
    ] as const) {
      let calls = 0;
      const adapter = createSupabaseProvisioningAdapter({ executor: async (_request: any) => { calls++; return { statusCode: 200, body: Buffer.from(body) }; } });
      expect(await adapter.health({ credential: token, projectRef: "project123" })).toEqual(expected);
      expect(calls).toBe(1);
    }
  });
  it("keeps the production HTTP request bounded to one fixed dispatch", async () => {
    let request: any; let calls = 0;
    const adapter = createSupabaseProvisioningAdapter({ executor: async (value: any) => { calls++; request = value; return { statusCode: 429, body: Buffer.alloc(0) }; } });
    expect(await adapter.createProject({ credential: "token-sentinel", dbPassword: "password-sentinel", name: "project-name",
      organizationSlug: "org", region: "eu" })).toMatchObject({ ok: false, state: "uncertain", code: "DATABASE_PROVIDER_UNAVAILABLE" });
    expect(calls).toBe(1);
    // The injected executor is the seam immediately below fixedRequest; the production request sets a 30s deadline and 64 KiB ceiling.
    expect(request).toMatchObject({ hostname: "api.supabase.com", port: 443, method: "POST", path: "/v1/projects", rejectUnauthorized: true });
    expect(request.token).toBe("token-sentinel");
    expect(request.body.db_pass).toBe("password-sentinel");
  });
  it("rejects oversized Content-Length in the actual fixedRequest before buffering", async () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/pathcode-cli/build/supabase-provisioning-adapter.mjs"), "utf8");
    expect(source).toContain("const LIMIT = 64 * 1024"); expect(source).toContain("setTimeout(() => req.destroy(new Error(\"timeout\")), 30_000)");
    const calls: any[] = [];
    const spy = vi.spyOn(https, "request").mockImplementation(((options: any, callback: any) => {
      calls.push(options); const request: any = new EventEmitter(); request.destroy = vi.fn(); request.end = vi.fn();
      const response: any = new EventEmitter(); response.statusCode = 200; response.headers = { "content-length": "70000" };
      response.destroy = vi.fn(); queueMicrotask(() => callback(response)); return request;
    }) as any);
    try {
      const adapter = createSupabaseProvisioningAdapter();
      const result = await adapter.createProject({ credential: "token-sentinel", dbPassword: "password-sentinel", name: "db-a",
        organizationSlug: "org-a", region: "eu-north-1" });
      expect(result).toMatchObject({ ok: false, state: "uncertain", code: "DATABASE_PROVIDER_UNAVAILABLE" });
      expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ protocol: "https:", hostname: "api.supabase.com", port: 443,
        method: "POST", path: "/v1/projects", rejectUnauthorized: true });
    } finally { spy.mockRestore(); }
  });
  it("does not follow a redirect in the actual fixedRequest", async () => {
    let calls = 0;
    const spy = vi.spyOn(https, "request").mockImplementation(((_options: any, callback: any) => {
      calls++; const request: any = new EventEmitter(); request.destroy = vi.fn(); request.end = vi.fn();
      const response: any = new EventEmitter(); response.statusCode = 302; response.headers = { "content-length": "0" };
      queueMicrotask(() => { callback(response); response.emit("end"); }); return request;
    }) as any);
    try {
      const result = await createSupabaseProvisioningAdapter().createProject({ credential: "token-sentinel", dbPassword: "password-sentinel",
        name: "db-a", organizationSlug: "org-a", region: "eu-north-1" });
      expect(result).toEqual({ ok: false, state: "uncertain", code: "DATABASE_PROVIDER_RESPONSE_UNSAFE" });
      expect(calls).toBe(1);
    } finally { spy.mockRestore(); }
  });
  it("aborts the actual fixedRequest when streamed response bytes exceed 64 KiB", async () => {
    let calls = 0; let destroyedRequest = false; let destroyedResponse = false;
    const spy = vi.spyOn(https, "request").mockImplementation(((_options: any, callback: any) => {
      calls++; const request: any = new EventEmitter(); request.destroy = vi.fn(() => { destroyedRequest = true; }); request.end = vi.fn();
      const response: any = new EventEmitter(); response.statusCode = 200; response.headers = {};
      response.destroy = vi.fn(() => { destroyedResponse = true; }); queueMicrotask(() => {
        callback(response); response.emit("data", Buffer.alloc(64 * 1024 + 1));
      }); return request;
    }) as any);
    try {
      const result = await createSupabaseProvisioningAdapter().createProject({ credential: "token-sentinel", dbPassword: "password-sentinel",
        name: "db-a", organizationSlug: "org-a", region: "eu-north-1" });
      expect(result).toMatchObject({ ok: false, state: "uncertain", code: "DATABASE_PROVIDER_UNAVAILABLE" });
      expect(calls).toBe(1); expect(destroyedRequest).toBe(true); expect(destroyedResponse).toBe(true);
      expect(JSON.stringify(result)).not.toContain("sentinel");
    } finally { spy.mockRestore(); }
  });
});
