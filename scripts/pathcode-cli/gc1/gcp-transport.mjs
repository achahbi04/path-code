/**
 * Phase GC1-a — real GCP Workstations REST transport (europe-west4).
 *
 * Constructed ONLY when process.env.GC1_LIVE_SMOKE === "1" (operator live smoke).
 * Uses impersonated ADC targeting the Control SA. No JSON key path.
 *
 * google-auth-library is loaded only through auth.mjs (dynamic import).
 * Command channel: `gcloud workstations ssh --command=…` (no REST execute API).
 *
 * Auth attachment: EVERY Workstations REST call goes through `authedFetch`,
 * which forces `Authorization: Bearer <impersonated-token>`. Never spread a
 * Fetch `Headers` instance into a plain object (that yields `{}` → 401).
 */

import {
  GC1_CLUSTER,
  GC1_CONFIG,
  GC1_ERROR,
  GC1_PROJECT_ID,
  GC1_REGION,
  GC1_WORKSTATIONS_API_BASE,
  clusterName,
  configName,
  locationParent,
} from "./constants.mjs";
import {
  assertLiveSmokeAuthorized,
  buildBearerAuthHeaders,
  createImpersonatedControlAuth,
  hasBearerAuthorization,
} from "./auth.mjs";
import { createTunnelSession } from "./remote-exec.mjs";

/**
 * @param {object} [opts]
 * @param {object} [opts.auth] pre-built impersonated auth
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {boolean} [opts.skipEnvGate] test-only — NEVER set in production callers
 * @param {boolean} [opts.weakenAuthAttachment] P-falsification only — omit Bearer on getCluster
 */
