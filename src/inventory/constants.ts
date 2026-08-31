/**
 * Phase 2A inventory hard production ceilings.
 *
 * System pruning is a budget mechanism, not a security mechanism. Security
 * comes from WorkspaceBoundary admission and deny-path visibility. Directory
 * names are heuristics — a directory called vendor or build can contain
 * project-owned source. Silently skipping it because of its name would mean
 * Path Code decided something was irrelevant without observing it, which
 * contradicts "knowledge must be earned through observation."
 */
export const DEFAULT_SYSTEM_PRUNED_DIRECTORIES = [".git"] as const;

export const MAX_TRAVERSAL_DEPTH = 64;

export const MAX_INVENTORY_OBSERVATIONS = 50_000;

/** Locale-independent entry name ordering for deterministic breadth-first traversal. */
export const LOCALE_INDEPENDENT_NAME_COMPARE = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
