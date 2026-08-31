/**
 * Phase 2D metadata and repository-map types.
 *
 * OBSERVED identity requires earned ManifestEvidence.
 * INFERRED identity never carries ManifestEvidence.
 * Directory names never produce identity claims.
 */

import type { GitEntryAnnotation, GitRepositoryAvailability, GitStateBaseline, UnmappedVisibleGitObservation } from "../git/types.js";
import type { TraversalCompletion } from "../inventory/disposition.js";
import type { RepositoryEntry } from "../inventory/types.js";
import type { ContentObservation } from "../reader/types.js";
import type { ManifestKind } from "./manifests.js";

export type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";

export type IdentityDimension =
  | "ECOSYSTEM"
  | "LANGUAGE"
  | "PACKAGE_DEPENDENCY"
  | "MODULE_TYPE"
  | "WORKSPACE_PATTERNS";

export type ObservedIdentityFact =
  | {
      readonly kind: "DECLARED_PACKAGE_DEPENDENCY";
      readonly packageName: string;
      readonly section: DependencySection;
    }
  | {
      readonly kind: "DECLARED_MODULE_TYPE";
      readonly value: "module" | "commonjs";
    }
  | {
      readonly kind: "DECLARED_WORKSPACE_PATTERNS";
      readonly patterns: readonly string[];
    };

export type InferredIdentityFact =
  | {
      readonly kind: "LANGUAGE_SOURCE_MAY_BE_PRESENT";
      readonly language: string;
    }
  | {
      readonly kind: "ECOSYSTEM_MAY_BE_PRESENT";
      readonly ecosystem: string;
    };

export type InferenceBasis =
  | {
      readonly kind: "SOURCE_EXTENSION";
      readonly extension: string;
      readonly relativePath: string;
    }
  | {
      readonly kind: "MANIFEST_FILENAME";
      readonly manifestKind: ManifestKind;
      readonly relativePath: string;
    };

export type ManifestEvidenceData = {
  readonly observation: ContentObservation;
  readonly entry: RepositoryEntry;
  readonly manifestKind: ManifestKind;
  readonly fact: ObservedIdentityFact;
};

/**
 * Earned manifest evidence — produced only by metadata extraction.
 */
export type ManifestEvidence = ManifestEvidenceData & {
  readonly __manifestEvidenceBrand: never;
};

export type ProjectIdentityClaim =
  | {
      readonly confidence: "OBSERVED";
      readonly scopeRelativePath: string;
      readonly fact: ObservedIdentityFact;
      readonly evidence: ManifestEvidence;
    }
  | {
      readonly confidence: "INFERRED";
      readonly scopeRelativePath: string;
      readonly inference: InferredIdentityFact;
      readonly basis: InferenceBasis;
    }
  | {
      readonly confidence: "UNKNOWN";
      readonly scopeRelativePath: string;
      readonly dimension: IdentityDimension;
    };

export type MetadataPartialReason =
  | { readonly kind: "MANIFEST_LIMIT_REACHED" }
  | { readonly kind: "MANIFEST_TOO_LARGE"; readonly relativePath: string }
  | { readonly kind: "MANIFEST_STALE"; readonly relativePath: string }
  | { readonly kind: "MANIFEST_UNREADABLE"; readonly relativePath: string }
  | { readonly kind: "MANIFEST_NOT_REGULAR_FILE"; readonly relativePath: string }
  | { readonly kind: "MANIFEST_BINARY"; readonly relativePath: string }
  | { readonly kind: "MANIFEST_PARSE_FAILED"; readonly relativePath: string }
  | { readonly kind: "MANIFEST_SCHEMA_UNSUPPORTED"; readonly relativePath: string }
  | { readonly kind: "MANIFEST_DECLARATION_SHAPE_UNSUPPORTED"; readonly relativePath: string };

export type NonEmptyMetadataPartialReasons = readonly [
  MetadataPartialReason,
  ...MetadataPartialReason[],
];

export type MetadataCompletion =
  | { readonly kind: "COMPLETE" }
  | {
      readonly kind: "PARTIAL";
      readonly reasons: NonEmptyMetadataPartialReasons;
    };

