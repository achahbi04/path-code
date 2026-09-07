/**
 * In-memory reference catalog bound to one workspace/snapshot context.
 * Opaque handles correlate selected Phase 2 artifacts — not secrets or authority.
 */

import { randomUUID } from "node:crypto";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { RepositoryEntry } from "../inventory/types.js";
import type { ManifestEvidence } from "../metadata/types.js";
import type { ContentObservation } from "../reader/types.js";
import type { RepositorySnapshot } from "../snapshot/types.js";
import { MAX_CATALOG_RECORDS } from "./bounds.js";
import {
  catalogFailure,
  type ReasoningCatalogFailure,
} from "./failures.js";
import {
  type CatalogRecord,
  type ReferenceCatalogInternal,
  type ReferenceEvidenceKind,
  lookupCatalog,
  registerCatalog,
} from "./internal/registry.js";

export type { ReferenceEvidenceKind };

export type ReferenceCatalogSelection = {
  readonly entries?: readonly RepositoryEntry[];
  readonly contentObservations?: readonly ContentObservation[];
  readonly manifestEvidence?: readonly ManifestEvidence[];
};

export type CreateReferenceCatalogInput = {
  readonly workspace: WorkspaceBoundary;
  readonly snapshot: RepositorySnapshot;
  readonly selection: ReferenceCatalogSelection;
};

/**
 * Opaque catalog. Authenticity is registry membership, not structural shape.
 */
export type ReferenceCatalog = {
  readonly __referenceCatalogBrand: never;
};

export type ReferenceDescriptor = {
  readonly handle: string;
  readonly evidenceKind: ReferenceEvidenceKind;
  readonly relativePath?: string;
};

/**
 * Entries eligible for Gate 1 ENTRY selection.
 * Includes ADMITTED members and DESCENDED directories (parents used for CREATE_TEXT).
 * Does not admit denied, partial, or non-directory DESCENDED shapes.
 */
function catalogEligibleEntrySet(
  snapshot: RepositorySnapshot,
): Set<RepositoryEntry> {
  const set = new Set<RepositoryEntry>();
  for (const observation of snapshot.inventory.observations) {
    if (observation.disposition === "ADMITTED") {
      set.add(observation.entry);
    } else if (
      observation.disposition === "DESCENDED" &&
      observation.entry.physicalKind === "DIRECTORY"
    ) {
      set.add(observation.entry);
    }
  }
  return set;
}

function collectObservedManifestEvidence(
  snapshot: RepositorySnapshot,
): Set<ManifestEvidence> {
  const set = new Set<ManifestEvidence>();
  const map = snapshot.repositoryMap;
  if (map === undefined) {
    return set;
  }
  for (const scope of map.scopes) {
    for (const claim of scope.identityClaims) {
      if (claim.confidence === "OBSERVED") {
        set.add(claim.evidence);
      }
    }
  }
  return set;
}

function pushPath(
  map: Map<string, CatalogRecord[]>,
  relativePath: string,
  record: CatalogRecord,
): void {
  const existing = map.get(relativePath);
  if (existing === undefined) {
    map.set(relativePath, [record]);
  } else {
    existing.push(record);
  }
}

/**
 * Build an immutable in-memory catalog from genuine retained artifacts.
 * Caller may narrow selection; may not manufacture membership.
 */
