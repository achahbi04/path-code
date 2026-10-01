/** P8.2B — historical tree restoration inside S2 Build adoption authority. */

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { assertAllowedProjectRoot } from "../paths.mjs";
import { adoptProductCommit } from "../product-adoption.mjs";
import { readBuildRecord, writeBuildRecord } from "./record.mjs";
import { readProductVersion } from "./versions.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const fail = (code, message) => ({ ok: false, code, message });

function git(root, args) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  const result = spawnSync("git", args, {
    cwd: root, encoding: "utf8", timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"], env,
  });
  return { ok: result.status === 0, stdoutRaw: String(result.stdout || ""),
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim() };
}

function commitTree(root, sha) {
  if (!SHA.test(String(sha || ""))) return null;
  const result = git(root, ["rev-parse", "--verify", `${sha}^{tree}`]);
  return result.ok && SHA.test(result.stdout) ? result.stdout : null;
}

function productState(record) {
  const binding = record.projectBindings?.[0];
  if (!binding?.projectRoot || !binding?.bindingId || !record.productBranch) {
    return fail("BUILD_NOT_BOUND", "Build has no canonical product binding");
  }
  const allowed = assertAllowedProjectRoot(binding.projectRoot);
  if (!allowed.ok) return fail(allowed.code, allowed.message);
  let root;
  try { root = realpathSync(binding.projectRoot); }
  catch { return fail("PROJECT_UNAVAILABLE", "Bound product repository is unavailable"); }
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  let gitRoot;
  try { gitRoot = realpathSync(top.stdout); } catch { gitRoot = null; }
  if (!top.ok || gitRoot !== root) return fail("PROJECT_BINDING_MISMATCH", "Bound project is not its Git root");
  const branch = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!branch.ok || branch.stdout !== record.productBranch) {
    return fail("PRODUCT_BRANCH_MISMATCH", "Canonical product branch is not checked out");
  }
  const head = git(root, ["rev-parse", "HEAD"]);
  const status = git(root, ["status", "--porcelain=v1", "-uall"]);
  if (!head.ok || !SHA.test(head.stdout) || !status.ok) return fail("GIT_STATE_UNAVAILABLE", "Product Git state is unavailable");
  return { ok: true, root, head: head.stdout, clean: !status.stdout, binding };
}

function targetVersion(runtimeRoot, record, index) {
  const selected = readProductVersion({ runtimeRoot, buildId: record.buildId, adoptionIndex: index });
  if (!selected.ok) return selected;
  const version = selected.version;
  if (version.recordedBuildMatches === false || version.recordedBindingMatches === false) {
    return fail("RESTORE_TARGET_MISMATCH", "Historical version does not match this Build binding");
  }
  if (!version.git.resolvable || !version.sha) return fail("VERSION_UNRESOLVED", "Historical version commit is unavailable");
  const state = productState(record);
  if (!state.ok) return state;
  const tree = commitTree(state.root, version.sha);
  if (!tree) return fail("VERSION_UNRESOLVED", "Historical version tree is unavailable");
  return { ok: true, sha: version.sha, tree, state };
}

function candidateFacts(root, candidateSha, expectedSha, targetTreeSha) {
  if (!SHA.test(String(candidateSha || ""))) return false;
  const parents = git(root, ["rev-list", "--parents", "-n", "1", candidateSha]);
  const parts = parents.ok ? parents.stdout.split(/\s+/) : [];
  return parts.length === 2 && parts[0] === candidateSha && parts[1] === expectedSha &&
    commitTree(root, candidateSha) === targetTreeSha;
}

function tempPath(runtimeRoot, buildId, operationId) {
  return join(runtimeRoot, "restore-worktrees", buildId, operationId);
}

function cleanTemp(runtimeRoot, buildId, operationId, root) {
  const path = tempPath(runtimeRoot, buildId, operationId);
  if (existsSync(path)) git(root, ["worktree", "remove", path]);
}

