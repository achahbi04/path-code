/** P12.2 credential bridge and bounded verification execution. */
import { listBuildIntegrations, listBuildIntegrationCatalog } from "./integrations.mjs";
import { readBuildEnvironment, readBuildSecretBinding } from "./environments.mjs";
import { readBuildRecord } from "./record.mjs";
import { resolveExactLocalEnvValues } from "./runtime/local-env-resolve.mjs";
import { verifiedSafeLocalSecretNames } from "./runtime/local-env-coexistence.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const FAILURE_CODES = new Set(["PROVIDER_CREDENTIAL_REJECTED", "PROVIDER_UNAVAILABLE", "PROVIDER_RESPONSE_UNSAFE"]);
const LOCAL_UNAVAILABLE = new Set(["LOCAL_ENV_GIT_UNAVAILABLE"]);
const LOCAL_MISSING = new Set(["LOCAL_SECRET_MISSING"]);
const LOCAL_UNSAFE = new Set(["LOCAL_ENV_NOT_IGNORED", "LOCAL_ENV_TRACKED", "LOCAL_ENV_PATH_UNSAFE",
  "LOCAL_ENV_NATIVE_LOAD_UNSAFE", "LOCAL_ENV_SYNTAX_UNSUPPORTED", "LOCAL_ENV_DUPLICATE",
  "SECRET_BINDING_INVALID"]);
const fail = (code) => ({ ok: false, code });
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));
const timestamp = () => new Date().toISOString();

export function validIntegrationVerificationRequest(params, buildId) {
  return exactKeys(params, ["buildId", "integrationId", "bindingId", "expectedIntegrationRevision", "expectedEnvironmentRevision"]) &&
    params.buildId === buildId && typeof params.integrationId === "string" && SAFE_ID.test(params.integrationId) &&
    typeof params.bindingId === "string" && SAFE_ID.test(params.bindingId) &&
    Number.isSafeInteger(params.expectedIntegrationRevision) && params.expectedIntegrationRevision >= 0 &&
    Number.isSafeInteger(params.expectedEnvironmentRevision) && params.expectedEnvironmentRevision >= 0;
}

function getAdapter(registry, providerKey) {
  const adapter = registry instanceof Map ? registry.get(providerKey) : registry?.[providerKey];
  if (!adapter || !exactKeys(adapter, ["providerKey", "adapterVersion", "verify"]) ||
      adapter.providerKey !== providerKey || typeof adapter.adapterVersion !== "string" ||
      !SAFE_ID.test(adapter.adapterVersion) || typeof adapter.verify !== "function") return null;
  return adapter;
}

function canonical(state, failureCode, adapterVersion = null, providerAccountRef = null, capabilities = []) {
  return { state, adapterVersion, providerAccountRef, capabilities, verifiedAt: timestamp(), failureCode };
}

function adapterResult(value) {
  if (!plain(value)) return { kind: "unsafe" };
  if (value.ok === true && exactKeys(value, ["ok", "providerAccountRef", "capabilities"]) &&
      typeof value.providerAccountRef === "string" && SAFE_ID.test(value.providerAccountRef) &&
      Array.isArray(value.capabilities) && value.capabilities.length <= 64 &&
      value.capabilities.every((item) => typeof item === "string" && SAFE_ID.test(item)) &&
      new Set(value.capabilities).size === value.capabilities.length) {
    return { kind: "ready", providerAccountRef: value.providerAccountRef, capabilities: [...value.capabilities] };
  }
  if (value.ok === false && exactKeys(value, ["ok", "code"]) && FAILURE_CODES.has(value.code))
    return { kind: "failure", code: value.code };
  return { kind: "unsafe" };
}

function failureVerification(code, adapterVersion) {
  if (code === "PROVIDER_CREDENTIAL_REJECTED") return canonical("action_required", code, adapterVersion);
  if (code === "PROVIDER_RESPONSE_UNSAFE") return canonical("unavailable", code, adapterVersion);
  return canonical("unavailable", "PROVIDER_UNAVAILABLE", adapterVersion);
}

function localFailure(code) {
  if (LOCAL_UNAVAILABLE.has(code)) return canonical("unavailable", "CREDENTIAL_SOURCE_UNAVAILABLE");
  if (LOCAL_MISSING.has(code)) return canonical("action_required", "CREDENTIAL_MISSING");
  if (LOCAL_UNSAFE.has(code)) return canonical("action_required", "CREDENTIAL_SOURCE_UNSAFE");
  return canonical("unavailable", "CREDENTIAL_SOURCE_UNAVAILABLE");
}

