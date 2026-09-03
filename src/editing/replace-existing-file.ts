/**
 * Phase 3B existing-file atomic replacement orchestration.
 *
 * Imports filesystem mutation primitives only through atomic-fs.ts.
 */

import path from "node:path";

import { loadProjectConfig } from "../config/loader.js";
import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { readRepositoryContent } from "../reader/read.js";
import type { ContentFingerprint } from "../reader/types.js";
import {
  type AtomicReplaceFsOps,
  isAtomicReplacePlatformSupported,
  PATH_CODE_TEMP_PREFIX,
  productionAtomicReplaceFs,
  type TargetFileMetadata,
  type TempCandidateHandle,
} from "./atomic-fs.js";
import { MAX_EDIT_FILE_BYTES } from "./bounds.js";
import { refuseIfTargetDenied } from "./denial.js";
import { fingerprintBytes } from "./fingerprint.js";
import { isTargetUnmergedInGitContext } from "./git-policy.js";
import { consumeEditAuthorization } from "./internal/consume-authorization.js";
import {
  buildExistingFileEditRecord,
  buildKnowledgeInvalidation,
} from "./internal/record.js";
import { isMutationActionDisabledByConfig } from "./policy.js";
import type {
  ConfigFreshness,
  EditAuthorization,
  EditRecordExistingFile,
  KnowledgeInvalidation,
  PreparedMutation,
  ReplaceExistingFileResult,
  ReplaceExistingFileTerminalFailure,
} from "./types.js";

/** Public caller options — no mechanism-substitution fields. */
export type ReplaceExistingFileOptions = {
  readonly gitContext?: import("../git/types.js").GitStateBaseline;
};

/** Internal test/recovery seam — not part of the public editing barrel. */
export type ReplaceExistingFileWithDependenciesOptions = {
  readonly fsOps: AtomicReplaceFsOps;
  readonly gitContext?: import("../git/types.js").GitStateBaseline;
};

type BeforeReadEvidence = {
  readonly fingerprint: ContentFingerprint;
  readonly byteLength: number;
};

function terminalFailure(
  input: ReplaceExistingFileTerminalFailure,
): ReplaceExistingFileTerminalFailure {
  return input;
}

function preReloadRefusal(
  prepared: PreparedMutation,
  authorizationId: string,
  gitContext: ReplaceExistingFileOptions["gitContext"],
): ReplaceExistingFileTerminalFailure {
  return terminalFailure({
    outcome: "REFUSED_PRECOMMIT",
    commitPointReached: false,
    durabilityVerified: false,
    editRecord: buildExistingFileEditRecord({
      target: prepared.target,
      authorizationId,
      beforeFingerprint: prepared.beforeFingerprint,
      beforeByteLength: prepared.beforeByteLength,
      expectedAfterFingerprint: prepared.afterFingerprint,
      expectedAfterByteLength: prepared.afterByteLength,
      observedAfterFingerprint: null,
      observedAfterByteLength: null,
      outcome: "REFUSED_PRECOMMIT",
      commitPointReached: false,
      durabilityVerified: false,
      ...(gitContext !== undefined ? { gitContext } : {}),
    }),
    knowledgeInvalidation: null,
    configFreshness: "SUPPLIED_ONLY",
  });
}

function fingerprintsEqual(
  left: ContentFingerprint,
  right: ContentFingerprint,
): boolean {
  return left.hex === right.hex && left.byteLength === right.byteLength;
}

function metadataIdentityEqual(
  before: TargetFileMetadata,
  after: TargetFileMetadata,
): boolean {
  return before.dev === after.dev && before.ino === after.ino;
}

async function resolveMutationConfig(
  prepared: PreparedMutation,
  authorizationId: string,
  gitContext: ReplaceExistingFileOptions["gitContext"],
): Promise<
  Result<
    {
      readonly config: ResolvedProjectConfig;
      readonly freshness: "MUTATION_TIME_RE_RESOLVED";
    },
    ReplaceExistingFileTerminalFailure
  >
