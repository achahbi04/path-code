import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildRecordSkeleton, writeBuildRecord, readBuildRecord,
  createBuildCoordinatorService, prepareP11DomainOperation,
  transitionP11DomainOperation, recordP11DomainObservation } from "../../scripts/pathcode-cli/build/index.mjs";
import { resolvePathPackageRoot } from "../../scripts/pathcode-cli/paths.mjs";

const buildId = "351d7275-a6ea-498b-a48d-a32e91f669f4";
const teamRef = "team_SqWewpQeCPwU8WuZNHTGViOO";
const projectRef = "path-p10-production-acceptance";
const projectId = "prj_HiUd222ObwDcp1fljJc81JbJWUS7";
const providerDeploymentId = "dpl_12345678";
const at = "2026-10-08T12:00:00.000Z";
const fqdn = "example.com";
const requiredRecord = { recordId: "required-record-1", type: "TXT", name: "_verify", value: "ownership-token", purpose: "ownership" };

function authorityRecord() {
  const record = createBuildRecordSkeleton({ buildId, outcome: "P11 service test" });
  record.loop.status = "paused";
  record.coordinator = { autoRun: false, owner: "path-build-coordinator" };
  record.deployments = { schema: "pathcode.p10.deployments.v1", revision: 1,
    mappings: [{ mappingId: "mapping-prod", provider: "vercel", environmentId: "env-prod", teamRef, projectRef,
      targetRef: "production", updatedAt: at }], deployments: [],
    releases: [{ releaseId: "release-prod", operationId: "release-op", deploymentId: "deployment-prod", action: "publish",
      providerDeploymentId, provider: "vercel", teamRef, projectRef, mappingId: "mapping-prod", sourceSha: "sha",
      environmentId: "env-prod", releasedAt: at, previousReleaseId: null }], releaseOperations: [],
    currentProductionReleaseId: "release-prod", serving: { state: "verified", observedProviderDeploymentId: providerDeploymentId, observedAt: at },
    pendingOperation: null };
  return record;
}

function reducedDomainObservation(extra: Record<string, unknown> = {}) {
  return { ok: true, fqdn, teamRef, projectRef, teamClaimState: "claimed", attachmentState: "attached_unverified",
    verificationState: "action_required", dnsMode: "external", dnsState: "action_required", tlsState: "pending",
    requiredRecords: [], observedAt: at, ...extra };
}

function recordWithAttachedDomain({ managedDns = false } = {}) {
  const initial = authorityRecord();
  const attach = prepareP11DomainOperation(initial, { kind: "attach", fqdn, expectedRevision: 0 });
  const attached = transitionP11DomainOperation(attach.record!, { operationId: attach.operationId!, state: "completed",
    observation: reducedDomainObservation() });
  if (!managedDns) return attached.record!;
  return recordP11DomainObservation(attached.record!, reducedDomainObservation({ attachmentState: "attached_unverified",
    dnsMode: "vercel_managed", dnsState: "valid", requiredRecords: [requiredRecord] })).record!;
}

function providerPages({ attached, verified = false, dnsRecords = [], onRead, apexName = fqdn,
  intendedNameservers = [], currentNameservers = ["ns1.vercel-dns.com"], serviceType = "zeit.world" }:
  { attached: boolean | (() => boolean); verified?: boolean | (() => boolean); dnsRecords?: any[] | (() => any[]);
    onRead?: (kind: string, method: string) => void; apexName?: string; intendedNameservers?: string[] | (() => string[]);
    currentNameservers?: string[]; serviceType?: string | (() => string) }) {
  return async (spec: any) => {
    const kind = spec.proofContext.kind;
    const method = spec.argv[3];
    onRead?.(kind, method);
    const projectDomain = { name: fqdn, apexName, projectId,
      verified: typeof verified === "function" ? verified() : verified, verification: [] };
    const isAttached = typeof attached === "function" ? attached() : attached;
    const currentDnsRecords = typeof dnsRecords === "function" ? dnsRecords() : dnsRecords;
    const currentIntendedNameservers = typeof intendedNameservers === "function" ? intendedNameservers() : intendedNameservers;
    const currentServiceType = typeof serviceType === "function" ? serviceType() : serviceType;
    const pages: Record<string, any> = {
      team_domains: { domains: [{ name: apexName, teamId: teamRef, serviceType: currentServiceType, nameservers: currentNameservers,
        intendedNameservers: currentIntendedNameservers }], pagination: { count: 1, next: null, prev: null } },
      project: { id: projectId, name: projectRef, teamId: teamRef },
      project_domains: { domains: isAttached ? [projectDomain] : [], pagination: { count: isAttached ? 1 : 0, next: null, prev: null } },
      project_domain: projectDomain,
      domain_config: { serviceType: currentServiceType, misconfigured: false, conflicts: [], nameservers: currentNameservers,
        acceptedChallenges: [], recommendedIPv4: [], recommendedCNAME: [] },
      dns_records: { records: currentDnsRecords, pagination: { count: currentDnsRecords.length, next: null, prev: null } },
      certificates: { certs: [], pagination: { count: 0, next: null, prev: null } },
    };
    return { ok: true, raw: pages[kind] };
  };
}

