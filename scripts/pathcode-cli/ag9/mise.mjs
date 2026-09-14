/**
 * G9 — PATH-pinned mise bootstrap and isolated install helpers.
 * NEVER touch ~/.config/mise — always pass isolated MISE_* env under PATH runtime.
 */

import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

import { detectPlatform, miseAssetPlatform, platformBackend } from "./backends.mjs";
import { ensureAg9RuntimeDirs, resolveAg9RuntimeDirs } from "./layout.mjs";
import { withToolLock } from "./locks.mjs";

/** Pinned mise release tag (official jdx/mise GitHub releases). */
export const MISE_PINNED_VERSION = "v2026.9.7";

const MAX_DOWNLOAD_RETRIES = 3;

/**
 * Absolute path to PATH-owned mise binary.
 * @param {string} runtimeRoot
 */
export function miseBinaryPath(runtimeRoot) {
  const dirs = resolveAg9RuntimeDirs(runtimeRoot);
  return join(dirs.miseHome, "bin", "mise");
}

/**
 * Isolated mise environment — never user ~/.config/mise.
 * @param {string} runtimeRoot
 * @param {NodeJS.ProcessEnv} [baseEnv]
 * @returns {NodeJS.ProcessEnv}
 */
export function miseEnv(runtimeRoot, baseEnv = process.env) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const dataDir = join(dirs.toolchains, "mise-data");
  const configDir = join(dirs.miseHome, "config");
  const cacheDir = join(dirs.caches, "mise");
  const stateDir = join(dirs.miseHome, "state");
  const cargoHome = join(dirs.toolchains, "cargo-home");
  const rustupHome = join(dirs.toolchains, "rustup-home");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(cargoHome, { recursive: true });
  mkdirSync(rustupHome, { recursive: true });

  const env = { ...baseEnv };
  env.MISE_DATA_DIR = dataDir;
  env.MISE_CONFIG_DIR = configDir;
  env.MISE_CACHE_DIR = cacheDir;
  env.MISE_STATE_DIR = stateDir;
  env.MISE_YES = "1";
  env.MISE_QUIET = env.MISE_QUIET || "1";
  // Keep rustup/cargo installs inside PATH runtime (never host ~/.cargo).
  env.CARGO_HOME = cargoHome;
  env.RUSTUP_HOME = rustupHome;
  // Explicitly avoid inheriting user global trust/config paths as authority.
  delete env.MISE_GLOBAL_CONFIG_FILE;
  // Keep PATH but ensure our mise bin + cargo bin are first when present.
  const binDir = join(dirs.miseHome, "bin");
  const cargoBin = join(cargoHome, "bin");
  const pathParts = String(env.PATH || "")
    .split(/[:;]/)
    .filter(Boolean)
    .filter((p) => p !== binDir && p !== cargoBin);
  env.PATH = [binDir, cargoBin, ...pathParts].join(":");
  return env;
}

/**
 * Build official GitHub release asset URL for pinned mise.
 * Asset names use macos (not darwin): mise-{ver}-{macos|linux|windows}-{arch}.tar.gz
 *
 * @param {string} [version]
 * @param {{ os?: string, arch?: string }} [platform]
 */
export function miseDownloadUrl(version = MISE_PINNED_VERSION, platform) {
  const ver = version.startsWith("v") ? version : `v${version}`;
  const assetPlat = miseAssetPlatform(platform ?? detectPlatform());
  return `https://github.com/jdx/mise/releases/download/${ver}/mise-${ver}-${assetPlat}.tar.gz`;
}

/**
 * @param {string} url
 * @param {string} destFile
 * @param {AbortSignal} [signal]
 */
