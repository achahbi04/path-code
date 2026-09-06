/**
 * Prepare a local process request — no spawn.
 */

import path from "node:path";
import { stat } from "node:fs/promises";

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import {
  DEFAULT_LOCAL_PROCESS_TIMEOUT_MS,
  LOCAL_PROCESS_PLATFORM_POLICY_ID,
  MAX_LOCAL_PROCESS_ARGV_COUNT,
  MAX_LOCAL_PROCESS_ARGV_TOTAL_BYTES,
  MAX_LOCAL_PROCESS_STDERR_BYTES,
  MAX_LOCAL_PROCESS_STDOUT_BYTES,
  MAX_LOCAL_PROCESS_TIMEOUT_MS,
} from "./bounds.js";
import { buildLocalProcessEnvironment } from "./environment.js";
import { nextPreparedId } from "./internal/registry.js";
import { isExecuteProcessDisabled } from "./policy.js";
import type {
  ExecutableIdentity,
  LocalProcessPreparationFailure,
  LocalProcessRequest,
  PreparedLocalProcess,
} from "./types.js";

function prepFailure(
  code: LocalProcessPreparationFailure["code"],
  message: string,
): LocalProcessPreparationFailure {
  return { code, message };
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function isLocalProcessPlatformSupported(
  nodePlatform: NodeJS.Platform = process.platform,
): boolean {
  return nodePlatform === "darwin" || nodePlatform === "linux";
}

export async function observeExecutableIdentity(
  absolutePath: string,
): Promise<Result<ExecutableIdentity, LocalProcessPreparationFailure>> {
  try {
    const st = await stat(absolutePath);
    if (!st.isFile()) {
      return failure(
        prepFailure(
          "EXECUTABLE_NOT_REGULAR_FILE",
          "Executable path is not a regular file",
        ),
      );
    }
    const mode = st.mode;
    const executableBit = (mode & 0o111) !== 0;
    if (!executableBit) {
      return failure(
        prepFailure(
          "EXECUTABLE_NOT_EXECUTABLE",
          "Executable path lacks execute permission",
        ),
      );
    }
    return success({
      absolutePath,
      isFile: true,
      mode,
      size: st.size,
      mtimeMs: st.mtimeMs,
      dev: String(st.dev),
      ino: String(st.ino),
    });
  } catch (error: unknown) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
        ? "EXECUTABLE_NOT_FOUND"
        : "EXECUTABLE_NOT_FOUND";
    return failure(
      prepFailure(
        code,
        error instanceof Error ? error.message : "Executable observation failed",
      ),
    );
  }
}

export function identitiesMatch(
  expected: ExecutableIdentity,
  observed: ExecutableIdentity,
): boolean {
  return (
    expected.absolutePath === observed.absolutePath &&
    expected.dev === observed.dev &&
    expected.ino === observed.ino &&
    expected.size === observed.size &&
    expected.mode === observed.mode
  );
}

