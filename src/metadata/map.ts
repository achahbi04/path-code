/**
 * Repository map construction — derivation only, no traversal or direct reads.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { GitStateBaseline } from "../git/types.js";
import type { InventoryObservation } from "../inventory/disposition.js";
import type { RepositoryEntry, RepositoryInventory } from "../inventory/types.js";
import {
  MAX_MANIFEST_CONTENT_BYTES,
  MAX_MANIFESTS_PER_METADATA_OPERATION,
} from "./constants.js";
import { metadataFailure, type MetadataFailure } from "./failure.js";
import {
  hasClaimForDimension,
  IDENTITY_DIMENSIONS,
  inferLanguageFromExtension,
  unknownClaim,
} from "./identity.js";
import { collectManifestCandidates, observeManifests } from "./observe.js";
import { parentDirectory } from "./path-utils.js";
import type {
  EffectiveMetadataLimits,
  MetadataCompletion,
  MetadataOptions,
  MetadataPartialReason,
  ProjectIdentityClaim,
  RepositoryMap,
  RepositoryMapBoundary,
  RepositoryMapData,
  RepositoryMapDirectory,
  RepositoryMapEntry,
  RepositoryMapScope,
} from "./types.js";

function brandRepositoryMap(data: RepositoryMapData): RepositoryMap {
  return data as RepositoryMap;
}

export function validateMetadataOptions(
  options: MetadataOptions | undefined,
): Result<EffectiveMetadataLimits, MetadataFailure> {
  const requestedManifests =
    options?.maxManifests ?? MAX_MANIFESTS_PER_METADATA_OPERATION;
  const requestedBytes =
    options?.maxManifestBytes ?? MAX_MANIFEST_CONTENT_BYTES;

  if (
    !Number.isFinite(requestedManifests) ||
    !Number.isInteger(requestedManifests) ||
    requestedManifests <= 0
  ) {
    return failure(
      metadataFailure(
        "INVALID_METADATA_OPTIONS",
        "maxManifests must be a finite positive integer",
      ),
    );
  }

  if (requestedManifests > MAX_MANIFESTS_PER_METADATA_OPERATION) {
    return failure(
      metadataFailure(
        "INVALID_METADATA_OPTIONS",
        "maxManifests cannot exceed the hard production ceiling",
        { hardCeiling: MAX_MANIFESTS_PER_METADATA_OPERATION },
      ),
    );
  }

  if (
    !Number.isFinite(requestedBytes) ||
    !Number.isInteger(requestedBytes) ||
    requestedBytes <= 0
  ) {
    return failure(
      metadataFailure(
        "INVALID_METADATA_OPTIONS",
        "maxManifestBytes must be a finite positive integer",
      ),
    );
  }

  if (requestedBytes > MAX_MANIFEST_CONTENT_BYTES) {
    return failure(
      metadataFailure(
        "INVALID_METADATA_OPTIONS",
        "maxManifestBytes cannot exceed the hard production ceiling",
        { hardCeiling: MAX_MANIFEST_CONTENT_BYTES },
      ),
    );
  }

  return success({
    maxManifests: requestedManifests,
    maxManifestBytes: requestedBytes,
  });
}

function validateGitBaseline(
  inventory: RepositoryInventory,
  baseline: GitStateBaseline,
): Result<void, MetadataFailure> {
  if (
    baseline.inventoryTraversalCompletion !== inventory.traversalCompletion
  ) {
    return failure(
      metadataFailure(
        "GIT_BASELINE_INCOMPATIBLE",
        "Git baseline was not collected from the supplied inventory",
      ),
    );
  }

  const admittedEntries = new Set<RepositoryEntry>();
  for (const observation of inventory.observations) {
    if (
      observation.disposition === "ADMITTED" ||
      observation.disposition === "DESCENDED" ||
      observation.disposition === "DEPTH_LIMIT_REACHED"
    ) {
      if ("entry" in observation) {
        admittedEntries.add(observation.entry);
      }
    }
  }

  for (const annotation of baseline.annotations) {
    if (!admittedEntries.has(annotation.entry)) {
      return failure(
        metadataFailure(
          "GIT_BASELINE_INCOMPATIBLE",
          "Git baseline annotation references an entry outside the supplied inventory",
        ),
      );
    }
  }

  return success(undefined);
}

function buildMetadataCompletion(
  partialReasons: readonly MetadataPartialReason[],
): MetadataCompletion {
  if (partialReasons.length === 0) {
    return { kind: "COMPLETE" };
  }
  const [first, ...rest] = partialReasons;
  if (first === undefined) {
    return { kind: "COMPLETE" };
  }
  return {
    kind: "PARTIAL",
    reasons: [first, ...rest],
  };
}

function collectBoundaries(
  observations: readonly InventoryObservation[],
): RepositoryMapBoundary[] {
  const boundaries: RepositoryMapBoundary[] = [];
  for (const observation of observations) {
    if (observation.disposition === "DENIED_BY_PROJECT_RESTRICTION") {
      boundaries.push({ kind: "DENIED", relativePath: observation.relativePath });
    } else if (observation.disposition === "SYSTEM_PRUNED") {
      boundaries.push({
        kind: "SYSTEM_PRUNED",
        relativePath: observation.relativePath,
        reason: observation.reason,
      });
    }
  }
  boundaries.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  return boundaries;
}

function collectAdmittedEntries(
  inventory: RepositoryInventory,
): RepositoryEntry[] {
  const entries: RepositoryEntry[] = [];
  for (const observation of inventory.observations) {
    if (observation.disposition === "ADMITTED") {
      entries.push(observation.entry);
    }
  }
  entries.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  return entries;
}

function buildDirectoryCounts(
  entries: readonly RepositoryEntry[],
): RepositoryMapDirectory[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const dir = parentDirectory(entry.relativePath);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }

  const directories: RepositoryMapDirectory[] = [];
  for (const [relativePath, admittedEntryCount] of counts) {
    directories.push({ relativePath, admittedEntryCount });
  }
  directories.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  return directories;
}

function groupClaimsByScope(
  claims: readonly ProjectIdentityClaim[],
  manifestPaths: readonly string[],
): RepositoryMapScope[] {
  const scopeMap = new Map<string, ProjectIdentityClaim[]>();
  const manifestMap = new Map<string, string[]>();

  for (const claim of claims) {
    const existing = scopeMap.get(claim.scopeRelativePath) ?? [];
    existing.push(claim);
    scopeMap.set(claim.scopeRelativePath, existing);
  }

  for (const manifestPath of manifestPaths) {
    const scope = parentDirectory(manifestPath);
    const existing = manifestMap.get(scope) ?? [];
    existing.push(manifestPath);
    manifestMap.set(scope, existing);
  }

  const scopePaths = new Set<string>([
    ...scopeMap.keys(),
    ...manifestMap.keys(),
    "",
  ]);

  const scopes: RepositoryMapScope[] = [];
  for (const scopeRelativePath of [...scopePaths].sort()) {
    const scopeClaims = [...(scopeMap.get(scopeRelativePath) ?? [])];
    for (const dimension of IDENTITY_DIMENSIONS) {
      if (!hasClaimForDimension(scopeClaims, dimension)) {
        scopeClaims.push(unknownClaim(scopeRelativePath, dimension));
      }
    }
    scopeClaims.sort((a, b) => {
      const keyA = `${a.confidence}:${JSON.stringify(a)}`;
      const keyB = `${b.confidence}:${JSON.stringify(b)}`;
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    });
    scopes.push({
      scopeRelativePath,
      identityClaims: scopeClaims,
      manifestRelativePaths: [...(manifestMap.get(scopeRelativePath) ?? [])].sort(),
    });
  }

  return scopes;
}

/**
 * Build an evidence-backed repository map from earned inventory and metadata.
 */