export async function createGcpWorkstationTransport(opts = {}) {
  if (!opts.skipEnvGate) {
    assertLiveSmokeAuthorized();
  }

  const auth = opts.auth || (await createImpersonatedControlAuth());
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const weakenAuthAttachment = opts.weakenAuthAttachment === true;
  const tunnelSession = createTunnelSession();
  let networkCalls = 0;
  /** @type {Array<{ op: string, url: string, hasBearer: boolean }>} */
  const authAttachmentLog = [];

  /**
   * Single authenticated request helper — the only path to the Workstations API.
   * @param {string} path
   * @param {RequestInit & { headers?: Record<string, string> }} [init]
   * @param {{ op: string }} meta
   */
  async function authedFetch(path, init = {}, meta = { op: "unknown" }) {
    networkCalls += 1;
    const url = path.startsWith("http")
      ? path
      : `${GC1_WORKSTATIONS_API_BASE}/${path.replace(/^\//, "")}`;

    // Falsification: omit bearer on getCluster only — proves GC1A-I is load-bearing.
    const omitAuth =
      weakenAuthAttachment && meta.op === "getCluster";

    /** @type {Record<string, string>} */
    let authHeaders = {};
    if (!omitAuth) {
      authHeaders = await buildBearerAuthHeaders(auth);
      if (!hasBearerAuthorization(authHeaders)) {
        const err = new Error(
          `${GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE}: refusing Workstations API call without Bearer token`,
        );
        err.code = GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE;
        throw err;
      }
    }

    // Auth headers MUST win over init.headers — never allow a caller to strip Bearer.
    const headers = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      ...authHeaders,
    };

    authAttachmentLog.push({
      op: meta.op,
      url,
      hasBearer: hasBearerAuthorization(headers),
    });

    if (!omitAuth && !hasBearerAuthorization(headers)) {
      const err = new Error(
        `${GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE}: Authorization Bearer missing on ${meta.op}`,
      );
      err.code = GC1_ERROR.AUTH_IMPERSONATION_UNAVAILABLE;
      throw err;
    }

    const res = await fetchImpl(url, {
      ...init,
      headers,
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
      current = await authedFetch(op.name, {}, { op: "pollOperation" });
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
        { op: "createCluster" },
      );
      const done = await pollOperation(op);
      return {
        name: done.name || clusterName().replace(GC1_CLUSTER, id),
        clusterId: id,
        state: done.state || "READY",
      };
    },

    async getCluster(name) {
      const res = await authedFetch(name, {}, { op: "getCluster" });
      if (res?.notFound) return null;
      return {
        name: res.name,
        clusterId: res.name.split("/").pop(),
        state: res.state || "READY",
      };
    },

    async listClusters(parent = locationParent()) {
      const res = await authedFetch(
        `${parent}/workstationClusters`,
        {},
        { op: "listClusters" },
      );
      return (res.workstationClusters || []).map((c) => ({
        name: c.name,
        clusterId: c.name.split("/").pop(),
        state: c.state || "READY",
      }));
    },

    async deleteCluster(name) {
      const op = await authedFetch(name, { method: "DELETE" }, { op: "deleteCluster" });
      await pollOperation(op);
    },

    async createConfig(parent, id, body) {
      const op = await authedFetch(
        `${parent}/workstationConfigs?workstationConfigId=${encodeURIComponent(id)}`,
        { method: "POST", body: JSON.stringify(body) },
        { op: "createConfig" },
      );
      const done = await pollOperation(op);
      return {
        name: done.name || `${parent}/workstationConfigs/${id}`,
        configId: id,
        body,
      };
    },

    async getConfig(name) {
      const res = await authedFetch(name, {}, { op: "getConfig" });
      if (res?.notFound) return null;
      return {
        name: res.name,
        configId: res.name.split("/").pop(),
        body: res,
      };
    },

    async listConfigs(parent = clusterName()) {
      const res = await authedFetch(
        `${parent}/workstationConfigs`,
        {},
        { op: "listConfigs" },
      );
      return (res.workstationConfigs || []).map((c) => ({
        name: c.name,
        configId: c.name.split("/").pop(),
        body: c,
      }));
    },

    async deleteConfig(name) {
      const op = await authedFetch(name, { method: "DELETE" }, { op: "deleteConfig" });
      await pollOperation(op);
    },

    async createWorkstation(parent, id, body = {}) {
      const op = await authedFetch(
        `${parent}/workstations?workstationId=${encodeURIComponent(id)}`,
        { method: "POST", body: JSON.stringify(body) },
        { op: "createWorkstation" },
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
      const res = await authedFetch(name, {}, { op: "getWorkstation" });
      if (res?.notFound) return null;
      return mapWorkstation(res);
    },

    async listWorkstations(parent = configName()) {
      const res = await authedFetch(
        `${parent}/workstations`,
        {},
        { op: "listWorkstations" },
      );
      return (res.workstations || []).map(mapWorkstation).filter(Boolean);
    },

    async startWorkstation(name) {
      const op = await authedFetch(
        `${name}:start`,
        { method: "POST", body: "{}" },
        { op: "startWorkstation" },
      );
      await pollOperation(op);
      return (await this.getWorkstation(name)) || {
        name,
        workstationId: name.split("/").pop(),
        state: "STATE_STARTING",
      };
    },

    async stopWorkstation(name) {
      const op = await authedFetch(
        `${name}:stop`,
        { method: "POST", body: "{}" },
        { op: "stopWorkstation" },
      );
      await pollOperation(op);
      return (await this.getWorkstation(name)) || {
        name,
        workstationId: name.split("/").pop(),
        state: "STATE_STOPPED",
      };
    },

    async deleteWorkstation(name) {
      const op = await authedFetch(
        name,
        { method: "DELETE" },
        { op: "deleteWorkstation" },
      );
      await pollOperation(op);
    },

    async executeCommand({ workstationName: wsName, command, stdin }) {
      // Control-SA TCP tunnel + OpenSSH — NOT bare `gcloud workstations ssh`
      // (operator ADC lacks workstations.use; gcloud --command drops exit codes).
      // Session reuses one tunnel; config/cluster parsed from full resource name.
      return tunnelSession.execute({
        workstationName: wsName,
        command,
        stdin,
      });
    },

    async closeTunnelSession() {
      await tunnelSession.closeAll();
    },

    getDebugStats() {
      return {
        kind: "gcp",
        networkCalls,
        controlSa: auth.targetPrincipal,
        authAttachmentLog: [...authAttachmentLog],
        weakenAuthAttachment,
      };
    },

    /** @internal test helper — recorded auth attachment per REST op */
    getAuthAttachmentLog() {
      return [...authAttachmentLog];
    },
  };
}
