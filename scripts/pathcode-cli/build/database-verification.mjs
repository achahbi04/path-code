/** P13.2 bounded credential and observation bridge. */
import { listBuildDatabases } from "./databases.mjs";
import { readBuildEnvironment, readBuildSecretBinding } from "./environments.mjs";
import { readBuildRecord } from "./record.mjs";
import { resolveExactLocalEnvValues } from "./runtime/local-env-resolve.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const PROVIDER_FAILURES = new Set(["DATABASE_PROVIDER_CREDENTIAL_REJECTED", "DATABASE_PROVIDER_PERMISSION_REQUIRED",
  "DATABASE_PROVIDER_PROJECT_NOT_FOUND", "DATABASE_PROVIDER_UNAVAILABLE", "DATABASE_PROVIDER_RESPONSE_UNSAFE"]);
const CONNECTION_FAILURES = new Set(["DATABASE_URL_UNSAFE", "DATABASE_URL_PROJECT_MISMATCH", "DATABASE_CREDENTIAL_REJECTED",
  "DATABASE_RESPONSE_UNSAFE", "DATABASE_CONNECTION_UNAVAILABLE"]);
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const fail = (code) => ({ ok: false, code });
const now = () => new Date().toISOString();

export function validDatabaseVerificationRequest(params, buildId) {
  return exact(params, ["buildId", "databaseId", "expectedDatabaseRevision", "expectedEnvironmentRevision"]) &&
    params.buildId === buildId && typeof params.databaseId === "string" && ID.test(params.databaseId) &&
    Number.isSafeInteger(params.expectedDatabaseRevision) && params.expectedDatabaseRevision >= 0 &&
    Number.isSafeInteger(params.expectedEnvironmentRevision) && params.expectedEnvironmentRevision >= 0;
}

function getAdapter(registry, provider, plane) {
  const entry = registry instanceof Map ? registry.get(provider) : registry?.[provider];
  const candidate = entry?.[plane];
  if (!candidate || !plain(candidate) || candidate.provider !== provider || typeof candidate.adapterVersion !== "string" ||
      !ID.test(candidate.adapterVersion) || typeof candidate.verify !== "function") return null;
  return candidate;
}

function resolvedFailure(code, plane, adapterVersion = null) {
  const state = code === "DATABASE_CREDENTIAL_REQUIRED" || code === "DATABASE_CREDENTIAL_NOT_READY" ||
    code === "DATABASE_CREDENTIAL_MISSING" || code === "DATABASE_CREDENTIAL_SOURCE_UNSAFE"
    ? "action_required" : "unavailable";
  return plane === "provider"
    ? { state, projectStatus: null, failureCode: code, organizationSlug: null, region: null }
    : { state, adapterVersion, serverVersion: null, failureCode: code };
}

