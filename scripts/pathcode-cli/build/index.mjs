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

export { ensureBuildOrigin, isBindableProject, hasGitDir } from "./origin.mjs";

export { deriveProductBrief, briefToOutcomeCriteria, inferProductKind } from "./brief.mjs";
export { classifyConversationMessage } from "./conversation.mjs";
export { detectBuildArtifact, resolveArtifactStartPlan } from "./runtime/artifact.mjs";
export { createBuildRuntimeManager } from "./runtime/manager.mjs";
export { captureBrowserEvidence } from "./runtime/browser-evidence.mjs";
export {
  adoptEngineerResultIntoBuild,
  ensureBuildProductBranch,
  gitHeadSha,
} from "./adopt.mjs";
export {
  ARTIFACT_PRESENTATION_MATRIX,
  describePresentation,
} from "./runtime/presentation.mjs";

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
export { formatBuildStatus, formatBuildCard } from "./format.mjs";
export { projectBuildForSurface } from "./surface/product-view.mjs";
export { startPathBuildSurface } from "./surface/server.mjs";
