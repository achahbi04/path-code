/**
 * Repository snapshot construction — in-memory assembly only.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { GitStateBaseline } from "../git/types.js";
import type { RepositoryEntry, RepositoryInventory } from "../inventory/types.js";
import type { ManifestEvidence, RepositoryMap } from "../metadata/types.js";
import type { ContentObservation } from "../reader/types.js";
import { buildRepositorySearchCorpus } from "../search/corpus.js";
import type { RepositorySearchCorpus } from "../search/types.js";
import { snapshotFailure, type SnapshotFailure } from "./failure.js";
import type {
  RepositorySnapshot,
  RepositorySnapshotData,
  SnapshotBuildInput,
  SnapshotGeneration,
} from "./types.js";

const generationCounter = { value: 0 };

function brandRepositorySnapshot(data: RepositorySnapshotData): RepositorySnapshot {
  return data as RepositorySnapshot;
}

function createGeneration(): SnapshotGeneration {
  generationCounter.value += 1;
  return Object.assign(Object.create(null), {
    serial: generationCounter.value,
  }) as SnapshotGeneration;
}

function collectAdmittedEntries(inventory: RepositoryInventory): RepositoryEntry[] {
  const entries: RepositoryEntry[] = [];
  for (const observation of inventory.observations) {
    if (observation.disposition === "ADMITTED") {
      entries.push(observation.entry);
    }
  }
  return entries;
}

function validateMapCompatibility(
  inventory: RepositoryInventory,
  map: RepositoryMap,
): Result<void, SnapshotFailure> {
  if (map.inventoryTraversalCompletion !== inventory.traversalCompletion) {
    return failure(
      snapshotFailure(
        "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
        "Repository map was not built from the supplied inventory",
      ),
    );
  }

  const admitted = collectAdmittedEntries(inventory);
  const admittedSet = new Set(admitted);
  if (map.entries.length !== admitted.length) {
    return failure(
      snapshotFailure(
        "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
        "Repository map entry count does not match admitted inventory entries",
      ),
    );
  }

  for (const mapEntry of map.entries) {
    if (!admittedSet.has(mapEntry.entry)) {
      return failure(
        snapshotFailure(
          "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
          "Repository map entry is not reference-identical to an admitted inventory entry",
        ),
      );
    }
  }

  return success(undefined);
}

function validateGitCompatibility(
  inventory: RepositoryInventory,
  baseline: GitStateBaseline,
): Result<void, SnapshotFailure> {
  if (baseline.inventoryTraversalCompletion !== inventory.traversalCompletion) {
    return failure(
      snapshotFailure(
        "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
        "Git baseline was not collected from the supplied inventory",
      ),
    );
  }

  const admitted = new Set(collectAdmittedEntries(inventory));
  for (const annotation of baseline.annotations) {
    if (!admitted.has(annotation.entry)) {
      return failure(
        snapshotFailure(
          "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
          "Git baseline annotation references an entry outside the supplied inventory",
        ),
      );
    }
  }

  return success(undefined);
}

function validateCorpusCompatibility(
  inventory: RepositoryInventory,
  map: RepositoryMap,
  corpus: RepositorySearchCorpus,
): Result<void, SnapshotFailure> {
  const corpusResult = buildRepositorySearchCorpus(inventory, map);
  if (!corpusResult.ok) {
    return failure(
      snapshotFailure(
        "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
        "Search corpus is not compatible with the supplied inventory and map",
      ),
    );
  }
  const expected = corpusResult.value;
  if (
    corpus.inventoryTraversalCompletion !== expected.inventoryTraversalCompletion ||
    corpus.metadataCompletion !== expected.metadataCompletion ||
    corpus.boundaries !== expected.boundaries ||
    corpus.admittedEntries.length !== expected.admittedEntries.length
  ) {
    return failure(
      snapshotFailure(
        "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
        "Search corpus was not built from the supplied inventory and map",
      ),
    );
  }

  for (let index = 0; index < expected.admittedEntries.length; index += 1) {
    if (corpus.admittedEntries[index] !== expected.admittedEntries[index]) {
      return failure(
        snapshotFailure(
          "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
          "Search corpus admitted entries are not reference-identical to the inventory",
        ),
      );
    }
  }

  if (corpus.mapEntriesByEntry.size !== expected.mapEntriesByEntry.size) {
    return failure(
      snapshotFailure(
        "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
        "Search corpus map entry bindings do not match the repository map",
      ),
    );
  }

  for (const [entry, mapEntry] of expected.mapEntriesByEntry) {
    if (corpus.mapEntriesByEntry.get(entry) !== mapEntry) {
      return failure(
        snapshotFailure(
          "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
          "Search corpus map entry bindings do not match the repository map",
        ),
      );
    }
  }

  return success(undefined);
}

function validateContentObservations(
  inventory: RepositoryInventory,
  observations: readonly ContentObservation[],
): Result<ReadonlyMap<RepositoryEntry, ContentObservation>, SnapshotFailure> {
  const admitted = new Set(collectAdmittedEntries(inventory));
  const byEntry = new Map<RepositoryEntry, ContentObservation>();

  for (const observation of observations) {
    if (!admitted.has(observation.entry)) {
      return failure(
        snapshotFailure(
          "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
          "ContentObservation references an entry outside the supplied inventory",
        ),
      );
    }
    if (byEntry.has(observation.entry)) {
      return failure(
        snapshotFailure(
          "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
          "Duplicate baseline ContentObservation for the same RepositoryEntry",
        ),
      );
    }
    byEntry.set(observation.entry, observation);
  }

  return success(byEntry);
}

function validateManifestEvidenceClosure(
  map: RepositoryMap | undefined,
  byEntry: ReadonlyMap<RepositoryEntry, ContentObservation>,
): Result<void, SnapshotFailure> {
  if (map === undefined) {
    return success(undefined);
  }

  for (const scope of map.scopes) {
    for (const claim of scope.identityClaims) {
      if (claim.confidence !== "OBSERVED") {
        continue;
      }
      const evidence: ManifestEvidence = claim.evidence;
      if (!byEntry.has(evidence.observation.entry)) {
        if (evidence.observation.entry !== evidence.entry) {
          return failure(
            snapshotFailure(
              "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
              "ManifestEvidence ContentObservation is not bound in the snapshot",
            ),
          );
        }
        if (!byEntry.has(evidence.entry)) {
          return failure(
            snapshotFailure(
              "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
              "ManifestEvidence ContentObservation is not bound in the snapshot",
            ),
          );
        }
        const bound = byEntry.get(evidence.entry);
        if (bound !== evidence.observation) {
          return failure(
            snapshotFailure(
              "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
              "ManifestEvidence ContentObservation is not bound in the snapshot",
            ),
          );
        }
      } else {
        const bound = byEntry.get(evidence.observation.entry);
        if (bound !== evidence.observation) {
          return failure(
            snapshotFailure(
              "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
              "ManifestEvidence ContentObservation is not bound in the snapshot",
            ),
          );
        }
      }
    }
  }

  for (const observation of map.manifestObservations) {
    if (!("observation" in observation)) {
      continue;
    }
    const bound = byEntry.get(observation.entry);
    if (bound !== undefined && bound !== observation.observation) {
      return failure(
        snapshotFailure(
          "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
          "Manifest observation ContentObservation conflicts with snapshot binding",
        ),
      );
    }
  }

  return success(undefined);
}

function validateEntryStatIdentities(
  inventory: RepositoryInventory,
  identities: ReadonlyMap<RepositoryEntry, { readonly dev: number; readonly ino: number }>,
): Result<void, SnapshotFailure> {
  const admitted = new Set(collectAdmittedEntries(inventory));
  for (const [entry] of identities) {
    if (!admitted.has(entry)) {
      return failure(
        snapshotFailure(
          "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
          "Entry stat identity references an entry outside the supplied inventory",
        ),
      );
    }
  }
  return success(undefined);
}

/**
 * Bind compatible earned artifacts into one in-memory knowledge generation.
 *
 * Performs no traversal, stat, read, Git execution, or persistence.
 */