function providerReleaseExecutors() {
  return {
    productionCommandExecutor: async (_spec: any, options: any) => options.mode === "production_auth"
      ? { ok: true, authenticated: true, teamRef }
      : { ok: true, projectId, projectName: projectRef, teamRef },
    releaseCommandExecutor: async (_spec: any, options: any) => options.mode === "release_aliases"
      ? { ok: true, aliases: [{ alias: `${projectRef}.vercel.app`, providerDeploymentId }], nextCursor: null }
      : { ok: true, providerDeploymentId: options.context.providerDeploymentId, projectRef, teamRef,
        target: "production", url: "https://production.vercel.app", providerState: "READY", observedAt: at },
  };
}

function managedDnsEligibleRecord() {
  const initial = recordWithAttachedDomain();
  return recordP11DomainObservation(initial, reducedDomainObservation({ teamClaimState: "claimed", attachmentState: "attached",
    verificationState: "verified", dnsMode: "external", dnsState: "action_required", providerApexName: "example.com",
    intendedNameservers: [] })).record!;
}

describe("P11 explicit coordinator domain authority", () => {
  let root = "";
  let service: Awaited<ReturnType<typeof createBuildCoordinatorService>> | null = null;
  afterEach(async () => { await service?.close(); service = null; if (root) rmSync(root, { recursive: true, force: true }); root = ""; });

  it("freezes provider apex, persists effect intent before one PATCH outside the Build lock, and requires authoritative readback", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p11-managed-dns-success-"));
    const initial = managedDnsEligibleRecord(); writeBuildRecord(root, initial);
    let ready = false; let patchCount = 0;
    const intended = () => ready ? ["ns1.vercel-dns.test", "ns2.vercel-dns.test"] : [];
    const provider = providerPages({ attached: true, verified: true, apexName: "example.com", intendedNameservers: intended,
      currentNameservers: ["ns1.simply.com"], serviceType: () => ready ? "zeit.world" : "external" });
    const p11CommandExecutor = vi.fn(async (spec: any) => {
      if (spec.argv[3] === "PATCH") {
        patchCount++;
        expect(spec.proofContext).toEqual({ kind: "enable_managed_dns", input: { zoneFqdn: "example.com", teamRef } });
        expect(spec.stdinPayload).toBe(JSON.stringify({ op: "update", zone: true }));
        const persisted = readBuildRecord(root, buildId)! as any;
        expect(persisted.p11Domains.pendingOperation).toMatchObject({ kind: "enable_managed_dns", zoneFqdn: "example.com", state: "effect_started" });
        const concurrentRead = await service!.dispatch("build.domains.list", { buildId });
        expect(concurrentRead).toMatchObject({ ok: true, pendingOperation: { kind: "enable_managed_dns", state: "effect_started" } });
        ready = true;
        return { ok: true, raw: { ignored: "receipt is not authority" } };
      }
      return provider(spec);
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      ...providerReleaseExecutors(), p11CommandExecutor, p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    await service.whenReady;
    const prepared = await service.dispatch("build.domains.prepare", { buildId, kind: "enable_managed_dns", fqdn,
      expectedRevision: (initial as any).p11Domains.revision });
    expect(prepared).toMatchObject({ ok: true, kind: "enable_managed_dns" });
    const op = (readBuildRecord(root, buildId)! as any).p11Domains.pendingOperation;
    expect(op).toMatchObject({ zoneFqdn: "example.com", expectedProductionReleaseId: "release-prod", mappingId: "mapping-prod", teamRef, projectRef });
    const completed = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(completed).toMatchObject({ ok: true, operationState: "completed", domain: { dnsMode: "external",
      providerApexName: "example.com", intendedNameservers: ["ns1.vercel-dns.test", "ns2.vercel-dns.test"] },
      managedDnsReadback: { zoneFqdn: "example.com", teamRef } });
    expect(patchCount).toBe(1);
    const again = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(again).toMatchObject({ ok: false, code: "P11_OPERATION_NOT_CURRENT" });
    expect(patchCount).toBe(1);
  });

  it("does not PATCH when fresh provider evidence already proves readiness", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p11-managed-dns-already-ready-"));
    const initial = managedDnsEligibleRecord(); writeBuildRecord(root, initial);
    const provider = providerPages({ attached: true, verified: true, apexName: "example.com",
      intendedNameservers: ["ns1.vercel-dns.test"], currentNameservers: ["ns1.vercel-dns.test"], serviceType: "zeit.world" });
    const p11CommandExecutor = vi.fn(async (spec: any) => provider(spec));
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      ...providerReleaseExecutors(), p11CommandExecutor, p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    const prepared = await service.dispatch("build.domains.prepare", { buildId, kind: "enable_managed_dns", fqdn,
      expectedRevision: (initial as any).p11Domains.revision });
    const completed = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(completed).toMatchObject({ ok: true, operationState: "completed", alreadyReady: true, providerEffect: false,
      domain: { dnsMode: "vercel_managed" } });
    expect(p11CommandExecutor.mock.calls.some(([spec]) => spec.argv[3] === "PATCH")).toBe(false);
  });

  it("does not complete after a successful PATCH without readiness readback", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p11-managed-dns-no-readback-"));
    const initial = managedDnsEligibleRecord(); writeBuildRecord(root, initial);
    const provider = providerPages({ attached: true, verified: true, apexName: "example.com", intendedNameservers: [],
      currentNameservers: ["ns1.simply.com"], serviceType: "external" });
    let patchCount = 0;
    const p11CommandExecutor = vi.fn(async (spec: any) => {
      if (spec.argv[3] === "PATCH") { patchCount++; return { ok: true, raw: {} }; }
      return provider(spec);
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      ...providerReleaseExecutors(), p11CommandExecutor, p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    const prepared = await service.dispatch("build.domains.prepare", { buildId, kind: "enable_managed_dns", fqdn,
      expectedRevision: (initial as any).p11Domains.revision });
    const result = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(result).toMatchObject({ ok: false, code: "P11_PROVIDER_STATE_NOT_ESTABLISHED", retry: false });
    expect(patchCount).toBe(1);
    expect((readBuildRecord(root, buildId)! as any).p11Domains.pendingOperation).toMatchObject({ kind: "enable_managed_dns", state: "safe_stop" });
  });

  it.each([true, false])("does not repeat an uncertain managed DNS PATCH; read-only recovery ready=%s", async (becomesReady) => {
    root = mkdtempSync(join(tmpdir(), "path-p11-managed-dns-uncertain-"));
    const initial = managedDnsEligibleRecord(); writeBuildRecord(root, initial);
    let ready = false; let patchCount = 0;
    const provider = providerPages({ attached: true, verified: true, apexName: "example.com",
      intendedNameservers: () => ready ? ["ns1.vercel-dns.test"] : [], currentNameservers: ["ns1.simply.com"],
      serviceType: () => ready ? "zeit.world" : "external" });
    const p11CommandExecutor = vi.fn(async (spec: any) => {
      if (spec.argv[3] === "PATCH") { patchCount++; ready = becomesReady; return { ok: false, code: "P11_PROVIDER_OUTCOME_UNKNOWN" }; }
      return provider(spec);
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      ...providerReleaseExecutors(), p11CommandExecutor, p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    const prepared = await service.dispatch("build.domains.prepare", { buildId, kind: "enable_managed_dns", fqdn,
      expectedRevision: (initial as any).p11Domains.revision });
    const result = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(result).toMatchObject({ ok: false, code: "P11_PROVIDER_OUTCOME_UNKNOWN", retry: false });
    const reconciled = await service.dispatch("build.domains.observe", { buildId, fqdn });
    expect(patchCount).toBe(1);
    if (becomesReady) expect(reconciled).toMatchObject({ ok: true, reconciled: true });
    else expect(reconciled).toMatchObject({ ok: true, reconciled: false, retry: false });
    const duplicate = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(duplicate).toMatchObject({ ok: false, code: becomesReady ? "P11_OPERATION_NOT_CURRENT" : "P11_REVISION_STALE" });
    expect(patchCount).toBe(1);
  });

  it("rejects a fresh provider apex change and stale P10 authority before PATCH", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p11-managed-dns-stale-"));
    const initial = managedDnsEligibleRecord(); writeBuildRecord(root, initial);
    const provider = providerPages({ attached: true, verified: true, apexName: "other.example", intendedNameservers: [],
      currentNameservers: ["ns1.simply.com"], serviceType: "external" });
    const p11CommandExecutor = vi.fn(async (spec: any) => provider(spec));
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      ...providerReleaseExecutors(), p11CommandExecutor, p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    const prepared = await service.dispatch("build.domains.prepare", { buildId, kind: "enable_managed_dns", fqdn,
      expectedRevision: (initial as any).p11Domains.revision });
    const staleZone = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(staleZone).toMatchObject({ ok: false, code: "P11_MANAGED_DNS_ZONE_STALE", retry: false });
    expect(p11CommandExecutor.mock.calls.some(([spec]) => spec.argv[3] === "PATCH")).toBe(false);
  });

  it.each(["release", "mapping"] as const)("rejects changed P10 %s authority before managed DNS PATCH", async (changedAuthority) => {
    root = mkdtempSync(join(tmpdir(), `path-p11-managed-dns-stale-p10-${changedAuthority}-`));
    const initial = managedDnsEligibleRecord(); writeBuildRecord(root, initial);
    const provider = providerPages({ attached: true, verified: true, apexName: "example.com", intendedNameservers: [] });
    const p11CommandExecutor = vi.fn(async (spec: any) => provider(spec));
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      ...providerReleaseExecutors(), p11CommandExecutor, p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    const prepared = await service.dispatch("build.domains.prepare", { buildId, kind: "enable_managed_dns", fqdn,
      expectedRevision: (initial as any).p11Domains.revision });
    const changed = readBuildRecord(root, buildId)! as any;
    if (changedAuthority === "release") changed.deployments.currentProductionReleaseId = "replacement-release";
    else changed.deployments.mappings[0].projectRef = "replacement-project";
    writeBuildRecord(root, changed);
    const result = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(result).toMatchObject({ ok: false, code: "P10_PRODUCTION_AUTHORITY_STALE" });
    expect(p11CommandExecutor).not.toHaveBeenCalled();
  });

  it("persists exact attach intent before one provider effect, reads back, and preserves P10", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p11-coordinator-"));
    const record = authorityRecord();
    writeBuildRecord(root, record);
    let attached = false;
    const commands: string[] = [];
    const productionCommandExecutor = vi.fn(async (_spec: any, options: any) => options.mode === "production_auth"
      ? { ok: true, authenticated: true, teamRef }
      : { ok: true, projectId, projectName: projectRef, teamRef });
    const releaseCommandExecutor = vi.fn(async (_spec: any, options: any) => options.mode === "release_aliases"
      ? { ok: true, aliases: [{ alias: `${projectRef}.vercel.app`, providerDeploymentId }], nextCursor: null }
      : { ok: true, providerDeploymentId: options.context.providerDeploymentId, projectRef, teamRef,
        target: "production", url: "https://production.vercel.app", providerState: "READY", observedAt: at });
    const p11CommandExecutor = vi.fn(async (spec: any) => {
      const kind = spec.proofContext.kind;
      const method = spec.argv[3]; commands.push(`${kind}:${method}`);
      if (method !== "GET") {
        const persisted = readBuildRecord(root, buildId)! as any;
        expect(persisted.p11Domains.pendingOperation).toMatchObject({ state: "effect_started", kind: "attach", fqdn: "example.com" });
        attached = true;
      }
      const row = { name: "example.com", apexName: "example.com", projectId, verified: false, verification: [] };
      const raw: Record<string, unknown> = {
        team_domains: { domains: [], pagination: { count: 0, next: null, prev: null } },
        project: { id: projectId, name: projectRef, teamId: teamRef },
        project_domains: { domains: attached ? [row] : [], pagination: { count: attached ? 1 : 0, next: null, prev: null } },
        project_domain: row,
        domain_config: { serviceType: "external", misconfigured: true, nameservers: ["ns.external.test"] },
        certificates: { certs: [], pagination: {} },
      };
      return { ok: true, raw: raw[kind] };
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      productionCommandExecutor, releaseCommandExecutor, p11CommandExecutor,
      p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    await service.whenReady;
    const list = await service.dispatch("build.domains.list", { buildId });
    expect(list).toMatchObject({ ok: true, schema: "pathcode.p11.domains.v1", revision: 0, domains: [], pendingOperation: null });
    const prepared = await service.dispatch("build.domains.prepare", { buildId, kind: "attach", fqdn: "example.com", expectedRevision: 0 });
    expect(prepared).toMatchObject({ ok: true, expectedProductionReleaseId: "release-prod", kind: "attach" });
    expect(p11CommandExecutor).not.toHaveBeenCalled();
    const completed = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(completed).toMatchObject({ ok: true, operationState: "completed", domain: {
      fqdn: "example.com", attachmentState: "attached_unverified", verificationState: "action_required", dnsMode: "external",
    } });
    expect(commands.filter((value) => value === "attach:POST")).toHaveLength(1);
    expect(commands.every((value) => !value.endsWith(":POST") || value === "attach:POST")).toBe(true);
    const final = readBuildRecord(root, buildId)! as any;
    expect(final.deployments).toEqual(record.deployments);
    expect(final.p11Domains.operationHistory).toContainEqual(expect.objectContaining({ kind: "attach", state: "completed" }));
    expect(final.p11Domains.pendingOperation).toBeNull();
  });

  it("rejects arbitrary P11 mutations on the Preview-scoped coordinator", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p11-scoped-"));
    const record = authorityRecord(); writeBuildRecord(root, record);
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true, scopedBuildId: buildId });
    const result = await service.dispatch("build.domains.prepare", { buildId, kind: "attach", fqdn: "example.com", expectedRevision: 0 });
    expect(result).toMatchObject({ ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" });
  });

  it("keeps accepted P10 serving observation and P11 fresh preflight on the same executor identity context", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p11-serving-context-parity-"));
    writeBuildRecord(root, authorityRecord());
    const inspectContexts: any[] = [];
    const aliasContexts: any[] = [];
    const productionCommandExecutor = async (_spec: any, options: any) => options.mode === "production_auth"
      ? { ok: true, authenticated: true, teamRef }
      : { ok: true, projectId, projectName: projectRef, teamRef };
    const releaseCommandExecutor = async (_spec: any, options: any) => {
      if (options.mode === "release_aliases") {
        aliasContexts.push(options.context);
        return { ok: true, aliases: [{ alias: `${projectRef}.vercel.app`, providerDeploymentId }], nextCursor: null };
      }
      inspectContexts.push(options.context);
      // Model executeProductionReleaseCommand: project identity is reduced from
      // the strict executor context, never hardcoded into the fixture result.
      return { ok: true, providerDeploymentId: options.context.providerDeploymentId,
        projectRef: options.context.projectRef ?? null, teamRef: options.context.teamRef,
        target: "production", url: "https://production.vercel.app", providerState: "READY", observedAt: at };
    };
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      productionCommandExecutor, releaseCommandExecutor,
      p11CommandExecutor: vi.fn(async () => ({ ok: false, code: "UNEXPECTED_P11_PROVIDER_CALL" })) });
    await service.whenReady;

    const p10 = await service.dispatch("build.releases.observe", { buildId });
    expect(p10).toMatchObject({ ok: true, serving: { state: "verified", observedProviderDeploymentId: providerDeploymentId } });
    expect(inspectContexts.at(-1)).toEqual({ providerDeploymentId, projectName: projectRef, projectRef, teamRef });
    expect(aliasContexts.at(-1)).toEqual({ teamRef, nextCursor: null });

    const p11 = await service.dispatch("build.domains.prepare", { buildId, kind: "attach", fqdn, expectedRevision: 0 });
    expect(p11).toMatchObject({ ok: true, kind: "attach", expectedProductionReleaseId: "release-prod" });
    expect(inspectContexts.at(-1)).toEqual({ providerDeploymentId, projectName: projectRef, projectRef, teamRef });
    expect(aliasContexts.at(-1)).toEqual({ teamRef, nextCursor: null });
    expect(inspectContexts).toHaveLength(2);
    expect(readBuildRecord(root, buildId)!.deployments?.currentProductionReleaseId).toBe("release-prod");
  });

  it("fails P11 serving preflight closed when the inspected deployment resolves to another project", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p11-serving-wrong-project-"));
    writeBuildRecord(root, authorityRecord());
    const p11CommandExecutor = vi.fn();
    const releaseCommandExecutor = async (_spec: any, options: any) => options.mode === "release_aliases"
      ? { ok: true, aliases: [{ alias: `${projectRef}.vercel.app`, providerDeploymentId }], nextCursor: null }
      : { ok: true, providerDeploymentId: options.context.providerDeploymentId,
        projectRef: "another-production-project", teamRef: options.context.teamRef,
        target: "production", url: "https://production.vercel.app", providerState: "READY", observedAt: at };
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      ...providerReleaseExecutors(), releaseCommandExecutor, p11CommandExecutor });
    await service.whenReady;
    const result = await service.dispatch("build.domains.prepare", { buildId, kind: "attach", fqdn, expectedRevision: 0 });
    expect(result).toMatchObject({ ok: false, code: "P10_PRODUCTION_SERVING_NOT_VERIFIED" });
    expect(p11CommandExecutor).not.toHaveBeenCalled();
    expect((readBuildRecord(root, buildId) as any).p11Domains).toBeUndefined();
  });

  it("records provider DNS conflict and blocks attachment before any effect", async () => {
    root = mkdtempSync(join(tmpdir(), "path-p11-conflict-"));
    const record = authorityRecord(); writeBuildRecord(root, record);
    const effects: string[] = [];
    const projectIdentity = async (_spec: any, options: any) => options.mode === "production_auth"
      ? { ok: true, authenticated: true, teamRef }
      : { ok: true, projectId, projectName: projectRef, teamRef };
    const releaseRead = async (_spec: any, options: any) => options.mode === "release_aliases"
      ? { ok: true, aliases: [{ alias: `${projectRef}.vercel.app`, providerDeploymentId }], nextCursor: null }
      : { ok: true, providerDeploymentId: options.context.providerDeploymentId, projectRef, teamRef,
        target: "production", url: "https://production.vercel.app", providerState: "READY", observedAt: at };
    const providerRead = async (spec: any) => {
      const kind = spec.proofContext.kind; effects.push(`${kind}:${spec.argv[3]}`);
      const responses: Record<string, any> = {
        team_domains: { domains: [], pagination: { count: 0, next: null, prev: null } },
        project: { id: projectId, name: projectRef, teamId: teamRef },
        project_domains: { domains: [], pagination: { count: 0, next: null, prev: null } },
        domain_config: { serviceType: "zeit.world", misconfigured: false, conflicts: [{ type: "A", name: "@", value: "192.0.2.9" }] },
        dns_records: { records: [], pagination: { count: 0, next: null, prev: null } },
        certificates: { certs: [], pagination: {} },
      };
      return { ok: true, raw: responses[kind] };
    };
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      productionCommandExecutor: projectIdentity, releaseCommandExecutor: releaseRead, p11CommandExecutor: providerRead,
      p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    const prepared = await service.dispatch("build.domains.prepare", { buildId, kind: "attach", fqdn: "example.com", expectedRevision: 0 });
    const result = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(result).toMatchObject({ ok: false, code: "P11_DNS_CONFLICT", retry: false });
    expect(effects.some((item) => item === "attach:POST")).toBe(false);
    const final = readBuildRecord(root, buildId)! as any;
    expect(final.p11Domains).toMatchObject({ pendingOperation: null, domains: [{ dnsState: "conflict", attachmentState: "detached" }],
      operationHistory: [{ kind: "attach", state: "failed_no_effect", failureCode: "P11_DNS_CONFLICT" }] });
    expect(final.deployments).toEqual(record.deployments);
  });

  it.each(["verify", "apply_required_dns_record", "detach"] as const)(
    "%s persists exact effect intent first, rejects stale P10 mapping, and never repeats an uncertain effect",
    async (kind) => {
      root = mkdtempSync(join(tmpdir(), `path-p11-${kind}-`));
      const initial = kind === "apply_required_dns_record" ? recordWithAttachedDomain({ managedDns: true }) : recordWithAttachedDomain();
      writeBuildRecord(root, initial);
      let attached = true;
      let verified = false;
      let dnsRows: any[] = [];
      const mutationMethods: string[] = [];
      const provider = providerPages({ attached: () => attached, verified: () => verified, dnsRecords: () => dnsRows });
      const executors = providerReleaseExecutors();
      const p11CommandExecutor = vi.fn(async (spec: any) => {
        const method = spec.argv[3];
        const providerKind = spec.proofContext.kind;
        if (method !== "GET") {
          const persisted = readBuildRecord(root, buildId)! as any;
          const operation = persisted.p11Domains.pendingOperation;
          expect(operation).toMatchObject({ state: "effect_started", kind, fqdn });
          if (kind === "apply_required_dns_record") expect(operation.record).toEqual(requiredRecord);
          mutationMethods.push(`${providerKind}:${method}`);
          if (kind === "verify") verified = true;
          if (kind === "detach") attached = false;
          if (kind === "apply_required_dns_record") {
            const record = spec.proofContext.input.record;
            dnsRows = [{ id: "provider-record-1", name: record.name, type: record.type, value: record.value }];
          }
          return { ok: false, code: "P11_PROVIDER_OUTCOME_UNKNOWN" };
        }
        const pages = await provider(spec);
        if (providerKind === "project_domains" && pages.raw.domains?.length) pages.raw.domains[0].verified = verified;
        if (providerKind === "dns_records") pages.raw.records = dnsRows;
        return pages;
      });
      service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
        ...executors, p11CommandExecutor, p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
      const revision = (initial as any).p11Domains.revision;
      const prepared = await service.dispatch("build.domains.prepare", { buildId, kind, fqdn,
        ...(kind === "apply_required_dns_record" ? { requiredRecordId: requiredRecord.recordId } : {}), expectedRevision: revision });
      expect(prepared).toMatchObject({ ok: true, kind });

      // A changed P10 mapping cannot be silently adopted by an operation frozen against the old mapping.
      const changed = readBuildRecord(root, buildId)! as any;
      changed.deployments.mappings[0].projectRef = "replacement-project";
      writeBuildRecord(root, changed);
      const stale = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
      expect(stale).toMatchObject({ ok: false });
      expect(stale.code).toMatch(/P10_PRODUCTION_AUTHORITY_(STALE|UNVERIFIED)/);
      expect(mutationMethods).toEqual([]);
      expect((readBuildRecord(root, buildId)! as any).p11Domains.pendingOperation).toMatchObject({
        operationId: prepared.operationId, expectedProductionReleaseId: "release-prod", mappingId: "mapping-prod", state: "prepared",
      });
      await service.close(); service = null; rmSync(root, { recursive: true, force: true }); root = "";
    },
  );

  it.each(["attach", "verify", "apply_required_dns_record", "detach"] as const)(
    "%s uncertain effect is reconciled by read-only observation without a second mutation",
    async (kind) => {
      root = mkdtempSync(join(tmpdir(), `path-p11-${kind}-uncertain-`));
      const initial = kind === "attach" ? authorityRecord() : kind === "apply_required_dns_record"
        ? recordWithAttachedDomain({ managedDns: true }) : recordWithAttachedDomain();
      writeBuildRecord(root, initial);
      let attached = kind !== "attach";
      let verified = false;
      let dnsRows: any[] = [];
      const mutationMethods: string[] = [];
      const provider = providerPages({ attached: () => attached, verified: () => verified, dnsRecords: () => dnsRows });
      const p11CommandExecutor = vi.fn(async (spec: any) => {
        const method = spec.argv[3];
        const providerKind = spec.proofContext.kind;
        if (method !== "GET") {
          const persisted = readBuildRecord(root, buildId)! as any;
          const operation = persisted.p11Domains.pendingOperation;
          expect(operation).toMatchObject({ state: "effect_started", kind, fqdn });
          if (kind === "apply_required_dns_record") expect(operation.record).toEqual(requiredRecord);
          mutationMethods.push(`${providerKind}:${method}`);
          if (kind === "attach") attached = true;
          if (kind === "verify") verified = true;
          if (kind === "detach") attached = false;
          if (kind === "apply_required_dns_record") {
            const record = spec.proofContext.input.record;
            dnsRows = [{ id: "provider-record-1", name: record.name, type: record.type, value: record.value }];
          }
          return { ok: false, code: "P11_PROVIDER_OUTCOME_UNKNOWN" };
        }
        const pages = await provider(spec);
        if (providerKind === "project_domains" && pages.raw.domains?.length) pages.raw.domains[0].verified = verified;
        if (providerKind === "dns_records") pages.raw.records = dnsRows;
        return pages;
      });
      const executors = providerReleaseExecutors();
      service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
        ...executors, p11CommandExecutor, p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
      const revision = (initial as any).p11Domains?.revision ?? 0;
      const prepared = await service.dispatch("build.domains.prepare", { buildId, kind, fqdn,
        ...(kind === "apply_required_dns_record" ? { requiredRecordId: requiredRecord.recordId } : {}), expectedRevision: revision });
      const attempted = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
      expect(attempted).toMatchObject({ ok: false, code: "P11_PROVIDER_OUTCOME_UNKNOWN", retry: false });
      expect((readBuildRecord(root, buildId)! as any).p11Domains.pendingOperation).toMatchObject({ state: "uncertain", kind });

      const observed = await service.dispatch("build.domains.observe", { buildId, fqdn });
      expect(observed).toMatchObject({ ok: true, reconciled: true });
      expect(mutationMethods).toEqual([kind === "attach" ? "attach:POST" : kind === "verify" ? "verify:POST" :
        kind === "detach" ? "detach:DELETE" : "dns_create:POST"]);
      const final = readBuildRecord(root, buildId)! as any;
      expect(final.p11Domains.pendingOperation).toBeNull();
      expect(final.p11Domains.operationHistory.at(-1)).toMatchObject({ kind, state: "completed" });
      if (kind === "detach") {
        expect(final.p11Domains.domains[0].teamClaimState).toBe("claimed");
        expect(final.p11Domains.domains[0].attachmentState).toBe("detached");
        expect(mutationMethods).not.toContain("team_domain_delete:DELETE");
        expect(mutationMethods).not.toContain("dns_delete:DELETE");
        expect(mutationMethods).not.toContain("certificate_delete:DELETE");
      }
      expect(final.deployments.currentProductionReleaseId).toBe("release-prod");
      await service.close(); service = null; rmSync(root, { recursive: true, force: true }); root = "";
    },
  );

  it.each([
    { label: "one exact record", rows: [{ id: "provider-record-1", match: true }], reconciled: true, providerRecordId: "provider-record-1" },
    { label: "one exact record plus unrelated records", rows: [
      { id: "provider-record-1", match: true }, { id: "unrelated-record", name: "other", type: "A", value: "192.0.2.4" },
    ], reconciled: true, providerRecordId: "provider-record-1" },
    { label: "zero exact records", rows: [], reconciled: false, providerRecordId: null },
    { label: "duplicate exact records", rows: [
      { id: "provider-record-1", match: true }, { id: "provider-record-2", match: true },
    ], reconciled: false, providerRecordId: null },
  ])("reconciles uncertain DNS create only for one exact candidate: $label", async ({ rows, reconciled, providerRecordId }) => {
    root = mkdtempSync(join(tmpdir(), "path-p11-dns-cardinality-"));
    const initial = recordWithAttachedDomain({ managedDns: true }); writeBuildRecord(root, initial);
    let dnsRows: any[] = [];
    let createCount = 0;
    const provider = providerPages({ attached: true, dnsRecords: () => dnsRows });
    const p11CommandExecutor = vi.fn(async (spec: any) => {
      if (spec.argv[3] !== "GET") {
        createCount++;
        const record = spec.proofContext.input.record;
        dnsRows = rows.map((row) => row.match
          ? { id: row.id, name: record.name, type: record.type, value: record.value }
          : row);
        return { ok: false, code: "P11_PROVIDER_OUTCOME_UNKNOWN" };
      }
      return provider(spec);
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      ...providerReleaseExecutors(), p11CommandExecutor, p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    const prepared = await service.dispatch("build.domains.prepare", { buildId, kind: "apply_required_dns_record", fqdn,
      requiredRecordId: requiredRecord.recordId, expectedRevision: (initial as any).p11Domains.revision });
    const attempted = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(attempted).toMatchObject({ ok: false, code: "P11_PROVIDER_OUTCOME_UNKNOWN", retry: false });
    const observed = await service.dispatch("build.domains.observe", { buildId, fqdn });
    expect(observed).toMatchObject({ ok: true, reconciled, ...(reconciled ? {} : { retry: false }) });
    expect(createCount).toBe(1);
    const final = readBuildRecord(root, buildId)! as any;
    if (reconciled) {
      expect(final.p11Domains.pendingOperation).toBeNull();
      expect(final.p11Domains.operationHistory.at(-1)).toMatchObject({ kind: "apply_required_dns_record", state: "completed", providerRecordId });
    } else {
      expect(final.p11Domains.pendingOperation).toMatchObject({ kind: "apply_required_dns_record", state: "uncertain" });
      expect(final.p11Domains.operationHistory.at(-1)).toMatchObject({ state: "uncertain", providerRecordId: null });
    }
  });

  it.each([
    { label: "exactly one exact record", rows: [{ id: "provider-record-1", match: true }], completed: true, providerRecordId: "provider-record-1" },
    { label: "one exact record plus unrelated records", rows: [
      { id: "provider-record-1", match: true }, { id: "unrelated-record", name: "other", type: "A", value: "192.0.2.4" },
    ], completed: true, providerRecordId: "provider-record-1" },
    { label: "zero exact records", rows: [], completed: false, providerRecordId: null },
    { label: "two exact records with distinct IDs", rows: [
      { id: "provider-record-1", match: true }, { id: "provider-record-2", match: true },
    ], completed: false, providerRecordId: null },
  ])("successful DNS create readback requires one exact candidate: $label", async ({ rows, completed, providerRecordId }) => {
    root = mkdtempSync(join(tmpdir(), "path-p11-dns-immediate-cardinality-"));
    const initial = recordWithAttachedDomain({ managedDns: true }); writeBuildRecord(root, initial);
    let dnsRows: any[] = [];
    let createCount = 0;
    const provider = providerPages({ attached: true, dnsRecords: () => dnsRows });
    const p11CommandExecutor = vi.fn(async (spec: any) => {
      if (spec.argv[3] !== "GET") {
        createCount++;
        const record = spec.proofContext.input.record;
        dnsRows = rows.map((row) => row.match
          ? { id: row.id, name: record.name, type: record.type, value: record.value }
          : row);
        return { ok: true, raw: {} };
      }
      return provider(spec);
    });
    service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
      ...providerReleaseExecutors(), p11CommandExecutor, p11HttpsProbe: async () => ({ ok: false, code: "P11_TLS_HANDSHAKE_FAILED" }) });
    const prepared = await service.dispatch("build.domains.prepare", { buildId, kind: "apply_required_dns_record", fqdn,
      requiredRecordId: requiredRecord.recordId, expectedRevision: (initial as any).p11Domains.revision });
    const result = await service.dispatch("build.domains.execute", { buildId, operationId: prepared.operationId, expectedRevision: prepared.revision });
    expect(createCount).toBe(1);
    expect(result.ok).toBe(completed);
    if (completed) expect(result).toMatchObject({ ok: true, operationState: "completed" });
    else expect(result).toMatchObject({ ok: false, code: "P11_PROVIDER_STATE_NOT_ESTABLISHED", retry: false });
    const final = readBuildRecord(root, buildId)! as any;
    if (completed) {
      expect(final.p11Domains.pendingOperation).toBeNull();
      expect(final.p11Domains.operationHistory.at(-1)).toMatchObject({ state: "completed", providerRecordId });
    } else {
      expect(final.p11Domains.pendingOperation).toMatchObject({ kind: "apply_required_dns_record", state: "safe_stop" });
      expect(final.p11Domains.operationHistory.at(-1)).toMatchObject({ state: "safe_stop", providerRecordId: null });
    }
  });

  it.each(["attach", "verify", "apply_required_dns_record", "detach", "enable_managed_dns"] as const)(
    "startup recovery never replays pending %s provider effects",
    async (kind) => {
      root = mkdtempSync(join(tmpdir(), `path-p11-startup-${kind}-`));
      const record = kind === "attach" ? authorityRecord() : kind === "apply_required_dns_record"
        ? recordWithAttachedDomain({ managedDns: true }) : kind === "enable_managed_dns" ? managedDnsEligibleRecord() : recordWithAttachedDomain();
      const prepared = prepareP11DomainOperation(record, { kind, fqdn,
        ...(kind === "apply_required_dns_record" ? { requiredRecordId: requiredRecord.recordId } : {}),
        expectedRevision: (record as any).p11Domains?.revision ?? 0 });
      expect(prepared.ok).toBe(true);
      const started = transitionP11DomainOperation(prepared.record!, { operationId: prepared.operationId!, state: "effect_started" });
      writeBuildRecord(root, started.record!);
      const p11CommandExecutor = vi.fn(async () => ({ ok: false, code: "must-not-run" }));
      service = await createBuildCoordinatorService({ runtimeRoot: root, packageRoot: resolvePathPackageRoot(), fakeMode: true,
        ...providerReleaseExecutors(), p11CommandExecutor });
      await service.whenReady;
      expect(p11CommandExecutor).not.toHaveBeenCalled();
      expect((readBuildRecord(root, buildId)! as any).p11Domains.pendingOperation).toMatchObject({
        operationId: prepared.operationId, kind, state: "effect_started",
      });
      await service.close(); service = null; rmSync(root, { recursive: true, force: true }); root = "";
    },
  );
});
