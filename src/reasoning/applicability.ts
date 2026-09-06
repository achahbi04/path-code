/**
 * Fresh applicability observation for a previously issued ReferenceBoundReasoning.
 * Does not mutate, rebind, reissue, or upgrade the historical result.
 */

import { loadProjectConfig } from "../config/loader.js";
import type { ProjectRestrictions } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { verifyRepositorySnapshot } from "../snapshot/index.js";
import {
  verifyContentObservationsCurrent,
} from "./bind.js";
import type { ReferenceCatalog } from "./catalog.js";
import { requireLiveCatalog } from "./catalog.js";
import {
  catalogFailure,
  claimRefusal,
  type ReasoningApplicabilityFailure,
} from "./failures.js";
import { lookupBoundReasoning } from "./internal/registry.js";
import type { ReferenceBoundReasoning } from "./types.js";

function restrictionsEqual(
  left: ProjectRestrictions,
  right: ProjectRestrictions,
): boolean {
  if (left.deniedPaths.length !== right.deniedPaths.length) {
    return false;
  }
  for (let i = 0; i < left.deniedPaths.length; i += 1) {
    if (left.deniedPaths[i] !== right.deniedPaths[i]) {
      return false;
    }
  }
  if (left.disabledActions.length !== right.disabledActions.length) {
    return false;
  }
  for (let i = 0; i < left.disabledActions.length; i += 1) {
    if (left.disabledActions[i] !== right.disabledActions[i]) {
      return false;
    }
  }
  return true;
}

export type ReferenceBoundApplicabilitySuccess = {
  readonly applicable: true;
  readonly reasoning: ReferenceBoundReasoning;
  readonly assessedAt: number;
};

/**
 * Authenticate an issued result and re-run resolution/currentness against retained sources.
 */
export async function checkReferenceBoundReasoningApplicability(
  reasoning: ReferenceBoundReasoning,
  liveCatalog: ReferenceCatalog,
): Promise<
  Result<ReferenceBoundApplicabilitySuccess, ReasoningApplicabilityFailure>
> {
  const registration = lookupBoundReasoning(reasoning);
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
  const catalog = catalogResult.value;
  if (catalog !== registration.catalog) {
    return failure(
      catalogFailure(
        "CATALOG_MISMATCH",
        "Applicability catalog is not the original registered catalog",
      ),
    );
  }

  const configResult = await loadProjectConfig(catalog.workspace);
  if (!configResult.ok) {
    return failure(
      catalogFailure("CONFIG_FAILURE", "Project configuration could not be loaded"),
    );
  }
  if (
    !restrictionsEqual(
      configResult.value.restrictions,
      catalog.snapshot.config.restrictions,
    )
  ) {
    return failure(
      catalogFailure(
        "RESTRICTIONS_CHANGED",
        "Effective restrictions changed relative to the catalog snapshot",
      ),
    );
  }

  for (const claim of reasoning.claims) {
    const sources = registration.retainedClaimSources.get(claim.claimId);
    if (sources === undefined) {
      return failure(
        claimRefusal(
          "UNBOUND_CLAIM",
          claim.claimId,
          "Retained claim sources are missing",
        ),
      );
    }

    if (claim.kind === "EXISTS") {
      const assessment = await verifyRepositorySnapshot(
        catalog.snapshot,
        catalog.workspace,
        configResult.value,
        {
          entries: sources.entries,
          content: "NONE",
        },
      );
      if (!assessment.ok) {
        return failure(
          claimRefusal(
            "STALE_EVIDENCE",
            claim.claimId,
            "Entry verification could not complete",
          ),
        );
      }
      for (const entry of sources.entries) {
        const result = assessment.value.entryResults.find(
          (item) => item.entry === entry,
        );
        if (result === undefined) {
          return failure(
            claimRefusal(
              "STALE_EVIDENCE",
              claim.claimId,
              "Cited entry missing from verification assessment",
            ),
          );
        }
        if (result.state === "DENIED") {
          return failure(
            claimRefusal(
              "CLAIM_OUTSIDE_ADMITTED_SET",
              claim.claimId,
              "Cited entry is denied by current restrictions",
            ),
          );
        }
        if (result.state !== "CURRENT_IDENTITY") {
          return failure(
            claimRefusal(
              "STALE_EVIDENCE",
              claim.claimId,
              "Cited entry is not positively current",
            ),
          );
        }
      }
      continue;
    }

    const observations =
      sources.observations.length > 0
        ? sources.observations
        : sources.manifests.map((m) => m.observation);
    const stale = await verifyContentObservationsCurrent(
      catalog,
      observations,
      claim.claimId,
      configResult.value,
    );
    if (stale !== undefined) {
      return failure(stale);
    }
  }

  return success({
    applicable: true,
    reasoning,
    assessedAt: Date.now(),
  });
}
