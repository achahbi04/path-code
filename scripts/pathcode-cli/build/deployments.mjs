/** P10.1 Build-owned deployment authority. No provider calls or value materialization. */
import { createHash, randomUUID } from "node:crypto";
import { readBuildRecord } from "./record.mjs";
import { listBuildEnvironments } from "./environments.mjs";
import { inspectDeploymentSource, prepareDeploymentSource, cleanupDeploymentSource } from "./deploy-source.mjs";
import { PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS } from "./vercel-preview-adapter.mjs";

export const DEPLOYMENTS_SCHEMA = "pathcode.p10.deployments.v1";
const fail = (code) => ({ ok: false, code });
const id = (value) => typeof value === "string" && /^[A-Za-z0-9._-]{1,160}$/.test(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const only = (object, allowed) => object && typeof object === "object" && !Array.isArray(object) &&
  Object.keys(object).every((key) => allowed.includes(key));
const now = () => new Date().toISOString();
const NO_DEPLOYMENT_SETTLEMENT_MS = 120_000;
export const DEPLOY_RECONCILIATION_WINDOW_MISSING = "DEPLOY_RECONCILIATION_WINDOW_MISSING";
export const PRODUCTION_DEPLOY_EXECUTION_TIMEOUT_MS = 120_000;
// Bounded V1 observation allowance, not a provider guarantee; P10.3D validates it.
export const PRODUCTION_CREATION_TIME_SAFETY_ALLOWANCE_MS = 600_000;
/** V1 headroom for both PATH/provider clock offset and provider-side latency
 * between request acceptance and the immutable deployment-createdAt stamp. */
export const PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS = 300_000;

function validTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function submissionWindow(boundaryAt) {
  const boundary = Date.parse(boundaryAt);
  return { windowStart: new Date(boundary - PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS).toISOString(),
    windowEnd: new Date(boundary + PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS +
      PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS).toISOString() };
}

function productionSubmissionWindow(boundaryAt) {
  const boundary = Date.parse(boundaryAt);
  return { windowStart: new Date(boundary - PRODUCTION_CREATION_TIME_SAFETY_ALLOWANCE_MS).toISOString(),
    windowEnd: new Date(boundary + PRODUCTION_DEPLOY_EXECUTION_TIMEOUT_MS +
      PRODUCTION_CREATION_TIME_SAFETY_ALLOWANCE_MS).toISOString() };
}

function hasFrozenSubmissionWindow(op, deployment) {
  if (!validTimestamp(op.submissionBoundaryAt) || !only(op.reconciliationWindow, ["windowStart", "windowEnd"]) ||
      !["windowStart", "windowEnd"].every((key) => validTimestamp(op.reconciliationWindow[key]))) return false;
  const expected = submissionWindow(op.submissionBoundaryAt);
  return op.reconciliationWindow.windowStart === expected.windowStart &&
    op.reconciliationWindow.windowEnd === expected.windowEnd &&
    deployment.submissionBoundaryAt === op.submissionBoundaryAt &&
    deployment.reconciliationWindow?.windowStart === expected.windowStart &&
    deployment.reconciliationWindow?.windowEnd === expected.windowEnd;
}

function safeWindowProjection(item) {
  const window = item?.reconciliationWindow;
  return window && validTimestamp(window.windowStart) && validTimestamp(window.windowEnd) ?
    { windowStart: window.windowStart, windowEnd: window.windowEnd } : null;
}
const safeBoundaryProjection = (item) => validTimestamp(item?.submissionBoundaryAt) ? item.submissionBoundaryAt : null;

/** A no-deployment observation is evidence about one exhausted search window, never retry authority. */
function validUnobservedSubmissionEvidence(record, authority, op, deployment, evidence) {
  if (!only(evidence, ["buildId", "operationId", "deploymentId", "mappingId", "teamRef", "projectRef",
    "target", "pathOperationId", "windowStart", "windowEnd", "metadataFilteredLookup",
    "projectWindowLookup", "completedAt"])) return false;
  const required = ["buildId", "operationId", "deploymentId", "mappingId", "teamRef", "projectRef",
    "target", "pathOperationId", "windowStart", "windowEnd", "metadataFilteredLookup",
    "projectWindowLookup", "completedAt"];
  if (!required.every((key) => own(evidence, key))) return false;
  const mapping = authority.mappings.find((item) => item.mappingId === op.snapshot?.mappingId &&
    item.environmentId === op.snapshot.environmentId && item.provider === "vercel");
  if (!mapping || record.buildId !== evidence.buildId || op.operationId !== evidence.operationId ||
    op.deploymentId !== evidence.deploymentId || evidence.pathOperationId !== op.operationId ||
    deployment.operationId !== op.operationId || deployment.target !== "preview" ||
    deployment.mappingId !== mapping.mappingId || evidence.mappingId !== mapping.mappingId ||
    evidence.teamRef !== mapping.teamRef || evidence.projectRef !== mapping.projectRef ||
    evidence.target !== "preview" || mapping.targetRef !== "preview" ||
    op.providerDeploymentId !== null || deployment.providerDeploymentId !== null || deployment.providerUrl !== null) return false;
  const metadata = evidence.metadataFilteredLookup;
  const project = evidence.projectWindowLookup;
  if (!only(metadata, ["completed", "exhausted", "nextCursor", "exactMatchCount"]) ||
    !only(project, ["completed", "exhausted", "nextCursor", "exactOperationMatchCount"]) ||
    !["completed", "exhausted", "nextCursor", "exactMatchCount"].every((key) => own(metadata, key)) ||
    !["completed", "exhausted", "nextCursor", "exactOperationMatchCount"].every((key) => own(project, key)) ||
    metadata.completed !== true || metadata.exhausted !== true || metadata.nextCursor !== null ||
    metadata.exactMatchCount !== 0 || project.completed !== true || project.exhausted !== true ||
    project.nextCursor !== null || project.exactOperationMatchCount !== 0) return false;
  if (!hasFrozenSubmissionWindow(op, deployment) ||
      evidence.windowStart !== op.reconciliationWindow.windowStart ||
      evidence.windowEnd !== op.reconciliationWindow.windowEnd ||
      ![evidence.windowStart, evidence.windowEnd, evidence.completedAt, op.updatedAt].every(validTimestamp)) return false;
  const start = Date.parse(evidence.windowStart), end = Date.parse(evidence.windowEnd);
  const completed = Date.parse(evidence.completedAt), uncertainAt = Date.parse(op.updatedAt);
  // The uncertain boundary may follow the frozen provider window by hours, but
  // must not precede its lower bound. Settlement age starts at uncertainAt.
  return start < end && start <= uncertainAt && end <= completed && completed <= Date.now() &&
    completed - uncertainAt >= NO_DEPLOYMENT_SETTLEMENT_MS;
}

export function emptyDeploymentAuthority() {
  return { schema: DEPLOYMENTS_SCHEMA, revision: 0, mappings: [], deployments: [], releases: [],
    releaseOperations: [],
    currentProductionReleaseId: null, serving: { state: "unknown", observedProviderDeploymentId: null, observedAt: null },
    pendingOperation: null };
}

function readAuthority(runtimeRoot, buildId) {
  const record = readBuildRecord(runtimeRoot, buildId);
  if (!record || record.buildId !== buildId) return fail("BUILD_NOT_FOUND");
  const authority = record.deployments ?? emptyDeploymentAuthority();
  if (authority.schema !== DEPLOYMENTS_SCHEMA || !Number.isSafeInteger(authority.revision) ||
    !Array.isArray(authority.mappings) || !Array.isArray(authority.deployments) ||
    !Array.isArray(authority.releases) || (own(authority, "releaseOperations") && !Array.isArray(authority.releaseOperations)) ||
    !own(authority, "pendingOperation")) return fail("DEPLOYMENTS_INVALID");
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
      failureCode: d.failureCode,
      submissionBoundaryAt: safeBoundaryProjection(d),
      reconciliationWindow: safeWindowProjection(d) })),
    releases: a.releases.map((r) => ({ releaseId: r.releaseId, operationId: r.operationId,
      deploymentId: r.deploymentId, action: r.action, providerDeploymentId: r.providerDeploymentId,
      provider: r.provider ?? "vercel", teamRef: r.teamRef ?? null, mappingId: r.mappingId ?? null,
      projectRef: r.projectRef, sourceSha: r.sourceSha, environmentId: r.environmentId,
      environmentRevision: r.environmentRevision ?? null,
      releasedAt: r.releasedAt, previousReleaseId: r.previousReleaseId })),
    releaseOperations: (a.releaseOperations ?? []).map((op) => ({ operationId: op.operationId,
      kind: op.kind, state: op.state, deploymentId: op.deploymentId,
      provider: op.provider ?? "vercel", teamRef: op.teamRef ?? null, projectRef: op.projectRef,
      mappingId: op.mappingId ?? null, sourceSha: op.sourceSha ?? null, treeSha: op.treeSha ?? null,
      environmentId: op.environmentId ?? null, environmentRevision: op.environmentRevision ?? null,
      targetProviderDeploymentId: op.targetProviderDeploymentId, expectedCurrentReleaseId: op.expectedCurrentReleaseId,
      targetReleaseId: op.targetReleaseId ?? null, createdAt: op.createdAt, updatedAt: op.updatedAt,
      completedAt: op.completedAt ?? null, resultReleaseId: op.resultReleaseId ?? null,
      supersededByOperationId: op.supersededByOperationId ?? null,
      failureCode: op.failureCode ?? null })),
    currentProductionReleaseId: a.currentProductionReleaseId,
    serving: { state: a.serving.state, observedProviderDeploymentId: a.serving.observedProviderDeploymentId,
      observedAt: a.serving.observedAt }, pendingOperation: a.pendingOperation ?
      { operationId: a.pendingOperation.operationId, kind: a.pendingOperation.kind,
        state: a.pendingOperation.state, deploymentId: a.pendingOperation.deploymentId ?? null,
        targetProviderDeploymentId: a.pendingOperation.targetProviderDeploymentId ?? null,
        expectedCurrentReleaseId: a.pendingOperation.expectedCurrentReleaseId ?? null,
        targetReleaseId: a.pendingOperation.targetReleaseId ?? null,
        provider: a.pendingOperation.provider ?? null, teamRef: a.pendingOperation.teamRef ?? null,
        projectRef: a.pendingOperation.projectRef ?? null, mappingId: a.pendingOperation.mappingId ?? null,
        failureCode: a.pendingOperation.failureCode ?? null,
        submissionBoundaryAt: safeBoundaryProjection(a.pendingOperation),
        reconciliationWindow: safeWindowProjection(a.pendingOperation) } : null };
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

