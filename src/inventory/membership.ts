/**
 * Canonical RepositoryEntry membership for a RepositoryInventory.
 *
 * Cross-component reference identity uses the actual earned RepositoryEntry
 * references carried by every entry-bearing InventoryObservation variant.
 */

import type { InventoryObservation } from "./disposition.js";
import type { RepositoryEntry, RepositoryInventory } from "./types.js";

export type EntryBearingInventoryObservation = Extract<
  InventoryObservation,
  { readonly entry: RepositoryEntry }
>;

export function isEntryBearingInventoryObservation(
  observation: InventoryObservation,
): observation is EntryBearingInventoryObservation {
  return "entry" in observation;
}

/**
 * Every actual RepositoryEntry reference earned by entry-bearing observations.
 */
export function repositoryEntries(
  inventory: RepositoryInventory,
): readonly RepositoryEntry[] {
  const entries: RepositoryEntry[] = [];
  for (const observation of inventory.observations) {
    if (isEntryBearingInventoryObservation(observation)) {
      entries.push(observation.entry);
    }
  }
  return entries;
}

export function canonicalInventoryEntrySet(
  inventory: RepositoryInventory,
): ReadonlySet<RepositoryEntry> {
  return new Set(repositoryEntries(inventory));
}
