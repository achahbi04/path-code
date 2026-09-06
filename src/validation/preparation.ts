/**
 * Prepare an immutable validation plan — no process spawn beyond prepareLocalProcess.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import {
  MAX_LOCAL_PROCESS_STDERR_BYTES,
  MAX_LOCAL_PROCESS_STDOUT_BYTES,
  MAX_LOCAL_PROCESS_TIMEOUT_MS,
  prepareLocalProcess,
} from "../execution/index.js";
import type { LocalProcessRequest } from "../execution/types.js";
import {
  DEFAULT_VALIDATION_CAPTURE_BYTES,
  MAX_VALIDATION_CHECKS,
  MAX_VALIDATION_PLAN_CAPTURE_BYTES,
  MAX_VALIDATION_PLAN_TIMEOUT_SUM_MS,
  VALIDATION_CRITERION_ID,
  VALIDATION_SCOPE_ID,
} from "./bounds.js";
import {
  nextPlanId,
  registerPreparedValidationPlan,
} from "./internal/registry.js";
import { isValidationExecutionDisabled } from "./policy.js";
import { declaredEntriesFromObservations } from "./subject.js";
import type {
  PreparedValidationCheck,
  PreparedValidationPlan,
  ValidationCheckKind,
  ValidationCheckSpec,
  ValidationPreparationFailure,
  ValidationSubjectInput,
} from "./types.js";

const KINDS: ReadonlySet<ValidationCheckKind> = new Set([
  "TYPECHECK",
  "LINT",
  "BUILD",
  "TARGETED_TEST",
]);

function prepFailure(
  code: ValidationPreparationFailure["code"],
  message: string,
): ValidationPreparationFailure {
  return { code, message };
}

function withDefaultCapture(request: LocalProcessRequest): LocalProcessRequest {
  const next: {
    executable: string;
    argv: string[];
    cwd: string;
    timeoutMs?: number;
    maxStdoutBytes: number;
    maxStderrBytes: number;
    env?: Readonly<Record<string, string>>;
  } = {
    executable: request.executable,
    argv: [...request.argv],
    cwd: request.cwd,
    maxStdoutBytes: request.maxStdoutBytes ?? DEFAULT_VALIDATION_CAPTURE_BYTES,
    maxStderrBytes: request.maxStderrBytes ?? DEFAULT_VALIDATION_CAPTURE_BYTES,
  };
  if (request.timeoutMs !== undefined) {
    next.timeoutMs = request.timeoutMs;
  }
  if (request.env !== undefined) {
    next.env = { ...request.env };
  }
  return next;
}

export async function prepareValidationPlan(
  checks: readonly ValidationCheckSpec[],
  subject: ValidationSubjectInput,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): Promise<Result<PreparedValidationPlan, ValidationPreparationFailure>> {
  if (checks.length === 0) {
    return failure(prepFailure("EMPTY_PLAN", "Validation plan requires at least one check"));
  }
  if (checks.length > MAX_VALIDATION_CHECKS) {
    return failure(
      prepFailure(
        "TOO_MANY_CHECKS",
        `Validation plan exceeds ${MAX_VALIDATION_CHECKS} checks`,
      ),
    );
  }

  const ids = new Set<string>();
  for (const check of checks) {
    if (typeof check.id !== "string" || check.id.trim().length === 0) {
      return failure(prepFailure("INVALID_CHECK_ID", "Check id must be nonempty"));
    }
    if (ids.has(check.id)) {
      return failure(prepFailure("DUPLICATE_CHECK_ID", `Duplicate check id ${check.id}`));
    }
    ids.add(check.id);
    if (!KINDS.has(check.kind)) {
      return failure(prepFailure("INVALID_KIND", `Unsupported check kind ${String(check.kind)}`));
    }
    if (isValidationExecutionDisabled(check.kind, config)) {
      return failure(
        prepFailure(
          "ACTION_DISABLED",
          `Check ${check.id} kind ${check.kind} or EXECUTE_PROCESS is disabled`,
        ),
      );
    }
  }

  if (subject.declaredObservations.length === 0) {
    return failure(prepFailure("EMPTY_SUBJECT", "Declared observations must be nonempty"));
  }

  if (subject.snapshot.workspace !== workspace || subject.snapshot.config !== config) {
    return failure(
      prepFailure(
        "SUBJECT_INCOMPATIBLE",
        "Snapshot workspace/config must match the validation call",
      ),
    );
  }

  for (const observation of subject.declaredObservations) {
    const bound = subject.snapshot.contentObservationByEntry.get(observation.entry);
    if (bound !== observation) {
      return failure(
        prepFailure(
          "OBSERVATION_NOT_IN_SNAPSHOT",
          "Declared ContentObservation is not bound in the snapshot",
        ),
      );
    }
  }

  let timeoutSum = 0;
  let captureSum = 0;
  const preparedChecks: PreparedValidationCheck[] = [];

  for (const check of checks) {
    const request = withDefaultCapture(check.request);
    const stdoutCap = request.maxStdoutBytes ?? DEFAULT_VALIDATION_CAPTURE_BYTES;
    const stderrCap = request.maxStderrBytes ?? DEFAULT_VALIDATION_CAPTURE_BYTES;
    if (
      !Number.isInteger(stdoutCap) ||
      !Number.isInteger(stderrCap) ||
      stdoutCap < 1 ||
      stderrCap < 1 ||
      stdoutCap > MAX_LOCAL_PROCESS_STDOUT_BYTES ||
      stderrCap > MAX_LOCAL_PROCESS_STDERR_BYTES
    ) {
      return failure(
        prepFailure("LIMITS_INVALID", `Invalid capture limits for check ${check.id}`),
      );
    }
    captureSum += stdoutCap + stderrCap;
    if (captureSum > MAX_VALIDATION_PLAN_CAPTURE_BYTES) {
      return failure(
        prepFailure(
          "CAPTURE_AGGREGATE_EXCEEDED",
          "Aggregate plan capture caps exceed 32 MiB",
        ),
      );
    }

    const timeoutMs = request.timeoutMs ?? 120_000;
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > MAX_LOCAL_PROCESS_TIMEOUT_MS
    ) {
      return failure(
        prepFailure("LIMITS_INVALID", `Invalid timeout for check ${check.id}`),
      );
    }
    timeoutSum += timeoutMs;
    if (timeoutSum > MAX_VALIDATION_PLAN_TIMEOUT_SUM_MS) {
      return failure(
        prepFailure(
          "TIMEOUT_SUM_EXCEEDED",
          "Sum of configured process timeouts exceeds 30 minutes",
        ),
      );
    }

    const preparedProcess = await prepareLocalProcess(request, workspace, config);
    if (!preparedProcess.ok) {
      return failure(
        prepFailure(
          "PROCESS_PREPARE_FAILED",
          `Check ${check.id}: ${preparedProcess.error.message}`,
        ),
      );
    }
    preparedChecks.push(
      Object.freeze({
        id: check.id,
        kind: check.kind,
        preparedProcess: preparedProcess.value,
      }),
    );
  }

  const root = await workspace.canonicalize(".");
  if (!root.ok) {
    return failure(prepFailure("WORKSPACE_INVALID", root.error.message));
  }

  const plan = Object.freeze({
    planId: nextPlanId(),
    checks: Object.freeze([...preparedChecks]),
    workspace,
    workspaceRoot: root.value,
    config,
    snapshot: subject.snapshot,
    declaredEntries: Object.freeze([
      ...declaredEntriesFromObservations(subject.declaredObservations),
    ]),
    declaredObservations: Object.freeze([...subject.declaredObservations]),
    criterionId: VALIDATION_CRITERION_ID,
    scopeId: VALIDATION_SCOPE_ID,
    preparedAtMs: Date.now(),
  }) as unknown as PreparedValidationPlan;

  registerPreparedValidationPlan(plan);
  return success(plan);
}
