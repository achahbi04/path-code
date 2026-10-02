/** Non-content safety observations for the future creator-owned .env.local backend. */
import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** @param {string} canonicalProjectRoot */
export function checkLocalEnvGitSafety(canonicalProjectRoot) {
  let root;
  try { root = realpathSync(canonicalProjectRoot); }
  catch { return { ok: false, code: "LOCAL_ENV_PATH_UNSAFE" }; }
  const file = join(root, ".env.local");
  try {
    const entry = lstatSync(file);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      return { ok: false, code: "LOCAL_ENV_PATH_UNSAFE" };
    }
    const resolved = realpathSync(file);
    const rel = relative(root, resolved);
    if (rel === ".." || rel.startsWith(`..${sep}`)) {
      return { ok: false, code: "LOCAL_ENV_PATH_UNSAFE" };
    }
  } catch (error) {
    if (error?.code !== "ENOENT") return { ok: false, code: "LOCAL_ENV_PATH_UNSAFE" };
    // Missing is not verified presence. Git ignore can still be observed.
  }
  const gitEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE"]) {
    if (typeof process.env[key] === "string") gitEnv[key] = process.env[key];
  }
  const run = (args) => spawnSync("git", args, {
    cwd: root, env: gitEnv, encoding: "utf8", timeout: 5_000,
    stdio: ["ignore", "ignore", "ignore"],
  });
  const tracked = run(["ls-files", "--error-unmatch", "--", ".env.local"]);
  if (tracked.status === 0) return { ok: false, code: "LOCAL_ENV_TRACKED" };
  if (tracked.status !== 1) return { ok: false, code: "LOCAL_ENV_GIT_UNAVAILABLE" };
  const ignored = run(["check-ignore", "-q", "--", ".env.local"]);
  if (ignored.status === 1) return { ok: false, code: "LOCAL_ENV_NOT_IGNORED" };
  if (ignored.status !== 0) return { ok: false, code: "LOCAL_ENV_GIT_UNAVAILABLE" };
  // Git-safety only: no value/presence/backend-readiness assertion.
  return { ok: true, gitSafety: "ignored_untracked" };
}
