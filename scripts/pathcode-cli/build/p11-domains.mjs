/** P11 domain authority. Kept separate from P10 deployment/release authority. */
import { randomUUID } from "node:crypto";
import { domainToASCII } from "node:url";
import { isIP } from "node:net";

export const P11_DOMAINS_SCHEMA = "pathcode.p11.domains.v1";
export const P11_PROVIDER_PLATFORM_HOST_SUFFIXES = Object.freeze(["vercel.app", "now.sh"]);
const fail = (code) => ({ ok: false, code });
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v) => typeof v === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(v);
const timestamp = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === v;
const now = () => new Date().toISOString();
const kinds = new Set(["attach", "verify", "apply_required_dns_record", "detach"]);

export function normalizeP11Fqdn(value) {
  if (typeof value !== "string" || value.length > 253 || value.includes("*") || value.endsWith(".")) return null;
  const ascii = domainToASCII(value.trim().toLowerCase());
  if (!ascii || ascii.length > 253 || ascii.includes("*") || ascii === "localhost" || isIP(ascii) ||
      !ascii.includes(".") || ascii.split(".").some((part) => !part || part.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))) return null;
  return ascii;
}

export function classifyP11Hostname(value) {
  if (typeof value !== "string") return "invalid";
  const candidate = value.endsWith(".") ? value.slice(0, -1) : value;
  const fqdn = normalizeP11Fqdn(candidate);
  if (!fqdn) return "invalid";
  return P11_PROVIDER_PLATFORM_HOST_SUFFIXES.some((suffix) => fqdn === suffix || fqdn.endsWith(`.${suffix}`))
    ? "provider_platform_hostname" : "creator_domain";
}

export function emptyP11DomainAuthority() {
  return { schema: P11_DOMAINS_SCHEMA, revision: 0, domains: [], pendingOperation: null, operationHistory: [] };
}

export function readP11DomainAuthority(record) {
  if (!isObject(record)) return fail("BUILD_NOT_FOUND");
  const authority = record.p11Domains ?? emptyP11DomainAuthority();
  if (authority.schema !== P11_DOMAINS_SCHEMA || !Number.isSafeInteger(authority.revision) || authority.revision < 0 ||
      !Array.isArray(authority.domains) || !Array.isArray(authority.operationHistory) ||
      authority.domains.some((domain) => classifyP11Hostname(domain?.fqdn) === "provider_platform_hostname") ||
      !(authority.pendingOperation === null || isObject(authority.pendingOperation))) return fail("P11_DOMAINS_INVALID");
  return { ok: true, authority };
}

function currentProductionAuthority(record) {
  const p10 = record?.deployments;
  if (!p10 || p10.schema !== "pathcode.p10.deployments.v1" || !Array.isArray(p10.mappings) ||
      !Array.isArray(p10.releases) || p10.currentProductionReleaseId == null || p10.serving?.state !== "verified")
    return fail("P10_PRODUCTION_AUTHORITY_UNVERIFIED");
  const release = p10.releases.find((item) => item.releaseId === p10.currentProductionReleaseId);
  const mapping = release && p10.mappings.find((item) => item.mappingId === release.mappingId &&
    item.provider === "vercel" && item.targetRef === "production" && item.projectRef === release.projectRef &&
    item.teamRef === release.teamRef);
  if (!release || !mapping || p10.serving.observedProviderDeploymentId !== release.providerDeploymentId)
    return fail("P10_PRODUCTION_AUTHORITY_UNVERIFIED");
  return { ok: true, p10, release, mapping };
}

