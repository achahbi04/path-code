/**
 * Phase 5G General Engineering Session preflight.
 *
 * Everything here happens before a credential is read and before a byte leaves
 * the machine. It answers one question: is this working tree a place where an
 * authorized, recoverable mutation could honestly be attempted?
 *
 * Git is read only. This module never runs `git`; it composes the Path Code
 * Git owners (which use a fixed read-only argument vector) and otherwise reads
 * the administrative directory with `fs`. Nothing here stashes, resets, cleans,
 * checks out or commits.
 */

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { containsPath, resolveRecoveryStoreRoot, resolveStateDirectory } from "./state-dir.mjs";

/**
 * Administrative markers that mean a multi-step Git operation is half-finished.
 * Mutating a tree in this state produces a repository state no operator asked
 * for, and Path Code cannot describe the result honestly.
 */
export const GIT_IN_PROGRESS_MARKERS = Object.freeze([
  { marker: "MERGE_HEAD", code: "MERGE_IN_PROGRESS", label: "merge" },
  { marker: "rebase-merge", code: "REBASE_IN_PROGRESS", label: "rebase" },
  { marker: "rebase-apply", code: "REBASE_IN_PROGRESS", label: "rebase" },
  {
    marker: "CHERRY_PICK_HEAD",
    code: "CHERRY_PICK_IN_PROGRESS",
    label: "cherry-pick",
  },
  { marker: "REVERT_HEAD", code: "REVERT_IN_PROGRESS", label: "revert" },
  { marker: "BISECT_LOG", code: "BISECT_IN_PROGRESS", label: "bisect" },
  { marker: "BISECT_START", code: "BISECT_IN_PROGRESS", label: "bisect" },
]);

/**
 * Resolve the Git administrative directory for a worktree root, handling both
 * a real `.git` directory and the `gitdir:` pointer file used by linked
 * worktrees and submodules.
 *
 * @param {string} gitRoot
 * @returns {string | null}
 */
export function resolveGitDirectory(gitRoot) {
  const dotGit = join(gitRoot, ".git");
  let stats;
  try {
    stats = statSync(dotGit);
  } catch {
    return null;
  }
  if (stats.isDirectory()) {
    return dotGit;
  }
  if (!stats.isFile()) {
    return null;
  }
  let text;
  try {
    text = readFileSync(dotGit, "utf8");
  } catch {
    return null;
  }
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(text);
  if (match === null) {
    return null;
  }
  const target = match[1];
  const absolute = isAbsolute(target) ? target : resolve(gitRoot, target);
  return existsSync(absolute) ? absolute : null;
}

/**
 * @param {string | null} gitDirectory
 * @returns {{ code: string, label: string } | null}
 */
export function detectGitOperationInProgress(gitDirectory) {
  if (gitDirectory === null) {
    return null;
  }
  for (const entry of GIT_IN_PROGRESS_MARKERS) {
    if (existsSync(join(gitDirectory, entry.marker))) {
      return { code: entry.code, label: entry.label };
    }
  }
  return null;
}

/**
 * Best-effort physical identity for comparison; falls back to lexical resolve.
 * @param {string} candidate
 */
function realOrResolved(candidate) {
  try {
    return realpathSync(candidate);
  } catch {
    return resolve(candidate);
  }
}

/**
 * Classify the relationship between the target project and the Path Code
 * runtime checkout that is executing this session.
 *
 * @param {string} projectRoot
 * @param {string} checkoutRoot
 * @returns {{ kind: "SELF", detail: string }
 *   | { kind: "NESTED_RUNTIME", relativePrefix: string }
 *   | { kind: "SEPARATE" }}
 */
export function classifySelfWorkspace(projectRoot, checkoutRoot) {
  const project = realOrResolved(projectRoot);
  const checkout = realOrResolved(checkoutRoot);
  if (project === checkout) {
    return { kind: "SELF", detail: "the target workspace is this Path Code checkout" };
  }
  if (containsPath(checkout, project)) {
    return {
      kind: "SELF",
      detail: "the target workspace lies inside this Path Code checkout",
    };
  }
  if (containsPath(project, checkout)) {
    // The runtime lives inside the project (for example a local install).
    // Editing the project is still legitimate; editing the runtime is not.
    return {
      kind: "NESTED_RUNTIME",
      relativePrefix: relative(project, checkout).replaceAll("\\", "/"),
    };
  }
  return { kind: "SEPARATE" };
}

/**
 * Summarize working-tree cleanliness for disclosure. Path Code never acts on
 * this: it reports and continues, because the operator's uncommitted work is
 * theirs.
 *
 * @param {any} baseline GitStateBaseline
 */
export function summarizeWorkingTree(baseline) {
  const modified = [];
  const untracked = [];
  const unmerged = [];
  for (const annotation of baseline.annotations ?? []) {
    const state = annotation.observation?.state;
    const path = annotation.observation?.workspaceRelativePath ?? "";
    if (state === undefined) continue;
    if (state.kind === "UNTRACKED") {
      untracked.push(path);
    } else if (state.kind === "UNMERGED") {
      unmerged.push(path);
    } else if (
      state.kind === "TRACKED" &&
      (state.indexState !== "CLEAN" || state.worktreeState !== "CLEAN")
    ) {
      modified.push(path);
    }
  }
  for (const item of baseline.unmappedVisibleObservations ?? []) {
    const state = item.observation?.state;
    if (state?.kind === "UNTRACKED") {
      untracked.push(item.observation.workspaceRelativePath ?? "");
    }
  }
  modified.sort();
  untracked.sort();
  unmerged.sort();
  return {
    clean: modified.length === 0 && untracked.length === 0 && unmerged.length === 0,
    modified,
    untracked,
    unmerged,
  };
}

