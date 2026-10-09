/**
 * S5 — PATH Build public surface.
 */

export {
  BUILD_RECORD_SCHEMA,
  createBuildRecordSkeleton,
  readBuildRecord,
  writeBuildRecord,
  listBuildRecords,
  findLatestActiveBuild,
  selectSurfaceBuildId,
  makeBuildActionId,
  resolveBuildRecordPath,
  resolveBuildsDir,
  appendPendingConversation,
  readPendingConversations,
  drainPendingConversations,
  resolveBuildConversationQueuePath,
  touchLifecycleActivity,
  setLastGoodPreview,
  projectLastGoodPreview,
  lifecycleActivityAtFor,
} from "./record.mjs";
export {
  appendBuildEvent,
  readBuildEvents,
  resolveBuildEventPath,
  sanitizeBuildEventValue,
  surfaceViewSanitizeLimits,
} from "./events.mjs";

export { ensureBuildOrigin, isBindableProject, hasGitDir } from "./origin.mjs";
export {
  assertAllowedProjectRoot,
  HOME_BINDING_GUARD,
} from "../paths.mjs";

export {
  deriveProductBrief,
  briefToOutcomeCriteria,
  inferProductKind,
  parseProductBriefResult,
  validateProductBriefEnvelope,
  productBriefObjective,
} from "./brief.mjs";
export { classifyConversationMessage } from "./conversation.mjs";
export { detectBuildArtifact, resolveArtifactStartPlan } from "./runtime/artifact.mjs";
export { createBuildRuntimeManager } from "./runtime/manager.mjs";
export { createProductRuntimeEnv, PRODUCT_HOST_ENV_KEYS } from "./runtime/product-env.mjs";
export { checkLocalEnvGitSafety } from "./runtime/local-env-safety.mjs";
export { inspectDeploymentSource, prepareDeploymentSource, cleanupDeploymentSource,
  inspectDeploymentTree, isUnsafeDeploymentPath } from "./deploy-source.mjs";
export { DEPLOYMENTS_SCHEMA, DEPLOY_RECONCILIATION_WINDOW_MISSING,
  PROVIDER_CREATION_TIME_SAFETY_ALLOWANCE_MS, PRODUCTION_DEPLOY_EXECUTION_TIMEOUT_MS,
  PRODUCTION_CREATION_TIME_SAFETY_ALLOWANCE_MS, emptyDeploymentAuthority, listBuildDeployments,
  prepareDeploymentMappingMutation, preflightDeployment, prepareDeploymentOperation,
  prepareProductionDeploymentOperation, transitionDeploymentOperation,
  transitionProductionDeploymentOperation, reconcileServing, productionActionEligibility,
  prepareFixtureReleaseOperation, finalizeFixtureRelease, prepareReleaseOperation,
  transitionReleaseOperation, finalizeReleaseOperation, recoverDeploymentFoundation, validateOperationSnapshot,
  canonicalConfigDigest, validateDeploymentLocator } from "./deployments.mjs";
export { parseVercelConfigMetadata, planVercelConfigProjection, makeVercelConfigCommand,
  parseVercelDeploymentReceipt, parseVercelServingObservation, operationMetadata,
  VERCEL_LIVE_PROOF_GATES } from "./vercel-deploy-contract.mjs";
export { createVercelChildEnv, makePreviewReadCommands, makePreviewDeployCommand,
  makePreviewInspectCommand, makePreviewReconcileCommand, parsePreviewAuth,
  parsePreviewProjectList, parsePreviewDeploymentReceipt, parsePreviewDeploymentStatus,
  makePreviewReconciliationIdentityInspectCommand, parsePreviewReconciliationIdentityStatus,
  parsePreviewReconciliation, executeVercelAdapterCommand,
  PREVIEW_RECONCILIATION_CODES, MAX_RECONCILIATION_PAGES, MAX_RECONCILIATION_INSPECTIONS,
  PREVIEW_DEPLOY_EXECUTION_TIMEOUT_MS,
  makePreviewReconciliationPageCommand, parsePreviewReconciliationPage,
  combinePreviewReconciliation, makeNoDeploymentObservedEvidence,
  reconcilePreviewWindow } from "./vercel-preview-adapter.mjs";
