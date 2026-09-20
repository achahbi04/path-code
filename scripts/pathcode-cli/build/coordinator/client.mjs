import { createConnection } from "node:net";
import {
  BuildCoordinatorMethods,
  makeCoordinatorRequest,
} from "./protocol.mjs";
import { resolveBuildCoordinatorSocketPath } from "./server.mjs";

export function createBuildCoordinatorClient(options) {
  const runtimeRoot = options.runtimeRoot;
  const socketPath =
    options.socketPath || resolveBuildCoordinatorSocketPath(runtimeRoot);
  const timeoutMs = options.connectTimeoutMs || 8_000;
  let socket = null;
  let connecting = null;
  let buffer = "";
  let connected = false;
  const pending = new Map();

  function connect() {
    if (connected && socket) return Promise.resolve();
    if (connecting) return connecting;
    connecting = new Promise((resolve, reject) => {
      const next = createConnection({ path: socketPath });
      const timer = setTimeout(() => {
        next.destroy();
        connecting = null;
        reject(new Error(`Build coordinator connect timeout: ${socketPath}`));
      }, timeoutMs);
      next.on("connect", () => {
        clearTimeout(timer);
        socket = next;
        connected = true;
        connecting = null;
        resolve();
      });
      next.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          const waiter = pending.get(message.id);
          if (!waiter) continue;
          pending.delete(message.id);
          if (message.error) {
            const error = new Error(message.error.message);
            error.code = message.error.code;
            waiter.reject(error);
          } else {
            waiter.resolve(message.result);
          }
        }
      });
      next.on("error", (error) => {
        clearTimeout(timer);
        if (!connected) {
          connecting = null;
          reject(error);
        }
      });
      next.on("close", () => {
        if (socket === next) {
          connected = false;
          socket = null;
        }
        connecting = null;
        for (const [id, waiter] of pending) {
          pending.delete(id);
          waiter.reject(new Error(`Build coordinator closed while waiting for ${id}`));
        }
      });
    });
    return connecting;
  }

  async function request(method, params = {}) {
    await connect();
    const message = makeCoordinatorRequest(method, params);
    return new Promise((resolve, reject) => {
      pending.set(message.id, { resolve, reject });
      socket.write(`${JSON.stringify(message)}\n`, (error) => {
        if (!error) return;
        pending.delete(message.id);
        reject(error);
      });
    });
  }

  function close() {
    socket?.end();
    socket = null;
    connected = false;
    connecting = null;
  }

  return {
    runtimeRoot,
    socketPath,
    connect,
    close,
    request,
    hello: (role = "surface") =>
      request(BuildCoordinatorMethods.HELLO, { role }),
    status: () => request(BuildCoordinatorMethods.STATUS),
    startBuild: (outcome, options = {}) =>
      request(BuildCoordinatorMethods.BUILD_START, { outcome, options }),
    getBuild: (buildId) =>
      request(BuildCoordinatorMethods.BUILD_GET, { buildId }),
    listBuilds: () => request(BuildCoordinatorMethods.BUILD_LIST),
    latestBuild: () => request(BuildCoordinatorMethods.BUILD_LATEST),
    getBuildEvents: (buildId, options = {}) =>
      request(BuildCoordinatorMethods.BUILD_EVENTS, { buildId, ...options }),
    messageBuild: (buildId, input) =>
      request(BuildCoordinatorMethods.BUILD_MESSAGE, { buildId, input }),
    stopBuild: (buildId) =>
      request(BuildCoordinatorMethods.BUILD_STOP, { buildId }),
    resumeBuild: (buildId) =>
      request(BuildCoordinatorMethods.BUILD_RESUME, { buildId }),
    recoverBuild: (buildId) =>
      request(BuildCoordinatorMethods.BUILD_RECOVER, { buildId }),
    tickBuild: (buildId) =>
      request(BuildCoordinatorMethods.BUILD_TICK, { buildId }),
    runBuild: (buildId, options = {}) =>
      request(BuildCoordinatorMethods.BUILD_RUN, { buildId, options }),
    ensureLoop: (buildId) =>
      request(BuildCoordinatorMethods.BUILD_ENSURE_LOOP, { buildId }),
    getRuntime: (buildId) =>
      request(BuildCoordinatorMethods.RUNTIME_GET, { buildId }),
    syncRuntime: (buildId) =>
      request(BuildCoordinatorMethods.RUNTIME_SYNC, { buildId }),
    startRuntime: (buildId) =>
      request(BuildCoordinatorMethods.RUNTIME_START, { buildId }),
    restartRuntime: (buildId) =>
      request(BuildCoordinatorMethods.RUNTIME_RESTART, { buildId }),
    captureRuntimeEvidence: (buildId) =>
      request(BuildCoordinatorMethods.RUNTIME_EVIDENCE, { buildId }),
    stopRuntime: (buildId) =>
      request(BuildCoordinatorMethods.RUNTIME_STOP, { buildId }),
    shutdown: () => request(BuildCoordinatorMethods.SHUTDOWN),
  };
}
