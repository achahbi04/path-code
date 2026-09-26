#!/usr/bin/env node
/**
 * PATH Build — product-creation surface (not PATH Code).
 *
 * Opens a local browser UI that drives the S5 Build control loop over
 * Gateway / S3 fabric. Terminal slash-commands are not the product.
 *
 * Usage:
 *   node scripts/path-build.mjs
 *   path-build
 *   PATHCODE_BUILD_PORT=7790 node scripts/path-build.mjs
 *   PATHCODE_BUILD_NO_OPEN=1 node scripts/path-build.mjs   # don't auto-open browser
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, realpathSync } from "node:fs";

import { resolvePathPackageRoot, resolvePathRuntimeRoot } from "./pathcode-cli/paths.mjs";
import { startPathBuildSurface } from "./pathcode-cli/build/surface/server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function packageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(HERE, "..", "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function printHelp() {
  process.stdout.write(
    [
      "PATH Build — create software from an outcome",
      "",
      "Usage:",
      "  path-build",
      "  node scripts/path-build.mjs",
      "",
      "Opens a local browser surface. Not PATH Code. Not a terminal REPL.",
      "",
      "Env:",
      "  PATHCODE_PREFERRED_ENGINE=cursor|copilot",
      "  PATHCODE_BUILD_PORT=7788",
      "  PATHCODE_BUILD_NO_OPEN=1",
      "  PATHCODE_RUNTIME_ROOT=…",
      "",
      "Fake/simulated Build mode is not available through the operator entrypoint.",
      "",
    ].join("\n"),
  );
}

/**
 * @param {string[] | undefined} argv
 */
export async function runPathBuildMain(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return 0;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`path-build ${packageVersion()}\n`);
    return 0;
  }

  if (
    process.env.PATHCODE_BUILD_FAKE === "1" ||
    process.env.PATHCODE_GATEWAY_FAKE_ENGINE === "1"
  ) {
    process.stderr.write(
      "Fake/simulated Build mode is not available through the operator entrypoint.\n",
    );
    return 2;
  }

  const packageRoot = resolvePathPackageRoot();
  const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });

  process.stdout.write("Starting PATH Build surface…\n");

  const surface = await startPathBuildSurface({
    packageRoot,
    runtimeRoot,
    openBrowser: process.env.PATHCODE_BUILD_NO_OPEN !== "1",
    preferredEngine: process.env.PATHCODE_PREFERRED_ENGINE || null,
    fakeMode: false,
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write("\nStopping PATH Build…\n");
    const forceTimer = setTimeout(() => {
      process.stderr.write(
        "PATH Build shutdown timed out; forcing exit.\n",
      );
      process.exit(1);
    }, 12_000);
    forceTimer.unref?.();
    try {
      await surface.stop({ teardownOwned: true });
    } catch (error) {
      process.stderr.write(
        `PATH Build stop error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
    clearTimeout(forceTimer);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  process.stdout.write(`PATH Build ready: ${surface.url}\n`);
  const serving = await surface.identity();
  process.stdout.write(`PATH Build ${serving.version || packageVersion()} · code ${serving.label}\n`);
  for (const proc of serving.processes) {
    const started = proc.processStartedAt ? `, started ${proc.processStartedAt}` : "";
    process.stdout.write(
      `  ${proc.role.padEnd(11)} ${proc.label.padEnd(20)} pid ${proc.pid ?? "?"}${started}${proc.stale ? "  STALE" : ""}\n`,
    );
  }
  for (const warning of serving.warnings) {
    process.stdout.write(`  WARNING: ${warning}\n`);
  }
  process.stdout.write(
    "Real Gateway fabric — engines: Cursor / Copilot / Antigravity as available.\n",
  );
  process.stdout.write("Press Ctrl-C to stop.\n");

  // Keep process alive.
  await new Promise(() => {});
  return 0;
}

/**
 * @param {string | undefined} argv1
 */
export function isDirectEntry(argv1 = process.argv[1]) {
  if (!argv1) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(argv1) === realpathSync(modulePath);
  } catch {
    return pathToFileURL(argv1).href === import.meta.url;
  }
}

if (isDirectEntry()) {
  runPathBuildMain(process.argv.slice(2))
    .then((code) => {
      process.exitCode = typeof code === "number" ? code : 0;
    })
    .catch((err) => {
      process.stderr.write(
        `path-build failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exitCode = 1;
    });
}
