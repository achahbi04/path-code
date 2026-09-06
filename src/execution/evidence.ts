/**
 * Assemble LocalProcessResult from host observation + binding identities.
 */

import { nextResultId } from "./internal/registry.js";
import type { ProcessHostObservation } from "./internal/process-host.js";
import type {
  ExecutableIdentity,
  LocalProcessResult,
} from "./types.js";

export function issueLocalProcessResult(input: {
  readonly preparedId: string;
  readonly authorizationId: string;
  readonly workspaceRoot: string;
  readonly executable: string;
  readonly executableIdentity: ExecutableIdentity | null;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly envPolicyId: string;
  readonly observation: ProcessHostObservation;
}): LocalProcessResult {
  const result = Object.freeze({
    resultId: nextResultId(),
    outcome: input.observation.outcome,
    preparedId: input.preparedId,
    authorizationId: input.authorizationId,
    workspaceRoot: input.workspaceRoot,
    executable: input.executable,
    executableIdentity: input.executableIdentity,
    argv: Object.freeze([...input.argv]),
    cwd: input.cwd,
    envPolicyId: input.envPolicyId,
    startedAtMs: input.observation.startedAtMs,
    finishedAtMs: input.observation.finishedAtMs,
    durationMs: input.observation.durationMs,
    pid: input.observation.pid,
    exitCode: input.observation.exitCode,
    signal: input.observation.signal,
    timedOut: input.observation.timedOut,
    overflow: input.observation.overflow,
    terminationRequested: input.observation.terminationRequested,
    terminationObserved: input.observation.terminationObserved,
    stdout: Object.freeze({ ...input.observation.stdout }),
    stderr: Object.freeze({ ...input.observation.stderr }),
    spawnError: input.observation.spawnError,
    cleanup: Object.freeze({
      ...input.observation.cleanup,
      signalsAttempted: Object.freeze([
        ...input.observation.cleanup.signalsAttempted,
      ]),
    }),
  });
  return result as unknown as LocalProcessResult;
}
