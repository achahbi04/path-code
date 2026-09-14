/**
 * G9 — disposable project services (compose / devcontainer evidence).
 * PATH-owned compose project names; tracked under runtime metadata.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { whichBinary } from "../ag8/discover.mjs";
import { ensureAg9RuntimeDirs } from "./layout.mjs";

/**
 * @param {string} root
 * @param {string} rel
 */
function has(root, rel) {
  try {
    return existsSync(join(root, rel));
  } catch {
    return false;
  }
}

/**
 * Detect compose / devcontainer service evidence.
 * @param {string} projectRoot
 * @returns {{
 *   composeFile: string | null,
 *   devcontainer: boolean,
 *   evidence: string[],
 * }}
 */
export function detectProjectServices(projectRoot) {
  /** @type {string[]} */
  const evidence = [];
  if (typeof projectRoot !== "string" || !projectRoot.trim()) {
    return { composeFile: null, devcontainer: false, evidence: ["projectRoot required"] };
  }
  const root = projectRoot.trim();

  /** @type {string[]} */
  const composeCandidates = [
    "compose.yaml",
    "compose.yml",
    "docker-compose.yaml",
    "docker-compose.yml",
  ];
  /** @type {string | null} */
  let composeFile = null;
  for (const c of composeCandidates) {
    if (has(root, c)) {
      composeFile = join(root, c);
      evidence.push(c);
      break;
    }
  }

  const devcontainer =
    has(root, ".devcontainer/devcontainer.json") ||
    has(root, ".devcontainer.json");
  if (devcontainer) {
    evidence.push(
      has(root, ".devcontainer/devcontainer.json")
        ? ".devcontainer/devcontainer.json"
        : ".devcontainer.json",
    );
  }

  if (has(root, "Dockerfile")) evidence.push("Dockerfile");
  if (has(root, "Containerfile")) evidence.push("Containerfile");

  return { composeFile, devcontainer, evidence };
}

/**
 * @param {string} projectRoot
 */
function projectKeyFor(projectRoot) {
  return createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
}

/**
 * @param {string} runtimeRoot
 * @param {string} projectKey
 */
function metaPath(runtimeRoot, projectKey) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  return join(dirs.metadata, `services-${projectKey}.json`);
}

/**
 * Resolve a usable Docker CLI. Prefer a real executable over a broken Desktop
 * symlink; verify `docker version` when possible.
 * @returns {string | null}
 */
export function resolveDockerCli() {
  /** @type {string[]} */
  const candidates = [];
  const which = whichBinary("docker");
  if (which) candidates.push(which);
  for (const p of [
    "/opt/homebrew/bin/docker",
    "/usr/local/bin/docker",
    "/usr/bin/docker",
  ]) {
    if (!candidates.includes(p)) candidates.push(p);
  }
  for (const exe of candidates) {
    if (!existsSync(exe)) continue;
    const probe = spawnSync(exe, ["version", "--format", "{{.Client.Version}}"], {
      encoding: "utf8",
      timeout: 15_000,
      env: process.env,
    });
    if (probe.status === 0) return exe;
  }
  return which && existsSync(which) ? which : null;
}

/**
 * Run compose up/down using `docker compose` or standalone `docker-compose`.
 * @param {{
 *   docker: string,
 *   args: string[],
 *   cwd: string,
 *   timeoutMs?: number,
 * }} input
 */
function runCompose({ docker, args, cwd, timeoutMs = 300_000 }) {
  /** Prefer a Docker config without Desktop credsStore (Colima / Homebrew). */
  /** @type {Record<string, string | undefined>} */
  const env = { ...process.env };
  // G9 Colima backend: when the host uses Colima, empty DOCKER_CONFIG would
  // drop `currentContext` and fall back to /var/run/docker.sock. Pin the
  // socket explicitly so PATH-owned compose uses the established backend.
  const colimaSock = join(
    process.env.HOME || "",
    ".colima",
    "default",
    "docker.sock",
  );
  if (!env.DOCKER_HOST && existsSync(colimaSock)) {
    env.DOCKER_HOST = `unix://${colimaSock}`;
  }
  if (!env.DOCKER_CONFIG) {
    try {
      const dirs = ensureAg9RuntimeDirs(
        env.PATHCODE_RUNTIME_ROOT || process.cwd(),
      );
      const cfgDir = join(dirs.metadata, "docker-config");
      mkdirSync(cfgDir, { recursive: true });
      /** @type {Record<string, unknown>} */
      const cfg = { auths: {} };
      if (existsSync(colimaSock)) {
        cfg.currentContext = "colima";
      }
      writeFileSync(join(cfgDir, "config.json"), `${JSON.stringify(cfg, null, 2)}\n`);
      env.DOCKER_CONFIG = cfgDir;
    } catch {
      /* keep host DOCKER_CONFIG */
    }
  }
  const plugin = spawnSync(docker, ["compose", ...args], {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    env,
  });
  if (plugin.status === 0) {
    return { ...plugin, mode: "docker-compose-plugin" };
  }
  const standalone = whichBinary("docker-compose");
  if (standalone) {
    const r = spawnSync(standalone, args, {
      cwd,
      encoding: "utf8",
      timeout: timeoutMs,
      env,
    });
    return {
      ...r,
      mode: "docker-compose-standalone",
      pluginStderr: plugin.stderr,
    };
  }
  return { ...plugin, mode: "docker-compose-plugin" };
}

