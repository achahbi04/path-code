/** P13.1 local database identity and credential-reference authority. */
import { randomUUID } from "node:crypto";
import { readBuildEnvironment, readBuildSecretBinding } from "./environments.mjs";
import { readBuildRecord } from "./record.mjs";

export const DATABASES_SCHEMA = "pathcode.p13.databases.v1";
const PROVIDER = "supabase";
const ENGINE = "postgres";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_TARGET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const FAILURE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SECRET_LIKE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|\bBearer\s+\S+|\b(?:ghp|github_pat)_[A-Za-z0-9_]{10,}|\bsk_(?:live|test)_[A-Za-z0-9]{8,}|^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@/i;
const fail = (code) => ({ ok: false, code });
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => own(value, key));
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const safeText = (value, max = 120) => typeof value === "string" && value.trim() === value && value.length > 0 &&
  value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
const safeCode = (value) => typeof value === "string" && FAILURE.test(value);
const safeId = (value) => typeof value === "string" && SAFE_ID.test(value);
const nullable = (value, validator) => value === null || validator(value);
const nonnegative = (value) => Number.isSafeInteger(value) && value >= 0;
const EMPTY_PROVIDER_OBSERVATION = () => ({ state: "unverified", projectStatus: null, observedAt: null, failureCode: null });
const EMPTY_CONNECTION_OBSERVATION = () => ({ state: "unverified", adapterVersion: null, serverVersion: null, observedAt: null, failureCode: null });
const EMPTY_MIGRATION_OBSERVATION = () => ({ state: "unknown", sourceSha: null, localDigest: null, localCount: 0,
  localHeadVersion: null, remoteCount: null, remoteHeadVersion: null, observedAt: null, failureCode: null });

export function emptyBuildDatabaseAuthority() {
  return { schema: DATABASES_SCHEMA, revision: 0, items: [], pendingOperation: null, operationHistory: [] };
}

export function listBuildDatabaseCatalog() {
  return [{ provider: PROVIDER, displayName: "Supabase", engine: ENGINE, credentialRoles: [
    { role: "management_token", required: false }, { role: "database_url", required: false },
  ] }];
}

function validLabel(value) {
  return typeof value === "string" && value.trim() === value && value.length >= 1 && value.length <= 80 &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(value) && !SECRET_LIKE.test(value);
}
function validTarget(value) { return value === null || typeof value === "string" && SAFE_TARGET.test(value); }
function safeTarget(value) { return typeof value === "string" && SAFE_TARGET.test(value); }
function validMigrationVersion(value) { return value === null || safeText(value, 80) && SAFE_TARGET.test(value); }

function validProviderObservation(value) {
  if (!exact(value, ["state", "projectStatus", "observedAt", "failureCode"]) ||
      !["unverified", "ready", "action_required", "unavailable"].includes(value.state) ||
      !nullable(value.projectStatus, (item) => safeText(item, 80)) ||
      !nullable(value.observedAt, iso) || !nullable(value.failureCode, safeCode)) return false;
  if (value.state === "unverified") return value.observedAt === null && value.failureCode === null && value.projectStatus === null;
  if (value.state === "ready") return value.observedAt !== null && value.failureCode === null;
  return value.observedAt !== null && value.failureCode !== null;
}

function validConnectionObservation(value) {
  if (!exact(value, ["state", "adapterVersion", "serverVersion", "observedAt", "failureCode"]) ||
      !["unverified", "ready", "action_required", "unavailable"].includes(value.state) ||
      !nullable(value.adapterVersion, safeId) ||
      !nullable(value.serverVersion, (item) => safeText(item, 120)) ||
      !nullable(value.observedAt, iso) || !nullable(value.failureCode, safeCode)) return false;
  if (value.state === "unverified") return value.adapterVersion === null && value.serverVersion === null && value.observedAt === null && value.failureCode === null;
  if (value.state === "ready") return value.adapterVersion !== null && value.observedAt !== null && value.failureCode === null;
  return value.observedAt !== null && value.failureCode !== null && value.serverVersion === null;
}

