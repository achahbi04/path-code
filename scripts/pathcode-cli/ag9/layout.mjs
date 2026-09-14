/**
 * G9 — PATH-owned engineering runtime directory layout under PATH_RUNTIME_ROOT.
 * Never writes into the user repo or user shell tool configs.
 */

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * @typedef {object} Ag9RuntimeDirs
 * @property {string} root
 * @property {string} toolManager
 * @property {string} miseHome
 * @property {string} toolchains
 * @property {string} languageServers
 * @property {string} indexers
 * @property {string} caches
 * @property {string} downloads
 * @property {string} scipCache
 * @property {string} metadata
 * @property {string} locks
 * @property {string} copilotHome
 */

/**
 * Resolve absolute PATH-owned G9 runtime directories.
 * @param {string} runtimeRoot
 * @returns {Ag9RuntimeDirs}
 */
export function resolveAg9RuntimeDirs(runtimeRoot) {
  const root =
    typeof runtimeRoot === "string" && runtimeRoot.trim()
      ? resolve(runtimeRoot.trim())
      : resolve(".");
  const toolManager = join(root, "tool-manager");
  const miseHome = join(toolManager, "mise");
  const caches = join(root, "caches");
  return {
    root,
    toolManager,
    miseHome,
    toolchains: join(root, "toolchains"),
    languageServers: join(root, "language-servers"),
    indexers: join(root, "indexers"),
    caches,
    downloads: join(caches, "downloads"),
    scipCache: join(caches, "scip"),
    metadata: join(root, "metadata"),
    locks: join(root, "locks"),
    copilotHome: join(root, "copilot-home"),
  };
}

/**
 * Ensure all G9 runtime directories exist (mkdirSync recursive).
 * @param {string} runtimeRoot
 * @returns {Ag9RuntimeDirs}
 */
export function ensureAg9RuntimeDirs(runtimeRoot) {
  const dirs = resolveAg9RuntimeDirs(runtimeRoot);
  for (const path of Object.values(dirs)) {
    mkdirSync(path, { recursive: true });
  }
  // Extra cache buckets used by provisioners / SCIP.
  mkdirSync(join(dirs.caches, "deps"), { recursive: true });
  mkdirSync(join(dirs.caches, "mise"), { recursive: true });
  mkdirSync(join(dirs.miseHome, "bin"), { recursive: true });
  mkdirSync(join(dirs.miseHome, "config"), { recursive: true });
  return dirs;
}
