/**
 * S1 — Unix-socket gateway server (NDJSON frames, one JSON object per line).
 */

import { createHash } from "node:crypto";
import { createServer } from "node:net";
import {
  mkdirSync,
  unlinkSync,
  existsSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createGatewayRuntime } from "./runtime.mjs";
import {
  GATEWAY_PROTOCOL_VERSION,
  GatewayMethods,
  makeError,
} from "./protocol.mjs";

/**
 * macOS/BSD sun_path is ~104 bytes; long checkout runtimeRoots overflow EINVAL.
 * Keep a stable short path under TMPDIR keyed by runtimeRoot hash, and mirror a
 * pointer file under runtimeRoot/gateway/ for operators.
 *
 * @param {string} runtimeRoot
 */
export function resolveGatewaySocketPath(runtimeRoot) {
  const hash = createHash("sha256")
    .update(String(runtimeRoot || ""))
    .digest("hex")
    .slice(0, 16);
  return join(tmpdir(), `pc-gw-${hash}.sock`);
}

/**
 * @param {string} runtimeRoot
 */
export function resolveGatewayPidPath(runtimeRoot) {
  return join(runtimeRoot, "gateway", "pathcode-gateway.pid");
}

/**
 * @param {string} runtimeRoot
 * @param {string} socketPath
 */
function writeSocketPointer(runtimeRoot, socketPath) {
  try {
    const dir = join(runtimeRoot, "gateway");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "socket.path"), `${socketPath}\n`, { mode: 0o600 });
  } catch {
    // ignore
  }
}

/**
 * @param {{
 *   runtime?: ReturnType<typeof createGatewayRuntime>,
 *   runtimeRoot?: string,
 *   packageRoot?: string,
 *   socketPath?: string,
 * }} [options]
 */
export async function startGatewayServer(options = {}) {
  const runtime =
    options.runtime ||
    createGatewayRuntime({
      runtimeRoot: options.runtimeRoot,
      packageRoot: options.packageRoot,
    });
  const socketPath =
    options.socketPath || resolveGatewaySocketPath(runtime.runtimeRoot);
  const pidPath = resolveGatewayPidPath(runtime.runtimeRoot);

  mkdirSync(dirname(socketPath), { recursive: true });
  mkdirSync(dirname(pidPath), { recursive: true });
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
    } catch {
      // ignore
    }
  }

  /** @type {Set<import('node:net').Socket>} */
  const clients = new Set();

  const server = createServer((socket) => {
    clients.add(socket);
    let buffer = "";
    /** @type {Set<string>} */
    const attached = new Set();

    const onEvent = (envelope) => {
      if (attached.size > 0 && !attached.has(envelope.taskId)) return;
      try {
        socket.write(`${JSON.stringify(envelope)}\n`);
      } catch {
        // ignore broken pipe
      }
    };
    // By default, stream all events to every connected client.
    // task.attach narrows optional filters later; for S1 broadcast is correct
    // for same-task multi-client observation.
    const offAll = runtime.onEvent(onEvent);

    socket.on("data", async (chunk) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          socket.write(
            `${JSON.stringify(makeError("0", "BAD_JSON", "invalid JSON line"))}\n`,
          );
          continue;
        }
        const id = typeof msg.id === "string" ? msg.id : "0";
        const method = typeof msg.method === "string" ? msg.method : "";
        const params =
          msg.params && typeof msg.params === "object" ? msg.params : {};

        if (method === GatewayMethods.TASK_ATTACH && params.taskId) {
          attached.add(String(params.taskId));
        }

        const response = await runtime.dispatch(method, params, id);
        try {
          socket.write(`${JSON.stringify(response)}\n`);
        } catch {
          // ignore
        }

        if (method === GatewayMethods.SHUTDOWN) {
          setImmediate(() => {
            try {
              stop();
            } catch {
              // ignore
            }
            process.exit(0);
          });
        }
      }
    });

    socket.on("close", () => {
      clients.delete(socket);
      offAll();
      // Lost client ≠ cancel engineering (S1 policy).
    });
    socket.on("error", () => {
      clients.delete(socket);
      offAll();
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      try {
        chmodSync(socketPath, 0o600);
      } catch {
        // ignore
      }
      writeSocketPointer(runtime.runtimeRoot, socketPath);
      try {
        writeFileSync(
          pidPath,
          `${process.pid}\n${socketPath}\n${GATEWAY_PROTOCOL_VERSION}\n`,
          { mode: 0o600 },
        );
      } catch {
        // ignore
      }
      resolve();
    });
  });

  function stop() {
    try {
      if (typeof runtime.markRunningTasksInterrupted === "function") {
        runtime.markRunningTasksInterrupted(
          "Gateway stop while task(s) still running",
        );
      }
    } catch {
      // ignore
    }
    for (const c of clients) {
      try {
        c.destroy();
      } catch {
        // ignore
      }
    }
    clients.clear();
    try {
      server.close();
    } catch {
      // ignore
    }
    try {
      if (existsSync(socketPath)) unlinkSync(socketPath);
    } catch {
      // ignore
    }
    try {
      if (existsSync(pidPath)) unlinkSync(pidPath);
    } catch {
      // ignore
    }
  }

  return {
    runtime,
    socketPath,
    pidPath,
    server,
    stop,
  };
}