/**
 * @param {any} availability GitRepositoryAvailability
 */
export function describeGitPosition(availability) {
  if (availability.kind !== "GIT_REPOSITORY") {
    return { kind: "NOT_GIT_REPOSITORY" };
  }
  return {
    kind: "GIT_REPOSITORY",
    root: availability.root,
    branch:
      availability.branch.kind === "ATTACHED" ? availability.branch.name : null,
    detached: availability.branch.kind === "DETACHED",
    headOid: availability.head.kind === "COMMIT" ? availability.head.oid : null,
    unbornHead: availability.head.kind === "UNBORN",
  };
}

function refuse(code, message) {
  return { ok: false, code, message };
}

/**
 * Local, offline preflight. No network, no credential, no provider.
 *
 * @param {any} owners loaded Path Code owners
 * @param {{
 *   projectRoot: string,
 *   checkoutRoot: string,
 *   env?: Record<string, string | undefined>,
 *   platform?: string,
 *   home?: string,
 * }} input
 */
export async function runGeneralSessionPreflight(owners, input) {
  let projectRoot;
  try {
    projectRoot = realpathSync(input.projectRoot);
  } catch {
    return refuse(
      "WORKSPACE_UNAVAILABLE",
      `Target directory does not resolve: ${input.projectRoot}`,
    );
  }

  // Self-modification is refused before anything is observed or resolved.
  const selfness = classifySelfWorkspace(projectRoot, input.checkoutRoot);
  if (selfness.kind === "SELF") {
    return refuse(
      "SELF_WORKSPACE_MUTATION_NOT_SUPPORTED",
      `Path Code will not run a General Engineering Session against its own runtime checkout — ${selfness.detail}.`,
    );
  }
  const forbiddenRelativePrefixes =
    selfness.kind === "NESTED_RUNTIME" ? [selfness.relativePrefix] : [];

  const stateDirectory = resolveStateDirectory({
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.platform === undefined ? {} : { platform: input.platform }),
    ...(input.home === undefined ? {} : { home: input.home }),
  });
  if (!stateDirectory.ok) {
    return refuse(stateDirectory.code, stateDirectory.message);
  }
  const storeRoot = resolveRecoveryStoreRoot({
    stateDirectory: stateDirectory.directory,
    projectRoot,
  });
  if (!storeRoot.ok) {
    return refuse(storeRoot.code, storeRoot.message);
  }

  const boundary = await owners.createWorkspaceBoundary(projectRoot);
  if (!boundary.ok) {
    return refuse("WORKSPACE_UNAVAILABLE", boundary.error.message);
  }
  const workspace = boundary.value;

  const loaded = await owners.loadProjectConfig(workspace);
  if (!loaded.ok) {
    return refuse("CONFIG_UNAVAILABLE", loaded.error.message);
  }
  const config = loaded.value;

  const inv = await owners.inventory(workspace, config);
  if (!inv.ok) {
    return refuse("INVENTORY_FAILED", inv.error.message);
  }

  const discovered = await owners.discoverGitRepository(workspace);
  if (!discovered.ok) {
    if (discovered.error.code === "NOT_A_GIT_REPOSITORY") {
      return refuse(
        "GENERAL_SESSION_NOT_A_GIT_REPOSITORY",
        "A General Engineering Session requires a Git working tree so that you can see, review and revert what changed.",
      );
    }
    return refuse("GIT_DISCOVERY_FAILED", discovered.error.message);
  }

  const baseline = await owners.collectGitStateBaseline(workspace, inv.value, config);
  if (!baseline.ok) {
    return refuse("GIT_STATE_UNAVAILABLE", baseline.error.message);
  }
  const position = describeGitPosition(baseline.value.availability);
  if (position.kind !== "GIT_REPOSITORY") {
    return refuse(
      "GENERAL_SESSION_NOT_A_GIT_REPOSITORY",
      "A General Engineering Session requires a Git working tree.",
    );
  }
  if (position.detached) {
    return refuse(
      "GENERAL_SESSION_DETACHED_HEAD",
      "HEAD is detached. Check out a branch first so the work you approve has somewhere to live.",
    );
  }

  const gitDirectory = resolveGitDirectory(discovered.value.root);
  const inProgress = detectGitOperationInProgress(gitDirectory);
  if (inProgress !== null) {
    return refuse(
      "GENERAL_SESSION_GIT_OPERATION_IN_PROGRESS",
      `A ${inProgress.label} is in progress (${inProgress.code}). Finish or abort it yourself first — Path Code will not touch it.`,
    );
  }

  return {
    ok: true,
    projectRoot,
    workspace,
    config,
    inventory: inv.value,
    gitRoot: discovered.value.root,
    gitPosition: position,
    workingTree: summarizeWorkingTree(baseline.value),
    stateDirectory: stateDirectory.directory,
    stateDirectorySource: stateDirectory.source,
    recoveryStoreRoot: storeRoot.root,
    forbiddenRelativePrefixes,
  };
}
