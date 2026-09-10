/**
 * Phase 5G scope admission.
 *
 * Turns a structurally valid, still-untrusted plan into an ApprovedScope bound
 * to inventory entries the workspace boundary already admitted. Every refusal
 * is terminal for the plan: there is no partial admission, because a human is
 * about to approve a list and that list must be the whole list.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { InventoryObservation } from "../inventory/disposition.js";
import type { RepositoryEntry, RepositoryInventory } from "../inventory/types.js";
import {
  classifyScopePathSensitivity,
  normalizeRepositoryRelativePath,
} from "./policy.js";
import type {
  AdmittedContextPath,
  AdmittedEditableTarget,
  ApprovedScope,
  EngineeringScopePlan,
  ScopeFailure,
  ScopeFailureCode,
  SensitivePathPolicyOptions,
} from "./types.js";

export type ScopeAdmissionInput = {
  readonly inventory: RepositoryInventory;
  /** Candidate ids the trusted host discovered. The model may only echo these. */
  readonly admittedValidationCandidateIds: readonly string[];
  readonly policy?: SensitivePathPolicyOptions;
};

function fail(code: ScopeFailureCode, message: string): ScopeFailure {
  return { code, message };
}

type EntryIndex = {
  readonly files: ReadonlyMap<string, RepositoryEntry>;
  readonly directories: ReadonlyMap<string, RepositoryEntry>;
  readonly known: ReadonlySet<string>;
};

function indexInventory(inventory: RepositoryInventory): EntryIndex {
  const files = new Map<string, RepositoryEntry>();
  const directories = new Map<string, RepositoryEntry>();
  const known = new Set<string>();
  for (const observation of inventory.observations as readonly InventoryObservation[]) {
    known.add(observation.relativePath);
    if (
      observation.disposition !== "ADMITTED" &&
      observation.disposition !== "DESCENDED"
    ) {
      continue;
    }
    const entry = observation.entry;
    if (entry.physicalKind === "FILE") {
      files.set(observation.relativePath, entry);
    } else if (entry.physicalKind === "DIRECTORY") {
      directories.set(observation.relativePath, entry);
    }
  }
  return { files, directories, known };
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "." : path.slice(0, index);
}

function leafOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

/**
 * Admit a parsed plan against trusted inventory and the sensitive-path policy.
 */