export function prepareP11DomainOperation(record, input) {
  if (!isObject(input) || !kinds.has(input.kind) || !Number.isSafeInteger(input.expectedRevision)) return fail("P11_OPERATION_INVALID");
  const read = readP11DomainAuthority(record);
  if (!read.ok) return read;
  const { authority } = read;
  if (authority.revision !== input.expectedRevision) return fail("P11_REVISION_STALE");
  if (authority.pendingOperation) return fail("P11_OPERATION_PENDING");
  const p10 = currentProductionAuthority(record);
  if (!p10.ok) return p10;
  const fqdn = normalizeP11Fqdn(input.fqdn);
  if (classifyP11Hostname(input.fqdn) === "provider_platform_hostname") return fail("P11_PLATFORM_HOSTNAME_UNSUPPORTED");
  if (!fqdn) return fail(String(input.fqdn || "").includes("*") ? "P11_WILDCARD_UNSUPPORTED" : "P11_FQDN_INVALID");
  let domain = authority.domains.find((item) => item.fqdn === fqdn) ?? null;
  if (input.kind === "attach" && domain) return fail("P11_DOMAIN_EXISTS");
  if (input.kind !== "attach" && !domain) return fail("P11_DOMAIN_NOT_FOUND");
  if (input.kind === "apply_required_dns_record") {
    const r = authority.domains.find((item) => item.fqdn === fqdn)?.requiredRecords?.find((item) => item.recordId === input.requiredRecordId);
    if (!r || domain.teamClaimState !== "claimed" || domain.dnsMode !== "vercel_managed" || domain.dnsState === "conflict") return fail("P11_REQUIRED_RECORD_STALE");
    if (input.record !== undefined) return fail("P11_RECORD_INPUT_FORBIDDEN");
    input = { ...input, frozenRecord: structuredClone(r) };
  }
  const operationId = randomUUID();
  const createdAt = now();
  const op = { operationId, kind: input.kind, domainId: domain?.domainId ?? randomUUID(), fqdn,
    expectedProductionReleaseId: p10.p10.currentProductionReleaseId,
    mappingId: p10.mapping.mappingId, provider: "vercel", teamRef: p10.mapping.teamRef,
    projectRef: p10.mapping.projectRef, state: "prepared", createdAt, updatedAt: createdAt,
    ...(input.kind === "apply_required_dns_record" ? { requiredRecordId: input.requiredRecordId, record: input.frozenRecord } : {}) };
  if (input.kind === "verify" && !domain.attachmentState?.startsWith("attached")) return fail("P11_DOMAIN_NOT_ATTACHED");
  if (input.kind === "apply_required_dns_record" && !domain.attachmentState?.startsWith("attached")) return fail("P11_DOMAIN_NOT_ATTACHED");
  if (input.kind === "detach" && !domain.attachmentState?.startsWith("attached")) return fail("P11_DOMAIN_NOT_ATTACHED");
  const nextAuthority = { ...authority, revision: authority.revision + 1, pendingOperation: op };
  if (input.kind === "attach") {
    const parts = fqdn.split(".");
    nextAuthority.domains = [...authority.domains, { domainId: op.domainId, fqdn,
      kind: parts.length === 2 ? "apex" : "subdomain", provider: "vercel", teamRef: op.teamRef,
      projectRef: op.projectRef, mappingId: op.mappingId, teamClaimState: "unknown",
      attachmentState: "pending", verificationState: "unknown", dnsMode: "unknown", dnsState: "unknown",
      tlsState: "unknown", requiredRecords: [], lastObservedAt: null, lastVerifiedAt: null, lastOperationId: operationId }];
  }
  const recordNext = { ...record, p11Domains: nextAuthority };
  return { ok: true, record: recordNext, operationId, revision: nextAuthority.revision, operation: op };
}

export function transitionP11DomainOperation(record, input) {
  if (!isObject(input) || !id(input.operationId) || !["effect_started", "uncertain", "observed", "completed", "safe_stop", "failed_no_effect"].includes(input.state)) return fail("P11_TRANSITION_INVALID");
  const read = readP11DomainAuthority(record);
  if (!read.ok) return read;
  const a = read.authority, op = a.pendingOperation;
  if (!op || op.operationId !== input.operationId) return fail("P11_OPERATION_NOT_CURRENT");
  if (input.expectedRevision !== undefined && input.expectedRevision !== a.revision) return fail("P11_REVISION_STALE");
  if (input.state === "effect_started" && op.state !== "prepared") return fail("P11_EFFECT_ALREADY_ATTEMPTED");
  const updated = { ...op, state: input.state, updatedAt: now(), ...(input.failureCode ? { failureCode: input.failureCode } : {}) };
  let domains = a.domains;
  if (input.state === "completed" || input.state === "failed_no_effect") {
    const domain = domains.find((item) => item.domainId === op.domainId);
    if (!domain && op.kind !== "attach") return fail("P11_DOMAIN_NOT_FOUND");
    if (op.kind === "detach" && input.state === "completed") domains = domains.map((item) => item.domainId === op.domainId ? { ...item, attachmentState: "detached", lastOperationId: op.operationId, lastObservedAt: input.observation?.observedAt ?? now() } : item);
    else if (input.observation) {
      const reduced = reduceP11DomainObservation(input.observation, { fqdn: op.fqdn, projectRef: op.projectRef, teamRef: op.teamRef });
      if (!reduced.ok) return reduced;
      domains = domains.map((item) => item.domainId === op.domainId ? { ...item, ...reduced.domain,
        domainId: item.domainId, fqdn: item.fqdn, kind: item.kind, mappingId: op.mappingId,
        teamRef: op.teamRef, projectRef: op.projectRef, lastOperationId: op.operationId } : item);
    }
  }
  const history = [ ...a.operationHistory, { operationId: op.operationId, kind: op.kind, domainId: op.domainId,
    fqdn: op.fqdn, expectedProductionReleaseId: op.expectedProductionReleaseId, mappingId: op.mappingId,
    teamRef: op.teamRef, projectRef: op.projectRef, createdAt: op.createdAt,
    completedAt: ["completed", "failed_no_effect"].includes(input.state) ? now() : null,
    state: input.state, ...(input.failureCode ? { failureCode: input.failureCode } : {}),
    ...(op.record ? { record: op.record, providerRecordId: input.providerRecordId ?? null } : {}) }];
  const next = { ...a, revision: a.revision + 1, domains,
    pendingOperation: ["completed", "failed_no_effect"].includes(input.state) ? null : updated,
    operationHistory: history };
  return { ok: true, record: { ...record, p11Domains: next }, revision: next.revision,
    state: input.state, domain: domains.find((item) => item.domainId === op.domainId) ?? null };
}

