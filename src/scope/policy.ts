/**
 * Phase 5G sensitive-path policy.
 *
 * This is a refusal list, not a permission list: a path that is not sensitive
 * still has to be admitted by inventory before anything may read or write it.
 * The policy is purely lexical so it can be applied to a model-proposed string
 * before that string is ever resolved against the filesystem.
 */

import { MAX_SCOPE_RELATIVE_PATH_UTF8_BYTES, utf8ByteLength } from "./bounds.js";
import type {
  SensitivePathPolicyOptions,
  SensitivePathReasonCode,
  SensitivePathVerdict,
} from "./types.js";

/** Basenames that are private key material regardless of extension. */
const PRIVATE_KEY_BASENAMES = new Set([
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ecdsa_sk",
  "id_ed25519",
  "id_ed25519_sk",
  "identity",
  "server.key",
  "privatekey",
]);

const PRIVATE_KEY_SUFFIXES = [
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
  ".ppk",
  ".asc",
  ".gpg",
  ".p8",
];

/** The single environment file that is documentation rather than a secret. */
const ENVIRONMENT_EXAMPLE_BASENAMES = new Set([".env.example"]);

function refuse(
  reasonCode: SensitivePathReasonCode,
  detail: string,
): SensitivePathVerdict {
  return Object.freeze({ sensitive: true as const, reasonCode, detail });
}

/**
 * Normalize a model-supplied path to repository-relative POSIX form, or refuse.
 * Rejects absolute paths, drive letters, traversal, NUL and empty segments.
 */
export function normalizeRepositoryRelativePath(
  value: unknown,
): { ok: true; path: string } | { ok: false; detail: string } {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, detail: "path must be a nonempty string" };
  }
  if (utf8ByteLength(value) > MAX_SCOPE_RELATIVE_PATH_UTF8_BYTES) {
    return { ok: false, detail: "path exceeds the relative-path byte bound" };
  }
  if (value.includes("\0")) {
    return { ok: false, detail: "path contains NUL" };
  }
  const unified = value.replaceAll("\\", "/");
  if (unified.startsWith("/")) {
    return { ok: false, detail: "path is absolute" };
  }
  if (/^[A-Za-z]:/.test(unified)) {
    return { ok: false, detail: "path carries a drive designator" };
  }
  const segments = unified.split("/");
  const kept: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      // A trailing slash or a redundant "." is tolerated, never a bare "".
      continue;
    }
    if (segment === "..") {
      return { ok: false, detail: "path escapes the repository root" };
    }
    kept.push(segment);
  }
  if (kept.length === 0) {
    return { ok: false, detail: "path resolves to the repository root" };
  }
  return { ok: true, path: kept.join("/") };
}

/**
 * Classify a repository-relative path against the fixed refusal list plus any
 * host-supplied prefixes. Never touches the filesystem.
 */
export function classifyScopePathSensitivity(
  value: unknown,
  options: SensitivePathPolicyOptions = {},
): SensitivePathVerdict {
  const normalized = normalizeRepositoryRelativePath(value);
  if (!normalized.ok) {
    return refuse("PATH_NOT_REPOSITORY_RELATIVE", normalized.detail);
  }
  const path = normalized.path;
  const segments = path.split("/");
  const basename = segments[segments.length - 1]!;
  const lowerBasename = basename.toLowerCase();

  for (const segment of segments) {
    if (segment === ".git") {
      return refuse(
        "GIT_ADMINISTRATIVE",
        "Git administrative state is never a Path Code target",
      );
    }
    if (segment === "node_modules") {
      return refuse(
        "DEPENDENCY_TREE",
        "installed dependency trees are never a Path Code target",
      );
    }
    if (segment === ".ssh") {
      return refuse(
        "PRIVATE_KEY_MATERIAL",
        "SSH key directories are never a Path Code target",
      );
    }
  }

  if (lowerBasename === ".env" || lowerBasename.startsWith(".env.")) {
    if (!ENVIRONMENT_EXAMPLE_BASENAMES.has(lowerBasename)) {
      return refuse(
        "ENVIRONMENT_SECRET",
        "environment files may carry credentials; only .env.example is permitted",
      );
    }
  }

  if (PRIVATE_KEY_BASENAMES.has(lowerBasename)) {
    return refuse(
      "PRIVATE_KEY_MATERIAL",
      "the file name denotes private key material",
    );
  }
  for (const suffix of PRIVATE_KEY_SUFFIXES) {
    if (lowerBasename.endsWith(suffix)) {
      return refuse(
        "PRIVATE_KEY_MATERIAL",
        `the '${suffix}' extension denotes key or certificate material`,
      );
    }
  }

  const storePrefix = normalizeRepositoryRelativePath(
    options.recoveryStoreRelativePrefix ?? undefined,
  );
  if (
    storePrefix.ok &&
    (path === storePrefix.path || path.startsWith(`${storePrefix.path}/`))
  ) {
    return refuse(
      "RECOVERY_STORE",
      "the recovery checkpoint store is never a Path Code target",
    );
  }

  for (const rawPrefix of options.forbiddenRelativePrefixes ?? []) {
    const prefix = normalizeRepositoryRelativePath(rawPrefix);
    if (!prefix.ok) {
      continue;
    }
    if (path === prefix.path || path.startsWith(`${prefix.path}/`)) {
      return refuse(
        "PATH_CODE_RUNTIME_SOURCE",
        `'${prefix.path}' is refused for this workspace`,
      );
    }
  }

  return Object.freeze({ sensitive: false as const, normalizedPath: path });
}