/** Explicit Production-only preparation. Generic coordinator preparation is Preview-only. */
export function prepareProductionDeploymentOperation(runtimeRoot, buildId, request) {
  if (!only(request, ["environmentId", "expectedRevision", "expectedEnvironmentRevision", "acknowledgeUnknownPresence"]) ||
      !id(request.environmentId) || !Number.isSafeInteger(request.expectedRevision) ||
      !Number.isSafeInteger(request.expectedEnvironmentRevision)) return fail("DEPLOY_REQUEST_INVALID");
  const read = readAuthority(runtimeRoot, buildId);
  if (!read.ok) return read;
  const mapping = read.authority.mappings.find((item) => item.environmentId === request.environmentId && item.provider === "vercel");
  if (!mapping || mapping.targetRef !== "production") return fail("DEPLOY_TARGET_INVALID");
  const result = prepareDeploymentOperation(runtimeRoot, buildId, request);
  if (!result.ok) return result;
  const record = structuredClone(result.record);
  const authority = record.deployments;
  const op = authority.pendingOperation;
  const deployment = authority.deployments.find((item) => item.deploymentId === result.deploymentId);
  const environmentResult = listBuildEnvironments(runtimeRoot, buildId);
  const environment = environmentResult.ok && environmentResult.items.find((item) => item.environmentId === request.environmentId);
  if (!op || !deployment || !environment) return fail("DEPLOYMENTS_INVALID");
  const configSnapshot = environment.variables.filter((item) => item.kind === "config")
    .map(({ variableName, value }) => ({ kind: "config", variableName, value })).sort((a, b) => a.variableName.localeCompare(b.variableName));
  const secretBindings = environment.variables.filter((item) => item.kind === "secret").map((item) => ({
    variableName: item.variableName, secretRef: item.secretRef, backend: item.backend,
    descriptor: { ...item.descriptor }, bindingState: item.bindingState, presenceState: item.presenceState,
    ...(item.safetyState ? { safetyState: item.safetyState } : {}),
  }));
  Object.assign(op.snapshot, { provider: "vercel", teamRef: mapping.teamRef, projectRef: mapping.projectRef,
    target: "production", configSnapshot, secretBindings });
  Object.assign(deployment, { teamRef: mapping.teamRef, projectRef: mapping.projectRef, target: "production" });
  return { ...result, record };
}

