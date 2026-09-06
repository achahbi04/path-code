/**
 * Pure classifier: LocalProcessResult → validation check verdict.
 * Does not spawn. Synthetic cases are for classifier tests only.
 */

import type { LocalProcessResult } from "../execution/types.js";
import type { ValidationCheckVerdict } from "./types.js";

/**
 * EXIT_CODE_ZERO_WITH_COMPLETE_EXECUTION_EVIDENCE.
 * Does not parse stdout for PASS. Timeout/overflow/incomplete never PASS.
 */
export function classifyLocalProcessForValidation(
  result: LocalProcessResult,
): ValidationCheckVerdict {
  if (result.spawnError !== null) {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.timedOut || result.overflow) {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.outcome === "TIMED_OUT" || result.outcome === "OUTPUT_OVERFLOW") {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.outcome === "SPAWN_FAILED") {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.outcome === "TERMINATION_NOT_CONFIRMED") {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.cleanup.terminationNotConfirmed) {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.terminationRequested && !result.terminationObserved) {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (!result.stdout.complete || !result.stderr.complete) {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.stdout.truncated || result.stderr.truncated) {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.stdout.streamError !== null || result.stderr.streamError !== null) {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.outcome === "SIGNALED") {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.outcome !== "EXITED") {
    return "EXECUTION_INCONCLUSIVE";
  }
  if (result.exitCode === 0) {
    return "PASS";
  }
  return "FAIL";
}
