/** Environment for a creator product process, never for PATH's own engines. */

// Executable lookup, npm/Node home and temp use, and locale on the supported
// macOS host. No PATHCODE namespace or provider credential is inherited.
export const PRODUCT_HOST_ENV_KEYS = Object.freeze([
  "PATH", "HOME", "USER", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE",
]);

/**
 * @param {{ kind: string, port: number, env: Record<string, string> }} plan
 * @param {NodeJS.ProcessEnv} [host]
 */
export function createProductRuntimeEnv(plan, host = process.env) {
  const expected = plan.kind === "spawn"
    ? { PORT: String(plan.port), HOST: "127.0.0.1", HOSTNAME: "127.0.0.1" }
    : {};
  const supplied = plan.env || {};
  if (Object.keys(supplied).some((key) => !Object.hasOwn(expected, key)) ||
      Object.keys(expected).some((key) => supplied[key] !== expected[key])) {
    const error = new Error("Runtime start plan environment is outside its authority");
    error.code = "RUNTIME_ENV_FORBIDDEN";
    throw error;
  }
  const env = {};
  for (const key of PRODUCT_HOST_ENV_KEYS) {
    if (typeof host[key] === "string") env[key] = host[key];
  }
  return { ...env, ...expected, CI: "1", BROWSER: "none", FORCE_COLOR: "0" };
}