function validMigrationObservation(value) {
  if (!exact(value, ["state", "sourceSha", "localDigest", "localCount", "localHeadVersion", "remoteCount",
    "remoteHeadVersion", "observedAt", "failureCode"]) ||
      !["unknown", "none", "in_sync", "pending", "diverged", "unavailable"].includes(value.state) ||
      !nullable(value.sourceSha, (item) => typeof item === "string" && /^[0-9a-f]{40}$/i.test(item)) ||
      !nullable(value.localDigest, (item) => typeof item === "string" && /^[0-9a-f]{64}$/i.test(item)) ||
      !nonnegative(value.localCount) || !validMigrationVersion(value.localHeadVersion) ||
      !(value.remoteCount === null || nonnegative(value.remoteCount)) || !validMigrationVersion(value.remoteHeadVersion) ||
      !nullable(value.observedAt, iso) || !nullable(value.failureCode, safeCode)) return false;
  if (value.state === "unknown") return value.observedAt === null && value.failureCode === null;
  if (value.state === "unavailable") return value.observedAt !== null && value.failureCode !== null;
  return value.observedAt !== null && value.failureCode === null;
}

const OP_STATES = ["prepared", "effect_started", "uncertain", "observed", "completed", "safe_stop", "failed_no_effect"];
function validProvisionOperation(value) {
  return exact(value, ["operationId", "kind", "databaseId", "provider", "state", "expectedDatabaseRevision", "environmentId",
    "managementSecretRef", "provisionPasswordSecretRef", "organizationSlug", "region", "providerProjectName",
    "createdAt", "updatedAt", "failureCode"]) && UUID.test(value.operationId) && value.kind === "provision" &&
    UUID.test(value.databaseId) && value.provider === PROVIDER && OP_STATES.includes(value.state) &&
    nonnegative(value.expectedDatabaseRevision) && UUID.test(value.environmentId) &&
    safeId(value.managementSecretRef) && safeId(value.provisionPasswordSecretRef) &&
    safeTarget(value.organizationSlug) && safeTarget(value.region) &&
    safeText(value.providerProjectName, 80) && !SECRET_LIKE.test(value.providerProjectName) &&
    iso(value.createdAt) && iso(value.updatedAt) && nullable(value.failureCode, safeCode);
}

function validHistoryEntry(value) {
  return exact(value, ["operationId", "kind", "databaseId", "provider", "providerProjectName", "organizationSlug", "region",
    "state", "providerProjectRef", "createdAt", "completedAt", "failureCode"]) && UUID.test(value.operationId) &&
    value.kind === "provision" && UUID.test(value.databaseId) && value.provider === PROVIDER &&
    safeText(value.providerProjectName, 80) && !SECRET_LIKE.test(value.providerProjectName) &&
    safeTarget(value.organizationSlug) && safeTarget(value.region) && OP_STATES.includes(value.state) &&
    nullable(value.providerProjectRef, safeId) && iso(value.createdAt) &&
    nullable(value.completedAt, iso) && (value.state === "completed" ? value.completedAt !== null : value.completedAt === null) &&
    nullable(value.failureCode, safeCode);
}

function validDatabase(item) {
  return exact(item, ["databaseId", "provider", "engine", "label", "environmentId", "source", "providerTarget", "credentials",
    "providerObservation", "connectionObservation", "migrationObservation", "createdAt", "updatedAt"]) &&
    UUID.test(item.databaseId) && item.provider === PROVIDER && item.engine === ENGINE && validLabel(item.label) &&
    UUID.test(item.environmentId) && ["existing", "path_provisioned"].includes(item.source) &&
    exact(item.providerTarget, ["organizationSlug", "projectRef", "region"]) &&
    validTarget(item.providerTarget.organizationSlug) && validTarget(item.providerTarget.projectRef) && validTarget(item.providerTarget.region) &&
    exact(item.credentials, ["managementSecretRef", "databaseUrlSecretRef"]) &&
    nullable(item.credentials.managementSecretRef, safeId) &&
    nullable(item.credentials.databaseUrlSecretRef, safeId) &&
    validProviderObservation(item.providerObservation) && validConnectionObservation(item.connectionObservation) &&
    validMigrationObservation(item.migrationObservation) && iso(item.createdAt) && iso(item.updatedAt);
}

