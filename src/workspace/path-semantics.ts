/**
 * Pure path-component containment semantics.
 * Filesystem-independent — testable with path.posix and path.win32.
 */

/**
 * Minimal path API surface used for containment decisions.
 * Compatible with Node's path.posix / path.win32 / path modules.
 */
export type PathSemantics = {
  readonly sep: string;
  readonly relative: (from: string, to: string) => string;
  readonly isAbsolute: (p: string) => boolean;
};

/**
 * Return whether `candidate` is the same as `root` or a descendant of `root`.
 *
 * Both arguments must already be absolute (and for production use, physical).
 * This function performs no I/O.
 */
export function isInsideRoot(
  root: string,
  candidate: string,
  pathImpl: PathSemantics,
): boolean {
  const relative = pathImpl.relative(root, candidate);

  // Identical paths yield an empty relative path.
  if (relative.length === 0) {
    return true;
  }

  // Different Windows drives (or other absolute relative results) are outside.
  if (pathImpl.isAbsolute(relative)) {
    return false;
  }

  // Parent traversal: ".." or "../..." / "..\\..."
  if (relative === ".." || relative.startsWith(`..${pathImpl.sep}`)) {
    return false;
  }

  return true;
}
