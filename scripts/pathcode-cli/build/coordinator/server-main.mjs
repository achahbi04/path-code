#!/usr/bin/env node

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

const handle = await startBuildCoordinatorServer({
  packageRoot,
  runtimeRoot,
  fakeMode:
    process.env.PATHCODE_BUILD_COORDINATOR_FAKE === "1" ||
    process.env.PATHCODE_BUILD_FAKE === "1" ||
    process.env.PATHCODE_GATEWAY_FAKE_ENGINE === "1",
  preferredEngine: process.env.PATHCODE_PREFERRED_ENGINE || null,
});

const shutdown = () => void handle.stop().finally(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
