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
  makeBuildActionId,
  resolveBuildRecordPath,
  resolveBuildsDir,
} from "./record.mjs";
export {
  appendBuildEvent,
  readBuildEvents,
  resolveBuildEventPath,
  sanitizeBuildEventValue,
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
export { createBuildRuntimeSync } from "./runtime/sync.mjs";
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