async function downloadFile(url, destFile, signal) {
  mkdirSync(dirname(destFile), { recursive: true });
  const tmp = `${destFile}.partial`;
  try {
    rmSync(tmp, { force: true });
  } catch {
    /* ignore */
  }

  const res = await fetch(url, {
    signal,
    redirect: "follow",
    headers: { "User-Agent": "pathcode-g9-mise" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`mise download HTTP ${res.status} for ${url}`);
  }

  const file = createWriteStream(tmp);
  // Node fetch body is a web stream — convert via arrayBuffer for portability.
  const buf = Buffer.from(await res.arrayBuffer());
  await new Promise((resolve, reject) => {
    file.on("error", reject);
    file.on("finish", resolve);
    file.end(buf);
  });
  // Atomic-ish replace
  copyFileSync(tmp, destFile);
  rmSync(tmp, { force: true });
}

/**
 * Extract mise binary from official tar.gz (contains mise/bin/mise).
 * @param {string} archivePath
 * @param {string} destBin
 */
function extractMiseBinary(archivePath, destBin) {
  mkdirSync(dirname(destBin), { recursive: true });
  const extractDir = `${destBin}.extract`;
  try {
    rmSync(extractDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  mkdirSync(extractDir, { recursive: true });

  const tarProbe = spawnSync(
    "tar",
    ["-xzf", archivePath, "-C", extractDir],
    { encoding: "utf8", timeout: 120_000 },
  );
  if (tarProbe.status !== 0) {
    throw new Error(
      `tar extract failed: ${(tarProbe.stderr || tarProbe.stdout || "").slice(0, 400)}`,
    );
  }

  const candidates = [
    join(extractDir, "mise", "bin", "mise"),
    join(extractDir, "bin", "mise"),
    join(extractDir, "mise"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error("mise binary not found inside release archive");
  }
  copyFileSync(found, destBin);
  try {
    chmodSync(destBin, 0o755);
  } catch {
    /* ignore on platforms without chmod */
  }
  try {
    rmSync(extractDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Ensure pinned mise binary exists under PATH runtime.
 *
 * @param {{
 *   runtimeRoot: string,
 *   version?: string,
 *   signal?: AbortSignal,
 *   force?: boolean,
 * }} opts
 * @returns {Promise<{ ok: boolean, executable: string, version: string, downloaded: boolean, error?: string }>}
 */
export async function ensureMise(opts) {
  const runtimeRoot = opts.runtimeRoot;
  if (!runtimeRoot) throw new Error("ensureMise: runtimeRoot required");

  const backend = platformBackend();
  if (!backend.canAcquireUserSpace) {
    return {
      ok: false,
      executable: miseBinaryPath(runtimeRoot),
      version: opts.version || MISE_PINNED_VERSION,
      downloaded: false,
      error: `platform ${backend.id} cannot acquire mise in user space`,
    };
  }

  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const version = opts.version || MISE_PINNED_VERSION;
  const bin = miseBinaryPath(runtimeRoot);

  if (!opts.force && existsSync(bin)) {
    const probe = spawnSync(bin, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
      env: miseEnv(runtimeRoot),
    });
    if (probe.status === 0) {
      return { ok: true, executable: bin, version, downloaded: false };
    }
  }

  return withToolLock(dirs.locks, "mise-bootstrap", async () => {
    if (!opts.force && existsSync(bin)) {
      const probe = spawnSync(bin, ["--version"], {
        encoding: "utf8",
        timeout: 10_000,
        env: miseEnv(runtimeRoot),
      });
      if (probe.status === 0) {
        return { ok: true, executable: bin, version, downloaded: false };
      }
    }

    const url = miseDownloadUrl(version);
    const archive = join(dirs.downloads, `mise-${version}-${miseAssetPlatform()}.tar.gz`);
    /** @type {Error | null} */
    let lastErr = null;

    for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
      try {
        if (opts.signal?.aborted) {
          throw new Error("mise download aborted");
        }
        await downloadFile(url, archive, opts.signal);
        extractMiseBinary(archive, bin);
        const probe = spawnSync(bin, ["--version"], {
          encoding: "utf8",
          timeout: 10_000,
          env: miseEnv(runtimeRoot),
        });
        if (probe.status !== 0) {
          throw new Error(
            `mise binary unhealthy after extract: ${(probe.stderr || "").slice(0, 200)}`,
          );
        }
        return { ok: true, executable: bin, version, downloaded: true };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        try {
          rmSync(bin, { force: true });
        } catch {
          /* ignore */
        }
        if (attempt < MAX_DOWNLOAD_RETRIES) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
        }
      }
    }

    return {
      ok: false,
      executable: bin,
      version,
      downloaded: false,
      error: lastErr?.message || "mise bootstrap failed",
    };
  });
}

/**
 * `mise install <toolSpec>` under isolated env.
 * @param {string} runtimeRoot
 * @param {string} toolSpec e.g. rust@1.83.0 or node@20
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [opts]
 */
export function miseInstall(runtimeRoot, toolSpec, opts = {}) {
  const bin = miseBinaryPath(runtimeRoot);
  if (!existsSync(bin)) {
    return {
      ok: false,
      status: 127,
      stdout: "",
      stderr: `mise binary missing at ${bin}; call ensureMise first`,
      toolSpec,
    };
  }
  const env = miseEnv(runtimeRoot);
  const timeoutMs =
    typeof opts.timeoutMs === "number" && opts.timeoutMs > 0
      ? opts.timeoutMs
      : 600_000;
  const probe = spawnSync(bin, ["install", toolSpec], {
    encoding: "utf8",
    env,
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (probe.status === 0) {
    // Activate in isolated config so shims / `mise which` resolve without host rustup.
    spawnSync(bin, ["use", "-g", toolSpec], {
      encoding: "utf8",
      env,
      timeout: 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  return {
    ok: probe.status === 0,
    status: probe.status,
    stdout: probe.stdout || "",
    stderr: probe.stderr || "",
    toolSpec,
  };
}

/**
 * Resolve absolute path of a binary via `mise which`.
 * Prefer PATH-runtime installs; optional toolSpec pins `-t tool@version`.
 *
 * @param {string} runtimeRoot
 * @param {string} binName
 * @param {{ toolSpec?: string }} [opts]
 * @returns {string | null}
 */
export function miseWhich(runtimeRoot, binName, opts = {}) {
  const bin = miseBinaryPath(runtimeRoot);
  if (!existsSync(bin) || !binName) return null;
  const env = miseEnv(runtimeRoot);
  /** @type {string[]} */
  const args = ["which", binName];
  if (typeof opts.toolSpec === "string" && opts.toolSpec.trim()) {
    args.push("-t", opts.toolSpec.trim());
  }
  const probe = spawnSync(bin, args, {
    encoding: "utf8",
    env,
    timeout: 15_000,
  });
  if (probe.status !== 0) return null;
  const path = (probe.stdout || "").trim().split("\n")[0];
  if (!path) return null;
  // Reject host ~/.cargo when we have an isolated CARGO_HOME (cold-start integrity).
  const cargoHome = env.CARGO_HOME || "";
  if (
    cargoHome &&
    /\/\.cargo\//.test(path) &&
    !path.startsWith(cargoHome)
  ) {
    return null;
  }
  return existsSync(path) ? path : path;
}
