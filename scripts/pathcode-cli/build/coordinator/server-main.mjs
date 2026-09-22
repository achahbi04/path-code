#!/usr/bin/env node

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { startBuildCoordinatorServer } from "./server.mjs";
import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "../../paths.mjs";

const packageRoot =
  process.env.PATHCODE_PACKAGE_ROOT || resolvePathPackageRoot();
const runtimeRoot =
  process.env.PATHCODE_RUNTIME_ROOT ||
  resolvePathRuntimeRoot({ packageRoot });

function recordFailure(error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  try {
    const path = join(runtimeRoot, "build-coordinator", "coordinator.err");
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // the parent also reads coordinator.log
  }
  process.stderr.write(`${message}\n`);
}

let handle;
try {
  handle = await startBuildCoordinatorServer({
    packageRoot,
    runtimeRoot,
    fakeMode: process.env.PATHCODE_BUILD_COORDINATOR_FAKE === "1",
    preferredEngine: process.env.PATHCODE_PREFERRED_ENGINE || null,
  });
} catch (error) {
  if (error?.code === "COORDINATOR_ALREADY_RUNNING") {
    process.exit(0);
  }
  recordFailure(error);
  process.exit(1);
}

const shutdown = () => void handle.stop().finally(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
