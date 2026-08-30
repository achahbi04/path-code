/**
 * Private, fixed-purpose Git executable runner for discovery only.
 *
 * Uses structured execFile — never shell.
 * Not a general process execution API (Phase 4).
 *
 * Limitation: executable resolution trusts the inherited PATH. A compromised
 * PATH can substitute a malicious binary named "git". Absolute/pinned Git
 * executable resolution is not implemented in Phase 1D.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { buildGitChildEnvironment } from "./environment.js";
import {
  gitDiscoveryFailure,
  type GitDiscoveryFailure,
} from "./failure.js";

const execFileAsync = promisify(execFile);

/** Finite timeout appropriate for tiny rev-parse responses. */
const GIT_DISCOVERY_TIMEOUT_MS = 5_000;

/** Bound output — discovery responses are short paths/flags. */
const GIT_DISCOVERY_MAX_BUFFER = 64 * 1024;

export type GitRunRequest = {
  readonly cwd: string;
  readonly args: readonly string[];
  /** Defaults to "git" via PATH lookup. */
  readonly executable?: string;
  /** Defaults to sanitized process.env. Tests may supply an explicit object. */
  readonly env?: NodeJS.ProcessEnv;
};

export type GitRunSuccess = {
  readonly stdout: string;
  readonly stderr: string;
};

type NodeErrnoException = Error & {
  readonly code?: string;
  readonly stdout?: string | Buffer;
  readonly stderr?: string | Buffer;
};

function isNodeErrnoException(error: unknown): error is NodeErrnoException {
  return typeof error === "object" && error !== null;
}

/**
 * Strip only the trailing Git protocol newline terminator.
 * Do not trim spaces that may be valid path characters.
 */
export function stripGitStdoutTerminator(output: string): string {
  return output.replace(/\r?\n$/, "");
}

/**
 * Run a fixed Git argument vector with discovery bounds.
 * Production callers must only pass read-only discovery args.
 */
export async function runGit(
  request: GitRunRequest,
): Promise<Result<GitRunSuccess, GitDiscoveryFailure>> {
  const executable = request.executable ?? "git";
  const env = request.env ?? buildGitChildEnvironment();

  try {
    const result = await execFileAsync(executable, [...request.args], {
      cwd: request.cwd,
      env,
      timeout: GIT_DISCOVERY_TIMEOUT_MS,
      maxBuffer: GIT_DISCOVERY_MAX_BUFFER,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
    });

    return success({
      stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout),
      stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr),
    });
  } catch (error: unknown) {
    if (isNodeErrnoException(error) && error.code === "ENOENT") {
      return failure(
        gitDiscoveryFailure(
          "GIT_NOT_AVAILABLE",
          "Git executable was not found",
          { fsCode: "ENOENT" },
        ),
      );
    }

    if (isNodeErrnoException(error) && error.code === "ETIMEDOUT") {
      return failure(
        gitDiscoveryFailure(
          "GIT_DISCOVERY_FAILED",
          "Git discovery timed out",
          { fsCode: "ETIMEDOUT" },
        ),
      );
    }

    // execFile failures for nonzero exit include stdout/stderr on the error.
    const stdout =
      isNodeErrnoException(error) && error.stdout !== undefined
        ? String(error.stdout)
        : "";
    const stderr =
      isNodeErrnoException(error) && error.stderr !== undefined
        ? String(error.stderr)
        : "";
    const combined = `${stdout}\n${stderr}`.toLowerCase();

    if (
      combined.includes("not a git repository") ||
      combined.includes("not a git repo")
    ) {
      return failure(
        gitDiscoveryFailure(
          "NOT_A_GIT_REPOSITORY",
          "Path is not inside a Git repository",
        ),
      );
    }

    return failure(
      gitDiscoveryFailure(
        "GIT_DISCOVERY_FAILED",
        "Git discovery execution failed",
        isNodeErrnoException(error) && error.code !== undefined
          ? { fsCode: error.code }
          : undefined,
      ),
    );
  }
}