/** Safe fixtures only in P10.1. No provider call, no operation retry. */
export function transitionDeploymentOperation(record, input) {
  const a = structuredClone(record.deployments ?? emptyDeploymentAuthority());
  const op = a.pendingOperation;
  if (!op || op.operationId !== input?.operationId || op.kind !== "deploy") return fail("DEPLOY_OPERATION_NOT_FOUND");
  const deployment = a.deployments.find((item) => item.deploymentId === op.deploymentId);
  if (!deployment || (input.deploymentId !== undefined && input.deploymentId !== op.deploymentId)) return fail("DEPLOYMENTS_INVALID");
  if (deployment.target === "preview" && ["submitting", "uncertain"].includes(op.state) &&
      !hasFrozenSubmissionWindow(op, deployment))
    return fail(DEPLOY_RECONCILIATION_WINDOW_MISSING);
  const state = input.state;
  const fields = {
    config_attempt: ["variableName", "configOperation"], config_uncertain: ["variableName"],
    config_receipt: ["variableName"], config_projection_incomplete: [], submitting: [], uncertain: [],
    submitted: ["providerDeploymentId", "providerUrl", "providerState"],
    provider_observation: ["providerDeploymentId", "providerUrl", "providerState"],
    confirmed: ["providerDeploymentId"], failed: ["failureCode", "reconciliationEvidence"],
  }[state];
  if (!fields || !only(input, ["operationId", "deploymentId", "state", ...fields])) return fail("DEPLOY_TRANSITION_INVALID");
  if (state === "config_attempt") {
    if (deployment.target !== "production" || !["prepared", "config_projection_incomplete"].includes(op.state) ||
      !op.snapshot.configNames.includes(input.variableName) || !["add", "update"].includes(input.configOperation) ||
      op.configProjectionAttempt || op.configReceipts.some((r) => r.variableName === input.variableName)) return fail("DEPLOY_TRANSITION_INVALID");
    op.configProjectionAttempt = { variableName: input.variableName, operation: input.configOperation, state: "in_flight", startedAt: now() };
    op.state = "config_projection_incomplete";
  } else if (state === "config_uncertain") {
    if (deployment.target !== "production" || op.state !== "config_projection_incomplete" ||
      op.configProjectionAttempt?.variableName !== input.variableName || op.configProjectionAttempt.state !== "in_flight") return fail("DEPLOY_TRANSITION_INVALID");
    op.configProjectionAttempt.state = "uncertain";
    op.configProjectionAttempt.updatedAt = now();
  } else if (state === "config_receipt") {
    if (!["prepared", "config_projection_incomplete"].includes(op.state) ||
      !op.snapshot.configNames.includes(input.variableName) || op.configReceipts.some((r) => r.variableName === input.variableName) ||
      deployment.target === "production" && op.snapshot?.target === "production" &&
        (op.configProjectionAttempt?.variableName !== input.variableName ||
        op.configProjectionAttempt.state !== "in_flight")) return fail("DEPLOY_TRANSITION_INVALID");
    op.configReceipts.push({ variableName: input.variableName, acknowledgedAt: now() });
    if (deployment.target === "production" && op.snapshot?.target === "production") op.configProjectionAttempt = null;
    op.state = "config_projection_incomplete";
  } else if (state === "config_projection_incomplete") {
    if (!["prepared", "config_projection_incomplete"].includes(op.state)) return fail("DEPLOY_TRANSITION_INVALID");
    op.state = "config_projection_incomplete";
  } else if (state === "submitting") {
    if (!["prepared", "config_projection_incomplete"].includes(op.state) ||
      op.configReceipts.length !== op.snapshot.configNames.length) return fail("CONFIG_PROJECTION_INCOMPLETE");
    if (deployment.target === "preview") {
      const boundaryAt = now();
      const reconciliationWindow = submissionWindow(boundaryAt);
      op.submissionBoundaryAt = boundaryAt;
      op.reconciliationWindow = reconciliationWindow;
      deployment.submissionBoundaryAt = boundaryAt;
      deployment.reconciliationWindow = structuredClone(reconciliationWindow);
    } else if (deployment.target === "production") {
      const boundaryAt = now();
      const reconciliationWindow = productionSubmissionWindow(boundaryAt);
      op.submissionBoundaryAt = boundaryAt;
      op.reconciliationWindow = reconciliationWindow;
      deployment.submissionBoundaryAt = boundaryAt;
      deployment.reconciliationWindow = structuredClone(reconciliationWindow);
    }
    op.state = "submitting";
  } else if (state === "uncertain") {
    if (op.state !== "submitting") return fail("DEPLOY_TRANSITION_INVALID");
    op.state = "uncertain";
  } else if (state === "submitted") {
    if (!["submitting", "uncertain"].includes(op.state) || !/^dpl_[A-Za-z0-9]{8,100}$/.test(input.providerDeploymentId || "") ||
      typeof input.providerUrl !== "string" || !/^https:\/\/[A-Za-z0-9.-]+\.vercel\.app\/?$/.test(input.providerUrl)) return fail("DEPLOY_TRANSITION_INVALID");
    if (input.providerState !== undefined && !["QUEUED", "INITIALIZING", "BUILDING", "DEPLOYING", "ANALYZING", "READY", "ERROR", "CANCELED"].includes(input.providerState)) return fail("DEPLOY_TRANSITION_INVALID");
    op.state = "submitted";
    op.providerDeploymentId = input.providerDeploymentId;
    deployment.providerDeploymentId = input.providerDeploymentId;
    deployment.providerUrl = input.providerUrl;
    if (input.providerState !== undefined) deployment.providerState = input.providerState;
    deployment.submittedAt = now();
  } else if (state === "provider_observation") {
    if (op.state !== "submitted" || input.providerDeploymentId !== op.providerDeploymentId ||
      deployment.providerDeploymentId !== op.providerDeploymentId ||
      input.providerUrl !== deployment.providerUrl ||
      !["QUEUED", "INITIALIZING", "BUILDING", "DEPLOYING", "ANALYZING", "READY", "ERROR", "CANCELED"].includes(input.providerState)) return fail("DEPLOY_TRANSITION_INVALID");
    deployment.providerState = input.providerState;
    op.readyObservedAt = input.providerState === "READY" ? now() : null;
  } else if (state === "confirmed") {
    if (op.state !== "submitted" || input.providerDeploymentId !== op.providerDeploymentId ||
      deployment.providerState !== "READY" || !op.readyObservedAt) return fail("DEPLOY_TRANSITION_INVALID");
    op.state = "confirmed";
    deployment.providerState = "READY";
    deployment.completedAt = now();
    a.pendingOperation = null;
  } else if (state === "failed") {
    if (!["CONFIG_PROJECTION_FAILED", "PROVIDER_SUBMISSION_FAILED", "PROVIDER_BUILD_FAILED",
      "PROVIDER_STATUS_CONTRADICTION", "SOURCE_STALE", "ENVIRONMENT_STALE",
      "PROVIDER_SUBMISSION_NOT_OBSERVED"].includes(input.failureCode)) return fail("DEPLOY_TRANSITION_INVALID");
    if (input.failureCode === "PROVIDER_SUBMISSION_NOT_OBSERVED") {
      if (op.state !== "uncertain" || !validUnobservedSubmissionEvidence(record, a, op, deployment,
        input.reconciliationEvidence)) return fail("DEPLOY_TRANSITION_INVALID");
    } else if (own(input, "reconciliationEvidence")) return fail("DEPLOY_TRANSITION_INVALID");
    if ((input.failureCode === "CONFIG_PROJECTION_FAILED" && !["prepared", "config_projection_incomplete"].includes(op.state)) ||
      (input.failureCode === "PROVIDER_SUBMISSION_FAILED" && op.state !== "submitting") ||
      (["PROVIDER_BUILD_FAILED", "PROVIDER_STATUS_CONTRADICTION"].includes(input.failureCode) && op.state !== "submitted") ||
      (input.failureCode === "PROVIDER_BUILD_FAILED" && !["ERROR", "CANCELED"].includes(deployment.providerState)) ||
      (["SOURCE_STALE", "ENVIRONMENT_STALE"].includes(input.failureCode) && !["prepared", "config_projection_incomplete"].includes(op.state))) return fail("DEPLOY_TRANSITION_INVALID");
    op.state = "failed";
    deployment.failureCode = input.failureCode;
    deployment.completedAt = now();
    a.pendingOperation = null;
  } else return fail("DEPLOY_TRANSITION_INVALID");
  if (state !== "provider_observation") deployment.operationState = ["config_attempt", "config_uncertain", "config_receipt"].includes(state)
    ? "config_projection_incomplete" : state;
  op.updatedAt = now();
  a.revision += 1;
  return { ok: true, record: { ...record, deployments: a }, revision: a.revision };
}