function validAuthority(value) {
  if (!exact(value, ["schema", "revision", "items", "pendingOperation", "operationHistory"]) ||
      value.schema !== DATABASES_SCHEMA || !nonnegative(value.revision) || !Array.isArray(value.items) ||
      !(value.pendingOperation === null || validProvisionOperation(value.pendingOperation)) || !Array.isArray(value.operationHistory)) return false;
  const databases = new Set(), labels = new Set(), operations = new Set();
  for (const item of value.items) {
    if (!validDatabase(item) || databases.has(item.databaseId) || labels.has(item.label.toLowerCase())) return false;
    databases.add(item.databaseId); labels.add(item.label.toLowerCase());
  }
  if (value.pendingOperation) {
    const database = value.items.find((item) => item.databaseId === value.pendingOperation.databaseId);
    if (operations.has(value.pendingOperation.operationId) || !database || database.source !== "path_provisioned" ||
        database.environmentId !== value.pendingOperation.environmentId) return false;
    operations.add(value.pendingOperation.operationId);
  }
  for (const entry of value.operationHistory) {
    if (!validHistoryEntry(entry) || operations.has(entry.operationId)) return false;
    operations.add(entry.operationId);
  }
  return true;
}

function authorityFor(record) {
  if (!own(record, "databases")) return { ok: true, authority: emptyBuildDatabaseAuthority() };
  return validAuthority(record.databases) ? { ok: true, authority: record.databases } : fail("DATABASES_INVALID");
}

function readAuthority(runtimeRoot, buildId) {
  if (typeof buildId !== "string" || !buildId) return fail("BUILD_NOT_FOUND");
  const record = readBuildRecord(runtimeRoot, buildId);
  if (!record || record.buildId !== buildId) return fail("BUILD_NOT_FOUND");
  const result = authorityFor(record);
  return result.ok ? { ok: true, record, authority: result.authority } : result;
}

export function listBuildDatabases(runtimeRoot, buildId) {
  const found = readAuthority(runtimeRoot, buildId);
  return found.ok ? { ok: true, buildId, ...structuredClone(found.authority) } : found;
}

export function readBuildDatabase(runtimeRoot, buildId, databaseId) {
  const listed = listBuildDatabases(runtimeRoot, buildId);
  if (!listed.ok) return listed;
  const database = listed.items.find((item) => item.databaseId === databaseId);
  return database ? { ok: true, buildId, revision: listed.revision, database: structuredClone(database) } : fail("DATABASE_NOT_FOUND");
}

function inputKeys(action) {
  return ({
    create_database: ["provider", "label", "environmentId", "source"],
    rename_database: ["databaseId", "label"],
    delete_database: ["databaseId", "acknowledgeExternalResourceRetained"],
    set_provider_target: ["databaseId", "organizationSlug", "projectRef", "region"],
    bind_management_credential: ["databaseId", "secretRef"],
    unbind_management_credential: ["databaseId"],
    bind_database_url: ["databaseId", "secretRef"],
    unbind_database_url: ["databaseId"],
  })[action];
}

function validateCredentialRef(runtimeRoot, buildId, environmentId, secretRef) {
  const environment = readBuildEnvironment(runtimeRoot, buildId, environmentId);
  if (!environment.ok) return fail("DATABASE_ENVIRONMENT_NOT_FOUND");
  const binding = readBuildSecretBinding(runtimeRoot, buildId, environmentId, secretRef);
  if (!binding.ok || binding.binding.kind !== "secret") return fail("DATABASE_SECRET_REF_NOT_FOUND");
  return { ok: true };
}