function buildSnapshot(runtimeRoot, buildId, params, registry) {
  const integrations = listBuildIntegrations(runtimeRoot, buildId);
  if (!integrations.ok) return integrations;
  if (integrations.revision !== params.expectedIntegrationRevision) return fail("INTEGRATION_REVISION_STALE");
  const integration = integrations.items.find((item) => item.integrationId === params.integrationId);
  if (!integration) return fail("INTEGRATION_NOT_FOUND");
  const binding = integration.bindings.find((item) => item.bindingId === params.bindingId);
  if (!binding) return fail("INTEGRATION_BINDING_NOT_FOUND");
  const environment = readBuildEnvironment(runtimeRoot, buildId, binding.environmentId);
  if (!environment.ok) return fail("INTEGRATION_ENVIRONMENT_STALE");
  if (environment.revision !== params.expectedEnvironmentRevision) return fail("INTEGRATION_ENVIRONMENT_STALE");
  const catalog = listBuildIntegrationCatalog().find((item) => item.providerKey === integration.providerKey);
  if (!catalog) return fail("INTEGRATION_PROVIDER_UNSUPPORTED");
  const roles = new Set(binding.credentials.map((credential) => credential.role));
  const missingRequired = catalog.credentialRoles.some((role) => role.required && !roles.has(role.role));
  const credentials = [];
  for (const credential of binding.credentials) {
    const p9 = readBuildSecretBinding(runtimeRoot, buildId, binding.environmentId, credential.secretRef);
    if (!p9.ok || p9.binding.kind !== "secret") return fail("INTEGRATION_ENVIRONMENT_STALE");
    credentials.push({ role: credential.role, secretRef: credential.secretRef,
      variableName: p9.binding.variableName, backend: p9.binding.backend,
      presenceState: p9.binding.presenceState, safetyState: p9.binding.safetyState ?? null,
      bindingState: p9.binding.bindingState });
  }
  const adapter = getAdapter(registry, integration.providerKey);
  const snapshot = Object.freeze({ buildId, integrationId: integration.integrationId, bindingId: binding.bindingId,
    providerKey: integration.providerKey, integrationRevision: integrations.revision,
    environmentId: binding.environmentId, environmentRevision: environment.revision,
    credentials: Object.freeze(credentials.map((item) => Object.freeze(item))),
    adapterVersion: adapter?.adapterVersion ?? null });
  const projectRoot = readBuildRecord(runtimeRoot, buildId)?.projectBindings?.[0]?.projectRoot;
  if (typeof projectRoot !== "string" || !projectRoot) return fail("BUILD_NOT_BOUND");
  if (missingRequired) return { ok: true, snapshot, projectRoot,
    verification: canonical("action_required", "CREDENTIAL_REQUIRED") };
  if (credentials.some((item) => item.backend === "vercel_env")) return { ok: true, snapshot, projectRoot,
    verification: canonical("unavailable", "CREDENTIAL_MATERIAL_UNAVAILABLE") };
  if (credentials.some((item) => item.backend !== "local_env_file")) return fail("INTEGRATION_ENVIRONMENT_STALE");
  if (credentials.some((item) => item.bindingState !== "configured" || item.presenceState !== "verified_present" ||
      item.safetyState !== "verified_safe")) return { ok: true, snapshot, projectRoot,
    verification: canonical("action_required", "CREDENTIAL_NOT_READY") };
  if (!adapter) return { ok: true, snapshot, projectRoot,
    verification: canonical("unavailable", "INTEGRATION_ADAPTER_UNAVAILABLE") };
  const exactNames = Object.freeze(credentials.map((item) => item.variableName));
  return { ok: true, snapshot, projectRoot, adapter,
    exactNames,
    allowedNativeNames: Object.freeze(verifiedSafeLocalSecretNames(environment.environment.variables)) };
}

function resolveValues(projectRoot, exactNames, allowedNativeNames) {
  try { return resolveExactLocalEnvValues({ projectRoot, exactNames, allowedNativeNames }); }
  catch { return fail("LOCAL_ENV_GIT_UNAVAILABLE"); }
}

/** Run after releasing the Build mutation gate. Secret values stay in this stack frame. */
export async function executeIntegrationVerification(snapshotInput) {
  const { snapshot, projectRoot, adapter, exactNames, allowedNativeNames } = snapshotInput;
  const first = resolveValues(projectRoot, exactNames, allowedNativeNames);
  if (!first.ok) return { ok: true, verification: localFailure(first.code) };
  const credentialValues = Object.create(null);
  for (const item of snapshot.credentials) credentialValues[item.role] = first.values[item.variableName];
  let reduced;
  try {
    const result = await adapter.verify(Object.freeze({ credentials: Object.freeze({ ...credentialValues }) }));
    reduced = adapterResult(result);
  } catch {
    reduced = { kind: "failure", code: "PROVIDER_UNAVAILABLE" };
  }
  const second = resolveValues(projectRoot, exactNames, allowedNativeNames);
  if (!second.ok || snapshot.credentials.some((item) => second.values[item.variableName] !== first.values[item.variableName]))
    return fail("INTEGRATION_CREDENTIAL_CHANGED");
  if (reduced.kind === "ready") return { ok: true, verification: canonical("ready", null,
    adapter.adapterVersion, reduced.providerAccountRef, reduced.capabilities) };
  if (reduced.kind === "unsafe") return { ok: true,
    verification: canonical("unavailable", "PROVIDER_RESPONSE_UNSAFE", adapter.adapterVersion) };
  return { ok: true, verification: failureVerification(reduced.code, adapter.adapterVersion) };
}

export function createIntegrationVerificationSnapshot(runtimeRoot, buildId, params, registry) {
  return buildSnapshot(runtimeRoot, buildId, params, registry);
}
