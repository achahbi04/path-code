/**
 * Manifest observation through the Phase 2B reader only.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { RepositoryEntry, RepositoryInventory } from "../inventory/types.js";
import { readRepositoryContent } from "../reader/index.js";
import { extractPackageJsonClaims, inferEcosystemFromManifest } from "./identity.js";
import {
  lookupManifestRegistry,
  manifestBasename,
  type ManifestKind,
} from "./manifests.js";
import { parseJsonManifestText } from "./parse.js";
import { compareLexicalPaths, scopeFromManifestPath } from "./path-utils.js";
import type {
  EffectiveMetadataLimits,
  ManifestObservation,
  MetadataPartialReason,
  ProjectIdentityClaim,
} from "./types.js";

export type ManifestCandidate = {
  readonly relativePath: string;
  readonly entry: RepositoryEntry;
  readonly manifestKind: ManifestKind;
};

export function collectManifestCandidates(
  inventory: RepositoryInventory,
): ManifestCandidate[] {
  const candidates: ManifestCandidate[] = [];
  for (const observation of inventory.observations) {
    if (observation.disposition !== "ADMITTED") {
      continue;
    }
    const registry = lookupManifestRegistry(manifestBasename(observation.relativePath));
    if (registry === undefined) {
      continue;
    }
    candidates.push({
      relativePath: observation.relativePath,
      entry: observation.entry,
      manifestKind: registry.basename,
    });
  }
  candidates.sort((a, b) => compareLexicalPaths(a.relativePath, b.relativePath));
  return candidates;
}

export type ManifestObservationResult = {
  readonly observations: readonly ManifestObservation[];
  readonly claims: readonly ProjectIdentityClaim[];
  readonly partialReasons: readonly MetadataPartialReason[];
  readonly attemptedCount: number;
  readonly truncated: boolean;
};

export async function observeManifests(
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
  candidates: readonly ManifestCandidate[],
  limits: EffectiveMetadataLimits,
): Promise<ManifestObservationResult> {
  const observations: ManifestObservation[] = [];
  const claims: ProjectIdentityClaim[] = [];
  const partialReasons: MetadataPartialReason[] = [];
  let truncated = false;

  const attemptLimit = Math.min(candidates.length, limits.maxManifests);

  for (let index = 0; index < candidates.length; index += 1) {
    if (index >= attemptLimit) {
      truncated = true;
      break;
    }

    const candidate = candidates[index];
    if (candidate === undefined) {
      continue;
    }

    const read = await readRepositoryContent(candidate.entry, workspace, config, {
      maxBytes: limits.maxManifestBytes,
    });

    if (!read.ok) {
      partialReasons.push({
        kind: "MANIFEST_UNREADABLE",
        relativePath: candidate.relativePath,
      });
      continue;
    }

    const outcome = read.value;
    const registry = lookupManifestRegistry(candidate.manifestKind);
    if (registry === undefined) {
      continue;
    }

    switch (outcome.status) {
      case "DENIED":
        break;
      case "TOO_LARGE":
        observations.push({
          kind: "READ_TOO_LARGE",
          relativePath: candidate.relativePath,
          manifestKind: candidate.manifestKind,
          entry: candidate.entry,
          byteLengthObserved: outcome.byteLengthObserved,
          maxBytes: outcome.maxBytes,
        });
        partialReasons.push({
          kind: "MANIFEST_TOO_LARGE",
          relativePath: candidate.relativePath,
        });
        break;
      case "STALE_ENTRY":
        observations.push({
          kind: "READ_STALE",
          relativePath: candidate.relativePath,
          manifestKind: candidate.manifestKind,
          entry: candidate.entry,
        });
        partialReasons.push({
          kind: "MANIFEST_STALE",
          relativePath: candidate.relativePath,
        });
        break;
      case "NOT_REGULAR_FILE":
        observations.push({
          kind: "READ_NOT_REGULAR_FILE",
          relativePath: candidate.relativePath,
          manifestKind: candidate.manifestKind,
          entry: candidate.entry,
          physicalKind: outcome.physicalKind,
        });
        partialReasons.push({
          kind: "MANIFEST_NOT_REGULAR_FILE",
          relativePath: candidate.relativePath,
        });
        break;
      case "UNREADABLE":
        observations.push({
          kind: "READ_UNREADABLE",
          relativePath: candidate.relativePath,
          manifestKind: candidate.manifestKind,
          entry: candidate.entry,
        });
        partialReasons.push({
          kind: "MANIFEST_UNREADABLE",
          relativePath: candidate.relativePath,
        });
        break;
      case "READ": {
        if (outcome.observation.kind === "BINARY") {
          observations.push({
            kind: "READ_BINARY",
            relativePath: candidate.relativePath,
            manifestKind: candidate.manifestKind,
            entry: candidate.entry,
          });
          partialReasons.push({
            kind: "MANIFEST_BINARY",
            relativePath: candidate.relativePath,
          });
          break;
        }

        const scope = scopeFromManifestPath(candidate.relativePath);

        if (registry.format === "UNPARSED_TEXT") {
          observations.push({
            kind: "UNPARSED_BY_DESIGN",
            relativePath: candidate.relativePath,
            manifestKind: candidate.manifestKind,
            entry: candidate.entry,
            observation: outcome.observation,
          });
          claims.push(
            inferEcosystemFromManifest(candidate.manifestKind, candidate.relativePath),
          );
          break;
        }

        const parsed = parseJsonManifestText(outcome.observation.text);
        if (!parsed.ok) {
          if (parsed.error.kind === "PARSE_FAILED") {
            observations.push({
              kind: "PARSE_FAILED",
              relativePath: candidate.relativePath,
              manifestKind: candidate.manifestKind,
              entry: candidate.entry,
              observation: outcome.observation,
            });
            partialReasons.push({
              kind: "MANIFEST_PARSE_FAILED",
              relativePath: candidate.relativePath,
            });
          } else {
            observations.push({
              kind: "SCHEMA_UNSUPPORTED",
              relativePath: candidate.relativePath,
              manifestKind: candidate.manifestKind,
              entry: candidate.entry,
              observation: outcome.observation,
              detail: parsed.error.detail,
            });
            partialReasons.push({
              kind: "MANIFEST_SCHEMA_UNSUPPORTED",
              relativePath: candidate.relativePath,
            });
          }
          break;
        }

        observations.push({
          kind: "PARSED_JSON",
          relativePath: candidate.relativePath,
          manifestKind: candidate.manifestKind,
          entry: candidate.entry,
          observation: outcome.observation,
        });

        claims.push(
          inferEcosystemFromManifest(candidate.manifestKind, candidate.relativePath),
        );

        if (candidate.manifestKind === "package.json") {
          const extraction = extractPackageJsonClaims(
            parsed.value as Record<string, unknown>,
            scope,
            outcome.observation,
            candidate.entry,
          );
          claims.push(...extraction.claims);
          if (extraction.shapeUnsupported) {
            partialReasons.push({
              kind: "MANIFEST_DECLARATION_SHAPE_UNSUPPORTED",
              relativePath: candidate.relativePath,
            });
          }
        }
        break;
      }
    }
  }

  if (truncated) {
    partialReasons.push({ kind: "MANIFEST_LIMIT_REACHED" });
  }

  return {
    observations,
    claims,
    partialReasons,
    attemptedCount: attemptLimit,
    truncated,
  };
}
