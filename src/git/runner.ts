/**
 * Private, fixed-purpose Git executable runner.
 *
 * Uses structured execFile — never shell.
 * Not a general process execution API (Phase 4).
 *
 * Phase 1D discovery retains small bounds.
 * Phase 2C state commands use larger finite bounds from constants.ts.
 *
 * Limitation: executable resolution trusts the inherited PATH. A compromised
 * PATH can substitute a malicious binary named "git". Absolute/pinned Git
 * executable resolution is not implemented.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  gitBaselineFailure,
  type GitBaselineFailure,
} from "./baseline-failure.js";
import {
  GIT_STATE_COMMAND_TIMEOUT_MS,
  MAX_GIT_STATE_COMMAND_OUTPUT_BYTES,
} from "./constants.js";
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
  /**
   * Exit codes treated as successful command completion (stdout preserved).
   * Defaults to [0]. Used for read-only commands such as check-ignore.
   */
  readonly acceptExitCodes?: readonly number[];
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

type ExecBounds = {
  readonly timeoutMs: number;
  readonly maxBuffer: number;
};

type ExecFailure = {
  readonly kind:
    | "GIT_NOT_AVAILABLE"
    | "GIT_TIMEOUT"
    | "GIT_OUTPUT_TOO_LARGE"
    | "NOT_A_GIT_REPOSITORY"
    | "GIT_EXEC_FAILED";
  readonly fsCode?: string;
};

async function execGit(
  request: GitRunRequest,
  bounds: ExecBounds,
): Promise<Result<GitRunSuccess, ExecFailure>> {
  const executable = request.executable ?? "git";
  const env = request.env ?? buildGitChildEnvironment();
  const acceptExitCodes = new Set(request.acceptExitCodes ?? [0]);

  try {
    const result = await execFileAsync(executable, [...request.args], {
      cwd: request.cwd,
      env,
      timeout: bounds.timeoutMs,
      maxBuffer: bounds.maxBuffer,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
    });

    return success({
      stdout:
        typeof result.stdout === "string" ? result.stdout : String(result.stdout),
      stderr:
        typeof result.stderr === "string" ? result.stderr : String(result.stderr),
    });
  } catch (error: unknown) {
    if (isNodeErrnoException(error) && error.code === "ENOENT") {
      return failure({ kind: "GIT_NOT_AVAILABLE", fsCode: "ENOENT" });
    }

    if (isNodeErrnoException(error) && error.code === "ETIMEDOUT") {
      return failure({ kind: "GIT_TIMEOUT", fsCode: "ETIMEDOUT" });
    }

    if (
      isNodeErrnoException(error) &&
      (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
        error.code === "ENOBUFS")
    ) {
      return failure({
        kind: "GIT_OUTPUT_TOO_LARGE",
        fsCode: error.code,
      });
    }

    const stdout =
      isNodeErrnoException(error) && error.stdout !== undefined
        ? String(error.stdout)
        : "";
    const stderr =
      isNodeErrnoException(error) && error.stderr !== undefined
        ? String(error.stderr)
        : "";

    const exitCode = (() => {
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof (error as { status?: unknown }).status === "number"
      ) {
        return (error as { status: number }).status;
      }
      if (isNodeErrnoException(error) && typeof error.code === "number") {
        return error.code;
      }
      return undefined;
    })();

    if (exitCode !== undefined && acceptExitCodes.has(exitCode)) {
      return success({ stdout, stderr });
    }

    const combined = `${stdout}\n${stderr}`.toLowerCase();

    if (
      combined.includes("not a git repository") ||
      combined.includes("not a git repo")
    ) {
      return failure({ kind: "NOT_A_GIT_REPOSITORY" });
    }

    return failure({
      kind: "GIT_EXEC_FAILED",
      ...(isNodeErrnoException(error) && typeof error.code === "string"
        ? { fsCode: error.code }
        : {}),
    });
  }
}

/**
 * Run a fixed Git argument vector with discovery bounds.
 * Production callers must only pass read-only discovery args.
 */
export async function runGit(
  request: GitRunRequest,
): Promise<Result<GitRunSuccess, GitDiscoveryFailure>> {
  const result = await execGit(request, {
    timeoutMs: GIT_DISCOVERY_TIMEOUT_MS,
    maxBuffer: GIT_DISCOVERY_MAX_BUFFER,
  });

  if (result.ok) {
    return result;
  }

  switch (result.error.kind) {
    case "GIT_NOT_AVAILABLE":
      return failure(
        gitDiscoveryFailure("GIT_NOT_AVAILABLE", "Git executable was not found", {
          fsCode: result.error.fsCode ?? "ENOENT",
        }),
      );
    case "GIT_TIMEOUT":
      return failure(
        gitDiscoveryFailure("GIT_DISCOVERY_FAILED", "Git discovery timed out", {
          fsCode: "ETIMEDOUT",
        }),
      );
    case "NOT_A_GIT_REPOSITORY":
      return failure(
        gitDiscoveryFailure(
          "NOT_A_GIT_REPOSITORY",
          "Path is not inside a Git repository",
        ),
      );
    case "GIT_OUTPUT_TOO_LARGE":
      return failure(
        gitDiscoveryFailure(
          "GIT_DISCOVERY_FAILED",
          "Git discovery output exceeded bound",
          result.error.fsCode === undefined
            ? undefined
            : { fsCode: result.error.fsCode },
        ),
      );
    default:
      return failure(
        gitDiscoveryFailure(
          "GIT_DISCOVERY_FAILED",
          "Git discovery execution failed",
          result.error.fsCode === undefined
            ? undefined
            : { fsCode: result.error.fsCode },
        ),
      );
  }
}