function materialize(runtimeRoot, record, pending, root) {
  const path = tempPath(runtimeRoot, record.buildId, pending.operationId);
  mkdirSync(join(runtimeRoot, "restore-worktrees", record.buildId), { recursive: true });
  if (existsSync(path)) return fail("RESTORE_TEMP_EXISTS", "Restore preparation workspace already exists");
  const added = git(root, ["worktree", "add", "--detach", path, pending.expectedAuthoritativeSha]);
  if (!added.ok) return fail("RESTORE_PREPARE_FAILED", added.stderr || "Could not prepare restore workspace");
  const restored = git(path, ["restore", "--source", pending.targetSha, "--staged", "--worktree", "--", ":/"]);
  if (!restored.ok) return fail("RESTORE_PREPARE_FAILED", restored.stderr || "Could not materialize historical tree");
  const written = git(path, ["write-tree"]);
  if (!written.ok || written.stdout !== pending.targetTreeSha) {
    return fail("RESTORE_TREE_MISMATCH", "Prepared tree does not equal historical tree");
  }
  const committed = git(path, ["-c", "user.name=PATH Build", "-c", "user.email=path-build@localhost",
    "-c", "core.hooksPath=/dev/null", "commit", "-m", `PATH Build restore ${pending.targetAdoptionIndex}`]);
  if (!committed.ok) return fail("RESTORE_COMMIT_FAILED", committed.stderr || "Could not commit historical tree");
  const sha = git(path, ["rev-parse", "HEAD"]);
  if (!sha.ok || !candidateFacts(root, sha.stdout, pending.expectedAuthoritativeSha, pending.targetTreeSha)) {
    return fail("RESTORE_CANDIDATE_MISMATCH", "Prepared commit parent or tree is incorrect");
  }
  return { ok: true, candidateSha: sha.stdout };
}

function hardBlock(runtimeRoot, record, code, message) {
  record.loop.status = "blocked";
  record.loop.blockedReason = `Historical restore blocked: ${message}`;
  record.coordinator = { ...(record.coordinator || {}), autoRun: false };
  try { writeBuildRecord(runtimeRoot, record); } catch { /* pending record remains recovery authority */ }
  return fail(code, message);
}

function validatePending(runtimeRoot, record, pending) {
  if (!pending || typeof pending.operationId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(pending.operationId) ||
      !SHA.test(String(pending.expectedAuthoritativeSha || "")) ||
      !SHA.test(String(pending.targetSha || "")) ||
      !SHA.test(String(pending.targetTreeSha || "")) ||
      !Number.isSafeInteger(pending.targetAdoptionIndex) || pending.targetAdoptionIndex < 0 ||
      (pending.candidateSha !== null && !SHA.test(String(pending.candidateSha || ""))) ||
      record.authoritativeSha !== pending.expectedAuthoritativeSha) {
    return fail("RESTORE_STATE_INVALID", "Pending restore facts or Build authority do not match");
  }
  const target = targetVersion(runtimeRoot, record, pending.targetAdoptionIndex);
  if (!target.ok || target.sha !== pending.targetSha || target.tree !== pending.targetTreeSha) {
    return fail("RESTORE_TARGET_MISMATCH", "Historical restore target changed or became unavailable");
  }
  return { ok: true, state: target.state };
}

