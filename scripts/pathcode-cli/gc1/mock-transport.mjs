/**
 * Phase GC1-a — deterministic in-memory WorkstationTransport.
 * NO network. NO GCP resources. Canonical suite runs exclusively against this.
 */

import {
  GC1_CLUSTER,
  GC1_CONFIG,
  GC1_HEALTH_CHECK_EXPECTED,
  GC1_PROBE_WORKSTATION,
  GC1_RESOURCE_PREFIX,
  clusterName,
  configName,
  workstationName,
} from "./constants.mjs";

/**
 * @param {object} [options]
 * @param {number} [options.pollsUntilRunning=1]
 * @param {boolean} [options.commandFails=false]
 * @param {number} [options.commandDelayMs=0]
 * @param {boolean} [options.neverReachRunning=false]
 * @param {string} [options.commandStdout]
 */
export function createMockWorkstationTransport(options = {}) {
  const state = {
    pollsUntilRunning: options.pollsUntilRunning ?? 1,
    commandFails: options.commandFails === true,
    commandDelayMs: options.commandDelayMs ?? 0,
    neverReachRunning: options.neverReachRunning === true,
    commandStdout: options.commandStdout ?? GC1_HEALTH_CHECK_EXPECTED,
    /** First N health-check attempts return exit=0 with empty stdout (agent warm-up). */
    emptyStdoutBeforeSuccess: options.emptyStdoutBeforeSuccess ?? 0,
    executeCommandCount: 0,
  };

  /** @type {Map<string, object>} */
  const clusters = new Map();
  /** @type {Map<string, object>} */
  const configs = new Map();
  /** @type {Map<string, object>} */
  const workstations = new Map();

  /** @type {string[]} */
  const callLog = [];
  let networkCalls = 0;
  let getPolls = new Map();

  function log(op, detail) {
    callLog.push(detail ? `${op}:${detail}` : op);
  }

  function assertNoNetwork() {
    // Mock never increments networkCalls; exposed for GC1A-G.
  }

  function idFromName(name) {
    const parts = String(name).split("/");
    return parts[parts.length - 1];
  }

  return {
    kind: "mock",

    async createCluster(id, body = {}) {
      assertNoNetwork();
      log("createCluster", id);
      const name = clusterName().replace(GC1_CLUSTER, id);
      const rec = {
        name,
        clusterId: id,
        state: "READY",
        body: { ...body },
      };
      clusters.set(name, rec);
      return { ...rec };
    },

    async getCluster(name) {
      assertNoNetwork();
      log("getCluster", idFromName(name));
      const rec = clusters.get(name);
      return rec ? { ...rec } : null;
    },

    async listClusters(_parent) {
      assertNoNetwork();
      log("listClusters");
      return [...clusters.values()].map((c) => ({ ...c }));
    },

    async deleteCluster(name) {
      assertNoNetwork();
      log("deleteCluster", idFromName(name));
      clusters.delete(name);
    },

    async createConfig(parent, id, body) {
      assertNoNetwork();
      log("createConfig", id);
      const name = `${parent}/workstationConfigs/${id}`;
      const rec = { name, configId: id, body: structuredClone(body) };
      configs.set(name, rec);
      return { ...rec, body: structuredClone(body) };
    },

    async getConfig(name) {
      assertNoNetwork();
      log("getConfig", idFromName(name));
      const rec = configs.get(name);
      return rec ? { ...rec, body: structuredClone(rec.body) } : null;
    },

    async listConfigs(_parent) {
      assertNoNetwork();
      log("listConfigs");
      return [...configs.values()].map((c) => ({
        ...c,
        body: structuredClone(c.body),
      }));
    },

    async deleteConfig(name) {
      assertNoNetwork();
      log("deleteConfig", idFromName(name));
      configs.delete(name);
    },

    async createWorkstation(parent, id, body = {}) {
      assertNoNetwork();
      log("createWorkstation", id);
      const name = `${parent}/workstations/${id}`;
      const rec = {
        name,
        workstationId: id,
        state: "CREATING",
        configName: parent,
        body: structuredClone(body),
        _polls: 0,
      };
      workstations.set(name, rec);
      // Transition CREATING → will become RUNNING on subsequent gets after polls.
      return {
        name: rec.name,
        workstationId: rec.workstationId,
        state: rec.state,
        configName: rec.configName,
      };
    },

    async getWorkstation(name) {
      assertNoNetwork();
      log("getWorkstation", idFromName(name));
      const rec = workstations.get(name);
      if (!rec) return null;

      if (rec.state === "CREATING" || rec.state === "STATE_STARTING") {
        rec._polls = (rec._polls || 0) + 1;
        if (
          !state.neverReachRunning &&
          rec._polls >= state.pollsUntilRunning
        ) {
          rec.state = "STATE_RUNNING";
        }
      }
      getPolls.set(name, (getPolls.get(name) || 0) + 1);
      return {
        name: rec.name,
        workstationId: rec.workstationId,
        state: rec.state,
        configName: rec.configName,
      };
    },

    async listWorkstations(parent) {
      assertNoNetwork();
      log("listWorkstations", parent);
      return [...workstations.values()]
        .filter((w) => !parent || w.name.startsWith(parent) || w.configName === parent)
        .map((w) => ({
          name: w.name,
          workstationId: w.workstationId,
          state: w.state,
          configName: w.configName,
        }));
    },

    async startWorkstation(name) {
      assertNoNetwork();
      log("startWorkstation", idFromName(name));
      let rec = workstations.get(name);
      if (!rec) {
        // Auto-materialize probe for start-after-ensure flows in tests.
        const id = idFromName(name);
        rec = {
          name,
          workstationId: id,
          state: "STATE_STARTING",
          configName: configName(),
          body: {},
          _polls: 0,
        };
        workstations.set(name, rec);
      } else {
        rec.state = "STATE_STARTING";
        rec._polls = 0;
      }
      if (!state.neverReachRunning && state.pollsUntilRunning <= 0) {
        rec.state = "STATE_RUNNING";
      }
      return {
        name: rec.name,
        workstationId: rec.workstationId,
        state: rec.state,
        configName: rec.configName,
      };
    },

    async stopWorkstation(name) {
      assertNoNetwork();
      log("stopWorkstation", idFromName(name));
      const rec = workstations.get(name);
      if (!rec) return { name, workstationId: idFromName(name), state: "DELETED" };
      rec.state = "STATE_STOPPING";
      // Immediate stop for mock determinism.
      rec.state = "STATE_STOPPED";
      return {
        name: rec.name,
        workstationId: rec.workstationId,
        state: rec.state,
        configName: rec.configName,
      };
    },

    async deleteWorkstation(name) {
      assertNoNetwork();
      log("deleteWorkstation", idFromName(name));
      const rec = workstations.get(name);
      if (rec) {
        rec.state = "DELETED";
        workstations.delete(name);
      }
    },

    async executeCommand({ workstationName: wsName, command }) {
      assertNoNetwork();
      log("executeCommand", command);
      state.executeCommandCount += 1;
      if (state.commandDelayMs > 0) {
        await new Promise((r) => setTimeout(r, state.commandDelayMs));
      }
      if (state.commandFails) {
        return { stdout: "", stderr: "mock command failed", exitCode: 1 };
      }
      const expectedEcho = command.includes("HEALTH_CHECK_OK");
      // Simulate container agent warm-up: connect succeeds (exit=0) but stdout
      // is empty until emptyStdoutBeforeSuccess attempts have elapsed.
      if (
        expectedEcho &&
        state.executeCommandCount <= state.emptyStdoutBeforeSuccess
      ) {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return {
        stdout: expectedEcho ? state.commandStdout : `ran:${command}`,
        stderr: "",
        exitCode: 0,
      };
    },

    // --- test helpers (not part of transport contract) ---

    seedCluster(id = GC1_CLUSTER) {
      const name = clusterName().replace(GC1_CLUSTER, id);
      clusters.set(name, { name, clusterId: id, state: "READY", body: {} });
      return name;
    },

    seedConfig(id = GC1_CONFIG, body) {
      const name = configName().replace(GC1_CONFIG, id);
      const parent = clusterName();
      configs.set(name, {
        name,
        configId: id,
        body: structuredClone(body || {}),
      });
      return { name, parent };
    },

    /**
     * Seed an orphan workstation from a simulated prior crash.
     * @param {string} workstationId
     * @param {WorkstationState} [state]
     */
    seedWorkstation(workstationId, state = "STATE_RUNNING") {
      const name = workstationName(workstationId);
      workstations.set(name, {
        name,
        workstationId,
        state,
        configName: configName(),
        body: {},
        _polls: 0,
      });
      return name;
    },

    seedNonGc1Workstation(workstationId, state = "STATE_RUNNING") {
      const parent = configName();
      const name = `${parent}/workstations/${workstationId}`;
      workstations.set(name, {
        name,
        workstationId,
        state,
        configName: parent,
        body: {},
        _polls: 0,
      });
      return name;
    },

    getCallLog() {
      return [...callLog];
    },

    getNetworkCallCount() {
      return networkCalls;
    },

    getDebugStats() {
      return {
        kind: "mock",
        networkCalls,
        callLog: [...callLog],
        clusterCount: clusters.size,
        configCount: configs.size,
        workstationCount: workstations.size,
        workstationIds: [...workstations.values()].map((w) => w.workstationId),
      };
    },

    /** Force a workstation into a stuck CREATING/STARTING state. */
    setNeverReachRunning(value) {
      state.neverReachRunning = value === true;
    },

    setCommandFails(value) {
      state.commandFails = value === true;
    },

    setEmptyStdoutBeforeSuccess(n) {
      state.emptyStdoutBeforeSuccess = Number(n) || 0;
      state.executeCommandCount = 0;
    },

    getExecuteCommandCount() {
      return state.executeCommandCount;
    },

    hasWorkstation(id) {
      return workstations.has(workstationName(id));
    },

    getWorkstationState(id) {
      const rec = workstations.get(workstationName(id));
      return rec ? rec.state : null;
    },

    /** Defaults used by manager when probe does not yet exist. */
    defaults: {
      cluster: GC1_CLUSTER,
      config: GC1_CONFIG,
      probe: GC1_PROBE_WORKSTATION,
      prefix: GC1_RESOURCE_PREFIX,
    },
  };
}