export function buildRepositorySnapshot(
  input: SnapshotBuildInput,
): Result<RepositorySnapshot, SnapshotFailure> {
  const {
    workspace,
    config,
    inventory,
    gitBaseline,
    repositoryMap,
    searchCorpus,
    contentObservations = [],
    entryStatIdentities = new Map(),
  } = input;

  if (repositoryMap !== undefined) {
    const mapOk = validateMapCompatibility(inventory, repositoryMap);
    if (!mapOk.ok) {
      return mapOk;
    }
  }

  if (gitBaseline !== undefined) {
    const gitOk = validateGitCompatibility(inventory, gitBaseline);
    if (!gitOk.ok) {
      return gitOk;
    }
    if (
      repositoryMap !== undefined &&
      gitBaseline.inventoryTraversalCompletion !==
        repositoryMap.inventoryTraversalCompletion
    ) {
      return failure(
        snapshotFailure(
          "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
          "Git baseline, map, and inventory traversal completion disagree",
        ),
      );
    }
  }

  if (searchCorpus !== undefined) {
    if (repositoryMap === undefined) {
      return failure(
        snapshotFailure(
          "SNAPSHOT_ARTIFACTS_INCOMPATIBLE",
          "Search corpus requires a compatible repository map",
        ),
      );
    }
    const corpusOk = validateCorpusCompatibility(
      inventory,
      repositoryMap,
      searchCorpus,
    );
    if (!corpusOk.ok) {
      return corpusOk;
    }
  }

  const observationsResult = validateContentObservations(
    inventory,
    contentObservations,
  );
  if (!observationsResult.ok) {
    return observationsResult;
  }

  const evidenceOk = validateManifestEvidenceClosure(
    repositoryMap,
    observationsResult.value,
  );
  if (!evidenceOk.ok) {
    return evidenceOk;
  }

  const identityOk = validateEntryStatIdentities(inventory, entryStatIdentities);
  if (!identityOk.ok) {
    return identityOk;
  }

  return success(
    brandRepositorySnapshot({
      generation: createGeneration(),
      assembledAt: Date.now(),
      workspace,
      config,
      inventory,
      contentObservations,
      contentObservationByEntry: observationsResult.value,
      entryStatIdentities,
      inventoryTraversalCompletion: inventory.traversalCompletion,
      ...(gitBaseline === undefined ? {} : { gitBaseline }),
      ...(repositoryMap === undefined
        ? {}
        : {
            repositoryMap,
            metadataCompletion: repositoryMap.metadataCompletion,
          }),
      ...(searchCorpus === undefined ? {} : { searchCorpus }),
    }),
  );
}
