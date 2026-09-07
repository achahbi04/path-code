/**
 * Resolve Path Code checkout root from this module location (not process.cwd).
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** @returns {string} Absolute checkout root containing package.json and dist/. */
export function resolveCheckoutRoot() {
  return join(HERE, "..", "..");
}

/**
 * @param {string} [root]
 * @returns {{ ok: true, root: string, tscJs: string, distEntry: string } | { ok: false, code: string, message: string }}
 */
export function resolveRuntimePrerequisites(root = resolveCheckoutRoot()) {
  const packageJson = join(root, "package.json");
  const distEntry = join(root, "dist", "cli", "entry.js");
  const distAdapter = join(root, "dist", "adapters", "openai", "index.js");
  const distBrain = join(root, "dist", "brain", "index.js");
  const distMutation = join(
    root,
    "dist",
    "orchestrator",
    "mutation",
    "index.js",
  );
  const tscJs = join(root, "node_modules", "typescript", "lib", "tsc.js");

  if (!existsSync(packageJson)) {
    return {
      ok: false,
      code: "MISSING_PACKAGE",
      message: "Path Code package.json not found beside the launcher.",
    };
  }
  if (
    !existsSync(distEntry) ||
    !existsSync(distAdapter) ||
    !existsSync(distBrain) ||
    !existsSync(distMutation)
  ) {
    return {
      ok: false,
      code: "MISSING_DIST",
      message:
        "Built runtime missing under dist/. Run `npm run build` in this Path Code checkout before launching Trial 1.",
    };
  }
  if (!existsSync(tscJs)) {
    return {
      ok: false,
      code: "MISSING_TYPESCRIPT",
      message:
        "Installed TypeScript compiler missing at node_modules/typescript/lib/tsc.js. Restore dependencies in this checkout.",
    };
  }
  return { ok: true, root, tscJs, distEntry };
}

/**
 * @param {string} relativeFromDist e.g. "adapters/openai/index.js"
 * @param {string} [root]
 */
export function distHref(relativeFromDist, root = resolveCheckoutRoot()) {
  return pathToFileURL(join(root, "dist", relativeFromDist)).href;
}
