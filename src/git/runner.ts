/**
 * Private, fixed-purpose Git executable runner.
 *
 * Uses structured execFile — never shell or secondary process primitives.
 * Not a general process execution API (Phase 4).
 *
 * Phase 1D discovery retains small bounds.
 * Phase 2C state commands use larger finite bounds from constants.ts.
 *
 * Limitation: executable resolution trusts the inherited PATH. A compromised
 * PATH can substitute a malicious binary named "git". Absolute/pinned Git
 * executable resolution is not implemented.
 *
 * Note: `git check-ignore -z` is only valid with `--stdin`. Path Code therefore
 * feeds batched NUL-framed pathnames through the ChildProcess stdin channel
 * returned by execFile. That remains the execFile primitive — not a second
 * process API.
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
};

export type GitRunSuccess = {
  readonly stdout: string;
  readonly stderr: string;
};

type NodeErrnoException = Error & {
  readonly code?: string | number;
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

/**
 * Internal exit interpretation. Not caller-configurable.
 * CHECK_IGNORE treats exit 1 as successful empty result.
 */
type ExitProtocol = "DEFAULT" | "CHECK_IGNORE";

type ExecFailure = {
  readonly kind:
    | "GIT_NOT_AVAILABLE"
    | "GIT_TIMEOUT"
    | "GIT_OUTPUT_TOO_LARGE"
    | "NOT_A_GIT_REPOSITORY"
    | "GIT_EXEC_FAILED";
  readonly fsCode?: string;
};

function extractExitCode(error: unknown): number | undefined {
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
}

function classifyCaughtError(
  error: unknown,
  exitProtocol: ExitProtocol,
): Result<GitRunSuccess, ExecFailure> {
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
      fsCode: String(error.code),
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

  const exitCode = extractExitCode(error);

  // Capability-specific: check-ignore exit 1 means "none ignored" (success).
  if (exitProtocol === "CHECK_IGNORE" && exitCode === 1) {
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
      : exitCode === undefined
        ? {}
        : { fsCode: `exit:${exitCode}` }),
  });
}

async function execGit(
  request: GitRunRequest,
  bounds: ExecBounds,
  exitProtocol: ExitProtocol = "DEFAULT",
): Promise<Result<GitRunSuccess, ExecFailure>> {
  const executable = request.executable ?? "git";
  const env = request.env ?? buildGitChildEnvironment();

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
    return classifyCaughtError(error, exitProtocol);
  }
}

/**
 * execFile with a finite stdin payload. Still the execFile primitive —
 * Git's check-ignore -z protocol requires --stdin.
 */
async function execGitWithStdin(
  request: GitRunRequest,
  bounds: ExecBounds,
  stdin: string,
  exitProtocol: ExitProtocol,
): Promise<Result<GitRunSuccess, ExecFailure>> {
  const executable = request.executable ?? "git";
  const env = request.env ?? buildGitChildEnvironment();

  return await new Promise((resolve) => {
    const child = execFile(
      executable,
      [...request.args],
      {
        cwd: request.cwd,
        env,
        timeout: bounds.timeoutMs,
        maxBuffer: bounds.maxBuffer,
        encoding: "utf8",
        windowsHide: true,
        shell: false,
      },
      (error, stdout, stderr) => {
        if (error) {
          const enriched =
            typeof error === "object" && error !== null
              ? Object.assign(error, {
                  stdout:
                    "stdout" in error && (error as NodeErrnoException).stdout !== undefined
                      ? (error as NodeErrnoException).stdout
                      : stdout,
                  stderr:
                    "stderr" in error && (error as NodeErrnoException).stderr !== undefined
                      ? (error as NodeErrnoException).stderr
                      : stderr,
                })
              : error;
          resolve(classifyCaughtError(enriched, exitProtocol));
          return;
        }
        resolve(
          success({
            stdout: typeof stdout === "string" ? stdout : String(stdout),
            stderr: typeof stderr === "string" ? stderr : String(stderr),
          }),
        );
      },
    );

    child.stdin?.write(stdin);
    child.stdin?.end();
  });
}

function mapStateExecFailure(error: ExecFailure): GitBaselineFailure {
  switch (error.kind) {
    case "GIT_NOT_AVAILABLE":
      return gitBaselineFailure("GIT_NOT_AVAILABLE", "Git executable was not found", {
        fsCode: error.fsCode ?? "ENOENT",
      });
    case "GIT_TIMEOUT":
      return gitBaselineFailure("GIT_TIMEOUT", "Git state command timed out", {
        fsCode: "ETIMEDOUT",
      });
    case "GIT_OUTPUT_TOO_LARGE":
      return gitBaselineFailure(
        "GIT_OUTPUT_TOO_LARGE",
        "Git state command output exceeded the fixed bound",
        error.fsCode === undefined ? undefined : { fsCode: error.fsCode },
      );
    case "NOT_A_GIT_REPOSITORY":
      return gitBaselineFailure(
        "NOT_A_GIT_REPOSITORY",
        "Path is not inside a Git repository",
      );
    default:
      return gitBaselineFailure(
        "GIT_STATE_FAILED",
        "Git state command execution failed",
        error.fsCode === undefined ? undefined : { fsCode: error.fsCode },
      );
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

  return failure(mapStateExecFailure(result.error));
}

export type GitCheckIgnoreRequest = {
  readonly cwd: string;
  /** Repository-relative pathname arguments (NUL-framed on stdin). */
  readonly paths: readonly string[];
  readonly executable?: string;
  readonly env?: NodeJS.ProcessEnv;
};

/**
 * Fixed check-ignore capability via execFile + --stdin -z.
 *
 * Git rejects `check-ignore -z` without `--stdin`, so pathnames are written as
 * a NUL-framed stdin payload on the ChildProcess returned by execFile.
 *
 * Exit protocol (capability-specific, not caller-configurable):
 * - 0 → success, one or more paths ignored (NUL-framed stdout)
 * - 1 → success, none ignored (empty ignored set)
 * - other/fatal → failure
 */
export async function runGitCheckIgnore(
  request: GitCheckIgnoreRequest,
): Promise<Result<GitRunSuccess, GitBaselineFailure>> {
  if (request.paths.length === 0) {
    return success({ stdout: "", stderr: "" });
  }

  const stdin = request.paths.map((pathName) => `${pathName}\0`).join("");

  const result = await execGitWithStdin(
    {
      cwd: request.cwd,
      args: ["check-ignore", "--stdin", "-z"],
      ...(request.executable === undefined
        ? {}
        : { executable: request.executable }),
      ...(request.env === undefined ? {} : { env: request.env }),
    },
    {
      timeoutMs: GIT_STATE_COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_GIT_STATE_COMMAND_OUTPUT_BYTES,
    },
    stdin,
    "CHECK_IGNORE",
  );

  if (result.ok) {
    return result;
  }

  return failure(mapStateExecFailure(result.error));
}
