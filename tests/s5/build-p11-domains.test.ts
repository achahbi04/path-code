import { describe, expect, it } from "vitest";
import { createBuildRecordSkeleton, P11_DOMAINS_SCHEMA, normalizeP11Fqdn, classifyP11Hostname,
  emptyP11DomainAuthority, readP11DomainAuthority, prepareP11DomainOperation,
  transitionP11DomainOperation, recordP11DomainObservation, classifyP11Tls,
  isPublicP11Address, probeP11Https } from "../../scripts/pathcode-cli/build/index.mjs";

const at = "2026-10-08T12:00:00.000Z";
const providerId = "dpl_12345678";

function releaseReady() {
  const record = createBuildRecordSkeleton({ outcome: "P11 test" });
  record.deployments = { schema: "pathcode.p10.deployments.v1", revision: 3,
    mappings: [{ mappingId: "mapping-prod", provider: "vercel", environmentId: "env-prod",
      teamRef: "team-nordic", projectRef: "project-prod", targetRef: "production", updatedAt: at }],
    deployments: [], releases: [{ releaseId: "release-1", operationId: "op-release",
      deploymentId: "deployment-1", action: "publish", providerDeploymentId: providerId,
      provider: "vercel", teamRef: "team-nordic", projectRef: "project-prod", mappingId: "mapping-prod",
      sourceSha: "source", environmentId: "env-prod", releasedAt: at, previousReleaseId: null }],
    releaseOperations: [], currentProductionReleaseId: "release-1",
    serving: { state: "verified", observedProviderDeploymentId: providerId, observedAt: at }, pendingOperation: null };
  return record;
}

function observation(fqdn = "example.com", extra: Record<string, unknown> = {}) {
  return { ok: true, fqdn, teamRef: "team-nordic", projectRef: "project-prod", teamClaimState: "claimed",
    attachmentState: "attached_unverified", verificationState: "action_required", dnsMode: "external",
    dnsState: "action_required", tlsState: "pending", requiredRecords: [], observedAt: at, verifiedAt: null, ...extra };
}

