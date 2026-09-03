/**
 * Phase 3C safe single-file creation orchestration.
 *
 * Imports filesystem mutation primitives only through atomic-fs.ts.
 * Publication commit point: successful hard-link via linkNoOverwrite.
 */

import path from "node:path";

import { loadProjectConfig } from "../config/loader.js";
import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { ContentFingerprint } from "../reader/types.js";
import {
  type AtomicCreateFsOps,
  computeCreatedFileMode,
  isAtomicCreatePlatformSupported,
  PATH_CODE_CREATE_TEMP_PREFIX,
  productionAtomicCreateFs,
  type TargetFileMetadata,
  type TempCandidateHandle,
} from "./atomic-fs.js";
import { MAX_EDIT_FILE_BYTES } from "./bounds.js";
import { refuseIfTargetDenied } from "./denial.js";
import { fingerprintBytes } from "./fingerprint.js";
import { isTargetUnmergedInGitContext } from "./git-policy.js";
import { consumeEditAuthorization } from "./internal/consume-authorization.js";
import {
  buildCreationEditRecord,
  buildKnowledgeInvalidation,
} from "./internal/record.js";
import { validateLeafName } from "./leaf-name.js";
import { isMutationActionDisabledByConfig } from "./policy.js";
import type {
  ConfigFreshness,
  CreateFileFailureCode,
  CreateFileResult,
  CreateFileTerminalFailure,
  EditAuthorization,
  KnowledgeInvalidation,
  MutationTimeRefusalReason,
  PreparedCreation,
} from "./types.js";

/** Public caller options — no mechanism-substitution fields. */
export type CreateFileOptions = {
  readonly gitContext?: import("../git/types.js").GitStateBaseline;
};

/** Internal test/recovery seam — not part of the public editing barrel. */
export type CreateFileWithDependenciesOptions = {
  readonly fsOps: AtomicCreateFsOps;
  readonly gitContext?: import("../git/types.js").GitStateBaseline;
};

type NodeErrnoException = Error & { readonly code?: string };

function isNodeErrno(error: unknown): error is NodeErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
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

function terminalFailure(
  input: CreateFileTerminalFailure,
): CreateFileTerminalFailure {
  return input;
}

function buildRecord(
  prepared: PreparedCreation,
  authorizationId: string,
  outcome: CreateFileTerminalFailure["outcome"] | "SUCCESS",
  commitPointReached: boolean,
  durabilityVerified: boolean,
  observedAfterFingerprint: ContentFingerprint | null,
  observedAfterByteLength: number | null,
  gitContext: CreateFileOptions["gitContext"],
) {
  return buildCreationEditRecord({
    parent: prepared.parent,
    leafName: prepared.leafName,
    targetRelativePath: prepared.targetRelativePath,
    authorizationId,
    beforePrecondition: prepared.precondition,
    expectedAfterFingerprint: prepared.afterFingerprint,
    expectedAfterByteLength: prepared.afterByteLength,
    observedAfterFingerprint,
    observedAfterByteLength,
    outcome,
    commitPointReached,
    durabilityVerified,
    ...(gitContext !== undefined ? { gitContext } : {}),
  });
}

function preReloadRefusal(
  prepared: PreparedCreation,
  authorizationId: string,
  gitContext: CreateFileOptions["gitContext"],
  failureCode?: CreateFileFailureCode,
): CreateFileTerminalFailure {
  return terminalFailure({
    outcome: "REFUSED_PRECOMMIT",
    commitPointReached: false,
    durabilityVerified: false,
    editRecord: buildRecord(
      prepared,
      authorizationId,
      "REFUSED_PRECOMMIT",
      false,
      false,
      null,
      null,
      gitContext,
    ),
    knowledgeInvalidation: null,
    configFreshness: "SUPPLIED_ONLY",
    ...(failureCode !== undefined ? { failureCode } : {}),
  });
}

