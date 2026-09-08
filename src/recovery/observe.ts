/**
 * Fresh live observation of a recovery target.
 *
 * Recovery never trusts a cached snapshot: every classification and every
 * action is preceded by a new canonicalization, a new inventory admission and
 * a new full-byte read through the ordinary Path Code reader. Size and mtime
 * are never used as evidence — only the SHA-256 of the observed bytes is.
 */

import path from "node:path";

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { CanonicalPath, WorkspaceBoundary } from "../domain/workspace.js";
import { inventory } from "../inventory/index.js";
import type { RepositoryEntry, RepositoryInventory } from "../inventory/types.js";
import { readRepositoryContent } from "../reader/index.js";
import type { CheckpointEntryManifest, RecoveryFailure } from "./types.js";

export type RecoveryTargetObservation =
  | {
      readonly present: false;
      readonly canonicalPath: null;
      readonly digestHex: null;
      readonly byteLength: null;
    }
  | {
      readonly present: true;
      readonly entry: RepositoryEntry;
      readonly canonicalPath: CanonicalPath;
      readonly digestHex: string;
      readonly byteLength: number;
    };

function observationFailure(
  code: RecoveryFailure["code"],
  message: string,
): RecoveryFailure {
  return { code, message };
}

const ABSENT: RecoveryTargetObservation = Object.freeze({
  present: false as const,
  canonicalPath: null,
  digestHex: null,
  byteLength: null,
});

export async function loadFreshInventory(
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): Promise<Result<RepositoryInventory, RecoveryFailure>> {
  const inv = await inventory(workspace, config);
  if (!inv.ok) {
    return failure(
      observationFailure(
        "OBSERVATION_FAILED",
        `inventory failed during recovery observation: ${inv.error.code}`,
      ),
    );
  }
  return success(inv.value);
}

function admittedEntryFor(
  inv: RepositoryInventory,
  relativePath: string,
): RepositoryEntry | undefined {
  for (const observation of inv.observations) {
    if (
      (observation.disposition === "ADMITTED" ||
        observation.disposition === "DESCENDED") &&
      observation.relativePath === relativePath &&
      "entry" in observation
    ) {
      return observation.entry;
    }
  }
  return undefined;
}

export type EntryPathBinding = {
  /** Canonical path the target must resolve to, when it is present. */
  readonly expectedCanonicalPath: string;
  /** Absolute path recovery may act on. */
  readonly absolutePath: string;
  readonly parentDirectory: string;
};

/**
 * Re-establish the path binding captured at checkpoint time.
 *
 * REPLACE_TEXT binds the target's own canonical path. CREATE_TEXT has no
 * target at capture, so it binds the canonical PARENT plus the leaf name — a
 * parent that has since become a symlink, moved, or been replaced no longer
 * canonicalizes to the captured root and the entry is refused.
 */
export async function verifyEntryPathBinding(
  entry: CheckpointEntryManifest,
  workspace: WorkspaceBoundary,
): Promise<Result<EntryPathBinding, RecoveryFailure>> {
  if (entry.kind === "REPLACE_TEXT") {
    if (entry.targetCanonicalPath === null) {
      return failure(
        observationFailure(
          "INTERNAL_CONTRACT",
          "REPLACE_TEXT entry lacks a captured canonical target path",
        ),
      );
    }
    return success({
      expectedCanonicalPath: entry.targetCanonicalPath,
      absolutePath: entry.targetCanonicalPath,
      parentDirectory: path.dirname(entry.targetCanonicalPath),
    });
  }

  if (entry.parentCanonicalPath === null || entry.leafName === null) {
    return failure(
      observationFailure(
        "INTERNAL_CONTRACT",
        "CREATE_TEXT entry lacks a captured canonical parent binding",
      ),
    );
  }
  const normalized = entry.relativePath.replaceAll("\\", "/");
  const separator = normalized.lastIndexOf("/");
  const parentRelative =
    separator === -1 ? "." : normalized.slice(0, separator);
  const leaf = separator === -1 ? normalized : normalized.slice(separator + 1);
  if (leaf !== entry.leafName) {
    return failure(
      observationFailure(
        "INTERNAL_CONTRACT",
        "CREATE_TEXT entry leaf name disagrees with its relative path",
      ),
    );
  }
  const parent = await workspace.canonicalize(parentRelative);
  if (!parent.ok) {
    return failure(
      observationFailure(
        "OBSERVATION_FAILED",
        `CREATE_TEXT parent '${parentRelative}' is not canonicalizable: ${parent.error.code}`,
      ),
    );
  }
  if (parent.value !== entry.parentCanonicalPath) {
    return failure(
      observationFailure(
        "OBSERVATION_FAILED",
        `CREATE_TEXT parent '${parentRelative}' no longer resolves to the canonical parent captured at checkpoint`,
      ),
    );
  }
  const absolutePath = path.join(entry.parentCanonicalPath, entry.leafName);
  return success({
    expectedCanonicalPath: absolutePath,
    absolutePath,
    parentDirectory: entry.parentCanonicalPath,
  });
}

