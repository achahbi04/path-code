/**
 * Fixed-chain derived-knowledge propagation.
 */

import type { ProjectIdentityClaim } from "../metadata/types.js";
import type { ContentObservation } from "../reader/types.js";
import type {
  ContentVerificationResult,
  DerivedKnowledgeVerificationResult,
  DerivedVerificationState,
  RepositorySnapshot,
} from "./types.js";

function brandDerived(
  data: Omit<DerivedKnowledgeVerificationResult, "__derivedKnowledgeVerificationBrand">,
): DerivedKnowledgeVerificationResult {
  return data as DerivedKnowledgeVerificationResult;
}

function contentStateForObservation(
  observation: ContentObservation,
  contentResults: ReadonlyMap<ContentObservation, ContentVerificationResult>,
): ContentVerificationResult["state"] | "NOT_VERIFIED" {
  const result = contentResults.get(observation);
  return result?.state ?? "NOT_VERIFIED";
}

function derivedFromContentState(
  state: ContentVerificationResult["state"] | "NOT_VERIFIED",
): DerivedVerificationState {
  switch (state) {
    case "VERIFIED_CURRENT":
      return "SUPPORTED";
    case "STALE_CONTENT":
      return "UNSUPPORTED_STALE_EVIDENCE";
    case "REVALIDATION_REQUIRED":
    case "UNVERIFIABLE":
      return "UNVERIFIED";
    case "NOT_VERIFIED":
    case "DENIED":
    case "UNREADABLE":
      return "NOT_VERIFIED";
  }
}

export function propagateDerivedKnowledge(
  snapshot: RepositorySnapshot,
  contentResultsByEntry: ReadonlyMap<
    import("../inventory/types.js").RepositoryEntry,
    ContentVerificationResult
  >,
): DerivedKnowledgeVerificationResult[] {
  const contentResultsByObservation = new Map<
    ContentObservation,
    ContentVerificationResult
  >();
  for (const [entry, result] of contentResultsByEntry) {
    const baseline = snapshot.contentObservationByEntry.get(entry);
    if (baseline !== undefined) {
      contentResultsByObservation.set(baseline, result);
    }
  }

  const derived: DerivedKnowledgeVerificationResult[] = [];
  const map = snapshot.repositoryMap;
  if (map === undefined) {
    return derived;
  }

  let mapState: DerivedVerificationState = "SUPPORTED";
  const staleClaims: ProjectIdentityClaim[] = [];

  for (const scope of map.scopes) {
    for (const claim of scope.identityClaims) {
      if (claim.confidence !== "OBSERVED") {
        continue;
      }
      const contentState = contentStateForObservation(
        claim.evidence.observation,
        contentResultsByObservation,
      );
      const state = derivedFromContentState(contentState);
      derived.push(
        brandDerived({
          kind: "MANIFEST_EVIDENCE",
          state,
          relativePath: claim.evidence.entry.relativePath,
        }),
      );
      derived.push(
        brandDerived({
          kind: "OBSERVED_IDENTITY_CLAIM",
          state,
          scopeRelativePath: claim.scopeRelativePath,
          claim,
        }),
      );
      if (state === "UNSUPPORTED_STALE_EVIDENCE") {
        staleClaims.push(claim);
        mapState = "LIMITED";
      } else if (state === "UNVERIFIED" && mapState === "SUPPORTED") {
        mapState = "UNVERIFIED";
      } else if (state === "NOT_VERIFIED" && mapState === "SUPPORTED") {
        mapState = "NOT_VERIFIED";
      }
    }
  }

  derived.push(
    brandDerived({
      kind: "REPOSITORY_MAP",
      state: mapState,
    }),
  );

  if (snapshot.searchCorpus !== undefined) {
    const corpusState: DerivedVerificationState =
      mapState === "LIMITED"
        ? "SOURCE_STALE"
        : mapState === "UNVERIFIED"
          ? "UNVERIFIED"
          : mapState === "NOT_VERIFIED"
            ? "NOT_VERIFIED"
            : "SUPPORTED";
    derived.push(
      brandDerived({
        kind: "SEARCH_CORPUS",
        state: corpusState,
      }),
    );
    derived.push(
      brandDerived({
        kind: "SEARCH_RESULT",
        state: corpusState,
      }),
    );
  }

  void staleClaims;
  return derived;
}
