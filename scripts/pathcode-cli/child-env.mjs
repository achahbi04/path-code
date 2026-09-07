/**
 * Explicit child environment for trial TYPECHECK / TARGETED_TEST.
 * Does NOT copy process.env. Owner preparation still applies its own
 * locale/PATH allowlist on top of this caller map and denies provider secrets.
 *
 * P3 falsification target: only this constructor.
 */

/**
 * Build the host-supplied env map for trial checks.
 * Intentionally excludes OPENAI_API_KEY, NODE_OPTIONS, NODE_PATH,
 * PATHCODE_LIVE_OPENAI, and other credential / provider opt-in flags.
 *
 * @param {NodeJS.ProcessEnv} [_hostEnv] reserved for tests; production ignores ambient secrets
 * @returns {Readonly<Record<string, string>>}
 */
export function buildTrialChildEnvironment(_hostEnv = process.env) {
  const env = Object.create(null);
  // Ordinary locale values only — no wholesale inherit, no credentials.
  const lang = typeof _hostEnv.LANG === "string" && _hostEnv.LANG.length > 0
    ? _hostEnv.LANG
    : "C";
  env.LANG = lang;
  if (typeof _hostEnv.LC_ALL === "string" && _hostEnv.LC_ALL.length > 0) {
    env.LC_ALL = _hostEnv.LC_ALL;
  }
  if (typeof _hostEnv.LC_CTYPE === "string" && _hostEnv.LC_CTYPE.length > 0) {
    env.LC_CTYPE = _hostEnv.LC_CTYPE;
  }
  if (typeof _hostEnv.TZ === "string" && _hostEnv.TZ.length > 0) {
    env.TZ = _hostEnv.TZ;
  }
  return Object.freeze({ ...env });
}

/**
 * Predicate used by T20: host map must not carry seeded secrets.
 * @param {Readonly<Record<string, string>>} env
 * @param {readonly string[]} [forbiddenKeys]
 */
export function trialChildEnvironmentExcludesSecrets(
  env,
  forbiddenKeys = [
    "OPENAI_API_KEY",
    "NODE_OPTIONS",
    "NODE_PATH",
    "PATHCODE_LIVE_OPENAI",
    "AWS_SECRET_ACCESS_KEY",
    "ANTHROPIC_API_KEY",
  ],
) {
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      return false;
    }
  }
  return true;
}
