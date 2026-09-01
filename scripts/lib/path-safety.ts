/**
 * Repository-relative path safety for verifier tooling.
 */

const SHA40 = /^[0-9a-f]{40}$/;

export function isExactFullSha(value: string): boolean {
  return SHA40.test(value);
}

export function assertExactFullSha(value: string, label: string): void {
  if (!isExactFullSha(value)) {
    throw new Error(`${label} must be an exact full 40-hex Git object ID`);
  }
}

export function assertSafeRepoRelativePath(path: string, label: string): void {
  if (path.length === 0) {
    throw new Error(`${label}: empty path`);
  }
  if (path.includes("\0")) {
    throw new Error(`${label}: NUL byte in path`);
  }
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    throw new Error(`${label}: absolute path rejected`);
  }
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment === "..") {
      throw new Error(`${label}: path traversal rejected`);
    }
  }
}
