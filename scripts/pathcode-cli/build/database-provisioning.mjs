import { listBuildDatabases } from "./databases.mjs";
import { readBuildEnvironment, readBuildSecretBinding } from "./environments.mjs";
import { readBuildRecord } from "./record.mjs";
import { resolveExactLocalEnvValues } from "./runtime/local-env-resolve.mjs";
import { inventoryCommittedDatabaseMigrations, compareDatabaseMigrationVersions } from "./database-migrations.mjs";

const fail = (code) => ({ ok: false, code });
const plain = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v, keys) => plain(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const id = (v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v);
const safe = (v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(v);

function bindings(runtimeRoot, buildId, database, refs, expectedEnvironmentRevision) {
  const environment = readBuildEnvironment(runtimeRoot, buildId, database.environmentId);
  if (!environment.ok || environment.revision !== expectedEnvironmentRevision) return fail("DATABASE_ENVIRONMENT_STALE");
  const items = [];
  for (const secretRef of refs) {
    const result = readBuildSecretBinding(runtimeRoot, buildId, database.environmentId, secretRef);
    if (!result.ok || result.binding.kind !== "secret") return fail("DATABASE_ENVIRONMENT_STALE");
    const b = result.binding;
    if (b.backend === "vercel_env") return fail("DATABASE_CREDENTIAL_MATERIAL_UNAVAILABLE");
    if (b.backend !== "local_env_file") return fail("DATABASE_CREDENTIAL_SOURCE_UNSAFE");
    if (b.bindingState !== "configured" || b.presenceState !== "verified_present" || b.safetyState !== "verified_safe")
      return fail("DATABASE_CREDENTIAL_NOT_READY");
    items.push({ secretRef, variableName: b.variableName, backend: b.backend, bindingState: b.bindingState,
      presenceState: b.presenceState, safetyState: b.safetyState });
  }
  return { ok: true, environment, items };
}
function projectRoot(record) { const root = record.projectBindings?.[0]?.projectRoot; return typeof root === "string" ? root : null; }

export function createDatabaseProvisionSnapshot(runtimeRoot, buildId, params, adapterRegistry) {
  if (!exact(params, ["buildId", "databaseId", "organizationSlug", "expectedDatabaseRevision", "expectedEnvironmentRevision"]) ||
      params.buildId !== buildId || !id(params.databaseId) || !safe(params.organizationSlug) ||
      !Number.isSafeInteger(params.expectedDatabaseRevision) || !Number.isSafeInteger(params.expectedEnvironmentRevision))
    return fail("DATABASE_PROVISION_REQUEST_INVALID");
  const record = readBuildRecord(runtimeRoot, buildId); if (!record || record.pendingRestore) return fail(record?.pendingRestore ? "RESTORE_PENDING" : "BUILD_NOT_FOUND");
  const authority = listBuildDatabases(runtimeRoot, buildId); if (!authority.ok) return authority;
  if (authority.revision !== params.expectedDatabaseRevision) return fail("DATABASE_REVISION_STALE");
  const database = authority.items.find((item) => item.databaseId === params.databaseId);
  if (!database || database.provider !== "supabase" || database.source !== "path_provisioned") return fail("DATABASE_PROVISION_PRECONDITION_FAILED");
  if (!database.credentials.managementSecretRef) return fail("DATABASE_CREDENTIAL_REQUIRED");
  const adapter = adapterRegistry?.supabase;
  if (!adapter?.availableRegions) return { ok: true, snapshot: { immediate: true, databaseId: database.databaseId,
    databaseRevision: authority.revision, environmentId: database.environmentId, expectedEnvironmentRevision: params.expectedEnvironmentRevision },
    adapter: null, result: fail("DATABASE_PROVIDER_ADAPTER_UNAVAILABLE") };
  const p9 = bindings(runtimeRoot, buildId, database, [database.credentials.managementSecretRef], params.expectedEnvironmentRevision);
  if (!p9.ok) return p9;
  const root = projectRoot(record); if (!root) return fail("BUILD_NOT_BOUND");
  // The resolver validates every parsed .env.local name against this set, but
  // exactNames below remains the only material this operation may consume.
  // Allow only local secret bindings from this same, revision-checked P9
  // environment that have already passed the existing presence/safety checks.
  const allowedNativeNames = p9.environment.environment.variables
    .filter((binding) => binding.kind === "secret" && binding.backend === "local_env_file" &&
      binding.bindingState === "configured" && binding.presenceState === "verified_present" &&
      binding.safetyState === "verified_safe")
    .map((binding) => binding.variableName);
  return { ok: true, snapshot: Object.freeze({ buildId, databaseId: database.databaseId, databaseRevision: authority.revision,
    environmentId: database.environmentId, environmentRevision: p9.environment.revision, organizationSlug: params.organizationSlug,
    managementSecretRef: database.credentials.managementSecretRef, binding: Object.freeze(p9.items[0]), projectRoot: root }),
    adapter, exactNames: Object.freeze([p9.items[0].variableName]), allowedNativeNames: Object.freeze(allowedNativeNames) };
}

export async function executeDatabaseRegionDiscovery(input) {
  if (input.result) return { ok: true, regions: [], code: input.result.code };
  const { snapshot, adapter, exactNames, allowedNativeNames } = input;
  let first;
  try { first = resolveExactLocalEnvValues({ projectRoot: snapshot.projectRoot, exactNames, allowedNativeNames }); }
  catch { return fail("DATABASE_CREDENTIAL_SOURCE_UNAVAILABLE"); }
  if (!first.ok) return fail(first.code === "LOCAL_SECRET_MISSING" ? "DATABASE_CREDENTIAL_MISSING" : "DATABASE_CREDENTIAL_SOURCE_UNSAFE");
  const value = first.values[snapshot.binding.variableName];
  let result; try { result = await adapter.availableRegions({ credential: value, organizationSlug: snapshot.organizationSlug }); }
  catch { result = null; }
  let after; try { after = resolveExactLocalEnvValues({ projectRoot: snapshot.projectRoot, exactNames, allowedNativeNames }); }
  catch { return fail("DATABASE_CREDENTIAL_CHANGED"); }
  if (!after.ok || after.values[snapshot.binding.variableName] !== value) return fail("DATABASE_CREDENTIAL_CHANGED");
  return plain(result) && result.ok === true && Array.isArray(result.regions) ? { ok: true, regions: result.regions } :
    fail(plain(result) && typeof result.code === "string" ? result.code : "DATABASE_PROVIDER_RESPONSE_UNSAFE");
}

export function createDatabaseProvisionExecuteSnapshot(runtimeRoot, buildId, params, adapterRegistry) {
  if (!exact(params, ["buildId", "operationId", "expectedDatabaseRevision", "expectedEnvironmentRevision"]) ||
      params.buildId !== buildId || !id(params.operationId) || !Number.isSafeInteger(params.expectedDatabaseRevision) ||
      !Number.isSafeInteger(params.expectedEnvironmentRevision)) return fail("DATABASE_PROVISION_REQUEST_INVALID");
  const record = readBuildRecord(runtimeRoot, buildId); if (!record || record.pendingRestore) return fail(record?.pendingRestore ? "RESTORE_PENDING" : "BUILD_NOT_FOUND");
  const authority = listBuildDatabases(runtimeRoot, buildId); if (!authority.ok) return authority;
  const operation = authority.pendingOperation;
  if (authority.revision !== params.expectedDatabaseRevision || !operation || operation.operationId !== params.operationId ||
      operation.state !== "prepared" || operation.expectedDatabaseRevision !== authority.revision) return fail("DATABASE_AUTHORITY_STALE");
  const database = authority.items.find((item) => item.databaseId === operation.databaseId);
  if (!database) return fail("DATABASE_AUTHORITY_STALE");
  const p9 = bindings(runtimeRoot, buildId, database, [operation.managementSecretRef, operation.provisionPasswordSecretRef], params.expectedEnvironmentRevision);
  if (!p9.ok) return p9;
  const adapter = adapterRegistry?.supabase;
  if (!adapter?.createProject) return fail("DATABASE_PROVIDER_ADAPTER_UNAVAILABLE");
  const root = projectRoot(record); if (!root) return fail("BUILD_NOT_BOUND");
  return { ok: true, snapshot: Object.freeze({ buildId, operation: Object.freeze({ ...operation }), databaseRevision: authority.revision,
    environmentRevision: p9.environment.revision, bindings: Object.freeze(p9.items), projectRoot: root }), adapter,
    exactNames: Object.freeze(p9.items.map((v) => v.variableName)), allowedNativeNames: Object.freeze(p9.items.map((v) => v.variableName)) };
}

export function resolveDatabaseProvisionCredentials(input) {
  const { snapshot, exactNames, allowedNativeNames } = input;
  let first; try { first = resolveExactLocalEnvValues({ projectRoot: snapshot.projectRoot, exactNames, allowedNativeNames }); }
  catch { return fail("DATABASE_CREDENTIAL_SOURCE_UNAVAILABLE"); }
  if (!first.ok) return fail(first.code === "LOCAL_SECRET_MISSING" ? "DATABASE_CREDENTIAL_MISSING" : "DATABASE_CREDENTIAL_SOURCE_UNSAFE");
  return { ok: true, values: snapshot.bindings.map((binding) => first.values[binding.variableName]) };
}

export function executeDatabaseProvision(input, values) {
  const { snapshot, exactNames, allowedNativeNames } = input;
  return Promise.resolve().then(() => input.adapter.createProject({ credential: values[0], dbPassword: values[1],
    name: snapshot.operation.providerProjectName, organizationSlug: snapshot.operation.organizationSlug, region: snapshot.operation.region }))
    .catch(() => ({ ok: false, state: "uncertain", code: "DATABASE_PROVIDER_UNAVAILABLE" })).then((result) => {
      let second; try { second = resolveExactLocalEnvValues({ projectRoot: snapshot.projectRoot, exactNames, allowedNativeNames }); }
      catch { return fail("DATABASE_CREDENTIAL_CHANGED"); }
      if (!second.ok || snapshot.bindings.some((b, index) => second.values[b.variableName] !== values[index])) return fail("DATABASE_CREDENTIAL_CHANGED");
      return { ok: true, result };
    });
}

export function createDatabaseProvisionObserveSnapshot(runtimeRoot, buildId, params, adapterRegistry) {
  if (!exact(params, ["buildId", "operationId", "expectedDatabaseRevision", "expectedEnvironmentRevision"]) ||
      params.buildId !== buildId || !id(params.operationId) || !Number.isSafeInteger(params.expectedDatabaseRevision) ||
      !Number.isSafeInteger(params.expectedEnvironmentRevision)) return fail("DATABASE_PROVISION_REQUEST_INVALID");
  const record = readBuildRecord(runtimeRoot, buildId); if (!record || record.pendingRestore) return fail(record?.pendingRestore ? "RESTORE_PENDING" : "BUILD_NOT_FOUND");
  const authority = listBuildDatabases(runtimeRoot, buildId); if (!authority.ok) return authority;
  const op = authority.pendingOperation;
  if (authority.revision !== params.expectedDatabaseRevision || !op || op.operationId !== params.operationId ||
      !["effect_started", "uncertain", "observed"].includes(op.state)) return fail("DATABASE_AUTHORITY_STALE");
  const database = authority.items.find((item) => item.databaseId === op.databaseId);
  if (!database || !database.credentials.managementSecretRef) return fail("DATABASE_AUTHORITY_STALE");
  const p9 = bindings(runtimeRoot, buildId, database, [op.managementSecretRef], params.expectedEnvironmentRevision);
  if (!p9.ok) return p9;
  const operationCredential = readBuildSecretBinding(runtimeRoot, buildId, database.environmentId, op.provisionPasswordSecretRef);
  const allowedNames = [p9.items[0].variableName];
  if (operationCredential.ok && operationCredential.binding.kind === "secret" &&
      !allowedNames.includes(operationCredential.binding.variableName)) allowedNames.push(operationCredential.binding.variableName);
  const adapter = adapterRegistry?.supabase;
  if (!adapter?.health || !adapter?.listProjects) return fail("DATABASE_PROVIDER_ADAPTER_UNAVAILABLE");
  const root = projectRoot(record); if (!root) return fail("BUILD_NOT_BOUND");
  return { ok: true, snapshot: Object.freeze({ buildId, operation: Object.freeze({ ...op }), databaseId: database.databaseId,
    databaseRevision: authority.revision, environmentId: database.environmentId, environmentRevision: p9.environment.revision,
    projectRef: database.providerTarget.projectRef, binding: Object.freeze(p9.items[0]), projectRoot: root }), adapter,
    exactNames: Object.freeze([p9.items[0].variableName]), allowedNativeNames: Object.freeze(allowedNames) };
}

export async function executeDatabaseProvisionObservation(input) {
  const { snapshot, adapter, exactNames, allowedNativeNames } = input;
  let first; try { first = resolveExactLocalEnvValues({ projectRoot: snapshot.projectRoot, exactNames, allowedNativeNames }); }
  catch { return fail("DATABASE_CREDENTIAL_SOURCE_UNAVAILABLE"); }
  if (!first.ok) return fail(first.code === "LOCAL_SECRET_MISSING" ? "DATABASE_CREDENTIAL_MISSING" : "DATABASE_CREDENTIAL_SOURCE_UNSAFE");
  const credential = first.values[snapshot.binding.variableName];
  let result;
  try {
    let projectRef = snapshot.projectRef;
    if (!projectRef) {
      const listed = await adapter.listProjects({ credential, organizationSlug: snapshot.operation.organizationSlug,
        projectName: snapshot.operation.providerProjectName });
      if (!listed?.ok || !Array.isArray(listed.matches)) result = listed;
      else if (listed.matches.length > 1) result = { ok: false, state: "safe_stop", code: "DATABASE_PROVISION_AMBIGUOUS" };
      else if (!listed.matches.length || listed.truncated) result = { ok: false, state: "uncertain", code: "DATABASE_PROVISION_NOT_OBSERVED" };
      else {
        const match = listed.matches[0];
        if (match.organizationSlug !== snapshot.operation.organizationSlug || match.projectName !== snapshot.operation.providerProjectName ||
            match.region !== snapshot.operation.region) result = { ok: false, state: "safe_stop", code: "DATABASE_PROVIDER_TARGET_MISMATCH" };
        else projectRef = match.projectRef;
      }
    }
    if (projectRef) {
      const health = await adapter.health({ credential, projectRef });
      result = health?.ok ? { ok: true, projectRef, projectName: snapshot.operation.providerProjectName,
        organizationSlug: snapshot.operation.organizationSlug, region: snapshot.operation.region, projectStatus: health.projectStatus } :
        { ...health, projectRef, projectName: snapshot.operation.providerProjectName,
          organizationSlug: snapshot.operation.organizationSlug, region: snapshot.operation.region, projectStatus: null };
    }
  } catch { result = { ok: false, state: "unavailable", code: "DATABASE_PROVIDER_UNAVAILABLE" }; }
  let after; try { after = resolveExactLocalEnvValues({ projectRoot: snapshot.projectRoot, exactNames, allowedNativeNames }); }
  catch { return fail("DATABASE_CREDENTIAL_CHANGED"); }
  if (!after.ok || after.values[snapshot.binding.variableName] !== credential) return fail("DATABASE_CREDENTIAL_CHANGED");
  return { ok: true, result };
}

export function createDatabaseMigrationSnapshot(runtimeRoot, buildId, params) {
  if (!exact(params, ["buildId", "databaseId", "expectedDatabaseRevision", "expectedEnvironmentRevision", "expectedAuthoritativeSha"]) ||
      params.buildId !== buildId || !id(params.databaseId) || !/^[0-9a-f]{40}$/i.test(params.expectedAuthoritativeSha))
    return fail("DATABASE_MIGRATION_REQUEST_INVALID");
  const record = readBuildRecord(runtimeRoot, buildId); if (!record || record.pendingRestore) return fail(record?.pendingRestore ? "RESTORE_PENDING" : "BUILD_NOT_FOUND");
  if (record.authoritativeSha !== params.expectedAuthoritativeSha) return fail("DATABASE_MIGRATION_SOURCE_STALE");
  const authority = listBuildDatabases(runtimeRoot, buildId); if (!authority.ok) return authority;
  if (authority.revision !== params.expectedDatabaseRevision) return fail("DATABASE_REVISION_STALE");
  const database = authority.items.find((item) => item.databaseId === params.databaseId);
  if (!database || database.provider !== "supabase" || database.engine !== "postgres" || !database.providerTarget.projectRef ||
      !database.credentials.databaseUrlSecretRef || database.connectionObservation.state !== "ready")
    return fail("DATABASE_MIGRATION_PRECONDITION_FAILED");
  const environment = readBuildEnvironment(runtimeRoot, buildId, database.environmentId);
  if (!environment.ok || environment.revision !== params.expectedEnvironmentRevision) return fail("DATABASE_ENVIRONMENT_STALE");
  const binding = readBuildSecretBinding(runtimeRoot, buildId, database.environmentId, database.credentials.databaseUrlSecretRef);
  if (!binding.ok || binding.binding.kind !== "secret") return fail("DATABASE_ENVIRONMENT_STALE");
  if (binding.binding.backend === "vercel_env") return fail("DATABASE_CREDENTIAL_MATERIAL_UNAVAILABLE");
  if (binding.binding.backend !== "local_env_file" || binding.binding.bindingState !== "configured" ||
      binding.binding.presenceState !== "verified_present" || binding.binding.safetyState !== "verified_safe") return fail("DATABASE_CREDENTIAL_NOT_READY");
  const root = projectRoot(record); if (!root) return fail("BUILD_NOT_BOUND");
  return { ok: true, snapshot: Object.freeze({ buildId, databaseId: database.databaseId, databaseRevision: authority.revision,
    provider: database.provider, engine: database.engine, environmentId: database.environmentId, environmentRevision: environment.revision,
    projectRef: database.providerTarget.projectRef, databaseUrlSecretRef: binding.binding.secretRef,
    variableName: binding.binding.variableName, binding: Object.freeze({ secretRef: binding.binding.secretRef,
      variableName: binding.binding.variableName, backend: binding.binding.backend, bindingState: binding.binding.bindingState,
      presenceState: binding.binding.presenceState, safetyState: binding.binding.safetyState }),
    authoritativeSha: record.authoritativeSha, projectRoot: root }),
    exactNames: Object.freeze([binding.binding.variableName]), allowedNativeNames: Object.freeze([binding.binding.variableName]) };
}

export async function executeDatabaseMigrationObservation(input) {
  const { snapshot, exactNames, allowedNativeNames } = input;
  const local = inventoryCommittedDatabaseMigrations(snapshot.projectRoot, snapshot.authoritativeSha);
  if (!local.ok) return { ok: true, observation: { state: "unavailable", sourceSha: snapshot.authoritativeSha,
    localDigest: null, localCount: 0, localHeadVersion: null, remoteCount: null, remoteHeadVersion: null,
    failureCode: local.code } };
  let first; try { first = resolveExactLocalEnvValues({ projectRoot: snapshot.projectRoot, exactNames, allowedNativeNames }); }
  catch { return fail("DATABASE_CREDENTIAL_SOURCE_UNAVAILABLE"); }
  if (!first.ok) return fail(first.code === "LOCAL_SECRET_MISSING" ? "DATABASE_CREDENTIAL_MISSING" : "DATABASE_CREDENTIAL_SOURCE_UNSAFE");
  const databaseUrl = first.values[snapshot.variableName];
  let remote; try { remote = await input.adapter.observe({ databaseUrl, projectRef: snapshot.projectRef }); } catch { remote = null; }
  let after; try { after = resolveExactLocalEnvValues({ projectRoot: snapshot.projectRoot, exactNames, allowedNativeNames }); }
  catch { return fail("DATABASE_CREDENTIAL_CHANGED"); }
  if (!after.ok || after.values[snapshot.variableName] !== databaseUrl) return fail("DATABASE_CREDENTIAL_CHANGED");
  if (!plain(remote) || remote.ok !== true || !Array.isArray(remote.versions)) return { ok: true, observation: {
    state: "unavailable", sourceSha: local.sourceSha, localDigest: local.localDigest, localCount: local.localCount,
    localHeadVersion: local.localHeadVersion, remoteCount: null, remoteHeadVersion: null,
    failureCode: remote?.code ?? "DATABASE_CONNECTION_UNAVAILABLE" } };
  return { ok: true, observation: { state: compareDatabaseMigrationVersions(local.versions, remote.versions),
    sourceSha: local.sourceSha, localDigest: local.localDigest, localCount: local.localCount,
    localHeadVersion: local.localHeadVersion, remoteCount: remote.versions.length,
    remoteHeadVersion: remote.versions.at(-1) ?? null, failureCode: null } };
}