export function prepareBuildDatabaseMutation(runtimeRoot, buildId, request) {
  if (!exact(request, ["action", "expectedDatabaseRevision", "input"]) || !nonnegative(request.expectedDatabaseRevision))
    return fail("DATABASE_MUTATION_INVALID");
  const keys = inputKeys(request.action);
  if (!keys || !exact(request.input, keys)) return fail("DATABASE_MUTATION_INVALID");
  const found = readAuthority(runtimeRoot, buildId);
  if (!found.ok) return found;
  if (found.record.pendingRestore) return fail("RESTORE_PENDING");
  const authority = structuredClone(found.authority);
  if (authority.revision !== request.expectedDatabaseRevision) return fail("DATABASE_REVISION_STALE");
  const input = request.input;
  const now = new Date().toISOString();
  let databaseId = input.databaseId;
  let provider = PROVIDER;
  if (request.action === "create_database") {
    if (input.provider !== PROVIDER) return fail("DATABASE_PROVIDER_UNSUPPORTED");
    if (!validLabel(input.label)) return fail("DATABASE_LABEL_INVALID");
    if (authority.items.some((item) => item.label.toLowerCase() === input.label.toLowerCase())) return fail("DATABASE_LABEL_CONFLICT");
    if (!["existing", "path_provisioned"].includes(input.source)) return fail("DATABASE_SOURCE_INVALID");
    const environment = readBuildEnvironment(runtimeRoot, buildId, input.environmentId);
    if (!environment.ok) return fail("DATABASE_ENVIRONMENT_NOT_FOUND");
    databaseId = randomUUID();
    authority.items.push({ databaseId, provider: PROVIDER, engine: ENGINE, label: input.label,
      environmentId: input.environmentId, source: input.source,
      providerTarget: { organizationSlug: null, projectRef: null, region: null },
      credentials: { managementSecretRef: null, databaseUrlSecretRef: null },
      providerObservation: EMPTY_PROVIDER_OBSERVATION(), connectionObservation: EMPTY_CONNECTION_OBSERVATION(),
      migrationObservation: EMPTY_MIGRATION_OBSERVATION(), createdAt: now, updatedAt: now });
  } else {
    const item = authority.items.find((entry) => entry.databaseId === databaseId);
    if (!item) return fail("DATABASE_NOT_FOUND");
    if (request.action === "rename_database") {
      if (!validLabel(input.label)) return fail("DATABASE_LABEL_INVALID");
      if (item.label === input.label) return fail("DATABASE_UNCHANGED");
      if (authority.items.some((entry) => entry.databaseId !== item.databaseId && entry.label.toLowerCase() === input.label.toLowerCase()))
        return fail("DATABASE_LABEL_CONFLICT");
      item.label = input.label;
    } else if (request.action === "delete_database") {
      if (input.acknowledgeExternalResourceRetained !== true) return fail("DATABASE_EXTERNAL_RESOURCE_ACK_REQUIRED");
      if (authority.pendingOperation?.databaseId === item.databaseId) return fail("DATABASE_OPERATION_PENDING");
      authority.items = authority.items.filter((entry) => entry.databaseId !== item.databaseId);
    } else if (request.action === "set_provider_target") {
      if (item.source === "path_provisioned") return fail("DATABASE_PROVIDER_TARGET_MANAGED_BY_PROVISIONING");
      for (const key of ["organizationSlug", "projectRef", "region"]) {
        const value = input[key];
        if (value !== null && (typeof value !== "string" || !SAFE_TARGET.test(value))) return fail("DATABASE_PROVIDER_TARGET_INVALID");
      }
      if (input.projectRef === null) return fail("DATABASE_PROJECT_REF_REQUIRED");
      item.providerTarget = { organizationSlug: input.organizationSlug, projectRef: input.projectRef, region: input.region };
      item.providerObservation = EMPTY_PROVIDER_OBSERVATION();
      item.connectionObservation = EMPTY_CONNECTION_OBSERVATION();
      item.migrationObservation = EMPTY_MIGRATION_OBSERVATION();
    } else if (request.action === "bind_management_credential" || request.action === "bind_database_url") {
      const field = request.action === "bind_management_credential" ? "managementSecretRef" : "databaseUrlSecretRef";
      if (item.credentials[field] !== null) return fail("DATABASE_CREDENTIAL_ALREADY_BOUND");
      const validRef = validateCredentialRef(runtimeRoot, buildId, item.environmentId, input.secretRef);
      if (!validRef.ok) return validRef;
      item.credentials[field] = input.secretRef;
      if (field === "managementSecretRef") item.providerObservation = EMPTY_PROVIDER_OBSERVATION();
      else {
        item.connectionObservation = EMPTY_CONNECTION_OBSERVATION();
        item.migrationObservation = EMPTY_MIGRATION_OBSERVATION();
      }
    } else {
      const field = request.action === "unbind_management_credential" ? "managementSecretRef" : "databaseUrlSecretRef";
      if (item.credentials[field] === null) return fail("DATABASE_CREDENTIAL_NOT_BOUND");
      item.credentials[field] = null;
      if (field === "managementSecretRef") item.providerObservation = EMPTY_PROVIDER_OBSERVATION();
      else {
        item.connectionObservation = EMPTY_CONNECTION_OBSERVATION();
        item.migrationObservation = EMPTY_MIGRATION_OBSERVATION();
      }
    }
    item.updatedAt = now;
  }
  authority.revision += 1;
  return { ok: true, record: { ...found.record, databases: authority }, databaseId, provider,
    revision: authority.revision,
    ...(request.action === "delete_database" ? { providerResourceChanged: false, credentialMaterialChanged: false } : {}) };
}