function refused(
  prepared: PreparedCreation,
  authorizationId: string,
  configFreshness: ConfigFreshness,
  gitContext: CreateFileOptions["gitContext"],
  refusalReason?: MutationTimeRefusalReason,
  failureCode?: CreateFileFailureCode,
): CreateFileTerminalFailure {
  return terminalFailure({
    outcome: "REFUSED_PRECOMMIT",
    commitPointReached: false,
    durabilityVerified: false,
    editRecord: buildRecord(
      prepared,
      authorizationId,
      "REFUSED_PRECOMMIT",
      false,
      false,
      null,
      null,
      gitContext,
    ),
    knowledgeInvalidation: null,
    configFreshness,
    ...(refusalReason !== undefined ? { refusalReason } : {}),
    ...(failureCode !== undefined ? { failureCode } : {}),
  });
}

function failedPrecommit(
  prepared: PreparedCreation,
  authorizationId: string,
  configFreshness: ConfigFreshness,
  gitContext: CreateFileOptions["gitContext"],
  failureCode?: CreateFileFailureCode,
): CreateFileTerminalFailure {
  return terminalFailure({
    outcome: "FAILED_PRECOMMIT",
    commitPointReached: false,
    durabilityVerified: false,
    editRecord: buildRecord(
      prepared,
      authorizationId,
      "FAILED_PRECOMMIT",
      false,
      false,
      null,
      null,
      gitContext,
    ),
    knowledgeInvalidation: null,
    configFreshness,
    ...(failureCode !== undefined ? { failureCode } : {}),
  });
}

function withCleanup(
  base: CreateFileTerminalFailure,
  cleanupFailure: boolean,
): CreateFileTerminalFailure {
  return cleanupFailure ? { ...base, cleanupFailure: true } : base;
}

async function cleanupTemp(
  fsOps: AtomicCreateFsOps,
  handle: TempCandidateHandle | null,
  tempPath?: string,
): Promise<boolean> {
  let cleanupFailure = false;
  if (handle !== null) {
    try {
      await fsOps.closeHandle(handle.handle);
    } catch {
      // best-effort
    }
    try {
      await fsOps.unlink(handle.tempPath);
    } catch {
      cleanupFailure = true;
    }
    return cleanupFailure;
  }
  if (tempPath !== undefined) {
    try {
      await fsOps.unlink(tempPath);
    } catch {
      cleanupFailure = true;
    }
  }
  return cleanupFailure;
}

async function resolveMutationConfig(
  prepared: PreparedCreation,
  authorizationId: string,
  gitContext: CreateFileOptions["gitContext"],
): Promise<
  Result<
    {
      readonly config: ResolvedProjectConfig;
      readonly freshness: "MUTATION_TIME_RE_RESOLVED";
    },
    CreateFileTerminalFailure
  >
> {
  const reloaded = await loadProjectConfig(prepared.workspace);
  if (reloaded.ok) {
    return success({
      config: reloaded.value,
      freshness: "MUTATION_TIME_RE_RESOLVED",
    });
  }
  return failure(
    refused(
      prepared,
      authorizationId,
      "SUPPLIED_ONLY",
      gitContext,
      "CONFIG_RELOAD_FAILED",
    ),
  );
}

async function runRestrictionRechecks(
  prepared: PreparedCreation,
  config: ResolvedProjectConfig,
  authorizationId: string,
  configFreshness: ConfigFreshness,
  gitContext: CreateFileOptions["gitContext"],
): Promise<Result<true, CreateFileTerminalFailure>> {
  const parentDenied = await refuseIfTargetDenied(
    prepared.parent.relativePath,
    prepared.workspace,
    config,
  );
  if (!parentDenied.ok) {
    return failure(
      refused(
        prepared,
        authorizationId,
        configFreshness,
        gitContext,
        "TARGET_DENIED",
        "TARGET_DENIED",
      ),
    );
  }

  const targetDenied = await refuseIfTargetDenied(
    prepared.targetRelativePath,
    prepared.workspace,
    config,
  );
  if (!targetDenied.ok) {
    return failure(
      refused(
        prepared,
        authorizationId,
        configFreshness,
        gitContext,
        "TARGET_DENIED",
        "TARGET_DENIED",
      ),
    );
  }

  if (isMutationActionDisabledByConfig(prepared.action, config)) {
    return failure(
      refused(
        prepared,
        authorizationId,
        configFreshness,
        gitContext,
        "ACTION_DISABLED",
        "ACTION_DISABLED",
      ),
    );
  }

  if (gitContext !== undefined) {
    if (
      isTargetUnmergedInGitContext(
        prepared.parent,
        prepared.targetRelativePath,
        gitContext,
      )
    ) {
      return failure(
        refused(
          prepared,
          authorizationId,
          configFreshness,
          gitContext,
          undefined,
          "GIT_UNMERGED",
        ),
      );
    }
  }

  return success(true);
}