> {
  const reloaded = await loadProjectConfig(prepared.workspace);
  if (reloaded.ok) {
    // CASE A (valid present) and CASE B (successful ABSENT) both succeed here.
    // ConfigFailure is never reinterpreted as ABSENT.
    return success({
      config: reloaded.value,
      freshness: "MUTATION_TIME_RE_RESOLVED",
    });
  }
  // CASE C — present but load/parse/validation failed: refuse closed.
  // No prepared.config fallback, no defaultProjectConfig, no SUPPLIED_ONLY continuation.
  return failure(
    terminalFailure({
      outcome: "REFUSED_PRECOMMIT",
      commitPointReached: false,
      durabilityVerified: false,
      editRecord: buildExistingFileEditRecord({
        target: prepared.target,
        authorizationId,
        beforeFingerprint: prepared.beforeFingerprint,
        beforeByteLength: prepared.beforeByteLength,
        expectedAfterFingerprint: prepared.afterFingerprint,
        expectedAfterByteLength: prepared.afterByteLength,
        observedAfterFingerprint: null,
        observedAfterByteLength: null,
        outcome: "REFUSED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        ...(gitContext !== undefined ? { gitContext } : {}),
      }),
      knowledgeInvalidation: null,
      configFreshness: "SUPPLIED_ONLY",
      refusalReason: "CONFIG_RELOAD_FAILED",
    }),
  );
}

async function readBeforeState(
  prepared: PreparedMutation,
  config: ResolvedProjectConfig,
  configFreshness: ConfigFreshness,
): Promise<
  Result<BeforeReadEvidence, ReplaceExistingFileTerminalFailure>
> {
  const readOutcome = await readRepositoryContent(
    prepared.target,
    prepared.workspace,
    config,
  );
  if (!readOutcome.ok) {
    return failure(
      terminalFailure({
        outcome: "FAILED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId: "",
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome: "FAILED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
        }),
        knowledgeInvalidation: null,
        configFreshness,
      }),
    );
  }

  const outcome = readOutcome.value;
  if (outcome.status !== "READ") {
    return failure(
      terminalFailure({
        outcome: "REFUSED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId: "",
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome: "REFUSED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
        }),
        knowledgeInvalidation: null,
        configFreshness,
      }),
    );
  }

  return success({
    fingerprint: outcome.observation.fingerprint,
    byteLength: outcome.observation.byteLength,
  });
}

function refuseIfBeforeMismatch(
  observed: BeforeReadEvidence,
  expected: ContentFingerprint,
  expectedLength: number,
  prepared: PreparedMutation,
  authorizationId: string,
  configFreshness: ConfigFreshness,
): Result<true, ReplaceExistingFileTerminalFailure> {
  if (
    observed.fingerprint.hex !== expected.hex ||
    observed.byteLength !== expectedLength
  ) {
    return failure(
      terminalFailure({
        outcome: "REFUSED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId,
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome: "REFUSED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
        }),
        knowledgeInvalidation: null,
        configFreshness,
        refusalReason: "TARGET_STALE",
      }),
    );
  }
  return success(true);
}

function refuseIfMetadataInvalid(
  metadata: TargetFileMetadata,
  prepared: PreparedMutation,
  authorizationId: string,
  configFreshness: ConfigFreshness,
  outcome: "REFUSED_PRECOMMIT" | "FAILED_PRECOMMIT",
): Result<true, ReplaceExistingFileTerminalFailure> {
  if (metadata.isSymbolicLink || !metadata.isFile) {
    return failure(
      terminalFailure({
        outcome,
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId,
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome,
          commitPointReached: false,
          durabilityVerified: false,
        }),
        knowledgeInvalidation: null,
        configFreshness,
      }),
    );
  }
  if (metadata.nlink > 1) {
    return failure(
      terminalFailure({
        outcome: "REFUSED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId,
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome: "REFUSED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
        }),
        knowledgeInvalidation: null,
        configFreshness,
      }),
    );
  }
  return success(true);
}

