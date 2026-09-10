/**
 * Phase GC1-a — public surface for the Cloud Workstation lifecycle engine.
 *
 * Canonical/test code should import mock + lifecycle only.
 * GcpWorkstationTransport is exported for the live-smoke entrypoint exclusively.
 */

export * from "./constants.mjs";
export { createMockWorkstationTransport } from "./mock-transport.mjs";
export { createWorkstationLifecycleManager } from "./lifecycle.mjs";
export {
  createImpersonatedControlAuth,
  assertLiveSmokeAuthorized,
  buildBearerAuthHeaders,
  headersToPlainRecord,
  hasBearerAuthorization,
} from "./auth.mjs";
export {
  executeViaControlSaTunnel,
  createTunnelSession,
  captureChildStreams,
  normalizeRemoteText,
  resolveWorkstationTunnelTarget,
} from "./remote-exec.mjs";

/**
 * Lazy accessor — avoids loading google-auth / GCP client during canonical import.
 * Real construction still requires GC1_LIVE_SMOKE=1 inside createGcpWorkstationTransport.
 */
export async function loadGcpWorkstationTransportFactory() {
  const mod = await import("./gcp-transport.mjs");
  return mod.createGcpWorkstationTransport;
}

export {
  createWorkspaceHydrator,
  listHydrationFiles,
  shouldExcludeHydrationPath,
  resolveConfinedWorkspaceCwd,
  runInWorkspace,
  DEFAULT_REMOTE_ROOT,
} from "./workspace-hydrator.mjs";
export { detectDependencyStrategy } from "./dependency-strategy.mjs";
export {
  getCacheEnvHints,
  GC1_CACHE_DIRS,
  GC1_CACHE_CORRECTNESS_RULE,
} from "./cache-strategy.mjs";
export {
  ARTIFACT_REGISTRY,
  IMAGE_NAME,
  DEFAULT_IMAGE_TAG,
  IMAGE_DIGEST_HISTORY,
  WORKSTATIONS_BASE,
  workstationsBasePinnedReference,
  engineeringImageRepositoryPath,
  pinnedImageReference,
  buildConfigContainerPin,
} from "./engineering-image.mjs";
export {
  assertWorkstationsImageContract,
  parseDockerfileContractSurface,
  assertDurableToolchainPathEnv,
  DURABLE_TOOLCHAIN_PATH_PREFIXES,
} from "./image-contract.mjs";
