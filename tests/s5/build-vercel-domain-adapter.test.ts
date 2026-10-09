import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { P11_PROVIDER_CONTRACTS, makeP11VercelApiCommand, executeP11VercelApi,
  reduceP11Project, reduceP11TeamDomainPage, reduceP11ProjectDomainPage, reduceP11DnsPage, classifyP11Hostname,
  reduceP11Certificates, reduceP11DomainConfig, makeP11RequiredRecords, observeP11VercelDomain } from "../../scripts/pathcode-cli/build/index.mjs";

const teamRef = "team_SqWewpQeCPwU8WuZNHTGViOO";
const projectRef = "path-p10-production-acceptance";
const projectId = "prj_HiUd222ObwDcp1fljJc81JbJWUS7";
const observedDomainConfig = {
  serviceType: "zeit.world", misconfigured: false,
  nameservers: ["ns4.vercel-dns-3.com", "ns1.vercel-dns-3.com", "ns3.vercel-dns-3.com", "ns2.vercel-dns-3.com"],
  recommendedIPv4: [{ rank: 1, value: ["216.150.1.1", "216.150.16.1"] }, { rank: 2, value: ["76.76.21.21"] }],
  recommendedCNAME: [{ rank: 1, value: "80a3d569c568ca8b.vercel-dns-016.com." }, { rank: 2, value: "cname.vercel-dns.com." }],
  acceptedChallenges: ["http-01", "dns-01"], conflicts: [],
};

