/**
 * Build terminal EditRecord and KnowledgeInvalidation evidence.
 */

import type { RepositoryEntry } from "../../inventory/types.js";
import type { GitStateBaseline } from "../../git/types.js";
import type { ContentFingerprint } from "../../reader/types.js";
import type {
  CreationPrecondition,
  EditRecordCreation,
  EditRecordExistingFile,
  EditOutcome,
  KnowledgeInvalidation,
} from "../types.js";

export function buildExistingFileEditRecord(input: {
  readonly target: RepositoryEntry;
  readonly authorizationId: string;
  readonly beforeFingerprint: ContentFingerprint;
  readonly beforeByteLength: number;
  readonly expectedAfterFingerprint: ContentFingerprint;
  readonly expectedAfterByteLength: number;
  readonly observedAfterFingerprint: ContentFingerprint | null;
  readonly observedAfterByteLength: number | null;
  readonly outcome: EditOutcome;
  readonly commitPointReached: boolean;
  readonly durabilityVerified: boolean;
  readonly gitContext?: GitStateBaseline;
}): EditRecordExistingFile {
  const provenance =
    input.outcome === "SUCCESS" &&
    input.commitPointReached &&
    input.durabilityVerified &&
    input.observedAfterFingerprint !== null
      ? ("PATH_CODE_MODIFIED" as const)
      : null;

  return Object.freeze({
    kind: "EXISTING_FILE",
    target: input.target,
    authorizationId: input.authorizationId,
    beforeFingerprint: input.beforeFingerprint,
    beforeByteLength: input.beforeByteLength,
    expectedAfterFingerprint: input.expectedAfterFingerprint,
    expectedAfterByteLength: input.expectedAfterByteLength,
    observedAfterFingerprint: input.observedAfterFingerprint,
    observedAfterByteLength: input.observedAfterByteLength,
    outcome: input.outcome,
    commitPointReached: input.commitPointReached,
    provenance,
    durabilityVerified: input.durabilityVerified,
    ...(input.gitContext !== undefined ? { gitContext: input.gitContext } : {}),
  });
}

export function buildCreationEditRecord(input: {
  readonly parent: RepositoryEntry;
  readonly leafName: string;
  readonly targetRelativePath: string;
  readonly authorizationId: string;
  readonly beforePrecondition: CreationPrecondition;
  readonly expectedAfterFingerprint: ContentFingerprint;
  readonly expectedAfterByteLength: number;
  readonly observedAfterFingerprint: ContentFingerprint | null;
  readonly observedAfterByteLength: number | null;
  readonly outcome: EditOutcome;
  readonly commitPointReached: boolean;
  readonly durabilityVerified: boolean;
  readonly gitContext?: GitStateBaseline;
}): EditRecordCreation {
  const provenance =
    input.outcome === "SUCCESS" &&
    input.commitPointReached &&
    input.durabilityVerified &&
    input.observedAfterFingerprint !== null
      ? ("PATH_CODE_MODIFIED" as const)
      : null;

  return Object.freeze({
    kind: "CREATION",
    parent: input.parent,
    leafName: input.leafName,
    targetRelativePath: input.targetRelativePath,
    authorizationId: input.authorizationId,
    beforePrecondition: input.beforePrecondition,
    expectedAfterFingerprint: input.expectedAfterFingerprint,
    expectedAfterByteLength: input.expectedAfterByteLength,
    observedAfterFingerprint: input.observedAfterFingerprint,
    observedAfterByteLength: input.observedAfterByteLength,
    outcome: input.outcome,
    commitPointReached: input.commitPointReached,
    provenance,
    durabilityVerified: input.durabilityVerified,
    ...(input.gitContext !== undefined ? { gitContext: input.gitContext } : {}),
  });
}

export function buildKnowledgeInvalidation(input: {
  readonly targetRelativePath: string;
  readonly editRecordKind?: KnowledgeInvalidation["editRecordKind"];
}): KnowledgeInvalidation {
  return Object.freeze({
    kind: "KNOWLEDGE_INVALIDATION",
    targetRelativePath: input.targetRelativePath,
    invalidatedAtMs: Date.now(),
    editRecordKind: input.editRecordKind ?? "EXISTING_FILE",
  });
}
