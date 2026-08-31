/**
 * Traversal disposition and completion vocabulary.
 */

import type { RepositoryEntry } from "./types.js";

export type InventoryObservation =
  | {
      readonly disposition: "DESCENDED";
      readonly relativePath: string;
      readonly entry: RepositoryEntry;
    }
  | {
      readonly disposition: "ADMITTED";
      readonly relativePath: string;
      readonly entry: RepositoryEntry;
    }
  | {
      readonly disposition: "DENIED_BY_PROJECT_RESTRICTION";
      readonly relativePath: string;
    }
  | {
      readonly disposition: "OUTSIDE_WORKSPACE";
      readonly relativePath: string;
    }
  | {
      readonly disposition: "SYSTEM_PRUNED";
      readonly relativePath: string;
      readonly reason: string;
    }
  | {
      readonly disposition: "CYCLE_DETECTED";
      readonly relativePath: string;
    }
  | {
      readonly disposition: "UNREADABLE";
      readonly relativePath: string;
    }
  | {
      readonly disposition: "DEPTH_LIMIT_REACHED";
      readonly relativePath: string;
      readonly entry: RepositoryEntry;
    };

export type InventoryPartialReason =
  | {
      readonly kind: "ENTRY_LIMIT_REACHED";
      readonly boundaryRelativePath?: string;
      readonly boundaryDepth?: number;
    }
  | {
      readonly kind: "DEPTH_LIMIT_REACHED";
      readonly relativePath: string;
    }
  | {
      readonly kind: "UNREADABLE_SUBTREE";
      readonly relativePath: string;
    };

/** Non-empty readonly partial-reason list. */
export type NonEmptyPartialReasons = readonly [
  InventoryPartialReason,
  ...InventoryPartialReason[],
];

/**
 * Traversal completion — not a claim that all repository knowledge exists.
 * COMPLETE means the traversal algorithm finished under declared visibility
 * and system-pruning rules without an unexpected or limit failure.
 */
export type TraversalCompletion =
  | { readonly kind: "COMPLETE" }
  | {
      readonly kind: "PARTIAL";
      readonly reasons: NonEmptyPartialReasons;
    };