export function prepareBuildDatabaseProvisionPreparation(runtimeRoot, buildId, request) {
  if (!exact(request, ["databaseId", "expectedDatabaseRevision", "expectedEnvironmentRevision", "organizationSlug", "region",
    "provisionPasswordSecretRef", "acknowledgeProviderBilling"]) || !nonnegative(request.expectedDatabaseRevision) ||
      !nonnegative(request.expectedEnvironmentRevision) || request.acknowledgeProviderBilling !== true ||
      !safeTarget(request.organizationSlug) || !safeTarget(request.region) || !safeId(request.provisionPasswordSecretRef))
    return fail("DATABASE_PROVISION_REQUEST_INVALID");
  const found = readAuthority(runtimeRoot, buildId);
  if (!found.ok) return found;
  if (found.record.pendingRestore) return fail("RESTORE_PENDING");
  if (found.authority.revision !== request.expectedDatabaseRevision) return fail("DATABASE_REVISION_STALE");
  const database = found.authority.items.find((item) => item.databaseId === request.databaseId);
  if (!database) return fail("DATABASE_NOT_FOUND");
  if (database.provider !== PROVIDER || database.engine !== ENGINE || database.source !== "path_provisioned" ||
      database.providerTarget.projectRef !== null) return fail("DATABASE_PROVISION_PRECONDITION_FAILED");
  if (found.authority.pendingOperation !== null) return fail("DATABASE_OPERATION_PENDING");
  const managementSecretRef = database.credentials.managementSecretRef;
  if (!managementSecretRef) return fail("DATABASE_CREDENTIAL_REQUIRED");
  const environment = readBuildEnvironment(runtimeRoot, buildId, database.environmentId);
  if (!environment.ok || environment.revision !== request.expectedEnvironmentRevision) return fail("DATABASE_ENVIRONMENT_STALE");
  const management = readBuildSecretBinding(runtimeRoot, buildId, database.environmentId, managementSecretRef);
  const password = readBuildSecretBinding(runtimeRoot, buildId, database.environmentId, request.provisionPasswordSecretRef);
  if (!management.ok || management.binding.kind !== "secret" || !password.ok || password.binding.kind !== "secret")
    return fail("DATABASE_SECRET_REF_NOT_FOUND");
  if (managementSecretRef === request.provisionPasswordSecretRef) return fail("DATABASE_PROVISION_CREDENTIALS_MUST_DIFFER");
  const next = structuredClone(found.authority);
  const operationId = randomUUID(); const now = new Date().toISOString();
  const slug = database.label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "database";
  const providerProjectName = `${slug}-${operationId.replaceAll("-", "").slice(0, 12)}`.slice(0, 80);
  next.revision += 1;
  next.pendingOperation = { operationId, kind: "provision", databaseId: database.databaseId, provider: PROVIDER,
    state: "prepared", expectedDatabaseRevision: next.revision, environmentId: database.environmentId,
    managementSecretRef, provisionPasswordSecretRef: request.provisionPasswordSecretRef,
    organizationSlug: request.organizationSlug, region: request.region, providerProjectName,
    createdAt: now, updatedAt: now, failureCode: null };
  const record = { ...found.record, databases: next };
  if (!validAuthority(next)) return fail("DATABASES_INVALID");
  return { ok: true, record, operationId, databaseId: database.databaseId, provider: PROVIDER, state: "prepared",
    revision: next.revision, providerProjectName };
}

function databaseSnapshotMatches(database, snapshot) {
  return database && database.databaseId === snapshot.databaseId && database.provider === snapshot.provider &&
    database.engine === snapshot.engine && database.environmentId === snapshot.environmentId &&
    database.credentials.managementSecretRef === snapshot.managementSecretRef &&
    database.credentials.databaseUrlSecretRef === snapshot.databaseUrlSecretRef &&
    database.providerTarget.projectRef === snapshot.projectRef &&
    (snapshot.plane !== "provider" || database.providerTarget.organizationSlug === snapshot.organizationSlug &&
      database.providerTarget.region === snapshot.region);
}

