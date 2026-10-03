/**
 * AG5/AG6 — concise readiness diagnostics (no secrets, no engineering).
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
import {
  assertSupportedNode,
  assertSupportedPlatform,
} from "../ag6/platform.mjs";
import {
  probeAntigravityReadiness,
  probeCopilotReadiness,
} from "../ag10/engine-readiness.mjs";
import { probeCursorDispatchReadiness } from "../ag10/cursor-sdk.mjs";
import { readPreferences } from "../preferences.mjs";
import { MODEL_PREFERENCE_ENGINES, readProjectModelPreferences, validateModelPreference } from "../model-plane/preference-config.mjs";
import { listBuildEnvironments } from "../build/environments.mjs";
import { listBuildDeployments } from "../build/deployments.mjs";

/**
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, packageRoot?: string, runtimeRoot?: string, checkpoint?: object | null, engineeringModelId?: string | null, buildId?: string }} [opts]
 */
export function runPathcodeDoctor(opts = {}) {
  const env = opts.env ?? process.env;
  const packageRoot = opts.packageRoot ?? resolvePathPackageRoot();
  const runtimeRoot = opts.runtimeRoot ?? resolvePathRuntimeRoot({ packageRoot });
  const cwd = opts.cwd ?? process.cwd();

  /** @type {Array<{ name: string, ok: boolean, detail: string, optional?: boolean }>} */
  const rows = [];

  const pkg = assertPathPackagePresent(packageRoot);
  const version = readPathPackageVersion(packageRoot);
  rows.push({
    name: "PATH Code",
    ok: pkg.ok,
    detail: pkg.ok ? version : pkg.message,
  });

  // Product install location — helps operators confirm they are on the
  // packaged install, not an accidental development worktree symlink.
  rows.push({
    name: "Install",
    ok: pkg.ok,
    detail: packageRoot,
  });

  const platform = assertSupportedPlatform();
  rows.push({
    name: "Platform",
    ok: platform.ok,
    detail: platform.ok
      ? platform.platform.label
      : platform.message,
  });

  const node = assertSupportedNode();
  rows.push({
    name: "Node",
    ok: node.ok,
    detail: node.ok ? node.message : node.message,
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

  const auth = detectAg1Auth(env);
  rows.push({
    name: "Engineering",
    ok: auth.ok,
    detail: auth.ok
      ? auth.message
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
        detail: "gh not installed (optional for local engineering)",
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
            : "Not authenticated — run: gh auth login",
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

  // Configuration sources only. Doctor never resolves an executing engine/model.
  rows.push({
    name: "Explicit model",
    ok: true,
    detail: opts.engineeringModelId || "not set (engineering CLI override)",
  });
  const prefs = readPreferences({ env });
  rows.push({
    name: "GS model pref",
    ok: prefs.ok,
    optional: true,
    detail: prefs.ok ? (prefs.generalSession.modelId || "not set") : `invalid: ${prefs.message}`,
  });
  rows.push({
    name: "GS model env",
    ok: true,
    detail: env.PATHCODE_OPENAI_MODEL?.trim() || "not set",
  });
  for (const engine of ["cursor", "copilot", "antigravity"]) {
    rows.push({
      name: `User ${engine}`,
      ok: prefs.ok,
      optional: true,
      detail: prefs.ok ? (prefs.engineering.byEngine[engine] || "not set") : `invalid: ${prefs.message}`,
    });
  }
  if (project.ok) {
    const configured = readProjectModelPreferences(project.projectRoot);
    rows.push({
      name: "Project models",
      ok: configured.ok,
      optional: true,
      detail: configured.ok
        ? `${configured.path} (${configured.source}; ${["cursor", "copilot", "antigravity"]
            .filter((engine) => configured.byEngine[engine])
            .map((engine) => `${engine}=${configured.byEngine[engine]}`).join(", ") || "no defaults"})`
        : `${configured.path} (invalid: ${configured.message})`,
    });
  }
  const pins = opts.checkpoint && typeof opts.checkpoint === "object"
    ? opts.checkpoint.modelPreferences || {}
    : null;
  const pinDetails = pins && typeof pins === "object"
    ? Object.entries(pins)
        .filter(([engine, value]) => MODEL_PREFERENCE_ENGINES.includes(engine) && validateModelPreference(value).ok)
        .map(([engine, value]) => `${engine}=${value}`).join(", ")
    : "";
  rows.push({
    name: "Task model pin",
    ok: true,
    detail: pins ? pinDetails || "not set" : "no current task context",
  });
  for (const [key, engine] of [
    ["PATHCODE_CURSOR_MODEL", "Cursor"],
    ["CURSOR_MODEL", "Cursor"],
    ["AG1_MODEL", "Antigravity"],
    ["GOOGLE_CLOUD_MODEL", "Antigravity"],
  ]) {
    const value = env[key]?.trim();
    rows.push({
      name: key,
      ok: true,
      detail: value
        ? `${engine} compatibility input: ${value}; deprecated in favor of durable model preferences`
        : "not set",
    });
  }
  rows.push({
    name: "Model defaults",
    ok: true,
    detail: "Adapter/provider defaults apply after preferences and legacy env; no execution model inferred",
  });

  if (opts.buildId) {
    const deployments = listBuildDeployments(runtimeRoot, opts.buildId);
    rows.push({ name: "P10 deployment foundation", ok: deployments.ok, optional: true,
      detail: deployments.ok ? `${deployments.mappings.length} target mappings; ${deployments.deployments.length} recorded operations; serving ${deployments.serving.state}; provider unverified` : deployments.code });
    const configured = listBuildEnvironments(runtimeRoot, opts.buildId);
    rows.push({ name: "P9 environments", ok: configured.ok, optional: true,
      detail: configured.ok ? `${configured.items.length} configured` : configured.code });
    if (configured.ok) for (const item of configured.items) {
      rows.push({ name: `P9 ${item.name}`, ok: true, optional: true,
        detail: `${item.variables.length} variable bindings` });
      for (const variable of item.variables) {
        rows.push({ name: `P9 ${item.name}/${variable.variableName}`, ok: true, optional: true,
          detail: variable.kind === "config" ? "ordinary config configured" :
            `${variable.backend}; binding ${variable.bindingState}; presence ${variable.presenceState}` +
            (variable.backend === "local_env_file" ? `; safety ${variable.safetyState}` : "") });
      }
    }
    rows.push({ name: "P9 Vercel auth", ok: true, optional: true,
      detail: env.VERCEL_TOKEN ? "exported operational token present; provider status unverified" :
        "operational readiness unknown; provider status unverified" });
  }

  const agReady = probeAntigravityReadiness({ env });
  rows.push({
    name: "Engine AG",
    ok: agReady.ready,
    optional: true,
    detail: agReady.ready
      ? `ready (${agReady.authMethod || "bridge"})`
      : agReady.reason || "not ready",
  });
  const copilotReady = probeCopilotReadiness({ env, skipVersion: true });
  rows.push({
    name: "Engine Copilot",
    ok: copilotReady.ready,
    optional: true,
    detail: copilotReady.ready
      ? `ready (${copilotReady.authMethod || "local"})`
      : copilotReady.reason || "not ready",
  });
  const cursorReady = probeCursorDispatchReadiness({ env });
  rows.push({
    name: "Engine Cursor",
    ok: cursorReady.ready,
    optional: true,
    detail: cursorReady.ready
      ? "ready (native_sdk)"
      : cursorReady.reason || "unavailable",
  });

  const mark = (ok) => (ok ? "✓" : "✗");
  const lines = ["PATH Code doctor", ""];
  for (const row of rows) {
    const suffix = row.optional && !row.ok ? " (optional)" : "";
    lines.push(
      `  ${mark(row.ok)} ${row.name.padEnd(14)} ${row.detail}${suffix}`,
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
