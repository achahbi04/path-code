/**
 * Phase GC1-b — Workspace Hydrator.
 *
 * Syncs the ACTIVE LOCAL PATH worktree into a remote project root
 * (default /home/user/workspace) WITHOUT copying linked-worktree `.git`
 * file pointers (which contain absolute Mac paths like
 * `gitdir: /Users/.../worktrees/...` and are invalid remotely).
 *
 * Strategy (gitStrategy: "archive-init-snapshot"):
 *   1. Enumerate tracked + untracked project files (exclude junk).
 *   2. Build a local staging tarball of those files only (never `.git`).
 *   3. Upload via transport.writeRemoteFile / uploadTextFile when present,
 *      else base64 chunk upload through executeCommand.
 *   4. Extract under remoteRoot and `git init` + commit a snapshot so the
 *      remote is a proper repo suitable for engineering — not a broken
 *      worktree pointer.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";

export const DEFAULT_REMOTE_ROOT = "/home/user/workspace";

/** Directory / path segment names always excluded from hydration. */
export const HYDRATION_EXCLUDE_DIR_NAMES = Object.freeze([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".next",
  ".cache",
  ".caches",
  "caches",
  ".git",
  ".DS_Store",
]);

/** Glob-ish basename patterns excluded. */
export const HYDRATION_EXCLUDE_BASENAME_RE =
  /^(?:\.DS_Store|.*\.log)$/iu;

/**
 * @param {string} relPosix relative path using `/` separators
 * @returns {boolean}
 */
export function shouldExcludeHydrationPath(relPosix) {
  const parts = relPosix.split("/").filter(Boolean);
  if (parts.length === 0) return true;
  for (const part of parts) {
    if (HYDRATION_EXCLUDE_DIR_NAMES.includes(part)) return true;
    if (HYDRATION_EXCLUDE_BASENAME_RE.test(part)) return true;
  }
  // Extra: common cache directory prefixes
  if (parts.some((p) => p === ".npm" || p === ".pnpm-store" || p === ".yarn")) {
    return true;
  }
  return false;
}

/**
 * @param {string} localRoot
 * @returns {Promise<string[]>} posix-relative paths to include
 */
