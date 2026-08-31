/**
 * Pure Node platform → Path Code platform mapping.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { PlatformFailure, PlatformInfo } from "./types.js";

/**
 * Map a Node.js platform identifier to Path Code platform identity.
 * Unknown/unsupported platforms fail explicitly — never silently coerce.
 */
export function detectPlatform(
  nodePlatform: NodeJS.Platform,
): Result<PlatformInfo, PlatformFailure> {
  switch (nodePlatform) {
    case "darwin":
      return success({
        id: "macos",
        nodePlatform,
        pathFlavor: "posix",
      });
    case "linux":
      return success({
        id: "linux",
        nodePlatform,
        pathFlavor: "posix",
      });
    case "win32":
      return success({
        id: "windows",
        nodePlatform,
        pathFlavor: "win32",
      });
    default:
      return failure({
        code: "UNSUPPORTED_PLATFORM",
        message: "Host Node platform is not supported by Path Code",
        details: { nodePlatform },
      });
  }
}
