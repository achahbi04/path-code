/**
 * Pure MultiFilePlan construction — no filesystem, config, or auth consumption.
 */

import { failure, success } from "../domain/result.js";
import {
  MAX_EDIT_FILE_BYTES,
  MAX_FILES_PER_EDIT_OPERATION,
  MAX_TOTAL_PROPOSED_AFTER_BYTES,
} from "./bounds.js";
import type {
  CreateMultiFilePlanResult,
  MultiFilePlan,
  MultiFilePlanBuildFailure,
  MultiFilePlanEntry,
} from "./multi-file-types.js";

let planCounter = 0;

function nextPlanId(): string {
  planCounter += 1;
  return `plan-${planCounter}`;
}

function buildFailure(
  code: MultiFilePlanBuildFailure["code"],
  message: string,
): MultiFilePlanBuildFailure {
  return { code, message };
}

function brandPlan(data: {
  readonly planId: string;
  readonly entries: readonly MultiFilePlanEntry[];
  readonly workspace: MultiFilePlan["workspace"];
}): MultiFilePlan {
  return Object.freeze({
    ...data,
    maxFiles: MAX_FILES_PER_EDIT_OPERATION,
    maxTotalProposedAfterBytes: MAX_TOTAL_PROPOSED_AFTER_BYTES,
    maxEditFileBytes: MAX_EDIT_FILE_BYTES,
  }) as MultiFilePlan;
}

/**
 * Admit an opaque immutable multi-file plan.
 * Count must be 2–16 inclusive. Copies the entry sequence.
 */
export function createMultiFilePlan(
  entries: readonly MultiFilePlanEntry[],
): CreateMultiFilePlanResult {
  const count = entries.length;
  if (count < 2 || count > MAX_FILES_PER_EDIT_OPERATION) {
    return failure(
      buildFailure(
        "PLAN_TARGET_COUNT_OUT_OF_BOUNDS",
        `Plan target count must be 2–${MAX_FILES_PER_EDIT_OPERATION}, got ${count}`,
      ),
    );
  }

  const workspace = entries[0]!.prepared.workspace;
  const seenPrepared = new Set<object>();
  const seenAuth = new Set<object>();
  let totalAfterBytes = 0;
  const owned: MultiFilePlanEntry[] = [];

  for (const entry of entries) {
    if (entry.prepared.workspace !== workspace) {
      return failure(
        buildFailure(
          "PLAN_WORKSPACE_MISMATCH",
          "Every plan target must bind the exact same WorkspaceBoundary",
        ),
      );
    }
    if (seenPrepared.has(entry.prepared)) {
      return failure(
        buildFailure(
          "DUPLICATE_PREPARED_CHANGE",
          "Exact repeated prepared-object references are rejected",
        ),
      );
    }
    if (seenAuth.has(entry.authorization)) {
      return failure(
        buildFailure(
          "DUPLICATE_AUTHORIZATION",
          "Exact repeated authorization references are rejected",
        ),
      );
    }
    seenPrepared.add(entry.prepared);
    seenAuth.add(entry.authorization);

    if (entry.prepared.afterByteLength > MAX_EDIT_FILE_BYTES) {
      return failure(
        buildFailure(
          "PLAN_TARGET_BYTES_EXCEEDED",
          `Prepared after bytes exceed MAX_EDIT_FILE_BYTES (${MAX_EDIT_FILE_BYTES})`,
        ),
      );
    }
    totalAfterBytes += entry.prepared.afterByteLength;
    if (totalAfterBytes > MAX_TOTAL_PROPOSED_AFTER_BYTES) {
      return failure(
        buildFailure(
          "PLAN_TOTAL_PROPOSED_BYTES_EXCEEDED",
          `Total proposed after bytes exceed MAX_TOTAL_PROPOSED_AFTER_BYTES (${MAX_TOTAL_PROPOSED_AFTER_BYTES})`,
        ),
      );
    }

    owned.push(
      Object.freeze({
        prepared: entry.prepared,
        authorization: entry.authorization,
      }),
    );
  }

  return success(
    brandPlan({
      planId: nextPlanId(),
      entries: Object.freeze(owned),
      workspace,
    }),
  );
}
