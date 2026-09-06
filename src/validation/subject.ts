/**
 * Declared-input subject verification via Phase 2 snapshot path.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { ContentObservation } from "../reader/types.js";
import type { RepositoryEntry } from "../inventory/types.js";
import { verifyRepositorySnapshot } from "../snapshot/index.js";
import type { RepositorySnapshot } from "../snapshot/types.js";

export type SubjectVerifyFailure = {
  readonly code: "SUBJECT_STALE" | "SUBJECT_UNVERIFIABLE" | "SUBJECT_VERIFY_FAILED";
  readonly message: string;
};

export function declaredEntriesFromObservations(
  observations: readonly ContentObservation[],
): readonly RepositoryEntry[] {
  return observations.map((observation) => observation.entry);
}

export async function verifyDeclaredInputsCurrent(
  snapshot: RepositorySnapshot,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
  declaredEntries: readonly RepositoryEntry[],
): Promise<Result<true, SubjectVerifyFailure>> {
  if (declaredEntries.length === 0) {
    return failure({
      code: "SUBJECT_UNVERIFIABLE",
      message: "No declared observations to verify",
    });
  }

  const assessment = await verifyRepositorySnapshot(snapshot, workspace, config, {
    entries: declaredEntries,
    content: declaredEntries,
  });
  if (!assessment.ok) {
    return failure({
      code: "SUBJECT_VERIFY_FAILED",
      message: assessment.error.message,
    });
  }

  for (const entry of declaredEntries) {
    const entryResult = assessment.value.entryResults.find(
      (item) => item.entry === entry,
    );
    const contentResult = assessment.value.contentResults.find(
      (item) => item.entry === entry,
    );
    if (entryResult === undefined || contentResult === undefined) {
      return failure({
        code: "SUBJECT_UNVERIFIABLE",
        message: "Declared entry missing from verification assessment",
      });
    }
    if (entryResult.state !== "CURRENT_IDENTITY") {
      if (
        entryResult.state === "NOT_VERIFIED" ||
        entryResult.state === "UNREADABLE" ||
        entryResult.state === "DENIED"
      ) {
        return failure({
          code: "SUBJECT_UNVERIFIABLE",
          message: `Declared entry ${entryResult.relativePath} not verifiably current (${entryResult.state})`,
        });
      }
      return failure({
        code: "SUBJECT_STALE",
        message: `Declared entry ${entryResult.relativePath} identity stale (${entryResult.state})`,
      });
    }
    if (contentResult.state !== "VERIFIED_CURRENT") {
      if (
        contentResult.state === "STALE_CONTENT" ||
        contentResult.state === "REVALIDATION_REQUIRED"
      ) {
        return failure({
          code: "SUBJECT_STALE",
          message: `Declared content ${contentResult.relativePath} stale (${contentResult.state})`,
        });
      }
      return failure({
        code: "SUBJECT_UNVERIFIABLE",
        message: `Declared content ${contentResult.relativePath} unverifiable (${contentResult.state})`,
      });
    }
  }

  return success(true);
}
