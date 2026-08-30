/**
 * Path Code Git workspace discovery.
 * Side-effect free on import — Git runs only on explicit discovery calls.
 */

export { discoverGitRepository, type GitRepository } from "./discovery.js";
export type {
  GitDiscoveryFailure,
  GitDiscoveryFailureCode,
} from "./failure.js";