export function createReferenceCatalog(
  input: CreateReferenceCatalogInput,
): Result<ReferenceCatalog, ReasoningCatalogFailure> {
  const { workspace, snapshot, selection } = input;

  if (workspace !== snapshot.workspace) {
    return failure(
      catalogFailure(
        "INCOMPATIBLE_CONTEXT",
        "Workspace is not the snapshot workspace",
      ),
    );
  }

  const admitted = catalogEligibleEntrySet(snapshot);
  const observedManifests = collectObservedManifestEvidence(snapshot);
  const entries = selection.entries ?? [];
  const observations = selection.contentObservations ?? [];
  const manifests = selection.manifestEvidence ?? [];
  const total = entries.length + observations.length + manifests.length;

  if (total < 1 || total > MAX_CATALOG_RECORDS) {
    return failure(
      catalogFailure(
        "SELECTION_REJECTED",
        "Catalog selection count is outside the allowed range",
      ),
    );
  }

  const selectedEntries = new Set<RepositoryEntry>();
  const selectedObservations = new Set<ContentObservation>();
  const selectedManifests = new Set<ManifestEvidence>();
  const records: CatalogRecord[] = [];
  const byHandle = new Map<string, CatalogRecord>();
  const entryByPath = new Map<string, CatalogRecord[]>();
  const contentByPath = new Map<string, CatalogRecord[]>();
  const manifestByPath = new Map<string, CatalogRecord[]>();

  for (const entry of entries) {
    if (selectedEntries.has(entry)) {
      return failure(
        catalogFailure(
          "SELECTION_REJECTED",
          "Duplicate entry selection rejected",
        ),
      );
    }
    if (!admitted.has(entry)) {
      return failure(
        catalogFailure(
          "SELECTION_REJECTED",
          "Selected entry is not an admitted inventory member of this snapshot",
        ),
      );
    }
    selectedEntries.add(entry);
    const handle = randomUUID();
    const record: CatalogRecord = {
      evidenceKind: "ENTRY",
      handle,
      entry,
      relativePath: entry.relativePath,
    };
    records.push(record);
    byHandle.set(handle, record);
    pushPath(entryByPath, entry.relativePath, record);
  }

  for (const observation of observations) {
    if (selectedObservations.has(observation)) {
      return failure(
        catalogFailure(
          "SELECTION_REJECTED",
          "Duplicate content observation selection rejected",
        ),
      );
    }
    const bound = snapshot.contentObservationByEntry.get(observation.entry);
    if (bound !== observation) {
      return failure(
        catalogFailure(
          "SELECTION_REJECTED",
          "Content observation is not bound in this snapshot by reference identity",
        ),
      );
    }
    if (observation.entry !== bound.entry) {
      return failure(
        catalogFailure(
          "SELECTION_REJECTED",
          "Content observation entry association is inconsistent",
        ),
      );
    }
    if (!admitted.has(observation.entry)) {
      return failure(
        catalogFailure(
          "SELECTION_REJECTED",
          "Content observation entry is not admitted in this snapshot",
        ),
      );
    }
    selectedObservations.add(observation);
    const handle = randomUUID();
    const record: CatalogRecord = {
      evidenceKind: "CONTENT",
      handle,
      observation,
      entry: observation.entry,
      relativePath: observation.entry.relativePath,
    };
    records.push(record);
    byHandle.set(handle, record);
    pushPath(contentByPath, observation.entry.relativePath, record);
  }

  for (const evidence of manifests) {
    if (selectedManifests.has(evidence)) {
      return failure(
        catalogFailure(
          "SELECTION_REJECTED",
          "Duplicate manifest evidence selection rejected",
        ),
      );
    }
    if (!observedManifests.has(evidence)) {
      return failure(
        catalogFailure(
          "SELECTION_REJECTED",
          "Manifest evidence is not an OBSERVED claim association of this snapshot map",
        ),
      );
    }
    const boundObservation = snapshot.contentObservationByEntry.get(
      evidence.entry,
    );
    if (boundObservation !== evidence.observation) {
      return failure(
        catalogFailure(
          "SELECTION_REJECTED",
          "Manifest evidence observation is not the snapshot-bound observation",
        ),
      );
    }
    if (evidence.observation.entry !== evidence.entry) {
      return failure(
        catalogFailure(
          "SELECTION_REJECTED",
          "Manifest evidence entry/observation association is inconsistent",
        ),
      );
    }
    selectedManifests.add(evidence);
    const handle = randomUUID();
    const record: CatalogRecord = {
      evidenceKind: "MANIFEST",
      handle,
      evidence,
      entry: evidence.entry,
      observation: evidence.observation,
      relativePath: evidence.entry.relativePath,
    };
    records.push(record);
    byHandle.set(handle, record);
    pushPath(manifestByPath, evidence.entry.relativePath, record);
  }

  const internal: ReferenceCatalogInternal = {
    workspace,
    snapshot,
    records: Object.freeze([...records]),
    byHandle,
    entryByPath,
    contentByPath,
    manifestByPath,
    disposed: false,
  };

  const publicCatalog = Object.freeze({}) as ReferenceCatalog;
  registerCatalog(publicCatalog, internal);
  return success(publicCatalog);
}

