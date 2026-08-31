/**
 * Repository inventory data types.
 */

import type { CanonicalPath } from "../domain/workspace.js";
import type {
  InventoryObservation,
  TraversalCompletion,
} from "./disposition.js";
import type { DenyPathRuleRecord } from "./denial.js";

export type LexicalEntryKind = "FILE" | "DIRECTORY" | "SYMLINK";

export type PhysicalTargetKind = "FILE" | "DIRECTORY" | "OTHER";

export type RepositoryEntryData = {
  readonly canonicalPath: CanonicalPath;
  readonly relativePath: string;
  readonly lexicalKind: LexicalEntryKind;
  readonly physicalKind: PhysicalTargetKind;
  readonly size: number | null;
  readonly mtimeMs: number | null;
};

/**
 * An admitted repository object — produced only after independent workspace
 * admission during inventory traversal.
 */
export type RepositoryEntry = RepositoryEntryData & {
  readonly __repositoryEntryBrand: never;
};

export type RepositoryInventoryData = {
  readonly observations: readonly InventoryObservation[];
  readonly traversalCompletion: TraversalCompletion;
  readonly denyPathRules: readonly DenyPathRuleRecord[];
};

/**
 * Earned repository inventory — produced only by the inventory capability.
 */
export type RepositoryInventory = RepositoryInventoryData & {
  readonly __repositoryInventoryBrand: never;
};

export type InventoryOptions = {
  readonly maxDepth?: number;
  readonly maxEntries?: number;
};

export type EffectiveInventoryLimits = {
  readonly maxDepth: number;
  readonly maxEntries: number;
};
