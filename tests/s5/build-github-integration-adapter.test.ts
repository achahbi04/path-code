import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  createGitHubIdentityAdapter, GITHUB_IDENTITY_API_VERSION,
  GITHUB_IDENTITY_RESPONSE_MAX_BYTES, GITHUB_IDENTITY_TIMEOUT_MS,
} from "../../scripts/pathcode-cli/build/index.mjs";

type Scenario = { statusCode?: number; body?: string | Buffer; headers?: Record<string, string>; error?: Error; timeout?: boolean };

function fakeRequest(scenario: Scenario, requests: any[]) {
  return (options: any, callback: (response: any) => void) => {
    const request = new EventEmitter() as any;
    requests.push({ options, request });
    request.setTimeout = (ms: number, onTimeout: () => void) => {
      request.timeoutMs = ms;
      if (scenario.timeout) request.timeoutCallback = onTimeout;
    };
    request.destroy = () => { request.destroyed = true; };
    request.end = () => setImmediate(() => {
      if (scenario.timeout) {
        request.timeoutCallback();
        return;
      }
      if (scenario.error) {
        request.emit("error", scenario.error);
        return;
      }
      const response = new EventEmitter() as any;
      response.statusCode = scenario.statusCode ?? 200;
      response.headers = scenario.headers ?? {};
      response.destroy = () => { response.destroyed = true; };
      response.resume = () => { response.resumed = true; };
      callback(response);
      if (scenario.body !== undefined) response.emit("data", Buffer.from(scenario.body));
      response.emit("end");
    });
    return request;
  };
}

const validBody = (extra: Record<string, unknown> = {}) => JSON.stringify({ id: 12345, login: "synthetic-user", ...extra });
const token = "P12_GITHUB_ADAPTER_TOKEN_SENTINEL";

describe("P12.3 GitHub identity adapter", () => {
  it("constructs exactly one fixed authenticated-user request and reduces unrelated profile fields away", async () => {
    const requests: any[] = [];
    const adapter = createGitHubIdentityAdapter({ requestImpl: fakeRequest({
      body: validBody({ name: "Private Name", email: "private@example.test", company: "Private Co", node_id: "N_123", extra: { x: 1 } }),
    }, requests) });
    const result = await adapter.verify({ credentials: { token } });
    expect(requests).toHaveLength(1);
    expect(requests[0].options).toMatchObject({ protocol: "https:", hostname: "api.github.com", port: 443,
      path: "/user", method: "GET", rejectUnauthorized: true,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": GITHUB_IDENTITY_API_VERSION, "User-Agent": "PATH-Code" } });
    expect(requests[0].options.headers["X-GitHub-Api-Version"]).toBe("2026-03-10");
    expect(result).toEqual({ ok: true, providerAccountRef: "github:user:12345", capabilities: ["github.identity.read"] });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain("synthetic-user");
    expect(JSON.stringify(result)).not.toContain("private@example.test");
  });

  it("classifies credential rejection, availability statuses, redirects, and unexpected client statuses", async () => {
    const cases: Array<[number, string]> = [
      [401, "PROVIDER_CREDENTIAL_REJECTED"],
      [403, "PROVIDER_UNAVAILABLE"], [429, "PROVIDER_UNAVAILABLE"],
      [500, "PROVIDER_UNAVAILABLE"], [502, "PROVIDER_UNAVAILABLE"], [503, "PROVIDER_UNAVAILABLE"],
      [302, "PROVIDER_RESPONSE_UNSAFE"], [304, "PROVIDER_RESPONSE_UNSAFE"], [404, "PROVIDER_RESPONSE_UNSAFE"],
    ];
    for (const [statusCode, code] of cases) {
      const requests: any[] = [];
      const adapter = createGitHubIdentityAdapter({ requestImpl: fakeRequest({ statusCode, body: "ignored" }, requests) });
      expect(await adapter.verify({ credentials: { token } })).toEqual({ ok: false, code });
      expect(requests).toHaveLength(1);
    }
  });

  it("rejects malformed identity JSON and oversized responses safely", async () => {
    const invalidBodies = ["not-json", "null", "[]", "{}", JSON.stringify({ id: 0, login: "user" }),
      JSON.stringify({ id: Number.MAX_SAFE_INTEGER + 1, login: "user" }), JSON.stringify({ id: 7 }),
      JSON.stringify({ id: 7, login: "" }), JSON.stringify({ id: 7, login: "bad\nlogin" }),
      JSON.stringify({ id: 7, login: "x".repeat(81) })];
    for (const body of invalidBodies) {
      const adapter = createGitHubIdentityAdapter({ requestImpl: fakeRequest({ body }, []) });
      expect(await adapter.verify({ credentials: { token } })).toEqual({ ok: false, code: "PROVIDER_RESPONSE_UNSAFE" });
    }
    const advertisedRequests: any[] = [];
    const advertised = createGitHubIdentityAdapter({ requestImpl: fakeRequest({
      headers: { "content-length": String(GITHUB_IDENTITY_RESPONSE_MAX_BYTES + 1) }, body: "{}",
    }, advertisedRequests) });
    expect(await advertised.verify({ credentials: { token } })).toEqual({ ok: false, code: "PROVIDER_RESPONSE_UNSAFE" });
    expect(advertisedRequests[0].request.destroyed).toBe(true);

    const streamedRequests: any[] = [];
    const streamed = createGitHubIdentityAdapter({ requestImpl: fakeRequest({ body: Buffer.alloc(GITHUB_IDENTITY_RESPONSE_MAX_BYTES + 1) }, streamedRequests) });
    expect(await streamed.verify({ credentials: { token } })).toEqual({ ok: false, code: "PROVIDER_RESPONSE_UNSAFE" });
    expect(streamedRequests[0].request.destroyed).toBe(true);
  });

  it("maps timeout, transport errors, and thrown transport details to unavailable without retry", async () => {
    for (const scenario of [{ timeout: true }, { error: new Error(`socket ${token}`) }]) {
      const requests: any[] = [];
      const impl = scenario.error ? (() => { requests.push({}); throw scenario.error; }) : fakeRequest(scenario, requests);
      const adapter = createGitHubIdentityAdapter({ requestImpl: impl as any });
      const result = await adapter.verify({ credentials: { token } });
      expect(result).toEqual({ ok: false, code: "PROVIDER_UNAVAILABLE" });
      expect(requests).toHaveLength(1);
      if (!scenario.error) {
        expect(requests[0].request.timeoutMs).toBe(GITHUB_IDENTITY_TIMEOUT_MS);
        if (scenario.timeout) expect(requests[0].request.destroyed).toBe(true);
      }
      expect(JSON.stringify(result)).not.toContain(token);
    }
  });

  it("rejects missing, extra, or unsafe credential roles before transport", async () => {
    const requests: any[] = [];
    const adapter = createGitHubIdentityAdapter({ requestImpl: fakeRequest({ body: validBody() }, requests) });
    for (const input of [null, {}, { credentials: {} }, { credentials: { token, other: "x" } },
      { credentials: { token: "" } }, { credentials: { token: `bad\r${token}` } },
      { credentials: { token: `bad\n${token}` } }, { credentials: { token: `bad\0${token}` } },
      { credentials: { token: "x".repeat(16_385) } }, { credentials: { token }, extra: true }]) {
      expect(await adapter.verify(input as any)).toEqual({ ok: false, code: "PROVIDER_CREDENTIAL_REJECTED" });
    }
    expect(requests).toHaveLength(0);
  });
});