export async function listHydrationFiles(localRoot) {
  const root = resolve(localRoot);
  const tracked = gitLines(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  /** @type {Set<string>} */
  const selected = new Set();

  for (const rel of tracked) {
    if (!rel || shouldExcludeHydrationPath(rel)) continue;
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    try {
      if (!statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    selected.add(rel);
  }

  // Never include .git (file or directory) — linked worktree pointer leak.
  selected.delete(".git");

  return [...selected].sort();
}

/**
 * @param {{ transport: object, localRoot: string, remoteRoot?: string, workstationName?: string }} opts
 */
export function createWorkspaceHydrator(opts) {
  const {
    transport,
    localRoot,
    remoteRoot = DEFAULT_REMOTE_ROOT,
    workstationName = "pathcode-gc1-probe",
  } = opts;

  if (!transport) throw new Error("createWorkspaceHydrator requires transport");
  if (!localRoot) throw new Error("createWorkspaceHydrator requires localRoot");

  const confinedRemoteRoot = assertSafeRemoteRoot(remoteRoot);

  return {
    remoteRoot: confinedRemoteRoot,
    gitStrategy: "archive-init-snapshot",

    listFiles: () => listHydrationFiles(localRoot),

    /**
     * Hydrate local worktree → remoteRoot.
     * @returns {Promise<{ filesTransferred: number, bytes: number, durationMs: number, remoteRoot: string, gitStrategy: string }>}
     */
    async hydrate() {
      const t0 = Date.now();
      const files = await listHydrationFiles(localRoot);
      assertNoGitPointerIncluded(files);

      const staging = mkdtempSync(join(tmpdir(), "gc1-hydrate-"));
      const archivePath = join(staging, "workspace.tgz");
      let bytes = 0;
      try {
        bytes = await createFilteredArchive(localRoot, files, archivePath);
        await uploadAndExtractArchive({
          transport,
          workstationName,
          archivePath,
          remoteRoot: confinedRemoteRoot,
          files,
          localRoot,
        });
        await initRemoteGitSnapshot({
          transport,
          workstationName,
          remoteRoot: confinedRemoteRoot,
        });
      } finally {
        try {
          rmSync(staging, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }

      return {
        filesTransferred: files.length,
        bytes,
        durationMs: Date.now() - t0,
        remoteRoot: confinedRemoteRoot,
        gitStrategy: "archive-init-snapshot",
      };
    },

    /**
     * Run a remote command with default cwd = hydrated remoteRoot.
     * @param {string} command
     * @param {{ cwd?: string, weakenDefaultCwd?: boolean }} [runOpts]
     */
    async run(command, runOpts = {}) {
      return runInWorkspace({
        transport,
        workstationName,
        remoteRoot: confinedRemoteRoot,
        command,
        cwd: runOpts.cwd,
        weakenDefaultCwd: runOpts.weakenDefaultCwd === true,
      });
    },
  };
}

/**
 * Resolve and confine a cwd under remoteRoot. Rejects traversal.
 * @param {string} remoteRoot
 * @param {string} [cwd]
 */
export function resolveConfinedWorkspaceCwd(remoteRoot, cwd) {
  const root = assertSafeRemoteRoot(remoteRoot);
  if (cwd == null || cwd === "" || cwd === ".") return root;

  const candidate = cwd.startsWith("/")
    ? posix.normalize(cwd)
    : posix.normalize(posix.join(root, cwd));

  if (candidate !== root && !candidate.startsWith(`${root}/`)) {
    const err = new Error(
      `GC1 hydration confinement: cwd ${cwd} escapes remoteRoot ${root}`,
    );
    err.code = "GC1_HYDRATION_CONFINEMENT";
    throw err;
  }
  // Block .. after normalize already — also refuse null bytes / Mac abs paths
  if (candidate.includes("\0") || /^\/Users\//.test(candidate)) {
    const err = new Error(
      `GC1 hydration confinement: refused unsafe cwd ${cwd}`,
    );
    err.code = "GC1_HYDRATION_CONFINEMENT";
    throw err;
  }
  return candidate;
}

/**
 * @param {object} opts
 */
export async function runInWorkspace(opts) {
  const {
    transport,
    workstationName,
    remoteRoot,
    command,
    cwd,
    weakenDefaultCwd = false,
  } = opts;

  if (weakenDefaultCwd) {
    // Falsification hook: intentionally skip workspace cd.
    return transport.executeCommand({ workstationName, command });
  }

  const safeCwd = resolveConfinedWorkspaceCwd(remoteRoot, cwd);
  const wrapped = `cd ${shQuote(safeCwd)} && ${command}`;
  return transport.executeCommand({ workstationName, command: wrapped });
}

function assertSafeRemoteRoot(remoteRoot) {
  const root = posix.normalize(String(remoteRoot || DEFAULT_REMOTE_ROOT));
  if (!root.startsWith("/") || root === "/" || root.includes("\0")) {
    const err = new Error(`unsafe remoteRoot: ${remoteRoot}`);
    err.code = "GC1_HYDRATION_CONFINEMENT";
    throw err;
  }
  if (root.split("/").includes("..")) {
    const err = new Error(`remoteRoot must not contain ..: ${remoteRoot}`);
    err.code = "GC1_HYDRATION_CONFINEMENT";
    throw err;
  }
  return root;
}

function assertNoGitPointerIncluded(files) {
  for (const f of files) {
    if (f === ".git" || f.startsWith(".git/")) {
      const err = new Error(
        "hydrator refused to include .git (linked worktree pointer leak)",
      );
      err.code = "GC1_GIT_POINTER_LEAK";
      throw err;
    }
  }
}

/**
 * @param {string} root
 * @param {string[]} args
 * @returns {string[]}
 */
function gitLines(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    // Fallback: empty — caller may still tar via walk if needed; for GC1 we
    // require a git worktree. Surface stderr for diagnosis.
    const err = new Error(
      `git ${args[0]} failed: ${(r.stderr || Buffer.alloc(0)).toString("utf8")}`,
    );
    err.code = "GC1_HYDRATION_GIT";
    throw err;
  }
  const buf = r.stdout || Buffer.alloc(0);
  if (args.includes("-z")) {
    return buf
      .toString("utf8")
      .split("\0")
      .map((s) => s.replace(/\\/g, "/"))
      .filter(Boolean);
  }
  return buf
    .toString("utf8")
    .split("\n")
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

/**
 * Create tar.gz of selected relative files. Does NOT include `.git`.
 * @returns {Promise<number>} archive byte length
 */
async function createFilteredArchive(localRoot, files, archivePath) {
  const listFile = join(archivePath + ".list");
  writeFileSync(listFile, files.join("\n") + (files.length ? "\n" : ""), "utf8");

  // tar -T filelist -czf archive; runs from localRoot so paths stay relative.
  const r = spawnSync(
    "tar",
    ["-czf", archivePath, "-C", localRoot, "-T", listFile],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`tar create failed: ${r.stderr || r.stdout || r.status}`);
  }
  return statSync(archivePath).size;
}

async function uploadAndExtractArchive({
  transport,
  workstationName,
  archivePath,
  remoteRoot,
  files,
  localRoot,
}) {
  const archiveBuf = readFileSync(archivePath);
  const remoteTar = posix.join(remoteRoot, ".gc1-hydrate-staging.tgz");
  const b64 = archiveBuf.toString("base64");

  // Prefer transport helpers (mock + optional live).
  if (typeof transport.writeRemoteFile === "function") {
    await transport.writeRemoteFile({
      remotePath: remoteTar,
      content: b64,
      encoding: "utf8",
      binaryBase64: true,
    });
  } else if (typeof transport.uploadTextFile === "function") {
    await transport.uploadTextFile({ remotePath: remoteTar, text: b64 });
  } else {
    await uploadArchiveViaCommands({
      transport,
      workstationName,
      remotePath: remoteTar,
      archiveBuf,
      b64,
    });
  }

  // Materialize file tree for mock (no real remote tar); live uses shell.
  if (typeof transport.materializeHydrationFiles === "function") {
    /** @type {Array<{ relativePath: string, content: Buffer }>} */
    const payloads = [];
    for (const rel of files) {
      payloads.push({
        relativePath: rel,
        content: readFileSync(join(localRoot, rel)),
      });
    }
    await transport.materializeHydrationFiles({
      remoteRoot,
      files: payloads,
      archiveRemotePath: remoteTar,
    });
  } else {
    const cmd = [
      `mkdir -p ${shQuote(remoteRoot)}`,
      // Binary stdin upload lands a real .tgz; chunk fallback lands base64 text.
      `(tar -xzf ${shQuote(remoteTar)} -C ${shQuote(remoteRoot)} 2>/dev/null) || (` +
        `(base64 -d ${shQuote(remoteTar)} > ${shQuote(remoteTar + ".bin")} 2>/dev/null || ` +
        `base64 --decode ${shQuote(remoteTar)} > ${shQuote(remoteTar + ".bin")}) && ` +
        `tar -xzf ${shQuote(remoteTar + ".bin")} -C ${shQuote(remoteRoot)})`,
      `rm -f ${shQuote(remoteTar)} ${shQuote(remoteTar + ".bin")}`,
    ].join(" && ");
    const result = await transport.executeCommand({
      workstationName,
      command: cmd,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `remote extract failed (exit=${result.exitCode}): ${result.stderr}`,
      );
    }
  }
}

/**
 * Live path: one stdin-piped binary upload over the Control-SA tunnel.
 * Fallback: base64 chunked printf for transports without stdin.
 */
async function uploadArchiveViaCommands({
  transport,
  workstationName,
  remotePath,
  archiveBuf,
  b64,
}) {
  const dir = posix.dirname(remotePath);
  const mkdir = await transport.executeCommand({
    workstationName,
    command: `mkdir -p ${shQuote(dir)}`,
  });
  if (mkdir.exitCode !== 0) {
    throw new Error(`mkdir for upload failed: ${mkdir.stderr}`);
  }

  const piped = await transport.executeCommand({
    workstationName,
    command: `cat > ${shQuote(remotePath)}`,
    stdin: archiveBuf,
  });
  if (piped.exitCode === 0) {
    const check = await transport.executeCommand({
      workstationName,
      command: `test -s ${shQuote(remotePath)} && echo OK`,
    });
    if (check.exitCode === 0 && /OK/.test(check.stdout || "")) return;
  }

  // Chunked base64 fallback (mock / no-stdin transports).
  await transport.executeCommand({
    workstationName,
    command: `: > ${shQuote(remotePath)}`,
  });
  const chunkSize = 12_000;
  for (let i = 0; i < b64.length; i += chunkSize) {
    const chunk = b64.slice(i, i + chunkSize);
    const result = await transport.executeCommand({
      workstationName,
      command: `printf '%s' ${shQuote(chunk)} >> ${shQuote(remotePath)}`,
    });
    if (result.exitCode !== 0) {
      throw new Error(`chunk upload failed: ${result.stderr}`);
    }
  }
}

async function initRemoteGitSnapshot({ transport, workstationName, remoteRoot }) {
  if (typeof transport.initRemoteGitSnapshot === "function") {
    await transport.initRemoteGitSnapshot({
      remoteRoot,
      message: "gc1 hydrate snapshot",
    });
    return;
  }
  const cmd = [
    `cd ${shQuote(remoteRoot)}`,
    // Refuse to keep a leaked Mac worktree pointer if one somehow arrived.
    `if [ -f .git ] && grep -q '^gitdir:' .git 2>/dev/null; then rm -f .git; fi`,
    `git init -q`,
    `git add -A`,
    `git -c user.email=gc1@pathcode.local -c user.name=gc1 commit -qm 'gc1 hydrate snapshot' || true`,
  ].join(" && ");
  const result = await transport.executeCommand({
    workstationName,
    command: cmd,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `remote git init failed (exit=${result.exitCode}): ${result.stderr}`,
    );
  }
}

function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