/**
 * Start disposable compose services under a PATH-owned project name.
 *
 * @param {{
 *   projectRoot: string,
 *   runtimeRoot: string,
 *   emit?: (event: object) => void,
 * }} input
 */
export function startDisposableServices({ projectRoot, runtimeRoot, emit }) {
  const emitFn = typeof emit === "function" ? emit : () => {};
  const detected = detectProjectServices(projectRoot);
  const projectKey = projectKeyFor(projectRoot);
  const composeProject = `pathcode-g9-${projectKey}`;

  if (!detected.composeFile) {
    return {
      status: "UNAVAILABLE",
      reason: "no_compose_file",
      projectKey,
      evidence: detected.evidence,
    };
  }

  const docker = resolveDockerCli();
  if (!docker) {
    return {
      status: "UNAVAILABLE",
      reason: "docker_missing",
      projectKey,
      evidence: [...detected.evidence, "docker not on PATH"],
    };
  }

  emitFn({
    type: "session.capability.services",
    status: "starting",
    project: composeProject,
  });

  const r = runCompose({
    docker,
    args: ["-f", detected.composeFile, "-p", composeProject, "up", "-d"],
    cwd: projectRoot,
    timeoutMs: 300_000,
  });

  const evidence = [
    ...detected.evidence,
    `docker=${docker}`,
    `composeMode=${r.mode}`,
    `compose -p ${composeProject} up -d status=${r.status}`,
  ];
  if (r.stderr) evidence.push((r.stderr || "").slice(0, 400));
  if (r.pluginStderr) evidence.push(`plugin: ${String(r.pluginStderr).slice(0, 200)}`);

  if (r.status !== 0) {
    return {
      status: "FAILED",
      reason: "compose_up_failed",
      projectKey,
      composeProject,
      evidence,
    };
  }

  const record = {
    projectKey,
    composeProject,
    composeFile: detected.composeFile,
    projectRoot,
    startedAt: new Date().toISOString(),
  };
  const path = metaPath(runtimeRoot, projectKey);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  return {
    status: "STARTED",
    projectKey,
    composeProject,
    metaPath: path,
    evidence,
  };
}

/**
 * Stop PATH-owned disposable compose services.
 *
 * @param {{ runtimeRoot: string, projectKey: string, projectRoot?: string }} input
 */
export function stopDisposableServices({ runtimeRoot, projectKey, projectRoot }) {
  const path = metaPath(runtimeRoot, projectKey);
  /** @type {object | null} */
  let meta = null;
  if (existsSync(path)) {
    try {
      meta = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      meta = null;
    }
  }

  const docker = resolveDockerCli();
  if (!docker) {
    return {
      status: "UNAVAILABLE",
      reason: "docker_missing",
      evidence: ["docker not on PATH"],
    };
  }

  const composeProject =
    (meta && typeof meta.composeProject === "string" && meta.composeProject) ||
    `pathcode-g9-${projectKey}`;
  const composeFile =
    meta && typeof meta.composeFile === "string" ? meta.composeFile : null;
  const cwd =
    (meta && typeof meta.projectRoot === "string" && meta.projectRoot) ||
    projectRoot ||
    process.cwd();

  /** @type {string[]} */
  const args = [];
  if (composeFile) args.push("-f", composeFile);
  args.push("-p", composeProject, "down", "--remove-orphans");

  const r = runCompose({
    docker,
    args,
    cwd,
    timeoutMs: 180_000,
  });

  /** @type {string[]} */
  const evidence = [
    `docker=${docker}`,
    `composeMode=${r.mode}`,
    `compose -p ${composeProject} down status=${r.status}`,
  ];
  if (r.stderr) evidence.push((r.stderr || "").slice(0, 300));

  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }

  if (r.status !== 0) {
    return { status: "FAILED", reason: "compose_down_failed", evidence };
  }
  return { status: "STOPPED", composeProject, evidence };
}