export async function buildRepositoryMap(
  workspace: WorkspaceBoundary,
  inventory: RepositoryInventory,
  config: ResolvedProjectConfig,
  options?: MetadataOptions,
): Promise<Result<RepositoryMap, MetadataFailure>> {
  const limitsResult = validateMetadataOptions(options);
  if (!limitsResult.ok) {
    return limitsResult;
  }

  const gitBaseline = options?.gitBaseline;
  if (gitBaseline !== undefined) {
    const compatible = validateGitBaseline(inventory, gitBaseline);
    if (!compatible.ok) {
      return compatible;
    }
  }

  const candidates = collectManifestCandidates(inventory);
  const manifestResult = await observeManifests(
    workspace,
    config,
    candidates,
    limitsResult.value,
  );

  const extensionClaims: ProjectIdentityClaim[] = [];
  for (const entry of collectAdmittedEntries(inventory)) {
    if (entry.lexicalKind !== "FILE") {
      continue;
    }
    const inferred = inferLanguageFromExtension(entry);
    if (inferred !== undefined) {
      extensionClaims.push(inferred);
    }
  }

  const allClaims = [...manifestResult.claims, ...extensionClaims];

  const manifestPaths = manifestResult.observations
    .filter(
      (observation) =>
        observation.kind === "PARSED_JSON" ||
        observation.kind === "UNPARSED_BY_DESIGN",
    )
    .map((observation) => observation.relativePath);

  const admittedEntries = collectAdmittedEntries(inventory);
  const annotationByEntry = new Map<RepositoryEntry, GitStateBaseline["annotations"][number]>();
  if (gitBaseline !== undefined) {
    for (const annotation of gitBaseline.annotations) {
      annotationByEntry.set(annotation.entry, annotation);
    }
  }

  const mapEntries: RepositoryMapEntry[] = admittedEntries.map((entry) => {
    const gitAnnotation = annotationByEntry.get(entry);
    return gitAnnotation === undefined
      ? { relativePath: entry.relativePath, entry }
      : { relativePath: entry.relativePath, entry, gitAnnotation };
  });

  const scopes =
    allClaims.length > 0 || manifestPaths.length > 0
      ? groupClaimsByScope(allClaims, manifestPaths)
      : groupClaimsByScope([], []);

  const mapData: RepositoryMapData = {
    inventoryTraversalCompletion: inventory.traversalCompletion,
    metadataCompletion: buildMetadataCompletion(manifestResult.partialReasons),
    boundaries: collectBoundaries(inventory.observations),
    directories: buildDirectoryCounts(admittedEntries),
    entries: mapEntries,
    scopes,
    manifestObservations: manifestResult.observations,
    sidecarUnmappedGit: gitBaseline?.unmappedVisibleObservations ?? [],
    ...(gitBaseline === undefined
      ? {}
      : { gitAvailability: gitBaseline.availability }),
  };

  return success(brandRepositoryMap(mapData));
}
