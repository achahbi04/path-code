/**
 * Durable PATH Build coordinator.
 *
 * Owns Build mutation, autonomous loops, Gateway connectivity and product
 * runtime synchronization. Browser/HTTP processes are clients only.
 */

import { createBuildController, syncConversationLifecycle } from "../controller.mjs";
import {
  findLatestActiveBuild,
  listBuildRecords,
  readBuildRecord,
  writeBuildRecord,
} from "../record.mjs";
import { createBuildRuntimeManager } from "../runtime/manager.mjs";
import { createBuildRuntimeSync } from "../runtime/sync.mjs";
import { detectBuildArtifact } from "../runtime/artifact.mjs";
import { connectGitHubRepository, connectLocalRemote, disconnectRepository,
  pushAdoptedRevision, setAdoptedSync } from "../surface/repository.mjs";
import { appendBuildEvent, readBuildEvents } from "../events.mjs";
import {
  listBuildEnvironments, readBuildEnvironment, readBuildSecretBinding,
  prepareBuildEnvironmentMutation,
  prepareBuildEnvironmentVerification,
} from "../environments.mjs";
import { resolveExactLocalEnvValues } from "../runtime/local-env-resolve.mjs";
import { listBuildDeployments, preflightDeployment, prepareDeploymentMappingMutation,
  prepareDeploymentOperation, prepareProductionDeploymentOperation, transitionDeploymentOperation,
  transitionProductionDeploymentOperation, validateOperationSnapshot,
  prepareReleaseOperation, transitionReleaseOperation, finalizeReleaseOperation, reconcileServing,
  recoverDeploymentFoundation } from "../deployments.mjs";
import { executeProductionVercelCommand, makeProductionDeployCommand,
  makeProductionAuthCommand, makeProductionProjectCommand,
  makeProductionConfigCommand, makeProductionConfigMetadataCommand,
  makeProductionInspectCommand, makeProductionReconciliationPageCommand,
  reconcileProductionDeployment } from "../vercel-production-adapter.mjs";
import { executeProductionReleaseCommand, makeProductionServingEffectCommand,
  makeProductionReleaseInspectCommand, observeProductionServing } from "../vercel-release-adapter.mjs";
import { prepareDeploymentSource, cleanupDeploymentSource } from "../deploy-source.mjs";
import { planVercelConfigProjection } from "../vercel-deploy-contract.mjs";
import { ensureGateway, readGatewayPid } from "../../gateway/ensure.mjs";
import { terminateOwnedPid, withTimeout } from "../shutdown.mjs";
import { readPathPackageVersion } from "../../paths.mjs";
import { loadedCodeIdentity } from "../identity.mjs";
import {
  BUILD_COORDINATOR_PROTOCOL_VERSION,
  BuildCoordinatorMethods,
} from "./protocol.mjs";

