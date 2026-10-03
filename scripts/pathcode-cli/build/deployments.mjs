/** P10.1 Build-owned deployment authority. No provider calls or value materialization. */
import { createHash, randomUUID } from "node:crypto";
import { readBuildRecord } from "./record.mjs";
import { listBuildEnvironments } from "./environments.mjs";
import { inspectDeploymentSource, prepareDeploymentSource, cleanupDeploymentSource } from "./deploy-source.mjs";

export const DEPLOYMENTS_SCHEMA = "pathcode.p10.deployments.v1";
const fail = (code) => ({ ok: false, code });
const id = (value) => typeof value === "string" && /^[A-Za-z0-9._-]{1,160}$/.test(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const only = (object, allowed) => object && typeof object === "object" && !Array.isArray(object) &&
  Object.keys(object).every((key) => allowed.includes(key));
const now = () => new Date().toISOString();

export function emptyDeploymentAuthority() {
  return { schema: DEPLOYMENTS_SCHEMA, revision: 0, mappings: [], deployments: [], releases: [],
    currentProductionReleaseId: null, serving: { state: "unknown", observedProviderDeploymentId: null, observedAt: null },
    pendingOperation: null };
}

function readAuthority(runtimeRoot, buildId) {
  const record = readBuildRecord(runtimeRoot, buildId);
  if (!record || record.buildId !== buildId) return fail("BUILD_NOT_FOUND");
  const authority = record.deployments ?? emptyDeploymentAuthority();
  if (authority.schema !== DEPLOYMENTS_SCHEMA || !Number.isSafeInteger(authority.revision) ||
    !Array.isArray(authority.mappings) || !Array.isArray(authority.deployments) ||
    !Array.isArray(authority.releases) || !own(authority, "pendingOperation")) return fail("DEPLOYMENTS_INVALID");
  return { ok: true, record, authority };
}

/** Browser-safe projection deliberately omits all P9 values, secretRefs and workspaces. */
export function listBuildDeployments(runtimeRoot, buildId) {
  const read = readAuthority(runtimeRoot, buildId);
  if (!read.ok) return read;
  const { authority: a } = read;
  return { ok: true, schema: a.schema, revision: a.revision,
    mappings: a.mappings.map((m) => ({ mappingId: m.mappingId, provider: m.provider,
      environmentId: m.environmentId, teamRef: m.teamRef, projectRef: m.projectRef,
      targetRef: m.targetRef, updatedAt: m.updatedAt })),
    deployments: a.deployments.map((d) => ({ deploymentId: d.deploymentId, operationId: d.operationId,
      target: d.target, sourceSha: d.sourceSha, treeSha: d.treeSha, environmentId: d.environmentId,
      environmentRevision: d.environmentRevision, mappingId: d.mappingId,
      configNames: d.configNames, configDigest: d.configDigest, provider: d.provider,
      providerDeploymentId: d.providerDeploymentId, providerUrl: d.providerUrl,
      operationState: d.operationState, providerState: d.providerState,
      requestedAt: d.requestedAt, submittedAt: d.submittedAt, completedAt: d.completedAt,
      failureCode: d.failureCode })),
    releases: a.releases.map((r) => ({ releaseId: r.releaseId, operationId: r.operationId,
      deploymentId: r.deploymentId, action: r.action, providerDeploymentId: r.providerDeploymentId,
      projectRef: r.projectRef, sourceSha: r.sourceSha, environmentId: r.environmentId,
      releasedAt: r.releasedAt, previousReleaseId: r.previousReleaseId })),
    currentProductionReleaseId: a.currentProductionReleaseId,
    serving: { state: a.serving.state, observedProviderDeploymentId: a.serving.observedProviderDeploymentId,
      observedAt: a.serving.observedAt }, pendingOperation: a.pendingOperation ?
      { operationId: a.pendingOperation.operationId, kind: a.pendingOperation.kind,
        state: a.pendingOperation.state, deploymentId: a.pendingOperation.deploymentId ?? null,
        failureCode: a.pendingOperation.failureCode ?? null } : null };
}

export function prepareDeploymentMappingMutation(runtimeRoot, buildId, request) {
  const read = readAuthority(runtimeRoot, buildId);
  if (!read.ok) return read;
  if (read.record.pendingRestore) return fail("RESTORE_PENDING");
  if (!only(request, ["action", "expectedRevision", "environmentId", "teamRef", "projectRef", "targetRef"]) ||
    !["set", "remove"].includes(request.action) || !Number.isSafeInteger(request.expectedRevision) ||
    !id(request.environmentId)) return fail("DEPLOY_MAPPING_INVALID");
  if (request.expectedRevision !== read.authority.revision) return fail("DEPLOY_REVISION_STALE");
  if (read.authority.pendingOperation) return fail("DEPLOY_OPERATION_PENDING");
  const environments = listBuildEnvironments(runtimeRoot, buildId);
  if (!environments.ok) return environments;
  if (!environments.items.some((item) => item.environmentId === request.environmentId)) return fail("ENVIRONMENT_NOT_FOUND");
  const a = structuredClone(read.authority);
  const index = a.mappings.findIndex((item) => item.environmentId === request.environmentId && item.provider === "vercel");
  if (request.action === "remove") {
    if (index < 0) return fail("DEPLOY_MAPPING_NOT_FOUND");
    if (Object.keys(request).some((key) => !["action", "expectedRevision", "environmentId"].includes(key))) return fail("DEPLOY_MAPPING_INVALID");
    a.mappings.splice(index, 1);
  } else {
    if (!id(request.projectRef) || !["preview", "production"].includes(request.targetRef) ||
      (request.teamRef !== null && request.teamRef !== undefined && !id(request.teamRef))) return fail("DEPLOY_MAPPING_INVALID");
    const old = a.mappings[index];
    if (old && old.teamRef === (request.teamRef ?? null) && old.projectRef === request.projectRef &&
      old.targetRef === request.targetRef) return fail("DEPLOY_MAPPING_UNCHANGED");
    const mapping = { mappingId: randomUUID(), provider: "vercel",
      environmentId: request.environmentId, teamRef: request.teamRef ?? null,
      projectRef: request.projectRef, targetRef: request.targetRef, updatedAt: now() };
    if (index < 0) a.mappings.push(mapping); else a.mappings[index] = mapping;
  }
  a.revision += 1;
  a.serving = { state: "unknown", observedProviderDeploymentId: null, observedAt: null };
  return { ok: true, record: { ...read.record, deployments: a }, revision: a.revision,
    mappingId: a.mappings.find((item) => item.environmentId === request.environmentId)?.mappingId ?? null };
}

export function canonicalConfigDigest(entries) {
  const config = entries.filter((item) => item.kind === "config").map((item) => [item.variableName, item.value]);
  config.sort((a, b) => a[0].localeCompare(b[0]));
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export function validateDeploymentLocator(mapping, variables) {
  for (const item of variables.filter((entry) => entry.kind === "secret")) {
    if (item.backend === "local_env_file") return fail("LOCAL_ONLY_SECRET_FOR_REMOTE_DEPLOY");
    if (item.backend !== "vercel_env") return fail("DEPLOY_SECRET_BACKEND_INVALID");
    const d = item.descriptor;
    if ((d.teamRef !== null && d.teamRef !== mapping.teamRef) ||
      (d.projectRef !== null && d.projectRef !== mapping.projectRef) ||
      (d.targetRef !== null && d.targetRef !== mapping.targetRef) ||
      d.bindingRef !== null) return fail("DEPLOY_PROVIDER_LOCATOR_MISMATCH");
  }
  return { ok: true, unknownSecretPresence: variables.some((item) => item.kind === "secret" && item.presenceState === "unknown") };
}

/** Purely observational. Temporary worktree is always cleaned before return. */
export function preflightDeployment(runtimeRoot, buildId, environmentId) {
  const read = readAuthority(runtimeRoot, buildId);
  if (!read.ok) return read;
  if (read.authority.pendingOperation) return fail("DEPLOY_OPERATION_PENDING");
  const env = listBuildEnvironments(runtimeRoot, buildId);
  if (!env.ok) return env;
  const selected = env.items.find((item) => item.environmentId === environmentId);
  if (!selected) return fail("ENVIRONMENT_NOT_FOUND");
  const mapping = read.authority.mappings.find((item) => item.environmentId === environmentId && item.provider === "vercel");
  if (!mapping) return fail("DEPLOY_MAPPING_NOT_FOUND");
  const locator = validateDeploymentLocator(mapping, selected.variables);
  if (!locator.ok) return locator;
  const source = prepareDeploymentSource({ runtimeRoot, buildId });
  if (!source.ok) return source;
  const cleanup = cleanupDeploymentSource({ runtimeRoot, workspace: source.workspace });
  if (!cleanup.ok) return cleanup;
  return { ok: true, sourceSha: source.authoritativeSha, treeSha: source.treeSha,
    framework: source.framework, environmentId, environmentRevision: env.revision,
    mappingId: mapping.mappingId, targetRef: mapping.targetRef,
    configNames: selected.variables.filter((item) => item.kind === "config").map((item) => item.variableName).sort(),
    configDigest: canonicalConfigDigest(selected.variables), unknownSecretPresence: locator.unknownSecretPresence,
    creatorAcknowledgementRequired: locator.unknownSecretPresence, providerReadiness: "unverified" };
}

/** Called under coordinator exclusive gate; persists before any future provider effect. */
export function prepareDeploymentOperation(runtimeRoot, buildId, request) {
  if (!only(request, ["environmentId", "expectedRevision", "expectedEnvironmentRevision", "acknowledgeUnknownPresence"]) ||
    !id(request.environmentId) || !Number.isSafeInteger(request.expectedRevision) ||
    !Number.isSafeInteger(request.expectedEnvironmentRevision)) return fail("DEPLOY_REQUEST_INVALID");
  const read = readAuthority(runtimeRoot, buildId);
  if (!read.ok) return read;
  if (read.authority.revision !== request.expectedRevision) return fail("DEPLOY_REVISION_STALE");
  const preflight = preflightDeployment(runtimeRoot, buildId, request.environmentId);
  if (!preflight.ok) return preflight;
  if (preflight.environmentRevision !== request.expectedEnvironmentRevision) return fail("ENVIRONMENT_REVISION_STALE");
  if (preflight.creatorAcknowledgementRequired && request.acknowledgeUnknownPresence !== true) return fail("SECRET_PRESENCE_ACK_REQUIRED");
  const a = structuredClone(read.authority);
  const operationId = randomUUID();
  const deploymentId = randomUUID();
  const at = now();
  const snapshot = { sourceSha: preflight.sourceSha, treeSha: preflight.treeSha,
    environmentId: request.environmentId, environmentRevision: preflight.environmentRevision,
    mappingId: preflight.mappingId, configNames: preflight.configNames, configDigest: preflight.configDigest,
    unknownSecretPresenceAcknowledged: preflight.creatorAcknowledgementRequired };
  const deployment = { deploymentId, operationId, target: preflight.targetRef, ...snapshot,
    provider: "vercel", providerDeploymentId: null, providerUrl: null, operationState: "prepared",
    providerState: null, requestedAt: at, submittedAt: null, completedAt: null, failureCode: null };
  a.deployments.push(deployment);
  a.pendingOperation = { operationId, kind: "deploy", deploymentId, state: "prepared", snapshot,
    configReceipts: [], providerDeploymentId: null, createdAt: at, updatedAt: at, failureCode: null };
  a.revision += 1;
  return { ok: true, record: { ...read.record, deployments: a }, revision: a.revision,
    operationId, deploymentId };
}

/** Safe fixtures only in P10.1. No provider call, no operation retry. */
export function transitionDeploymentOperation(record, input) {
  const a = structuredClone(record.deployments ?? emptyDeploymentAuthority());
  const op = a.pendingOperation;
  if (!op || op.operationId !== input?.operationId || op.kind !== "deploy") return fail("DEPLOY_OPERATION_NOT_FOUND");
  const deployment = a.deployments.find((item) => item.deploymentId === op.deploymentId);
  if (!deployment) return fail("DEPLOYMENTS_INVALID");
  const state = input.state;
  if (!only(input, ["operationId", "state", "variableName", "providerDeploymentId", "providerUrl", "providerState", "failureCode"])) return fail("DEPLOY_TRANSITION_INVALID");
  if (state === "config_receipt") {
    if (!["prepared", "config_projection_incomplete"].includes(op.state) ||
      !op.snapshot.configNames.includes(input.variableName) || op.configReceipts.some((r) => r.variableName === input.variableName)) return fail("DEPLOY_TRANSITION_INVALID");
    op.configReceipts.push({ variableName: input.variableName, acknowledgedAt: now() });
    op.state = "config_projection_incomplete";
  } else if (state === "submitting") {
    if (!["prepared", "config_projection_incomplete"].includes(op.state) ||
      op.configReceipts.length !== op.snapshot.configNames.length) return fail("CONFIG_PROJECTION_INCOMPLETE");
    op.state = "submitting";
  } else if (state === "uncertain") {
    if (op.state !== "submitting") return fail("DEPLOY_TRANSITION_INVALID");
    op.state = "uncertain";
  } else if (state === "submitted") {
    if (!["submitting", "uncertain"].includes(op.state) || !/^dpl_[A-Za-z0-9]{8,100}$/.test(input.providerDeploymentId || "") ||
      typeof input.providerUrl !== "string" || !/^https:\/\/[A-Za-z0-9.-]+\.vercel\.app\/?$/.test(input.providerUrl)) return fail("DEPLOY_TRANSITION_INVALID");
    op.state = "submitted";
    op.providerDeploymentId = input.providerDeploymentId;
    deployment.providerDeploymentId = input.providerDeploymentId;
    deployment.providerUrl = input.providerUrl;
    deployment.submittedAt = now();
  } else if (state === "confirmed") {
    if (op.state !== "submitted" || input.providerState !== "READY") return fail("DEPLOY_TRANSITION_INVALID");
    op.state = "confirmed";
    deployment.providerState = "READY";
    deployment.completedAt = now();
    a.pendingOperation = null;
  } else if (state === "failed") {
    if (!["CONFIG_PROJECTION_FAILED", "PROVIDER_SUBMISSION_FAILED", "PROVIDER_BUILD_FAILED",
      "PROVIDER_STATUS_CONTRADICTION", "SOURCE_STALE", "ENVIRONMENT_STALE"].includes(input.failureCode)) return fail("DEPLOY_TRANSITION_INVALID");
    op.state = "failed";
    deployment.failureCode = input.failureCode;
    deployment.completedAt = now();
    a.pendingOperation = null;
  } else return fail("DEPLOY_TRANSITION_INVALID");
  deployment.operationState = state === "config_receipt" ? "config_projection_incomplete" : state;
  op.updatedAt = now();
  a.revision += 1;
  return { ok: true, record: { ...record, deployments: a }, revision: a.revision };
}

export function reconcileServing(record, safeObservation) {
  const a = structuredClone(record.deployments ?? emptyDeploymentAuthority());
  const release = a.releases.find((item) => item.releaseId === a.currentProductionReleaseId);
  if (!safeObservation?.ok || !release) a.serving = { state: "unknown", observedProviderDeploymentId: null, observedAt: null };
  else if (safeObservation.projectRef !== release.projectRef || safeObservation.target !== "production") return fail("PROVIDER_PATH_CONTRADICTION");
  else a.serving = { state: safeObservation.providerDeploymentId === release.providerDeploymentId ? "verified" : "drifted",
    observedProviderDeploymentId: safeObservation.providerDeploymentId, observedAt: safeObservation.observedAt };
  a.revision += 1;
  return { ok: true, record: { ...record, deployments: a }, revision: a.revision, serving: a.serving };
}

export function productionActionEligibility(record, action, deploymentId) {
  const a = record.deployments ?? emptyDeploymentAuthority();
  if (!["publish", "rollback", "reestablish"].includes(action)) return fail("RELEASE_ACTION_INVALID");
  const deployment = a.deployments.find((item) => item.deploymentId === deploymentId);
  if (!deployment || deployment.target !== "production" || deployment.operationState !== "confirmed" ||
    deployment.providerState !== "READY" || !deployment.providerDeploymentId) return fail("RELEASE_TARGET_INVALID");
  if (action !== "reestablish" && a.currentProductionReleaseId && a.serving.state !== "verified") return fail("RELEASE_SERVING_UNVERIFIED");
  if (action === "rollback" && !a.releases.some((item) => item.deploymentId === deploymentId)) return fail("ROLLBACK_TARGET_INVALID");
  return { ok: true, deployment };
}

/** Models the durable intent that must precede a future production switch. */
export function prepareFixtureReleaseOperation(record, { action, deploymentId, expectedRevision, projectRef }) {
  const a = structuredClone(record.deployments ?? emptyDeploymentAuthority());
  if (a.pendingOperation) return fail("DEPLOY_OPERATION_PENDING");
  if (a.revision !== expectedRevision) return fail("DEPLOY_REVISION_STALE");
  const eligible = productionActionEligibility({ deployments: a }, action, deploymentId);
  if (!eligible.ok) return eligible;
  if (!id(projectRef)) return fail("DEPLOY_MAPPING_INVALID");
  const mapping = a.mappings.find((item) => item.environmentId === eligible.deployment.environmentId &&
    item.projectRef === projectRef && item.targetRef === "production");
  if (!mapping || mapping.mappingId !== eligible.deployment.mappingId) return fail("DEPLOY_MAPPING_STALE");
  const operationId = randomUUID();
  a.pendingOperation = { operationId, kind: action, deploymentId, state: "prepared",
    expectedCurrentReleaseId: a.currentProductionReleaseId, projectRef,
    providerDeploymentId: eligible.deployment.providerDeploymentId, createdAt: now(), updatedAt: now() };
  a.revision += 1;
  return { ok: true, record: { ...record, deployments: a }, operationId, revision: a.revision };
}

export function finalizeFixtureRelease(record, { operationId, deploymentId, action, safeObservation }) {
  const a = structuredClone(record.deployments ?? emptyDeploymentAuthority());
  const op = a.pendingOperation;
  if (!op || op.operationId !== operationId || op.kind !== action || op.deploymentId !== deploymentId) return fail("RELEASE_OPERATION_NOT_FOUND");
  if (op.expectedCurrentReleaseId !== a.currentProductionReleaseId) return fail("RELEASE_AUTHORITY_STALE");
  const eligible = productionActionEligibility({ deployments: a }, action, deploymentId);
  if (!eligible.ok) return eligible;
  const deployment = eligible.deployment;
  if (!safeObservation?.ok || safeObservation.providerDeploymentId !== deployment.providerDeploymentId ||
    safeObservation.target !== "production" || safeObservation.projectRef !== op.projectRef) return fail("RELEASE_SERVING_UNVERIFIED");
  const releaseId = randomUUID();
  a.releases.push({ releaseId, operationId, deploymentId, action, providerDeploymentId: deployment.providerDeploymentId,
    projectRef: op.projectRef, sourceSha: deployment.sourceSha, environmentId: deployment.environmentId, releasedAt: now(),
    previousReleaseId: a.currentProductionReleaseId });
  a.currentProductionReleaseId = releaseId;
  a.serving = { state: "verified", observedProviderDeploymentId: deployment.providerDeploymentId,
    observedAt: safeObservation.observedAt };
  a.pendingOperation = null;
  a.revision += 1;
  return { ok: true, record: { ...record, deployments: a }, releaseId };
}

export function recoverDeploymentFoundation(record) {
  const op = record.deployments?.pendingOperation;
  if (!op) return { ok: true, state: "idle" };
  if (op.state === "prepared") return { ok: true, state: "prepared_no_provider_action", retry: false };
  if (op.state === "config_projection_incomplete") return { ok: true, state: "config_projection_incomplete", retry: false };
  if (op.state === "uncertain" || (op.state === "submitting" && !op.providerDeploymentId)) return { ok: true, state: "provider_outcome_uncertain", retry: false };
  if (op.providerDeploymentId) return { ok: true, state: "provider_verification_required", retry: false };
  return { ok: true, state: "reconciliation_required", retry: false };
}

export function validateOperationSnapshot(runtimeRoot, buildId, operationId) {
  const read = readAuthority(runtimeRoot, buildId);
  if (!read.ok) return read;
  const op = read.authority.pendingOperation;
  if (!op || op.operationId !== operationId) return fail("DEPLOY_OPERATION_NOT_FOUND");
  const source = inspectDeploymentSource({ runtimeRoot, buildId });
  if (!source.ok || source.sha !== op.snapshot.sourceSha || source.treeSha !== op.snapshot.treeSha) return fail("DEPLOY_SOURCE_STALE");
  const env = listBuildEnvironments(runtimeRoot, buildId);
  if (!env.ok || env.revision !== op.snapshot.environmentRevision) return fail("ENVIRONMENT_REVISION_STALE");
  if (!read.authority.mappings.some((m) => m.mappingId === op.snapshot.mappingId && m.environmentId === op.snapshot.environmentId)) return fail("DEPLOY_MAPPING_STALE");
  return { ok: true };
}
