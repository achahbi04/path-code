/**
 * Private registration for reference catalogs and bound reasoning results.
 * Authenticity association only — not process authority.
 */

import type { WorkspaceBoundary } from "../../domain/workspace.js";
import type { RepositoryEntry } from "../../inventory/types.js";
import type { ManifestEvidence } from "../../metadata/types.js";
import type { ContentObservation } from "../../reader/types.js";
import type { RepositorySnapshot } from "../../snapshot/types.js";
import type { ReferenceBoundReasoning } from "../types.js";

export type ReferenceEvidenceKind = "ENTRY" | "CONTENT" | "MANIFEST";

export type CatalogRecord =
  | {
      readonly evidenceKind: "ENTRY";
      readonly handle: string;
      readonly entry: RepositoryEntry;
      readonly relativePath: string;
    }
  | {
      readonly evidenceKind: "CONTENT";
      readonly handle: string;
      readonly observation: ContentObservation;
      readonly entry: RepositoryEntry;
      readonly relativePath: string;
    }
  | {
      readonly evidenceKind: "MANIFEST";
      readonly handle: string;
      readonly evidence: ManifestEvidence;
      readonly entry: RepositoryEntry;
      readonly observation: ContentObservation;
      readonly relativePath: string;
    };

export type ReferenceCatalogInternal = {
  readonly workspace: WorkspaceBoundary;
  readonly snapshot: RepositorySnapshot;
  readonly records: readonly CatalogRecord[];
  readonly byHandle: ReadonlyMap<string, CatalogRecord>;
  readonly entryByPath: ReadonlyMap<string, readonly CatalogRecord[]>;
  readonly contentByPath: ReadonlyMap<string, readonly CatalogRecord[]>;
  readonly manifestByPath: ReadonlyMap<string, readonly CatalogRecord[]>;
  disposed: boolean;
};

export type BoundReasoningRegistration = {
  readonly reasoning: ReferenceBoundReasoning;
  readonly catalog: ReferenceCatalogInternal;
  readonly retainedClaimSources: ReadonlyMap<
    string,
    {
      readonly entries: readonly RepositoryEntry[];
      readonly observations: readonly ContentObservation[];
      readonly manifests: readonly ManifestEvidence[];
    }
  >;
};

const catalogRegistry = new WeakMap<object, ReferenceCatalogInternal>();
const boundRegistry = new WeakMap<
  ReferenceBoundReasoning,
  BoundReasoningRegistration
>();

export function registerCatalog(
  publicHandle: object,
  internal: ReferenceCatalogInternal,
): void {
  catalogRegistry.set(publicHandle, internal);
}

export function lookupCatalog(
  publicHandle: object,
): ReferenceCatalogInternal | undefined {
  return catalogRegistry.get(publicHandle);
}

export function registerBoundReasoning(
  reasoning: ReferenceBoundReasoning,
  registration: BoundReasoningRegistration,
): void {
  boundRegistry.set(reasoning, registration);
}

export function lookupBoundReasoning(
  reasoning: ReferenceBoundReasoning,
): BoundReasoningRegistration | undefined {
  return boundRegistry.get(reasoning);
}