function snapshot(runtimeRoot, buildId, params, plane, registry) {
  if (!validDatabaseVerificationRequest(params, buildId)) return fail("DATABASE_VERIFICATION_INVALID");
  const record = readBuildRecord(runtimeRoot, buildId);
  if (!record || record.buildId !== buildId) return fail("BUILD_NOT_FOUND");
  if (record.pendingRestore) return fail("RESTORE_PENDING");
  const authority = listBuildDatabases(runtimeRoot, buildId);
  if (!authority.ok) return authority;
  if (authority.revision !== params.expectedDatabaseRevision) return fail("DATABASE_REVISION_STALE");
  const database = authority.items.find((item) => item.databaseId === params.databaseId);
  if (!database) return fail("DATABASE_NOT_FOUND");
  if (database.provider !== "supabase" || database.engine !== "postgres") return fail("DATABASE_PROVIDER_UNSUPPORTED");
  const environment = readBuildEnvironment(runtimeRoot, buildId, database.environmentId);
  if (!environment.ok || environment.revision !== params.expectedEnvironmentRevision) return fail("DATABASE_ENVIRONMENT_STALE");
  const base = { buildId, plane, databaseId: database.databaseId, databaseRevision: authority.revision,
    provider: database.provider, engine: database.engine, environmentId: database.environmentId,
    environmentRevision: environment.revision,
    projectRef: database.providerTarget.projectRef, organizationSlug: database.providerTarget.organizationSlug,
    region: database.providerTarget.region, managementSecretRef: database.credentials.managementSecretRef,
    databaseUrlSecretRef: database.credentials.databaseUrlSecretRef };
  const field = plane === "provider" ? "managementSecretRef" : "databaseUrlSecretRef";
  const adapter = getAdapter(registry, database.provider, plane);
  const empty = (state, failureCode) => ({ ok: true, snapshot: Object.freeze(base), adapter: null,
    immediateObservation: plane === "provider"
      ? { state, projectStatus: null, failureCode, organizationSlug: null, region: null }
      : { state, adapterVersion: null, serverVersion: null, failureCode } });
  if (database.providerTarget.projectRef === null) return empty("action_required", "DATABASE_PROJECT_REF_REQUIRED");
  if (database.credentials[field] === null) return empty("action_required", "DATABASE_CREDENTIAL_REQUIRED");
  if (!adapter) return empty("unavailable", plane === "provider" ? "DATABASE_PROVIDER_ADAPTER_UNAVAILABLE" : "DATABASE_CONNECTION_ADAPTER_UNAVAILABLE");
  const p9 = readBuildSecretBinding(runtimeRoot, buildId, database.environmentId, database.credentials[field]);
  if (!p9.ok || p9.binding.kind !== "secret") return fail("DATABASE_ENVIRONMENT_STALE");
  const binding = p9.binding;
  const full = Object.freeze({ ...base, environmentRevision: environment.revision, [field]: binding.secretRef,
    variableName: binding.variableName, backend: binding.backend, bindingState: binding.bindingState,
    presenceState: binding.presenceState, safetyState: binding.safetyState ?? null,
    adapterVersion: adapter.adapterVersion });
  const withImmediate = (state, failureCode) => ({ ok: true, snapshot: full, adapter,
    immediateObservation: plane === "provider"
      ? { state, projectStatus: null, failureCode, organizationSlug: null, region: null }
      : { state, adapterVersion: adapter.adapterVersion, serverVersion: null, failureCode } });
  if (binding.backend === "vercel_env") return withImmediate("unavailable", "DATABASE_CREDENTIAL_MATERIAL_UNAVAILABLE");
  if (binding.backend !== "local_env_file") return fail("DATABASE_ENVIRONMENT_STALE");
  if (binding.presenceState === "verified_missing") return withImmediate("action_required", "DATABASE_CREDENTIAL_MISSING");
  if (binding.bindingState !== "configured" || binding.presenceState !== "verified_present")
    return withImmediate("action_required", "DATABASE_CREDENTIAL_NOT_READY");
  if (binding.safetyState !== "verified_safe") return withImmediate("action_required", "DATABASE_CREDENTIAL_SOURCE_UNSAFE");
  const projectRoot = record.projectBindings?.[0]?.projectRoot;
  if (typeof projectRoot !== "string" || !projectRoot) return fail("BUILD_NOT_BOUND");
  return { ok: true, snapshot: full, adapter, projectRoot,
    exactNames: Object.freeze([binding.variableName]), allowedNativeNames: Object.freeze([binding.variableName]) };
}

export function createBuildDatabaseVerificationSnapshot(runtimeRoot, buildId, params, plane, registry) {
  return snapshot(runtimeRoot, buildId, params, plane, registry);
}

function mapResolverFailure(code) {
  if (code === "LOCAL_SECRET_MISSING") return "DATABASE_CREDENTIAL_MISSING";
  if (["LOCAL_ENV_GIT_UNAVAILABLE"].includes(code)) return "DATABASE_CREDENTIAL_SOURCE_UNAVAILABLE";
  return "DATABASE_CREDENTIAL_SOURCE_UNSAFE";
}

