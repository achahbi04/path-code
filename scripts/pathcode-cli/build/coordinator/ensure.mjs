import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isPidAlive } from "../../ag10/task-continuity.mjs";
import { identityMatchesCurrentCheckout } from "../identity.mjs";
import { createBuildCoordinatorClient } from "./client.mjs";
import { BUILD_COORDINATOR_PROTOCOL_VERSION } from "./protocol.mjs";
import {
  resolveBuildCoordinatorPidPath,
  resolveBuildCoordinatorSocketPath,
} from "./server.mjs";

const SERVER_MAIN = join(dirname(fileURLToPath(import.meta.url)), "server-main.mjs");

function coordinatorLogPath(runtimeRoot) {
  return join(runtimeRoot, "build-coordinator", "coordinator.log");
}

function tailLog(path, max = 900) {
  try {
    const text = readFileSync(path, "utf8").trim();
    return text ? text.slice(-max) : "";
  } catch {
    return "";
  }
}

/**
 * @param {string} runtimeRoot
 * @param {string} socketPath
 * @param {number} timeoutMs
 */
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
        const hello = await client.hello("ensure");
        if (hello?.protocolVersion !== BUILD_COORDINATOR_PROTOCOL_VERSION) {
          client.close();
          const error = new Error(
            `PATH Build coordinator protocol mismatch: owner pid ${hello?.pid ?? "unknown"} speaks version ${hello?.protocolVersion ?? "unknown"} (${hello?.packageVersion || "unknown package"}); this build expects ${BUILD_COORDINATOR_PROTOCOL_VERSION}`,
          );
          error.code = "COORDINATOR_PROTOCOL_MISMATCH";
          throw error;
        }
        return { client, hello };
      } catch (error) {
        client.close();
        if (error?.code === "COORDINATOR_PROTOCOL_MISMATCH") throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

function readRecordedPid(pidPath) {
  try {
    return Number(readFileSync(pidPath, "utf8").split("\n")[0]);
  } catch {
    return null;
  }
}

function startingLockPath(runtimeRoot) {
  return join(runtimeRoot, "build-coordinator", "coordinator.starting");
}

function claimStartLock(lockPath) {
  try {
    writeFileSync(lockPath, `${process.pid}\n`, { mode: 0o600, flag: "wx" });
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return false;
  }
}

function releaseStartLock(lockPath) {
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch {
    // the next launch treats a dead lock owner as stale
  }
}

function reclaimDeadOwnership(pidPath, socketPath) {
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
}

function socketOwnerPid(socketPath) {
  try {
    const raw = execFileSync("lsof", ["-t", socketPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    });
    const pid = Number(String(raw).trim().split("\n")[0]);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stop a coordinator that is alive on this runtime but is not the current
 * checkout. Protocol mismatch still throws; only identity/stale owners are
 * replaced so a fresh Builder can attribute its run.
 */
async function retireStaleCoordinator(ready, pidPath, socketPath) {
  const pid =
    ready?.hello?.identity?.pid ??
    ready?.hello?.pid ??
    readRecordedPid(pidPath) ??
    socketOwnerPid(socketPath);
  try {
    await Promise.race([
      ready.client.shutdown(),
      sleep(1_500).then(() => {
        throw new Error("shutdown timeout");
      }),
    ]);
  } catch {
    // old coordinators ignore shutdown; SIGTERM below stops them
  }
  try {
    ready.client.close();
  } catch {
    // already closed
  }
  if (Number.isFinite(pid) && pid !== process.pid && isPidAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already exiting
    }
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline && isPidAlive(pid)) {
      await sleep(100);
    }
  }
  reclaimDeadOwnership(pidPath, socketPath);
}

async function acceptCurrentCoordinator(ready, packageRoot, pidPath, socketPath) {
  if (!ready) return null;
  if (identityMatchesCurrentCheckout(ready.hello?.identity, packageRoot)) {
    return ready.client;
  }
  await retireStaleCoordinator(ready, pidPath, socketPath);
  return null;
}

export async function ensureBuildCoordinator(options) {
  const { runtimeRoot, packageRoot } = options;
  const socketPath = resolveBuildCoordinatorSocketPath(runtimeRoot);
  const pidPath = resolveBuildCoordinatorPidPath(runtimeRoot);
  const logPath = coordinatorLogPath(runtimeRoot);
  mkdirSync(dirname(pidPath), { recursive: true });

  const existing = await acceptCurrentCoordinator(
    await connectIfReady(runtimeRoot, socketPath, 1_000),
    packageRoot,
    pidPath,
    socketPath,
  );
  if (existing) {
    return { client: existing, socketPath, started: false };
  }

  const recordedPid = readRecordedPid(pidPath);
  if (Number.isFinite(recordedPid) && isPidAlive(recordedPid)) {
    const warming = await acceptCurrentCoordinator(
      await connectIfReady(runtimeRoot, socketPath, 45_000),
      packageRoot,
      pidPath,
      socketPath,
    );
    if (warming) {
      return { client: warming, socketPath, started: false };
    }
    if (isPidAlive(recordedPid)) {
      const detail = tailLog(logPath);
      throw new Error(
        `PATH Build coordinator pid ${recordedPid} is alive but its socket is unavailable${detail ? `\n${detail}` : ""}`,
      );
    }
  }

  const lockPath = startingLockPath(runtimeRoot);
  if (!claimStartLock(lockPath)) {
    const lockPid = readRecordedPid(lockPath);
    if (Number.isFinite(lockPid) && isPidAlive(lockPid)) {
      const warming = await acceptCurrentCoordinator(
        await connectIfReady(runtimeRoot, socketPath, 45_000),
        packageRoot,
        pidPath,
        socketPath,
      );
      if (warming) return { client: warming, socketPath, started: false };
      throw new Error(
        `PATH Build coordinator start is owned by pid ${lockPid}, but it did not become ready`,
      );
    }
    releaseStartLock(lockPath);
    if (!claimStartLock(lockPath)) {
      const warming = await acceptCurrentCoordinator(
        await connectIfReady(runtimeRoot, socketPath, 45_000),
        packageRoot,
        pidPath,
        socketPath,
      );
      if (warming) return { client: warming, socketPath, started: false };
      throw new Error(`PATH Build coordinator start lock is busy: ${lockPath}`);
    }
  }

  const latestPid = readRecordedPid(pidPath);
  if (Number.isFinite(latestPid) && isPidAlive(latestPid)) {
    releaseStartLock(lockPath);
    const warming = await acceptCurrentCoordinator(
      await connectIfReady(runtimeRoot, socketPath, 45_000),
      packageRoot,
      pidPath,
      socketPath,
    );
    if (warming) return { client: warming, socketPath, started: false };
    throw new Error(
      `PATH Build coordinator pid ${latestPid} is alive but its socket is unavailable`,
    );
  }
  try {
    reclaimDeadOwnership(pidPath, socketPath);

    const logFd = openSync(logPath, "a");
    const child = spawn(process.execPath, [SERVER_MAIN], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        PATHCODE_RUNTIME_ROOT: runtimeRoot,
        PATHCODE_PACKAGE_ROOT: packageRoot,
        PATHCODE_BUILD_COORDINATOR_FAKE: options.fakeMode ? "1" : "0",
        PATHCODE_PREFERRED_ENGINE: options.preferredEngine || "",
      },
    });
    let childExit = null;
    child.on("exit", (code) => {
      childExit = code;
    });

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (childExit === 1) break;
      const ready = await connectIfReady(runtimeRoot, socketPath, 400);
      if (ready?.client) {
        child.unref();
        return {
          client: ready.client,
          socketPath,
          started: true,
          pid: child.pid || null,
        };
      }
    }

    if (child.pid && childExit == null && child.pid === readRecordedPid(pidPath)) {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        // the child may already have exited
      }
    }
    child.unref();
    const detail = tailLog(logPath);
    throw new Error(
      `PATH Build coordinator failed to start: ${socketPath}${detail ? `\n${detail}` : ""}`,
    );
  } finally {
    releaseStartLock(lockPath);
  }
}
