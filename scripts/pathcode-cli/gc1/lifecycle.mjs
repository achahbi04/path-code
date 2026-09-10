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
  GC1_EXECUTION_READY_ATTEMPTS,
  GC1_EXECUTION_READY_INTERVAL_MS,
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
import { normalizeRemoteText } from "./remote-exec.mjs";

/**
 * @param {object} options
 * @param {import("./transport.mjs").WorkstationTransport} options.transport
 * @param {number} [options.deadlineMs]
 * @param {number} [options.pollIntervalMs]
 * @param {number} [options.executionReadyAttempts] default GC1_EXECUTION_READY_ATTEMPTS
 * @param {number} [options.executionReadyIntervalMs] default GC1_EXECUTION_READY_INTERVAL_MS
 * @param {boolean} [options.weakenReadinessGate] P1 falsification only — MUST be false in production
 * @param {boolean} [options.weakenExitOnlyExecutionReady] falsification: accept exit=0 ignoring stdout
 * @param {NodeJS.Process} [options.proc] process for signal handlers (tests inject)
 * @param {{ hasCleanupPending?: () => boolean, listCleanupPending?: () => object[] }} [options.journal]
 *   GC1-c: CLEANUP_PENDING blocks another billable acquire.
 * @param {number} [options.sessionBudget] GC1-c live session budget (default unlimited for GC1-a tests)
 */
export function createWorkstationLifecycleManager(options) {
  const transport = options.transport;
  if (!transport) {
    throw new Error("WorkstationLifecycleManager requires a transport");
  }

  const journal = options.journal ?? null;
  const sessionBudget =
    typeof options.sessionBudget === "number" ? options.sessionBudget : null;
  let acquireCount = 0;

  const deadlineMs = options.deadlineMs ?? GC1_DEFAULT_DEADLINE_MS;
  const pollIntervalMs = options.pollIntervalMs ?? 25;
  const executionReadyAttempts =
    options.executionReadyAttempts ?? GC1_EXECUTION_READY_ATTEMPTS;
  const executionReadyIntervalMs =
    options.executionReadyIntervalMs ?? GC1_EXECUTION_READY_INTERVAL_MS;
  const weakenReadinessGate = options.weakenReadinessGate === true;
  const weakenExitOnlyExecutionReady =
    options.weakenExitOnlyExecutionReady === true;
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

  async function forceDisposeProbe(name) {
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
    if (activeWorkstationName === name) activeWorkstationName = null;
  }

  function stdoutMatchesHealthCheck(stdout) {
    return normalizeRemoteText(stdout) === GC1_HEALTH_CHECK_EXPECTED;
  }

  function stderrIsCleanForSuccess(stderr) {
    const text = String(stderr ?? "");
    // Token must never appear on stderr (no stderr-as-stdout shortcut).
    if (text.includes(GC1_HEALTH_CHECK_EXPECTED)) return false;
    if (/PERMISSION_DENIED|Permission ['"]workstations\.|CREDENTIALS_MISSING|ERROR:\s/i.test(text)) {
      return false;
    }
    return true;
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
    await forceDisposeProbe(name);
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
   * EXECUTION READY: authenticated remote command round-trip with bounded retry.
   * STATE_RUNNING alone is insufficient — the container agent may still be
   * wiring stdout (exit=0, empty stdout). Poll up to executionReadyAttempts
   * with executionReadyIntervalMs between tries (default 6 × 3s = 18s).
   * On deadline miss: force-dispose the probe (never leave it billing).
   */
  async function verifyExecutionReadiness(workstation) {
    const name = workstation?.name || activeWorkstationName || workstationName();
    let lastStdout = "";
    let lastExit = null;
    let attempts = 0;

    for (let i = 0; i < executionReadyAttempts; i += 1) {
      attempts = i + 1;
      const result = await transport.executeCommand({
        workstationName: name,
        command: GC1_HEALTH_CHECK_COMMAND,
      });
      lastExit = result.exitCode;
      lastStdout = String(result.stdout || "");
      const lastStderr = String(result.stderr || "");
      const normalized = normalizeRemoteText(lastStdout);

      const tokenOk = stdoutMatchesHealthCheck(lastStdout);
      const ok = weakenExitOnlyExecutionReady
        ? result.exitCode === 0 // falsification: ignore stdout
        : result.exitCode === 0 &&
          tokenOk &&
          stderrIsCleanForSuccess(lastStderr);

      if (ok) {
        return {
          ...workstation,
          name,
          lifecycleReady: true,
          executionReady: true,
          healthCheck: weakenExitOnlyExecutionReady
            ? normalized || GC1_HEALTH_CHECK_EXPECTED
            : GC1_HEALTH_CHECK_EXPECTED,
          executionReadyAttempts: attempts,
          stderr: lastStderr,
        };
      }

      if (i + 1 < executionReadyAttempts) {
        await delay(executionReadyIntervalMs);
      }
    }

    await forceDisposeProbe(name);
    const err = new Error(
      `${GC1_ERROR.EXECUTION_NOT_READY}: expected ${GC1_HEALTH_CHECK_EXPECTED} within ${executionReadyAttempts} attempts × ${executionReadyIntervalMs}ms; got exit=${lastExit} stdout=${JSON.stringify(lastStdout)}; force-disposed`,
    );
    err.code = GC1_ERROR.EXECUTION_NOT_READY;
    err.attempts = attempts;
    throw err;
  }

  /**
   * Dual-stage acquire: lifecycle-ready AND execution-ready.
   * With weakenReadinessGate (P1 only), returns after lifecycle-ready alone.
   * GC1-c: refuses when journal reports CLEANUP_PENDING or session budget exhausted.
   */
  async function acquireProbeWorkstation() {
    if (journal && typeof journal.hasCleanupPending === "function") {
      if (journal.hasCleanupPending()) {
        const pending =
          typeof journal.listCleanupPending === "function"
            ? journal.listCleanupPending()
            : [];
        const err = new Error(
          `GC1C_CLEANUP_PENDING: refusing billable acquire while ${pending.length} cleanup(s) pending`,
        );
        err.code = "GC1C_CLEANUP_PENDING";
        err.pending = pending;
        throw err;
      }
    }
    if (sessionBudget != null && acquireCount >= sessionBudget) {
      const err = new Error(
        `GC1C_SESSION_BUDGET_EXHAUSTED: acquire budget ${sessionBudget} exhausted`,
      );
      err.code = "GC1C_SESSION_BUDGET_EXHAUSTED";
      throw err;
    }
    const lifecycle = await startProbeWorkstation();
    acquireCount += 1;
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
      weakenExitOnlyExecutionReady,
      executionReadyAttempts,
      executionReadyIntervalMs,
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
