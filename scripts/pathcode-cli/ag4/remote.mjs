/**
 * AG4 — GitHub readiness + remote target resolution via `gh` + git.
 */

import { spawnSync } from "node:child_process";

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 */
function git(cwd, args, env = process.env) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 30_000,
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
}

/**
 * @param {readonly string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number }} [opts]
 */
export function runGhJson(args, opts = {}) {
  const r = spawnSync("gh", args, {
    cwd: opts.cwd ?? process.cwd(),
    encoding: "utf8",
    // Never attach the operator TTY to gh — AG4 approval owns stdin.
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...(opts.env || {}), GIT_TERMINAL_PROMPT: "0" },
    timeout: opts.timeoutMs ?? 60_000,
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

/**
 * @param {string} url
 */
export function parseGitHubRemoteUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (/https?:\/\/[^/@]*:[^/@]*@/i.test(raw) || /git@[^:]+:[^@]*@/.test(raw)) {
    return { ok: false, code: "REMOTE_URL_HAS_CREDENTIALS", message: "Remote URL contains embedded credentials." };
  }
  // git@host:owner/repo.git
  let m = raw.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/i);
  if (m) {
    return {
      ok: true,
      host: m[1],
      owner: m[2],
      repo: m[3].replace(/\.git$/i, ""),
      url: raw,
    };
  }
  // ssh://git@host/owner/repo.git
  m = raw.match(/^ssh:\/\/git@([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (m) {
    return {
      ok: true,
      host: m[1],
      owner: m[2],
      repo: m[3].replace(/\.git$/i, ""),
      url: raw,
    };
  }
  // https://host/owner/repo.git
  m = raw.match(/^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (m) {
    const host = m[1].toLowerCase();
    if (host !== "github.com" && !host.endsWith(".github.com") && host !== "www.github.com") {
      // Still accept github enterprise hosts that look like github.
      if (!/github/i.test(host)) return null;
    }
    return {
      ok: true,
      host: m[1],
      owner: m[2],
      repo: m[3].replace(/\.git$/i, ""),
      url: raw,
    };
  }
  return null;
}

/**
 * @param {string} projectRoot
 */
export function listRemotes(projectRoot) {
  const names = git(projectRoot, ["remote"]);
  if (names.status !== 0) return [];
  const out = [];
  for (const name of names.stdout.split(/\r?\n/).filter(Boolean)) {
    const push = git(projectRoot, ["remote", "get-url", "--push", name]);
    const fetch = git(projectRoot, ["remote", "get-url", name]);
    out.push({
      name,
      pushUrl: push.status === 0 ? push.stdout : "",
      fetchUrl: fetch.status === 0 ? fetch.stdout : "",
    });
  }
  return out;
}

/**
 * @param {string} projectRoot
 */
export function assertGithubCliReady(projectRoot) {
  const which = spawnSync("gh", ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (which.error || which.status !== 0) {
    return {
      ok: false,
      code: "GITHUB_CLI_REQUIRED",
      message: "GitHub CLI (gh) is required for GitHub delivery. Install gh and retry.",
    };
  }
  const auth = runGhJson(["auth", "status"], { cwd: projectRoot });
  // gh auth status writes human text to stderr; exit 0 = authenticated.
  if (auth.status !== 0) {
    return {
      ok: false,
      code: "GITHUB_AUTH_REQUIRED",
      message: "GitHub CLI is not authenticated. Run: gh auth login",
    };
  }
  return { ok: true };
}

/**
 * Deterministic GitHub remote selection (mandate §6).
 * @param {string} projectRoot
 */
export function resolveGithubRemoteTarget(projectRoot) {
  const remotes = listRemotes(projectRoot);
  /** @type {Array<{ name: string, pushUrl: string, parsed: any }>} */
  const github = [];
  for (const r of remotes) {
    const url = r.pushUrl || r.fetchUrl;
    const parsed = parseGitHubRemoteUrl(url);
    if (!parsed) continue;
    if (parsed.ok === false) return parsed;
    github.push({ name: r.name, pushUrl: url, parsed });
  }
  if (github.length === 0) {
    return {
      ok: false,
      code: "GITHUB_REMOTE_REQUIRED",
      message: "No GitHub remote found. Add a GitHub remote and retry.",
    };
  }

  const pushDefault = git(projectRoot, ["config", "--get", "remote.pushDefault"]);
  if (pushDefault.status === 0 && pushDefault.stdout) {
    const hit = github.find((g) => g.name === pushDefault.stdout);
    if (hit) {
      return finalizeTarget(projectRoot, hit);
    }
  }
  const origin = github.find((g) => g.name === "origin");
  if (origin) return finalizeTarget(projectRoot, origin);
  if (github.length === 1) return finalizeTarget(projectRoot, github[0]);
  return {
    ok: false,
    code: "REMOTE_TARGET_AMBIGUOUS",
    message:
      "Multiple GitHub remotes found and none is an unambiguous publication target. Set remote.pushDefault or use a single GitHub remote.",
  };
}

/**
 * @param {string} projectRoot
 * @param {{ name: string, pushUrl: string, parsed: any }} hit
 */
function finalizeTarget(projectRoot, hit) {
  const nwo = `${hit.parsed.owner}/${hit.parsed.repo}`;
  const view = runGhJson(
    [
      "repo",
      "view",
      nwo,
      "--json",
      "viewerPermission,defaultBranchRef,nameWithOwner,url",
    ],
    { cwd: projectRoot },
  );
  if (view.status !== 0) {
    // Fall back to local default branch if gh view fails for network; permission unknown.
    const sym = git(projectRoot, ["symbolic-ref", "refs/remotes/" + hit.name + "/HEAD"]);
    let baseBranch = "main";
    if (sym.status === 0) {
      const m = sym.stdout.match(/refs\/remotes\/[^/]+\/(.+)$/);
      if (m) baseBranch = m[1];
    }
    return {
      ok: true,
      remoteName: hit.name,
      pushUrl: hit.pushUrl,
      host: hit.parsed.host,
      owner: hit.parsed.owner,
      repo: hit.parsed.repo,
      nameWithOwner: nwo,
      baseBranch,
      viewerPermission: null,
      repoUrl: null,
      permissionPreflightOk: false,
      permissionMessage: view.stderr || "Could not read viewerPermission",
    };
  }
  let json;
  try {
    json = JSON.parse(view.stdout);
  } catch {
    return {
      ok: false,
      code: "GITHUB_AUTH_REQUIRED",
      message: "Could not parse GitHub repository metadata.",
    };
  }
  const perm = typeof json.viewerPermission === "string" ? json.viewerPermission : "";
  const baseBranch =
    json?.defaultBranchRef?.name && typeof json.defaultBranchRef.name === "string"
      ? json.defaultBranchRef.name
      : "main";
  const writeOk = /^(WRITE|MAINTAIN|ADMIN)$/i.test(perm);
  return {
    ok: true,
    remoteName: hit.name,
    pushUrl: hit.pushUrl,
    host: hit.parsed.host,
    owner: hit.parsed.owner,
    repo: hit.parsed.repo,
    nameWithOwner: typeof json.nameWithOwner === "string" ? json.nameWithOwner : nwo,
    baseBranch,
    viewerPermission: perm || null,
    repoUrl: typeof json.url === "string" ? json.url : null,
    permissionPreflightOk: writeOk,
    permissionMessage: writeOk
      ? null
      : `GitHub permission ${perm || "(none)"} is below WRITE.`,
  };
}

/**
 * @param {ReturnType<typeof resolveGithubRemoteTarget>} target
 */
export function assertWritePermission(target) {
  if (!target || target.ok !== true) return target;
  if (target.permissionPreflightOk) return { ok: true, target };
  return {
    ok: false,
    code: "REMOTE_PUSH_NOT_AUTHORIZED",
    message:
      target.permissionMessage ||
      "Authenticated GitHub account cannot push to this repository.",
  };
}