/** Internal P13.2 transition. Not part of the public P13.1 mutation vocabulary. */
export function prepareBuildDatabaseProviderObservationMutation(runtimeRoot, buildId, snapshot, observation) {
  return prepareDatabaseObservation(runtimeRoot, buildId, snapshot, observation, "provider");
}

/** Internal P13.2 transition. Not part of the public P13.1 mutation vocabulary. */
export function prepareBuildDatabaseConnectionObservationMutation(runtimeRoot, buildId, snapshot, observation) {
  return prepareDatabaseObservation(runtimeRoot, buildId, snapshot, observation, "connection");
}

/** Internal P13.3 observation transition; provider execution remains coordinator-owned. */
export function prepareBuildDatabaseMigrationObservationMutation(runtimeRoot, buildId, snapshot, observation) {
  const found = readAuthority(runtimeRoot, buildId);
  if (!found.ok) return found;
  if (found.record.pendingRestore) return fail("RESTORE_PENDING");
  if (!snapshot || snapshot.buildId !== buildId || found.authority.revision !== snapshot.databaseRevision)
    return fail("DATABASE_AUTHORITY_STALE");
  if (found.record.authoritativeSha !== snapshot.authoritativeSha) return fail("DATABASE_MIGRATION_SOURCE_STALE");
  const database = found.authority.items.find((item) => item.databaseId === snapshot.databaseId);
  if (!database || database.provider !== snapshot.provider || database.engine !== snapshot.engine ||
      database.environmentId !== snapshot.environmentId || database.providerTarget.projectRef !== snapshot.projectRef ||
      database.credentials.databaseUrlSecretRef !== snapshot.databaseUrlSecretRef) return fail("DATABASE_AUTHORITY_STALE");
  const environment = readBuildEnvironment(runtimeRoot, buildId, snapshot.environmentId);
  if (!environment.ok || environment.revision !== snapshot.environmentRevision) return fail("DATABASE_ENVIRONMENT_STALE");
  if (!exact(observation, ["state", "sourceSha", "localDigest", "localCount", "localHeadVersion", "remoteCount",
    "remoteHeadVersion", "failureCode"])) return fail("DATABASE_OBSERVATION_INVALID");
  const next = structuredClone(found.authority);
  const item = next.items.find((entry) => entry.databaseId === snapshot.databaseId);
  const reduced = { ...observation, observedAt: new Date().toISOString() };
  if (!validMigrationObservation(reduced)) return fail("DATABASE_OBSERVATION_INVALID");
  item.migrationObservation = reduced;
  item.updatedAt = reduced.observedAt;
  next.revision += 1;
  const record = { ...found.record, databases: next };
  if (!validAuthority(next)) return fail("DATABASES_INVALID");
  return { ok: true, record, databaseId: item.databaseId, provider: item.provider, revision: next.revision,
    observation: structuredClone(item.migrationObservation) };
}