export function admitScopePlan(
  plan: EngineeringScopePlan,
  input: ScopeAdmissionInput,
): Result<ApprovedScope, ScopeFailure> {
  const index = indexInventory(input.inventory);
  const policy = input.policy ?? {};

  const editableTargets: AdmittedEditableTarget[] = [];
  const claimedPaths = new Set<string>();

  for (const proposed of plan.editableTargets) {
    const verdict = classifyScopePathSensitivity(proposed.relativePath, policy);
    if (verdict.sensitive) {
      return failure(
        fail(
          verdict.reasonCode === "PATH_NOT_REPOSITORY_RELATIVE"
            ? "SCOPE_PATH_NOT_ADMITTED"
            : "SCOPE_PATH_SENSITIVE",
          `editable target '${proposed.relativePath}' refused (${verdict.reasonCode}): ${verdict.detail}`,
        ),
      );
    }
    const relativePath = verdict.normalizedPath;
    if (claimedPaths.has(relativePath)) {
      return failure(
        fail(
          "SCOPE_PLAN_DUPLICATE_PATH",
          `editable target '${relativePath}' is claimed twice after normalization`,
        ),
      );
    }
    claimedPaths.add(relativePath);

    if (proposed.changeKind === "REPLACE_TEXT") {
      const entry = index.files.get(relativePath);
      if (entry === undefined) {
        return failure(
          fail(
            index.directories.has(relativePath)
              ? "SCOPE_PATH_KIND_MISMATCH"
              : "SCOPE_PATH_NOT_ADMITTED",
            `editable target '${relativePath}' is not an admitted repository file`,
          ),
        );
      }
      editableTargets.push(
        Object.freeze({
          changeKind: "REPLACE_TEXT" as const,
          relativePath,
          reason: proposed.reason,
          entry,
        }),
      );
      continue;
    }

    if (index.known.has(relativePath)) {
      return failure(
        fail(
          "SCOPE_CREATE_TARGET_EXISTS",
          `create target '${relativePath}' already exists in this repository`,
        ),
      );
    }
    const parentPath = parentOf(relativePath);
    const parentEntry =
      parentPath === "."
        ? (index.directories.get(".") ?? index.directories.get(""))
        : index.directories.get(parentPath);
    if (parentEntry === undefined) {
      return failure(
        fail(
          "SCOPE_CREATE_PARENT_NOT_ADMITTED",
          `create target '${relativePath}' has no admitted parent directory`,
        ),
      );
    }
    editableTargets.push(
      Object.freeze({
        changeKind: "CREATE_TEXT" as const,
        relativePath,
        reason: proposed.reason,
        parentEntry,
        leafName: leafOf(relativePath),
      }),
    );
  }

  if (editableTargets.length === 0) {
    return failure(
      fail(
        "SCOPE_NO_EDITABLE_TARGET",
        "the scope plan admitted no editable target",
      ),
    );
  }

  const contextPaths: AdmittedContextPath[] = [];
  const seenContext = new Set<string>();
  for (const raw of plan.contextPaths) {
    const verdict = classifyScopePathSensitivity(raw, policy);
    if (verdict.sensitive) {
      return failure(
        fail(
          verdict.reasonCode === "PATH_NOT_REPOSITORY_RELATIVE"
            ? "SCOPE_PATH_NOT_ADMITTED"
            : "SCOPE_PATH_SENSITIVE",
          `context path '${raw}' refused (${verdict.reasonCode}): ${verdict.detail}`,
        ),
      );
    }
    const relativePath = verdict.normalizedPath;
    if (seenContext.has(relativePath) || claimedPaths.has(relativePath)) {
      // A path already covered as an editable target is not read twice.
      continue;
    }
    const entry = index.files.get(relativePath);
    if (entry === undefined) {
      return failure(
        fail(
          "SCOPE_PATH_NOT_ADMITTED",
          `context path '${relativePath}' is not an admitted repository file`,
        ),
      );
    }
    seenContext.add(relativePath);
    contextPaths.push(Object.freeze({ relativePath, entry }));
  }

  const admittedCandidates = new Set(input.admittedValidationCandidateIds);
  const selectedCandidateIds: string[] = [];
  for (const id of plan.validationCandidateIds) {
    if (!admittedCandidates.has(id)) {
      return failure(
        fail(
          "SCOPE_VALIDATION_CANDIDATE_UNKNOWN",
          `validation candidate '${id}' was not discovered by the host`,
        ),
      );
    }
    selectedCandidateIds.push(id);
  }

  // When H is omitted, treat effective H as E ∪ P ∪ validation-needed
  // (backward compatible). When H is provided, admit like context and require
  // E ⊆ H and P ⊆ H (CREATE_TEXT targets must still appear in H as strings so
  // the host can hydrate related context; non-file CREATE paths are covered by
  // the plan string set check before file admission).
  let hydrationPaths: readonly AdmittedContextPath[] | undefined;
  if (plan.hydrationPaths !== undefined) {
    const hydrationPathsAdmitted: AdmittedContextPath[] = [];
    const hydrationSet = new Set<string>();
    const seenHydration = new Set<string>();

    for (const raw of plan.hydrationPaths) {
      const verdict = classifyScopePathSensitivity(raw, policy);
      if (verdict.sensitive) {
        return failure(
          fail(
            verdict.reasonCode === "PATH_NOT_REPOSITORY_RELATIVE"
              ? "SCOPE_PATH_NOT_ADMITTED"
              : "SCOPE_PATH_SENSITIVE",
            `hydration path '${raw}' refused (${verdict.reasonCode}): ${verdict.detail}`,
          ),
        );
      }
      const relativePath = verdict.normalizedPath;
      hydrationSet.add(relativePath);
      if (seenHydration.has(relativePath)) {
        continue;
      }
      seenHydration.add(relativePath);

      // CREATE targets in H need not exist as files yet; keep them in the
      // coverage set but only admit existing files onto ApprovedScope.H.
      if (index.known.has(relativePath) === false) {
        const isCreateEditable = editableTargets.some(
          (t) =>
            t.changeKind === "CREATE_TEXT" && t.relativePath === relativePath,
        );
        if (isCreateEditable) {
          continue;
        }
        return failure(
          fail(
            "SCOPE_PATH_NOT_ADMITTED",
            `hydration path '${relativePath}' is not an admitted repository file`,
          ),
        );
      }

      const entry = index.files.get(relativePath);
      if (entry === undefined) {
        return failure(
          fail(
            index.directories.has(relativePath)
              ? "SCOPE_PATH_KIND_MISMATCH"
              : "SCOPE_PATH_NOT_ADMITTED",
            `hydration path '${relativePath}' is not an admitted repository file`,
          ),
        );
      }
      hydrationPathsAdmitted.push(Object.freeze({ relativePath, entry }));
    }

    for (const target of editableTargets) {
      if (!hydrationSet.has(target.relativePath)) {
        return failure(
          fail(
            "SCOPE_HYDRATION_DOES_NOT_COVER_EDITABLE",
            `hydration paths do not cover editable target '${target.relativePath}'`,
          ),
        );
      }
    }
    for (const raw of plan.contextPaths) {
      const verdict = classifyScopePathSensitivity(raw, policy);
      if (verdict.sensitive) {
        // Already refused above when admitting context; defensive only.
        continue;
      }
      if (!hydrationSet.has(verdict.normalizedPath)) {
        return failure(
          fail(
            "SCOPE_HYDRATION_DOES_NOT_COVER_CONTEXT",
            `hydration paths do not cover context path '${verdict.normalizedPath}'`,
          ),
        );
      }
    }

    hydrationPaths = Object.freeze(hydrationPathsAdmitted);
  }

  return success(
    Object.freeze({
      taskSummary: plan.taskSummary,
      editableTargets: Object.freeze(editableTargets),
      contextPaths: Object.freeze(contextPaths),
      validationCandidateIds: Object.freeze(selectedCandidateIds),
      assumptions: plan.assumptions,
      limitations: plan.limitations,
      ...(hydrationPaths !== undefined ? { hydrationPaths } : {}),
    }),
  );
}

export { normalizeRepositoryRelativePath };
