/**
 * S1 — Ensure a PATH Gateway is running (auto-start child process).
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePathPackageRoot, resolvePathRuntimeRoot } from "../paths.mjs";
import {
  resolveGatewaySocketPath,
  resolveGatewayPidPath,
} from "./server.mjs";
import { createGatewayClient } from "./client.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_MAIN = join(HERE, "server-main.mjs");

/**
 * @param {string} socketPath
 * @param {number} timeoutMs
 */
async function waitForSocket(socketPath, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(socketPath)) {
      try {
        const client = createGatewayClient({ socketPath });
        await client.connect();
        await client.hello("probe");
        client.close();
        return true;
      } catch {
        // still warming
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/**
 * Connect to an existing gateway or spawn one.
 *
 * Modes:
 * - PATHCODE_GATEWAY_MODE=inprocess → caller should use createGatewayRuntime directly
 * - default → Unix socket daemon under runtimeRoot/gateway/
 *
 * @param {{
 *   runtimeRoot?: string,
 *   packageRoot?: string,
 *   forceRestart?: boolean,
 * }} [options]
 */
export async function ensureGateway(options = {}) {
  const mode = String(process.env.PATHCODE_GATEWAY_MODE || "socket").toLowerCase();
  if (mode === "inprocess" || mode === "inline") {
    return { mode: "inprocess", client: null, socketPath: null };
  }

  const packageRoot = options.packageRoot || resolvePathPackageRoot();
  const runtimeRoot =
    options.runtimeRoot || resolvePathRuntimeRoot({ packageRoot });
  const socketPath = resolveGatewaySocketPath(runtimeRoot);
  mkdirSync(dirname(socketPath), { recursive: true });

  if (!options.forceRestart && existsSync(socketPath)) {
    const ok = await waitForSocket(socketPath, 3_000);
    if (ok) {
      const client = createGatewayClient({ socketPath, runtimeRoot });
      await client.connect();
      await client.hello("cli");
      return {
        mode: "socket",
        client,
        socketPath,
        runtimeRoot,
        packageRoot,
        started: false,
      };
    }
  }

  const child = spawn(process.execPath, [SERVER_MAIN], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PATHCODE_RUNTIME_ROOT: runtimeRoot,
      PATHCODE_PACKAGE_ROOT: packageRoot,
    },
  });
  child.unref();

  const ready = await waitForSocket(socketPath, 20_000);
  if (!ready) {
    throw new Error(
      `PATH Gateway failed to start (socket not ready): ${socketPath}`,
    );
  }

  const client = createGatewayClient({ socketPath, runtimeRoot });
  await client.connect();
  await client.hello("cli");
  return {
    mode: "socket",
    client,
    socketPath,
    runtimeRoot,
    packageRoot,
    started: true,
    pidPath: resolveGatewayPidPath(runtimeRoot),
  };
}

/**
 * Read pid file if present.
 * @param {string} runtimeRoot
 */
export function readGatewayPid(runtimeRoot) {
  const pidPath = resolveGatewayPidPath(runtimeRoot);
  try {
    const raw = readFileSync(pidPath, "utf8");
    const pid = Number(raw.split("\n")[0]);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}
