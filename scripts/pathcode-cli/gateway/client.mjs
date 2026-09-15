/**
 * S1 — PATH Gateway client (Unix socket NDJSON).
 */

import { createConnection } from "node:net";
import { EventEmitter } from "node:events";
import {
  GatewayMethods,
  makeRequest,
} from "./protocol.mjs";
import { resolveGatewaySocketPath } from "./server.mjs";
import { resolvePathRuntimeRoot } from "../paths.mjs";

/**
 * @param {{
 *   socketPath?: string,
 *   runtimeRoot?: string,
 *   connectTimeoutMs?: number,
 * }} [options]
 */
export function createGatewayClient(options = {}) {
  const runtimeRoot =
    options.runtimeRoot || resolvePathRuntimeRoot();
  const socketPath =
    options.socketPath || resolveGatewaySocketPath(runtimeRoot);
  const connectTimeoutMs =
    typeof options.connectTimeoutMs === "number"
      ? options.connectTimeoutMs
      : 8_000;

  /** @type {import('node:net').Socket | null} */
  let socket = null;
  let buffer = "";
  let connected = false;
  const pending = new Map();
  const bus = new EventEmitter();
  bus.setMaxListeners(50);

  function handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg && msg.type === "event") {
      bus.emit("event", msg);
      if (msg.taskId) bus.emit(`task:${msg.taskId}`, msg);
      return;
    }
    if (msg && typeof msg.id === "string" && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  }

  /**
   * @returns {Promise<void>}
   */
  function connect() {
    if (connected && socket) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const sock = createConnection({ path: socketPath });
      const timer = setTimeout(() => {
        try {
          sock.destroy();
        } catch {
          // ignore
        }
        reject(new Error(`gateway connect timeout: ${socketPath}`));
      }, connectTimeoutMs);

      sock.on("connect", () => {
        clearTimeout(timer);
        socket = sock;
        connected = true;
        resolve();
      });
      sock.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) handleLine(line);
        }
      });
      sock.on("error", (err) => {
        clearTimeout(timer);
        connected = false;
        if (!socket) reject(err);
        else bus.emit("error", err);
      });
      sock.on("close", () => {
        connected = false;
        socket = null;
        for (const [id, { reject: rej }] of pending) {
          pending.delete(id);
          rej(new Error(`gateway closed while waiting for ${id}`));
        }
        bus.emit("close");
      });
    });
  }

  /**
   * @param {string} method
   * @param {Record<string, unknown>} [params]
   */
  async function request(method, params = {}) {
    await connect();
    const req = makeRequest(method, params);
    return new Promise((resolve, reject) => {
      pending.set(req.id, { resolve, reject });
      try {
        socket.write(`${JSON.stringify(req)}\n`);
      } catch (err) {
        pending.delete(req.id);
        reject(err);
      }
    });
  }

  async function hello(role = "cli") {
    const res = await request(GatewayMethods.HELLO, { role });
    if (res.error) throw new Error(res.error.message);
    return res.result;
  }

  async function bindProject(cwd) {
    const res = await request(GatewayMethods.PROJECT_BIND, { cwd });
    if (res.error) throw new Error(res.error.message);
    return res.result;
  }

  async function startTask(objective, extra = {}) {
    const res = await request(GatewayMethods.TASK_START, {
      objective,
      ...extra,
    });
    if (res.error) throw new Error(res.error.message);
    return res.result;
  }

  async function attachTask(taskId) {
    const res = await request(GatewayMethods.TASK_ATTACH, { taskId });
    if (res.error) throw new Error(res.error.message);
    return res.result;
  }

  async function snapshotTask(taskId) {
    const res = await request(GatewayMethods.TASK_SNAPSHOT, { taskId });
    if (res.error) throw new Error(res.error.message);
    return res.result;
  }

  async function steerTask(taskId, text) {
    const res = await request(GatewayMethods.TASK_STEER, { taskId, text });
    if (res.error) throw new Error(res.error.message);
    return res.result;
  }

  async function cancelTask(taskId) {
    const res = await request(GatewayMethods.TASK_CANCEL, { taskId });
    if (res.error) throw new Error(res.error.message);
    return res.result;
  }

  async function listCapabilities() {
    const res = await request(GatewayMethods.CAPABILITIES, {});
    if (res.error) throw new Error(res.error.message);
    return res.result;
  }

  async function getResult(taskId) {
    const res = await request(GatewayMethods.RESULT_GET, { taskId });
    if (res.error) throw new Error(res.error.message);
    return res.result;
  }

  /**
   * Poll until the task leaves `running` (socket clients have no shared Promise).
   * @param {string} taskId
   * @param {number} [timeoutMs]
   * @param {number} [pollMs]
   */
  async function awaitTask(taskId, timeoutMs = 1_800_000, pollMs = 750) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const snap = await snapshotTask(taskId);
      if (!snap || snap.status !== "running") return snap;
      if (Date.now() >= deadline) {
        throw new Error(`task ${taskId} timed out after ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  function onEvent(fn) {
    bus.on("event", fn);
    return () => bus.off("event", fn);
  }

  function onTaskEvent(taskId, fn) {
    const key = `task:${taskId}`;
    bus.on(key, fn);
    return () => bus.off(key, fn);
  }

  function close() {
    try {
      socket?.end();
    } catch {
      // ignore
    }
    socket = null;
    connected = false;
  }

  return {
    socketPath,
    runtimeRoot,
    connect,
    hello,
    bindProject,
    startTask,
    attachTask,
    snapshotTask,
    steerTask,
    cancelTask,
    listCapabilities,
    getResult,
    awaitTask,
    request,
    onEvent,
    onTaskEvent,
    close,
    isConnected: () => connected,
  };
}
