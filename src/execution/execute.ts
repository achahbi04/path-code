/**
 * Execute an authorized local process — consumes authorization before spawn.
 */

import { loadProjectConfig } from "../config/loader.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { issueLocalProcessResult } from "./evidence.js";
import { consumeLocalProcessAuthorization } from "./internal/consume-authorization.js";
import { getBoundProcessObservationRunner } from "./internal/observation-runner.js";
import { runDetachedProcess } from "./internal/process-host.js";
import {
  identitiesMatch,
  isLocalProcessPlatformSupported,
  observeExecutableIdentity,
} from "./preparation.js";
import { isExecuteProcessDisabled } from "./policy.js";
import type {
  LocalProcessAuthorization,
  LocalProcessExecutionFailure,
  LocalProcessResult,
  PreparedLocalProcess,
} from "./types.js";

function execFailure(
  code: LocalProcessExecutionFailure["code"],
  message: string,
  extras?: Partial<LocalProcessExecutionFailure>,
): LocalProcessExecutionFailure {
  return { code, message, ...extras };
}

export async function executeAuthorizedLocalProcess(
  prepared: PreparedLocalProcess,
  authorization: LocalProcessAuthorization,
): Promise<Result<LocalProcessResult, LocalProcessExecutionFailure>> {
  const consumed = consumeLocalProcessAuthorization(authorization, prepared);
  if (!consumed.ok) {
    return failure(
      execFailure(consumed.error.code, consumed.error.message, {
        preparedId: prepared.preparedId,
        authorizationConsumed: false,
      }),
    );
  }

  const authId = authorization.authorizationId;
  const refusalExtras = {
    preparedId: prepared.preparedId,
    authorizationId: authId,
    authorizationConsumed: true,
  } as const;

  if (!isLocalProcessPlatformSupported()) {
    return failure(
      execFailure(
        "UNSUPPORTED_EXECUTION_PLATFORM",
        "Local process execution V1 supports macOS and Linux only",
        refusalExtras,
      ),
    );
  }

  const reloaded = await loadProjectConfig(prepared.workspace);
  if (!reloaded.ok) {
    return failure(
      execFailure(
        "CONFIG_UNREADABLE",
        reloaded.error.message,
        refusalExtras,
      ),
    );
  }
  if (isExecuteProcessDisabled(reloaded.value)) {
    return failure(
      execFailure(
        "ACTION_DISABLED",
        "EXECUTE_PROCESS is disabled by current project configuration",
        refusalExtras,
      ),
    );
  }

  const cwdNow = await prepared.workspace.canonicalize(prepared.cwd);
  if (!cwdNow.ok) {
    return failure(
      execFailure(
        cwdNow.error.code === "PATH_OUTSIDE_WORKSPACE"
          ? "CWD_OUTSIDE_WORKSPACE"
          : "CWD_CHANGED",
        cwdNow.error.message,
        refusalExtras,
      ),
    );
  }
  if (cwdNow.value !== prepared.cwd) {
    return failure(
      execFailure(
        "CWD_CHANGED",
        "cwd physical identity changed before spawn",
        refusalExtras,
      ),
    );
  }

  const exeNow = await observeExecutableIdentity(prepared.executable);
  if (!exeNow.ok) {
    return failure(
      execFailure(exeNow.error.code, exeNow.error.message, refusalExtras),
    );
  }
  if (!identitiesMatch(prepared.executableIdentity, exeNow.value)) {
    return failure(
      execFailure(
        "EXECUTABLE_CHANGED",
        "executable identity changed before spawn",
        refusalExtras,
      ),
    );
  }

  const processRequest = {
    executable: prepared.executable,
    argv: prepared.argv,
    cwd: prepared.cwd,
    env: prepared.envSnapshot,
    timeoutMs: prepared.timeoutMs,
    maxStdoutBytes: prepared.maxStdoutBytes,
    maxStderrBytes: prepared.maxStderrBytes,
  };
  const boundRunner = getBoundProcessObservationRunner();
  const observation = await (boundRunner !== null
    ? boundRunner(processRequest)
    : runDetachedProcess(processRequest));

  return success(
    issueLocalProcessResult({
      preparedId: prepared.preparedId,
      authorizationId: authId,
      workspaceRoot: prepared.workspaceRoot,
      executable: prepared.executable,
      executableIdentity: exeNow.value,
      argv: prepared.argv,
      cwd: prepared.cwd,
      envPolicyId: prepared.envPolicyId,
      observation,
    }),
  );
}