/** Dedicated transition authority for Production deployment operations. */
export function transitionProductionDeploymentOperation(record, input) {
  const authority = record.deployments ?? emptyDeploymentAuthority();
  const op = authority.pendingOperation;
  const deployment = op && authority.deployments.find((item) => item.deploymentId === op.deploymentId);
  if (!op || !deployment || deployment.target !== "production" || op.snapshot?.target !== "production" ||
      op.snapshot?.provider !== "vercel" || deployment.provider !== "vercel") return fail("DEPLOY_OPERATION_NOT_FOUND");
  const result = transitionDeploymentOperation(record, input);
  if (!result.ok) return result;
  if (["submitting", "uncertain", "submitted"].includes(input.state)) {
    const next = result.record.deployments.pendingOperation;
    const dep = result.record.deployments.deployments.find((item) => item.deploymentId === op.deploymentId);
    const expected = productionSubmissionWindow(next.submissionBoundaryAt || "");
    if (!validTimestamp(next.submissionBoundaryAt) || next.reconciliationWindow?.windowStart !== expected.windowStart ||
        next.reconciliationWindow?.windowEnd !== expected.windowEnd || dep.submissionBoundaryAt !== next.submissionBoundaryAt ||
        dep.reconciliationWindow?.windowStart !== expected.windowStart || dep.reconciliationWindow?.windowEnd !== expected.windowEnd)
      return fail(DEPLOY_RECONCILIATION_WINDOW_MISSING);
  }
  return result;
}

