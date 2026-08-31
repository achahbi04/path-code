/**
 * Phase 2D project metadata and evidence-backed repository map.
 * Side-effect free on import.
 */

export { buildRepositoryMap, validateMetadataOptions } from "./map.js";
export {
  MAX_MANIFEST_CONTENT_BYTES,
  MAX_MANIFESTS_PER_METADATA_OPERATION,
} from "./constants.js";
export { MANIFEST_REGISTRY } from "./manifests.js";
export type {
  DependencySection,
  EffectiveMetadataLimits,
  IdentityDimension,
  InferenceBasis,
  InferredIdentityFact,
  ManifestEvidence,
  ManifestEvidenceData,
  ManifestObservation,
  MetadataCompletion,
  MetadataOptions,
  MetadataPartialReason,
  ObservedIdentityFact,
  ProjectIdentityClaim,
  RepositoryMap,
  RepositoryMapBoundary,
  RepositoryMapData,
  RepositoryMapDirectory,
  RepositoryMapEntry,
  RepositoryMapScope,
} from "./types.js";
export type { ManifestKind, ManifestFormat } from "./manifests.js";
export type { MetadataFailure, MetadataFailureCode } from "./failure.js";
