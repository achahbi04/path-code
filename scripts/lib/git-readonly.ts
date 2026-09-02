/**
 * Read-only Git primitives for ledger verifier tooling.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { assertExactFullSha } from "./path-safety.js";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 30_000;
const MAX_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_EVIDENCE_DOCUMENT_BYTES = 2 * 1024 * 1024;

export async function gitRevParseHead(repoRoot: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "HEAD"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      shell: false,
    },
  );
  const sha = stdout.trim();
  assertExactFullSha(sha, "HEAD");
  return sha;
}

export async function gitCommitExists(
  repoRoot: string,
  sha: string,
): Promise<boolean> {
  assertExactFullSha(sha, "commit");
  try {
    await execFileAsync(
      "git",
      ["cat-file", "-e", `${sha}^{commit}`],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        shell: false,
      },
    );
    return true;
  } catch {
    return false;
  }
}

export async function gitIsAncestor(
  repoRoot: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  assertExactFullSha(ancestor, "ancestor");
  assertExactFullSha(descendant, "descendant");
  try {
    await execFileAsync(
      "git",
      ["merge-base", "--is-ancestor", ancestor, descendant],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        shell: false,
      },
    );
    return true;
  } catch {
    return false;
  }
}

export async function gitFileExistsAtCommit(
  repoRoot: string,
  path: string,
  commit: string,
): Promise<boolean> {
  assertExactFullSha(commit, "commit");
  try {
    await execFileAsync(
      "git",
      ["cat-file", "-e", `${commit}:${path}`],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        shell: false,
      },
    );
    return true;
  } catch {
    return false;
  }
}

export async function gitReadFileAtCommit(
  repoRoot: string,
  path: string,
  commit: string,
): Promise<string> {
  assertExactFullSha(commit, "commit");
  const { stdout } = await execFileAsync(
    "git",
    ["show", `${commit}:${path}`],
    {
      cwd: repoRoot,
      encoding: "buffer",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_EVIDENCE_DOCUMENT_BYTES,
      shell: false,
    },
  );
  return stdout.toString("utf8");
}

export async function gitDiffNameOnly(
  repoRoot: string,
  fromCommit: string,
  toCommit: string,
): Promise<string[]> {
  assertExactFullSha(fromCommit, "fromCommit");
  assertExactFullSha(toCommit, "toCommit");
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", fromCommit, toCommit, "--", "src"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      shell: false,
    },
  );
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function gitDiffNameOnlyUnderPrefix(
  repoRoot: string,
  fromCommit: string,
  toCommit: string,
  directoryPrefix: string,
): Promise<string[]> {
  assertExactFullSha(fromCommit, "fromCommit");
  assertExactFullSha(toCommit, "toCommit");
  const normalized = directoryPrefix.endsWith("/")
    ? directoryPrefix
    : `${directoryPrefix}/`;
  if (!normalized.startsWith("src/")) {
    throw new Error("directoryPrefix must be under src/");
  }
  if (normalized.includes("\0") || normalized.includes("..")) {
    throw new Error("unsafe directoryPrefix");
  }
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", fromCommit, toCommit, "--", normalized],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      shell: false,
    },
  );
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
