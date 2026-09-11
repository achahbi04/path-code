/**
 * Phase GC1-a/b/c — public surface for the Cloud Workstation lifecycle engine.
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

/** Phase GC1-c — host/application layer. */
export {
  GC1C_CONFIG,
  GC1C_PROBE_WORKSTATION,
  GC1C_SESSION_BUDGET,
  GC1C_IMAGE_DIGEST,
  GC1C_COST_FENCES,
  GC1C_ERROR,
} from "./cloud-constants.mjs";
export {
  captureTaskSnapshot,
  materializeTaskWorkspace,
  verifySnapshotCurrentness,
  manifestDigest,
  assertPrimaryUnchanged,
  writeSnapshotDiffArtifact,
  normalizeHydrationRelativePath,
  isCredentialCanaryPath,
  CREDENTIAL_CANARY_PATH_PATTERNS,
  captureLocalDirectionalityState,
  assertDirectionalityUnchanged,
} from "./task-snapshot.mjs";
export {
  REMOTE_WORKER_VERSION,
  WORKER_REMOTE_DIR,
  WORKER_REMOTE_PATH,
  REMOTE_WORKER_SCRIPT_SOURCE,
  installRemoteWorker,
  invokeRemoteWorker,
  dispatchWorkerRequest,
  toProcessObservation,
  assertNoCredentialCanaries,
  getLastRemoteWorkerInstallReceipt,
  parseWorkerProtocolResponse,
} from "./remote-worker.mjs";
export {
  DEFAULT_RUNTIME_ROOT_PREFIX,
  buildRuntimeRoot,
  assertRuntimeRelativePath,
  assertPathUnderRuntimeRoot,
  assertTransportRuntimeDeliveryCapability,
  sha256Hex,
  assertNoSecretsInDeliverySurfaces,
  deliverVerifiedHostRuntimeFile,
  shQuote,
  GC1_RUNTIME_DELIVERY_ERROR,
  parseWcBytes,
  parseSha256Sum,
} from "./runtime-delivery.mjs";
export { assertGc1cTransportConformance } from "./transport-conformance.mjs";
export {
  encodeShellArg,
  encodeShellArgv,
  assertRemoteCommandString,
  looksLikeArrayCommaCoercion,
  GC1_SHELL_ENCODE_ERROR,
} from "./shell-encode.mjs";
export {
  TRUSTED_REMOTE_NODE,
  encodeWorkerBootstrapCommand,
  parseWorkerBootstrapCommand,
  assertVerifiedWorkerPath,
  assertWorkerInstallReceipt,
  encodeTrustedRemoteDescriptor,
  GC1_BOOTSTRAP_ERROR,
} from "./worker-bootstrap.mjs";
export {
  createCloudEffectsBackend,
  loadEditingHostDependencies,
  refuseModelInjection,
  remapCwd,
  remapExecutable,
  remapArgv,
  remapPathArgument,
  REMOTE_NODE_EXECUTABLE,
  REMOTE_NPM_CLI_JS,
  sanitizeRemoteEnv,
} from "./cloud-effects.mjs";
export {
  createTaskJournal,
  DEFAULT_JOURNAL_ROOT,
  CLEANUP_PENDING,
  CLEANUP_VERIFIED,
} from "./task-journal.mjs";
export {
  FORBIDDEN_REMOTE_CREDENTIAL_ENV_KEYS,
  buildRemoteCredentialBoundaryCommand,
  assertLocalSurfacesFreeOfCanary,
  runRemoteCredentialBoundaryProof,
} from "./credential-boundary.mjs";
export {
  resolveHydrationPaths,
  collectValidationSupportPaths,
  computeEffectiveHydrationSet,
  assertHydrationSetExact,
  isValidationSupportTestPath,
  VALIDATION_SUPPORT_BASENAMES,
  VALIDATION_SUPPORT_TEST_SUFFIXES,
  prepareCloudTaskEnvironment,
  finalizeCloudTask,
  remapApprovedScopeEntries,
  remapValidationCandidatesForTaskWorkspace,
  inventoryEntriesByPath,
} from "./cloud-session.mjs";
export {
  ENGINEERING_TOOL_SPECS,
  queryMachineCapabilities,
  parseToolVersion,
  interpretToolResult,
  formatMachineCapabilityLines,
} from "./machine-capabilities.mjs";
export {
  isTransientExecutionChannelFailure,
} from "./lifecycle.mjs";
