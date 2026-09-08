/**
 * Phase 5G currentness rechecks (§18 ordering).
 *
 * Two rechecks exist, and they answer different questions.
 *
 * `recheckScopeCurrentness` runs after the human approves a scope and before
 * any file body is read: is this still the same repository, on the same
 * branch, at the same commit?
 *
 * `verifyFinalCurrentness` runs after the human approves an edit and before a
 * single byte is written. It re-resolves the workspace, rechecks the Git
 * position, and re-observes EVERY approved target from disk. Only if those
 * fresh observations still match the exact pre-state the reviewed edit was
 * prepared against may the write proceed — and the recovery checkpoint is then
 * built from these same fresh observations, not from the older planning ones.
 *
 * Any mismatch is MUTATION_STALE with zero writes. There is no repair path:
 * the human approved a specific before-state, and that before-state is gone.
 */

import { lstat } from "node:fs/promises";
import { join } from "node:path";

import { describeGitPosition } from "./preflight.mjs";

/**
 * @param {any} owners
 * @param {any} workspace
 */
async function canonicalRoot(owners, workspace) {
  const root = await workspace.canonicalize(".");
  return root.ok ? root.value : null;
}

/**
 * Compare a freshly collected Git position against the one preflight recorded.
 *
 * @param {{ root: string, branch: string | null, headOid: string | null }} expected
 * @param {{ kind: string, root?: string, branch?: string | null, headOid?: string | null, detached?: boolean }} actual
 * @returns {{ ok: true } | { ok: false, code: string, detail: string }}
 */
export function compareGitPosition(expected, actual) {
  if (actual.kind !== "GIT_REPOSITORY") {
    return {
      ok: false,
      code: "GIT_POSITION_CHANGED",
      detail: "the working tree is no longer a Git repository",
    };
  }
  if (actual.root !== expected.root) {
    return {
      ok: false,
      code: "GIT_POSITION_CHANGED",
      detail: `Git root changed from ${expected.root} to ${actual.root}`,
    };
  }
  if (actual.detached === true) {
    return {
      ok: false,
      code: "GIT_POSITION_CHANGED",
      detail: "HEAD became detached during the session",
    };
  }
  if ((actual.branch ?? null) !== expected.branch) {
    return {
      ok: false,
      code: "GIT_POSITION_CHANGED",
      detail: `branch changed from ${expected.branch ?? "(none)"} to ${actual.branch ?? "(none)"}`,
    };
  }
  if ((actual.headOid ?? null) !== expected.headOid) {
    return {
      ok: false,
      code: "GIT_POSITION_CHANGED",
      detail: `HEAD moved from ${expected.headOid ?? "(unborn)"} to ${actual.headOid ?? "(unborn)"}`,
    };
  }
  return { ok: true };
}

/**
 * Snapshot fingerprints of approved REPLACE_TEXT paths at SCOPE approval.
 * Bodies are not sent to the provider yet — this is only the currentness baseline.
 *
 * @param {any} owners
 * @param {{ workspace: any, config: any, inventory: any, approved: { editableTargets: readonly any[] } }} input
 * @returns {Promise<{ ok: true, fingerprints: Map<string, string> } | { ok: false, code: string, detail: string }>}
 */
export async function captureScopeFileFingerprints(owners, input) {
  const fingerprints = new Map();
  for (const target of input.approved.editableTargets) {
    if (target.changeKind !== "REPLACE_TEXT") {
      continue;
    }
    const relativePath = target.relativePath;
    const found = input.inventory.observations.find(
      (item) =>
        item.disposition === "ADMITTED" && item.relativePath === relativePath,
    );
    if (found === undefined || !("entry" in found)) {
      return {
        ok: false,
        code: "SCOPE_STALE",
        detail: `approved path '${relativePath}' is no longer admitted`,
      };
    }
    const read = await owners.readRepositoryContent(
      found.entry,
      input.workspace,
      input.config,
    );
    if (!read.ok || read.value.status !== "READ") {
      return {
        ok: false,
        code: "SCOPE_STALE",
        detail: `approved path '${relativePath}' is unreadable at scope approval`,
      };
    }
    fingerprints.set(relativePath, read.value.observation.fingerprint.hex);
  }
  return { ok: true, fingerprints };
}

/**
 * Recheck between scope approval and reading file bodies for Call #2.
 * Git position AND approved existing-file fingerprints must still match.
 *
 * @param {any} owners
 * @param {{
 *   workspace: any,
 *   config: any,
 *   inventory: any,
 *   expectedGitPosition: any,
 *   expectedFingerprints?: Map<string, string>,
 * }} input
 */
export async function recheckScopeCurrentness(owners, input) {
  const discovered = await owners.discoverGitRepository(input.workspace);
  if (!discovered.ok) {
    return {
      ok: false,
      code: "GIT_POSITION_CHANGED",
      detail: `Git discovery failed after scope approval: ${discovered.error.code}`,
    };
  }
  const baseline = await owners.collectGitStateBaseline(
    input.workspace,
    input.inventory,
    input.config,
  );
  if (!baseline.ok) {
    return {
      ok: false,
      code: "GIT_POSITION_CHANGED",
      detail: `Git state unavailable after scope approval: ${baseline.error.code}`,
    };
  }
  const position = describeGitPosition(baseline.value.availability);
  const compared = compareGitPosition(input.expectedGitPosition, position);
  if (!compared.ok) {
    return compared;
  }

  if (input.expectedFingerprints instanceof Map) {
    for (const [relativePath, expectedHex] of input.expectedFingerprints) {
      const found = input.inventory.observations.find(
        (item) =>
          item.disposition === "ADMITTED" && item.relativePath === relativePath,
      );
      if (found === undefined || !("entry" in found)) {
        return {
          ok: false,
          code: "SCOPE_STALE",
          detail: `approved path '${relativePath}' is no longer admitted`,
        };
      }
      const read = await owners.readRepositoryContent(
        found.entry,
        input.workspace,
        input.config,
      );
      if (!read.ok || read.value.status !== "READ") {
        return {
          ok: false,
          code: "SCOPE_STALE",
          detail: `approved path '${relativePath}' became unreadable`,
        };
      }
      if (read.value.observation.fingerprint.hex !== expectedHex) {
        return {
          ok: false,
          code: "SCOPE_STALE",
          detail: `approved path '${relativePath}' changed after SCOPE approval`,
        };
      }
    }
  }

  return { ok: true, gitPosition: position };
}