export type ManifestObservation =
  | {
      readonly kind: "PARSED_JSON";
      readonly relativePath: string;
      readonly manifestKind: ManifestKind;
      readonly entry: RepositoryEntry;
      readonly observation: ContentObservation;
    }
  | {
      readonly kind: "UNPARSED_BY_DESIGN";
      readonly relativePath: string;
      readonly manifestKind: ManifestKind;
      readonly entry: RepositoryEntry;
      readonly observation: ContentObservation;
    }
  | {
      readonly kind: "PARSE_FAILED";
      readonly relativePath: string;
      readonly manifestKind: ManifestKind;
      readonly entry: RepositoryEntry;
      readonly observation: ContentObservation;
    }
  | {
      readonly kind: "SCHEMA_UNSUPPORTED";
      readonly relativePath: string;
      readonly manifestKind: ManifestKind;
      readonly entry: RepositoryEntry;
      readonly observation: ContentObservation;
      readonly detail: string;
    }
  | {
      readonly kind: "DECLARATION_SHAPE_UNSUPPORTED";
      readonly relativePath: string;
      readonly manifestKind: ManifestKind;
      readonly entry: RepositoryEntry;
      readonly observation: ContentObservation;
      readonly detail: string;
    }
  | {
      readonly kind: "READ_TOO_LARGE";
      readonly relativePath: string;
      readonly manifestKind: ManifestKind;
      readonly entry: RepositoryEntry;
      readonly byteLengthObserved: number;
      readonly maxBytes: number;
    }
  | {
      readonly kind: "READ_STALE";
      readonly relativePath: string;
      readonly manifestKind: ManifestKind;
      readonly entry: RepositoryEntry;
    }
  | {
      readonly kind: "READ_UNREADABLE";
      readonly relativePath: string;
      readonly manifestKind: ManifestKind;
      readonly entry: RepositoryEntry;
    }
  | {
      readonly kind: "READ_NOT_REGULAR_FILE";
      readonly relativePath: string;
      readonly manifestKind: ManifestKind;
      readonly entry: RepositoryEntry;
      readonly physicalKind: RepositoryEntry["physicalKind"];
    }
  | {
      readonly kind: "READ_BINARY";
      readonly relativePath: string;
      readonly manifestKind: ManifestKind;
      readonly entry: RepositoryEntry;
    };

export type RepositoryMapBoundary =
  | { readonly kind: "DENIED"; readonly relativePath: string }
  | {
      readonly kind: "SYSTEM_PRUNED";
      readonly relativePath: string;
      readonly reason: string;
    };

export type RepositoryMapDirectory = {
  readonly relativePath: string;
  readonly admittedEntryCount: number;
};

export type RepositoryMapScope = {
  readonly scopeRelativePath: string;
  readonly identityClaims: readonly ProjectIdentityClaim[];
  readonly manifestRelativePaths: readonly string[];
};

export type RepositoryMapEntry = {
  readonly relativePath: string;
  readonly entry: RepositoryEntry;
  readonly gitAnnotation?: GitEntryAnnotation;
};

export type RepositoryMapData = {
  readonly inventoryTraversalCompletion: TraversalCompletion;
  readonly metadataCompletion: MetadataCompletion;
  readonly boundaries: readonly RepositoryMapBoundary[];
  readonly directories: readonly RepositoryMapDirectory[];
  readonly entries: readonly RepositoryMapEntry[];
  readonly scopes: readonly RepositoryMapScope[];
  readonly manifestObservations: readonly ManifestObservation[];
  readonly sidecarUnmappedGit: readonly UnmappedVisibleGitObservation[];
  readonly gitAvailability?: GitRepositoryAvailability;
};

/**
 * Earned repository map — produced only by buildRepositoryMap.
 */
export type RepositoryMap = RepositoryMapData & {
  readonly __repositoryMapBrand: never;
};

export type MetadataOptions = {
  readonly maxManifests?: number;
  readonly maxManifestBytes?: number;
  readonly gitBaseline?: GitStateBaseline;
};

export type EffectiveMetadataLimits = {
  readonly maxManifests: number;
  readonly maxManifestBytes: number;
};
