/**
 * Phase 3A preparation — earns point-in-time before-state through Phase 2B reader.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { ResolvedProjectConfig } from "../config/types.js";
import type { RepositoryEntry } from "../inventory/types.js";
import { readRepositoryContent } from "../reader/read.js";
import { MAX_EDIT_FILE_BYTES } from "./bounds.js";
import { refuseIfTargetDenied } from "./denial.js";
import { copyBytes, fingerprintBytes } from "./fingerprint.js";
import { validateLeafName } from "./leaf-name.js";
import { isModifyExistingFileDisabled } from "./policy.js";
import { childRelativePath } from "./relative-path.js";
import { nextPreparedId } from "./internal/registry.js";
import type {
  CreationPrecondition,
  PreparedCreation,
  PreparedCreationData,
  PreparedMutation,
  PreparedMutationData,
  PreparationFailure,
} from "./types.js";

function preparationFailure(
  code: PreparationFailure["code"],
  message: string,
): PreparationFailure {
  return { code, message };
}

function preparedMutation(data: PreparedMutationData): PreparedMutation {
  return Object.freeze({
    ...data,
    proposedBytes: copyBytes(data.proposedBytes),
  }) as PreparedMutation;
}

function preparedCreation(data: PreparedCreationData): PreparedCreation {
  return Object.freeze({
    ...data,
    proposedBytes: copyBytes(data.proposedBytes),
  }) as PreparedCreation;
}

function refuseIfProposedTooLarge(
  byteLength: number,
): Result<true, PreparationFailure> {
  if (byteLength > MAX_EDIT_FILE_BYTES) {
    return failure(
      preparationFailure(
        "FILE_TOO_LARGE",
        `Proposed content exceeds MAX_EDIT_FILE_BYTES (${MAX_EDIT_FILE_BYTES})`,
      ),
    );
  }
  return success(true);
}

export async function prepareModifyExistingFile(
  target: RepositoryEntry,
  proposedBytes: Uint8Array | Buffer,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): Promise<Result<PreparedMutation, PreparationFailure>> {
  if (isModifyExistingFileDisabled(config)) {
    return failure(
      preparationFailure(
        "ACTION_DISABLED",
        "MODIFY_EXISTING_FILE is disabled by project configuration",
      ),
    );
  }

  if (target.physicalKind !== "FILE") {
    return failure(
      preparationFailure(
        "NOT_REGULAR_FILE",
        "Modification preparation requires a regular file RepositoryEntry",
      ),
    );
  }

  const denied = await refuseIfTargetDenied(
    target.relativePath,
    workspace,
    config,
  );
  if (!denied.ok) {
    return denied;
  }

  const proposedCopy = copyBytes(proposedBytes);
  const proposedSize = refuseIfProposedTooLarge(proposedCopy.byteLength);
  if (!proposedSize.ok) {
    return proposedSize;
  }

  const readOutcome = await readRepositoryContent(target, workspace, config);
  if (!readOutcome.ok) {
    return failure(
      preparationFailure(
        "BEFORE_STATE_UNAVAILABLE",
        "Repository reader failed before preparation could complete",
      ),
    );
  }

  const outcome = readOutcome.value;
  switch (outcome.status) {
    case "READ":
      break;
    case "DENIED":
      return failure(
        preparationFailure(
          "TARGET_DENIED",
          `Target path is denied: ${outcome.relativePath}`,
        ),
      );
    case "TOO_LARGE":
      return failure(
        preparationFailure(
          "FILE_TOO_LARGE",
          `Existing file exceeds readable ceiling (${outcome.maxBytes})`,
        ),
      );
    case "NOT_REGULAR_FILE":
      return failure(
        preparationFailure(
          "NOT_REGULAR_FILE",
          `Target is not a regular file (${outcome.physicalKind})`,
        ),
      );
    case "STALE_ENTRY":
    case "UNREADABLE":
      return failure(
        preparationFailure(
          "BEFORE_STATE_UNAVAILABLE",
          `Before-state could not be observed (${outcome.status})`,
        ),
      );
    default: {
      const _exhaustive: never = outcome;
      return failure(
        preparationFailure(
          "BEFORE_STATE_UNAVAILABLE",
          `Unexpected reader outcome: ${String(_exhaustive)}`,
        ),
      );
    }
  }

  const observation = outcome.observation;
  const afterFingerprint = fingerprintBytes(proposedCopy);

  return success(
    preparedMutation({
      preparedId: nextPreparedId(),
      action: "MODIFY_EXISTING_FILE",
      target,
      beforeFingerprint: observation.fingerprint,
      beforeByteLength: observation.byteLength,
      afterFingerprint,
      afterByteLength: proposedCopy.byteLength,
      proposedBytes: proposedCopy,
      config,
      workspace,
    }),
  );
}

async function proveLeafAbsent(
  parent: RepositoryEntry,
  leafName: string,
  targetRelativePath: string,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): Promise<Result<CreationPrecondition, PreparationFailure>> {
  const denied = await refuseIfTargetDenied(
    targetRelativePath,
    workspace,
    config,
  );
  if (!denied.ok) {
    return denied;
  }

  const canonical = await workspace.canonicalize(targetRelativePath);
  if (canonical.ok) {
    return failure(
      preparationFailure(
        "TARGET_ALREADY_OBSERVED",
        `Creation target already exists: ${targetRelativePath}`,
      ),
    );
  }

  switch (canonical.error.code) {
    case "PATH_NOT_FOUND":
      return success({
        kind: "NON_EXISTENT",
        parent,
        leafName,
        targetRelativePath,
        observedAtMs: Date.now(),
      });
    case "PATH_OUTSIDE_WORKSPACE":
      return failure(
        preparationFailure(
          "TARGET_DENIED",
          "Creation target resolves outside the workspace boundary",
        ),
      );
    case "CANONICALIZATION_FAILED":
    case "INVALID_PATH_INPUT":
      return failure(
        preparationFailure(
          "CREATION_ABSENCE_UNPROVEN",
          "Leaf absence cannot be proven from current workspace evidence",
        ),
      );
    default: {
      const _exhaustive: never = canonical.error.code;
      return failure(
        preparationFailure(
          "CREATION_ABSENCE_UNPROVEN",
          `Unexpected canonicalization failure: ${String(_exhaustive)}`,
        ),
      );
    }
  }
}

export async function prepareCreateFile(
  parent: RepositoryEntry,
  leafName: string,
  proposedBytes: Uint8Array | Buffer,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): Promise<Result<PreparedCreation, PreparationFailure>> {
  if (parent.physicalKind !== "DIRECTORY") {
    return failure(
      preparationFailure(
        "PARENT_NOT_ADMITTED",
        "Creation parent must be an admitted directory RepositoryEntry",
      ),
    );
  }

  const leaf = validateLeafName(leafName);
  if (!leaf.ok) {
    return failure({
      code: "INVALID_LEAF_NAME",
      message: leaf.error.message,
    });
  }

  const targetRelativePath = childRelativePath(parent.relativePath, leaf.value);

  const denied = await refuseIfTargetDenied(
    parent.relativePath,
    workspace,
    config,
  );
  if (!denied.ok) {
    return denied;
  }

  const proposedCopy = copyBytes(proposedBytes);
  const proposedSize = refuseIfProposedTooLarge(proposedCopy.byteLength);
  if (!proposedSize.ok) {
    return proposedSize;
  }

  const absence = await proveLeafAbsent(
    parent,
    leaf.value,
    targetRelativePath,
    workspace,
    config,
  );
  if (!absence.ok) {
    return absence;
  }

  const afterFingerprint = fingerprintBytes(proposedCopy);

  return success(
    preparedCreation({
      preparedId: nextPreparedId(),
      action: "CREATE_FILE",
      parent,
      leafName: leaf.value,
      targetRelativePath,
      precondition: absence.value,
      afterFingerprint,
      afterByteLength: proposedCopy.byteLength,
      proposedBytes: proposedCopy,
      config,
      workspace,
    }),
  );
}
