/** Strict structured Vercel domains/DNS/certificate boundary for P11. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createVercelChildEnv } from "./vercel-preview-adapter.mjs";
import { normalizeP11Fqdn, classifyP11Hostname } from "./p11-domains.mjs";
import { probeP11Https } from "./p11-https-probe.mjs";

const fail = (code, details = {}) => ({ ok: false, code, ...details });
const obj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const only = (v, keys) => obj(v) && Object.keys(v).every((key) => keys.includes(key));
const locator = (v) => typeof v === "string" && /^[A-Za-z0-9._-]{1,160}$/.test(v);
const time = (v) => Number.isSafeInteger(v) && v >= 0;
const safeBase = (input) => input && locator(input.projectRef) && locator(input.teamRef) && normalizeP11Fqdn(input.fqdn);
const command = (endpoint, method = "GET", body = null) => ({ ok: true, executable: "vercel", argv: ["api", endpoint, "-X", method, "--include", ...(body ? ["--input", "-"] : [])], shell: false, stdinPayload: body ? JSON.stringify(body) : null });
const teamQuery = (teamRef) => `teamId=${encodeURIComponent(teamRef)}`;
const isPlatformHost = (fqdn) => classifyP11Hostname(fqdn) === "provider_platform_hostname";
const zoneContains = (fqdn, zone) => fqdn === zone || fqdn.endsWith(`.${zone}`);

export const P11_PROVIDER_CONTRACTS = Object.freeze({
  team_domains: { method: "GET", path: "/v5/domains" },
  project: { method: "GET", path: "/v9/projects/{projectRef}" },
  project_domains: { method: "GET", path: "/v9/projects/{projectRef}/domains" },
  project_domain: { method: "GET", path: "/v9/projects/{projectRef}/domains/{fqdn}" },
  domain_config: { method: "GET", path: "/v6/domains/{fqdn}/config" },
  attach: { method: "POST", path: "/v10/projects/{projectRef}/domains" },
  verify: { method: "POST", path: "/v9/projects/{projectRef}/domains/{fqdn}/verify" },
  dns_records: { method: "GET", path: "/v5/domains/{fqdn}/records" },
  dns_create: { method: "POST", path: "/v3/domains/{fqdn}/records" },
  dns_record: { method: "GET", path: "/v5/domains/records/{recordId}" },
  certificates: { method: "GET", path: "/v4/certs" },
  certificate: { method: "GET", path: "/v6/certs/{certificateId}" },
  detach: { method: "DELETE", path: "/v9/projects/{projectRef}/domains/{fqdn}" },
});

export function makeP11VercelApiCommand(kind, input = {}) {
  if (!Object.hasOwn(P11_PROVIDER_CONTRACTS, kind)) return fail("P11_PROVIDER_COMMAND_INVALID");
  let endpoint, method = P11_PROVIDER_CONTRACTS[kind].method, body = null;
  if (kind === "team_domains") {
    if (!locator(input.teamRef) || (input.next !== undefined && (!Number.isSafeInteger(input.next) || input.next < 0))) return fail("P11_PROVIDER_COMMAND_INVALID");
    endpoint = `/v5/domains?${teamQuery(input.teamRef)}&limit=100${input.next === undefined ? "" : `&until=${input.next}`}`;
  } else if (kind === "certificates") {
    if (!locator(input.teamRef)) return fail("P11_PROVIDER_COMMAND_INVALID");
    endpoint = `/v4/certs?${teamQuery(input.teamRef)}&limit=100`;
  } else if (kind === "project") {
    if (!locator(input.projectRef) || !locator(input.teamRef)) return fail("P11_PROVIDER_COMMAND_INVALID");
    endpoint = `/v9/projects/${encodeURIComponent(input.projectRef)}?${teamQuery(input.teamRef)}`;
  } else if (kind === "certificate" || kind === "dns_record") {
    if (!locator(input.teamRef) || !locator(kind === "certificate" ? input.certificateId : input.recordId)) return fail("P11_PROVIDER_COMMAND_INVALID");
    endpoint = kind === "certificate" ? `/v6/certs/${encodeURIComponent(input.certificateId)}?${teamQuery(input.teamRef)}` :
      `/v5/domains/records/${encodeURIComponent(input.recordId)}?${teamQuery(input.teamRef)}`;
  } else if (kind === "project_domains") {
    if (!locator(input.projectRef) || !locator(input.teamRef)) return fail("P11_PROVIDER_COMMAND_INVALID");
    endpoint = `/v9/projects/${encodeURIComponent(input.projectRef)}/domains?${teamQuery(input.teamRef)}&limit=100`;
  } else {
    if (!safeBase(input)) return fail("P11_PROVIDER_COMMAND_INVALID");
    const fqdn = normalizeP11Fqdn(input.fqdn), project = encodeURIComponent(input.projectRef), domain = encodeURIComponent(fqdn);
    if (isPlatformHost(fqdn)) return fail("P11_PLATFORM_HOSTNAME_UNSUPPORTED");
    if (["dns_records", "dns_create"].includes(kind) &&
        (input.teamClaimState !== "claimed" || input.dnsMode !== "vercel_managed" ||
         !normalizeP11Fqdn(input.dnsZone) || isPlatformHost(input.dnsZone) || !zoneContains(fqdn, input.dnsZone)))
      return fail("P11_DNS_ZONE_AUTHORITY_REQUIRED");
    if (kind === "project_domain") endpoint = `/v9/projects/${project}/domains/${domain}?${teamQuery(input.teamRef)}`;
    if (kind === "domain_config") endpoint = `/v6/domains/${domain}/config?projectIdOrName=${project}&${teamQuery(input.teamRef)}`;
    if (kind === "attach") { endpoint = `/v10/projects/${project}/domains?${teamQuery(input.teamRef)}`; body = { name: fqdn }; }
    if (kind === "verify") endpoint = `/v9/projects/${project}/domains/${domain}/verify?${teamQuery(input.teamRef)}`;
    const dnsDomain = encodeURIComponent(normalizeP11Fqdn(input.dnsZone) ?? fqdn);
    if (kind === "dns_records") endpoint = `/v5/domains/${dnsDomain}/records?${teamQuery(input.teamRef)}&limit=100`;
    if (kind === "dns_create") {
      const r = input.record;
      if (!obj(r) || !["TXT", "A", "AAAA", "CNAME", "ALIAS", "CAA", "MX", "SRV"].includes(r.type) ||
          typeof r.name !== "string" || typeof r.value !== "string" || !["ownership", "routing"].includes(r.purpose)) return fail("P11_PROVIDER_COMMAND_INVALID");
      endpoint = `/v3/domains/${dnsDomain}/records?${teamQuery(input.teamRef)}`;
      body = { type: r.type, name: r.name, value: r.value, ...(Number.isSafeInteger(r.ttl) ? { ttl: r.ttl } : {}),
        ...(Number.isSafeInteger(r.priority) ? { mxPriority: r.priority } : {}) };
    }
    if (kind === "detach") endpoint = `/v9/projects/${project}/domains/${domain}?${teamQuery(input.teamRef)}`;
  }
  if (!endpoint) return fail("P11_PROVIDER_COMMAND_INVALID");
  const proofInput = kind === "team_domains" ? { teamRef: input.teamRef, ...(input.next === undefined ? {} : { next: input.next }) } :
    kind === "certificates" ? { teamRef: input.teamRef } :
    kind === "project" || kind === "project_domains" ? { projectRef: input.projectRef, teamRef: input.teamRef } :
    kind === "certificate" ? { certificateId: input.certificateId, teamRef: input.teamRef } :
    kind === "dns_record" ? { recordId: input.recordId, teamRef: input.teamRef } :
    { fqdn: input.fqdn, projectRef: input.projectRef, teamRef: input.teamRef,
      ...(["dns_records", "dns_create"].includes(kind) ? { teamClaimState: input.teamClaimState,
        dnsMode: input.dnsMode, dnsZone: input.dnsZone } : {}),
      ...(kind === "dns_create" ? { record: input.record } : {}) };
  return { ...command(endpoint, method, body), proofContext: { kind, input: proofInput } };
}

export async function executeP11VercelApi(spec, { cwd, parentEnv = process.env, spawnImpl = spawn, timeoutMs = 30_000 } = {}) {
  if (typeof cwd !== "string" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000 || !spec?.ok) return fail("P11_PROVIDER_COMMAND_INVALID");
  const argv = spec.argv;
  if (spec.executable !== "vercel" || spec.shell !== false || !Array.isArray(argv) || argv[0] !== "api" || argv.length < 4 || !["GET", "POST", "DELETE"].includes(argv[3]) ||
      (spec.stdinPayload !== null && (!argv.includes("--input") || argv.at(-1) !== "-")) ||
      (spec.stdinPayload === null && argv.includes("--input"))) return fail("P11_PROVIDER_COMMAND_INVALID");
  const proof = spec.proofContext;
  if (!obj(proof) || !Object.hasOwn(P11_PROVIDER_CONTRACTS, proof.kind) || !obj(proof.input)) return fail("P11_PROVIDER_COMMAND_INVALID");
  const expected = makeP11VercelApiCommand(proof.kind, proof.input);
  if (!expected.ok || JSON.stringify(expected.argv) !== JSON.stringify(argv) || expected.stdinPayload !== spec.stdinPayload)
    return fail("P11_PROVIDER_COMMAND_INVALID");
  return new Promise((resolve) => {
    let out = "", size = 0, done = false;
    let timer = null;
    const finish = (value) => { if (!done) { done = true; if (timer) clearTimeout(timer); resolve(value); } };
    let child;
    try { child = spawnImpl("vercel", argv, { cwd, env: createVercelChildEnv(parentEnv), shell: false, stdio: ["pipe", "pipe", "pipe"] }); }
    catch { return finish(fail("P11_PROVIDER_EXECUTION_FAILED")); }
    timer = setTimeout(() => { child.kill("SIGKILL"); finish(fail("P11_PROVIDER_OUTCOME_UNKNOWN")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { size += chunk.length; if (size > 1024 * 1024) { child.kill(); finish(fail("P11_PROVIDER_OUTPUT_UNSAFE")); } else out += chunk.toString("utf8"); });
    child.stderr.on("data", () => {});
    child.on("error", () => finish(fail("P11_PROVIDER_EXECUTION_FAILED")));
    child.on("close", (code) => {
      const parsed = parseIncludedResponse(out);
      if (!parsed.ok) return finish(code === 0 ? fail("P11_PROVIDER_OUTPUT_UNSAFE") :
        fail(methodFromArgv(spec.argv) === "GET" ? "P11_PROVIDER_READ_FAILED" : "P11_PROVIDER_OUTCOME_UNKNOWN",
          { httpStatus: null, providerCode: null }));
      if (code !== 0 || parsed.httpStatus < 200 || parsed.httpStatus >= 300) {
        const providerCode = parsed.jsonValid ? boundedProviderCode(parsed.body) : null;
        return finish(fail(methodFromArgv(spec.argv) === "GET" ? "P11_PROVIDER_READ_FAILED" : "P11_PROVIDER_OUTCOME_UNKNOWN",
          { httpStatus: parsed.httpStatus, providerCode }));
      }
      if (!parsed.jsonValid) return finish(fail("P11_PROVIDER_OUTPUT_UNSAFE"));
      finish({ ok: true, raw: parsed.body });
    });
    child.stdin.end(spec.stdinPayload ?? undefined);
  });
}

function methodFromArgv(argv) { return argv[3]; }

function parseIncludedResponse(output) {
  const separator = output.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
  const boundary = output.indexOf(separator);
  if (boundary < 0) return { ok: false };
  const headers = output.slice(0, boundary).split(/\r?\n/);
  const status = /^HTTP\s+(\d{3})(?:\s|$)/.exec(headers[0] ?? "");
  if (!status || headers.slice(1).some((line) => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+:\s*[^\r\n]*$/.test(line))) return { ok: false };
  try { return { ok: true, httpStatus: Number(status[1]), body: JSON.parse(output.slice(boundary + separator.length)), jsonValid: true }; }
  catch { return { ok: true, httpStatus: Number(status[1]), body: null, jsonValid: false }; }
}

function boundedProviderCode(body) {
  if (!obj(body) || !obj(body.error)) return null;
  const value = body.error.code;
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value) ? value : null;
}

export function reduceP11Project(raw, expected) {
  if (!obj(raw) ||
      !locator(raw.id) || !locator(raw.name) || (raw.teamId !== undefined && raw.teamId !== expected.teamRef)) return fail("P11_PROVIDER_SHAPE_UNSAFE");
  return { ok: true, projectId: raw.id, projectName: raw.name, teamRef: raw.teamId ?? expected.teamRef };
}

export function reduceP11TeamDomainPage(raw, expectedTeamRef) {
  if (!obj(raw) || !only(raw, ["domains", "pagination", "contextName"]) || !Array.isArray(raw.domains) || !obj(raw.pagination) ||
      (raw.contextName !== undefined && (typeof raw.contextName !== "string" || !raw.contextName.trim())) ||
      !only(raw.pagination, ["count", "next", "prev"]) || !Number.isSafeInteger(raw.pagination.count) ||
      !(raw.pagination.next === null || Number.isSafeInteger(raw.pagination.next)) ||
      raw.domains.some((d) => !obj(d) || classifyP11Hostname(d.name) === "invalid" || normalizeP11Fqdn(d.name) !== d.name ||
        (d.serviceType !== undefined && typeof d.serviceType !== "string") ||
        (d.nameservers !== undefined && typeof d.nameservers !== "string" && (!Array.isArray(d.nameservers) || d.nameservers.some((n) => typeof n !== "string"))) ||
        (d.teamId !== undefined && d.teamId !== expectedTeamRef))) return fail("P11_PROVIDER_SHAPE_UNSAFE");
  return { ok: true, teamRef: expectedTeamRef, domains: raw.domains.filter((d) => !isPlatformHost(d.name)).map((d) => ({ fqdn: d.name,
    dnsMode: d.nameservers === "vercel" || d.serviceType === "zeit.world" ? "vercel_managed" : "external",
    teamClaimState: "claimed" })), next: raw.pagination.next };
}

export function reduceP11ProjectDomainPage(raw, { projectId, projectRef, teamRef }) {
  if (!obj(raw) || !only(raw, ["domains", "pagination"]) || !Array.isArray(raw.domains) || !obj(raw.pagination) ||
      !only(raw.pagination, ["count", "next", "prev"]) || !Number.isSafeInteger(raw.pagination.count) ||
      !(raw.pagination.next === null || Number.isSafeInteger(raw.pagination.next)) || raw.domains.some((d) => !validProjectDomain(d, projectId)))
    return fail("P11_PROVIDER_SHAPE_UNSAFE");
  const platformRows = raw.domains.filter((domain) => isPlatformHost(domain.name));
  return { ok: true, projectRef, teamRef, domains: raw.domains.filter((domain) => !isPlatformHost(domain.name)).map(reduceProjectDomain),
    providerPlatformHostnameCount: platformRows.length, next: raw.pagination.next };
}

function validProjectDomain(d, projectRef) {
  return obj(d) && only(d, ["name", "apexName", "projectId", "verified", "verification", "redirect", "redirectStatusCode", "gitBranch", "customEnvironmentId", "createdAt", "updatedAt"]) &&
    normalizeP11Fqdn(d.name) === d.name && typeof d.projectId === "string" && d.projectId === projectRef && typeof d.verified === "boolean" &&
    (d.redirect == null || typeof d.redirect === "string") && (d.redirectStatusCode == null || [301, 302, 307, 308].includes(d.redirectStatusCode)) &&
    (d.verification === undefined || Array.isArray(d.verification) && d.verification.every((v) => obj(v) && only(v, ["domain", "reason", "type", "value"]) &&
      typeof v.domain === "string" && typeof v.type === "string" && typeof v.value === "string"));
}
function reduceProjectDomain(d) { return { fqdn: d.name, apexName: d.apexName, projectRef: d.projectId, verified: d.verified,
  verification: (d.verification ?? []).map(({ domain, type, value }) => ({ domain, type, value })),
  redirect: d.redirect ?? null, redirectStatusCode: d.redirectStatusCode ?? null }; }

export function reduceP11DnsPage(raw) {
  if (!obj(raw) || !only(raw, ["records", "pagination"]) || !Array.isArray(raw.records) || !obj(raw.pagination) ||
      !only(raw.pagination, ["count", "next", "prev"]) || !Number.isSafeInteger(raw.pagination.count) ||
      !(raw.pagination.next === null || Number.isSafeInteger(raw.pagination.next)) || raw.records.some((r) => !validDnsRecord(r))) return fail("P11_PROVIDER_SHAPE_UNSAFE");
  return { ok: true, records: raw.records.map(reduceDnsRecord), next: raw.pagination.next };
}
function validDnsRecord(r) { return obj(r) && only(r, ["id", "name", "type", "value", "mxPriority", "priority", "createdAt", "creator", "ttl"]) &&
  locator(r.id) && typeof r.name === "string" && ["TXT", "A", "AAAA", "CNAME", "ALIAS", "CAA", "MX", "SRV"].includes(r.type) &&
  typeof r.value === "string" && (r.createdAt === undefined || time(r.createdAt)); }
function reduceDnsRecord(r) { return { recordId: r.id, name: r.name, type: r.type, value: r.value,
  priority: r.mxPriority ?? r.priority ?? null, ttl: r.ttl ?? null }; }

export function reduceP11Certificates(raw) {
  if (!obj(raw) || !only(raw, ["certs", "pagination"])) return fail("P11_PROVIDER_SHAPE_UNSAFE");
  const rows = raw.certs;
  if (!Array.isArray(rows) || rows.some((c) => !obj(c) || !locator(c.uid) || !Array.isArray(c.cns) ||
      c.cns.some((n) => typeof n !== "string") || !Number.isFinite(Date.parse(c.expiration)) || !Number.isFinite(Date.parse(c.created)))) return fail("P11_PROVIDER_SHAPE_UNSAFE");
  return { ok: true, certificates: rows.map((c) => ({ certificateId: c.uid, names: [...c.cns], expiresAt: Date.parse(c.expiration),
    autoRenew: c.autoRenew === true })) };
}

export function reduceP11DomainConfig(raw, fqdn) {
  if (classifyP11Hostname(fqdn) !== "creator_domain") return fail("P11_PLATFORM_HOSTNAME_UNSUPPORTED");
  if (!obj(raw) || !only(raw, ["configuredBy", "serviceType", "nameservers", "dnssecEnabled", "misconfigured", "ipStatus", "cnames", "aValues", "recommendedIPv4", "recommendedCNAME", "acceptedChallenges", "conflicts"]) ||
      (raw.nameservers !== undefined && (!Array.isArray(raw.nameservers) || raw.nameservers.some((x) => typeof x !== "string"))) ||
      (raw.misconfigured !== undefined && typeof raw.misconfigured !== "boolean") ||
      (raw.conflicts !== undefined && !Array.isArray(raw.conflicts)) ||
      (raw.recommendedIPv4 !== undefined && (!Array.isArray(raw.recommendedIPv4) || raw.recommendedIPv4.some((r) => !obj(r) || !Number.isInteger(r.rank) || !Array.isArray(r.value) || r.value.some((v) => typeof v !== "string")))) ||
      (raw.recommendedCNAME !== undefined && (!Array.isArray(raw.recommendedCNAME) || raw.recommendedCNAME.some((r) => !obj(r) || !Number.isInteger(r.rank) || typeof r.value !== "string"))) ||
      (raw.acceptedChallenges !== undefined && (!Array.isArray(raw.acceptedChallenges) || raw.acceptedChallenges.some((x) => typeof x !== "string")))) return fail("P11_PROVIDER_SHAPE_UNSAFE");
  const hasConflict = (raw.conflicts?.length ?? 0) > 0;
  const misconfigured = raw.misconfigured ?? null;
  const dnsState = hasConflict ? "conflict" : misconfigured === true ? "action_required" : misconfigured === false ? "valid" : "unknown";
  return { ok: true, fqdn, dnsMode: raw.serviceType === "zeit.world" ? "vercel_managed" : "external",
    dnsState, hasConflict, misconfigured, nameservers: raw.nameservers ?? [],
    dnssecEnabled: raw.dnssecEnabled ?? null, acceptedChallenges: raw.acceptedChallenges ?? [], recommendedIPv4: raw.recommendedIPv4 ?? [],
    recommendedCNAME: raw.recommendedCNAME ?? [] };
}

export function makeP11RequiredRecords({ fqdn, apexName, verification = [], config = {} }) {
  if (classifyP11Hostname(fqdn) !== "creator_domain" || classifyP11Hostname(apexName) === "provider_platform_hostname")
    return fail("P11_PLATFORM_HOSTNAME_UNSUPPORTED");
  const rows = [];
  const add = (type, name, value, purpose) => {
    const recordId = `req-${createHash("sha256").update(`${type}\0${name}\0${value}\0${purpose}`).digest("hex").slice(0, 24)}`;
    if (!rows.some((r) => r.type === type && r.name === name && r.value === value)) rows.push({ recordId, type, name, value, purpose });
  };
  const relative = (name) => name === apexName ? "" : name.endsWith(`.${apexName}`) ? name.slice(0, -(apexName.length + 1)) : name;
  for (const challenge of verification) {
    if (!obj(challenge) || typeof challenge.domain !== "string" || typeof challenge.type !== "string" || typeof challenge.value !== "string") return fail("P11_PROVIDER_SHAPE_UNSAFE");
    const type = challenge.type.toUpperCase();
    if (!["TXT", "A", "AAAA", "CNAME", "CAA"].includes(type)) continue;
    add(type, relative(challenge.domain), challenge.value, "ownership");
  }
  const name = relative(fqdn);
  for (const item of config.recommendedIPv4 ?? []) if (item.rank === 1) for (const value of item.value) add("A", name, value, "routing");
  for (const item of config.recommendedCNAME ?? []) if (item.rank === 1) add("CNAME", name, item.value, "routing");
  return { ok: true, requiredRecords: rows };
}

export async function observeP11VercelDomain(input, { execute = executeP11VercelApi, cwd, parentEnv, httpsProbe = probeP11Https } = {}) {
  if (isPlatformHost(input?.fqdn)) return fail("P11_PLATFORM_HOSTNAME_UNSUPPORTED");
  if (!safeBase(input) || typeof cwd !== "string") return fail("P11_PROVIDER_COMMAND_INVALID");
  const run = async (kind, extra = {}) => {
    const spec = makeP11VercelApiCommand(kind, { ...input, ...extra });
    if (!spec.ok) return spec;
    const result = await execute(spec, { cwd, parentEnv });
    return result.ok ? { ok: true, raw: result.raw } : result;
  };
  const [teamRaw, projectRaw, domainsRaw, configRaw, certRaw] = await Promise.all([
    run("team_domains"), run("project"), run("project_domains"), run("domain_config"), run("certificates"),
  ]);
  for (const result of [teamRaw, projectRaw, domainsRaw, configRaw, certRaw]) if (!result.ok) return result;
  const team = reduceP11TeamDomainPage(teamRaw.raw, input.teamRef);
  const project = reduceP11Project(projectRaw.raw, { teamRef: input.teamRef });
  const config = reduceP11DomainConfig(configRaw.raw, input.fqdn);
  const certificates = reduceP11Certificates(certRaw.raw);
  if (!team.ok || !project.ok || !config.ok || !certificates.ok) return fail("P11_PROVIDER_SHAPE_UNSAFE");
  if (![project.projectId, project.projectName].includes(input.projectRef) || project.teamRef !== input.teamRef)
    return fail("P11_PROVIDER_IDENTITY_MISMATCH");
  const domains = reduceP11ProjectDomainPage(domainsRaw.raw, { projectId: project.projectId,
    projectRef: input.projectRef, teamRef: input.teamRef });
  if (!domains.ok) return domains;
  const teamDomain = team.domains.filter((item) => zoneContains(input.fqdn, item.fqdn))
    .sort((left, right) => right.fqdn.length - left.fqdn.length)[0] ?? null;
  const projectDomain = domains.domains.find((item) => item.fqdn === input.fqdn);
  if (projectDomain?.redirect) return fail("P11_DOMAIN_REDIRECT_UNSUPPORTED");
  const dnsMode = teamDomain?.dnsMode ?? (config.dnsMode === "external" ? "external" : "unknown");
  const dnsZoneEligible = teamDomain?.teamClaimState === "claimed" && teamDomain.dnsMode === "vercel_managed" &&
    !isPlatformHost(teamDomain.fqdn) && zoneContains(input.fqdn, teamDomain.fqdn);
  const dnsRaw = dnsZoneEligible ? await run("dns_records", { teamClaimState: teamDomain.teamClaimState,
    dnsMode: teamDomain.dnsMode, dnsZone: teamDomain.fqdn }) :
    { ok: true, raw: { records: [], pagination: { count: 0, next: null, prev: null } } };
  if (!dnsRaw.ok) return dnsRaw;
  const dns = reduceP11DnsPage(dnsRaw.raw);
  if (!dns.ok) return dns;
  const required = makeP11RequiredRecords({ fqdn: input.fqdn, apexName: projectDomain?.apexName ?? input.fqdn.split(".").slice(-2).join("."),
    verification: projectDomain?.verification ?? [], config: configRaw.raw });
  if (!required.ok) return required;
  const exactCertificates = certificates.certificates.filter((cert) => cert.names.includes(input.fqdn));
  const cert = exactCertificates.filter((item) => item.expiresAt > Date.now()).sort((a, b) => b.expiresAt - a.expiresAt)[0] ?? null;
  const probe = await httpsProbe(input.fqdn);
  const tls = cert && probe.ok ? {
    ok: true,
    ...classifyP11Tls({ fqdn: input.fqdn, certificateNames: cert.names,
      validFrom: probe.validFrom, validTo: probe.validTo, handshakeOk: probe.handshakeOk,
      httpStatus: probe.httpStatus, observedAt: probe.observedAt }),
    certificateId: cert.certificateId,
  } : { ok: true, tlsState: probe.ok ? "pending" : "unknown", observedAt: new Date().toISOString(),
    handshakeOk: probe.ok ? probe.handshakeOk : false, httpStatus: probe.ok ? probe.httpStatus : null };
  const dnsState = config.dnsState;
  const observedAt = new Date().toISOString();
  return { ok: true, fqdn: input.fqdn, teamRef: input.teamRef, projectRef: input.projectRef,
    teamClaimState: teamDomain?.teamClaimState ?? "unknown",
    dnsZone: dnsZoneEligible ? teamDomain.fqdn : null,
    attachmentState: projectDomain ? (projectDomain.verified ? "attached" : "attached_unverified") : "detached",
    verificationState: projectDomain ? (projectDomain.verified ? "verified" : "action_required") : "unknown",
    dnsMode, dnsState, tlsState: tls.tlsState,
    requiredRecords: required.requiredRecords, observedAt, verifiedAt: projectDomain?.verified ? observedAt : null,
    dnsRecords: dns.records, certificateId: tls.certificateId ?? null, tlsProbe: tls };
}
