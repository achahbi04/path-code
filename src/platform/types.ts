/**
 * Host-platform identity vocabulary for Path Code.
 *
 * This is a deliberate extension seam — not a process/filesystem framework.
 */

export type PlatformId = "macos" | "linux" | "windows";

export type PathFlavor = "posix" | "win32";

export type PlatformInfo = {
  readonly id: PlatformId;
  /** Underlying Node.js `process.platform` value that produced this identity. */
  readonly nodePlatform: NodeJS.Platform;
  readonly pathFlavor: PathFlavor;
};

export type PlatformFailureCode = "UNSUPPORTED_PLATFORM";

export type PlatformFailure = {
  readonly code: PlatformFailureCode;
  readonly message: string;
  readonly details?: {
    readonly nodePlatform: string;
  };
};
