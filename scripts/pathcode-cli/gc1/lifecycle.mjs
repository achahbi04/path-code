/**
 * Phase GC1-a — WorkstationLifecycleManager
 *
 * Provision / probe / reconcile / dispose behind a WorkstationTransport.
 * Canonical path uses MockWorkstationTransport ($0). Real GCP only via live smoke.
 *
 * Identity: Control SA authenticates the control plane; workstation runs as Runtime SA.
 * Teardown disposes the WORKSTATION only — never the long-lived cluster.
 */

import {
  GC1_CLUSTER,
  GC1_CONFIG,
  GC1_CONTROL_SA,
  GC1_COST_FENCES,
  GC1_DEFAULT_DEADLINE_MS,
  GC1_ERROR,
  GC1_HEALTH_CHECK_COMMAND,
  GC1_HEALTH_CHECK_EXPECTED,
  GC1_PROBE_WORKSTATION,
  GC1_RESOURCE_PREFIX,
  GC1_RUNTIME_SA,
  buildConfigCreateBody,
  clusterName,
  configName,
  workstationName,
} from "./constants.mjs";

/**
 * @param {object} options
 * @param {import("./transport.mjs").WorkstationTransport} options.transport
 * @param {number} [options.deadlineMs]
 * @param {number} [options.pollIntervalMs]
 * @param {boolean} [options.weakenReadinessGate] P1 falsification only — MUST be false in production
 * @param {NodeJS.Process} [options.proc] process for signal handlers (tests inject)
 */
