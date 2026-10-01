/** P8.0 — read-only projection of adopted product versions from S2 and Git. */

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { resolveAg9RuntimeDirs } from "../ag9/layout.mjs";
import { assertAllowedProjectRoot } from "../paths.mjs";
import { BUILD_RECORD_SCHEMA } from "./record.mjs";

const BUILD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const COMMIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const failure = (code, message) => ({ ok: false, code, message });

function gitEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_OPTIONAL_LOCKS = "0";
  env.GIT_NO_REPLACE_OBJECTS = "1";
  return env;
}

function git(root, args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 16 * 1024 * 1024,
    env: gitEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function commitStatus(root, sha) {
  if (typeof sha !== "string" || !COMMIT_SHA.test(sha)) {
    return { resolvable: false, reason: "invalid_sha" };
  }
  const result = git(root, ["cat-file", "-e", `${sha}^{commit}`]);
  return result.status === 0
    ? { resolvable: true, reason: null }
    : { resolvable: false, reason: "commit_unavailable" };
}

function readVersionAuthority(runtimeRoot, buildId) {
  if (typeof buildId !== "string" || !BUILD_ID.test(buildId)) {
    return failure("INVALID_BUILD_ID", "Invalid Build identity");
  }
  // readBuildRecord's legacy path ensures runtime directories. A projection
  // instead reads that same canonical record without creating any directories.
  const path = join(resolveAg9RuntimeDirs(runtimeRoot).metadata, "builds", `${buildId}.build.json`);
  if (!existsSync(path)) return failure("BUILD_NOT_FOUND", "Build record not found");
  let record;
  try {
    if (!lstatSync(path).isFile()) return failure("INVALID_BUILD_RECORD", "Build record is not a regular file");
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return failure("INVALID_BUILD_RECORD", "Build record is unreadable or malformed");
  }
  if (record?.schema !== BUILD_RECORD_SCHEMA || record.buildId !== buildId) {
    return failure("INVALID_BUILD_RECORD", "Build record identity does not match");
  }
  const binding = record.projectBindings?.[0];
  if (typeof binding?.bindingId !== "string" || !binding.bindingId ||
      typeof binding.projectRoot !== "string" || !binding.projectRoot) {
    return failure("BUILD_NOT_BOUND", "Build has no canonical project binding");
  }
  const allowed = assertAllowedProjectRoot(binding.projectRoot);
  if (!allowed.ok) return failure(allowed.code, allowed.message);
  let root;
  try { root = realpathSync(binding.projectRoot); }
  catch { return failure("PROJECT_UNAVAILABLE", "Bound project root is unavailable"); }
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  let gitRoot;
  try { gitRoot = realpathSync(String(top.stdout || "").trim()); }
  catch { return failure("PROJECT_GIT_UNAVAILABLE", "Bound project Git repository is unavailable"); }
  if (top.status !== 0 || gitRoot !== root) {
    return failure("PROJECT_BINDING_MISMATCH", "Bound project is not the Git repository root");
  }
  return { ok: true, record, binding, root };
}

/** List adopted versions in persisted adoption order, plus the current SHA. */
export function listProductVersions({ runtimeRoot, buildId }) {
  const authority = readVersionAuthority(runtimeRoot, buildId);
  if (!authority.ok) return authority;
  const { record, binding, root } = authority;
  const history = Array.isArray(record.adoptionHistory) ? record.adoptionHistory : [];
  const currentSha = typeof record.authoritativeSha === "string" && record.authoritativeSha
    ? record.authoritativeSha : null;
  const latestCurrentIndex = currentSha === null ? null : history.findLastIndex((entry) => entry?.adoptedSha === currentSha);
  const versions = history.map((entry, adoptionIndex) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const sha = typeof item.adoptedSha === "string" ? item.adoptedSha : null;
    return {
      adoptionIndex,
      sha,
      current: latestCurrentIndex === adoptionIndex,
      git: commitStatus(root, sha),
      adoptedAt: typeof item.adoptedAt === "string" ? item.adoptedAt : null,
      taskId: typeof item.taskId === "string" ? item.taskId : null,
      actionId: typeof item.actionId === "string" ? item.actionId : null,
      intentRevision: Number.isSafeInteger(item.intentRevision) ? item.intentRevision : null,
      engine: typeof item.engine === "string" ? item.engine : null,
      resultId: typeof item.resultId === "string" ? item.resultId : null,
      sourceSha: typeof item.sourceSha === "string" ? item.sourceSha : null,
      parentSha: typeof item.parentSha === "string" ? item.parentSha : null,
      productBranch: typeof item.productBranch === "string" ? item.productBranch : null,
      mode: typeof item.mode === "string" ? item.mode : null,
      capability: typeof item.capability === "string" ? item.capability : null,
      capabilitySource: typeof item.capabilitySource === "string" ? item.capabilitySource : null,
      resultFingerprint: typeof item.resultFingerprint === "string" ? item.resultFingerprint : null,
      files: Array.isArray(item.files) ? item.files.filter((file) => typeof file === "string") : [],
      recordedBuildMatches: item.buildId === undefined ? null : item.buildId === buildId,
      recordedBindingMatches: item.projectRoot === undefined ? null : (() => {
        try { return realpathSync(item.projectRoot) === root; }
        catch { return false; }
      })(),
    };
  });
  return {
    ok: true,
    buildId,
    bindingId: binding.bindingId,
    projectRoot: root,
    current: currentSha === null ? null : {
      sha: currentSha,
      adoptionIndex: latestCurrentIndex < 0 ? null : latestCurrentIndex,
      git: commitStatus(root, currentSha),
    },
    versions,
  };
}

