/**
 * Child-process Git environment construction.
 *
 * Does NOT mutate process.env. Builds a local copy for the Git child only.
 *
 * Categories removed from the child environment:
 *
 * Direct repository-topology redirection (authority-sensitive):
 * - GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR
 *   These can redirect Git to a different repository/object database.
 * - GIT_DISCOVERY_ACROSS_FILESYSTEM
 *   Alters how far Git will search for repositories across mounts.
 *
 * Config-file / config-injection (can alter discovery behavior):
 * - GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM, GIT_CONFIG_NOSYSTEM
 * - GIT_CONFIG_COUNT and paired GIT_CONFIG_KEY_* / GIT_CONFIG_VALUE_*
 *
 * GIT_CEILING_DIRECTORIES — special case:
 * - Unlike GIT_DIR, this typically FAILS CLOSED by stopping upward discovery
 *   earlier rather than redirecting to another repository.
 * - Removing it can broaden upward discovery relative to the ambient host.
 * - It is still removed for deterministic Path Code discovery semantics so
 *   ambient host ceiling configuration cannot change results.
 * - WorkspaceBoundary remains the authority gate even if upward discovery
 *   becomes broader after removal.
 */

const DIRECT_REDIRECTION_KEYS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM",
] as const;

const CONFIG_FILE_KEYS = [
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_CONFIG_COUNT",
] as const;

const DETERMINISM_KEYS = ["GIT_CEILING_DIRECTORIES"] as const;

function isConfigInjectionKey(key: string): boolean {
  return (
    key.startsWith("GIT_CONFIG_KEY_") || key.startsWith("GIT_CONFIG_VALUE_")
  );
}

/**
 * Build a sanitized environment for a Path Code Git discovery child process.
 */
export function buildGitChildEnvironment(
  hostEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = { ...hostEnv };

  for (const key of DIRECT_REDIRECTION_KEYS) {
    delete child[key];
  }
  for (const key of CONFIG_FILE_KEYS) {
    delete child[key];
  }
  for (const key of DETERMINISM_KEYS) {
    delete child[key];
  }

  for (const key of Object.keys(child)) {
    if (isConfigInjectionKey(key)) {
      delete child[key];
    }
  }

  return child;
}