/**
 * Model-facing descriptors — handles, kinds, optional admitted relative paths.
 * No bytes, secrets, absolute paths, or registry internals.
 */
export function describeReferenceCatalog(
  catalog: ReferenceCatalog,
): Result<readonly ReferenceDescriptor[], ReasoningCatalogFailure> {
  const internal = lookupCatalog(catalog);
  if (internal === undefined) {
    return failure(
      catalogFailure(
        "INVALID_CATALOG",
        "Catalog is not registered or was reconstructed",
      ),
    );
  }
  if (internal.disposed) {
    return failure(
      catalogFailure("DISPOSED_CATALOG", "Catalog has been disposed"),
    );
  }

  const descriptors: ReferenceDescriptor[] = internal.records.map((record) => {
    const descriptor: ReferenceDescriptor = {
      handle: record.handle,
      evidenceKind: record.evidenceKind,
      relativePath: record.relativePath,
    };
    return Object.freeze(descriptor);
  });
  return success(Object.freeze(descriptors));
}

/** Revoke catalog use and future applicability checks that require it. */
export function disposeReferenceCatalog(catalog: ReferenceCatalog): void {
  const internal = lookupCatalog(catalog);
  if (internal !== undefined) {
    internal.disposed = true;
  }
}

export function requireLiveCatalog(
  catalog: ReferenceCatalog,
): Result<ReferenceCatalogInternal, ReasoningCatalogFailure> {
  const internal = lookupCatalog(catalog);
  if (internal === undefined) {
    return failure(
      catalogFailure(
        "INVALID_CATALOG",
        "Catalog is not registered or was reconstructed",
      ),
    );
  }
  if (internal.disposed) {
    return failure(
      catalogFailure("DISPOSED_CATALOG", "Catalog has been disposed"),
    );
  }
  return success(internal);
}

/**
 * Read-only live-catalog association projection for trusted conductors.
 * Authenticates registration/liveness and reveals retained workspace/snapshot
 * plus model-facing descriptors. Does not load file bytes, issue artifacts,
 * or expose private Maps.
 */
export type LiveReferenceCatalogAssociation = {
  readonly catalog: ReferenceCatalog;
  readonly workspace: WorkspaceBoundary;
  readonly snapshot: RepositorySnapshot;
  readonly descriptors: readonly ReferenceDescriptor[];
  readonly live: true;
};

export function inspectLiveReferenceCatalogAssociation(
  catalog: ReferenceCatalog,
): Result<LiveReferenceCatalogAssociation, ReasoningCatalogFailure> {
  const internalResult = requireLiveCatalog(catalog);
  if (!internalResult.ok) {
    return internalResult;
  }
  const internal = internalResult.value;
  const descriptors: ReferenceDescriptor[] = internal.records.map((record) => {
    const descriptor: ReferenceDescriptor = {
      handle: record.handle,
      evidenceKind: record.evidenceKind,
      relativePath: record.relativePath,
    };
    return Object.freeze(descriptor);
  });
  return success(
    Object.freeze({
      catalog,
      workspace: internal.workspace,
      snapshot: internal.snapshot,
      descriptors: Object.freeze(descriptors),
      live: true as const,
    }),
  );
}
