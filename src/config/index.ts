/**
 * Public configuration surface — load and represent only.
 */

export { loadProjectConfig } from "./loader.js";
export {
  configFailure,
  type ConfigFailure,
  type ConfigFailureCode,
} from "./failure.js";
export {
  defaultProjectConfig,
  type ProjectConfig,
  type ProjectConfigSource,
  type ProjectRestrictions,
  type RepositoryGuidance,
  type RepositoryGuidanceTrust,
  type UnknownDirective,
} from "./types.js";
