/**
 * Git worktree discovery for an already-authorized WorkspaceBoundary.
 *
 * Git is an information source. WorkspaceBoundary is the authority source.
 * Git's textual --show-toplevel output is re-admitted through canonicalize().
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type {
  CanonicalPath,
  WorkspaceBoundary,
} from "../domain/workspace.js";
import {
  gitDiscoveryFailure,
  type GitDiscoveryFailure,
} from "./failure.js";
import { runGit, stripGitStdoutTerminator } from "./runner.js";

export type GitRepository = {
  readonly root: CanonicalPath;
};

/**
 * Discover whether the authorized workspace corresponds to an admissible
 * Git worktree, and return its trusted CanonicalPath root.
 *
 * Does not collect status, HEAD, branch, remotes, or history.
 */
export async function discoverGitRepository(
  workspace: WorkspaceBoundary,
): Promise<Result<GitRepository, GitDiscoveryFailure>> {
  const workspaceRootResult = await workspace.canonicalize(".");
  if (!workspaceRootResult.ok) {
    return failure(
      gitDiscoveryFailure(
        "GIT_DISCOVERY_FAILED",
        "Failed to obtain authorized workspace root",
        { workspaceCode: workspaceRootResult.error.code },
      ),
    );
  }

  const workspaceRoot = workspaceRootResult.value;

  const inside = await runGit({
    cwd: workspaceRoot,
    args: ["rev-parse", "--is-inside-work-tree"],
  });

  if (!inside.ok) {
    return inside;
  }

  const insideFlag = stripGitStdoutTerminator(inside.value.stdout);
  if (insideFlag === "false") {
    return failure(
      gitDiscoveryFailure(
        "NOT_A_WORKTREE",
        "Git repository is not a usable worktree",
      ),
    );
  }
  if (insideFlag !== "true") {
    return failure(
      gitDiscoveryFailure(
        "GIT_DISCOVERY_FAILED",
        "Unexpected Git worktree response",
      ),
    );
  }

  const toplevel = await runGit({
    cwd: workspaceRoot,
    args: ["rev-parse", "--show-toplevel"],
  });

  if (!toplevel.ok) {
    // Non-worktree layouts may fail show-toplevel after a false-negative path.
    if (toplevel.error.code === "NOT_A_GIT_REPOSITORY") {
      return toplevel;
    }
    return failure(
      gitDiscoveryFailure(
        "GIT_DISCOVERY_FAILED",
        "Failed to obtain Git worktree root",
        { cause: toplevel.error.code },
      ),
    );
  }

  const rawGitRoot = stripGitStdoutTerminator(toplevel.value.stdout);
  if (rawGitRoot.length === 0) {
    return failure(
      gitDiscoveryFailure(
        "GIT_DISCOVERY_FAILED",
        "Git returned an empty worktree root",
      ),
    );
  }

  // Git output is untrusted text until WorkspaceBoundary admits it.
  const admitted = await workspace.canonicalize(rawGitRoot);
  if (!admitted.ok) {
    if (admitted.error.code === "PATH_OUTSIDE_WORKSPACE") {
      return failure(
        gitDiscoveryFailure(
          "GIT_ROOT_OUTSIDE_WORKSPACE",
          "Git worktree root lies outside the authorized workspace",
        ),
      );
    }
    return failure(
      gitDiscoveryFailure(
        "GIT_DISCOVERY_FAILED",
        "Git worktree root could not be admitted by the workspace boundary",
        { workspaceCode: admitted.error.code },
      ),
    );
  }

  return success({ root: admitted.value });
}