async function runRestrictionRechecks(
  prepared: PreparedMutation,
  config: ResolvedProjectConfig,
  authorizationId: string,
  configFreshness: ConfigFreshness,
  gitContext: ReplaceExistingFileOptions["gitContext"],
): Promise<Result<true, ReplaceExistingFileTerminalFailure>> {
  if (isMutationActionDisabledByConfig("MODIFY_EXISTING_FILE", config)) {
    return failure(
      terminalFailure({
        outcome: "REFUSED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId,
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome: "REFUSED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
        }),
        knowledgeInvalidation: null,
        configFreshness,
        refusalReason: "ACTION_DISABLED",
      }),
    );
  }

  const denied = await refuseIfTargetDenied(
    prepared.target.relativePath,
    prepared.workspace,
    config,
  );
  if (!denied.ok) {
    return failure(
      terminalFailure({
        outcome: "REFUSED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId,
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome: "REFUSED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
        }),
        knowledgeInvalidation: null,
        configFreshness,
        refusalReason: "TARGET_DENIED",
      }),
    );
  }

  const canonical = await prepared.workspace.canonicalize(
    prepared.target.relativePath,
  );
  if (!canonical.ok) {
    return failure(
      terminalFailure({
        outcome: "REFUSED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId,
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome: "REFUSED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
        }),
        knowledgeInvalidation: null,
        configFreshness,
      }),
    );
  }

  if (gitContext !== undefined) {
    if (
      isTargetUnmergedInGitContext(
        prepared.target,
        prepared.target.relativePath,
        gitContext,
      )
    ) {
      return failure(
        terminalFailure({
          outcome: "REFUSED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
          editRecord: buildExistingFileEditRecord({
            target: prepared.target,
            authorizationId,
            beforeFingerprint: prepared.beforeFingerprint,
            beforeByteLength: prepared.beforeByteLength,
            expectedAfterFingerprint: prepared.afterFingerprint,
            expectedAfterByteLength: prepared.afterByteLength,
            observedAfterFingerprint: null,
            observedAfterByteLength: null,
            outcome: "REFUSED_PRECOMMIT",
            commitPointReached: false,
      durabilityVerified: false,
      ...(gitContext !== undefined ? { gitContext } : {}),
    }),
          knowledgeInvalidation: null,
          configFreshness,
        }),
      );
    }
  }

  return success(true);
}

async function cleanupTemp(
  fsOps: AtomicReplaceFsOps,
  handle: TempCandidateHandle | null,
): Promise<boolean> {
  if (handle === null) {
    return false;
  }
  let cleanupFailure = false;
  try {
    await fsOps.closeHandle(handle.handle);
  } catch {
    cleanupFailure = true;
  }
  try {
    await fsOps.unlink(handle.tempPath);
  } catch {
    cleanupFailure = true;
  }
  return cleanupFailure;
}

async function prepareTempCandidate(
  fsOps: AtomicReplaceFsOps,
  parentDir: string,
  targetMetadata: TargetFileMetadata,
  bytes: Readonly<Uint8Array>,
  expectedAfter: ContentFingerprint,
): Promise<
  Result<
    { readonly handle: TempCandidateHandle; readonly closed: true },
    Error
  >
> {
  let tempHandle: TempCandidateHandle | null = null;
  try {
    tempHandle = await fsOps.createTempExclusive(parentDir, PATH_CODE_TEMP_PREFIX);
    await fsOps.writeAll(tempHandle.handle, bytes);
    await fsOps.fsyncHandle(tempHandle.handle);

    try {
      await fsOps.fchown(tempHandle.handle, targetMetadata.uid, targetMetadata.gid);
    } catch {
      throw new Error("Ownership preservation failed");
    }
    try {
      await fsOps.fchmod(tempHandle.handle, targetMetadata.mode);
    } catch {
      throw new Error("Mode preservation failed");
    }
    await fsOps.fsyncHandle(tempHandle.handle);

    const candidateBytes = await fsOps.readCandidateBytes(
      tempHandle.handle,
      expectedAfter.byteLength,
    );
    const candidateFingerprint = fingerprintBytes(candidateBytes);
    if (!fingerprintsEqual(candidateFingerprint, expectedAfter)) {
      throw new Error("Candidate verification mismatch");
    }

    await fsOps.closeHandle(tempHandle.handle);
    return success({ handle: tempHandle, closed: true });
  } catch (error) {
    if (tempHandle !== null) {
      await cleanupTemp(fsOps, tempHandle);
    }
    if (error instanceof Error) {
      return failure(error);
    }
    return failure(new Error("Temp candidate preparation failed"));
  }
}

function withCleanup(
  base: ReplaceExistingFileTerminalFailure,
  cleanupFailure: boolean,
): ReplaceExistingFileTerminalFailure {
  return cleanupFailure ? { ...base, cleanupFailure: true } : base;
}

/**
 * Internal orchestration with injectable filesystem ops (tests/recovery only).
 * Not exported from the public editing barrel.
 */
