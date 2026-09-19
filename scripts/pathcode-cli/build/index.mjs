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

export { ensureBuildOrigin, isBindableProject } from "./origin.mjs";

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