describe("P11 canonical domain authority", () => {
  it("loads a pre-P11 Build with deterministic empty state and no persisted mutation", () => {
    const record = createBuildRecordSkeleton({ outcome: "legacy" });
    const before = structuredClone(record);
    expect(readP11DomainAuthority(record)).toEqual({ ok: true, authority: emptyP11DomainAuthority() });
    expect(emptyP11DomainAuthority()).toEqual({ schema: P11_DOMAINS_SCHEMA, revision: 0, domains: [], pendingOperation: null, operationHistory: [] });
    expect(record).toEqual(before);
  });

  it("accepts normalized apex and subdomain names while rejecting wildcard and unsafe hostnames", () => {
    expect(normalizeP11Fqdn("Example.COM")).toBe("example.com");
    expect(normalizeP11Fqdn("www.example.com")).toBe("www.example.com");
    for (const value of ["*.example.com", "localhost", "127.0.0.1", "example..com", "-bad.example", "example.com.", "not a host"]) {
      expect(normalizeP11Fqdn(value)).toBeNull();
    }
    expect(prepareP11DomainOperation(releaseReady(), { kind: "attach", fqdn: "*.example.com", expectedRevision: 0 }))
      .toMatchObject({ ok: false, code: "P11_WILDCARD_UNSUPPORTED" });
  });

  it("classifies only mechanically evidenced platform suffixes after canonical hostname normalization", () => {
    for (const host of ["path-example.vercel.app", "PATH-EXAMPLE.VERCEL.APP", "PATH-EXAMPLE.VERCEL.APP.",
      "deep.path-example.vercel.app", "example.now.sh", "deep.example.now.sh"]) {
      expect(classifyP11Hostname(host)).toBe("provider_platform_hostname");
    }
    for (const host of ["evilvercel.app", "vercel.app.example.com", "example.com", "www.example.com"]) {
      expect(classifyP11Hostname(host)).toBe("creator_domain");
    }
    expect(classifyP11Hostname("*.vercel.app")).toBe("invalid");
  });

  it("rejects platform hostnames for every canonical P11 mutation kind", () => {
    for (const kind of ["attach", "verify", "apply_required_dns_record", "detach"]) {
      const input: any = { kind, fqdn: "path-example.vercel.app", expectedRevision: 0 };
      expect(prepareP11DomainOperation(releaseReady(), input)).toMatchObject({ ok: false, code: "P11_PLATFORM_HOSTNAME_UNSUPPORTED" });
    }
  });

  it("refuses to load a platform hostname as canonical P11 domain authority", () => {
    const record = releaseReady() as any;
    record.p11Domains = { ...emptyP11DomainAuthority(), domains: [{ fqdn: "path-example.vercel.app" }] };
    expect(readP11DomainAuthority(record)).toMatchObject({ ok: false, code: "P11_DOMAINS_INVALID" });
  });

  it("keeps apex and www as separate records and separates claim, attachment, verification, DNS, and TLS", () => {
    const first = prepareP11DomainOperation(releaseReady(), { kind: "attach", fqdn: "example.com", expectedRevision: 0 });
    expect(first).toMatchObject({ ok: true, record: { p11Domains: { domains: [
      { fqdn: "example.com", kind: "apex", teamClaimState: "unknown", attachmentState: "pending",
        verificationState: "unknown", dnsMode: "unknown", dnsState: "unknown", tlsState: "unknown" },
    ] } } });
    const completeAttach = transitionP11DomainOperation(first.record!, { operationId: first.operationId!, state: "completed", observation: observation() });
    const second = prepareP11DomainOperation(completeAttach.record!, { kind: "attach", fqdn: "www.example.com", expectedRevision: completeAttach.revision! });
    expect(second).toMatchObject({ ok: true, record: { p11Domains: { domains: [
      { fqdn: "example.com", kind: "apex" }, { fqdn: "www.example.com", kind: "subdomain" },
    ] } } });
    expect(second.record!.deployments).toEqual(first.record!.deployments);
  });

  it("requires verified P10 serving and exact release/mapping authority before mutation", () => {
    const record = releaseReady();
    const badServing = structuredClone(record); badServing.deployments!.serving.state = "unknown";
    expect(prepareP11DomainOperation(badServing, { kind: "attach", fqdn: "example.com", expectedRevision: 0 }))
      .toMatchObject({ ok: false, code: "P10_PRODUCTION_AUTHORITY_UNVERIFIED" });
    const stale = prepareP11DomainOperation(record, { kind: "attach", fqdn: "example.com", expectedRevision: 1 });
    expect(stale).toMatchObject({ ok: false, code: "P11_REVISION_STALE" });
    const missingMapping = structuredClone(record); (missingMapping.deployments!.mappings[0] as any).mappingId = "other";
    expect(prepareP11DomainOperation(missingMapping, { kind: "attach", fqdn: "example.com", expectedRevision: 0 }))
      .toMatchObject({ ok: false, code: "P10_PRODUCTION_AUTHORITY_UNVERIFIED" });
  });

  it("freezes canonical DNS required-record identity and rejects caller supplied values", () => {
    const attach = prepareP11DomainOperation(releaseReady(), { kind: "attach", fqdn: "example.com", expectedRevision: 0 });
    const attached = transitionP11DomainOperation(attach.record!, { operationId: attach.operationId!, state: "completed", observation: observation() });
    const observed = recordP11DomainObservation(attached.record!, observation("example.com", { dnsMode: "vercel_managed",
      requiredRecords: [{ recordId: "required-1", type: "TXT", name: "_verify", value: "token", purpose: "ownership" }] }));
    const prep = prepareP11DomainOperation(observed.record!, { kind: "apply_required_dns_record", fqdn: "example.com",
      requiredRecordId: "required-1", record: { type: "TXT", name: "attacker", value: "x" }, expectedRevision: observed.revision! });
    expect(prep).toMatchObject({ ok: false, code: "P11_RECORD_INPUT_FORBIDDEN" });
    const valid = prepareP11DomainOperation(observed.record!, { kind: "apply_required_dns_record", fqdn: "example.com",
      requiredRecordId: "required-1", expectedRevision: observed.revision! });
    expect(valid).toMatchObject({ ok: true, operation: { record: { type: "TXT", name: "_verify", value: "token" } } });
  });

  it("records factual observations without changing any P10 release authority", () => {
    const attach = prepareP11DomainOperation(releaseReady(), { kind: "attach", fqdn: "example.com", expectedRevision: 0 });
    const completed = transitionP11DomainOperation(attach.record!, { operationId: attach.operationId!, state: "completed", observation: observation() });
    const beforeP10 = structuredClone(completed.record!.deployments);
    const observed = recordP11DomainObservation(completed.record!, observation("example.com", { teamClaimState: "claimed",
      attachmentState: "attached", verificationState: "verified", dnsState: "valid", tlsState: "ready",
      rawProviderPayload: { sensitive: "must-not-persist" } }));
    expect(observed.record!.deployments).toEqual(beforeP10);
    expect(observed.domain).toMatchObject({ attachmentState: "attached", verificationState: "verified", dnsState: "valid", tlsState: "ready" });
    expect(JSON.stringify(observed.record!.p11Domains)).not.toContain("must-not-persist");
  });

  it("rejects unsafe provider observation and stale/superseded P11 operation IDs", () => {
    const attach = prepareP11DomainOperation(releaseReady(), { kind: "attach", fqdn: "example.com", expectedRevision: 0 });
    expect(transitionP11DomainOperation(attach.record!, { operationId: "other-op", state: "effect_started" }))
      .toMatchObject({ ok: false, code: "P11_OPERATION_NOT_CURRENT" });
    expect(transitionP11DomainOperation(attach.record!, { operationId: attach.operationId!, state: "completed", observation: { ...observation(), projectRef: "wrong" } }))
      .toMatchObject({ ok: false, code: "P11_PROVIDER_OBSERVATION_UNSAFE" });
  });

  it("requires exact certificate name, live validity, and handshake; HTTP status is non-authoritative", () => {
    expect(classifyP11Tls({ fqdn: "example.com", certificateNames: ["*.example.com"], validFrom: "2026-01-01T00:00:00Z",
      validTo: "2027-01-01T00:00:00Z", handshakeOk: true, httpStatus: 403, observedAt: at })).toMatchObject({ tlsState: "pending", certificateExactName: false });
    expect(classifyP11Tls({ fqdn: "example.com", certificateNames: ["example.com"], validFrom: "2026-01-01T00:00:00Z",
      validTo: "2027-01-01T00:00:00Z", handshakeOk: true, httpStatus: 404, observedAt: at })).toMatchObject({ tlsState: "ready" });
    expect(classifyP11Tls({ fqdn: "example.com", certificateNames: ["notexample.com"], validFrom: "2026-01-01T00:00:00Z",
      validTo: "2027-01-01T00:00:00Z", handshakeOk: true, httpStatus: 200, observedAt: at })).toMatchObject({ tlsState: "pending" });
  });
});

describe("P11 bounded HTTPS probe", () => {
  it("rejects private/special addresses and accepts public IPv4/IPv6", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "169.254.1.2", "192.168.1.2", "::1", "fc00::1", "fe80::1", "2001:db8::1"]) {
      expect(isPublicP11Address(address)).toBe(false);
    }
    expect(isPublicP11Address("8.8.8.8")).toBe(true);
    expect(isPublicP11Address("2606:4700:4700::1111")).toBe(true);
  });

  it("accepts only canonical hostnames and blocks private DNS resolutions before request", async () => {
    let requests = 0;
    const requestImpl = (() => { requests++; throw new Error("must not connect"); }) as any;
    expect(await probeP11Https("127.0.0.1", { requestImpl })).toMatchObject({ ok: false, code: "P11_PROBE_HOST_INVALID" });
    expect(await probeP11Https("example.com", { resolveImpl: async () => [{ address: "10.0.0.1", family: 4 }], requestImpl }))
      .toMatchObject({ ok: false, code: "P11_PROBE_ADDRESS_UNSAFE" });
    expect(requests).toBe(0);
  });
});
