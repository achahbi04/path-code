/**
 * G9 — platform backend detection for user-space tool acquisition.
 * Only claim proven hosts; never invent Windows support.
 */

/**
 * @typedef {'darwin'|'linux'|'windows'} Ag9Os
 * @typedef {'arm64'|'x64'} Ag9Arch
 * @typedef {`${Ag9Os}-${Ag9Arch}`} Ag9PlatformId
 */

/** Platforms with proven user-space mise acquisition. */
export const SUPPORTED_PLATFORM_IDS = Object.freeze([
  "darwin-arm64",
  "linux-x64",
  "linux-arm64",
]);

/**
 * Detect host OS/arch for tool download asset selection.
 * @returns {{ os: Ag9Os, arch: Ag9Arch, id: Ag9PlatformId }}
 */
export function detectPlatform() {
  /** @type {Ag9Os} */
  let os = "linux";
  if (process.platform === "darwin") os = "darwin";
  else if (process.platform === "win32") os = "windows";
  else os = "linux";

  /** @type {Ag9Arch} */
  let arch = "x64";
  if (process.arch === "arm64") arch = "arm64";
  else arch = "x64";

  return { os, arch, id: /** @type {Ag9PlatformId} */ (`${os}-${arch}`) };
}

/**
 * @param {{ id?: string } | string} [platform]
 * @returns {boolean}
 */
export function isPlatformSupported(platform) {
  const id =
    typeof platform === "string"
      ? platform
      : platform && typeof platform.id === "string"
        ? platform.id
        : detectPlatform().id;
  return SUPPORTED_PLATFORM_IDS.includes(id);
}

/**
 * Backend capability claim for the current (or given) platform.
 * @param {{ id?: string } | string} [platform]
 * @returns {{ id: string, supported: boolean, canAcquireUserSpace: boolean }}
 */
export function platformBackend(platform) {
  const detected = detectPlatform();
  const id =
    typeof platform === "string"
      ? platform
      : platform && typeof platform.id === "string"
        ? platform.id
        : detected.id;
  const supported = isPlatformSupported(id);
  return {
    id,
    supported,
    canAcquireUserSpace: supported,
  };
}

/**
 * Map PATH platform id → mise release asset platform token (darwin → macos).
 * @param {{ os: string, arch: string } | null | undefined} [platform]
 * @returns {string}
 */
export function miseAssetPlatform(platform) {
  const p = platform ?? detectPlatform();
  const os = p.os === "darwin" ? "macos" : p.os === "windows" ? "windows" : "linux";
  const arch = p.arch === "arm64" ? "arm64" : "x64";
  return `${os}-${arch}`;
}