function finalize(runtimeRoot, record, pending, state) {
  if (!state.clean || state.head !== pending.candidateSha ||
      !candidateFacts(state.root, pending.candidateSha, pending.expectedAuthoritativeSha, pending.targetTreeSha)) {
    return hardBlock(runtimeRoot, record, "RESTORE_STATE_MISMATCH", "Adopted Git state cannot be verified");
  }
  const history = Array.isArray(record.adoptionHistory) ? record.adoptionHistory : [];
  const previous = history.find((row) => row?.restoreOperationId === pending.operationId);
  if (previous && (previous.parentSha !== pending.expectedAuthoritativeSha ||
      previous.adoptedSha !== pending.candidateSha || previous.restoreTargetAdoptionIndex !== pending.targetAdoptionIndex ||
      previous.restoreTargetSha !== pending.targetSha)) {
    return hardBlock(runtimeRoot, record, "RESTORE_OPERATION_CONFLICT", "Restore operation identity conflicts with history");
  }
  const changed = git(state.root, ["diff", "--no-ext-diff", "--name-only", "-z",
    pending.expectedAuthoritativeSha, pending.candidateSha, "--"]);
  if (!changed.ok) return hardBlock(runtimeRoot, record, "RESTORE_DIFF_FAILED", "Restored file change list is unavailable");
  if (!previous) history.push({
    buildId: record.buildId, parentSha: pending.expectedAuthoritativeSha,
    sourceSha: pending.candidateSha, adoptedSha: pending.candidateSha,
    projectRoot: state.root, productBranch: record.productBranch,
    files: changed.stdoutRaw.split("\0").filter(Boolean).slice(0, 40),
    mode: "historical_restore", adoptedAt: new Date().toISOString(),
    restoreTargetAdoptionIndex: pending.targetAdoptionIndex,
    restoreTargetSha: pending.targetSha, restoreOperationId: pending.operationId,
  });
  record.adoptionHistory = history;
  record.authoritativeSha = pending.candidateSha;
  delete record.pendingRestore;
  record.loop.status = "paused";
  record.loop.blockedReason = undefined;
  record.loop.pendingRuntimeRefresh = false;
  record.coordinator = { ...(record.coordinator || {}), autoRun: false };
  record.previewUrl = null;
  record.runtimeHealth = "n/a";
  try { writeBuildRecord(runtimeRoot, record); }
  catch { return fail("RESTORE_RECORD_WRITE_FAILED", "Git moved but Build finalization failed; recovery is required"); }
  cleanTemp(runtimeRoot, record.buildId, pending.operationId, state.root);
  return { ok: true, adoptedSha: pending.candidateSha, operationId: pending.operationId,
    build: readBuildRecord(runtimeRoot, record.buildId) };
}

/** Reconcile only a durable pending S2 restore. Never infer a replacement commit. */
export function recoverPendingHistoricalRestore({ runtimeRoot, buildId }) {
  if (typeof buildId !== "string" || !ID.test(buildId)) return fail("INVALID_BUILD_ID", "Invalid Build identity");
  const record = readBuildRecord(runtimeRoot, buildId);
  if (!record) return fail("BUILD_NOT_FOUND", "Build not found");
  const pending = record.pendingRestore;
  if (!pending) return { ok: true, skipped: true, build: record };
  const checked = validatePending(runtimeRoot, record, pending);
  if (!checked.ok) return hardBlock(runtimeRoot, record, checked.code, checked.message);
  const state = checked.state;
  if (!state.clean) return hardBlock(runtimeRoot, record, "PRIMARY_DIRTY", "Product working tree is dirty");
  if (pending.candidateSha === null) {
    if (state.head !== pending.expectedAuthoritativeSha) {
      return hardBlock(runtimeRoot, record, "RESTORE_HEAD_MISMATCH", "Unprepared restore has unexpected product HEAD");
    }
    delete record.pendingRestore;
    record.loop.status = "paused";
    record.coordinator = { ...(record.coordinator || {}), autoRun: false };
    writeBuildRecord(runtimeRoot, record);
    cleanTemp(runtimeRoot, buildId, pending.operationId, state.root);
    return { ok: true, aborted: true, build: readBuildRecord(runtimeRoot, buildId) };
  }
  if (!candidateFacts(state.root, pending.candidateSha, pending.expectedAuthoritativeSha, pending.targetTreeSha)) {
    return hardBlock(runtimeRoot, record, "RESTORE_CANDIDATE_MISMATCH", "Restore candidate is missing or does not match parent/tree");
  }
  if (state.head === pending.expectedAuthoritativeSha) {
    const adopted = adoptProductCommit({ projectRoot: state.root,
      sourceRef: pending.candidateSha, expectedHeadSha: pending.expectedAuthoritativeSha,
      expectedBranch: record.productBranch, expectedTreeSha: pending.targetTreeSha,
      fastForwardOnly: true });
    if (!adopted.ok) return hardBlock(runtimeRoot, record, adopted.code, adopted.message || "Product adoption failed");
    const after = productState(record);
    if (!after.ok) return hardBlock(runtimeRoot, record, after.code, after.message);
    return finalize(runtimeRoot, record, pending, after);
  }
  if (state.head === pending.candidateSha) return finalize(runtimeRoot, record, pending, state);
  return hardBlock(runtimeRoot, record, "RESTORE_HEAD_MISMATCH", "Product HEAD is neither previous authority nor restore candidate");
}

