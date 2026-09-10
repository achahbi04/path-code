/**
 * Phase GC1-b — safe package-manager cache directories.
 *
 * ARCHITECTURAL RULE (non-negotiable):
 * Caches are PERFORMANCE aids only. They are NEVER correctness authority.
 * A clean remote workspace + Engineering Image + repository manifests/lockfiles
 * must remain sufficient to reproduce the project. Stale cache contents must
 * not silently override lockfile/project truth.
 */

/** @typedef {{ id: string, env: string, defaultDir: string, ecosystems: string[] }} CacheDirSpec */

/** Safe cache directory specs for supported ecosystems. */
export const GC1_CACHE_DIRS = Object.freeze([
  Object.freeze({
    id: "npm",
    env: "npm_config_cache",
    defaultDir: "/home/user/.cache/npm",
    ecosystems: ["node-npm"],
  }),
  Object.freeze({
    id: "pnpm",
    env: "PNPM_STORE_PATH",
    defaultDir: "/home/user/.cache/pnpm-store",
    ecosystems: ["node-pnpm"],
  }),
  Object.freeze({
    id: "yarn",
    env: "YARN_CACHE_FOLDER",
    defaultDir: "/home/user/.cache/yarn",
    ecosystems: ["node-yarn"],
  }),
  Object.freeze({
    id: "bun",
    env: "BUN_INSTALL_CACHE_DIR",
    defaultDir: "/home/user/.cache/bun",
    ecosystems: ["node-bun"],
  }),
  Object.freeze({
    id: "uv",
    env: "UV_CACHE_DIR",
    defaultDir: "/home/user/.cache/uv",
    ecosystems: ["python-uv"],
  }),
  Object.freeze({
    id: "pip",
    env: "PIP_CACHE_DIR",
    defaultDir: "/home/user/.cache/pip",
    ecosystems: ["python-pip"],
  }),
  Object.freeze({
    id: "maven",
    env: "MAVEN_OPTS",
    defaultDir: "/home/user/.m2/repository",
    ecosystems: ["java-maven"],
    note: "MAVEN_OPTS may include -Dmaven.repo.local; defaultDir is the local repo",
  }),
  Object.freeze({
    id: "gradle",
    env: "GRADLE_USER_HOME",
    defaultDir: "/home/user/.gradle",
    ecosystems: ["java-gradle"],
  }),
  Object.freeze({
    id: "cargo",
    env: "CARGO_HOME",
    defaultDir: "/home/user/.cargo",
    ecosystems: ["rust-cargo"],
  }),
  Object.freeze({
    id: "go",
    env: "GOMODCACHE",
    defaultDir: "/home/user/.cache/go-mod",
    ecosystems: ["go-modules"],
  }),
]);

export const GC1_CACHE_CORRECTNESS_RULE =
  "Caches are performance-only; never correctness authority. Lockfiles and manifests win.";

/**
 * Environment hints for mounting/pointing safe cache dirs on a workstation.
 * Callers may merge these into remote command env. They never replace
 * lockfile-driven install flags (e.g. --frozen-lockfile / npm ci).
 *
 * @returns {{
 *   rule: string,
 *   performanceOnly: true,
 *   correctnessAuthority: false,
 *   env: Record<string, string>,
 *   dirs: ReadonlyArray<CacheDirSpec>,
 * }}
 */
export function getCacheEnvHints() {
  /** @type {Record<string, string>} */
  const env = {};
  for (const spec of GC1_CACHE_DIRS) {
    if (spec.id === "maven") {
      // Point the local repo explicitly; do not invent broader MAVEN_OPTS.
      env.MAVEN_OPTS = `-Dmaven.repo.local=${spec.defaultDir}`;
      continue;
    }
    env[spec.env] = spec.defaultDir;
  }
  return {
    rule: GC1_CACHE_CORRECTNESS_RULE,
    performanceOnly: true,
    correctnessAuthority: false,
    env,
    dirs: GC1_CACHE_DIRS,
  };
}
