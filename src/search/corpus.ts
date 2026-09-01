/**
 * Repository search corpus construction — pure in-memory derivation.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { RepositoryInventory } from "../inventory/types.js";
import type { RepositoryEntry } from "../inventory/types.js";
import type { RepositoryMap } from "../metadata/types.js";
import { searchFailure, type SearchFailure } from "./failure.js";
import type {
  RepositorySearchCorpus,
  RepositorySearchCorpusData,
} from "./types.js";

function brandRepositorySearchCorpus(
  data: RepositorySearchCorpusData,
): RepositorySearchCorpus {
  return data as RepositorySearchCorpus;
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
  return entries;
}

function validateCorpusCompatibility(
  inventory: RepositoryInventory,
  map: RepositoryMap,
): Result<void, SearchFailure> {
  if (
    map.inventoryTraversalCompletion !== inventory.traversalCompletion
  ) {
    return failure(
      searchFailure(
        "SEARCH_SOURCE_INCOMPATIBLE",
        "Repository map was not built from the supplied inventory",
      ),
    );
  }

  const admittedEntries = collectAdmittedEntries(inventory);
  const admittedSet = new Set<RepositoryEntry>(admittedEntries);

  if (map.entries.length !== admittedEntries.length) {
    return failure(
      searchFailure(
        "SEARCH_SOURCE_INCOMPATIBLE",
        "Repository map entry count does not match admitted inventory entries",
      ),
    );
  }

  for (const mapEntry of map.entries) {
    if (!admittedSet.has(mapEntry.entry)) {
      return failure(
        searchFailure(
          "SEARCH_SOURCE_INCOMPATIBLE",
          "Repository map entry is not reference-identical to an admitted inventory entry",
        ),
      );
    }
    if (mapEntry.relativePath !== mapEntry.entry.relativePath) {
      return failure(
        searchFailure(
          "SEARCH_SOURCE_INCOMPATIBLE",
          "Repository map lexical path does not match its RepositoryEntry",
        ),
      );
    }
  }

  const mapEntryRefs = new Set(map.entries.map((item) => item.entry));
  for (const entry of admittedEntries) {
    if (!mapEntryRefs.has(entry)) {
      return failure(
        searchFailure(
          "SEARCH_SOURCE_INCOMPATIBLE",
          "Admitted inventory entry is missing from the repository map",
        ),
      );
    }
  }

  return success(undefined);
}

/**
 * Build an earned search corpus from compatible inventory and map artifacts.
 */
export function buildRepositorySearchCorpus(
  inventory: RepositoryInventory,
  map: RepositoryMap,
): Result<RepositorySearchCorpus, SearchFailure> {
  const compatible = validateCorpusCompatibility(inventory, map);
  if (!compatible.ok) {
    return compatible;
  }

  const admittedEntries = collectAdmittedEntries(inventory);
  admittedEntries.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );

  const mapEntriesByEntry = new Map(
    map.entries.map((mapEntry) => [mapEntry.entry, mapEntry] as const),
  );

  return success(
    brandRepositorySearchCorpus({
      inventoryTraversalCompletion: inventory.traversalCompletion,
      metadataCompletion: map.metadataCompletion,
      boundaries: map.boundaries,
      admittedEntries,
      mapEntriesByEntry,
    }),
  );
}