export function recordP11DomainObservation(record, observation) {
  const read = readP11DomainAuthority(record);
  if (!read.ok) return read;
  if (read.authority.pendingOperation) return fail("P11_OPERATION_PENDING");
  const fqdn = normalizeP11Fqdn(observation?.fqdn);
  if (!fqdn) return fail("P11_FQDN_INVALID");
  const existing = read.authority.domains.find((item) => item.fqdn === fqdn);
  if (!existing) return { ok: true, record, revision: read.authority.revision, observationOnly: true };
  const reduced = reduceP11DomainObservation(observation, { fqdn, projectRef: existing.projectRef, teamRef: existing.teamRef });
  if (!reduced.ok) return reduced;
  const authority = { ...read.authority, revision: read.authority.revision + 1,
    domains: read.authority.domains.map((item) => item.domainId === existing.domainId ? { ...item, ...reduced.domain,
      domainId: item.domainId, fqdn: item.fqdn, kind: item.kind, mappingId: item.mappingId,
      projectRef: item.projectRef, teamRef: item.teamRef, lastOperationId: item.lastOperationId } : item) };
  return { ok: true, record: { ...record, p11Domains: authority }, revision: authority.revision,
    domain: authority.domains.find((item) => item.domainId === existing.domainId) };
}

export function reduceP11DomainObservation(raw, expected) {
  if (!isObject(raw) || classifyP11Hostname(raw.fqdn) !== "creator_domain" || raw.fqdn !== expected.fqdn || raw.projectRef !== expected.projectRef ||
      raw.teamRef !== expected.teamRef || !["unknown", "action_required", "pending", "valid", "conflict"].includes(raw.dnsState) ||
      !["unknown", "pending", "ready", "action_required", "error"].includes(raw.tlsState) ||
      !["unknown", "claimed", "conflict"].includes(raw.teamClaimState) ||
      !["detached", "attached", "attached_unverified", "conflict"].includes(raw.attachmentState) ||
      !["unknown", "verified", "action_required", "conflict"].includes(raw.verificationState) ||
      !["unknown", "vercel_managed", "external"].includes(raw.dnsMode) || !timestamp(raw.observedAt) ||
      !Array.isArray(raw.requiredRecords) || raw.requiredRecords.some((r) => !isObject(r) ||
        !["TXT", "A", "AAAA", "CNAME", "ALIAS", "CAA", "MX", "SRV"].includes(r.type) ||
        typeof r.name !== "string" || typeof r.value !== "string" ||
        !["ownership", "routing"].includes(r.purpose) || !id(r.recordId))) return fail("P11_PROVIDER_OBSERVATION_UNSAFE");
  return { ok: true, domain: { teamClaimState: raw.teamClaimState, attachmentState: raw.attachmentState,
    verificationState: raw.verificationState, dnsMode: raw.dnsMode, dnsState: raw.dnsState,
    tlsState: raw.tlsState, requiredRecords: structuredClone(raw.requiredRecords), lastObservedAt: raw.observedAt,
    lastVerifiedAt: raw.verificationState === "verified" ? raw.observedAt : null } };
}

export function classifyP11Tls({ fqdn, certificateNames, validFrom, validTo, handshakeOk, httpStatus, observedAt }) {
  const names = Array.isArray(certificateNames) ? certificateNames : [];
  const exactName = names.includes(fqdn);
  const nowMs = Date.parse(observedAt);
  const dates = Number.isFinite(Date.parse(validFrom)) && Number.isFinite(Date.parse(validTo)) &&
    Date.parse(validFrom) <= nowMs && nowMs <= Date.parse(validTo);
  const ready = exactName && dates && handshakeOk === true;
  return { ok: true, tlsState: ready ? "ready" : handshakeOk === false ? "error" : "pending",
    certificateExactName: exactName, certificateValid: dates, handshakeOk: handshakeOk === true,
    httpStatus: Number.isInteger(httpStatus) ? httpStatus : null, observedAt };
}