/** Read one adopted version by its stable append-only adoption position. */
export function readProductVersion({ runtimeRoot, buildId, adoptionIndex }) {
  if (!Number.isSafeInteger(adoptionIndex) || adoptionIndex < 0) {
    return failure("INVALID_VERSION_INDEX", "Invalid adoption position");
  }
  const listed = listProductVersions({ runtimeRoot, buildId });
  if (!listed.ok) return listed;
  const version = listed.versions[adoptionIndex];
  return version
    ? { ok: true, buildId, bindingId: listed.bindingId, current: listed.current, version }
    : failure("VERSION_NOT_FOUND", "Adopted version not found");
}

function selectCompareVersion(listed, selector, side) {
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
    return { ...failure("INVALID_VERSION_SELECTOR", "Version selector must be current or an adoption position"), side };
  }
  const keys = Object.keys(selector);
  if (selector.kind === "current" && keys.length === 1 && keys[0] === "kind") {
    return listed.current
      ? { ok: true, version: { kind: "current", adoptionIndex: listed.current.adoptionIndex, sha: listed.current.sha, git: listed.current.git } }
      : { ...failure("VERSION_NOT_FOUND", "Build has no current authoritative SHA"), side };
  }
  if (selector.kind === "adoption" && keys.length === 2 && keys.includes("kind") && keys.includes("adoptionIndex") &&
      Number.isSafeInteger(selector.adoptionIndex) && selector.adoptionIndex >= 0) {
    const adopted = listed.versions[selector.adoptionIndex];
    return adopted
      ? { ok: true, version: { kind: "adoption", adoptionIndex: adopted.adoptionIndex, sha: adopted.sha, git: adopted.git } }
      : { ...failure("VERSION_NOT_FOUND", "Adopted version not found"), side };
  }
  return { ...failure("INVALID_VERSION_SELECTOR", "Version selector must be current or an adoption position"), side };
}

function parseNameStatus(output) {
  const parts = output.split("\0");
  const files = [];
  for (let i = 0; i < parts.length && parts[i] !== "";) {
    const status = parts[i++];
    if (!/^[A-Z][0-9]{0,3}$/.test(status)) return null;
    const renamed = status[0] === "R" || status[0] === "C";
    const previousPath = renamed ? parts[i++] : null;
    const path = parts[i++];
    if (!path || (renamed && !previousPath)) return null;
    files.push({ path, previousPath, status });
  }
  return files;
}

function parseNumstat(output) {
  const parts = output.split("\0");
  const stats = new Map();
  for (let i = 0; i < parts.length && parts[i] !== "";) {
    const line = parts[i++];
    const match = /^([0-9]+|-)\t([0-9]+|-)\t([\s\S]*)$/.exec(line);
    if (!match) return null;
    let path = match[3];
    if (!path) {
      i += 1; // Rename: the next two NUL fields are old path, then new path.
      path = parts[i++];
    }
    if (!path) return null;
    const binary = match[1] === "-" && match[2] === "-";
    const additions = binary ? null : Number(match[1]);
    const deletions = binary ? null : Number(match[2]);
    if (!binary && (!Number.isSafeInteger(additions) || !Number.isSafeInteger(deletions))) return null;
    stats.set(path, {
      additions,
      deletions,
      binary,
    });
  }
  return stats;
}

/** Compare only two P8.0 members. Git reads commit trees, never the worktree. */
export function compareProductVersions({ runtimeRoot, buildId, base, target }) {
  const listed = listProductVersions({ runtimeRoot, buildId });
  if (!listed.ok) return listed;
  const baseSelection = selectCompareVersion(listed, base, "base");
  if (!baseSelection.ok) return baseSelection;
  const targetSelection = selectCompareVersion(listed, target, "target");
  if (!targetSelection.ok) return targetSelection;
  const baseVersion = baseSelection.version;
  const targetVersion = targetSelection.version;
  for (const [side, version] of [["base", baseVersion], ["target", targetVersion]]) {
    if (!version.git.resolvable) {
      return { ...failure("VERSION_UNRESOLVED", `${side} version cannot be resolved in the bound Git repository`), side, sha: version.sha, reason: version.git.reason };
    }
  }
  const args = ["diff", "--no-ext-diff", "--no-textconv", "--find-renames", "-z"];
  const names = git(listed.projectRoot, [...args, "--name-status", baseVersion.sha, targetVersion.sha, "--"]);
  const counts = git(listed.projectRoot, [...args, "--numstat", baseVersion.sha, targetVersion.sha, "--"]);
  if (names.status !== 0 || counts.status !== 0 || names.error || counts.error) {
    return failure("VERSION_COMPARE_FAILED", "Git could not compare the selected committed versions");
  }
  const changed = parseNameStatus(names.stdout);
  const stats = parseNumstat(counts.stdout);
  if (!changed || !stats) return failure("VERSION_COMPARE_FAILED", "Git returned an unreadable structural diff");
  const files = changed.map((entry) => {
    const stat = stats.get(entry.path);
    return {
      ...entry,
      additions: stat?.additions ?? null,
      deletions: stat?.deletions ?? null,
      binary: stat?.binary ?? false,
      statsKnown: Boolean(stat),
    };
  });
  const statsComplete = files.every((file) => file.statsKnown && !file.binary);
  return {
    ok: true,
    buildId,
    bindingId: listed.bindingId,
    base: baseVersion,
    target: targetVersion,
    files,
    summary: {
      changedFiles: files.length,
      additions: statsComplete ? files.reduce((sum, file) => sum + (file.additions ?? 0), 0) : null,
      deletions: statsComplete ? files.reduce((sum, file) => sum + (file.deletions ?? 0), 0) : null,
      binaryFiles: files.filter((file) => file.binary).length,
      statsComplete,
    },
  };
}
