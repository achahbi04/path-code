/**
 * Narrow read-only projection of Gate 1 bound-reasoning registration.
 * Authenticates and reveals already-retained association only.
 * Not added to the five-function Phase 5B barrel.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { ContentObservation } from "../reader/types.js";
import type { RepositoryEntry } from "../inventory/types.js";
import type { ManifestEvidence } from "../metadata/types.js";
import type { ReferenceCatalog } from "./catalog.js";
import { requireLiveCatalog } from "./catalog.js";
import { catalogFailure, type ReasoningCatalogFailure } from "./failures.js";
import {
  lookupBoundReasoning,
  type BoundReasoningRegistration,
  type ReferenceCatalogInternal,
} from "./internal/registry.js";
import type { ReferenceBoundReasoning } from "./types.js";

export type BoundReasoningAssociation = {
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

/**
 * Authenticate ReferenceBoundReasoning against its live original catalog.
 * Does not re-verify filesystem currentness (use applicability for that).
 */
export function resolveRegisteredBoundReasoningAssociation(
  reasoning: ReferenceBoundReasoning,
  liveCatalog: ReferenceCatalog,
): Result<BoundReasoningAssociation, ReasoningCatalogFailure> {
  const registration: BoundReasoningRegistration | undefined =
    lookupBoundReasoning(reasoning);
  if (registration === undefined || registration.reasoning !== reasoning) {
    return failure(
      catalogFailure(
        "RESULT_NOT_REGISTERED",
        "ReferenceBoundReasoning is not registered or was reconstructed/copied",
      ),
    );
  }
  const catalogResult = requireLiveCatalog(liveCatalog);
  if (!catalogResult.ok) {
    return catalogResult;
  }
  if (catalogResult.value !== registration.catalog) {
    return failure(
      catalogFailure(
        "CATALOG_MISMATCH",
        "Live catalog is not the original registered catalog for this reasoning",
      ),
    );
  }
  return success({
    reasoning: registration.reasoning,
    catalog: registration.catalog,
    retainedClaimSources: registration.retainedClaimSources,
  });
}