/**
 * Run a fixed read-only Git state command with Phase 2C bounds.
 * Same execFile path and sanitized environment as discovery — not a second
 * process architecture.
 */
export async function runGitState(
  request: GitRunRequest,
): Promise<Result<GitRunSuccess, GitBaselineFailure>> {
  const result = await execGit(request, {
    timeoutMs: GIT_STATE_COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_GIT_STATE_COMMAND_OUTPUT_BYTES,
  });

  if (result.ok) {
    return result;
  }

  switch (result.error.kind) {
    case "GIT_NOT_AVAILABLE":
      return failure(
        gitBaselineFailure("GIT_NOT_AVAILABLE", "Git executable was not found", {
          fsCode: result.error.fsCode ?? "ENOENT",
        }),
      );
    case "GIT_TIMEOUT":
      return failure(
        gitBaselineFailure("GIT_TIMEOUT", "Git state command timed out", {
          fsCode: "ETIMEDOUT",
        }),
      );
    case "GIT_OUTPUT_TOO_LARGE":
      return failure(
        gitBaselineFailure(
          "GIT_OUTPUT_TOO_LARGE",
          "Git state command output exceeded the fixed bound",
          result.error.fsCode === undefined
            ? undefined
            : { fsCode: result.error.fsCode },
        ),
      );
    case "NOT_A_GIT_REPOSITORY":
      return failure(
        gitBaselineFailure(
          "NOT_A_GIT_REPOSITORY",
          "Path is not inside a Git repository",
        ),
      );
    default:
      return failure(
        gitBaselineFailure(
          "GIT_STATE_FAILED",
          "Git state command execution failed",
          result.error.fsCode === undefined
            ? undefined
            : { fsCode: result.error.fsCode },
        ),
      );
  }
}

/**
 * Run a fixed read-only Git state command with NUL-delimited stdin.
 * Uses spawn with shell disabled — same private Git capability, not a second
 * process architecture. Required for check-ignore -z --stdin.
 */
export async function runGitStateWithStdin(
  request: GitRunRequest,
  stdin: string,
): Promise<Result<GitRunSuccess, GitBaselineFailure>> {
  const { spawn } = await import("node:child_process");
  const executable = request.executable ?? "git";
  const env = request.env ?? buildGitChildEnvironment();
  const acceptExitCodes = new Set(request.acceptExitCodes ?? [0]);

  return await new Promise((resolve) => {
    const child = spawn(executable, [...request.args], {
      cwd: request.cwd,
      env,
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        resolve(
          failure(
            gitBaselineFailure("GIT_TIMEOUT", "Git state command timed out", {
              fsCode: "ETIMEDOUT",
            }),
          ),
        );
      }
    }, GIT_STATE_COMMAND_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > MAX_GIT_STATE_COMMAND_OUTPUT_BYTES) {
        child.kill();
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > MAX_GIT_STATE_COMMAND_OUTPUT_BYTES) {
        child.kill();
      }
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (settled) {
        return;
      }
      settled = true;
      if (error.code === "ENOENT") {
        resolve(
          failure(
            gitBaselineFailure(
              "GIT_NOT_AVAILABLE",
              "Git executable was not found",
              { fsCode: "ENOENT" },
            ),
          ),
        );
        return;
      }
      resolve(
        failure(
          gitBaselineFailure(
            "GIT_STATE_FAILED",
            "Git state command execution failed",
            error.code === undefined ? undefined : { fsCode: error.code },
          ),
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) {
        return;
      }
      settled = true;

      if (
        stdout.length > MAX_GIT_STATE_COMMAND_OUTPUT_BYTES ||
        stderr.length > MAX_GIT_STATE_COMMAND_OUTPUT_BYTES
      ) {
        resolve(
          failure(
            gitBaselineFailure(
              "GIT_OUTPUT_TOO_LARGE",
              "Git state command output exceeded the fixed bound",
            ),
          ),
        );
        return;
      }

      if (code !== null && acceptExitCodes.has(code)) {
        resolve(success({ stdout, stderr }));
        return;
      }

      const combined = `${stdout}\n${stderr}`.toLowerCase();
      if (
        combined.includes("not a git repository") ||
        combined.includes("not a git repo")
      ) {
        resolve(
          failure(
            gitBaselineFailure(
              "NOT_A_GIT_REPOSITORY",
              "Path is not inside a Git repository",
            ),
          ),
        );
        return;
      }

      resolve(
        failure(
          gitBaselineFailure(
            "GIT_STATE_FAILED",
            "Git state command execution failed",
            code === null ? undefined : { exitCode: code },
          ),
        ),
      );
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}
