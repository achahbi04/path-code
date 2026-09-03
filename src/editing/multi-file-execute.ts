/**
 * Sequential multi-file plan execution — fresh preflight then 3B/3C targets.
 */

import { createFile } from "./create-file.js";
import { runMultiFilePreflight } from "./multi-file-preflight.js";
import type {
  ExecuteMultiFilePlanOptions,
  MultiFileExecutionTargetOutcome,
  MultiFilePlan,
  MultiFilePlanResult,
  MultiFilePlanStatus,
  MultiFilePlanTargetOutcome,
  MultiFileTargetOperations,
} from "./multi-file-types.js";
import { replaceExistingFile } from "./replace-existing-file.js";
import type {
  CreateFileResult,
  KnowledgeInvalidation,
  ReplaceExistingFileResult,
} from "./types.js";

const productionOps: MultiFileTargetOperations = {
  replaceExistingFile,
  createFile,
};

function brandResult(data: {
  readonly planStatus: MultiFilePlanStatus;
  readonly targetOutcomes: readonly MultiFilePlanTargetOutcome[];
  readonly knowledgeInvalidations: readonly KnowledgeInvalidation[];
}): MultiFilePlanResult {
  return Object.freeze({
    planStatus: data.planStatus,
    targetOutcomes: Object.freeze([...data.targetOutcomes]),
    knowledgeInvalidations: Object.freeze([...data.knowledgeInvalidations]),
  }) as MultiFilePlanResult;
}

function mapNestedOutcome(
  nested: ReplaceExistingFileResult | CreateFileResult,
): MultiFileExecutionTargetOutcome {
  if (nested.outcome === "SUCCESS") {
    return { kind: "APPLIED", nestedResult: nested };
  }
  if (nested.outcome === "REFUSED_PRECOMMIT") {
    return { kind: "REFUSED_PRECOMMIT", nestedResult: nested };
  }
  if (nested.outcome === "FAILED_PRECOMMIT") {
    return { kind: "FAILED_PRECOMMIT", nestedResult: nested };
  }
  return { kind: "COMMITTED_FAILURE", nestedResult: nested };
}

function hasCommittedMutation(
  outcomes: readonly MultiFilePlanTargetOutcome[],
): boolean {
  for (const outcome of outcomes) {
    if (outcome.kind === "APPLIED" || outcome.kind === "COMMITTED_FAILURE") {
      return true;
    }
  }
  return false;
}

function derivePlanStatus(
  outcomes: readonly MultiFilePlanTargetOutcome[],
): MultiFilePlanStatus {
  if (outcomes.every((o) => o.kind === "APPLIED")) {
    return "ALL_APPLIED";
  }
  if (
    outcomes.some(
      (o) =>
        o.kind === "PREFLIGHT_FAILED" ||
        o.kind === "PREFLIGHT_READY_BUT_PLAN_REFUSED",
    )
  ) {
    return "REFUSED_AT_PREFLIGHT";
  }
  if (hasCommittedMutation(outcomes)) {
    return "PARTIALLY_COMMITTED";
  }
  return "STOPPED_BEFORE_ANY_COMMIT";
}

function collectInvalidations(
  outcomes: readonly MultiFilePlanTargetOutcome[],
): KnowledgeInvalidation[] {
  const collected: KnowledgeInvalidation[] = [];
  for (const outcome of outcomes) {
    if (outcome.kind !== "APPLIED" && outcome.kind !== "COMMITTED_FAILURE") {
      continue;
    }
    const nested = outcome.nestedResult;
    if (nested.knowledgeInvalidation !== null) {
      collected.push(nested.knowledgeInvalidation);
    }
  }
  return collected;
}

/**
 * Execute an opaque multi-file plan: fresh preflight, then sequential 3B/3C.
 * Preflight config is never handed to target operations.
 */
export async function executeMultiFilePlan(
  plan: MultiFilePlan,
  options?: ExecuteMultiFilePlanOptions,
): Promise<MultiFilePlanResult> {
  const ops = options?.targetOps ?? productionOps;
  const gitContext = options?.gitContext;

  const preflight = await runMultiFilePreflight(plan, gitContext);
  if (!preflight.ready) {
    return brandResult({
      planStatus: "REFUSED_AT_PREFLIGHT",
      targetOutcomes: preflight.targetOutcomes,
      knowledgeInvalidations: [],
    });
  }

  const outcomes: MultiFilePlanTargetOutcome[] = [];
  let stop = false;

  for (let i = 0; i < plan.entries.length; i += 1) {
    if (stop) {
      outcomes.push({ kind: "NOT_ATTEMPTED" });
      continue;
    }

    const entry = plan.entries[i]!;
    const nested =
      entry.prepared.action === "MODIFY_EXISTING_FILE"
        ? await ops.replaceExistingFile(entry.authorization, entry.prepared, {
            ...(gitContext !== undefined ? { gitContext } : {}),
          })
        : await ops.createFile(entry.authorization, entry.prepared, {
            ...(gitContext !== undefined ? { gitContext } : {}),
          });

    const mapped = mapNestedOutcome(nested);
    outcomes.push(mapped);
    if (mapped.kind !== "APPLIED") {
      stop = true;
    }
  }

  const planStatus = derivePlanStatus(outcomes);
  return brandResult({
    planStatus,
    targetOutcomes: outcomes,
    knowledgeInvalidations: collectInvalidations(outcomes),
  });
}