/** Begin a creator-confirmed restore. Caller serializes this with other Build mutations. */
export function restoreHistoricalProductVersion(input) {
  const allowed = new Set(["runtimeRoot", "buildId", "adoptionIndex", "expectedAuthoritativeSha"]);
  if (!input || typeof input !== "object" || Object.keys(input).some((key) => !allowed.has(key))) {
    return fail("INVALID_RESTORE_REQUEST", "Restore accepts only the canonical Build selector and expected authority");
  }
  const { runtimeRoot, buildId, adoptionIndex, expectedAuthoritativeSha } = input;
  if (typeof buildId !== "string" || !ID.test(buildId)) return fail("INVALID_BUILD_ID", "Invalid Build identity");
  if (!Number.isSafeInteger(adoptionIndex) || adoptionIndex < 0 || !SHA.test(String(expectedAuthoritativeSha || ""))) {
    return fail("INVALID_RESTORE_REQUEST", "Restore requires a historical adoption index and expected authority");
  }
  const record = readBuildRecord(runtimeRoot, buildId);
  if (!record) return fail("BUILD_NOT_FOUND", "Build not found");
  if (record.pendingRestore) return fail("RESTORE_PENDING", "A historical restore is already pending");
  if (record.authoritativeSha !== expectedAuthoritativeSha) {
    const prior = (record.adoptionHistory || []).find((row) =>
      row?.mode === "historical_restore" && row.parentSha === expectedAuthoritativeSha &&
      row.restoreTargetAdoptionIndex === adoptionIndex && row.adoptedSha === record.authoritativeSha);
    return prior ? { ok: true, deduped: true, adoptedSha: record.authoritativeSha, build: record }
      : fail("STALE_AUTHORITY", "Build authority changed since the restore was requested");
  }
  if (record.pendingCandidate || ["selected", "dispatched", "terminal_seen"].some((status) =>
      (record.children || []).some((child) => child.dispatchState === status))) {
    return fail("RESTORE_BUILD_BUSY", "Build has active engineering or a pending candidate");
  }
  const target = targetVersion(runtimeRoot, record, adoptionIndex);
  if (!target.ok) return target;
  const state = target.state;
  if (state.head !== expectedAuthoritativeSha) return fail("STALE_AUTHORITY", "Product HEAD differs from Build authority");
  if (!state.clean) return fail("PRIMARY_DIRTY", "Product working tree must be clean");
  const currentTree = commitTree(state.root, expectedAuthoritativeSha);
  if (!currentTree) return fail("CURRENT_VERSION_UNRESOLVED", "Current authority tree is unavailable");
  if (currentTree === target.tree) return { ok: true, noOp: true, authoritativeSha: expectedAuthoritativeSha, build: record };

  const pending = { operationId: randomUUID(), expectedAuthoritativeSha,
    targetAdoptionIndex: adoptionIndex, targetSha: target.sha, targetTreeSha: target.tree,
    candidateSha: null, createdAt: new Date().toISOString() };
  record.pendingRestore = pending;
  record.loop.status = "paused";
  record.coordinator = { ...(record.coordinator || {}), autoRun: false };
  writeBuildRecord(runtimeRoot, record);
  const prepared = materialize(runtimeRoot, record, pending, state.root);
  if (!prepared.ok) {
    // State A can be cleared only while the product remains exactly at A.
    const current = productState(record);
    if (current.ok && current.head === expectedAuthoritativeSha && current.clean) {
      const fresh = readBuildRecord(runtimeRoot, buildId);
      if (fresh?.pendingRestore?.operationId === pending.operationId && fresh.pendingRestore.candidateSha === null) {
        delete fresh.pendingRestore;
        fresh.loop.status = "paused";
        writeBuildRecord(runtimeRoot, fresh);
        cleanTemp(runtimeRoot, buildId, pending.operationId, state.root);
      }
    }
    return prepared;
  }
  const fresh = readBuildRecord(runtimeRoot, buildId);
  if (fresh?.pendingRestore?.operationId !== pending.operationId || fresh.authoritativeSha !== expectedAuthoritativeSha) {
    return hardBlock(runtimeRoot, fresh || record, "RESTORE_STATE_MISMATCH", "Restore intent changed during candidate preparation");
  }
  fresh.pendingRestore.candidateSha = prepared.candidateSha;
  writeBuildRecord(runtimeRoot, fresh);
  return recoverPendingHistoricalRestore({ runtimeRoot, buildId });
}
