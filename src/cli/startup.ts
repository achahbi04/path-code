/**
 * Pure CLI startup compatibility evaluation.
 * Reuses Phase 1A runtime contract and Phase 1F platform detection.
 */

import {
  evaluateNodeVersion,
  MINIMUM_SUPPORTED_NODE_MAJOR,
  type ParsedNodeVersion,
} from "../core/runtime.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { detectPlatform } from "../platform/detect.js";
import type { PlatformInfo } from "../platform/types.js";

export type StartupInfo = {
  readonly runtime: ParsedNodeVersion;
  readonly platform: PlatformInfo;
};

export type StartupFailureCode =
  | "UNSUPPORTED_RUNTIME"
  | "UNSUPPORTED_PLATFORM"
  | "MALFORMED_RUNTIME";

export type StartupFailure = {
  readonly code: StartupFailureCode;
  readonly message: string;
};

/**
 * Evaluate whether a runtime version + Node platform may start Path Code CLI.
 */
export function evaluateStartup(
  runtimeVersion: string,
  nodePlatform: NodeJS.Platform,
): Result<StartupInfo, StartupFailure> {
  const runtime = evaluateNodeVersion(runtimeVersion);
  if (!runtime.ok) {
    return failure({
      code: "MALFORMED_RUNTIME",
      message: runtime.reason,
    });
  }

  if (!runtime.supported) {
    return failure({
      code: "UNSUPPORTED_RUNTIME",
      message: `Node.js ${runtime.version.major}.${runtime.version.minor}.${runtime.version.patch} is below the minimum supported major version ${MINIMUM_SUPPORTED_NODE_MAJOR}`,
    });
  }

  const platform = detectPlatform(nodePlatform);
  if (!platform.ok) {
    return failure({
      code: "UNSUPPORTED_PLATFORM",
      message: platform.error.message,
    });
  }

  return success({
    runtime: runtime.version,
    platform: platform.value,
  });
}
