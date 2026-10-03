import { createHash } from "node:crypto";
import { createServer } from "node:net";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { isPidAlive } from "../../ag10/task-continuity.mjs";
import { createBuildCoordinatorService } from "./service.mjs";
import {
  BuildCoordinatorMethods,
  makeCoordinatorError,
} from "./protocol.mjs";

export function resolveBuildCoordinatorSocketPath(runtimeRoot) {
  const local = join(runtimeRoot, "build-coordinator", "coordinator.sock");
  // sockaddr_un.sun_path is short on macOS. Normal PATH runtime roots fit and
  // keep ownership self-contained; only unusually long roots use /tmp.
  if (Buffer.byteLength(local) < 96) return local;
  const hash = createHash("sha256")
    .update(String(runtimeRoot || ""))
    .digest("hex")
    .slice(0, 16);
  return join("/tmp", `pc-build-${hash}.sock`);
}

export function resolveBuildCoordinatorPidPath(runtimeRoot) {
  return join(runtimeRoot, "build-coordinator", "coordinator.pid");
}

export async function startBuildCoordinatorServer(options) {
  if (options.scopedBuildId !== undefined &&
      (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.scopedBuildId) ||
       options.service)) {
    throw new Error("Invalid scoped coordinator invocation");
  }
  const socketPath =
    options.socketPath ||
    resolveBuildCoordinatorSocketPath(options.runtimeRoot);
  const pidPath = resolveBuildCoordinatorPidPath(options.runtimeRoot);
  mkdirSync(dirname(socketPath), { recursive: true });
  mkdirSync(dirname(pidPath), { recursive: true });

  // Claim host ownership before Gateway connection, startup reconciliation, or
  // loops. `wx` makes concurrent ensure/spawn attempts single-winner.
  for (;;) {
    try {
      writeFileSync(pidPath, `${process.pid}\n${socketPath}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let ownerPid = null;
      try {
        ownerPid = Number(readFileSync(pidPath, "utf8").split("\n")[0]);
      } catch {
        ownerPid = null;
      }
      if (Number.isFinite(ownerPid) && isPidAlive(ownerPid)) {
        const owned = new Error(
          `PATH Build coordinator already owned by pid ${ownerPid}`,
        );
        owned.code = "COORDINATOR_ALREADY_RUNNING";
        throw owned;
      }
      try {
        unlinkSync(pidPath);
      } catch {
        // Another contender reclaimed it; retry the atomic claim.
      }
    }
  }

  let service;
  try {
    service =
      options.service || (await createBuildCoordinatorService(options));
  } catch (error) {
    try {
      unlinkSync(pidPath);
    } catch {
      // ignore
    }
    throw error;
  }
  if (existsSync(socketPath)) unlinkSync(socketPath);

  const clients = new Set();
  const server = createServer((socket) => {
    clients.add(socket);
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        void (async () => {
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            socket.write(
              `${JSON.stringify(makeCoordinatorError("0", "BAD_JSON", "invalid JSON line"))}\n`,
            );
            return;
          }
          const id = typeof message.id === "string" ? message.id : "0";
          const method = String(message.method || "");
          try {
            const result = await service.dispatch(
              method,
              message.params && typeof message.params === "object"
                ? message.params
                : {},
            );
            socket.write(`${JSON.stringify({ id, result })}\n`);
            if (method === BuildCoordinatorMethods.SHUTDOWN) {
              setImmediate(() => {
                void stop().finally(() => process.exit(0));
              });
            }
          } catch (error) {
            socket.write(
              `${JSON.stringify(
                makeCoordinatorError(
                  id,
                  error?.code || "COORDINATOR_ERROR",
                  error instanceof Error ? error.message : String(error),
                ),
              )}\n`,
            );
          }
        })();
      }
    });
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
  } catch (error) {
    await service.close();
    try {
      unlinkSync(pidPath);
    } catch {
      // ignore
    }
    throw error;
  }
  chmodSync(socketPath, 0o600);
  if (service.whenReady) {
    try {
      await service.whenReady;
    } catch (error) {
      server.close();
      try {
        await service.close();
      } catch {
        // close is best-effort after a failed recovery
      }
      try {
        unlinkSync(socketPath);
      } catch {
        // ignore
      }
      try {
        unlinkSync(pidPath);
      } catch {
        // ignore
      }
      throw error;
    }
  }

  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    for (const client of clients) client.destroy();
    await service.close();
    await new Promise((resolve) => server.close(resolve));
    try {
      unlinkSync(socketPath);
    } catch {
      // already gone
    }
    try {
      unlinkSync(pidPath);
    } catch {
      // already gone
    }
  }

  return {
    server,
    service,
    socketPath,
    pidPath,
    stop,
  };
}
