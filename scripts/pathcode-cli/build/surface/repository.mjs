/**
 * Local repository connection over the product Git checkout.
 * GitHub CLI is optional and explicit. PATH does not store tokens.
 */

import { spawnSync } from "node:child_process";

/**
 * @param {string} projectRoot
 * @param {string[]} args
 */
function git(projectRoot, args) {
  return spawnSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 30_000,
  });
}

function headSha(projectRoot) {
  const out = git(projectRoot, ["rev-parse", "HEAD"]);
  return out.status === 0 ? out.stdout.trim() : null;
}

/**
 * @param {string | null | undefined} url
 */
export function remoteKind(url) {
  const text = String(url || "");
  if (/github\.com[:/]/i.test(text)) return "github";
  if (!text) return "local";
  return "remote";
}

export function detectGitHubCli() {
  const version = spawnSync("gh", ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  if (version.status !== 0) {
    return { available: false, authenticated: false };
  }
  const auth = spawnSync("gh", ["auth", "status"], {
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
  });
  return { available: true, authenticated: auth.status === 0 };
}

/**
 * @param {string} projectRoot
 * @param {object | null | undefined} record
 */
export function inspectRepository(projectRoot, record) {
  const stored = record?.repository && typeof record.repository === "object" ? record.repository : {};
  const remote = git(projectRoot, ["remote", "get-url", "origin"]);
  const remoteUrl = remote.status === 0 ? remote.stdout.trim() : null;
  const kind = remoteKind(remoteUrl);
  let validated = false;
  if (remoteUrl) {
    const probe = git(projectRoot, ["ls-remote", "--heads", "origin"]);
    validated = probe.status === 0;
  }
  return {
    state: !remoteUrl ? "local" : validated && kind === "github" ? "github" : validated ? "connected" : "local",
    validated: Boolean(remoteUrl && validated),
    kind: remoteUrl ? kind : "local",
    remoteUrl: remoteUrl || null,
    syncAdopted: stored.syncAdopted === true,
    lastSyncedSha: stored.lastSyncedSha || null,
    lastSyncError: stored.lastSyncError || null,
    lastSyncedAt: stored.lastSyncedAt || null,
    github: detectGitHubCli(),
  };
}

/**
 * @param {object} record
 * @param {string} projectRoot
 * @param {string} remoteUrl
 */
export function connectLocalRemote(record, projectRoot, remoteUrl) {
  const url = String(remoteUrl || "").trim();
  if (!url) return { ok: false, code: "REMOTE_REQUIRED" };
  const existing = git(projectRoot, ["remote", "get-url", "origin"]);
  const args =
    existing.status === 0
      ? ["remote", "set-url", "origin", url]
      : ["remote", "add", "origin", url];
  const added = git(projectRoot, args);
  if (added.status !== 0) {
    return { ok: false, code: "REMOTE_ADD_FAILED", message: "Could not set the local remote." };
  }
  const probe = git(projectRoot, ["ls-remote", "--heads", "origin"]);
  if (probe.status !== 0) {
    return { ok: false, code: "REMOTE_UNREACHABLE", message: "The remote did not answer." };
  }
  record.repository = {
    ...(record.repository || {}),
    remoteUrl: url,
    kind: remoteKind(url),
    validated: true,
    syncAdopted: record.repository?.syncAdopted === true,
  };
  return { ok: true, repository: inspectRepository(projectRoot, record) };
}

/**
 * Explicit GitHub repository creation. Not used by automated qualification.
 *
 * @param {object} record
 * @param {string} projectRoot
 * @param {{ name: string, visibility?: string }} input
 */
export function connectGitHubRepository(record, projectRoot, input) {
  const github = detectGitHubCli();
  if (!github.available || !github.authenticated) {
    return {
      ok: false,
      code: "GITHUB_UNAVAILABLE",
      message: "GitHub CLI is not authenticated. PATH does not store GitHub credentials.",
    };
  }
  const name = String(input.name || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .slice(0, 80);
  if (!name) return { ok: false, code: "NAME_REQUIRED" };
  const visibility = input.visibility === "public" ? "--public" : "--private";
  const created = spawnSync(
    "gh",
    ["repo", "create", name, visibility, "--source", projectRoot, "--remote", "origin"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    },
  );
  if (created.status !== 0) {
    return {
      ok: false,
      code: "GITHUB_CREATE_FAILED",
      message: "GitHub repository was not created.",
    };
  }
  record.repository = {
    ...(record.repository || {}),
    kind: "github",
    validated: true,
    syncAdopted: false,
  };
  return { ok: true, repository: inspectRepository(projectRoot, record) };
}

/**
 * @param {object} record
 * @param {string} projectRoot
 * @param {boolean} enabled
 */
export function setAdoptedSync(record, projectRoot, enabled) {
  record.repository = {
    ...(record.repository || {}),
    syncAdopted: enabled === true,
  };
  return { ok: true, repository: inspectRepository(projectRoot, record) };
}

/**
 * Push only the adopted authoritative SHA. A failed push leaves HEAD untouched.
 *
 * @param {object} record
 * @param {string} projectRoot
 * @param {string | null | undefined} requestedSha
 */
export function pushAdoptedRevision(record, projectRoot, requestedSha) {
  const authoritative = String(record?.authoritativeSha || "");
  const requested = String(requestedSha || authoritative);
  if (!/^[0-9a-f]{7,40}$/i.test(authoritative)) {
    return { ok: false, code: "NO_ADOPTED_SHA" };
  }
  if (requested.toLowerCase() !== authoritative.toLowerCase()) {
    return { ok: false, code: "UNADOPTED_SHA" };
  }
  const branch = String(record?.productBranch || "").trim();
  if (!branch || branch.startsWith("path/task-")) {
    return { ok: false, code: "PRODUCT_BRANCH_REQUIRED" };
  }
  const before = headSha(projectRoot);
  const pushed = git(projectRoot, ["push", "origin", `${authoritative}:refs/heads/${branch}`]);
  const after = headSha(projectRoot);
  if (before && after && before !== after) {
    return { ok: false, code: "LOCAL_HEAD_CHANGED" };
  }
  record.repository = record.repository || {};
  record.repository.lastSyncedAt = new Date().toISOString();
  if (pushed.status !== 0) {
    record.repository.lastSyncError = "Push failed. The local product was left unchanged.";
    return {
      ok: false,
      code: "PUSH_FAILED",
      message: record.repository.lastSyncError,
      head: after,
    };
  }
  record.repository.lastSyncedSha = authoritative;
  record.repository.lastSyncError = null;
  return { ok: true, sha: authoritative, head: after };
}

/**
 * @param {object} record
 * @param {string} projectRoot
 */
export function syncAdoptedRevisionIfEnabled(record, projectRoot) {
  if (record?.repository?.syncAdopted !== true) return { ok: true, skipped: true };
  return pushAdoptedRevision(record, projectRoot, record.authoritativeSha);
}

/**
 * Remove PATH's local origin remote. Does not delete the remote repository.
 *
 * @param {object} record
 * @param {string} projectRoot
 * @param {boolean} confirm
 */
export function disconnectRepository(record, projectRoot, confirm) {
  if (confirm !== true) return { ok: false, code: "CONFIRM_REQUIRED" };
  const removed = git(projectRoot, ["remote", "remove", "origin"]);
  if (removed.status !== 0 && !/No such remote/i.test(removed.stderr || "")) {
    return { ok: false, code: "DISCONNECT_FAILED" };
  }
  record.repository = {
    ...(record.repository || {}),
    remoteUrl: null,
    kind: "local",
    validated: false,
    syncAdopted: false,
  };
  return { ok: true, repository: inspectRepository(projectRoot, record) };
}