function reduceOutcome(plane, value, adapterVersion) {
  if (!plain(value)) return plane === "provider"
    ? { state: "unavailable", projectStatus: null, failureCode: "DATABASE_PROVIDER_RESPONSE_UNSAFE", organizationSlug: null, region: null }
    : { state: "unavailable", adapterVersion, serverVersion: null, failureCode: "DATABASE_RESPONSE_UNSAFE" };
  const allowedFailure = plane === "provider" ? PROVIDER_FAILURES : CONNECTION_FAILURES;
  const actionFailures = plane === "provider"
    ? new Set(["DATABASE_PROVIDER_CREDENTIAL_REJECTED", "DATABASE_PROVIDER_PERMISSION_REQUIRED", "DATABASE_PROVIDER_PROJECT_NOT_FOUND"])
    : new Set(["DATABASE_URL_UNSAFE", "DATABASE_URL_PROJECT_MISMATCH", "DATABASE_CREDENTIAL_REJECTED"]);
  if (value.ok === false && exact(value, ["ok", "state", "code"]) && allowedFailure.has(value.code) &&
      value.state === (actionFailures.has(value.code) ? "action_required" : "unavailable"))
    return plane === "provider"
      ? { state: value.state, projectStatus: null, failureCode: value.code, organizationSlug: null, region: null }
      : { state: value.state, adapterVersion, serverVersion: null, failureCode: value.code };
  if (plane === "provider" && exact(value, ["ok", "projectRef", "organizationSlug", "region", "projectStatus"]) &&
      value.ok === true && typeof value.projectRef === "string" && ID.test(value.projectRef) &&
      (value.organizationSlug === null || typeof value.organizationSlug === "string" && ID.test(value.organizationSlug)) &&
      (value.region === null || typeof value.region === "string" && ID.test(value.region)) &&
      (value.projectStatus === null || typeof value.projectStatus === "string" && value.projectStatus.length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/.test(value.projectStatus)))
    return { state: "ready", projectStatus: value.projectStatus, failureCode: null,
      organizationSlug: value.organizationSlug, region: value.region, projectRef: value.projectRef };
  if (plane === "connection" && exact(value, ["ok", "serverVersion"]) && value.ok === true &&
      typeof value.serverVersion === "string" && value.serverVersion.length > 0 && value.serverVersion.length <= 120 &&
      !/[\u0000-\u001f\u007f-\u009f]/.test(value.serverVersion))
    return { state: "ready", adapterVersion, serverVersion: value.serverVersion, failureCode: null };
  return plane === "provider"
    ? { state: "unavailable", projectStatus: null, failureCode: "DATABASE_PROVIDER_RESPONSE_UNSAFE", organizationSlug: null, region: null }
    : { state: "unavailable", adapterVersion, serverVersion: null, failureCode: "DATABASE_RESPONSE_UNSAFE" };
}

export function executeBuildDatabaseVerification(input) {
  if (input.immediateObservation) return { ok: true, observation: input.immediateObservation };
  const { snapshot: frozen, adapter, projectRoot, exactNames, allowedNativeNames } = input;
  let first;
  try { first = resolveExactLocalEnvValues({ projectRoot, exactNames, allowedNativeNames }); }
  catch { return { ok: true, observation: resolvedFailure("DATABASE_CREDENTIAL_SOURCE_UNAVAILABLE", frozen.plane, adapter.adapterVersion) }; }
  if (!first.ok) return { ok: true, observation: resolvedFailure(mapResolverFailure(first.code), frozen.plane, adapter.adapterVersion) };
  const value = first.values[frozen.variableName];
  const args = frozen.plane === "provider"
    ? Object.freeze({ credential: value, projectRef: frozen.projectRef })
    : Object.freeze({ databaseUrl: value, projectRef: frozen.projectRef });
  return Promise.resolve().then(() => adapter.verify(args)).catch(() => null).then((result) => {
    const reduced = reduceOutcome(frozen.plane, result, adapter.adapterVersion);
    let second;
    try { second = resolveExactLocalEnvValues({ projectRoot, exactNames, allowedNativeNames }); }
    catch { return fail("DATABASE_CREDENTIAL_CHANGED"); }
    if (!second.ok || second.values[frozen.variableName] !== value) return fail("DATABASE_CREDENTIAL_CHANGED");
    if (reduced.state === "ready" && frozen.plane === "provider" && reduced.projectRef !== frozen.projectRef)
      return { ok: true, observation: { state: "unavailable", projectStatus: null,
        failureCode: "DATABASE_PROVIDER_RESPONSE_UNSAFE", organizationSlug: null, region: null } };
    if (reduced.state === "ready" && frozen.plane === "provider" &&
        ((frozen.organizationSlug !== null && reduced.organizationSlug !== frozen.organizationSlug) ||
         (frozen.region !== null && reduced.region !== frozen.region)))
      return { ok: true, observation: { state: "action_required", projectStatus: null,
        failureCode: "DATABASE_PROVIDER_TARGET_MISMATCH", organizationSlug: null, region: null } };
    const { projectRef: _projectRef, ...observation } = reduced;
    return { ok: true, observation };
  });
}
