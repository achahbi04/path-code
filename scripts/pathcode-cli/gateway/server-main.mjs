/**
 * S1 — Gateway process entry (detached / manual).
 *
 * Launch:
 *   node scripts/pathcode-cli/gateway/server-main.mjs
 */

import { createGatewayRuntime } from "./runtime.mjs";
import { startGatewayServer } from "./server.mjs";
import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "../paths.mjs";

const packageRoot =
  process.env.PATHCODE_PACKAGE_ROOT || resolvePathPackageRoot();
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolvePathRuntimeRoot({ packageRoot });

const runtime = createGatewayRuntime({ packageRoot, runtimeRoot });
const server = await startGatewayServer({ runtime });

process.stdout.write(
  `PATH Gateway listening\nsocket=${server.socketPath}\npid=${process.pid}\n`,
);

const shutdown = () => {
  try {
    server.stop();
  } catch {
    // ignore
  }
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