export function reconcileServing(record, safeObservation) {
  const a = structuredClone(record.deployments ?? emptyDeploymentAuthority());
  const release = a.releases.find((item) => item.releaseId === a.currentProductionReleaseId);
  if (!safeObservation?.ok) a.serving = { state: "unknown", observedProviderDeploymentId: null, observedAt: null };
  else if (!/^dpl_[A-Za-z0-9]{8,100}$/.test(safeObservation.providerDeploymentId || "") ||
      safeObservation.target !== "production" || !id(safeObservation.projectRef) ||
      !validTimestamp(safeObservation.observedAt) ||
      (safeObservation.url != null && !/^https:\/\/[A-Za-z0-9.-]+\.vercel\.app\/?$/.test(safeObservation.url)))
    return fail("PROVIDER_SERVING_UNSAFE");
  else if (!release) a.serving = { state: "unknown", observedProviderDeploymentId: safeObservation.providerDeploymentId,
    observedAt: safeObservation.observedAt };
  else if (safeObservation.projectRef !== release.projectRef || safeObservation.target !== "production" ||
      (release.teamRef != null && safeObservation.teamRef !== release.teamRef)) return fail("PROVIDER_PATH_CONTRADICTION");
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
    deployment.provider !== "vercel" || deployment.providerState !== "READY" ||
    !/^dpl_[A-Za-z0-9]{8,100}$/.test(deployment.providerDeploymentId || "")) return fail("RELEASE_TARGET_INVALID");
  if (action === "publish" && a.currentProductionReleaseId && a.serving.state !== "verified") return fail("RELEASE_SERVING_UNVERIFIED");
  if (action === "rollback" && a.currentProductionReleaseId && a.serving.state !== "verified") return fail("RELEASE_SERVING_UNVERIFIED");
  if (action === "rollback" && (!a.currentProductionReleaseId ||
      !a.releases.some((item) => item.deploymentId === deploymentId) ||
      a.releases.find((item) => item.releaseId === a.currentProductionReleaseId)?.deploymentId === deploymentId)) return fail("ROLLBACK_TARGET_INVALID");
  if (action === "reestablish" && (!a.currentProductionReleaseId || a.serving.state === "verified")) return fail("REESTABLISH_NOT_REQUIRED");
  return { ok: true, deployment };
}

/** Models the durable intent that must precede a future production switch. */
export function prepareFixtureReleaseOperation(record, { action, deploymentId, expectedRevision, projectRef }) {
  if (!id(projectRef)) return fail("DEPLOY_MAPPING_INVALID");
  const prepared = prepareReleaseOperation(record, { action, deploymentId, expectedRevision });
  if (!prepared.ok) return prepared;
  if (prepared.operation?.projectRef !== projectRef) return fail("DEPLOY_MAPPING_STALE");
  return prepared;
}

