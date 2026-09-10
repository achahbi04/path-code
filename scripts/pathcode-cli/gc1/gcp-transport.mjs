/**
 * Phase GC1-a — real GCP Workstations REST transport (europe-west4).
 *
 * Constructed ONLY when process.env.GC1_LIVE_SMOKE === "1" (operator live smoke).
 * Uses impersonated ADC targeting the Control SA. No JSON key path.
 *
 * google-auth-library is loaded only through auth.mjs (dynamic import).
 * Command channel: `gcloud workstations ssh --command=…` (no REST execute API).
 */

import { spawn } from "node:child_process";
import {
  GC1_CLUSTER,
  GC1_CONFIG,
  GC1_PROJECT_ID,
  GC1_REGION,
  GC1_WORKSTATIONS_API_BASE,
  clusterName,
  configName,
  locationParent,
} from "./constants.mjs";
import {
  assertLiveSmokeAuthorized,
  createImpersonatedControlAuth,
} from "./auth.mjs";

/**
 * @param {object} [opts]
 * @param {object} [opts.auth] pre-built impersonated auth
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {boolean} [opts.skipEnvGate] test-only — NEVER set in production callers
 */
export async function createGcpWorkstationTransport(opts = {}) {
  if (!opts.skipEnvGate) {
    assertLiveSmokeAuthorized();
  }

  const auth = opts.auth || (await createImpersonatedControlAuth());
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  let networkCalls = 0;

  async function authedFetch(path, init = {}) {
    networkCalls += 1;
    const headers = await auth.getRequestHeaders();
    const url = path.startsWith("http")
      ? path
      : `${GC1_WORKSTATIONS_API_BASE}/${path.replace(/^\//, "")}`;
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...headers,
        ...(init.headers || {}),
      },
    });
    if (res.status === 404) return { notFound: true, status: 404 };
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(
        `GCP Workstations API ${res.status}: ${text.slice(0, 500)}`,
      );
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  async function pollOperation(op, deadlineMs = 300_000) {
    if (!op || !op.name) return op;
    if (op.done) {
      if (op.error) throw new Error(`LRO failed: ${JSON.stringify(op.error)}`);
      return op.response || op;
    }
    const started = Date.now();
    let current = op;
    while (!current.done) {
      if (Date.now() - started > deadlineMs) {
        throw new Error(`LRO deadline exceeded: ${op.name}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
      current = await authedFetch(op.name);
    }
    if (current.error) {
      throw new Error(`LRO failed: ${JSON.stringify(current.error)}`);
    }
    return current.response || current;
  }

  function mapWorkstation(raw) {
    if (!raw || !raw.name) return null;
    const parts = raw.name.split("/");
    return {
      name: raw.name,
      workstationId: parts[parts.length - 1],
      state: raw.state || "STATE_UNSPECIFIED",
      configName: parts.slice(0, -2).join("/"),
    };
  }

  return {
    kind: "gcp",
    region: GC1_REGION,
    projectId: GC1_PROJECT_ID,
    controlSa: auth.targetPrincipal,

    async createCluster(id, body = {}) {
      const parent = locationParent();
      const op = await authedFetch(
        `${parent}/workstationClusters?workstationClusterId=${encodeURIComponent(id)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      const done = await pollOperation(op);
      return {
        name: done.name || clusterName().replace(GC1_CLUSTER, id),
        clusterId: id,
        state: done.state || "READY",
      };
    },

    async getCluster(name) {
      const res = await authedFetch(name);
      if (res?.notFound) return null;
      return {
        name: res.name,
        clusterId: res.name.split("/").pop(),
        state: res.state || "READY",
      };
    },

    async listClusters(parent = locationParent()) {
      const res = await authedFetch(`${parent}/workstationClusters`);
      return (res.workstationClusters || []).map((c) => ({
        name: c.name,
        clusterId: c.name.split("/").pop(),
        state: c.state || "READY",
      }));
    },

    async deleteCluster(name) {
      const op = await authedFetch(name, { method: "DELETE" });
      await pollOperation(op);
    },

    async createConfig(parent, id, body) {
      const op = await authedFetch(
        `${parent}/workstationConfigs?workstationConfigId=${encodeURIComponent(id)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      const done = await pollOperation(op);
      return {
        name: done.name || `${parent}/workstationConfigs/${id}`,
        configId: id,
        body,
      };
    },

    async getConfig(name) {
      const res = await authedFetch(name);
      if (res?.notFound) return null;
      return {
        name: res.name,
        configId: res.name.split("/").pop(),
        body: res,
      };
    },

    async listConfigs(parent = clusterName()) {
      const res = await authedFetch(`${parent}/workstationConfigs`);
      return (res.workstationConfigs || []).map((c) => ({
        name: c.name,
        configId: c.name.split("/").pop(),
        body: c,
      }));
    },

    async deleteConfig(name) {
      const op = await authedFetch(name, { method: "DELETE" });
      await pollOperation(op);
    },

    async createWorkstation(parent, id, body = {}) {
      const op = await authedFetch(
        `${parent}/workstations?workstationId=${encodeURIComponent(id)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      const done = await pollOperation(op);
      return mapWorkstation(done) || {
        name: `${parent}/workstations/${id}`,
        workstationId: id,
        state: "CREATING",
        configName: parent,
      };
    },

    async getWorkstation(name) {
      const res = await authedFetch(name);
      if (res?.notFound) return null;
      return mapWorkstation(res);
    },

    async listWorkstations(parent = configName()) {
      const res = await authedFetch(`${parent}/workstations`);
      return (res.workstations || []).map(mapWorkstation).filter(Boolean);
    },

    async startWorkstation(name) {
      const op = await authedFetch(`${name}:start`, { method: "POST", body: "{}" });
      await pollOperation(op);
      return (await this.getWorkstation(name)) || {
        name,
        workstationId: name.split("/").pop(),
        state: "STATE_STARTING",
      };
    },

    async stopWorkstation(name) {
      const op = await authedFetch(`${name}:stop`, { method: "POST", body: "{}" });
      await pollOperation(op);
      return (await this.getWorkstation(name)) || {
        name,
        workstationId: name.split("/").pop(),
        state: "STATE_STOPPED",
      };
    },

    async deleteWorkstation(name) {
      const op = await authedFetch(name, { method: "DELETE" });
      await pollOperation(op);
    },

    async executeCommand({ workstationName: wsName, command }) {
      const workstationId = wsName.split("/").pop();
      const args = [
        "workstations",
        "ssh",
        workstationId,
        `--project=${GC1_PROJECT_ID}`,
        `--region=${GC1_REGION}`,
        `--cluster=${GC1_CLUSTER}`,
        `--config=${GC1_CONFIG}`,
        `--command=${command}`,
      ];
      const result = await runGcloud(args);
      return result;
    },

    getDebugStats() {
      return {
        kind: "gcp",
        networkCalls,
        controlSa: auth.targetPrincipal,
      };
    },
  };
}

function runGcloud(args) {
  return new Promise((resolve) => {
    const child = spawn("gcloud", args, {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });
    child.on("error", (err) => {
      resolve({
        stdout: "",
        stderr: String(err.message || err),
        exitCode: 1,
      });
    });
  });
}