export async function replaceExistingFileWithDependencies(
  authorization: EditAuthorization,
  prepared: PreparedMutation,
  options: ReplaceExistingFileWithDependenciesOptions,
): Promise<ReplaceExistingFileResult> {
  const fsOps = options.fsOps;
  const gitContext = options.gitContext;

  if (prepared.action !== "MODIFY_EXISTING_FILE") {
    return preReloadRefusal(prepared, authorization.authorizationId, gitContext);
  }

  const consumed = consumeEditAuthorization(authorization, prepared);
  if (!consumed.ok) {
    return preReloadRefusal(prepared, authorization.authorizationId, gitContext);
  }

  const authorizationId = authorization.authorizationId;

  if (prepared.afterByteLength > MAX_EDIT_FILE_BYTES) {
    return preReloadRefusal(prepared, authorizationId, gitContext);
  }

  if (!isAtomicReplacePlatformSupported()) {
    return preReloadRefusal(prepared, authorizationId, gitContext);
  }

  const configResult = await resolveMutationConfig(
    prepared,
    authorizationId,
    gitContext,
  );
  if (!configResult.ok) {
    return configResult.error;
  }
  const { config, freshness: configFreshness } = configResult.value;

  const restrictions = await runRestrictionRechecks(
    prepared,
    config,
    authorizationId,
    configFreshness,
    gitContext,
  );
  if (!restrictions.ok) {
    return restrictions.error;
  }

  const canonical = await prepared.workspace.canonicalize(
    prepared.target.relativePath,
  );
  if (!canonical.ok) {
    return terminalFailure({
      outcome: "REFUSED_PRECOMMIT",
      commitPointReached: false,
      durabilityVerified: false,
      editRecord: buildExistingFileEditRecord({
        target: prepared.target,
        authorizationId,
        beforeFingerprint: prepared.beforeFingerprint,
        beforeByteLength: prepared.beforeByteLength,
        expectedAfterFingerprint: prepared.afterFingerprint,
        expectedAfterByteLength: prepared.afterByteLength,
        observedAfterFingerprint: null,
        observedAfterByteLength: null,
        outcome: "REFUSED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        ...(gitContext !== undefined ? { gitContext } : {}),
      }),
      knowledgeInvalidation: null,
      configFreshness,
    });
  }
  const targetPath = canonical.value;
  const parentDir = path.dirname(targetPath);

  const initialRead = await readBeforeState(prepared, config, configFreshness);
  if (!initialRead.ok) {
    const record = buildExistingFileEditRecord({
      ...initialRead.error.editRecord,
      authorizationId,
      ...(gitContext !== undefined ? { gitContext } : {}),
    });
    return { ...initialRead.error, editRecord: record };
  }

  const initialMismatch = refuseIfBeforeMismatch(
    initialRead.value,
    prepared.beforeFingerprint,
    prepared.beforeByteLength,
    prepared,
    authorizationId,
    configFreshness,
  );
  if (!initialMismatch.ok) {
    return initialMismatch.error;
  }

  let targetMetadata: TargetFileMetadata;
  try {
    targetMetadata = await fsOps.lstatTarget(targetPath);
  } catch {
    return terminalFailure({
      outcome: "REFUSED_PRECOMMIT",
      commitPointReached: false,
      durabilityVerified: false,
      editRecord: buildExistingFileEditRecord({
        target: prepared.target,
        authorizationId,
        beforeFingerprint: prepared.beforeFingerprint,
        beforeByteLength: prepared.beforeByteLength,
        expectedAfterFingerprint: prepared.afterFingerprint,
        expectedAfterByteLength: prepared.afterByteLength,
        observedAfterFingerprint: null,
        observedAfterByteLength: null,
        outcome: "REFUSED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        ...(gitContext !== undefined ? { gitContext } : {}),
      }),
      knowledgeInvalidation: null,
      configFreshness,
    });
  }

  const metadataValid = refuseIfMetadataInvalid(
    targetMetadata,
    prepared,
    authorizationId,
    configFreshness,
    "REFUSED_PRECOMMIT",
  );
  if (!metadataValid.ok) {
    return metadataValid.error;
  }

  const capturedIdentity = targetMetadata;
  let tempHandle: TempCandidateHandle | null = null;

  const tempPrepared = await prepareTempCandidate(
    fsOps,
    parentDir,
    targetMetadata,
    prepared.proposedBytes,
    prepared.afterFingerprint,
  );
  if (!tempPrepared.ok) {
    return terminalFailure({
      outcome: "FAILED_PRECOMMIT",
      commitPointReached: false,
      durabilityVerified: false,
      editRecord: buildExistingFileEditRecord({
        target: prepared.target,
        authorizationId,
        beforeFingerprint: prepared.beforeFingerprint,
        beforeByteLength: prepared.beforeByteLength,
        expectedAfterFingerprint: prepared.afterFingerprint,
        expectedAfterByteLength: prepared.afterByteLength,
        observedAfterFingerprint: null,
        observedAfterByteLength: null,
        outcome: "FAILED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        ...(gitContext !== undefined ? { gitContext } : {}),
      }),
      knowledgeInvalidation: null,
      configFreshness,
    });
  }
  tempHandle = tempPrepared.value.handle;

  const finalRestrictions = await runRestrictionRechecks(
    prepared,
    config,
    authorizationId,
    configFreshness,
    gitContext,
  );
  if (!finalRestrictions.ok) {
    const cleanupFailure = await cleanupTemp(fsOps, tempHandle);
    return withCleanup(finalRestrictions.error, cleanupFailure);
  }

  const finalRead = await readBeforeState(prepared, config, configFreshness);
  if (!finalRead.ok) {
    const cleanupFailure = await cleanupTemp(fsOps, tempHandle);
    const record = buildExistingFileEditRecord({
      ...finalRead.error.editRecord,
      authorizationId,
      outcome: "FAILED_PRECOMMIT",
      ...(gitContext !== undefined ? { gitContext } : {}),
    });
    return withCleanup(
      terminalFailure({
        outcome: "FAILED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: record,
        knowledgeInvalidation: null,
        configFreshness,
      }),
      cleanupFailure,
    );
  }

  const finalMismatch = refuseIfBeforeMismatch(
    finalRead.value,
    prepared.beforeFingerprint,
    prepared.beforeByteLength,
    prepared,
    authorizationId,
    configFreshness,
  );
  if (!finalMismatch.ok) {
    const cleanupFailure = await cleanupTemp(fsOps, tempHandle);
    return withCleanup(
      {
        ...finalMismatch.error,
        outcome: "FAILED_PRECOMMIT",
      },
      cleanupFailure,
    );
  }

  let finalMetadata: TargetFileMetadata;
  try {
    finalMetadata = await fsOps.lstatTarget(targetPath);
  } catch {
    const cleanupFailure = await cleanupTemp(fsOps, tempHandle);
    return withCleanup(
      terminalFailure({
        outcome: "FAILED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId,
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome: "FAILED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
          ...(gitContext !== undefined ? { gitContext } : {}),
        }),
        knowledgeInvalidation: null,
        configFreshness,
      }),
      cleanupFailure,
    );
  }

  const finalMetadataValid = refuseIfMetadataInvalid(
    finalMetadata,
    prepared,
    authorizationId,
    configFreshness,
    "FAILED_PRECOMMIT",
  );
  if (!finalMetadataValid.ok) {
    const cleanupFailure = await cleanupTemp(fsOps, tempHandle);
    return withCleanup(finalMetadataValid.error, cleanupFailure);
  }

  if (!metadataIdentityEqual(capturedIdentity, finalMetadata)) {
    const cleanupFailure = await cleanupTemp(fsOps, tempHandle);
    return withCleanup(
      terminalFailure({
        outcome: "FAILED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId,
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome: "FAILED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
          ...(gitContext !== undefined ? { gitContext } : {}),
        }),
        knowledgeInvalidation: null,
        configFreshness,
      }),
      cleanupFailure,
    );
  }

  const tempPath = tempHandle.tempPath;
  tempHandle = null;

  try {
    await fsOps.renameAtomic(tempPath, targetPath);
  } catch {
    let cleanupFailure = false;
    try {
      await fsOps.unlink(tempPath);
    } catch {
      cleanupFailure = true;
    }
    return withCleanup(
      terminalFailure({
        outcome: "FAILED_PRECOMMIT",
        commitPointReached: false,
        durabilityVerified: false,
        editRecord: buildExistingFileEditRecord({
          target: prepared.target,
          authorizationId,
          beforeFingerprint: prepared.beforeFingerprint,
          beforeByteLength: prepared.beforeByteLength,
          expectedAfterFingerprint: prepared.afterFingerprint,
          expectedAfterByteLength: prepared.afterByteLength,
          observedAfterFingerprint: null,
          observedAfterByteLength: null,
          outcome: "FAILED_PRECOMMIT",
          commitPointReached: false,
          durabilityVerified: false,
          ...(gitContext !== undefined ? { gitContext } : {}),
        }),
        knowledgeInvalidation: null,
        configFreshness,
      }),
      cleanupFailure,
    );
  }

  let durabilityVerified = true;
  try {
    await fsOps.fsyncDirectory(parentDir);
  } catch {
    durabilityVerified = false;
  }

  const afterRead = await readRepositoryContent(
    prepared.target,
    prepared.workspace,
    config,
  );

  if (!afterRead.ok || afterRead.value.status !== "READ") {
    const invalidation = buildKnowledgeInvalidation({
      targetRelativePath: prepared.target.relativePath,
    });
    return terminalFailure({
      outcome: "COMMITTED_FAILURE",
      commitPointReached: true,
      durabilityVerified,
      editRecord: buildExistingFileEditRecord({
        target: prepared.target,
        authorizationId,
        beforeFingerprint: prepared.beforeFingerprint,
        beforeByteLength: prepared.beforeByteLength,
        expectedAfterFingerprint: prepared.afterFingerprint,
        expectedAfterByteLength: prepared.afterByteLength,
        observedAfterFingerprint: null,
        observedAfterByteLength: null,
        outcome: "COMMITTED_FAILURE",
        commitPointReached: true,
        durabilityVerified,
        ...(gitContext !== undefined ? { gitContext } : {}),
      }),
      knowledgeInvalidation: invalidation,
      configFreshness,
    });
  }

  const observed = afterRead.value.observation;
  const afterMatches =
    observed.fingerprint.hex === prepared.afterFingerprint.hex &&
    observed.byteLength === prepared.afterByteLength;

  if (!afterMatches || !durabilityVerified) {
    const invalidation = buildKnowledgeInvalidation({
      targetRelativePath: prepared.target.relativePath,
    });
    return terminalFailure({
      outcome: "COMMITTED_FAILURE",
      commitPointReached: true,
      durabilityVerified,
      editRecord: buildExistingFileEditRecord({
        target: prepared.target,
        authorizationId,
        beforeFingerprint: prepared.beforeFingerprint,
        beforeByteLength: prepared.beforeByteLength,
        expectedAfterFingerprint: prepared.afterFingerprint,
        expectedAfterByteLength: prepared.afterByteLength,
        observedAfterFingerprint: observed.fingerprint,
        observedAfterByteLength: observed.byteLength,
        outcome: "COMMITTED_FAILURE",
        commitPointReached: true,
        durabilityVerified,
        ...(gitContext !== undefined ? { gitContext } : {}),
      }),
      knowledgeInvalidation: invalidation,
      configFreshness,
    });
  }

  const editRecord = buildExistingFileEditRecord({
    target: prepared.target,
    authorizationId,
    beforeFingerprint: prepared.beforeFingerprint,
    beforeByteLength: prepared.beforeByteLength,
    expectedAfterFingerprint: prepared.afterFingerprint,
    expectedAfterByteLength: prepared.afterByteLength,
    observedAfterFingerprint: observed.fingerprint,
    observedAfterByteLength: observed.byteLength,
    outcome: "SUCCESS",
    commitPointReached: true,
    durabilityVerified: true,
    ...(gitContext !== undefined ? { gitContext } : {}),
  });

  const knowledgeInvalidation = buildKnowledgeInvalidation({
    targetRelativePath: prepared.target.relativePath,
  });

  return {
    outcome: "SUCCESS",
    commitPointReached: true,
    durabilityVerified: true,
    editRecord,
    knowledgeInvalidation,
    configFreshness,
  };
}

/**
 * Public existing-file replacement — always binds productionAtomicReplaceFs.
 * Constructs a fresh internal options object from gitContext only; unknown
 * caller fields (including fsOps via JS widening) are ignored.
 */
export async function replaceExistingFile(
  authorization: EditAuthorization,
  prepared: PreparedMutation,
  options: ReplaceExistingFileOptions = {},
): Promise<ReplaceExistingFileResult> {
  const internalOptions: ReplaceExistingFileWithDependenciesOptions = {
    fsOps: productionAtomicReplaceFs,
    ...(options.gitContext !== undefined
      ? { gitContext: options.gitContext }
      : {}),
  };
  return replaceExistingFileWithDependencies(
    authorization,
    prepared,
    internalOptions,
  );
}

/** Test-only export for record construction evidence. */
export {
  buildExistingFileEditRecord,
  buildKnowledgeInvalidation,
} from "./internal/record.js";

export type { EditRecordExistingFile, KnowledgeInvalidation };
