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
    /** @type {Array<{ stdout?: string, stderr?: string, exitCode?: number }>|null} */
    scriptedResults: Array.isArray(options.scriptedResults)
      ? [...options.scriptedResults]
      : null,
    /** @type {object|null} */
    workerProcessScript: null,
    workerInstalled: false,
    /** @type {object[]} */
    workerRequestLog: [],
    /** @type {Record<string, string>} */
    remoteEnv: { ...(options.remoteEnv ?? {}) },
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

  /** In-memory remote filesystem for GC1-b hydration tests ($0, no network). */
  /** @type {Map<string, Buffer>} */
  const remoteFs = new Map();
  /** @type {string|null} */
  let remoteGitSnapshotRoot = null;

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


  function writeRemoteFs(remotePath, content, encoding = "utf8") {
    const p = String(remotePath);
    let buf;
    if (Buffer.isBuffer(content)) buf = content;
    else if (encoding === "base64" || encoding === "binaryBase64") {
      buf = Buffer.from(String(content), "base64");
    } else {
      buf = Buffer.from(String(content), encoding || "utf8");
    }
    remoteFs.set(p, buf);
    log("writeRemoteFile", p);
    return { ok: true, remotePath: p, bytes: buf.length };
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
      if (state.scriptedResults) {
        if (state.scriptedResults.length === 0) {
          return {
            stdout: "",
            stderr: "mock: scripted results exhausted",
            exitCode: 1,
          };
        }
        const next = state.scriptedResults.shift();
        return {
          stdout: next.stdout ?? "",
          stderr: next.stderr ?? "",
          exitCode: next.exitCode ?? 0,
        };
      }
      if (state.commandFails) {
        return { stdout: "", stderr: "mock command failed", exitCode: 1 };
      }

      // GC1-b: honor `cd '<cwd>' && ...` wrappers from workspace hydrator.
      let effectiveCwd = null;
      let effectiveCmd = command;
      const cdMatch = String(command).match(
        /^cd\s+(?:'([^']*)'|"([^"]*)")\s+&&\s+([\s\S]*)$/,
      );
      if (cdMatch) {
        effectiveCwd = cdMatch[1] || cdMatch[2];
        effectiveCmd = cdMatch[3];
      }

      const trimmed = String(effectiveCmd).trim();
      if (trimmed === "pwd") {
        return {
          stdout: `${effectiveCwd || "/home/user"}\n`,
          stderr: "",
          exitCode: 0,
        };
      }

      // GC1-c credential boundary proof: evaluate presence of forbidden keys
      // against seeded remoteEnv — never echo values.
      if (
        trimmed.includes("CREDENTIAL_BOUNDARY_PASS") ||
        trimmed.includes("CREDENTIAL_BOUNDARY_VIOLATION")
      ) {
        const forbidden = [
          "OPENAI_API_KEY",
          "PATHCODE_OPENAI_API_KEY",
          "PATHCODE_LIVE_OPENAI",
          "PATHCODE_GC1C_SECRET_CANARY",
        ];
        for (const key of forbidden) {
          if (
            Object.prototype.hasOwnProperty.call(state.remoteEnv, key) &&
            state.remoteEnv[key] != null
          ) {
            return {
              stdout: `CREDENTIAL_BOUNDARY_VIOLATION:${key}\n`,
              stderr: "",
              exitCode: 1,
            };
          }
        }
        return {
          stdout: "CREDENTIAL_BOUNDARY_PASS\n",
          stderr: "",
          exitCode: 0,
        };
      }

      // Read a hydrated remote file: `cat '<path>'` or `test -f ...`
      const catMatch = trimmed.match(/^cat\s+(?:'([^']*)'|"([^"]*)")\s*$/);
      if (catMatch) {
        const p = catMatch[1] || catMatch[2];
        const abs = p.startsWith("/")
          ? p
          : effectiveCwd
            ? `${effectiveCwd.replace(/\/+$/, "")}/${p}`
            : p;
        const buf = remoteFs.get(abs);
        if (!buf) {
          return { stdout: "", stderr: `cat: ${p}: No such file`, exitCode: 1 };
        }
        return { stdout: buf.toString("utf8"), stderr: "", exitCode: 0 };
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


    /**
     * Write a remote file into the in-memory FS (GC1-b hydrator).
     * @param {{ remotePath: string, content: string|Buffer, encoding?: string, binaryBase64?: boolean }} opts
     */
    async writeRemoteFile(opts) {
      assertNoNetwork();
      const encoding = opts.binaryBase64
        ? "base64"
        : opts.encoding || "utf8";
      return writeRemoteFs(opts.remotePath, opts.content, encoding);
    },

    /**
     * Upload a text (or base64-as-text) file to the remote FS.
     * @param {{ remotePath: string, text: string }} opts
     */
    async uploadTextFile(opts) {
      assertNoNetwork();
      return writeRemoteFs(opts.remotePath, opts.text, "utf8");
    },

    /**
     * Expand hydration file payloads under remoteRoot (mock stands in for tar -xzf).
     * @param {{ remoteRoot: string, files: Array<{ relativePath: string, content: Buffer|string }>, archiveRemotePath?: string }} opts
     */
    async materializeHydrationFiles(opts) {
      assertNoNetwork();
      const root = String(opts.remoteRoot).replace(/\/+$/, "");
      log("materializeHydrationFiles", root);
      for (const f of opts.files || []) {
        const rel = String(f.relativePath).replace(/^\/+/, "");
        // Confinement: refuse .. escape
        if (rel.split("/").includes("..") || rel === ".git" || rel.startsWith(".git/")) {
          continue;
        }
        const remotePath = `${root}/${rel}`;
        const content = Buffer.isBuffer(f.content)
          ? f.content
          : Buffer.from(String(f.content), "utf8");
        remoteFs.set(remotePath, content);
      }
      // Drop any leaked .git pointer file if present in archive staging.
      remoteFs.delete(`${root}/.git`);
      return { ok: true, count: (opts.files || []).length };
    },

    /**
     * Record that a proper remote git snapshot was initialized (no Mac gitdir).
     * @param {{ remoteRoot: string, message?: string }} opts
     */
    async initRemoteGitSnapshot(opts) {
      assertNoNetwork();
      const root = String(opts.remoteRoot).replace(/\/+$/, "");
      log("initRemoteGitSnapshot", root);
      remoteGitSnapshotRoot = root;
      // Represent a real git directory — never a `gitdir:` pointer file.
      remoteFs.set(
        `${root}/.git/HEAD`,
        Buffer.from("ref: refs/heads/main\n", "utf8"),
      );
      remoteFs.set(
        `${root}/.git/gc1-snapshot`,
        Buffer.from(opts.message || "gc1 hydrate snapshot", "utf8"),
      );
      return { ok: true, remoteRoot: root, gitStrategy: "archive-init-snapshot" };
    },

    readRemoteFile(remotePath) {
      const buf = remoteFs.get(String(remotePath));
      return buf ? buf.toString("utf8") : null;
    },

    listRemoteFiles(prefix = "") {
      const p = String(prefix);
      return [...remoteFs.keys()]
        .filter((k) => !p || k.startsWith(p))
        .sort();
    },

    getRemoteGitSnapshotRoot() {
      return remoteGitSnapshotRoot;
    },

    hasRemoteGitPointerLeak(remoteRoot) {
      const root = String(remoteRoot).replace(/\/+$/, "");
      const pointer = remoteFs.get(`${root}/.git`);
      if (!pointer) return false;
      return /gitdir:\s*\/Users\//.test(pointer.toString("utf8"));
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

    /**
     * GC1-c: in-process remote worker simulation against remoteFs.
     * @param {{ workstationName: string, request: object }} opts
     */
    async invokeWorkerRequest(opts) {
      assertNoNetwork();
      const req = opts.request;
      state.workerRequestLog.push(structuredClone(req));
      log("invokeWorkerRequest", req?.op);
      const { dispatchWorkerRequest } = await import("./remote-worker.mjs");
      const scripted =
        state.workerProcessScript != null
          ? state.workerProcessScript
          : undefined;
      if (state.workerProcessScript != null) {
        state.workerProcessScript = null;
      }
      return dispatchWorkerRequest(req, {
        remoteFs,
        scriptedProcess: scripted,
        allowSpawn: options.allowWorkerSpawn === true,
      });
    },

    markWorkerInstalled(remotePath) {
      state.workerInstalled = true;
      writeRemoteFs(remotePath, "// mock worker installed\n", "utf8");
    },

    setWorkerProcessScript(script) {
      state.workerProcessScript = script ? { ...script } : null;
    },

    getWorkerRequestLog() {
      return state.workerRequestLog.map((r) => structuredClone(r));
    },

    clearWorkerRequestLog() {
      state.workerRequestLog = [];
    },

    /**
     * Seed remote process environment for credential-boundary proofs.
     * Values are never returned by the boundary command — only presence matters.
     * @param {Record<string, string>} env
     */
    seedRemoteEnv(env) {
      state.remoteEnv = { ...(env ?? {}) };
    },

    getRemoteEnv() {
      return { ...state.remoteEnv };
    },

    /** Expose remote FS map for GC1-c tests. */
    getRemoteFs() {
      return remoteFs;
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