async function proveCurrentAbsence(
  prepared: PreparedCreation,
  authorizationId: string,
  configFreshness: ConfigFreshness,
  gitContext: CreateFileOptions["gitContext"],
): Promise<Result<true, CreateFileTerminalFailure>> {
  const result = await prepared.workspace.canonicalize(
    prepared.targetRelativePath,
  );
  if (result.ok) {
    return failure(
      refused(
        prepared,
        authorizationId,
        configFreshness,
        gitContext,
        undefined,
        "TARGET_ALREADY_EXISTS",
      ),
    );
  }
  if (result.error.code === "PATH_NOT_FOUND") {
    return success(true);
  }
  return failure(
    refused(
      prepared,
      authorizationId,
      configFreshness,
      gitContext,
      undefined,
      "ABSENCE_UNVERIFIABLE",
    ),
  );
}

async function revalidateParent(
  prepared: PreparedCreation,
  fsOps: AtomicCreateFsOps,
  authorizationId: string,
  configFreshness: ConfigFreshness,
  gitContext: CreateFileOptions["gitContext"],
  expectedIdentity: TargetFileMetadata | null,
): Promise<Result<{ readonly parentPath: string; readonly metadata: TargetFileMetadata }, CreateFileTerminalFailure>> {
  const parentCanonical = await prepared.workspace.canonicalize(
    prepared.parent.relativePath,
  );
  if (!parentCanonical.ok) {
    return failure(
      refused(
        prepared,
        authorizationId,
        configFreshness,
        gitContext,
        undefined,
        "PARENT_NOT_ADMITTED",
      ),
    );
  }
  if (parentCanonical.value !== prepared.parent.canonicalPath) {
    return failure(
      refused(
        prepared,
        authorizationId,
        configFreshness,
        gitContext,
        undefined,
        "WORKSPACE_INCOMPATIBLE",
      ),
    );
  }

  let metadata: TargetFileMetadata;
  try {
    metadata = await fsOps.lstatTarget(parentCanonical.value);
  } catch {
    return failure(
      refused(
        prepared,
        authorizationId,
        configFreshness,
        gitContext,
        undefined,
        "PARENT_NOT_ADMITTED",
      ),
    );
  }

  if (metadata.isSymbolicLink || !metadata.isDirectory) {
    return failure(
      refused(
        prepared,
        authorizationId,
        configFreshness,
        gitContext,
        undefined,
        "PARENT_NOT_ADMITTED",
      ),
    );
  }

  if (
    expectedIdentity !== null &&
    !metadataIdentityEqual(expectedIdentity, metadata)
  ) {
    return failure(
      failedPrecommit(
        prepared,
        authorizationId,
        configFreshness,
        gitContext,
        "PARENT_IDENTITY_CHANGED",
      ),
    );
  }

  return success({ parentPath: parentCanonical.value, metadata });
}

