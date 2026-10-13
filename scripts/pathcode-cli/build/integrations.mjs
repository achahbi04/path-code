/** P12.1 typed integration identity and P9 credential-reference authority. */
import { randomUUID } from "node:crypto";
import { readBuildRecord } from "./record.mjs";
import { listBuildEnvironments, readBuildEnvironment, readBuildSecretBinding } from "./environments.mjs";

export const INTEGRATIONS_SCHEMA = "pathcode.p12.integrations.v1";
const PROVIDERS = Object.freeze({
  github: Object.freeze({ providerKey: "github", displayName: "GitHub",
    credentialRoles: Object.freeze([{ role: "token", required: true }]) }),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const FAILURE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SECRET_LIKE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|\bBearer\s+\S+|\b(?:ghp|github_pat)_[A-Za-z0-9_]{10,}|\bsk_(?:live|test)_[A-Za-z0-9]{8,}/i;
const fail = (code) => ({ ok: false, code });
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const only = (value, keys) => plain(value) && Object.keys(value).every((key) => keys.includes(key));
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

export function emptyBuildIntegrationAuthority() {
  return { schema: INTEGRATIONS_SCHEMA, revision: 0, items: [] };
}

export function listBuildIntegrationCatalog() {
  return Object.values(PROVIDERS).map((provider) => ({
    providerKey: provider.providerKey,
    displayName: provider.displayName,
    credentialRoles: provider.credentialRoles.map((item) => ({ ...item })),
  }));
}

function validVerification(value) {
  return only(value, ["state", "adapterVersion", "providerAccountRef", "capabilities", "verifiedAt", "failureCode"]) &&
    ["unverified", "ready", "action_required", "unavailable"].includes(value.state) &&
    (value.adapterVersion === null || typeof value.adapterVersion === "string" && SAFE_ID.test(value.adapterVersion)) &&
    (value.providerAccountRef === null || typeof value.providerAccountRef === "string" && SAFE_ID.test(value.providerAccountRef)) &&
    Array.isArray(value.capabilities) && value.capabilities.every((item) => typeof item === "string" && SAFE_ID.test(item)) &&
    new Set(value.capabilities).size === value.capabilities.length &&
    (value.verifiedAt === null || iso(value.verifiedAt)) &&
    (value.failureCode === null || typeof value.failureCode === "string" && FAILURE_CODE.test(value.failureCode)) &&
    (value.state !== "ready" || value.adapterVersion !== null && value.providerAccountRef !== null && value.verifiedAt !== null);
}

function validAuthority(section) {
  if (!only(section, ["schema", "revision", "items"]) || section.schema !== INTEGRATIONS_SCHEMA ||
      !Number.isSafeInteger(section.revision) || section.revision < 0 || !Array.isArray(section.items)) return false;
  const integrationIds = new Set(), bindingIds = new Set(), labels = new Set();
  for (const item of section.items) {
    if (!only(item, ["integrationId", "providerKey", "label", "createdAt", "updatedAt", "bindings"]) ||
        !UUID.test(item.integrationId) || !own(PROVIDERS, item.providerKey) || !validLabel(item.label) ||
        !iso(item.createdAt) || !iso(item.updatedAt) || !Array.isArray(item.bindings) ||
        integrationIds.has(item.integrationId) || labels.has(item.label.toLowerCase())) return false;
    integrationIds.add(item.integrationId); labels.add(item.label.toLowerCase());
    const environments = new Set();
    for (const binding of item.bindings) {
      if (!only(binding, ["bindingId", "environmentId", "credentials", "verification", "createdAt", "updatedAt"]) ||
          !UUID.test(binding.bindingId) || !UUID.test(binding.environmentId) || !Array.isArray(binding.credentials) ||
          !validVerification(binding.verification) || !iso(binding.createdAt) || !iso(binding.updatedAt) ||
          bindingIds.has(binding.bindingId) || environments.has(binding.environmentId)) return false;
      bindingIds.add(binding.bindingId); environments.add(binding.environmentId);
      const roles = new Set();
      for (const credential of binding.credentials) {
        if (!only(credential, ["role", "secretRef"]) ||
            !PROVIDERS[item.providerKey].credentialRoles.some((entry) => entry.role === credential.role) ||
            typeof credential.secretRef !== "string" || !SAFE_ID.test(credential.secretRef) || roles.has(credential.role)) return false;
        roles.add(credential.role);
      }
    }
  }
  return true;
}

function validLabel(label) {
  return typeof label === "string" && label.trim() === label && label.length >= 1 && label.length <= 80 &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(label) && !SECRET_LIKE.test(label);
}

function authorityFor(record) {
  if (own(record, "integrations")) return validAuthority(record.integrations)
    ? { ok: true, authority: record.integrations }
    : fail("INTEGRATIONS_INVALID");
  return { ok: true, authority: emptyBuildIntegrationAuthority() };
}

function boundRecord(runtimeRoot, buildId) {
  if (typeof buildId !== "string" || !buildId) return fail("BUILD_NOT_FOUND");
  const record = readBuildRecord(runtimeRoot, buildId);
  if (!record || record.buildId !== buildId) return fail("BUILD_NOT_FOUND");
  const authority = authorityFor(record);
  return authority.ok ? { ok: true, record, authority: authority.authority } : authority;
}

export function listBuildIntegrations(runtimeRoot, buildId) {
  const found = boundRecord(runtimeRoot, buildId);
  if (!found.ok) return found;
  return { ok: true, buildId, ...structuredClone(found.authority) };
}

export function readBuildIntegration(runtimeRoot, buildId, integrationId) {
  const listed = listBuildIntegrations(runtimeRoot, buildId);
  if (!listed.ok) return listed;
  const integration = listed.items.find((item) => item.integrationId === integrationId);
  return integration ? { ok: true, buildId, revision: listed.revision, integration: structuredClone(integration) }
    : fail("INTEGRATION_NOT_FOUND");
}

function unverified() {
  return { state: "unverified", adapterVersion: null, providerAccountRef: null,
    capabilities: [], verifiedAt: null, failureCode: null };
}

function inputKeys(action) {
  return ({
    create_integration: ["providerKey", "label"], rename_integration: ["integrationId", "label"],
    delete_integration: ["integrationId"], bind_environment: ["integrationId", "environmentId"],
    unbind_environment: ["integrationId", "bindingId"],
    bind_credential: ["integrationId", "bindingId", "role", "secretRef"],
    unbind_credential: ["integrationId", "bindingId", "role"],
  })[action];
}

export function prepareBuildIntegrationMutation(runtimeRoot, buildId, request) {
  if (!only(request, ["action", "expectedIntegrationRevision", "input"]) ||
      !Number.isSafeInteger(request.expectedIntegrationRevision) || request.expectedIntegrationRevision < 0) {
    return fail("INTEGRATION_MUTATION_INVALID");
  }
  const allowed = inputKeys(request.action);
  if (!allowed || !only(request.input, allowed) || Object.keys(request.input).length !== allowed.length) {
    return fail("INTEGRATION_MUTATION_INVALID");
  }
  const found = boundRecord(runtimeRoot, buildId);
  if (!found.ok) return found;
  const authority = structuredClone(found.authority);
  if (authority.revision !== request.expectedIntegrationRevision) return fail("INTEGRATION_REVISION_STALE");
  const input = request.input;
  const integration = authority.items.find((item) => item.integrationId === input.integrationId);
  const now = new Date().toISOString();
  let integrationId = input.integrationId;
  let bindingId;
  let providerKey;
  let role;

  if (request.action === "create_integration") {
    if (!own(PROVIDERS, input.providerKey)) return fail("INTEGRATION_PROVIDER_UNSUPPORTED");
    if (!validLabel(input.label)) return fail("INTEGRATION_LABEL_INVALID");
    if (authority.items.some((item) => item.label.toLowerCase() === input.label.toLowerCase())) return fail("INTEGRATION_LABEL_CONFLICT");
    integrationId = randomUUID(); providerKey = input.providerKey;
    authority.items.push({ integrationId, providerKey, label: input.label, createdAt: now, updatedAt: now, bindings: [] });
  } else {
    if (!integration) return fail("INTEGRATION_NOT_FOUND");
    providerKey = integration.providerKey;
    if (request.action === "rename_integration") {
      if (!validLabel(input.label)) return fail("INTEGRATION_LABEL_INVALID");
      if (integration.label === input.label) return fail("INTEGRATION_UNCHANGED");
      if (authority.items.some((item) => item.integrationId !== integration.integrationId &&
          item.label.toLowerCase() === input.label.toLowerCase())) return fail("INTEGRATION_LABEL_CONFLICT");
      integration.label = input.label; integration.updatedAt = now;
    } else if (request.action === "delete_integration") {
      if (integration.bindings.length) return fail("INTEGRATION_NOT_EMPTY");
      authority.items = authority.items.filter((item) => item.integrationId !== integration.integrationId);
    } else {
      const binding = integration.bindings.find((item) => item.bindingId === input.bindingId);
      if (request.action === "bind_environment") {
        const environments = listBuildEnvironments(runtimeRoot, buildId);
        if (!environments.ok) return environments;
        if (!environments.items.some((item) => item.environmentId === input.environmentId)) return fail("ENVIRONMENT_NOT_FOUND");
        if (integration.bindings.some((item) => item.environmentId === input.environmentId)) return fail("INTEGRATION_ENVIRONMENT_ALREADY_BOUND");
        bindingId = randomUUID();
        integration.bindings.push({ bindingId, environmentId: input.environmentId, credentials: [],
          verification: unverified(), createdAt: now, updatedAt: now });
        integration.updatedAt = now;
      } else {
        if (!binding) return fail("INTEGRATION_BINDING_NOT_FOUND");
        bindingId = binding.bindingId;
        if (request.action === "unbind_environment") {
          if (binding.credentials.length) return fail("INTEGRATION_BINDING_NOT_EMPTY");
          integration.bindings = integration.bindings.filter((item) => item.bindingId !== binding.bindingId);
          integration.updatedAt = now;
        } else if (request.action === "bind_credential") {
          role = input.role;
          if (!PROVIDERS[integration.providerKey].credentialRoles.some((item) => item.role === role)) return fail("INTEGRATION_CREDENTIAL_ROLE_UNSUPPORTED");
          if (binding.credentials.some((item) => item.role === role)) return fail("INTEGRATION_CREDENTIAL_ROLE_ALREADY_BOUND");
          const secret = readBuildSecretBinding(runtimeRoot, buildId, binding.environmentId, input.secretRef);
          if (!secret.ok) return fail(secret.code === "SECRET_BINDING_NOT_FOUND" ? "INTEGRATION_SECRET_REF_NOT_FOUND" : secret.code);
          if (secret.binding.kind !== "secret") return fail("INTEGRATION_SECRET_REF_NOT_FOUND");
          binding.credentials.push({ role, secretRef: input.secretRef });
          binding.verification = unverified(); binding.updatedAt = now; integration.updatedAt = now;
        } else {
          role = input.role;
          if (!PROVIDERS[integration.providerKey].credentialRoles.some((item) => item.role === role)) return fail("INTEGRATION_CREDENTIAL_ROLE_UNSUPPORTED");
          const index = binding.credentials.findIndex((item) => item.role === role);
          if (index < 0) return fail("INTEGRATION_CREDENTIAL_NOT_FOUND");
          binding.credentials.splice(index, 1); binding.verification = unverified();
          binding.updatedAt = now; integration.updatedAt = now;
        }
      }
    }
  }
  authority.revision += 1;
  const next = { ...found.record, integrations: authority };
  return { ok: true, record: next, integrationId, ...(bindingId ? { bindingId } : {}),
    ...(providerKey ? { providerKey } : {}), ...(role ? { role } : {}), revision: authority.revision };
}

/** Internal P12.2 transition. Only the coordinator verification workflow calls this. */
export function prepareBuildIntegrationVerificationMutation(runtimeRoot, buildId, snapshot, verification) {
  if (!plain(snapshot) || !validVerification(verification) || verification.state === "unverified" ||
      verification.verifiedAt === null ||
      (verification.adapterVersion !== null && verification.adapterVersion !== snapshot.adapterVersion) ||
      (verification.state === "ready" && (verification.adapterVersion === null ||
        verification.providerAccountRef === null || verification.failureCode !== null)) ||
      (verification.state !== "ready" && (verification.providerAccountRef !== null ||
        verification.capabilities.length !== 0 || verification.failureCode === null)))
    return fail("INTEGRATION_VERIFICATION_INVALID");
  const found = boundRecord(runtimeRoot, buildId);
  if (!found.ok) return found;
  if (found.authority.revision !== snapshot.integrationRevision) return fail("INTEGRATION_AUTHORITY_STALE");
  const integration = found.authority.items.find((item) => item.integrationId === snapshot.integrationId);
  const binding = integration?.bindings.find((item) => item.bindingId === snapshot.bindingId);
  if (!integration || integration.providerKey !== snapshot.providerKey || !binding ||
      binding.environmentId !== snapshot.environmentId) return fail("INTEGRATION_AUTHORITY_STALE");
  const refs = binding.credentials.map(({ role, secretRef }) => ({ role, secretRef }));
  if (JSON.stringify(refs) !== JSON.stringify(snapshot.credentials.map(({ role, secretRef }) => ({ role, secretRef }))))
    return fail("INTEGRATION_AUTHORITY_STALE");
  const environment = readBuildEnvironment(runtimeRoot, buildId, snapshot.environmentId);
  if (!environment.ok || environment.revision !== snapshot.environmentRevision ||
      environment.environment.environmentId !== snapshot.environmentId) return fail("INTEGRATION_ENVIRONMENT_STALE");
  for (const expected of snapshot.credentials) {
    const current = readBuildSecretBinding(runtimeRoot, buildId, snapshot.environmentId, expected.secretRef);
    if (!current.ok || current.binding.variableName !== expected.variableName ||
        current.binding.backend !== expected.backend || current.binding.bindingState !== expected.bindingState ||
        current.binding.presenceState !== expected.presenceState || (current.binding.safetyState ?? null) !== expected.safetyState)
      return fail("INTEGRATION_ENVIRONMENT_STALE");
  }
  const nextAuthority = structuredClone(found.authority);
  const nextIntegration = nextAuthority.items.find((item) => item.integrationId === snapshot.integrationId);
  const nextBinding = nextIntegration.bindings.find((item) => item.bindingId === snapshot.bindingId);
  nextBinding.verification = structuredClone(verification);
  nextBinding.updatedAt = new Date().toISOString();
  nextIntegration.updatedAt = nextBinding.updatedAt;
  nextAuthority.revision += 1;
  return { ok: true, record: { ...found.record, integrations: nextAuthority },
    integrationId: snapshot.integrationId, bindingId: snapshot.bindingId,
    providerKey: snapshot.providerKey, revision: nextAuthority.revision,
    verification: structuredClone(verification) };
}