export async function prepareLocalProcess(
  request: LocalProcessRequest,
  workspace: WorkspaceBoundary,
  resolvedConfig: ResolvedProjectConfig,
): Promise<Result<PreparedLocalProcess, LocalProcessPreparationFailure>> {
  if (!isLocalProcessPlatformSupported()) {
    return failure(
      prepFailure(
        "UNSUPPORTED_EXECUTION_PLATFORM",
        "Local process execution V1 supports macOS and Linux only",
      ),
    );
  }

  if (isExecuteProcessDisabled(resolvedConfig)) {
    return failure(
      prepFailure(
        "ACTION_DISABLED",
        "EXECUTE_PROCESS is disabled by project configuration",
      ),
    );
  }

  if (typeof request.executable !== "string" || !path.isAbsolute(request.executable)) {
    return failure(
      prepFailure(
        "EXECUTABLE_NOT_ABSOLUTE",
        "Executable must be an absolute path (PATH lookup is not permitted)",
      ),
    );
  }
  if (request.executable.includes("\0")) {
    return failure(
      prepFailure("ARGV_NUL_REJECTED", "Executable path must not contain NUL"),
    );
  }

  if (!Array.isArray(request.argv)) {
    return failure(prepFailure("BOUNDS_EXCEEDED", "argv must be an array"));
  }
  if (request.argv.length > MAX_LOCAL_PROCESS_ARGV_COUNT) {
    return failure(
      prepFailure(
        "ARGV_COUNT_EXCEEDED",
        `argv count exceeds ${MAX_LOCAL_PROCESS_ARGV_COUNT}`,
      ),
    );
  }
  let argvBytes = 0;
  for (const arg of request.argv) {
    if (typeof arg !== "string") {
      return failure(prepFailure("BOUNDS_EXCEEDED", "argv elements must be strings"));
    }
    if (arg.includes("\0")) {
      return failure(
        prepFailure("ARGV_NUL_REJECTED", "argv elements must not contain NUL"),
      );
    }
    argvBytes += utf8Bytes(arg);
    if (argvBytes > MAX_LOCAL_PROCESS_ARGV_TOTAL_BYTES) {
      return failure(
        prepFailure(
          "ARGV_BYTES_EXCEEDED",
          `argv exceeds ${MAX_LOCAL_PROCESS_ARGV_TOTAL_BYTES} bytes`,
        ),
      );
    }
  }

  const timeoutMs =
    request.timeoutMs === undefined
      ? DEFAULT_LOCAL_PROCESS_TIMEOUT_MS
      : request.timeoutMs;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_LOCAL_PROCESS_TIMEOUT_MS
  ) {
    return failure(
      prepFailure(
        "TIMEOUT_OUT_OF_RANGE",
        `timeoutMs must be an integer in 1..${MAX_LOCAL_PROCESS_TIMEOUT_MS}`,
      ),
    );
  }

  const maxStdoutBytes =
    request.maxStdoutBytes === undefined
      ? MAX_LOCAL_PROCESS_STDOUT_BYTES
      : request.maxStdoutBytes;
  const maxStderrBytes =
    request.maxStderrBytes === undefined
      ? MAX_LOCAL_PROCESS_STDERR_BYTES
      : request.maxStderrBytes;
  if (
    !Number.isInteger(maxStdoutBytes) ||
    maxStdoutBytes < 1 ||
    maxStdoutBytes > MAX_LOCAL_PROCESS_STDOUT_BYTES ||
    !Number.isInteger(maxStderrBytes) ||
    maxStderrBytes < 1 ||
    maxStderrBytes > MAX_LOCAL_PROCESS_STDERR_BYTES
  ) {
    return failure(
      prepFailure(
        "OUTPUT_LIMIT_EXCEEDED",
        "Output limits must be integers within configured maxima",
      ),
    );
  }

  const rootResult = await workspace.canonicalize(".");
  if (!rootResult.ok) {
    return failure(
      prepFailure("CWD_INVALID", "Failed to obtain workspace root"),
    );
  }

  const cwdResult = await workspace.canonicalize(request.cwd);
  if (!cwdResult.ok) {
    if (cwdResult.error.code === "PATH_OUTSIDE_WORKSPACE") {
      return failure(
        prepFailure(
          "CWD_OUTSIDE_WORKSPACE",
          "cwd is outside the authorized workspace",
        ),
      );
    }
    return failure(
      prepFailure("CWD_INVALID", cwdResult.error.message),
    );
  }

  const identity = await observeExecutableIdentity(request.executable);
  if (!identity.ok) {
    return identity;
  }

  const envBuilt = buildLocalProcessEnvironment(request.env);
  if (!envBuilt.ok) {
    return failure(prepFailure(envBuilt.error.code, envBuilt.error.message));
  }

  const prepared = Object.freeze({
    preparedId: nextPreparedId(),
    executable: request.executable,
    executableIdentity: identity.value,
    argv: Object.freeze([...request.argv]),
    cwd: cwdResult.value,
    workspaceRoot: rootResult.value,
    workspace,
    envSnapshot: envBuilt.value.snapshot,
    envPolicyId: envBuilt.value.envPolicyId,
    timeoutMs,
    maxStdoutBytes,
    maxStderrBytes,
    platformPolicyId: LOCAL_PROCESS_PLATFORM_POLICY_ID,
    config: resolvedConfig,
    preparedAtMs: Date.now(),
  });

  return success(prepared as unknown as PreparedLocalProcess);
}
