/**
 * Canonical path identity and workspace boundary contracts.
 *
 * CanonicalPath is a type-level brand only.
 * Construction/canonicalization and containment enforcement belong to Phase 1C+.
 */

/**
 * Branded path identity. Raw strings are not assignable without an intentional cast.
 * This is NOT a runtime security boundary.
 */
export type CanonicalPath = string & {
  readonly __brand: "CanonicalPath";
};

/**
 * Future workspace containment capabilities.
 * Declaration only — no filesystem or path runtime behavior in Phase 1B.
 */
export interface WorkspaceBoundary {
  canonicalize(inputPath: string): CanonicalPath;
  isInside(path: CanonicalPath): boolean;
  resolveSymlinkTarget(path: CanonicalPath): CanonicalPath;
}