/** Internal transition for the already-frozen provision operation. */
export function transitionBuildDatabaseProvision(runtimeRoot, buildId, input) {
  const found = readAuthority(runtimeRoot, buildId);
  if (!found.ok) return found;
  if (found.record.pendingRestore) return fail("RESTORE_PENDING");
  if (!exact(input, ["operationId", "expectedDatabaseRevision", "expectedEnvironmentRevision", "state", "failureCode", "projectRef",
    "projectName", "organizationSlug", "region", "projectStatus"])) return fail("DATABASE_PROVISION_INVALID");
  const authority = structuredClone(found.authority);
  const operation = authority.pendingOperation;
  if (!operation || operation.operationId !== input.operationId || authority.revision !== input.expectedDatabaseRevision)
    return fail("DATABASE_AUTHORITY_STALE");
  const environment = readBuildEnvironment(runtimeRoot, buildId, operation.environmentId);
  if (!environment.ok || environment.revision !== input.expectedEnvironmentRevision) return fail("DATABASE_ENVIRONMENT_STALE");
  const database = authority.items.find((item) => item.databaseId === operation.databaseId);
  if (!database) return fail("DATABASE_AUTHORITY_STALE");
  const now = new Date().toISOString();
  if (input.state === "effect_started" && operation.state === "prepared") {
    operation.state = "effect_started"; operation.expectedDatabaseRevision = authority.revision + 1;
    operation.updatedAt = now;
  } else if (input.state === "observed" && input.failureCode !== null &&
      ["effect_started", "uncertain", "observed"].includes(operation.state) && safeTarget(input.projectRef) &&
      input.projectName === operation.providerProjectName && input.organizationSlug === operation.organizationSlug &&
      input.region === operation.region && nullable(input.projectStatus, (v) => safeText(v, 80)) && safeCode(input.failureCode)) {
    operation.state = "observed"; operation.failureCode = input.failureCode; operation.updatedAt = now;
    database.providerTarget = { organizationSlug: input.organizationSlug, projectRef: input.projectRef, region: input.region };
    const actionRequired = ["DATABASE_PROVIDER_CREDENTIAL_REJECTED", "DATABASE_PROVIDER_PERMISSION_REQUIRED"].includes(input.failureCode);
    database.providerObservation = { state: actionRequired ? "action_required" : "unavailable", projectStatus: null,
      observedAt: now, failureCode: input.failureCode };
  } else if (input.state === "observed" && ["effect_started", "uncertain", "observed"].includes(operation.state) &&
      safeTarget(input.projectRef) && input.organizationSlug === operation.organizationSlug && input.region === operation.region &&
      input.projectName === operation.providerProjectName && nullable(input.projectStatus, (v) => safeText(v, 80))) {
    operation.state = "observed"; operation.failureCode = null; operation.updatedAt = now;
    database.providerTarget = { organizationSlug: input.organizationSlug, projectRef: input.projectRef, region: input.region };
    database.providerObservation = input.projectStatus === "ACTIVE_HEALTHY"
      ? { state: "unverified", projectStatus: null, observedAt: null, failureCode: null }
      : { state: "unavailable", projectStatus: input.projectStatus || "UNKNOWN", observedAt: now, failureCode: "DATABASE_PROVIDER_NOT_READY" };
  } else if (input.state === "uncertain" && ["effect_started", "uncertain"].includes(operation.state) && safeCode(input.failureCode)) {
    operation.state = "uncertain"; operation.failureCode = input.failureCode; operation.updatedAt = now;
  } else if (input.state === "failed_no_effect" && ["effect_started", "uncertain"].includes(operation.state) && safeCode(input.failureCode)) {
    authority.operationHistory.push({ operationId: operation.operationId, kind: operation.kind, databaseId: operation.databaseId,
      provider: operation.provider, providerProjectName: operation.providerProjectName, organizationSlug: operation.organizationSlug,
      region: operation.region, state: "failed_no_effect", providerProjectRef: null, createdAt: operation.createdAt,
      completedAt: null, failureCode: input.failureCode });
    authority.pendingOperation = null;
  } else if (input.state === "safe_stop" && ["effect_started", "uncertain", "observed"].includes(operation.state) && safeCode(input.failureCode)) {
    operation.state = "safe_stop"; operation.failureCode = input.failureCode; operation.updatedAt = now;
  } else if (input.state === "completed" && ["effect_started", "uncertain", "observed"].includes(operation.state) &&
      safeTarget(input.projectRef) && input.organizationSlug === operation.organizationSlug && input.region === operation.region &&
      input.projectStatus === "ACTIVE_HEALTHY") {
    database.providerTarget = { organizationSlug: operation.organizationSlug, projectRef: input.projectRef, region: operation.region };
    database.providerObservation = { state: "ready", projectStatus: "ACTIVE_HEALTHY", observedAt: now, failureCode: null };
    authority.operationHistory.push({ operationId: operation.operationId, kind: operation.kind, databaseId: operation.databaseId,
      provider: operation.provider, providerProjectName: operation.providerProjectName, organizationSlug: operation.organizationSlug,
      region: operation.region, state: "completed", providerProjectRef: database.providerTarget.projectRef,
      createdAt: operation.createdAt, completedAt: now, failureCode: null });
    authority.pendingOperation = null;
  } else return fail("DATABASE_PROVISION_TRANSITION_INVALID");
  authority.revision += 1;
  if (authority.pendingOperation) authority.pendingOperation.expectedDatabaseRevision = authority.revision;
  const record = { ...found.record, databases: authority };
  if (!validAuthority(authority)) return fail("DATABASES_INVALID");
  return { ok: true, record, operationId: input.operationId, databaseId: database.databaseId, provider: PROVIDER,
    state: input.state, revision: authority.revision, providerTarget: structuredClone(database.providerTarget),
    ...(input.state === "completed" ? { providerProjectRef: database.providerTarget.projectRef } : {}) };
}