/** Durable PATH release intent. Provider effects are always performed by the coordinator after this write. */
export function prepareReleaseOperation(record, { action, deploymentId, expectedRevision }) {
  const a = structuredClone(record.deployments ?? emptyDeploymentAuthority());
  const priorSafeStop = a.pendingOperation?.state === "safe_stop" &&
    ["publish", "rollback", "reestablish"].includes(a.pendingOperation?.kind);
  if (a.pendingOperation && !priorSafeStop) return fail("DEPLOY_OPERATION_PENDING");
  if (a.revision !== expectedRevision) return fail("DEPLOY_REVISION_STALE");
  const deployment = a.deployments.find((item) => item.deploymentId === deploymentId);
  const eligible = productionActionEligibility({ deployments: a }, action, deploymentId);
  if (!eligible.ok) return eligible;
  const mapping = a.mappings.find((item) => item.mappingId === deployment.mappingId &&
    item.environmentId === deployment.environmentId && item.provider === "vercel" && item.provider === deployment.provider &&
    item.targetRef === "production" && item.projectRef === deployment.projectRef &&
    item.teamRef === deployment.teamRef);
  if (!mapping) return fail("DEPLOY_MAPPING_STALE");
  const releaseMatchesMapping = (release) => release && release.provider === mapping.provider &&
    release.teamRef === mapping.teamRef && release.projectRef === mapping.projectRef &&
    release.mappingId === mapping.mappingId;
  if (a.currentProductionReleaseId) {
    const currentRelease = a.releases.find((item) => item.releaseId === a.currentProductionReleaseId);
    const currentDeployment = currentRelease && a.deployments.find((item) => item.deploymentId === currentRelease.deploymentId);
    if (!releaseMatchesMapping(currentRelease) || !currentDeployment || currentDeployment.target !== "production" ||
        currentDeployment.operationState !== "confirmed" || currentDeployment.providerState !== "READY" ||
        currentDeployment.providerDeploymentId !== currentRelease.providerDeploymentId) return fail("RELEASE_AUTHORITY_STALE");
  }
  let targetRelease = null;
  if (action === "rollback") {
    targetRelease = a.releases.find((item) => item.deploymentId === deploymentId) ?? null;
    if (!releaseMatchesMapping(targetRelease)) return fail("ROLLBACK_TARGET_INVALID");
  }
  if (action === "reestablish") {
    targetRelease = a.releases.find((item) => item.releaseId === a.currentProductionReleaseId) ?? null;
    if (!releaseMatchesMapping(targetRelease)) return fail("RELEASE_AUTHORITY_STALE");
    if (targetRelease.deploymentId !== deploymentId) return fail("RELEASE_TARGET_INVALID");
  }
  const operationId = randomUUID(), at = now();
  if (priorSafeStop) {
    const priorAudit = a.releaseOperations?.find((item) => item.operationId === a.pendingOperation.operationId);
    if (!priorAudit) return fail("RELEASE_OPERATION_STALE");
    priorAudit.supersededByOperationId = operationId;
    priorAudit.updatedAt = at;
    a.pendingOperation = null;
  }
  const operation = { operationId, kind: action, state: "prepared", deploymentId,
    targetProviderDeploymentId: deployment.providerDeploymentId, provider: deployment.provider,
    teamRef: mapping.teamRef, projectRef: mapping.projectRef, mappingId: mapping.mappingId,
    sourceSha: deployment.sourceSha, treeSha: deployment.treeSha,
    environmentId: deployment.environmentId, environmentRevision: deployment.environmentRevision,
    expectedCurrentReleaseId: a.currentProductionReleaseId,
    targetReleaseId: targetRelease?.releaseId ?? null,
    createdAt: at, updatedAt: at, failureCode: null };
  a.releaseOperations = [...(a.releaseOperations ?? []), structuredClone(operation)];
  a.pendingOperation = { operationId, kind: action, deploymentId, state: "prepared",
    expectedCurrentReleaseId: a.currentProductionReleaseId, targetReleaseId: operation.targetReleaseId,
    targetProviderDeploymentId: deployment.providerDeploymentId, mappingId: mapping.mappingId,
    provider: deployment.provider, teamRef: mapping.teamRef, projectRef: mapping.projectRef,
    sourceSha: deployment.sourceSha, treeSha: deployment.treeSha,
    environmentId: deployment.environmentId, environmentRevision: deployment.environmentRevision,
    createdAt: at, updatedAt: at, failureCode: null };
  a.revision += 1;
  return { ok: true, record: { ...record, deployments: a }, operationId, revision: a.revision,
    operation: structuredClone(operation) };
}