describe("P11 Vercel structured provider boundary", () => {
  it("freezes machine-readable API routes and methods for each load-bearing operation", () => {
    expect(P11_PROVIDER_CONTRACTS).toMatchObject({
      team_domains: { method: "GET", path: "/v5/domains" },
      project_domains: { method: "GET", path: "/v9/projects/{projectRef}/domains" },
      attach: { method: "POST", path: "/v10/projects/{projectRef}/domains" },
      verify: { method: "POST", path: "/v9/projects/{projectRef}/domains/{fqdn}/verify" },
      dns_records: { method: "GET", path: "/v5/domains/{fqdn}/records" },
      dns_create: { method: "POST", path: "/v3/domains/{fqdn}/records" },
      certificates: { method: "GET", path: "/v4/certs" },
      detach: { method: "DELETE", path: "/v9/projects/{projectRef}/domains/{fqdn}" },
      enable_managed_dns: { method: "PATCH", path: "/v3/domains/{zoneFqdn}" },
    });
    expect(makeP11VercelApiCommand("attach", { fqdn: "example.com", projectRef, teamRef }))
      .toMatchObject({ argv: ["api", `/v10/projects/${projectRef}/domains?teamId=${teamRef}`, "-X", "POST", "--include", "--input", "-"], stdinPayload: JSON.stringify({ name: "example.com" }) });
    expect(makeP11VercelApiCommand("verify", { fqdn: "example.com", projectRef, teamRef }).argv[3]).toBe("POST");
    expect(makeP11VercelApiCommand("team_domains", { teamRef, next: 1789474826452 }).argv[1])
      .toContain("&until=1789474826452");
    expect(makeP11VercelApiCommand("detach", { fqdn: "example.com", projectRef, teamRef }).argv[3]).toBe("DELETE");
    expect(makeP11VercelApiCommand("dns_create", { fqdn: "example.com", projectRef, teamRef,
      teamClaimState: "claimed", dnsMode: "vercel_managed", dnsZone: "example.com",
      record: { type: "TXT", name: "_verify", value: "exact", purpose: "ownership" } }).stdinPayload)
      .toBe(JSON.stringify({ type: "TXT", name: "_verify", value: "exact" }));
    const enable = makeP11VercelApiCommand("enable_managed_dns", { zoneFqdn: "pathcode.dk", teamRef });
    expect(enable).toMatchObject({ argv: ["api", `/v3/domains/pathcode.dk?teamId=${teamRef}`, "-X", "PATCH", "--include", "--input", "-"],
      stdinPayload: JSON.stringify({ op: "update", zone: true }) });
    for (const extra of [{ op: "move-out" }, { destination: "other" }, { renew: true }, { customNameservers: [] },
      { nameservers: ["attacker.test"] }, { body: { op: "move-out" } }, { requestBody: {} }])
      expect(makeP11VercelApiCommand("enable_managed_dns", { zoneFqdn: "pathcode.dk", teamRef, ...extra })).toMatchObject({ ok: false });
    for (const zoneFqdn of ["bad", "pathcode.vercel.app", "pathcode.dk."])
      expect(makeP11VercelApiCommand("enable_managed_dns", { zoneFqdn, teamRef })).toMatchObject({ ok: false });
    expect(makeP11VercelApiCommand("enable_managed_dns", { zoneFqdn: "pathcode.dk", teamRef: "unsafe/team" })).toMatchObject({ ok: false });
  });

  it("executor rejects human CLI commands, forged routes, and context mismatch before spawn", async () => {
    let spawns = 0;
    const spawnImpl = (() => { spawns++; throw new Error("must reject before spawn"); }) as any;
    const human = { ok: true, executable: "vercel", argv: ["domains", "ls"], shell: false, stdinPayload: null };
    expect(await executeP11VercelApi(human, { cwd: "/tmp", spawnImpl })).toMatchObject({ ok: false, code: "P11_PROVIDER_COMMAND_INVALID" });
    const forged = makeP11VercelApiCommand("project_domains", { projectRef, teamRef });
    forged.argv[1] = "/v9/projects/other/domains?teamId=team-other&production=true&limit=100";
    expect(await executeP11VercelApi(forged, { cwd: "/tmp", spawnImpl })).toMatchObject({ ok: false, code: "P11_PROVIDER_COMMAND_INVALID" });
    expect(spawns).toBe(0);
  });

  it("runs only an exact builder command and reduces structured JSON", async () => {
    const spec = makeP11VercelApiCommand("project_domains", { projectRef, teamRef });
    const spawnImpl = ((_exe: string, argv: string[], options: any) => {
      expect(argv).toEqual(spec.argv);
      expect(options.shell).toBe(false);
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
      child.kill = () => {};
      queueMicrotask(() => { child.stdout.end(`HTTP 200 OK\ncontent-type: application/json\n\n${JSON.stringify({ domains: [], pagination: { count: 0, next: null, prev: null } })}`); child.emit("close", 0); });
      return child;
    }) as any;
    const result = await executeP11VercelApi(spec, { cwd: "/tmp", parentEnv: {}, spawnImpl });
    expect(result).toEqual({ ok: true, raw: { domains: [], pagination: { count: 0, next: null, prev: null } } });
  });

  it("executes the exact hardcoded managed-zone PATCH and rejects body tampering before spawn", async () => {
    const spec = makeP11VercelApiCommand("enable_managed_dns", { zoneFqdn: "pathcode.dk", teamRef });
    let spawns = 0; let stdin = "";
    const spawnImpl = ((_exe: string, argv: string[], options: any) => {
      spawns++;
      expect(_exe).toBe("vercel"); expect(argv).toEqual(spec.argv); expect(options.shell).toBe(false);
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {};
      child.stdin.on("data", (chunk: any) => { stdin += chunk.toString(); });
      queueMicrotask(() => { child.stdout.end("HTTP 200 OK\ncontent-type: application/json\n\n{}"); child.emit("close", 0); });
      return child;
    }) as any;
    expect(await executeP11VercelApi(spec, { cwd: "/tmp", parentEnv: {}, spawnImpl })).toMatchObject({ ok: true });
    expect(stdin).toBe(JSON.stringify({ op: "update", zone: true }));
    const forged = { ...spec, stdinPayload: JSON.stringify({ op: "move-out", destination: "elsewhere" }) };
    expect(await executeP11VercelApi(forged, { cwd: "/tmp", parentEnv: {}, spawnImpl }))
      .toMatchObject({ ok: false, code: "P11_PROVIDER_COMMAND_INVALID" });
    expect(spawns).toBe(1);
  });

  it.each([[404, "not_found"], [403, "forbidden"], [429, "rate_limited"]])(
    "retains bounded structured diagnostics for HTTP %i", async (status, providerCode) => {
      const spec = makeP11VercelApiCommand("project_domains", { projectRef, teamRef });
      const spawnImpl = ((_exe: string, _argv: string[], _options: any) => {
        const child = new EventEmitter() as any;
        child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {};
        queueMicrotask(() => {
          child.stdout.end(`HTTP ${status} Failure\ncontent-type: application/json\n\n${JSON.stringify({ error: { code: providerCode, message: "safe test" }, rawSecret: "never-return" })}`);
          child.emit("close", 1);
        });
        return child;
      }) as any;
      const result = await executeP11VercelApi(spec, { cwd: "/tmp", parentEnv: {}, spawnImpl });
      expect(result).toEqual({ ok: false, code: "P11_PROVIDER_READ_FAILED", httpStatus: status, providerCode });
      expect(JSON.stringify(result)).not.toContain("never-return");
    });

  it("treats malformed successful structured output as unsafe, not an HTTP failure", async () => {
    const spec = makeP11VercelApiCommand("project_domains", { projectRef, teamRef });
    const spawnImpl = ((_exe: string, _argv: string[], _options: any) => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {};
      queueMicrotask(() => { child.stdout.end("HTTP 200 OK\ncontent-type: application/json\n\nnot-json"); child.emit("close", 0); });
      return child;
    }) as any;
    expect(await executeP11VercelApi(spec, { cwd: "/tmp", parentEnv: {}, spawnImpl }))
      .toEqual({ ok: false, code: "P11_PROVIDER_OUTPUT_UNSAFE" });
  });

  it("validates team claim context independently from exact project attachment", () => {
    const team = reduceP11TeamDomainPage({ contextName: "nordic-rain", domains: [
      { name: "example.com", nameservers: "vercel", serviceType: "zeit.world", teamId: teamRef },
    ], pagination: { count: 1, next: null, prev: null } }, teamRef);
    expect(team).toMatchObject({ ok: true, teamRef, domains: [{ fqdn: "example.com", dnsMode: "vercel_managed", teamClaimState: "claimed" }] });
    expect(reduceP11TeamDomainPage({ domains: [], pagination: { count: 0, next: null, prev: null } }, teamRef)).toMatchObject({ ok: true });
    expect(reduceP11TeamDomainPage({ contextName: "", domains: [], pagination: { count: 0, next: null, prev: null } }, teamRef))
      .toMatchObject({ ok: false, code: "P11_PROVIDER_SHAPE_UNSAFE" });
    expect(reduceP11Project({ id: projectId, name: projectRef, teamId: "wrong" }, { teamRef }))
      .toMatchObject({ ok: false, code: "P11_PROVIDER_SHAPE_UNSAFE" });
  });

  it("reduces intended nameservers strictly and preserves current-versus-intended DNS authority", () => {
    const page = (row: any) => reduceP11TeamDomainPage({ domains: [{ name: "pathcode.dk", teamId: teamRef, ...row }],
      pagination: { count: 1, next: null, prev: null } }, teamRef);
    expect(page({})).toMatchObject({ ok: true, domains: [{ intendedNameservers: [], currentNameservers: null }] });
    expect(page({ intendedNameservers: [] })).toMatchObject({ ok: true, domains: [{ intendedNameservers: [] }] });
    expect(page({ intendedNameservers: ["NS1.VERCEL-DNS.TEST.", "ns2.vercel-dns.test"],
      nameservers: ["ns1.simply.com"], serviceType: "zeit.world" }))
      .toMatchObject({ ok: true, domains: [{ intendedNameservers: ["ns1.vercel-dns.test", "ns2.vercel-dns.test"], dnsMode: "external" }] });
    expect(page({ intendedNameservers: ["ns1.vercel-dns.test"], nameservers: ["ns1.vercel-dns.test"], serviceType: "zeit.world" }))
      .toMatchObject({ ok: true, domains: [{ dnsMode: "vercel_managed" }] });
    expect(page({ intendedNameservers: "ns1.vercel-dns.test" })).toMatchObject({ ok: false, code: "P11_PROVIDER_SHAPE_UNSAFE" });
    expect(page({ intendedNameservers: ["bad hostname"] })).toMatchObject({ ok: false, code: "P11_PROVIDER_SHAPE_UNSAFE" });
    expect(JSON.stringify(page({ intendedNameservers: [], creatorEmail: "private@example.com", accountDetails: { token: "secret" } })))
      .not.toContain("private@example.com");
  });

  it("uses the exact provider apex plus exact scoped team row, never a suffix guess", async () => {
    const responses: Record<string, any> = {
      team_domains: { domains: [{ name: "pathcode.dk", teamId: teamRef, serviceType: "external", nameservers: ["ns.simply.com"],
        intendedNameservers: ["ns1.provider-dns.test"] }, { name: "other.pathcode.dk", teamId: teamRef }],
        pagination: { count: 2, next: null, prev: null } },
      project: { id: projectId, name: projectRef, teamId: teamRef },
      project_domains: { domains: [{ name: "p11-acceptance.pathcode.dk", apexName: "pathcode.dk", projectId, verified: true, verification: [] }],
        pagination: { count: 1, next: null, prev: null } },
      project_domain: { name: "p11-acceptance.pathcode.dk", apexName: "pathcode.dk", projectId, verified: true, verification: [] },
      domain_config: { serviceType: "external", misconfigured: true }, certificates: { certs: [], pagination: {} },
    };
    const seen: string[] = [];
    const result = await observeP11VercelDomain({ fqdn: "p11-acceptance.pathcode.dk", projectRef, teamRef }, { cwd: "/tmp",
      execute: async (spec: any) => { const kind = spec.proofContext.kind; seen.push(kind); return { ok: true, raw: responses[kind] }; },
      httpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    expect(result).toMatchObject({ ok: true, providerApexName: "pathcode.dk", intendedNameservers: ["ns1.provider-dns.test"],
      providerZoneObservation: { zoneFqdn: "pathcode.dk", teamRef }, dnsMode: "external" });
    expect(seen).toContain("project_domain");
    const deceptive: Record<string, any> = { ...responses, team_domains: { ...responses.team_domains, domains: [responses.team_domains.domains[1]] } };
    const missing = await observeP11VercelDomain({ fqdn: "p11-acceptance.pathcode.dk", projectRef, teamRef }, { cwd: "/tmp",
      execute: async (spec: any) => ({ ok: true, raw: deceptive[spec.proofContext.kind] }),
      httpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    expect(missing).toMatchObject({ ok: true, providerApexName: null, intendedNameservers: [], providerZoneObservation: null });
  });

  it("rejects wrong project, wrong target, missing identity, and redirects in project-domain evidence", () => {
    const row = { name: "example.com", apexName: "example.com", projectId, verified: false, verification: [] };
    const page = (domains: unknown[]) => ({ domains, pagination: { count: domains.length, next: null, prev: null } });
    expect(reduceP11ProjectDomainPage(page([row]), { projectId, projectRef, teamRef })).toMatchObject({ ok: true });
    expect(reduceP11ProjectDomainPage(page([{ ...row, projectId: "other-project" }]), { projectId, projectRef, teamRef }))
      .toMatchObject({ ok: false, code: "P11_PROVIDER_SHAPE_UNSAFE" });
    expect(reduceP11ProjectDomainPage(page([{ ...row, verified: "yes" }]), { projectId, projectRef, teamRef }))
      .toMatchObject({ ok: false, code: "P11_PROVIDER_SHAPE_UNSAFE" });
    expect(reduceP11ProjectDomainPage(page([{ ...row, redirect: "other.example" }]), { projectId, projectRef, teamRef }))
      .toMatchObject({ ok: true, domains: [{ redirect: "other.example" }] });
  });

  it("parses automatic platform project hostnames and excludes them from P11 while preserving custom domains", () => {
    const platform = { name: "path-p10-production-acceptance.vercel.app", apexName: "vercel.app", projectId,
      verified: true, verification: [] };
    const page = (domains: unknown[]) => ({ domains, pagination: { count: domains.length, next: null, prev: null } });
    expect(reduceP11ProjectDomainPage(page([platform]), { projectId, projectRef, teamRef }))
      .toMatchObject({ ok: true, domains: [], providerPlatformHostnameCount: 1 });
    const custom = { name: "example.com", apexName: "example.com", projectId, verified: false, verification: [] };
    expect(reduceP11ProjectDomainPage(page([platform, custom]), { projectId, projectRef, teamRef }))
      .toMatchObject({ ok: true, domains: [{ fqdn: "example.com" }], providerPlatformHostnameCount: 1 });
    expect(classifyP11Hostname("path-p10-production-acceptance.vercel.app")).toBe("provider_platform_hostname");
    for (const kind of ["attach", "verify", "dns_records", "dns_create", "detach", "domain_config", "project_domain"]) {
      expect(makeP11VercelApiCommand(kind, { fqdn: platform.name, projectRef, teamRef, teamClaimState: "claimed",
        dnsMode: "vercel_managed", dnsZone: "vercel.app", record: { type: "TXT", name: "_v", value: "x", purpose: "ownership" } }))
        .toMatchObject({ ok: false, code: "P11_PLATFORM_HOSTNAME_UNSUPPORTED" });
    }
    expect(makeP11VercelApiCommand("dns_records", { fqdn: "example.com", projectRef, teamRef,
      teamClaimState: "claimed", dnsMode: "vercel_managed", dnsZone: "example.com" })).toMatchObject({ ok: true });
    expect(makeP11VercelApiCommand("dns_records", { fqdn: "www.example.com", projectRef, teamRef,
      teamClaimState: "claimed", dnsMode: "vercel_managed", dnsZone: "example.com" }).argv[1])
      .toBe(`/v5/domains/example.com/records?teamId=${teamRef}&limit=100`);
    expect(makeP11VercelApiCommand("dns_records", { fqdn: "example.com", projectRef, teamRef,
      teamClaimState: "claimed", dnsMode: "vercel_managed", dnsZone: "not-example.com" }))
      .toMatchObject({ ok: false, code: "P11_DNS_ZONE_AUTHORITY_REQUIRED" });
  });

  it("strictly reduces DNS, certificate, and domain configuration records", () => {
    expect(reduceP11DnsPage({ records: [{ id: "record-1", name: "_verify", type: "TXT", value: "v", ttl: 60 }],
      pagination: { count: 1, next: null, prev: null } })).toMatchObject({ ok: true, records: [{ recordId: "record-1", type: "TXT", value: "v" }] });
    expect(reduceP11DnsPage({ records: [{ id: "r", name: "@", type: "A", value: "1.2.3.4", surprise: true }], pagination: { count: 1, next: null, prev: null } }))
      .toMatchObject({ ok: false, code: "P11_PROVIDER_SHAPE_UNSAFE" });
    expect(reduceP11Certificates({ certs: [{ uid: "cert-1", cns: ["example.com", "*.example.com"], expiration: "2027-01-01T00:00:00Z",
      created: "2026-01-01T00:00:00Z", autoRenew: true }], pagination: {} })).toMatchObject({ ok: true, certificates: [{ names: ["example.com", "*.example.com"] }] });
    expect(reduceP11DomainConfig({ serviceType: "zeit.world", misconfigured: false, nameservers: [], recommendedIPv4: [{ rank: 1, value: ["192.0.2.1"] }] }, "example.com"))
      .toMatchObject({ ok: true, dnsMode: "vercel_managed", dnsState: "valid", hasConflict: false });
    expect(makeP11RequiredRecords({ fqdn: "example.com", apexName: "example.com", config: { recommendedIPv4: [{ rank: 1, value: ["192.0.2.1"] }] } }))
      .toMatchObject({ ok: true, requiredRecords: [{ type: "A", name: "", value: "192.0.2.1", purpose: "routing" }] });
  });

  it("accepts the real structured config response shape and reduces conflicts without retaining raw entries", () => {
    expect(reduceP11DomainConfig(observedDomainConfig, "example.com"))
      .toMatchObject({ ok: true, fqdn: "example.com", dnsMode: "vercel_managed",
        dnsState: "valid", hasConflict: false, misconfigured: false, nameservers: expect.arrayContaining([expect.any(String)]) });
    expect(reduceP11DomainConfig(observedDomainConfig, "path-p10-production-acceptance.vercel.app"))
      .toMatchObject({ ok: false, code: "P11_PLATFORM_HOSTNAME_UNSUPPORTED" });
    const conflictRaw = { ...observedDomainConfig, conflicts: [{ type: "CAA", name: "@", value: "issue \"other-ca.example\"" }] };
    for (const misconfigured of [false, true]) {
      const result = reduceP11DomainConfig({ ...conflictRaw, misconfigured }, "example.com");
      expect(result).toMatchObject({ ok: true, dnsState: "conflict", hasConflict: true, misconfigured });
      expect(JSON.stringify(result)).not.toContain("other-ca.example");
    }
  });

  it("rejects malformed conflicts and still rejects unknown top-level config fields", () => {
    for (const conflicts of ["bad", {}]) {
      expect(reduceP11DomainConfig({ ...observedDomainConfig, conflicts }, "example.com"))
        .toMatchObject({ ok: false, code: "P11_PROVIDER_SHAPE_UNSAFE" });
    }
    expect(reduceP11DomainConfig({ ...observedDomainConfig, unrecognizedFact: true }, "example.com"))
      .toMatchObject({ ok: false, code: "P11_PROVIDER_SHAPE_UNSAFE" });
  });

  it("keeps read-only diagnosis on GET methods and skips DNS-record listing for external DNS", async () => {
    const calls: string[] = [];
    const execute = async (spec: any) => {
      calls.push(spec.argv[1]);
      const kind = spec.proofContext.kind;
      const responses: Record<string, any> = {
        team_domains: { domains: [], pagination: { count: 0, next: null, prev: null } },
        project: { id: projectId, name: projectRef, teamId: teamRef },
        project_domains: { domains: [], pagination: { count: 0, next: null, prev: null } },
        domain_config: { serviceType: "external", misconfigured: true, nameservers: ["ns1.external.test"] },
        certificates: { certs: [], pagination: {} },
        dns_records: { records: [], pagination: { count: 0, next: null, prev: null } },
      };
      const raw = responses[kind];
      expect(spec.argv[3]).toBe("GET");
      return { ok: true, raw };
    };
    const result = await observeP11VercelDomain({ fqdn: "example.com", projectRef, teamRef }, {
      cwd: "/tmp", execute, httpsProbe: async () => ({ ok: true, fqdn: "example.com", handshakeOk: false,
        validFrom: null, validTo: null, httpStatus: null, observedAt: "2026-10-08T12:00:00.000Z" }),
    });
    expect(result).toMatchObject({ ok: true, dnsMode: "external", dnsState: "action_required", attachmentState: "detached" });
    expect(calls.some((endpoint) => endpoint.includes("/records"))).toBe(false);
    expect(calls).toHaveLength(5);
  });

  it("does not issue project-domain/config/DNS reads for a platform hostname", async () => {
    const execute = vi.fn();
    const result = await observeP11VercelDomain({ fqdn: "path-p10-production-acceptance.vercel.app", projectRef, teamRef }, {
      cwd: "/tmp", execute, httpsProbe: vi.fn(),
    });
    expect(result).toMatchObject({ ok: false, code: "P11_PLATFORM_HOSTNAME_UNSUPPORTED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("reads DNS records only from a factually claimed managed team zone", async () => {
    const calls: any[] = [];
    const execute = async (spec: any) => {
      const kind = spec.proofContext.kind;
      calls.push({ kind, endpoint: spec.argv[1] });
      const responses: Record<string, any> = {
        team_domains: { domains: [{ name: "example.com", nameservers: "vercel", serviceType: "zeit.world", teamId: teamRef }],
          pagination: { count: 1, next: null, prev: null } },
        project: { id: projectId, name: projectRef, teamId: teamRef },
        project_domains: { domains: [{ name: "www.example.com", apexName: "example.com", projectId, verified: false, verification: [] }],
          pagination: { count: 1, next: null, prev: null } },
        project_domain: { name: "www.example.com", apexName: "example.com", projectId, verified: false, verification: [] },
        domain_config: { serviceType: "zeit.world", misconfigured: false },
        dns_records: { records: [], pagination: { count: 0, next: null, prev: null } },
        certificates: { certs: [], pagination: {} },
      };
      return { ok: true, raw: responses[kind] };
    };
    const result = await observeP11VercelDomain({ fqdn: "www.example.com", projectRef, teamRef }, { cwd: "/tmp", execute,
      httpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    expect(result).toMatchObject({ ok: true, teamClaimState: "claimed", dnsMode: "vercel_managed", dnsZone: "example.com" });
    expect(calls.find((call) => call.kind === "dns_records")?.endpoint)
      .toBe(`/v5/domains/example.com/records?teamId=${teamRef}&limit=100`);
  });

  it("does not infer Vercel DNS authority from domain-config without a team-owned zone", async () => {
    const calls: string[] = [];
    const execute = async (spec: any) => {
      const kind = spec.proofContext.kind; calls.push(kind);
      const responses: Record<string, any> = {
        team_domains: { domains: [], pagination: { count: 0, next: null, prev: null } },
        project: { id: projectId, name: projectRef, teamId: teamRef },
        project_domains: { domains: [], pagination: { count: 0, next: null, prev: null } },
        domain_config: { serviceType: "zeit.world", misconfigured: false },
        certificates: { certs: [], pagination: {} },
      };
      return { ok: true, raw: responses[kind] };
    };
    const result = await observeP11VercelDomain({ fqdn: "example.com", projectRef, teamRef }, { cwd: "/tmp", execute,
      httpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    expect(result).toMatchObject({ ok: true, teamClaimState: "unknown", dnsMode: "unknown", dnsRecords: [] });
    expect(calls).not.toContain("dns_records");
  });

  it("does not call verification or mutation during diagnosis", async () => {
    const methods: string[] = [];
    await observeP11VercelDomain({ fqdn: "example.com", projectRef, teamRef }, {
      cwd: "/tmp", execute: async (spec: any) => {
        methods.push(spec.argv[3]);
        const kind = spec.proofContext.kind;
        return { ok: true, raw: ({ team_domains: { domains: [], pagination: { count: 0, next: null, prev: null } },
          project: { id: projectId, name: projectRef, teamId: teamRef }, project_domains: { domains: [], pagination: { count: 0, next: null, prev: null } },
          domain_config: { serviceType: "external", misconfigured: false }, certificates: { certs: [], pagination: {} } } as any)[kind] };
      }, httpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }),
    });
    expect(methods.every((method) => method === "GET")).toBe(true);
  });
});
