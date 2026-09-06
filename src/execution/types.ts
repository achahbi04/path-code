/**
 * Phase 4 local-process execution types — internal Path Code surface.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";

export type ExplicitLocalProcessApproval = {
  readonly kind: "EXPLICIT_LOCAL_PROCESS_APPROVAL";
};

export type LocalProcessRequest = {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
};

export type ExecutableIdentity = {
  readonly absolutePath: string;
  readonly isFile: boolean;
  readonly mode: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly dev: string;
  readonly ino: string;
};

export type PreparedLocalProcessData = {
  readonly preparedId: string;
  readonly executable: string;
  readonly executableIdentity: ExecutableIdentity;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly workspaceRoot: string;
  readonly workspace: WorkspaceBoundary;
  readonly envSnapshot: Readonly<Record<string, string>>;
  readonly envPolicyId: string;
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
  readonly platformPolicyId: string;
  readonly config: ResolvedProjectConfig;
  readonly preparedAtMs: number;
};

declare const preparedLocalProcessBrand: unique symbol;

export type PreparedLocalProcess = PreparedLocalProcessData & {
  readonly [preparedLocalProcessBrand]: true;
};

declare const localProcessAuthorizationBrand: unique symbol;

export type LocalProcessAuthorization = {
  readonly [localProcessAuthorizationBrand]: true;
  readonly authorizationId: string;
  readonly preparedRef: PreparedLocalProcess;
  readonly issuedAtMs: number;
};

declare const localProcessCommitGrantBrand: unique symbol;

/** Internal one-shot handoff — not public authority. */
export type LocalProcessCommitGrant = {
  readonly [localProcessCommitGrantBrand]: true;
  readonly authorization: LocalProcessAuthorization;
  readonly preparedRef: PreparedLocalProcess;
};

export type LocalProcessPreparationFailureCode =
  | "UNSUPPORTED_EXECUTION_PLATFORM"
  | "EXECUTABLE_NOT_ABSOLUTE"
  | "EXECUTABLE_NOT_FOUND"
  | "EXECUTABLE_NOT_REGULAR_FILE"
  | "EXECUTABLE_NOT_EXECUTABLE"
  | "ARGV_COUNT_EXCEEDED"
  | "ARGV_BYTES_EXCEEDED"
  | "ARGV_NUL_REJECTED"
  | "ENV_BYTES_EXCEEDED"
  | "ENV_NUL_REJECTED"
  | "TIMEOUT_OUT_OF_RANGE"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "CWD_OUTSIDE_WORKSPACE"
  | "CWD_INVALID"
  | "ACTION_DISABLED"
  | "BOUNDS_EXCEEDED";

export type LocalProcessPreparationFailure = {
  readonly code: LocalProcessPreparationFailureCode;
  readonly message: string;
};

export type LocalProcessAuthorizationFailureCode =
  | "APPROVAL_REQUIRED"
  | "ACTION_DISABLED"
  | "PREPARED_IDENTITY_MISMATCH"
  | "AUTHORIZATION_ALREADY_CONSUMED"
  | "AUTHORIZATION_NOT_REGISTERED"
  | "UNSUPPORTED_EXECUTION_PLATFORM";

export type LocalProcessAuthorizationFailure = {
  readonly code: LocalProcessAuthorizationFailureCode;
  readonly message: string;
};

export type LocalProcessExecutionFailureCode =
  | LocalProcessAuthorizationFailureCode
  | LocalProcessPreparationFailureCode
  | "PREPARED_IDENTITY_MISMATCH"
  | "ACTION_DISABLED"
  | "CONFIG_UNREADABLE"
  | "CWD_CHANGED"
  | "CWD_OUTSIDE_WORKSPACE"
  | "EXECUTABLE_CHANGED"
  | "EXECUTABLE_NOT_FOUND"
  | "EXECUTABLE_NOT_REGULAR_FILE"
  | "EXECUTABLE_NOT_EXECUTABLE"
  | "UNSUPPORTED_EXECUTION_PLATFORM"
  | "REFUSED_BEFORE_SPAWN";

export type LocalProcessExecutionFailure = {
  readonly code: LocalProcessExecutionFailureCode;
  readonly message: string;
  readonly preparedId?: string;
  readonly authorizationId?: string;
  readonly authorizationConsumed?: boolean;
};

export type LocalProcessOutcome =
  | "EXITED"
  | "SIGNALED"
  | "TIMED_OUT"
  | "OUTPUT_OVERFLOW"
  | "SPAWN_FAILED"
  | "TERMINATION_NOT_CONFIRMED";

export type LocalProcessCleanupResult = {
  readonly terminationRequested: boolean;
  readonly terminationObserved: boolean;
  readonly terminationNotConfirmed: boolean;
  readonly descendantMayRemainAlive: boolean;
  readonly signalsAttempted: readonly string[];
};

export type LocalProcessStreamCapture = {
  readonly capturedBytes: number;
  readonly truncated: boolean;
  readonly discardedAfterLimitBytes: number;
  readonly complete: boolean;
  readonly streamError: string | null;
  readonly text: string;
};

declare const localProcessResultBrand: unique symbol;

/**
 * Truthful process observation. Exit 0 is process evidence only —
 * not semantic engineering success.
 */
export type LocalProcessResult = {
  readonly [localProcessResultBrand]: true;
  /** Stable identity for future run-manifest / Reasoning Ledger citation. */
  readonly resultId: string;
  readonly outcome: LocalProcessOutcome;
  readonly preparedId: string;
  readonly authorizationId: string;
  readonly workspaceRoot: string;
  readonly executable: string;
  readonly executableIdentity: ExecutableIdentity | null;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly envPolicyId: string;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly durationMs: number;
  readonly pid: number | null;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly overflow: boolean;
  readonly terminationRequested: boolean;
  readonly terminationObserved: boolean;
  readonly stdout: LocalProcessStreamCapture;
  readonly stderr: LocalProcessStreamCapture;
  readonly spawnError: string | null;
  readonly cleanup: LocalProcessCleanupResult;
};