function prepareDatabaseObservation(runtimeRoot, buildId, snapshot, observation, plane) {
  const found = readAuthority(runtimeRoot, buildId);
  if (!found.ok) return found;
  if (found.record.pendingRestore) return fail("RESTORE_PENDING");
  if (!snapshot || snapshot.buildId !== buildId || snapshot.plane !== plane ||
      found.authority.revision !== snapshot.databaseRevision) return fail("DATABASE_AUTHORITY_STALE");
  const database = found.authority.items.find((item) => item.databaseId === snapshot.databaseId);
  if (!databaseSnapshotMatches(database, snapshot)) return fail("DATABASE_AUTHORITY_STALE");
  const environment = readBuildEnvironment(runtimeRoot, buildId, snapshot.environmentId);
  if (!environment.ok || environment.revision !== snapshot.environmentRevision) return fail("DATABASE_ENVIRONMENT_STALE");
  const secretRef = plane === "provider" ? snapshot.managementSecretRef : snapshot.databaseUrlSecretRef;
  if (snapshot.variableName !== null && snapshot.variableName !== undefined) {
    const p9 = readBuildSecretBinding(runtimeRoot, buildId, snapshot.environmentId, secretRef);
    if (!p9.ok || p9.binding.kind !== "secret" || p9.binding.variableName !== snapshot.variableName ||
        p9.binding.backend !== snapshot.backend || p9.binding.bindingState !== snapshot.bindingState ||
        p9.binding.presenceState !== snapshot.presenceState || (p9.binding.safetyState ?? null) !== snapshot.safetyState)
      return fail("DATABASE_ENVIRONMENT_STALE");
  }
  const now = new Date().toISOString();
  const next = structuredClone(found.authority);
  const item = next.items.find((entry) => entry.databaseId === snapshot.databaseId);
  if (plane === "provider") {
    if (!exact(observation, ["state", "projectStatus", "failureCode", "organizationSlug", "region"]) ||
        !["ready", "action_required", "unavailable"].includes(observation.state) ||
        !nullable(observation.projectStatus, (value) => safeText(value, 80)) ||
        !nullable(observation.failureCode, safeCode) ||
        !nullable(observation.organizationSlug, safeTarget) || !nullable(observation.region, safeTarget) ||
        (observation.state === "ready" ? observation.failureCode !== null : observation.failureCode === null))
      return fail("DATABASE_OBSERVATION_INVALID");
    if (observation.state === "ready" &&
        ((item.providerTarget.organizationSlug !== null && item.providerTarget.organizationSlug !== observation.organizationSlug) ||
         (item.providerTarget.region !== null && item.providerTarget.region !== observation.region)))
      return fail("DATABASE_PROVIDER_TARGET_MISMATCH");
    item.providerObservation = { state: observation.state, projectStatus: observation.projectStatus,
      observedAt: now, failureCode: observation.failureCode };
    if (observation.state === "ready") {
      if (item.providerTarget.organizationSlug === null) item.providerTarget.organizationSlug = observation.organizationSlug;
      if (item.providerTarget.region === null) item.providerTarget.region = observation.region;
    }
  } else {
    if (!exact(observation, ["state", "adapterVersion", "serverVersion", "failureCode"]) ||
        !["ready", "action_required", "unavailable"].includes(observation.state) ||
        !nullable(observation.adapterVersion, safeId) || !nullable(observation.serverVersion, (value) => safeText(value, 120)) ||
        !nullable(observation.failureCode, safeCode) ||
        (observation.state === "ready" ? observation.adapterVersion === null || observation.serverVersion === null || observation.failureCode !== null :
          observation.serverVersion !== null || observation.failureCode === null)) return fail("DATABASE_OBSERVATION_INVALID");
    item.connectionObservation = { state: observation.state, adapterVersion: observation.adapterVersion,
      serverVersion: observation.serverVersion, observedAt: now, failureCode: observation.failureCode };
  }
  item.updatedAt = now;
  next.revision += 1;
  const record = { ...found.record, databases: next };
  if (!validAuthority(record.databases)) return fail("DATABASES_INVALID");
  return { ok: true, record, databaseId: item.databaseId, provider: item.provider,
    revision: next.revision, observation: structuredClone(plane === "provider" ? item.providerObservation : item.connectionObservation),
    ...(plane === "provider" ? { providerTarget: structuredClone(item.providerTarget) } : {}) };
}