/** Update a release operation without granting permission to repeat an external effect. */
export function transitionReleaseOperation(record, input) {
  const a = structuredClone(record.deployments ?? emptyDeploymentAuthority());
  const op = a.pendingOperation;
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("RELEASE_TRANSITION_INVALID");
  const fields = { switching: [], verifying: ["effectAccepted"], uncertain: ["failureCode"],
    safe_stop: ["failureCode"], failed: ["failureCode"] }[input?.state];
  if (!op || !["publish", "rollback", "reestablish"].includes(op.kind) ||
      op.operationId !== input.operationId || op.deploymentId !== input.deploymentId ||
      !fields || !only(input, ["operationId", "deploymentId", "state", ...fields])) return fail("RELEASE_OPERATION_NOT_FOUND");
  const allowed = { switching: ["prepared"], verifying: ["switching", "uncertain", "safe_stop"],
    uncertain: ["switching", "verifying"], safe_stop: ["switching", "verifying", "uncertain"],
    failed: ["prepared", "switching"] };
  if (!allowed[input.state].includes(op.state)) return fail("RELEASE_TRANSITION_INVALID");
  if (input.state === "verifying" && input.effectAccepted !== true) return fail("RELEASE_TRANSITION_INVALID");
  if (["uncertain", "safe_stop", "failed"].includes(input.state) &&
      (typeof input.failureCode !== "string" || !/^[A-Z0-9_]{1,80}$/.test(input.failureCode))) return fail("RELEASE_TRANSITION_INVALID");
  op.state = input.state; op.updatedAt = now();
  if (input.failureCode) op.failureCode = input.failureCode;
  const audit = a.releaseOperations.find((item) => item.operationId === op.operationId);
  if (!audit) return fail("RELEASE_OPERATION_NOT_FOUND");
  Object.assign(audit, { state: op.state, updatedAt: op.updatedAt, failureCode: op.failureCode });
  if (input.state === "failed") a.pendingOperation = null;
  a.revision += 1;
  return { ok: true, record: { ...record, deployments: a }, revision: a.revision, state: input.state };
}

/** Finalize only after factual target-serving evidence and a fresh expected-release guard. */
export function finalizeReleaseOperation(record, { operationId, deploymentId, action, expectedCurrentReleaseId, safeObservation }) {
  const a = structuredClone(record.deployments ?? emptyDeploymentAuthority());
  const op = a.pendingOperation;
  if (!op || op.operationId !== operationId || op.kind !== action || op.deploymentId !== deploymentId ||
      op.state !== "verifying") return fail("RELEASE_OPERATION_NOT_FOUND");
  if (op.expectedCurrentReleaseId !== expectedCurrentReleaseId || a.currentProductionReleaseId !== expectedCurrentReleaseId)
    return fail("RELEASE_AUTHORITY_STALE");
  const deployment = a.deployments.find((item) => item.deploymentId === deploymentId);
  const mapping = a.mappings.find((item) => item.mappingId === op.mappingId && item.environmentId === op.environmentId);
  const historicalTarget = action !== "rollback" || a.releases.some((item) => item.releaseId === op.targetReleaseId && item.deploymentId === deploymentId);
  const targetRelease = action === "rollback" ? a.releases.find((item) => item.releaseId === op.targetReleaseId) : null;
  const currentRelease = a.releases.find((item) => item.releaseId === a.currentProductionReleaseId);
  const releaseMappingMatches = (release) => release && release.provider === op.provider &&
    release.teamRef === op.teamRef && release.projectRef === op.projectRef && release.mappingId === op.mappingId;
  const currentDeployment = currentRelease && a.deployments.find((item) => item.deploymentId === currentRelease.deploymentId);
  const rollbackNotCurrent = action !== "rollback" || a.releases.find((item) => item.releaseId === a.currentProductionReleaseId)?.deploymentId !== deploymentId;
  const reestablishCurrent = action !== "reestablish" || a.releases.find((item) => item.releaseId === a.currentProductionReleaseId)?.deploymentId === deploymentId;
  if (!deployment || deployment.target !== "production" || deployment.operationState !== "confirmed" || deployment.providerState !== "READY" ||
      !deployment.providerDeploymentId || !mapping || !historicalTarget || !rollbackNotCurrent || !reestablishCurrent ||
      (action === "rollback" && !releaseMappingMatches(targetRelease)) ||
      (action === "reestablish" && !releaseMappingMatches(currentRelease)) ||
      (expectedCurrentReleaseId !== null && (!releaseMappingMatches(currentRelease) || !currentDeployment ||
        currentDeployment.target !== "production" || currentDeployment.operationState !== "confirmed" ||
        currentDeployment.providerState !== "READY" || currentDeployment.providerDeploymentId !== currentRelease.providerDeploymentId)) ||
      mapping.provider !== op.provider || mapping.teamRef !== op.teamRef ||
      mapping.projectRef !== op.projectRef || mapping.targetRef !== "production" || deployment.providerDeploymentId !== op.targetProviderDeploymentId ||
      deployment.sourceSha !== op.sourceSha || deployment.treeSha !== op.treeSha ||
      deployment.environmentRevision !== op.environmentRevision || deployment.environmentId !== op.environmentId ||
      !safeObservation?.ok || safeObservation.providerDeploymentId !== op.targetProviderDeploymentId ||
      safeObservation.projectRef !== op.projectRef || safeObservation.teamRef !== op.teamRef || safeObservation.target !== "production" ||
      typeof safeObservation.observedAt !== "string" || !validTimestamp(safeObservation.observedAt)) return fail("RELEASE_SERVING_UNVERIFIED");
  const audit = a.releaseOperations.find((item) => item.operationId === operationId);
  if (!audit || audit.state !== op.state) return fail("RELEASE_OPERATION_STALE");
  let releaseId = a.currentProductionReleaseId;
  if (action !== "reestablish") {
    releaseId = randomUUID();
    a.releases.push({ releaseId, operationId, deploymentId, action, providerDeploymentId: deployment.providerDeploymentId,
      provider: op.provider, teamRef: op.teamRef, projectRef: op.projectRef, mappingId: op.mappingId,
      sourceSha: deployment.sourceSha, environmentId: deployment.environmentId, environmentRevision: deployment.environmentRevision,
      releasedAt: now(), previousReleaseId: a.currentProductionReleaseId });
    a.currentProductionReleaseId = releaseId;
  }
  a.serving = { state: "verified", observedProviderDeploymentId: safeObservation.providerDeploymentId,
    observedAt: safeObservation.observedAt };
  audit.state = "completed"; audit.completedAt = now(); audit.updatedAt = audit.completedAt;
  audit.resultReleaseId = action === "reestablish" ? null : releaseId;
  a.pendingOperation = null;
  a.revision += 1;
  return { ok: true, record: { ...record, deployments: a }, revision: a.revision,
    releaseId: action === "reestablish" ? null : releaseId, action };
}

