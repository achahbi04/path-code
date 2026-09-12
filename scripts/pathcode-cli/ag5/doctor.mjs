/**
 * AG5 — concise readiness diagnostics (no secrets, no engineering).
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  assertPathPackagePresent,
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
  resolveTargetProjectRoot,
  readPathPackageVersion,
} from "../paths.mjs";
import { isRuntimeMarkerHealthy } from "../ag1/runtime-bootstrap.mjs";
import { assertAg1VenvReady } from "../ag1/venv-guard.mjs";
import { detectAg1Auth } from "../ag1/auth-detect.mjs";

/**
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, packageRoot?: string }} [opts]
 */
export function runPathcodeDoctor(opts = {}) {
  const env = opts.env ?? process.env;
  const packageRoot = opts.packageRoot ?? resolvePathPackageRoot();
  const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
  const cwd = opts.cwd ?? process.cwd();

  /** @type {Array<{ name: string, ok: boolean, detail: string, optional?: boolean }>} */
  const rows = [];

  const pkg = assertPathPackagePresent(packageRoot);
  rows.push({
    name: "PATH Code",
    ok: pkg.ok,
    detail: pkg.ok
      ? `v${readPathPackageVersion(packageRoot)} @ ${packageRoot}`
      : pkg.message,
  });

  const markerOk = isRuntimeMarkerHealthy(runtimeRoot, packageRoot);
  let venvOk = false;
  let venvDetail = `Runtime not ready under ${runtimeRoot} (first run bootstraps automatically).`;
  try {
    const venv = assertAg1VenvReady({
      checkoutRoot: packageRoot,
      runtimeRoot,
    });
    venvOk = venv.ok === true;
    if (venv.ok) venvDetail = runtimeRoot;
    else if (typeof venv.message === "string") venvDetail = venv.message;
  } catch (err) {
    venvDetail =
      err && /** @type {any} */ (err).message
        ? String(/** @type {any} */ (err).message)
        : venvDetail;
  }
  rows.push({
    name: "Runtime",
    ok: markerOk && venvOk,
    detail: markerOk && venvOk ? runtimeRoot : venvDetail,
  });

  const git = spawnSync("git", ["--version"], {
    encoding: "utf8",
    timeout: 5_000,
    env: { ...env, GIT_TERMINAL_PROMPT: "0" },
  });
  rows.push({
    name: "Git",
    ok: git.status === 0,
    detail:
      git.status === 0
        ? (git.stdout || "").trim()
        : "git not found on PATH",
  });

  const auth = detectAg1Auth(env);
  rows.push({
    name: "Engineering auth",
    ok: auth.ok,
    detail: auth.ok
      ? "Google / Vertex credentials detected"
      : auth.message,
  });

  const project = resolveTargetProjectRoot(cwd);
  if (project.ok) {
    const sub =
      project.workingSubdir && project.workingSubdir.length > 0
        ? ` (subdir ${project.workingSubdir})`
        : "";
    rows.push({
      name: "Project",
      ok: true,
      detail: `${project.projectRoot}${sub}`,
    });
    const which = spawnSync("gh", ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    if (which.error || which.status !== 0) {
      rows.push({
        name: "GitHub",
        ok: false,
        optional: true,
        detail: "gh not installed (optional for local PATH)",
      });
    } else {
      const authStatus = spawnSync("gh", ["auth", "status"], {
        cwd: project.projectRoot,
        encoding: "utf8",
        timeout: 8_000,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...env, GH_PROMPT_DISABLED: "1" },
      });
      rows.push({
        name: "GitHub",
        ok: authStatus.status === 0,
        optional: true,
        detail:
          authStatus.status === 0
            ? "gh authenticated"
            : "GitHub CLI is not authenticated. Run: gh auth login",
      });
    }
  } else {
    rows.push({
      name: "Project",
      ok: false,
      detail: project.message,
    });
    rows.push({
      name: "GitHub",
      ok: false,
      optional: true,
      detail: "Skipped (not in a Git repository)",
    });
  }

  const mark = (ok) => (ok ? "✓" : "✗");
  const lines = ["PATH Code doctor", ""];
  for (const row of rows) {
    const suffix = row.optional && !row.ok ? " (optional)" : "";
    lines.push(
      `  ${mark(row.ok)} ${row.name.padEnd(18)} ${row.detail}${suffix}`,
    );
  }
  lines.push("");

  const requiredFailed = rows.some((r) => !r.ok && !r.optional);
  return {
    ok: !requiredFailed,
    exitCode: requiredFailed ? 1 : 0,
    text: lines.join("\n"),
    rows,
    packageRoot,
    runtimeRoot,
    runtimeExists: existsSync(runtimeRoot),
  };
}