export { makeProductionDeployCommand, makeProductionInspectCommand,
  makeProductionAuthCommand, makeProductionProjectCommand,
  makeProductionIdentityInspectCommand, makeProductionReconciliationPageCommand,
  makeProductionConfigMetadataCommand, makeProductionConfigCommand,
  parseProductionDeploymentReceipt, parseProductionDeploymentStatus,
  parseProductionReconciliationPage, combineProductionReconciliation,
  reconcileProductionDeployment, executeProductionVercelCommand,
  MAX_PRODUCTION_RECONCILIATION_PAGES, MAX_PRODUCTION_IDENTITY_INSPECTIONS } from "./vercel-production-adapter.mjs";
export { makeProductionAliasesCommand, makeProductionReleaseInspectCommand,
  makeProductionServingEffectCommand, parseProductionAliasPage, observeProductionServing,
  executeProductionReleaseCommand } from "./vercel-release-adapter.mjs";
export { P11_DOMAINS_SCHEMA, P11_PROVIDER_PLATFORM_HOST_SUFFIXES, normalizeP11Fqdn, normalizeP11Nameserver, p11ManagedDnsReady, classifyP11Hostname, emptyP11DomainAuthority,
  readP11DomainAuthority, prepareP11DomainOperation, transitionP11DomainOperation,
  recordP11DomainObservation, reduceP11DomainObservation, classifyP11Tls } from "./p11-domains.mjs";
export { P11_PROVIDER_CONTRACTS, makeP11VercelApiCommand, executeP11VercelApi,
  reduceP11Project, reduceP11TeamDomainPage, reduceP11ProjectDomainPage, reduceP11DnsPage,
  reduceP11Certificates, reduceP11DomainConfig, reduceP11ProjectDomainDetail, makeP11RequiredRecords,
  observeP11VercelDomain } from "./vercel-domain-adapter.mjs";
export { isPublicP11Address, probeP11Https } from "./p11-https-probe.mjs";
export { captureBrowserEvidence } from "./runtime/browser-evidence.mjs";
export {
  adoptEngineerResultIntoBuild,
  ensureBuildProductBranch,
  gitHeadSha,
  isEmptyProductTree,
} from "./adopt.mjs";
export {
  decideChildReconciliation,
  isTaskTerminal,
  extractProviderProvenance,
} from "./reconcile.mjs";
export {
  parseBuildCognitiveResult,
  cognitiveResultToDirectives,
  isBuildEvaluationResult,
} from "./cognitive-result.mjs";
export {
  ARTIFACT_PRESENTATION_MATRIX,
  describePresentation,
} from "./runtime/presentation.mjs";
export { resolveBrowserProvider } from "./runtime/browser-provider.mjs";

export {
  captureBindingReality,
  makeEvidenceRef,
  classifyEvidenceFreshness,
  changesIndependentOfScope,
  applyStaleInvalidation,
  configFingerprint,
} from "./evidence.mjs";

export {
  realityRefreshDepthA,
  buildTargetedRevalidationObjective,
  parseStatusDirectives,
} from "./reinspect.mjs";

export { mechanicalProbeBinding } from "./mechanical-probe.mjs";

export {
  frameEngineerObjective,
  frameEvaluateObjective,
  frameChallengeObjective,
  completenessClaim,
} from "./objectives.mjs";

export { createBuildController } from "./controller.mjs";
export { listProductVersions, readProductVersion, compareProductVersions } from "./versions.mjs";
export { restoreHistoricalProductVersion, recoverPendingHistoricalRestore } from "./historical-restore.mjs";
export { createBuildRuntimeSync } from "./runtime/sync.mjs";
export {
  ENVIRONMENTS_SCHEMA, listBuildEnvironments, readBuildEnvironment,
  readBuildSecretBinding,
} from "./environments.mjs";
export { createBuildCoordinatorService } from "./coordinator/service.mjs";
export {
  startBuildCoordinatorServer,
  resolveBuildCoordinatorSocketPath,
  resolveBuildCoordinatorPidPath,
} from "./coordinator/server.mjs";
export { createBuildCoordinatorClient } from "./coordinator/client.mjs";
export { ensureBuildCoordinator } from "./coordinator/ensure.mjs";
export { formatBuildStatus, formatBuildCard } from "./format.mjs";
export { projectBuildForSurface } from "./surface/product-view.mjs";
export { startPathBuildSurface } from "./surface/server.mjs";
