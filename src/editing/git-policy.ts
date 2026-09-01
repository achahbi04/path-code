/**
 * Optional Git context refusal rules for editing authorization.
 */

import type { GitStateBaseline } from "../git/types.js";
import type { RepositoryEntry } from "../inventory/types.js";

export function isTargetUnmergedInGitContext(
  entry: RepositoryEntry,
  targetRelativePath: string,
  gitContext: GitStateBaseline,
): boolean {
  for (const annotation of gitContext.annotations) {
    if (
      annotation.entry === entry ||
      annotation.entry.relativePath === targetRelativePath
    ) {
      if (annotation.observation.state.kind === "UNMERGED") {
        return true;
      }
    }
  }

  for (const unmapped of gitContext.unmappedVisibleObservations) {
    if (
      unmapped.observation.workspaceRelativePath === targetRelativePath &&
      unmapped.observation.state.kind === "UNMERGED"
    ) {
      return true;
    }
  }

  return false;
}