export function finalizeFixtureRelease(record, { operationId, deploymentId, action, safeObservation }) {
  let current = record;
  const op = current.deployments?.pendingOperation;
  if (!op || op.operationId !== operationId || op.kind !== action || op.deploymentId !== deploymentId)
    return fail("RELEASE_OPERATION_NOT_FOUND");
  if (op.state === "prepared") {
    const switching = transitionReleaseOperation(current, { operationId, deploymentId, state: "switching" });
    if (!switching.ok) return switching;
    const verifying = transitionReleaseOperation(switching.record, { operationId, deploymentId, state: "verifying", effectAccepted: true });
    if (!verifying.ok) return verifying;
    current = verifying.record;
  }
  const expectedCurrentReleaseId = current.deployments?.pendingOperation?.expectedCurrentReleaseId ?? null;
  const auditedObservation = safeObservation?.ok ? { ...safeObservation,
    teamRef: current.deployments?.pendingOperation?.teamRef ?? null } : safeObservation;
  return finalizeReleaseOperation(current, { operationId, deploymentId, action, expectedCurrentReleaseId,
    safeObservation: auditedObservation });
}

export function recoverDeploymentFoundation(record) {
  const op = record.deployments?.pendingOperation;
  if (!op) return { ok: true, state: "idle" };
  const deployment = record.deployments.deployments.find((item) => item.deploymentId === op.deploymentId);
  const productionWindow = deployment?.target === "production" && validTimestamp(op.submissionBoundaryAt) &&
    op.submissionBoundaryAt === deployment.submissionBoundaryAt &&
    op.reconciliationWindow?.windowStart === productionSubmissionWindow(op.submissionBoundaryAt).windowStart &&
    op.reconciliationWindow?.windowEnd === productionSubmissionWindow(op.submissionBoundaryAt).windowEnd &&
    deployment.reconciliationWindow?.windowStart === op.reconciliationWindow.windowStart &&
    deployment.reconciliationWindow?.windowEnd === op.reconciliationWindow.windowEnd;
  if ((deployment?.target === "preview" ||
      deployment?.target === "production" && op.snapshot?.target === "production") &&
      ["submitting", "uncertain"].includes(op.state) &&
      (!deployment || (deployment.target === "preview" ? !hasFrozenSubmissionWindow(op, deployment) : !productionWindow)))
    return { ok: false, code: DEPLOY_RECONCILIATION_WINDOW_MISSING, retry: false };
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
  const mapping = read.authority.mappings.find((m) => m.mappingId === op.snapshot.mappingId && m.environmentId === op.snapshot.environmentId);
  if (!mapping) return fail("DEPLOY_MAPPING_STALE");
  if (op.snapshot.target === "production") {
    if (mapping.provider !== "vercel" || mapping.targetRef !== "production" ||
        mapping.teamRef !== op.snapshot.teamRef || mapping.projectRef !== op.snapshot.projectRef ||
        op.snapshot.provider !== "vercel") return fail("DEPLOY_MAPPING_STALE");
    const selected = env.items.find((item) => item.environmentId === op.snapshot.environmentId);
    const config = selected?.variables.filter((item) => item.kind === "config")
      .map(({ variableName, value }) => ({ kind: "config", variableName, value })).sort((a, b) => a.variableName.localeCompare(b.variableName));
    const secrets = selected?.variables.filter((item) => item.kind === "secret").map((item) => ({
      variableName: item.variableName, secretRef: item.secretRef, backend: item.backend,
      descriptor: { ...item.descriptor }, bindingState: item.bindingState, presenceState: item.presenceState,
      ...(item.safetyState ? { safetyState: item.safetyState } : {}),
    }));
    if (!selected || canonicalConfigDigest(selected.variables) !== op.snapshot.configDigest ||
        JSON.stringify(config) !== JSON.stringify(op.snapshot.configSnapshot) ||
        JSON.stringify(secrets) !== JSON.stringify(op.snapshot.secretBindings)) return fail("ENVIRONMENT_REVISION_STALE");
  }
  return { ok: true };
}
