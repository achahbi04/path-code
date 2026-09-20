import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isPidAlive } from "../../ag10/task-continuity.mjs";
import { createBuildCoordinatorClient } from "./client.mjs";
import {
  resolveBuildCoordinatorPidPath,
  resolveBuildCoordinatorSocketPath,
} from "./server.mjs";

const SERVER_MAIN = join(dirname(fileURLToPath(import.meta.url)), "server-main.mjs");

async function connectIfReady(runtimeRoot, socketPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) {
      const client = createBuildCoordinatorClient({
        runtimeRoot,
        socketPath,
        connectTimeoutMs: Math.min(timeoutMs, 2_000),
      });
      try {
        await client.connect();
        await client.hello("ensure");
        return client;
      } catch {
        client.close();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

export async function ensureBuildCoordinator(options) {
  const { runtimeRoot, packageRoot } = options;
  const socketPath = resolveBuildCoordinatorSocketPath(runtimeRoot);
  const pidPath = resolveBuildCoordinatorPidPath(runtimeRoot);
  mkdirSync(dirname(pidPath), { recursive: true });

  const existing = await connectIfReady(runtimeRoot, socketPath, 1_000);
  if (existing) {
    return { client: existing, socketPath, started: false };
  }

  let recordedPid = null;
  try {
    recordedPid = Number(readFileSync(pidPath, "utf8").split("\n")[0]);
  } catch {
    recordedPid = null;
  }
  if (Number.isFinite(recordedPid) && isPidAlive(recordedPid)) {
    const warming = await connectIfReady(runtimeRoot, socketPath, 10_000);
    if (warming) {
      return { client: warming, socketPath, started: false };
    }
    throw new Error(
      `PATH Build coordinator pid ${recordedPid} is alive but its socket is unavailable`,
    );
  }
  try {
    if (existsSync(pidPath)) unlinkSync(pidPath);
  } catch {
    // ignore stale ownership
  }
  try {
    if (existsSync(socketPath)) unlinkSync(socketPath);
  } catch {
    // ignore stale socket
  }

  const child = spawn(process.execPath, [SERVER_MAIN], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PATHCODE_RUNTIME_ROOT: runtimeRoot,
      PATHCODE_PACKAGE_ROOT: packageRoot,
      PATHCODE_BUILD_COORDINATOR_FAKE: options.fakeMode ? "1" : "0",
      PATHCODE_PREFERRED_ENGINE: options.preferredEngine || "",
    },
  });
  child.unref();
  const client = await connectIfReady(runtimeRoot, socketPath, 25_000);
  if (!client) {
    throw new Error(
      `PATH Build coordinator failed to start: ${socketPath}`,
    );
  }
  return {
    client,
    socketPath,
    started: true,
    pid: child.pid || null,
  };
}