/**
 * FINAL currentness, immediately before READY.
 *
 * Order is mandatory and is asserted by the general-session architecture test:
 *   1. re-resolve the workspace boundary from the original absolute root
 *   2. recheck Git root / branch / HEAD
 *   3. fresh re-observe every approved target
 *   4. compare against the pre-state bound into the approved EditReview
 *
 * @param {any} owners
 * @param {{
 *   projectRoot: string,
 *   expectedGitPosition: { root: string, branch: string | null, headOid: string | null },
 *   order: readonly any[],  // MutationReviewView.order
 * }} input
 * @returns {Promise<{ ok: true, observations: Array<object>, gitPosition: any }
 *   | { ok: false, code: string, detail: string }>}
 */
export async function verifyFinalCurrentness(owners, input) {
  // 1. Re-resolve the workspace. A fresh boundary, not the cached one: if the
  //    root was swapped for a symlink or removed, this is where it shows.
  const boundary = await owners.createWorkspaceBoundary(input.projectRoot);
  if (!boundary.ok) {
    return {
      ok: false,
      code: "WORKSPACE_UNAVAILABLE",
      detail: `workspace no longer resolves: ${boundary.error.code}`,
    };
  }
  const workspace = boundary.value;
  const root = await canonicalRoot(owners, workspace);
  if (root === null) {
    return {
      ok: false,
      code: "WORKSPACE_UNAVAILABLE",
      detail: "workspace root is not canonicalizable",
    };
  }
  const loaded = await owners.loadProjectConfig(workspace);
  if (!loaded.ok) {
    return {
      ok: false,
      code: "CONFIG_UNAVAILABLE",
      detail: `project configuration no longer loads: ${loaded.error.code}`,
    };
  }
  const config = loaded.value;

  // 2. Git position.
  const inv = await owners.inventory(workspace, config);
  if (!inv.ok) {
    return {
      ok: false,
      code: "INVENTORY_FAILED",
      detail: `inventory failed before write: ${inv.error.code}`,
    };
  }
  const discovered = await owners.discoverGitRepository(workspace);
  if (!discovered.ok) {
    return {
      ok: false,
      code: "GIT_POSITION_CHANGED",
      detail: `Git discovery failed before write: ${discovered.error.code}`,
    };
  }
  if (discovered.value.root !== input.expectedGitPosition.root) {
    return {
      ok: false,
      code: "GIT_POSITION_CHANGED",
      detail: `Git root changed from ${input.expectedGitPosition.root} to ${discovered.value.root}`,
    };
  }
  const baseline = await owners.collectGitStateBaseline(workspace, inv.value, config);
  if (!baseline.ok) {
    return {
      ok: false,
      code: "GIT_POSITION_CHANGED",
      detail: `Git state unavailable before write: ${baseline.error.code}`,
    };
  }
  const position = describeGitPosition(baseline.value.availability);
  const compared = compareGitPosition(input.expectedGitPosition, position);
  if (!compared.ok) {
    return compared;
  }

  // 3 + 4. Fresh observation of every approved target, compared to the
  //        pre-state the reviewed edit was prepared against.
  const observations = [];
  for (const item of input.order) {
    const prepared = item.prepared;
    if (prepared.action === "MODIFY_EXISTING_FILE") {
      const read = await owners.readRepositoryContent(
        prepared.target,
        workspace,
        config,
      );
      if (!read.ok) {
        return {
          ok: false,
          code: "MUTATION_STALE",
          detail: `${item.relativePath} could not be re-read before writing (${read.error.code})`,
        };
      }
      if (read.value.status !== "READ") {
        return {
          ok: false,
          code: "MUTATION_STALE",
          detail: `${item.relativePath} is no longer readable as reviewed (${read.value.status})`,
        };
      }
      const fresh = read.value.observation;
      if (fresh.fingerprint.hex !== prepared.beforeFingerprint.hex) {
        return {
          ok: false,
          code: "MUTATION_STALE",
          detail: `${item.relativePath} changed on disk after you approved the edit`,
        };
      }
      observations.push({
        relativePath: item.relativePath,
        kind: "REPLACE_TEXT",
        fingerprintHex: fresh.fingerprint.hex,
        byteLength: fresh.byteLength,
        observation: fresh,
      });
      continue;
    }

    // CREATE: absence is proven again here, never inherited from preparation.
    const absolute = join(root, prepared.targetRelativePath);
    let present = true;
    try {
      await lstat(absolute);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        present = false;
      } else {
        return {
          ok: false,
          code: "MUTATION_STALE",
          detail: `${prepared.targetRelativePath} could not be checked for absence before writing`,
        };
      }
    }
    if (present) {
      return {
        ok: false,
        code: "MUTATION_STALE",
        detail: `${prepared.targetRelativePath} now exists; the reviewed edit was a creation`,
      };
    }
    observations.push({
      relativePath: prepared.targetRelativePath,
      kind: "CREATE_TEXT",
      fingerprintHex: null,
      byteLength: 0,
      observation: null,
    });
  }

  return { ok: true, observations, gitPosition: position };
}
