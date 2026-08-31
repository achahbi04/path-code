/**
 * Explicit current-host platform lookup.
 * Reads process.platform only when called — never at import time.
 */

import type { Result } from "../domain/result.js";
import { detectPlatform } from "./detect.js";
import type { PlatformFailure, PlatformInfo } from "./types.js";

/**
 * Detect the Path Code platform identity of the current Node host.
 */
export function getCurrentPlatform(): Result<PlatformInfo, PlatformFailure> {
  return detectPlatform(process.platform);
}