export function createWorkstationLifecycleManager(options) {
  const transport = options.transport;
  if (!transport) {
    throw new Error("WorkstationLifecycleManager requires a transport");
  }

  const deadlineMs = options.deadlineMs ?? GC1_DEFAULT_DEADLINE_MS;
  const pollIntervalMs = options.pollIntervalMs ?? 25;
  const weakenReadinessGate = options.weakenReadinessGate === true;
  const proc = options.proc || process;

  /** @type {string[]} */
  const observedStates = [];
  /** @type {Set<ReturnType<typeof setTimeout>>} */
  const timers = new Set();
  /** @type {null | (() => void)} */
  let onSigInt = null;
  /** @type {null | (() => void)} */
  let onSigTerm = null;
  /** @type {null | ((err: Error) => void)} */
  let onUncaught = null;

  let handlersInstalled = false;
  let teardownPromise = null;
  let activeWorkstationName = null;
  let disposed = false;
  /** @type {object|null} */
  let lastConfigCreateBody = null;
  /** @type {string[]} */
  let reclaimed = [];
  let clusterCreatedThisSession = false;

  function trackTimer(handle) {
    timers.add(handle);
    return handle;
  }

  function clearTrackedTimers() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  }

  function delay(ms) {
    return new Promise((resolve) => {
      const t = trackTimer(
        setTimeout(() => {
          timers.delete(t);
          resolve();
        }, ms),
      );
    });
  }

  function recordState(state) {
    if (state && observedStates[observedStates.length - 1] !== state) {
      observedStates.push(state);
    }
  }

  function assertIdentitySeparation(payload) {
    const serialized = JSON.stringify(payload ?? {});
    if (serialized.includes(GC1_CONTROL_SA)) {
      throw new Error(
        "GC1 identity separation violated: Control SA present in workstation-facing payload",
      );
    }
    if (
      payload?.host?.gceInstance?.serviceAccount &&
      payload.host.gceInstance.serviceAccount !== GC1_RUNTIME_SA
    ) {
      throw new Error(
        "GC1 identity separation violated: workstation must run as Runtime SA",
      );
    }
  }

  async function waitUntilRunning(name) {
    const started = Date.now();
    while (Date.now() - started < deadlineMs) {
      const ws = await transport.getWorkstation(name);
      if (!ws) {
        await delay(pollIntervalMs);
        continue;
      }
      recordState(ws.state);
      if (ws.state === "STATE_RUNNING") {
        return ws;
      }
      if (ws.state === "ERROR" || ws.state === "DELETED") {
        break;
      }
      await delay(pollIntervalMs);
    }
    // Stuck — force dispose, never leave billing.
    try {
      await transport.stopWorkstation(name);
      recordState("STATE_STOPPING");
    } catch {
      /* best-effort */
    }
    try {
      await transport.deleteWorkstation(name);
      recordState("DELETED");
    } catch {
      /* best-effort */
    }
    activeWorkstationName = null;
    const err = new Error(
      `${GC1_ERROR.WORKSTATION_NOT_READY}: workstation did not reach STATE_RUNNING within ${deadlineMs}ms; force-disposed`,
    );
    err.code = GC1_ERROR.WORKSTATION_NOT_READY;
    throw err;
  }

  async function reconcileStartup() {
    reclaimed = [];
    const parent = configName();
    let listed = [];
    try {
      listed = await transport.listWorkstations(parent);
    } catch {
      listed = [];
    }

    for (const ws of listed) {
      const id = ws.workstationId || "";
      if (!id.startsWith(GC1_RESOURCE_PREFIX)) continue;
      // Reclaim orphaned GC1 probe workstations only — never cluster/config.
      if (id === GC1_CLUSTER || id === GC1_CONFIG) continue;

      // Orphan = any matching prefix workstation left behind (probe or prior crash).
      try {
        if (ws.state === "STATE_RUNNING" || ws.state === "STATE_STARTING") {
          await transport.stopWorkstation(ws.name);
        }
        await transport.deleteWorkstation(ws.name);
        reclaimed.push(id);
        if (ws.name === activeWorkstationName) activeWorkstationName = null;
      } catch {
        /* continue reclaiming others */
      }
    }

    return {
      reclaimed: [...reclaimed],
      touchedCluster: false,
      touchedConfig: false,
    };
  }

  /**
   * Deliberate bootstrap. Creates cluster ONLY if missing — disclosed act.
   * Never called implicitly from startProbeWorkstation / task paths.
   */
  async function ensureClusterAndConfig() {
    const cName = clusterName();
    let cluster = await transport.getCluster(cName);
    let createdCluster = false;
    if (!cluster) {
      cluster = await transport.createCluster(GC1_CLUSTER, {
        // Cluster exists → standing hourly charge. Disclosed by caller.
        displayName: GC1_CLUSTER,
      });
      createdCluster = true;
      clusterCreatedThisSession = true;
    }

    const cfgName = configName();
    let config = await transport.getConfig(cfgName);
    let createdConfig = false;
    if (!config) {
      const body = buildConfigCreateBody();
      assertIdentitySeparation(body);
      // Exact cost fences
      if (body.host.gceInstance.poolSize !== GC1_COST_FENCES.poolSize) {
        throw new Error("cost fence poolSize mismatch");
      }
      if (body.idleTimeout !== GC1_COST_FENCES.idleTimeout) {
        throw new Error("cost fence idleTimeout mismatch");
      }
      if (body.runningTimeout !== GC1_COST_FENCES.runningTimeout) {
        throw new Error("cost fence runningTimeout mismatch");
      }
      lastConfigCreateBody = structuredClone(body);
      config = await transport.createConfig(cName, GC1_CONFIG, body);
      createdConfig = true;
    } else {
      lastConfigCreateBody = structuredClone(config.body || buildConfigCreateBody());
    }

    return {
      cluster,
      config,
      createdCluster,
      createdConfig,
      clusterCreatedThisSession,
      costFences: { ...GC1_COST_FENCES },
      runtimeServiceAccount: GC1_RUNTIME_SA,
      controlServiceAccount: GC1_CONTROL_SA,
    };
  }

  /**
   * Start probe workstation → LIFECYCLE READY (STATE_RUNNING).
   * Does NOT create the cluster (GC1A-C).
   */
  async function startProbeWorkstation() {
    disposed = false;
    const cfg = configName();
    const name = workstationName(GC1_PROBE_WORKSTATION);

    let existing = await transport.getWorkstation(name);
    if (!existing) {
      // Workstation create payload must not carry Control SA / tokens.
      const createBody = {
        displayName: GC1_PROBE_WORKSTATION,
        labels: { "pathcode-gc1": "probe" },
      };
      assertIdentitySeparation(createBody);
      assertNoControlCredentialLeak(createBody);
      existing = await transport.createWorkstation(cfg, GC1_PROBE_WORKSTATION, createBody);
      recordState(existing.state || "CREATING");
    }

    activeWorkstationName = name;
    const started = await transport.startWorkstation(name);
    recordState(started.state || "STATE_STARTING");
    const running = await waitUntilRunning(name);
    return {
      ...running,
      lifecycleReady: true,
      executionReady: false,
    };
  }

  function assertNoControlCredentialLeak(payload) {
    const blob = JSON.stringify(payload);
    if (
      blob.includes(GC1_CONTROL_SA) ||
      /"access_token"|"private_key"|"client_email"\s*:\s*"[^"]*pathcode-gc1-control/i.test(
        blob,
      )
    ) {
      throw new Error(
        "Control SA credential must be absent from workstation-facing payload",
      );
    }
  }

  /**
   * EXECUTION READY: authenticated remote command round-trip.
   * STATE_RUNNING alone is insufficient.
   */
  async function verifyExecutionReadiness(workstation) {
    const name = workstation?.name || activeWorkstationName || workstationName();
    const result = await transport.executeCommand({
      workstationName: name,
      command: GC1_HEALTH_CHECK_COMMAND,
    });
    const stdout = String(result.stdout || "").trim();
    const ok =
      result.exitCode === 0 &&
      (stdout === GC1_HEALTH_CHECK_EXPECTED ||
        stdout.split(/\r?\n/).includes(GC1_HEALTH_CHECK_EXPECTED));

    if (!ok) {
      const err = new Error(
        `${GC1_ERROR.EXECUTION_NOT_READY}: expected ${GC1_HEALTH_CHECK_EXPECTED}, got exit=${result.exitCode} stdout=${JSON.stringify(stdout)}`,
      );
      err.code = GC1_ERROR.EXECUTION_NOT_READY;
      throw err;
    }

    return {
      ...workstation,
      name,
      lifecycleReady: true,
      executionReady: true,
      healthCheck: stdout,
    };
  }

  /**
   * Dual-stage acquire: lifecycle-ready AND execution-ready.
   * With weakenReadinessGate (P1 only), returns after lifecycle-ready alone.
   */
  async function acquireProbeWorkstation() {
    const lifecycle = await startProbeWorkstation();
    if (weakenReadinessGate) {
      // P1 falsification: skip execution-ready — caller receives a not-actually-executable station.
      return { ...lifecycle, executionReady: false, weakened: true };
    }
    return verifyExecutionReadiness(lifecycle);
  }

  /**
   * Idempotent disposal of the probe workstation only — never the cluster.
   */
  async function teardown() {
    if (teardownPromise) return teardownPromise;

    teardownPromise = (async () => {
      clearTrackedTimers();
      const name = activeWorkstationName || workstationName(GC1_PROBE_WORKSTATION);
      try {
        const ws = await transport.getWorkstation(name);
        if (ws) {
          try {
            if (
              ws.state === "STATE_RUNNING" ||
              ws.state === "STATE_STARTING" ||
              ws.state === "CREATING"
            ) {
              await transport.stopWorkstation(name);
              recordState("STATE_STOPPING");
            }
          } catch {
            /* continue */
          }
          try {
            await transport.deleteWorkstation(name);
            recordState("DELETED");
          } catch {
            /* continue */
          }
        }
      } catch {
        /* get may fail during partial startup — still complete cleanly */
      }
      activeWorkstationName = null;
      disposed = true;
      detachSignalHandlers();
      clearTrackedTimers();
    })();

    try {
      await teardownPromise;
    } finally {
      // Allow a subsequent teardown() call to run again (idempotent no-op).
      const finished = teardownPromise;
      // Keep reference briefly so concurrent double-calls share the same promise,
      // then clear so a later call is a clean no-op pass.
      queueMicrotask(() => {
        if (teardownPromise === finished) teardownPromise = null;
      });
    }
    return { disposed: true, clusterPreserved: true };
  }

  function installSignalHandlers() {
    if (handlersInstalled) return;
    onSigInt = () => {
      void teardown();
    };
    onSigTerm = () => {
      void teardown();
    };
    onUncaught = () => {
      void teardown();
    };
    proc.on("SIGINT", onSigInt);
    proc.on("SIGTERM", onSigTerm);
    proc.on("uncaughtException", onUncaught);
    handlersInstalled = true;
  }

  function detachSignalHandlers() {
    if (!handlersInstalled) return;
    if (onSigInt) proc.off("SIGINT", onSigInt);
    if (onSigTerm) proc.off("SIGTERM", onSigTerm);
    if (onUncaught) proc.off("uncaughtException", onUncaught);
    onSigInt = null;
    onSigTerm = null;
    onUncaught = null;
    handlersInstalled = false;
  }

  function stats() {
    return {
      handlersInstalled,
      timerCount: timers.size,
      activeWorkstationName,
      disposed,
      observedStates: [...observedStates],
      reclaimed: [...reclaimed],
      clusterCreatedThisSession,
      weakenReadinessGate,
      lastConfigCreateBody: lastConfigCreateBody
        ? structuredClone(lastConfigCreateBody)
        : null,
    };
  }

  return {
    reconcileStartup,
    ensureClusterAndConfig,
    startProbeWorkstation,
    verifyExecutionReadiness,
    acquireProbeWorkstation,
    teardown,
    installSignalHandlers,
    detachSignalHandlers,
    getObservedStates: () => [...observedStates],
    stats,
    /** Expose for GC1A-B */
    getLastConfigCreateBody: () =>
      lastConfigCreateBody ? structuredClone(lastConfigCreateBody) : null,
  };
}
