/**
 * Public configuration surface — load and represent only.
 */

export { loadProjectConfig } from "./loader.js";
export {
  type ConfigFailure,
  type ConfigFailureCode,
} from "./failure.js";
export {
  type ProjectConfig,
  type ProjectConfigSource,
  type ProjectRestrictions,
  type RepositoryGuidance,
  type RepositoryGuidanceTrust,
  type ResolvedProjectConfig,
  type UnknownDirective,
} from "./types.js";
