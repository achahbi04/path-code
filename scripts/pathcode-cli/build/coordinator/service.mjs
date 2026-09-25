/**
 * Durable PATH Build coordinator.
 *
 * Owns Build mutation, autonomous loops, Gateway connectivity and product
 * runtime synchronization. Browser/HTTP processes are clients only.
 */

import { createBuildController } from "../controller.mjs";
import {
  findLatestActiveBuild,
  listBuildRecords,
  readBuildRecord,
  writeBuildRecord,
} from "../record.mjs";
import { createBuildRuntimeManager } from "../runtime/manager.mjs";
import { createBuildRuntimeSync } from "../runtime/sync.mjs";
import { detectBuildArtifact } from "../runtime/artifact.mjs";
import { appendBuildEvent, readBuildEvents } from "../events.mjs";
import { ensureGateway } from "../../gateway/ensure.mjs";
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
  } = options;
  let gatewayHandle = null;
  const gateway = fakeMode
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
    for (const build of listBuildRecords(runtimeRoot)) {
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

  async function dispatch(method, params = {}) {
    const buildId = String(params.buildId || "");
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
      case BuildCoordinatorMethods.BUILD_MESSAGE:
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
          if (result.ok) ensureLoop(buildId);
          return result;
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
          if (awaiting) {
            record.loop.status = "awaiting_review";
          }
          record.coordinator = {
            ...(record.coordinator || {}),
            autoRun: !awaiting,
            owner: "path-build-coordinator",
          };
          writeBuildRecord(runtimeRoot, record);
          appendBuildEvent(
            runtimeRoot,
            buildId,
            method === BuildCoordinatorMethods.BUILD_RECOVER
              ? "build.recovered"
              : "build.resumed",
            { decisions: result.decisions || [], awaitingReview: awaiting },
          );
          if (!awaiting) setImmediate(() => ensureLoop(buildId));
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
          const record = readBuildRecord(runtimeRoot, buildId);
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
          if (record.loop?.status === "running") {
            setImmediate(() => ensureLoop(buildId));
          }
          return { ...result, build: readBuildRecord(runtimeRoot, buildId) };
        });
      case BuildCoordinatorMethods.BUILD_TICK:
        return exclusive(buildId, () => controller.tick(buildId));
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
  const whenReady = reconcileStartup().then((rows) => {
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
      gatewayHandle?.client?.close();
    },
  };
}
