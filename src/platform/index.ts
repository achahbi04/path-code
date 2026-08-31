/**
 * Public platform foundation surface — package-internal by preference.
 */

export { detectPlatform } from "./detect.js";
export { getCurrentPlatform } from "./current.js";
export type {
  PathFlavor,
  PlatformFailure,
  PlatformFailureCode,
  PlatformId,
  PlatformInfo,
} from "./types.js";