/**
 * Observe one target as it exists right now. Absence is a first-class,
 * non-failing outcome; a symlink, a non-regular file, an identity change or a
 * path outside the workspace is a refusal for that entry.
 *
 * `sharedInventory` is an optimization only — pass nothing when the
 * observation must be strictly fresh (for example immediately before acting).
 */
export async function observeRecoveryTarget(input: {
  readonly relativePath: string;
  readonly expectedCanonicalPath: string | null;
  readonly workspace: WorkspaceBoundary;
  readonly config: ResolvedProjectConfig;
  readonly sharedInventory?: RepositoryInventory;
}): Promise<Result<RecoveryTargetObservation, RecoveryFailure>> {
  const canonical = await input.workspace.canonicalize(input.relativePath);
  if (!canonical.ok) {
    if (canonical.error.code === "PATH_NOT_FOUND") {
      return success(ABSENT);
    }
    if (canonical.error.code === "PATH_OUTSIDE_WORKSPACE") {
      return failure(
        observationFailure(
          "OBSERVATION_FAILED",
          `'${input.relativePath}' resolves outside the workspace`,
        ),
      );
    }
    return failure(
      observationFailure(
        "OBSERVATION_FAILED",
        `'${input.relativePath}' is not canonicalizable: ${canonical.error.code}`,
      ),
    );
  }
  if (
    input.expectedCanonicalPath !== null &&
    canonical.value !== input.expectedCanonicalPath
  ) {
    return failure(
      observationFailure(
        "OBSERVATION_FAILED",
        `'${input.relativePath}' no longer resolves to the canonical path captured at checkpoint`,
      ),
    );
  }

  let inv = input.sharedInventory;
  if (inv === undefined) {
    const loaded = await loadFreshInventory(input.workspace, input.config);
    if (!loaded.ok) {
      return failure(loaded.error);
    }
    inv = loaded.value;
  }

  const entry = admittedEntryFor(inv, input.relativePath);
  if (entry === undefined) {
    return failure(
      observationFailure(
        "OBSERVATION_FAILED",
        `'${input.relativePath}' exists but is not an admitted repository entry`,
      ),
    );
  }
  if (entry.lexicalKind !== "FILE" || entry.physicalKind !== "FILE") {
    return failure(
      observationFailure(
        "OBSERVATION_FAILED",
        `'${input.relativePath}' is not a regular file (${entry.lexicalKind}/${entry.physicalKind})`,
      ),
    );
  }
  if (entry.canonicalPath !== canonical.value) {
    return failure(
      observationFailure(
        "OBSERVATION_FAILED",
        `'${input.relativePath}' canonical identity changed between admission and observation`,
      ),
    );
  }

  const read = await readRepositoryContent(entry, input.workspace, input.config);
  if (!read.ok) {
    return failure(
      observationFailure(
        "OBSERVATION_FAILED",
        `reading '${input.relativePath}' failed: ${read.error.code}`,
      ),
    );
  }
  if (read.value.status !== "READ") {
    return failure(
      observationFailure(
        "OBSERVATION_FAILED",
        `reading '${input.relativePath}' returned ${read.value.status}`,
      ),
    );
  }

  return success({
    present: true as const,
    entry,
    canonicalPath: canonical.value,
    digestHex: read.value.observation.fingerprint.hex,
    byteLength: read.value.observation.byteLength,
  });
}
