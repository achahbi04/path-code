/**
 * Path Code runtime compatibility contract.
 *
 * Pure and side-effect free: callers decide how to act on results.
 * Library code must not terminate the process.
 */

/** Minimum supported Node.js major version for Path Code. */
export const MINIMUM_SUPPORTED_NODE_MAJOR = 22;

/** Parsed semantic Node version components. */
export type ParsedNodeVersion = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
};

/** Deterministic evaluation of a Node version string against the contract. */
export type NodeVersionEvaluation =
  | {
      readonly ok: true;
      readonly version: ParsedNodeVersion;
      readonly supported: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

/**
 * Parse a Node.js version string into major/minor/patch.
 *
 * Accepts forms such as `v22.0.0`, `22.11.1`, and `v22.0.0-pre`.
 * Returns `null` when the input cannot be parsed as a Node version.
 */
export function parseNodeVersion(input: string): ParsedNodeVersion | null {
  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Strip optional leading "v"/"V", then take major.minor.patch before any prerelease/build metadata.
  const match = /^v?(\d+)\.(\d+)\.(\d+)/i.exec(trimmed);
  if (match === null) {
    return null;
  }

  const majorText = match[1];
  const minorText = match[2];
  const patchText = match[3];
  if (
    majorText === undefined ||
    minorText === undefined ||
    patchText === undefined
  ) {
    return null;
  }

  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);

  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return null;
  }

  return { major, minor, patch };
}

/**
 * Evaluate whether a Node version string satisfies the Path Code runtime contract.
 */
export function evaluateNodeVersion(input: string): NodeVersionEvaluation {
  const version = parseNodeVersion(input);
  if (version === null) {
    return {
      ok: false,
      reason: "malformed Node version string",
    };
  }

  return {
    ok: true,
    version,
    supported: version.major >= MINIMUM_SUPPORTED_NODE_MAJOR,
  };
}

/**
 * Return whether a Node version string is supported.
 * Malformed input is treated as unsupported (not an exception).
 */
export function isNodeVersionSupported(input: string): boolean {
  const evaluation = evaluateNodeVersion(input);
  return evaluation.ok && evaluation.supported;
}