async function prepareCreateCandidate(
  fsOps: AtomicCreateFsOps,
  parentDir: string,
  proposedBytes: Readonly<Uint8Array>,
  expectedAfter: ContentFingerprint,
): Promise<Result<{ handle: TempCandidateHandle; closed: boolean }, Error>> {
  let tempHandle: TempCandidateHandle | null = null;
  try {
    tempHandle = await fsOps.createTempExclusive(
      parentDir,
      PATH_CODE_CREATE_TEMP_PREFIX,
    );
    if (proposedBytes.byteLength > 0) {
      await fsOps.writeAll(tempHandle.handle, proposedBytes);
    }
    await fsOps.fsyncHandle(tempHandle.handle);

    const finalMode = computeCreatedFileMode();
    await fsOps.fchmod(tempHandle.handle, finalMode);
    await fsOps.fsyncHandle(tempHandle.handle);

    if (expectedAfter.byteLength === 0) {
      const candidateFingerprint = fingerprintBytes(new Uint8Array(0));
      if (!fingerprintsEqual(candidateFingerprint, expectedAfter)) {
        throw new Error("Candidate verification mismatch");
      }
    } else {
      const candidateBytes = await fsOps.readCandidateBytes(
        tempHandle.handle,
        expectedAfter.byteLength,
      );
      const candidateFingerprint = fingerprintBytes(candidateBytes);
      if (!fingerprintsEqual(candidateFingerprint, expectedAfter)) {
        throw new Error("Candidate verification mismatch");
      }
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

/**
 * Internal orchestration with injectable filesystem ops (tests/recovery only).
 * Not exported from the public editing barrel.
 */
export async function createFileWithDependencies(
  authorization: EditAuthorization,
  prepared: PreparedCreation,
  options: CreateFileWithDependenciesOptions,
): Promise<CreateFileResult> {
  const fsOps = options.fsOps;
  const gitContext = options.gitContext;

  if (prepared.action !== "CREATE_FILE") {
    return preReloadRefusal(prepared, authorization.authorizationId, gitContext);
  }

  const consumed = consumeEditAuthorization(authorization, prepared);
  if (!consumed.ok) {
    return preReloadRefusal(
      prepared,
      authorization.authorizationId,
      gitContext,
      "AUTHORIZATION_ALREADY_CONSUMED",
    );
  }

  const authorizationId = authorization.authorizationId;
  const operationIdentity = Object.freeze({
    kind: "CREATE_FILE_OPERATION" as const,
  });

  if (prepared.afterByteLength > MAX_EDIT_FILE_BYTES) {
    return preReloadRefusal(prepared, authorizationId, gitContext, "BOUNDS_EXCEEDED");
  }

  const leaf = validateLeafName(prepared.leafName);
  if (!leaf.ok) {
    return preReloadRefusal(prepared, authorizationId, gitContext, "INVALID_LEAF_NAME");
  }

  if (!isAtomicCreatePlatformSupported()) {
    return preReloadRefusal(
      prepared,
      authorizationId,
      gitContext,
      "UNSUPPORTED_ATOMIC_CREATE_PLATFORM",
    );
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

  const parentResult = await revalidateParent(
    prepared,
    fsOps,
    authorizationId,
    configFreshness,
    gitContext,
    null,
  );
  if (!parentResult.ok) {
    return parentResult.error;
  }
  const capturedParentIdentity = parentResult.value.metadata;
  const parentDir = parentResult.value.parentPath;
  const targetPath = path.join(parentDir, prepared.leafName);

  const absence = await proveCurrentAbsence(
    prepared,
    authorizationId,
    configFreshness,
    gitContext,
  );
  if (!absence.ok) {
    return absence.error;
  }

  const tempPrepared = await prepareCreateCandidate(
    fsOps,
    parentDir,
    prepared.proposedBytes,
    prepared.afterFingerprint,
  );
  if (!tempPrepared.ok) {
    return failedPrecommit(
      prepared,
      authorizationId,
      configFreshness,
      gitContext,
      "TEMP_CREATE_FAILED",
    );
  }
  const tempHandle = tempPrepared.value.handle;
  const tempPath = tempHandle.tempPath;

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

  const finalParent = await revalidateParent(
    prepared,
    fsOps,
    authorizationId,
    configFreshness,
    gitContext,
    capturedParentIdentity,
  );
  if (!finalParent.ok) {
    const cleanupFailure = await cleanupTemp(fsOps, tempHandle);
    return withCleanup(finalParent.error, cleanupFailure);
  }

  const finalAbsence = await proveCurrentAbsence(
    prepared,
    authorizationId,
    configFreshness,
    gitContext,
  );
  if (!finalAbsence.ok) {
    const cleanupFailure = await cleanupTemp(fsOps, tempHandle);
    return withCleanup(finalAbsence.error, cleanupFailure);
  }

  let publishedVerificationTarget: Awaited<
    ReturnType<AtomicCreateFsOps["linkNoOverwrite"]>
  >;
  try {
    publishedVerificationTarget = await fsOps.linkNoOverwrite(
      tempPath,
      targetPath,
      operationIdentity,
    );
  } catch (error) {
    const cleanupFailure = await cleanupTemp(fsOps, null, tempPath);
    if (isNodeErrno(error) && error.code === "EEXIST") {
      return withCleanup(
        refused(
          prepared,
          authorizationId,
          configFreshness,
          gitContext,
          undefined,
          "TARGET_ALREADY_EXISTS",
        ),
        cleanupFailure,
      );
    }
    return withCleanup(
      failedPrecommit(
        prepared,
        authorizationId,
        configFreshness,
        gitContext,
        "LINK_FAILED",
      ),
      cleanupFailure,
    );
  }

  // COMMIT POINT REACHED — target is published.
  let cleanupFailure = false;
  try {
    await fsOps.unlink(tempPath);
  } catch {
    cleanupFailure = true;
  }

  let durabilityVerified = true;
  try {
    await fsOps.fsyncDirectory(parentDir);
  } catch {
    durabilityVerified = false;
  }

  let observedAfterFingerprint: ContentFingerprint | null = null;
  let observedAfterByteLength: number | null = null;
  let afterStateOk = false;
  try {
    const evidence = await fsOps.verifyPublishedCreation(
      publishedVerificationTarget,
      operationIdentity,
    );
    observedAfterFingerprint = {
      algorithm: "sha256",
      hex: evidence.observedHex,
      byteLength: evidence.observedByteLength,
    };
    observedAfterByteLength = evidence.observedByteLength;
    afterStateOk = fingerprintsEqual(
      observedAfterFingerprint,
      prepared.afterFingerprint,
    );
  } catch {
    afterStateOk = false;
  }

  const invalidation = buildKnowledgeInvalidation({
    targetRelativePath: prepared.targetRelativePath,
    editRecordKind: "CREATION",
  });

  if (cleanupFailure || !durabilityVerified || !afterStateOk) {
    return withCleanup(
      terminalFailure({
        outcome: "COMMITTED_FAILURE",
        commitPointReached: true,
        durabilityVerified,
        editRecord: buildRecord(
          prepared,
          authorizationId,
          "COMMITTED_FAILURE",
          true,
          durabilityVerified,
          observedAfterFingerprint,
          observedAfterByteLength,
          gitContext,
        ),
        knowledgeInvalidation: invalidation,
        configFreshness,
        failureCode: !afterStateOk
          ? observedAfterFingerprint === null
            ? "AFTER_STATE_READ_FAILED"
            : "AFTER_STATE_MISMATCH"
          : cleanupFailure
            ? "LINK_FAILED"
            : "DIRECTORY_FSYNC_FAILED",
      }),
      cleanupFailure,
    );
  }

  return {
    outcome: "SUCCESS",
    commitPointReached: true,
    durabilityVerified: true,
    editRecord: buildRecord(
      prepared,
      authorizationId,
      "SUCCESS",
      true,
      true,
      observedAfterFingerprint,
      observedAfterByteLength,
      gitContext,
    ),
    knowledgeInvalidation: invalidation,
    configFreshness: "MUTATION_TIME_RE_RESOLVED",
  };
}

/**
 * Public file creation — always binds productionAtomicCreateFs.
 * Constructs a fresh internal options object from gitContext only; unknown
 * caller fields (including fsOps via JS widening) are ignored.
 */
export async function createFile(
  authorization: EditAuthorization,
  prepared: PreparedCreation,
  options: CreateFileOptions = {},
): Promise<CreateFileResult> {
  const internalOptions: CreateFileWithDependenciesOptions = {
    fsOps: productionAtomicCreateFs,
    ...(options.gitContext !== undefined
      ? { gitContext: options.gitContext }
      : {}),
  };
  return createFileWithDependencies(authorization, prepared, internalOptions);
}

export { buildCreationEditRecord, buildKnowledgeInvalidation };
export type { KnowledgeInvalidation };
