import { describe, expect, it } from "vitest";
// @ts-expect-error Internal adapter transport injection is intentionally not exported through the public Build declarations.
import { createSupabaseManagementAdapter, SUPABASE_MANAGEMENT_ADAPTER_VERSION } from "../../scripts/pathcode-cli/build/supabase-management-adapter.mjs";

const token = "SYNTHETIC_MANAGEMENT_TOKEN_DO_NOT_LEAK";
const input = { credential: token, projectRef: "project-ref-123" };
const body = (value: unknown) => Buffer.from(JSON.stringify(value));

describe("Supabase Management project adapter", () => {
  it("uses one fixed GET request and reduces only project identity metadata", async () => {
    const requests: any[] = [];
    const adapter = createSupabaseManagementAdapter({ executor: async (request: any) => {
      requests.push(request);
      return { statusCode: 200, body: body({ ref: "project-ref-123", organization_slug: "team-one", region: "eu-north-1",
        status: "ACTIVE_HEALTHY", harmless_field: { ignored: true } }) };
    } });
    expect(adapter.adapterVersion).toBe(SUPABASE_MANAGEMENT_ADAPTER_VERSION);
    await expect(adapter.verify(input)).resolves.toEqual({ ok: true, projectRef: "project-ref-123",
      organizationSlug: "team-one", region: "eu-north-1", projectStatus: "ACTIVE_HEALTHY" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ protocol: "https:", hostname: "api.supabase.com", port: 443,
      path: "/v1/projects/project-ref-123", method: "GET", rejectUnauthorized: true,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": "PATH-Code" } });
    expect(JSON.stringify(await adapter.verify({ ...input, credential: "synthetic" }))).not.toContain(token);
  });

  it("rejects unsafe tokens and identity bodies without leaking token material", async () => {
    let calls = 0;
    const adapter = createSupabaseManagementAdapter({ executor: async () => { calls++; return { statusCode: 200, body: body({ ref: "other" }) }; } });
    await expect(adapter.verify({ ...input, credential: "bad\nheader" })).resolves.toMatchObject({ code: "DATABASE_PROVIDER_CREDENTIAL_REJECTED" });
    await expect(adapter.verify(input)).resolves.toMatchObject({ code: "DATABASE_PROVIDER_RESPONSE_UNSAFE" });
    expect(calls).toBe(1);
    expect(JSON.stringify(await adapter.verify(input))).not.toContain(token);
  });

  it.each([[401, "action_required", "DATABASE_PROVIDER_CREDENTIAL_REJECTED"],
    [403, "action_required", "DATABASE_PROVIDER_PERMISSION_REQUIRED"], [404, "action_required", "DATABASE_PROVIDER_PROJECT_NOT_FOUND"],
    [429, "unavailable", "DATABASE_PROVIDER_UNAVAILABLE"], [503, "unavailable", "DATABASE_PROVIDER_UNAVAILABLE"],
    [302, "unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE"], [422, "unavailable", "DATABASE_PROVIDER_RESPONSE_UNSAFE"]])(
    "bounds HTTP status %i", async (status, state, code) => {
      const adapter = createSupabaseManagementAdapter({ executor: async () => ({ statusCode: status, body: Buffer.from("private body") }) });
      await expect(adapter.verify(input)).resolves.toEqual({ ok: false, state, code });
    });

  it("rejects malformed and oversized responses, maps transport errors, and never retries", async () => {
    for (const bodyValue of [Buffer.from("{"), Buffer.from("[]"), Buffer.from(JSON.stringify({ ref: 4 })), Buffer.alloc(65_537)]) {
      const adapter = createSupabaseManagementAdapter({ executor: async () => ({ statusCode: 200, body: bodyValue }) });
      await expect(adapter.verify(input)).resolves.toMatchObject({ code: "DATABASE_PROVIDER_RESPONSE_UNSAFE" });
    }
    let count = 0;
    const adapter = createSupabaseManagementAdapter({ executor: async () => { count++; throw new Error(token); } });
    const result = await adapter.verify(input);
    expect(result).toEqual({ ok: false, state: "unavailable", code: "DATABASE_PROVIDER_UNAVAILABLE" });
    expect(count).toBe(1);
    expect(JSON.stringify(result)).not.toContain(token);
  });
});