export async function createBuildCoordinatorService(options) {
  const {
    runtimeRoot,
    packageRoot,
    fakeMode = false,
    preferredEngine = null,
    scopedBuildId = null,
    productionCommandExecutor,
    productionSpawnImpl,
    releaseCommandExecutor,
    releaseSpawnImpl,
  } = options;
  const runProductionCommand = productionCommandExecutor ?? ((spec, executorOptions) =>
    executeProductionVercelCommand(spec, { ...executorOptions,
      ...(productionSpawnImpl ? { spawnImpl: productionSpawnImpl } : {}) }));
  const runReleaseCommand = releaseCommandExecutor ?? ((spec, executorOptions) =>
    executeProductionReleaseCommand(spec, { ...executorOptions,
      ...(releaseSpawnImpl ? { spawnImpl: releaseSpawnImpl } : {}) }));
  const scopedControlPlane = typeof scopedBuildId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scopedBuildId);
  if (scopedBuildId !== null && !scopedControlPlane) {
    throw new Error("Invalid scoped Build identity");
  }
  let gatewayHandle = null;
  const gateway = fakeMode || scopedControlPlane
    ? {
        async bindProject() {
          return { ok: true };
        },
        async startTask(_objective, extra = {}) {
          return { ok: true, taskId: extra.taskId };
        },
        async resumeTask(taskId) {
          return { ok: true, taskId };
        },
        async awaitTask() {
          return {};
        },
        async steerTask() {
          return { ok: true };
        },
        async cancelTask() {
          return { ok: true };
        },
        snapshotTask() {
          return null;
        },
      }
    : await (async () => {
        gatewayHandle = await ensureGateway({ runtimeRoot, packageRoot });
        if (!gatewayHandle.client) {
          throw new Error("Build coordinator requires the socket Gateway");
        }
        const client = gatewayHandle.client;
        return {
          bindProject: (cwd) => client.bindProject(cwd),
          startTask: (objective, extra) => client.startTask(objective, extra),
          resumeTask: (taskId, extra) => client.resumeTask(taskId, extra),
          awaitTask: (taskId, timeoutMs) =>
            client.awaitTask(taskId, timeoutMs),
          steerTask: (taskId, text) => client.steerTask(taskId, text),
          cancelTask: (taskId) => client.cancelTask(taskId),
          snapshotTask: (taskId) => client.snapshotTask(taskId),
          getResult: (taskId) => client.getResult(taskId),
        };
      })();

  const codeIdentity = loadedCodeIdentity("coordinator");
  const controller = createBuildController({
    runtimeRoot,
    gateway,
    fakeMode,
    preferredEngine,
    dispatchIdentity: () => ({
      coordinatorSha: codeIdentity.sha,
      coordinatorDirty: codeIdentity.dirty,
      coordinatorPid: codeIdentity.pid,
      gatewaySha: gatewayHandle?.hello?.identity?.sha ?? null,
      gatewayDirty: gatewayHandle?.hello?.identity?.dirty ?? null,
      gatewayPid: gatewayHandle?.hello?.identity?.pid ?? null,
      version: codeIdentity.version,
    }),
  });
  /** @type {Set<string>} */
  const identityAnnounced = new Set();
  const runtimeManager = createBuildRuntimeManager({ runtimeRoot });
  const runtimeSync = createBuildRuntimeSync({
    runtimeRoot,
    controller,
    runtimeManager,
  });
  const loops = new Map();
  const mutations = new Map();
  let shuttingDown = false;

  /**
   * Serialize every mutating command for a Build. The autonomous loop shares
   * this gate with surface commands, so two clients cannot race Build state.
   */
  function exclusive(buildId, operation) {
    const key = buildId || "__global__";
    const previous = mutations.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    mutations.set(key, next);
    return next.finally(() => {
      if (mutations.get(key) === next) mutations.delete(key);
    });
  }

  function shouldAutoRun(build) {
    return (
      !build?.pendingRestore &&
      build?.loop?.status === "running" &&
      build?.coordinator?.autoRun !== false
    );
  }

  function ensureLoop(buildId) {
    if (shuttingDown || loops.has(buildId)) {
      return { ok: true, running: loops.has(buildId), deduped: true };
    }
    const build = readBuildRecord(runtimeRoot, buildId);
    if (!shouldAutoRun(build)) {
      return { ok: true, running: false, reason: "auto_run_disabled_or_terminal" };
    }
    const startedAt = new Date().toISOString();
    if (!identityAnnounced.has(buildId)) {
      identityAnnounced.add(buildId);
      appendBuildEvent(runtimeRoot, buildId, "coordinator.identity", {
        ...codeIdentity,
        gateway: gatewayHandle?.hello?.identity || null,
      });
    }
    const promise = exclusive(buildId, () =>
      controller.runUntilDone(buildId, {
        // Release the per-Build mutation gate between cognitive children so
        // queued product controls can update durable state without racing.
        maxSteps: 1,
        syncRuntime: runtimeSync.sync,
      }),
    )
      .then(async (result) => {
        const last = Array.isArray(result?.steps)
          ? result.steps[result.steps.length - 1]
          : null;
        const waitTaskId = last?.taskId || result?.taskId;
        if (
          !fakeMode &&
          waitTaskId &&
          (last?.action === "await_active_child" ||
            result?.action === "await_active_child") &&
          typeof gateway.awaitTask === "function"
        ) {
          try {
            await gateway.awaitTask(waitTaskId, 120_000);
          } catch {
            /* bounded wait — next loop reconciles */
          }
        }
        return result;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        const failed = readBuildRecord(runtimeRoot, buildId);
        if (failed) {
          failed.loop.status = "blocked";
          failed.loop.blockedReason = `Coordinator error: ${message}`;
          failed.loop.lastControlError = {
            operation: "autonomous_loop",
            message,
            at: new Date().toISOString(),
          };
          writeBuildRecord(runtimeRoot, failed);
        }
        appendBuildEvent(runtimeRoot, buildId, "coordinator.error", { message });
        return { ok: false, message };
      })
      .finally(() => {
        const current = loops.get(buildId);
        if (current?.promise === promise) loops.delete(buildId);
        const latest = readBuildRecord(runtimeRoot, buildId);
        if (!shuttingDown && shouldAutoRun(latest)) {
          const timer = setTimeout(() => ensureLoop(buildId), 250);
          timer.unref?.();
        }
      });
    loops.set(buildId, { promise, startedAt });
    return { ok: true, running: true, startedAt };
  }

  async function interruptActive(buildId, operation, text = "") {
    const record = readBuildRecord(runtimeRoot, buildId);
    const active = [...(record?.children || [])]
      .reverse()
      .find(
        (child) =>
          (child.dispatchState === "selected" ||
            child.dispatchState === "dispatched") &&
          (operation !== "steer" || child.kind === "engineer"),
      );
    if (!active) return;
    try {
      if (operation === "cancel" && typeof gateway.cancelTask === "function") {
        await gateway.cancelTask(active.taskId);
      } else if (
        operation === "steer" &&
        typeof gateway.steerTask === "function"
      ) {
        await gateway.steerTask(active.taskId, text);
      }
    } catch {
      // The serialized controller operation reconciles terminal/restarted
      // task truth after this best-effort low-latency interrupt.
    }
  }

  async function reconcileStartup() {
    const recovered = [];
    for (const original of listBuildRecords(runtimeRoot)) {
      let build = original;
      if (build?.deployments?.pendingOperation) recovered.push({ buildId: build.buildId,
        deployment: recoverDeploymentFoundation(build) });
      if (build?.pendingRestore) {
        const restore = await exclusive(build.buildId, () => controller.recoverPendingHistoricalRestore(build.buildId));
        recovered.push({ buildId: build.buildId, restore });
        if (!restore.ok) continue;
        build = readBuildRecord(runtimeRoot, build.buildId);
      }
      if (build?.archivedAt) {
        recovered.push({
          buildId: build.buildId,
          ok: true,
          skipped: "archived",
          replayed: false,
        });
        continue;
      }
      // An already-adopted product is shown from its authoritative SHA.
      // Historical children are not replayed, and its runtime is started
      // only when that project is opened.
      if (build?.loop?.status === "complete" && build.authoritativeSha) {
        recovered.push({
          buildId: build.buildId,
          ok: true,
          skipped: "authoritative_product",
          replayed: false,
        });
        continue;
      }
      try {
        const result = await exclusive(build.buildId, () =>
          controller.recover(build.buildId),
        );
        recovered.push({
          buildId: build.buildId,
          ok: result?.ok !== false,
          decisions: result?.decisions || [],
          replayed: true,
        });
        const previousUpdatedAt = Date.parse(build?.updatedAt || "");
        const recentlyActive =
          Number.isFinite(previousUpdatedAt) &&
          Date.now() - previousUpdatedAt < 10 * 60_000;
        const current = readBuildRecord(runtimeRoot, build.buildId);
        if (shouldAutoRun(current) && (fakeMode || recentlyActive)) {
          ensureLoop(build.buildId);
        }
      } catch (error) {
        recovered.push({
          buildId: build.buildId,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return recovered;
  }

  async function runtimeState(buildId) {
    const build = readBuildRecord(runtimeRoot, buildId);
    if (!build) return { ok: false, code: "BUILD_NOT_FOUND" };
    if (build.pendingRestore) return { ok: false, code: "RESTORE_PENDING" };
    const binding = build.projectBindings?.[0];
    const inspected = await runtimeManager.inspect(buildId);
    return {
      ok: true,
      runtime: inspected.runtime,
      preview: runtimeManager.getPreviewDescriptor(buildId),
      artifact: binding?.projectRoot
        ? detectBuildArtifact(binding.projectRoot, {
            outcomeHint: build.intent?.outcome,
          })
        : null,
    };
  }

  function productionOperation(buildId, operationId, deploymentId) {
    const record = readBuildRecord(runtimeRoot, buildId);
    const authority = record?.deployments;
    const op = authority?.pendingOperation;
    const deployment = op && authority.deployments.find((item) => item.deploymentId === op.deploymentId);
    if (!record || !op || op.kind !== "deploy" || op.operationId !== operationId ||
        (deploymentId && op.deploymentId !== deploymentId) || !deployment || deployment.target !== "production" ||
        op.snapshot?.target !== "production") return { ok: false, code: "DEPLOY_OPERATION_NOT_FOUND" };
    return { ok: true, record, op, deployment, revision: authority.revision };
  }

  async function productionWrite(buildId, operationId, deploymentId, expectedRevision, transition) {
    return exclusive(buildId, () => {
      const current = productionOperation(buildId, operationId, deploymentId);
      if (!current.ok) return current;
      if (current.revision !== expectedRevision) return { ok: false, code: "DEPLOY_REVISION_STALE" };
      const snapshot = validateOperationSnapshot(runtimeRoot, buildId, operationId);
      if (!snapshot.ok) return snapshot;
      const result = transitionProductionDeploymentOperation(current.record, transition);
      if (!result.ok) return result;
      writeBuildRecord(runtimeRoot, result.record);
      try { appendBuildEvent(runtimeRoot, buildId, "production_deployment.transition", {
        operationId, deploymentId, state: transition.state, revision: result.revision }); } catch { /* record is authority */ }
      return { ok: true, revision: result.revision, state: transition.state };
    });
  }

  async function productionProjectIdentity(snapshot) {
    const authSpec = makeProductionAuthCommand({ teamRef: snapshot.teamRef });
    const auth = await runProductionCommand(authSpec, { cwd: packageRoot, mode: "production_auth",
      context: { teamRef: snapshot.teamRef } });
    if (!auth.ok) return { ok: false, code: auth.code || "PROVIDER_AUTH_REQUIRED" };
    const projectSpec = makeProductionProjectCommand({ projectRef: snapshot.projectRef, teamRef: snapshot.teamRef });
    const project = await runProductionCommand(projectSpec, { cwd: packageRoot, mode: "production_project",
      context: { projectRef: snapshot.projectRef, teamRef: snapshot.teamRef } });
    return project.ok ? project : { ok: false, code: project.code || "PROVIDER_PROJECT_UNVERIFIED" };
  }

  async function submitProductionDeployment(buildId, params) {
    const initial = await exclusive(buildId, () => {
      const found = productionOperation(buildId, params.operationId, params.deploymentId);
      if (!found.ok) return found;
      if (found.revision !== params.expectedRevision) return { ok: false, code: "DEPLOY_REVISION_STALE" };
      if (! ["prepared", "config_projection_incomplete"].includes(found.op.state)) return { ok: false, code: "DEPLOY_TRANSITION_INVALID" };
      if (found.op.configProjectionAttempt) return { ok: false, code: "PROVIDER_CONFIG_OUTCOME_UNKNOWN" };
      const snapshot = validateOperationSnapshot(runtimeRoot, buildId, params.operationId);
      return snapshot.ok ? { ok: true, ...found } : snapshot;
    });
    if (!initial.ok) return initial;

    const projectIdentity = await productionProjectIdentity(initial.op.snapshot);
    if (!projectIdentity.ok) return projectIdentity;

    // P9 Config comparison and any Config-only projection happen after durable intent and outside the lock.
    const metadataSpec = makeProductionConfigMetadataCommand({ projectRef: initial.op.snapshot.projectRef, teamRef: initial.op.snapshot.teamRef });
    const metadata = await runProductionCommand(metadataSpec, { cwd: packageRoot, mode: "production_config_metadata",
      context: { projectRef: initial.op.snapshot.projectRef, teamRef: initial.op.snapshot.teamRef } });
    if (!metadata.ok) return { ok: false, code: metadata.code || "PROVIDER_METADATA_UNSAFE" };
    const plan = planVercelConfigProjection({ config: initial.op.snapshot.configSnapshot, metadata, target: "production" });
    if (!plan.ok) return plan;
    for (const action of plan.actions) {
      const current = productionOperation(buildId, params.operationId, params.deploymentId);
      if (!current.ok) return current;
      if (current.op.configProjectionAttempt) return { ok: false, code: "PROVIDER_CONFIG_OUTCOME_UNKNOWN" };
      if (!current.op.configReceipts.some((receipt) => receipt.variableName === action.variableName)) {
        const item = current.op.snapshot.configSnapshot.find((row) => row.variableName === action.variableName);
        const spec = makeProductionConfigCommand({ ...action, variableName: action.variableName,
          value: item?.value, projectRef: current.op.snapshot.projectRef, teamRef: current.op.snapshot.teamRef });
        const attempt = await exclusive(buildId, () => {
          const latest = productionOperation(buildId, params.operationId, params.deploymentId);
          if (!latest.ok) return latest;
          const authorityCheck = validateOperationSnapshot(runtimeRoot, buildId, params.operationId);
          if (!authorityCheck.ok) return authorityCheck;
          if (latest.op.configProjectionAttempt) return { ok: false, code: "PROVIDER_CONFIG_OUTCOME_UNKNOWN" };
          const transition = transitionProductionDeploymentOperation(latest.record, {
            operationId: params.operationId, deploymentId: params.deploymentId, state: "config_attempt",
            variableName: action.variableName, configOperation: action.operation });
          if (!transition.ok) return transition;
          writeBuildRecord(runtimeRoot, transition.record);
          return { ok: true };
        });
        if (!attempt.ok) return attempt;
        let written;
        try {
          written = await runProductionCommand(spec, { cwd: packageRoot, mode: "production_config_write",
            context: { operation: action.operation, variableName: action.variableName,
              projectRef: current.op.snapshot.projectRef, teamRef: current.op.snapshot.teamRef } });
        } catch { written = { ok: false, code: "PROVIDER_CONFIG_OUTCOME_UNKNOWN" }; }
        if (!written.ok) {
          const uncertain = await exclusive(buildId, () => {
            const latest = productionOperation(buildId, params.operationId, params.deploymentId);
            if (!latest.ok) return latest;
            const transition = transitionProductionDeploymentOperation(latest.record, {
              operationId: params.operationId, deploymentId: params.deploymentId, state: "config_uncertain",
              variableName: action.variableName });
            if (!transition.ok) return transition;
            writeBuildRecord(runtimeRoot, transition.record);
            return { ok: true, revision: transition.revision };
          });
          return uncertain.ok ? { ok: false, code: "PROVIDER_CONFIG_OUTCOME_UNKNOWN", state: "config_projection_incomplete" } : uncertain;
        }
        const receipt = await exclusive(buildId, () => {
          const latest = productionOperation(buildId, params.operationId, params.deploymentId);
          if (!latest.ok) return latest;
          const authorityCheck = validateOperationSnapshot(runtimeRoot, buildId, params.operationId);
          if (!authorityCheck.ok) return authorityCheck;
          const transition = transitionProductionDeploymentOperation(latest.record, {
            operationId: params.operationId, deploymentId: params.deploymentId,
            state: "config_receipt", variableName: action.variableName });
          if (!transition.ok) return transition;
          writeBuildRecord(runtimeRoot, transition.record);
          return { ok: true, revision: transition.revision };
        });
        if (!receipt.ok) return receipt;
      }
    }

    const source = prepareDeploymentSource({ runtimeRoot, buildId });
    if (!source.ok) return source;
    const latestBeforeBoundary = productionOperation(buildId, params.operationId, params.deploymentId);
    if (!latestBeforeBoundary.ok || source.authoritativeSha !== latestBeforeBoundary.op.snapshot.sourceSha ||
        source.treeSha !== latestBeforeBoundary.op.snapshot.treeSha) {
      cleanupDeploymentSource({ runtimeRoot, workspace: source.workspace });
      return { ok: false, code: "DEPLOY_SOURCE_STALE" };
    }
    const submitting = await exclusive(buildId, () => {
      const latest = productionOperation(buildId, params.operationId, params.deploymentId);
      if (!latest.ok) return latest;
      const authorityCheck = validateOperationSnapshot(runtimeRoot, buildId, params.operationId);
      if (!authorityCheck.ok) return authorityCheck;
      const transition = transitionProductionDeploymentOperation(latest.record, {
        operationId: params.operationId, deploymentId: params.deploymentId, state: "submitting" });
      if (!transition.ok) return transition;
      writeBuildRecord(runtimeRoot, transition.record);
      return { ok: true, revision: transition.revision, snapshot: latest.op.snapshot };
    });
    if (!submitting.ok) { cleanupDeploymentSource({ runtimeRoot, workspace: source.workspace }); return submitting; }

    let outcome;
    try {
      const spec = makeProductionDeployCommand({ projectRef: submitting.snapshot.projectRef,
        teamRef: submitting.snapshot.teamRef, operationId: params.operationId, buildId });
      outcome = await runProductionCommand(spec, { cwd: source.workspace, mode: "production_deploy_receipt",
        context: { projectRef: submitting.snapshot.projectRef, teamRef: submitting.snapshot.teamRef,
          operationId: params.operationId, buildId } });
    } finally { cleanupDeploymentSource({ runtimeRoot, workspace: source.workspace }); }
    return exclusive(buildId, () => {
      const latest = productionOperation(buildId, params.operationId, params.deploymentId);
      if (!latest.ok || latest.op.state !== "submitting") return latest.ok ? { ok: false, code: "DEPLOY_OPERATION_STALE" } : latest;
      const authorityCheck = validateOperationSnapshot(runtimeRoot, buildId, params.operationId);
      if (!authorityCheck.ok) return authorityCheck;
      const transition = outcome.ok
        ? transitionProductionDeploymentOperation(latest.record, { operationId: params.operationId,
            deploymentId: params.deploymentId, state: "submitted", providerDeploymentId: outcome.providerDeploymentId,
            providerUrl: outcome.url, providerState: outcome.providerState || "INITIALIZING" })
        : transitionProductionDeploymentOperation(latest.record, {
              operationId: params.operationId,
              deploymentId: params.deploymentId, state: "uncertain" });
      if (!transition.ok) return transition;
      writeBuildRecord(runtimeRoot, transition.record);
      return outcome.ok ? { ok: true, revision: transition.revision, providerDeploymentId: outcome.providerDeploymentId,
        providerUrl: outcome.url, providerState: outcome.providerState || "INITIALIZING" } :
        { ok: false, code: outcome.code || "PROVIDER_SUBMISSION_OUTCOME_UNKNOWN", state: transition.record.deployments.pendingOperation?.state || "failed" };
    });
  }

  async function reconcileProduction(buildId, params) {
    const initial = productionOperation(buildId, params.operationId, params.deploymentId);
    if (!initial.ok) return initial;
    if (! ["uncertain", "submitting"].includes(initial.op.state)) return { ok: false, code: "DEPLOY_TRANSITION_INVALID" };
    const snapshot = validateOperationSnapshot(runtimeRoot, buildId, params.operationId);
    if (!snapshot.ok) return snapshot;
    const projectIdentity = await productionProjectIdentity(initial.op.snapshot);
    if (!projectIdentity.ok) return { ok: false, outcome: "PROVIDER_RECONCILE_INCOMPLETE" };
    const context = { projectRef: initial.op.snapshot.projectRef, projectName: projectIdentity.projectName,
      teamRef: initial.op.snapshot.teamRef, operationId: params.operationId, buildId,
      windowStart: initial.op.reconciliationWindow?.windowStart, windowEnd: initial.op.reconciliationWindow?.windowEnd };
    const result = await reconcileProductionDeployment(context, {
      executePage: (spec, pageContext) => runProductionCommand(spec, { cwd: packageRoot,
        mode: "production_reconcile_page", context: { ...pageContext, projectName: context.projectName } }),
      executeIdentity: (spec, identityContext) => runProductionCommand(spec, { cwd: packageRoot,
        mode: "production_identity_inspect", context: { ...identityContext, teamRef: context.teamRef } }),
    });
    if (!result.ok || result.outcome !== "UNIQUE_FACTUAL_MATCH") return result;
    const current = productionOperation(buildId, params.operationId, params.deploymentId);
    if (!current.ok || current.op.state !== initial.op.state) return { ok: false, code: "DEPLOY_OPERATION_STALE" };
    const authorityCheck = validateOperationSnapshot(runtimeRoot, buildId, params.operationId);
    if (!authorityCheck.ok) return authorityCheck;
    const transition = await productionWrite(buildId, params.operationId, params.deploymentId, current.revision, {
      operationId: params.operationId, deploymentId: params.deploymentId, state: "submitted",
      providerDeploymentId: result.match.providerDeploymentId, providerUrl: result.match.url,
      providerState: result.match.providerState });
    return transition.ok ? { ...result, revision: transition.revision } : transition;
  }

  async function observeProduction(buildId, params) {
    const initial = productionOperation(buildId, params.operationId, params.deploymentId);
    if (!initial.ok) return initial;
    if (initial.op.state !== "submitted" || !initial.op.providerDeploymentId) return { ok: false, code: "DEPLOY_TRANSITION_INVALID" };
    const snapshot = validateOperationSnapshot(runtimeRoot, buildId, params.operationId);
    if (!snapshot.ok) return snapshot;
    const projectIdentity = await productionProjectIdentity(initial.op.snapshot);
    if (!projectIdentity.ok) return projectIdentity;
    const spec = makeProductionInspectCommand({ providerDeploymentId: initial.op.providerDeploymentId, teamRef: initial.op.snapshot.teamRef });
    const observation = await runProductionCommand(spec, { cwd: packageRoot, mode: "production_status",
      context: { providerDeploymentId: initial.op.providerDeploymentId, teamRef: initial.op.snapshot.teamRef,
        projectName: projectIdentity.projectName,
        url: initial.deployment.providerUrl } });
    if (!observation.ok || observation.url !== initial.deployment.providerUrl || observation.target !== "production")
      return { ok: false, code: observation.code || "PROVIDER_STATUS_CONTRADICTION" };
    const latest = productionOperation(buildId, params.operationId, params.deploymentId);
    if (!latest.ok || latest.revision !== initial.revision || latest.op.state !== "submitted") return { ok: false, code: "DEPLOY_REVISION_STALE" };
    const result = await productionWrite(buildId, params.operationId, params.deploymentId, latest.revision, {
      operationId: params.operationId, deploymentId: params.deploymentId, state: "provider_observation",
      providerDeploymentId: observation.providerDeploymentId, providerUrl: observation.url,
      providerState: observation.providerState });
    if (!result.ok) return result;
    if (["ERROR", "CANCELED"].includes(observation.providerState)) {
      const failed = productionOperation(buildId, params.operationId, params.deploymentId);
      return productionWrite(buildId, params.operationId, params.deploymentId, failed.revision, {
        operationId: params.operationId, deploymentId: params.deploymentId, state: "failed",
        failureCode: "PROVIDER_BUILD_FAILED" });
    }
    if (observation.providerState !== "READY") return { ok: true, ...observation, revision: result.revision, confirmed: false };
    const after = productionOperation(buildId, params.operationId, params.deploymentId);
    return productionWrite(buildId, params.operationId, params.deploymentId, after.revision, {
      operationId: params.operationId, deploymentId: params.deploymentId, state: "confirmed",
      providerDeploymentId: observation.providerDeploymentId });
  }

  function releaseContext(buildId, operationId, deploymentId = null) {
    const record = readBuildRecord(runtimeRoot, buildId);
    const authority = record?.deployments;
    const op = authority?.pendingOperation;
    const deployment = op && authority.deployments.find((item) => item.deploymentId === op.deploymentId);
    if (!record || !op || !["publish", "rollback", "reestablish"].includes(op.kind) ||
        op.operationId !== operationId || (deploymentId && op.deploymentId !== deploymentId) || !deployment)
      return { ok: false, code: "RELEASE_OPERATION_NOT_FOUND" };
    const mapping = authority.mappings.find((item) => item.mappingId === op.mappingId &&
      item.provider === op.provider && item.environmentId === op.environmentId &&
      item.teamRef === op.teamRef && item.projectRef === op.projectRef && item.targetRef === "production");
    if (!mapping || deployment.target !== "production" || deployment.provider !== op.provider ||
        deployment.providerDeploymentId !== op.targetProviderDeploymentId || deployment.mappingId !== op.mappingId ||
        deployment.teamRef !== op.teamRef || deployment.projectRef !== op.projectRef ||
        deployment.sourceSha !== op.sourceSha || deployment.treeSha !== op.treeSha ||
        deployment.environmentId !== op.environmentId || deployment.environmentRevision !== op.environmentRevision)
      return { ok: false, code: "RELEASE_AUTHORITY_STALE" };
    return { ok: true, record, authority, op, deployment, mapping, revision: authority.revision };
  }

  async function readProductionServing(mapping) {
    const project = await productionProjectIdentity({ projectRef: mapping.projectRef, teamRef: mapping.teamRef });
    if (!project.ok || !project.projectName) return { ok: false, code: project.code || "PROVIDER_PROJECT_UNVERIFIED" };
    return observeProductionServing({ teamRef: mapping.teamRef, projectRef: mapping.projectRef,
      projectName: project.projectName, executeAliases: (spec, context) => runReleaseCommand(spec, {
        cwd: packageRoot, mode: "release_aliases", context: { teamRef: mapping.teamRef, nextCursor: context.nextCursor } }),
      executeInspect: (spec, context) => runReleaseCommand(spec, { cwd: packageRoot, mode: "release_inspect",
        context: { providerDeploymentId: context.providerDeploymentId, projectName: project.projectName,
          projectRef: mapping.projectRef, teamRef: mapping.teamRef } }) });
  }

  async function prepareRelease(buildId, params) {
    if (Object.keys(params).some((key) => !["buildId", "action", "deploymentId", "expectedRevision"].includes(key)) ||
        !["publish", "rollback", "reestablish"].includes(params.action) || !Number.isSafeInteger(params.expectedRevision))
      return { ok: false, code: "RELEASE_REQUEST_INVALID" };
    return exclusive(buildId, () => {
      if (scopedControlPlane) return { ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" };
      const record = readBuildRecord(runtimeRoot, buildId);
      if (!record || record.buildId !== buildId) return { ok: false, code: "BUILD_NOT_FOUND" };
      const result = prepareReleaseOperation(record, params);
      if (!result.ok) return result;
      writeBuildRecord(runtimeRoot, result.record);
      try { appendBuildEvent(runtimeRoot, buildId, "release.prepared", {
        operationId: result.operationId, action: params.action, deploymentId: params.deploymentId,
        revision: result.revision }); } catch { /* canonical record is authority */ }
      return { ok: true, operationId: result.operationId, action: params.action,
        deploymentId: params.deploymentId, revision: result.revision };
    });
  }

  async function observeRelease(buildId, params) {
    if (Object.keys(params).some((key) => !["buildId", "operationId", "deploymentId"].includes(key)))
      return { ok: false, code: "RELEASE_REQUEST_INVALID" };
    if (scopedControlPlane) return { ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" };
    const initialRecord = readBuildRecord(runtimeRoot, buildId);
    if (!initialRecord || initialRecord.buildId !== buildId) return { ok: false, code: "BUILD_NOT_FOUND" };
    const pending = initialRecord.deployments?.pendingOperation;
    if (pending && (!params.operationId || pending.operationId !== params.operationId ||
        !["publish", "rollback", "reestablish"].includes(pending.kind))) return { ok: false, code: "RELEASE_OPERATION_PENDING" };
    const operationId = params.operationId ?? null;
    const found = operationId ? releaseContext(buildId, operationId, params.deploymentId ?? null) : null;
    if (operationId && !found.ok) return found;
    const mapping = found?.mapping ?? initialRecord.deployments?.mappings.find((item) =>
      item.mappingId === initialRecord.deployments?.deployments.find((d) => d.deploymentId ===
        initialRecord.deployments?.releases.find((r) => r.releaseId === initialRecord.deployments.currentProductionReleaseId)?.deploymentId)?.mappingId) ??
      (initialRecord.deployments?.mappings.filter((item) => item.provider === "vercel" && item.targetRef === "production").length === 1
        ? initialRecord.deployments.mappings.find((item) => item.provider === "vercel" && item.targetRef === "production") : null);
    if (!mapping || mapping.targetRef !== "production") return { ok: false, code: "DEPLOY_MAPPING_STALE" };
    const observed = await readProductionServing(mapping);
    const latest = readBuildRecord(runtimeRoot, buildId);
    if (!latest || latest.deployments?.revision !== initialRecord.deployments?.revision)
      return { ok: false, code: "RELEASE_AUTHORITY_STALE" };
    let servingResult = reconcileServing(latest, observed.ok && observed.providerDeploymentId ? { ...observed, ok: true } : null);
    if (!servingResult.ok) return servingResult;
    const stored = await exclusive(buildId, () => {
      const current = readBuildRecord(runtimeRoot, buildId);
      if (!current || current.deployments?.revision !== initialRecord.deployments?.revision)
        return { ok: false, code: "RELEASE_AUTHORITY_STALE" };
      // The pure reduction is re-run against the locked canonical reread.
      const reduced = reconcileServing(current, observed.ok && observed.providerDeploymentId ? observed : null);
      if (!reduced.ok) return reduced;
      writeBuildRecord(runtimeRoot, reduced.record);
      try { appendBuildEvent(runtimeRoot, buildId, "release.serving_observed", {
        providerDeploymentId: observed.ok ? observed.providerDeploymentId : null,
        state: reduced.serving.state, revision: reduced.revision }); } catch { /* canonical record is authority */ }
      return { ok: true, record: reduced.record, revision: reduced.revision, serving: reduced.serving };
    });
    if (!stored.ok) return stored;
    if (!operationId) return { ok: true, revision: stored.revision, serving: stored.serving };
    const current = releaseContext(buildId, operationId, params.deploymentId ?? null);
    if (!current.ok) return current;
    if (observed.ok && observed.state === "observed" && observed.providerDeploymentId === current.op.targetProviderDeploymentId) {
      if (current.op.state !== "verifying") {
        const verifying = await exclusive(buildId, () => {
          const reread = releaseContext(buildId, operationId, current.op.deploymentId);
          if (!reread.ok || reread.revision !== current.revision) return { ok: false, code: "RELEASE_AUTHORITY_STALE" };
          const transition = transitionReleaseOperation(reread.record, { operationId, deploymentId: current.op.deploymentId,
            state: "verifying", effectAccepted: true });
          if (!transition.ok) return transition;
          writeBuildRecord(runtimeRoot, transition.record);
          return { ok: true, revision: transition.revision };
        });
        if (!verifying.ok) return verifying;
      }
      return exclusive(buildId, () => {
        const reread = releaseContext(buildId, operationId, current.op.deploymentId);
        if (!reread.ok || reread.op.expectedCurrentReleaseId !== reread.authority.currentProductionReleaseId)
          return { ok: false, code: "RELEASE_AUTHORITY_STALE" };
        const result = finalizeReleaseOperation(reread.record, { operationId, deploymentId: current.op.deploymentId,
          action: current.op.kind, expectedCurrentReleaseId: reread.op.expectedCurrentReleaseId, safeObservation: observed });
        if (!result.ok) return result;
        writeBuildRecord(runtimeRoot, result.record);
        try { appendBuildEvent(runtimeRoot, buildId, "release.completed", { operationId, action: current.op.kind,
          releaseId: result.releaseId, revision: result.revision }); } catch { /* canonical record is authority */ }
        return { ok: true, outcome: "FINALIZED", action: current.op.kind,
          releaseId: result.releaseId, revision: result.revision, serving: result.record.deployments.serving };
      });
    }
    const latestOp = releaseContext(buildId, operationId, params.deploymentId ?? null);
    if (latestOp.ok && !["safe_stop", "failed"].includes(latestOp.op.state)) {
      const failureCode = observed.ok ? "SERVING_TARGET_MISMATCH" : "SERVING_OBSERVATION_UNKNOWN";
      await exclusive(buildId, () => {
        const reread = releaseContext(buildId, operationId, latestOp.op.deploymentId);
        if (!reread.ok) return reread;
        const transition = transitionReleaseOperation(reread.record, { operationId,
          deploymentId: latestOp.op.deploymentId, state: "safe_stop", failureCode });
        if (!transition.ok) return transition;
        writeBuildRecord(runtimeRoot, transition.record);
        return { ok: true, revision: transition.revision };
      });
    }
    return { ok: false, outcome: observed.ok ? "PROVIDER_SERVING_DRIFT" : "PROVIDER_SERVING_UNKNOWN",
      code: observed.code || (observed.ok ? "SERVING_TARGET_MISMATCH" : "SERVING_OBSERVATION_UNKNOWN"),
      revision: stored.revision, serving: stored.serving };
  }

  async function executeRelease(buildId, params) {
    if (Object.keys(params).some((key) => !["buildId", "operationId", "deploymentId", "expectedRevision"].includes(key)) ||
        !Number.isSafeInteger(params.expectedRevision)) return { ok: false, code: "RELEASE_REQUEST_INVALID" };
    if (scopedControlPlane) return { ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" };
    const started = await exclusive(buildId, () => {
      const found = releaseContext(buildId, params.operationId, params.deploymentId);
      if (!found.ok) return found;
      if (found.revision !== params.expectedRevision) return { ok: false, code: "DEPLOY_REVISION_STALE" };
      if (found.op.state !== "prepared") return { ok: false, code: "RELEASE_EFFECT_ALREADY_ATTEMPTED" };
      const transition = transitionReleaseOperation(found.record, { operationId: params.operationId,
        deploymentId: params.deploymentId, state: "switching" });
      if (!transition.ok) return transition;
      writeBuildRecord(runtimeRoot, transition.record);
      return { ok: true, revision: transition.revision, op: transition.record.deployments.pendingOperation };
    });
    if (!started.ok) return started;
    const projectIdentity = await productionProjectIdentity(started.op);
    const inspectSpec = makeProductionReleaseInspectCommand({ providerDeploymentId: started.op.targetProviderDeploymentId,
      teamRef: started.op.teamRef });
    const preflight = projectIdentity.ok && inspectSpec.ok ? await runReleaseCommand(inspectSpec, { cwd: packageRoot,
      mode: "release_inspect", context: { providerDeploymentId: started.op.targetProviderDeploymentId,
        projectName: projectIdentity.projectName, projectRef: started.op.projectRef, teamRef: started.op.teamRef } }) :
      { ok: false, code: projectIdentity.code || inspectSpec.code };
    if (!preflight.ok || preflight.providerDeploymentId !== started.op.targetProviderDeploymentId ||
        preflight.projectRef !== started.op.projectRef || preflight.target !== "production" || preflight.providerState !== "READY") {
      return exclusive(buildId, () => {
        const current = releaseContext(buildId, params.operationId, params.deploymentId);
        if (!current.ok) return current;
        const failed = transitionReleaseOperation(current.record, { operationId: params.operationId,
          deploymentId: params.deploymentId, state: "failed", failureCode: preflight.code || "RELEASE_TARGET_INELIGIBLE" });
        if (!failed.ok) return failed;
        writeBuildRecord(runtimeRoot, failed.record);
        return { ok: false, code: "RELEASE_TARGET_INELIGIBLE" };
      });
    }
    const preEffect = await exclusive(buildId, () => {
      const current = releaseContext(buildId, params.operationId, params.deploymentId);
      if (!current.ok || current.revision !== started.revision || current.op.state !== "switching" ||
          current.authority.currentProductionReleaseId !== current.op.expectedCurrentReleaseId)
        return { ok: false, code: "RELEASE_AUTHORITY_STALE" };
      return { ok: true, revision: current.revision };
    });
    if (!preEffect.ok) return preEffect;
    const spec = makeProductionServingEffectCommand({ action: started.op.kind,
      providerDeploymentId: started.op.targetProviderDeploymentId, teamRef: started.op.teamRef });
    const effect = spec.ok ? await runReleaseCommand(spec, { cwd: packageRoot, mode: "release_effect",
      context: { action: started.op.kind, providerDeploymentId: started.op.targetProviderDeploymentId,
        teamRef: started.op.teamRef } }) : spec;
    const nextState = effect.ok && effect.accepted === true ? "verifying" : "uncertain";
    const recorded = await exclusive(buildId, () => {
      const current = releaseContext(buildId, params.operationId, params.deploymentId);
      if (!current.ok || current.op.state !== "switching") return { ok: false, code: "RELEASE_AUTHORITY_STALE" };
      const transition = transitionReleaseOperation(current.record, nextState === "verifying" ? {
        operationId: params.operationId, deploymentId: params.deploymentId, state: "verifying", effectAccepted: true } : {
        operationId: params.operationId, deploymentId: params.deploymentId, state: "uncertain",
        failureCode: effect.code || "RELEASE_EFFECT_UNCERTAIN" });
      if (!transition.ok) return transition;
      writeBuildRecord(runtimeRoot, transition.record);
      return { ok: true, revision: transition.revision, state: nextState };
    });
    if (!recorded.ok) return recorded;
    return observeRelease(buildId, { operationId: params.operationId, deploymentId: params.deploymentId });
  }

  async function dispatch(method, params = {}) {
    const buildId = String(params.buildId || "");
    if (scopedControlPlane && method !== BuildCoordinatorMethods.HELLO &&
        (buildId !== scopedBuildId || !new Set([
          BuildCoordinatorMethods.BUILD_ENVIRONMENTS_LIST,
          BuildCoordinatorMethods.BUILD_ENVIRONMENT_READ,
          BuildCoordinatorMethods.BUILD_ENVIRONMENT_MUTATE,
          BuildCoordinatorMethods.BUILD_DEPLOYMENTS_LIST,
          BuildCoordinatorMethods.BUILD_DEPLOYMENT_MAPPING_MUTATE,
          BuildCoordinatorMethods.BUILD_DEPLOYMENT_PREPARE,
          BuildCoordinatorMethods.BUILD_DEPLOYMENT_TRANSITION,
        ]).has(method))) return { ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" };
    switch (method) {
      case BuildCoordinatorMethods.HELLO:
        return {
          ok: true,
          protocolVersion: BUILD_COORDINATOR_PROTOCOL_VERSION,
          packageVersion: readPathPackageVersion(packageRoot),
          pid: process.pid,
          role: "path-build-coordinator",
          fakeMode,
          identity: codeIdentity,
          gatewayIdentity: gatewayHandle?.hello?.identity || null,
          gatewayPid: gatewayHandle?.hello?.identity?.pid ?? null,
        };
      case BuildCoordinatorMethods.STATUS:
        return {
          ok: true,
          pid: process.pid,
          loops: [...loops.entries()].map(([id, loop]) => ({
            buildId: id,
            startedAt: loop.startedAt,
          })),
        };
      case BuildCoordinatorMethods.BUILD_START:
        return exclusive("__start__", async () => {
          const result = await controller.startBuild(
            String(params.outcome || ""),
            params.options || {},
          );
          if (!result.ok) return result;
          const record = readBuildRecord(runtimeRoot, result.build.buildId);
          record.coordinator = {
            autoRun: params.options?.autoRun !== false,
            owner: "path-build-coordinator",
          };
          writeBuildRecord(runtimeRoot, record);
          if (record.coordinator.autoRun) ensureLoop(record.buildId);
          return { ...result, build: readBuildRecord(runtimeRoot, record.buildId) };
        });
      case BuildCoordinatorMethods.BUILD_GET:
        return { ok: true, build: readBuildRecord(runtimeRoot, buildId) };
      case BuildCoordinatorMethods.BUILD_LIST:
        return { ok: true, builds: listBuildRecords(runtimeRoot) };
      case BuildCoordinatorMethods.BUILD_LATEST:
        return { ok: true, build: findLatestActiveBuild(runtimeRoot) };
      case BuildCoordinatorMethods.BUILD_EVENTS:
        return {
          ok: true,
          events: readBuildEvents(runtimeRoot, buildId, {
            afterId: params.afterId,
            limit: params.limit,
          }),
        };
      case BuildCoordinatorMethods.BUILD_ENVIRONMENTS_LIST:
        return listBuildEnvironments(runtimeRoot, buildId);
      case BuildCoordinatorMethods.BUILD_DEPLOYMENTS_LIST:
        return listBuildDeployments(runtimeRoot, buildId);
      case BuildCoordinatorMethods.BUILD_DEPLOYMENT_PREFLIGHT:
        if (Object.keys(params).some((key) => !["buildId", "environmentId"].includes(key))) return { ok: false, code: "DEPLOY_REQUEST_INVALID" };
        return preflightDeployment(runtimeRoot, buildId, params.environmentId);
      case BuildCoordinatorMethods.BUILD_DEPLOYMENT_MAPPING_MUTATE:
        return exclusive(buildId, () => {
          const { buildId: _buildId, ...request } = params;
          const result = prepareDeploymentMappingMutation(runtimeRoot, buildId, request);
          if (!result.ok) return result;
          writeBuildRecord(runtimeRoot, result.record);
          try { appendBuildEvent(runtimeRoot, buildId, "deployment.mapping_mutated", {
            revision: result.revision, environmentId: request.environmentId, action: request.action }); } catch { /* Build record is authority. */ }
          const { record: _record, ...safe } = result;
          return safe;
        });
      case BuildCoordinatorMethods.BUILD_DEPLOYMENT_PREPARE:
        return exclusive(buildId, () => {
          const { buildId: _buildId, ...request } = params;
          const result = prepareDeploymentOperation(runtimeRoot, buildId, request);
          if (!result.ok) return result;
          if (result.record.deployments.deployments.at(-1)?.target !== "preview") {
            return { ok: false, code: "DEPLOY_TARGET_FORBIDDEN" };
          }
          writeBuildRecord(runtimeRoot, result.record);
          try { appendBuildEvent(runtimeRoot, buildId, "deployment.prepared", {
            operationId: result.operationId, deploymentId: result.deploymentId, revision: result.revision }); } catch { /* Build record is authority. */ }
          const { record: _record, ...safe } = result;
          return safe;
        });
      case BuildCoordinatorMethods.BUILD_DEPLOYMENT_TRANSITION:
        return exclusive(buildId, () => {
          const { buildId: _buildId, expectedRevision, ...input } = params;
          if (!Number.isSafeInteger(expectedRevision)) return { ok: false, code: "DEPLOY_TRANSITION_INVALID" };
          const record = readBuildRecord(runtimeRoot, buildId);
          if (!record || record.buildId !== buildId) return { ok: false, code: "BUILD_NOT_FOUND" };
          const authority = record.deployments;
          if (!authority || authority.revision !== expectedRevision) return { ok: false, code: "DEPLOY_REVISION_STALE" };
          const op = authority.pendingOperation;
          if (!op || op.kind !== "deploy" || op.operationId !== input.operationId ||
              op.deploymentId !== input.deploymentId) {
            return { ok: false, code: "DEPLOY_OPERATION_NOT_FOUND" };
          }
          if (authority.deployments.find((item) => item.deploymentId === op.deploymentId)?.target !== "preview")
            return { ok: false, code: "DEPLOY_TARGET_FORBIDDEN" };
          if (["config_receipt", "config_projection_incomplete", "submitting"].includes(input.state)) {
            const current = validateOperationSnapshot(runtimeRoot, buildId, input.operationId);
            if (!current.ok) return current;
          }
          const result = transitionDeploymentOperation(record, input);
          if (!result.ok) return result;
          writeBuildRecord(runtimeRoot, result.record);
          try { appendBuildEvent(runtimeRoot, buildId, "deployment.transition", {
            operationId: input.operationId, deploymentId: input.deploymentId,
            state: input.state, revision: result.revision }); } catch { /* Build record is authority. */ }
          return { ok: true, revision: result.revision, state: input.state };
        });
      case BuildCoordinatorMethods.BUILD_PRODUCTION_DEPLOYMENT_PREPARE:
        if (scopedControlPlane) return { ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" };
        return exclusive(buildId, () => {
          if (Object.keys(params).some((key) => !["buildId", "environmentId", "expectedRevision", "expectedEnvironmentRevision", "acknowledgeUnknownPresence"].includes(key)))
            return { ok: false, code: "DEPLOY_REQUEST_INVALID" };
          const { buildId: _buildId, ...request } = params;
          const result = prepareProductionDeploymentOperation(runtimeRoot, buildId, request);
          if (!result.ok) return result;
          writeBuildRecord(runtimeRoot, result.record);
          try { appendBuildEvent(runtimeRoot, buildId, "production_deployment.prepared", {
            operationId: result.operationId, deploymentId: result.deploymentId, revision: result.revision }); } catch { /* record is authority */ }
          return { ok: true, operationId: result.operationId, deploymentId: result.deploymentId, revision: result.revision };
        });
      case BuildCoordinatorMethods.BUILD_PRODUCTION_DEPLOYMENT_SUBMIT:
        if (scopedControlPlane) return { ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" };
        if (Object.keys(params).some((key) => !["buildId", "operationId", "deploymentId", "expectedRevision"].includes(key)) ||
            !Number.isSafeInteger(params.expectedRevision)) return { ok: false, code: "DEPLOY_REQUEST_INVALID" };
        return submitProductionDeployment(buildId, params);
      case BuildCoordinatorMethods.BUILD_PRODUCTION_DEPLOYMENT_RECONCILE:
        if (scopedControlPlane) return { ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" };
        if (Object.keys(params).some((key) => !["buildId", "operationId", "deploymentId"].includes(key))) return { ok: false, code: "DEPLOY_REQUEST_INVALID" };
        return reconcileProduction(buildId, params);
      case BuildCoordinatorMethods.BUILD_PRODUCTION_DEPLOYMENT_OBSERVE:
        if (scopedControlPlane) return { ok: false, code: "COORDINATOR_SCOPE_FORBIDDEN" };
        if (Object.keys(params).some((key) => !["buildId", "operationId", "deploymentId"].includes(key))) return { ok: false, code: "DEPLOY_REQUEST_INVALID" };
        return observeProduction(buildId, params);
      case BuildCoordinatorMethods.BUILD_RELEASE_PREPARE:
        return prepareRelease(buildId, params);
      case BuildCoordinatorMethods.BUILD_RELEASE_EXECUTE:
        return executeRelease(buildId, params);
      case BuildCoordinatorMethods.BUILD_RELEASE_OBSERVE:
        return observeRelease(buildId, params);
      case BuildCoordinatorMethods.BUILD_ENVIRONMENT_READ:
        return readBuildEnvironment(runtimeRoot, buildId, params.environmentId);
      case BuildCoordinatorMethods.BUILD_SECRET_BINDING_READ:
        return readBuildSecretBinding(runtimeRoot, buildId, params.environmentId, params.secretRef);
      case BuildCoordinatorMethods.BUILD_ENVIRONMENT_MUTATE:
        return exclusive(buildId, () => {
          if (Object.keys(params).some((key) => !["buildId", "action", "expectedEnvironmentRevision", "input"].includes(key))) {
            return { ok: false, code: "ENVIRONMENT_MUTATION_INVALID" };
          }
          const result = prepareBuildEnvironmentMutation(runtimeRoot, buildId, {
            action: params.action,
            expectedEnvironmentRevision: params.expectedEnvironmentRevision,
            input: params.input,
          });
          if (!result.ok) return result;
          writeBuildRecord(runtimeRoot, result.record);
          const { record: _record, ...safe } = result;
          const event = { revision: result.revision, action: params.action,
            environmentId: params.input?.environmentId || result.environmentId || null,
            variableName: params.input?.variableName || null,
            backend: params.action === "bind_secret" ? params.input?.backend : null };
          try { appendBuildEvent(runtimeRoot, buildId, "environment.mutated", event); } catch { /* Build record is authority. */ }
          return safe;
        });
      case BuildCoordinatorMethods.BUILD_ENVIRONMENT_VERIFY_LOCAL:
        return exclusive(buildId, () => {
          if (Object.keys(params).some((key) => !["buildId", "environmentId", "variableName", "expectedEnvironmentRevision"].includes(key))) {
            return { ok: false, code: "VERIFICATION_INVALID" };
          }
          const selected = readBuildEnvironment(runtimeRoot, buildId, params.environmentId);
          if (!selected.ok) return selected;
          if (selected.revision !== params.expectedEnvironmentRevision) return { ok: false, code: "STALE_ENVIRONMENT_AUTHORITY" };
          const binding = selected.environment.variables.find((item) => item.variableName === params.variableName);
          if (!binding || binding.kind !== "secret" || binding.backend !== "local_env_file") {
            return { ok: false, code: "SECRET_BINDING_NOT_FOUND" };
          }
          const build = readBuildRecord(runtimeRoot, buildId);
          const names = selected.environment.variables.filter((item) => item.kind === "secret" && item.backend === "local_env_file")
            .map((item) => item.variableName);
          const observed = resolveExactLocalEnvValues({
            projectRoot: build.projectBindings[0].projectRoot,
            exactNames: [binding.variableName], allowedNativeNames: names,
          });
          const unsafe = ["LOCAL_ENV_TRACKED", "LOCAL_ENV_NOT_IGNORED", "LOCAL_ENV_PATH_UNSAFE"].includes(observed.code);
          if (!observed.ok && !unsafe && observed.code !== "LOCAL_SECRET_MISSING") return observed;
          const presenceState = observed.ok ? "verified_present" :
            observed.code === "LOCAL_SECRET_MISSING" ? "verified_missing" : "unknown";
          const safetyState = unsafe ? "verified_unsafe" : "verified_safe";
          const prepared = prepareBuildEnvironmentVerification(runtimeRoot, buildId, {
            environmentId: params.environmentId, variableName: binding.variableName,
            secretRef: binding.secretRef, expectedEnvironmentRevision: selected.revision,
            presenceState, safetyState,
          });
          if (!prepared.ok) return prepared;
          writeBuildRecord(runtimeRoot, prepared.record);
          try { appendBuildEvent(runtimeRoot, buildId, "environment.binding_verified", {
            environmentId: params.environmentId, variableName: binding.variableName,
            backend: "local_env_file", presenceState, safetyState,
          }); } catch { /* Build record is authority. */ }
          return { ok: true, revision: prepared.revision, presenceState, safetyState };
        });
      case BuildCoordinatorMethods.BUILD_MESSAGE:
        if (readBuildRecord(runtimeRoot, buildId)?.pendingRestore) return { ok: false, code: "RESTORE_PENDING" };
        await interruptActive(
          buildId,
          "steer",
          String(params.input?.message || ""),
        );
        return exclusive(buildId, async () => {
          const result = await controller.applyConversation(
            buildId,
            params.input || {},
          );
          if (!result.ok) return result;
          const record = readBuildRecord(runtimeRoot, buildId);
          if (record) {
            // Creator message after Discard/pause re-arms autonomous work for
            // THIS request only — never resurrects a discarded candidate.
            if (
              record.loop?.status === "paused" ||
              record.loop?.status === "blocked"
            ) {
              record.loop.status = "running";
              record.loop.blockedReason = undefined;
              record.loop.pauseRequested = false;
            }
            record.coordinator = {
              ...(record.coordinator || {}),
              autoRun: true,
              owner: "path-build-coordinator",
            };
            writeBuildRecord(runtimeRoot, record);
            appendBuildEvent(runtimeRoot, buildId, "build.steer_rearmed", {
              intentRevision: record.intent?.outcomeRevision ?? null,
              status: record.loop?.status || null,
              autoRun: true,
            });
          }
          ensureLoop(buildId);
          return {
            ...result,
            build: readBuildRecord(runtimeRoot, buildId),
          };
        });
      case BuildCoordinatorMethods.BUILD_PAUSE:
        return exclusive(buildId, async () => {
          const result = await controller.pauseBuild(buildId);
          if (!result.ok) return result;
          const record = readBuildRecord(runtimeRoot, buildId);
          if (record?.loop?.status === "paused") {
            record.coordinator = {
              ...(record.coordinator || {}),
              autoRun: false,
              owner: "path-build-coordinator",
            };
            writeBuildRecord(runtimeRoot, record);
          }
          appendBuildEvent(runtimeRoot, buildId, "build.pause_requested", {
            settled: record?.loop?.status === "paused",
          });
          return { ...result, build: readBuildRecord(runtimeRoot, buildId) };
        });
      case BuildCoordinatorMethods.BUILD_STOP:
        await interruptActive(buildId, "cancel");
        return exclusive(buildId, async () => {
          const result = await controller.stopBuild(buildId);
          if (result.ok) {
            const record = readBuildRecord(runtimeRoot, buildId);
            record.coordinator = {
              ...(record.coordinator || {}),
              autoRun: false,
              owner: "path-build-coordinator",
            };
            writeBuildRecord(runtimeRoot, record);
            appendBuildEvent(runtimeRoot, buildId, "build.paused", {
              taskId: record.loop?.pausedTaskId || null,
            });
          }
          return { ...result, build: readBuildRecord(runtimeRoot, buildId) };
        });
      case BuildCoordinatorMethods.BUILD_RESUME:
      case BuildCoordinatorMethods.BUILD_RECOVER:
        return exclusive(buildId, async () => {
          const result = await controller.resumeBuild(buildId);
          if (!result.ok) return result;
          const record = readBuildRecord(runtimeRoot, buildId);
          const awaiting = record?.pendingCandidate?.status === "pending";
          const awaitCreator = Boolean(result.awaitCreator);
          if (awaiting) {
            record.loop.status = "awaiting_review";
          }
          record.coordinator = {
            ...(record.coordinator || {}),
            // Discarded candidate is terminal — do not auto-start engineering.
            autoRun: !awaiting && !awaitCreator,
            owner: "path-build-coordinator",
          };
          writeBuildRecord(runtimeRoot, record);
          appendBuildEvent(
            runtimeRoot,
            buildId,
            method === BuildCoordinatorMethods.BUILD_RECOVER
              ? "build.recovered"
              : "build.resumed",
            {
              decisions: result.decisions || [],
              awaitingReview: awaiting,
              awaitCreator,
            },
          );
          if (!awaiting && !awaitCreator) setImmediate(() => ensureLoop(buildId));
          return { ...result, build: readBuildRecord(runtimeRoot, buildId) };
        });
      case BuildCoordinatorMethods.BUILD_APPLY:
        return exclusive(buildId, async () => {
          const result = await controller.applyCandidate(buildId);
          if (!result.ok) return result;
          const record = readBuildRecord(runtimeRoot, buildId);
          record.coordinator = {
            ...(record.coordinator || {}),
            autoRun: true,
            owner: "path-build-coordinator",
          };
          writeBuildRecord(runtimeRoot, record);
          appendBuildEvent(runtimeRoot, buildId, "build.applied", {
            taskId: result.adoption?.taskId || record.lastAppliedCandidate?.taskId,
            adoptedSha: result.adoption?.adoptedSha || record.authoritativeSha,
            deduped: result.deduped === true,
          });
          if (!result.deduped) setImmediate(() => ensureLoop(buildId));
          return { ...result, build: readBuildRecord(runtimeRoot, buildId) };
        });
      case BuildCoordinatorMethods.BUILD_DISCARD:
        return exclusive(buildId, async () => {
          const result = await controller.discardCandidate(buildId);
          if (!result.ok) return result;
          let record = readBuildRecord(runtimeRoot, buildId);
          record.coordinator = {
            ...(record.coordinator || {}),
            autoRun: record.loop?.status === "running",
            owner: "path-build-coordinator",
          };
          writeBuildRecord(runtimeRoot, record);
          appendBuildEvent(runtimeRoot, buildId, "build.discarded", {
            taskId: record.lastDiscardedCandidate?.taskId || null,
            deduped: result.deduped === true,
          });
          if (!result.deduped) {
            // Drop candidate preview process, then restore authoritative
            // preview (or truthful empty/awaiting_product) with zero engine.
            try {
              await runtimeManager.stop(buildId);
            } catch {
              /* ignore */
            }
            await runtimeSync.sync(buildId);
            record = readBuildRecord(runtimeRoot, buildId) || record;
          }
          if (record.loop?.status === "running") {
            setImmediate(() => ensureLoop(buildId));
          }
          return { ...result, build: readBuildRecord(runtimeRoot, buildId) };
        });
      case BuildCoordinatorMethods.BUILD_TICK:
        return exclusive(buildId, () => controller.tick(buildId));
      case BuildCoordinatorMethods.BUILD_RESTORE_HISTORICAL:
        return exclusive(buildId, () => {
          if (Object.keys(params).some((key) => !["buildId", "adoptionIndex", "expectedAuthoritativeSha"].includes(key))) {
            return { ok: false, code: "INVALID_RESTORE_REQUEST" };
          }
          return controller.restoreHistoricalVersion(buildId, params.adoptionIndex, params.expectedAuthoritativeSha);
        });
      case BuildCoordinatorMethods.BUILD_SURFACE_EDIT:
        return exclusive(buildId, () => {
          const record = readBuildRecord(runtimeRoot, buildId);
          if (!record) return { ok: false, code: "BUILD_NOT_FOUND" };
          if (record.pendingRestore) return { ok: false, code: "RESTORE_PENDING" };
          const action = params.action;
          const input = params.input || {};
          if (action === "heal_conversation") {
            const before = (record.conversation || []).map((row) => `${row.id}:${row.status}`).join("|");
            syncConversationLifecycle(record);
            const after = (record.conversation || []).map((row) => `${row.id}:${row.status}`).join("|");
            if (before !== after) writeBuildRecord(runtimeRoot, record);
            return { ok: true, changed: before !== after };
          }
          if (action === "title") {
            const title = String(input.displayTitle || "").trim().slice(0, 80);
            if (!title) return { ok: false, code: "TITLE_REQUIRED" };
            record.displayTitle = title;
            writeBuildRecord(runtimeRoot, record);
            return { ok: true, displayTitle: title };
          }
          if (action === "archive" || action === "unarchive") {
            if (action === "archive") record.archivedAt = new Date().toISOString();
            else delete record.archivedAt;
            writeBuildRecord(runtimeRoot, record);
            return { ok: true, archived: action === "archive" };
          }
          if (action === "repository") {
            const root = record.projectBindings?.[0]?.projectRoot;
            if (!root) return { ok: false, code: "BUILD_NOT_BOUND" };
            let result;
            if (input.action === "connect-local") result = connectLocalRemote(record, root, input.remoteUrl);
            else if (input.action === "connect-github") result = connectGitHubRepository(record, root, {
              name: input.name, visibility: input.visibility });
            else if (input.action === "sync-mode") result = setAdoptedSync(record, root, input.enabled === true);
            else if (input.action === "sync") result = pushAdoptedRevision(record, root, record.authoritativeSha);
            else if (input.action === "disconnect") result = disconnectRepository(record, root, input.confirm === true);
            else result = { ok: false, code: "REPOSITORY_ACTION_REQUIRED" };
            if (result.ok) writeBuildRecord(runtimeRoot, record);
            return result;
          }
          return { ok: false, code: "SURFACE_EDIT_NOT_ALLOWED" };
        });
      case BuildCoordinatorMethods.BUILD_RUN:
        return exclusive(buildId, () =>
          controller.runUntilDone(buildId, {
            ...(params.options || {}),
            syncRuntime: runtimeSync.sync,
          }),
        );
      case BuildCoordinatorMethods.BUILD_ENSURE_LOOP:
        return ensureLoop(buildId);
      case BuildCoordinatorMethods.RUNTIME_GET:
        return runtimeState(buildId);
      case BuildCoordinatorMethods.RUNTIME_SYNC:
      case BuildCoordinatorMethods.RUNTIME_EVIDENCE:
        return exclusive(buildId, () => runtimeSync.sync(buildId));
      case BuildCoordinatorMethods.RUNTIME_START:
      case BuildCoordinatorMethods.RUNTIME_RESTART:
        return exclusive(buildId, async () => {
          if (Object.keys(params).some((key) => !["buildId", "environmentId"].includes(key)) ||
              (params.environmentId != null &&
                (typeof params.environmentId !== "string" || !params.environmentId))) {
            return { ok: false, code: "ENVIRONMENT_SELECTION_INVALID" };
          }
          const gate = runtimeSync.requireBinding(buildId);
          if (!gate.ok) return gate;
          const operation =
            method === BuildCoordinatorMethods.RUNTIME_RESTART
              ? runtimeManager.refresh
              : runtimeManager.start;
          const result = await operation(buildId, gate.projectRoot, {
            bindingId: gate.binding.bindingId,
            outcomeHint: gate.build.intent?.outcome,
            authoritativeSha: gate.build.authoritativeSha || null,
            descriptor: {
              buildId,
              bindingId: gate.binding.bindingId,
              projectRoot: gate.projectRoot,
            },
            restartAllowed: true,
            environmentId: params.environmentId || null,
          });
          appendBuildEvent(
            runtimeRoot,
            buildId,
            method === BuildCoordinatorMethods.RUNTIME_RESTART
              ? "runtime.restarted"
              : "runtime.started",
            {
              ok: result.ok !== false,
              status: result.runtime?.status || null,
              authoritativeSha: gate.build.authoritativeSha || null,
              ...(params.environmentId ? {
                environmentId: params.environmentId,
                consumer: "local_product_runtime",
                operation: "runtime_environment_selection",
                outcome: result.ok ? "started" : "failed",
              } : {}),
            },
          );
          return result;
        });
      case BuildCoordinatorMethods.RUNTIME_STOP:
        return exclusive(buildId, async () => {
          const result = await runtimeManager.stop(buildId);
          appendBuildEvent(runtimeRoot, buildId, "runtime.stopped", {
            stopped: result.stopped !== false,
          });
          return result;
        });
      case BuildCoordinatorMethods.SHUTDOWN:
        shuttingDown = true;
        return { ok: true, shuttingDown: true };
      default:
        return { ok: false, code: "METHOD_NOT_FOUND", message: method };
    }
  }

  let recovered = [];
  // A scoped control-plane owner never recovers unrelated Builds. It accepts
  // only exact-Build P9/P10 commands, and the normal owner keeps full recovery.
  const whenReady = (scopedControlPlane ? Promise.resolve([]) : reconcileStartup()).then((rows) => {
    recovered = rows;
    return rows;
  });

  return {
    controller,
    runtimeManager,
    runtimeSync,
    dispatch,
    ensureLoop,
    whenReady,
    get recovered() {
      return recovered;
    },
    isShuttingDown: () => shuttingDown,
    close: async () => {
      shuttingDown = true;
      await runtimeManager.stopAll();
      if (gatewayHandle?.client) {
        try {
          await withTimeout(gatewayHandle.client.shutdown(), 1_500, null);
        } catch {
          // Gateway may already be exiting
        }
        try {
          gatewayHandle.client.close();
        } catch {
          // ignore
        }
      }
      const gatewayPid =
        gatewayHandle?.hello?.identity?.pid ?? readGatewayPid(runtimeRoot);
      await terminateOwnedPid(gatewayPid, { termMs: 3_000, killMs: 2_000 });
    },
  };
}
