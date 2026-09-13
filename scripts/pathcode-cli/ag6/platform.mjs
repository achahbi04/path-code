/**
 * AG6 — honest V1 platform / Node support gates.
 * V1 claims only what PATH has fully proven: macOS Apple Silicon + supported Node.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** V1 supported host platforms (complete PATH stack proven). */
export const V1_SUPPORTED_PLATFORMS = Object.freeze([
  Object.freeze({ os: "darwin", arch: "arm64", label: "macOS Apple Silicon" }),
]);

/** Minimum Node major proven for V1 (refined by release acceptance). */
export const V1_NODE_MIN_MAJOR = 22;

/**
 * @param {{ platform?: string, arch?: string }} [opts]
 */
export function detectHostPlatform(opts = {}) {
  const os = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const hit = V1_SUPPORTED_PLATFORMS.find((p) => p.os === os && p.arch === arch);
  return {
    os,
    arch,
    label: hit ? hit.label : `${os}/${arch}`,
    supported: Boolean(hit),
  };
}

/**
 * @param {{ platform?: string, arch?: string }} [opts]
 * @returns {{ ok: true, platform: ReturnType<typeof detectHostPlatform> } | { ok: false, code: string, message: string, platform: ReturnType<typeof detectHostPlatform> }}
 */
export function assertSupportedPlatform(opts = {}) {
  const platform = detectHostPlatform(opts);
  if (platform.supported) {
    return { ok: true, platform };
  }
  const supported = V1_SUPPORTED_PLATFORMS.map((p) => p.label).join(", ");
  return {
    ok: false,
    code: "UNSUPPORTED_PLATFORM",
    platform,
    message: `PATH Code 1.0 supports ${supported} only. This host is ${platform.label}.`,
  };
}

/**
 * @param {string} [version]
 */
export function parseNodeMajor(version = process.versions.node) {
  const major = Number.parseInt(String(version).split(".")[0], 10);
  return Number.isFinite(major) ? major : 0;
}

/**
 * @param {{ nodeVersion?: string, minMajor?: number }} [opts]
 */
export function assertSupportedNode(opts = {}) {
  const nodeVersion = opts.nodeVersion ?? process.versions.node;
  const minMajor = opts.minMajor ?? V1_NODE_MIN_MAJOR;
  const major = parseNodeMajor(nodeVersion);
  if (major >= minMajor) {
    return {
      ok: true,
      nodeVersion,
      major,
      message: `Node.js ${nodeVersion}`,
    };
  }
  return {
    ok: false,
    code: "UNSUPPORTED_NODE",
    nodeVersion,
    major,
    message: `PATH Code 1.0 requires Node.js ${minMajor}+ (this process is Node.js ${nodeVersion}).`,
  };
}

/**
 * Read engines.node from package.json when available.
 * @param {string} packageRoot
 */
export function readPackageEnginesNode(packageRoot) {
  try {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    );
    return typeof pkg.engines?.node === "string" ? pkg.engines.node : null;
  } catch {
    return null;
  }
}
