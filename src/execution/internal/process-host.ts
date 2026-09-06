/**
 * Private Node process host — sole node:child_process owner under src/execution.
 *
 * POSIX process-group strategy: spawn with detached:true so the child is a
 * session/process-group leader; timeout/overflow kill uses process.kill(-pid).
 *
 * shell: false is NOT sandboxing.
 */

import { spawn, type ChildProcess } from "node:child_process";

import {
  LOCAL_PROCESS_FINAL_CLEANUP_DEADLINE_MS,
  LOCAL_PROCESS_TERMINATION_GRACE_MS,
} from "../bounds.js";
import type {
  LocalProcessCleanupResult,
  LocalProcessOutcome,
  LocalProcessStreamCapture,
} from "../types.js";

export type ProcessHostRequest = {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
};

export type ProcessHostObservation = {
  readonly outcome: LocalProcessOutcome;
  readonly pid: number | null;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly overflow: boolean;
  readonly terminationRequested: boolean;
  readonly terminationObserved: boolean;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly durationMs: number;
  readonly stdout: LocalProcessStreamCapture;
  readonly stderr: LocalProcessStreamCapture;
  readonly spawnError: string | null;
  readonly cleanup: LocalProcessCleanupResult;
};

type StreamState = {
  chunks: Buffer[];
  capturedBytes: number;
  discardedAfterLimitBytes: number;
  truncated: boolean;
  complete: boolean;
  streamError: string | null;
};

function emptyStream(): StreamState {
  return {
    chunks: [],
    capturedBytes: 0,
    discardedAfterLimitBytes: 0,
    truncated: false,
    complete: false,
    streamError: null,
  };
}

function toCapture(state: StreamState): LocalProcessStreamCapture {
  const text = Buffer.concat(state.chunks).toString("utf8");
  return {
    capturedBytes: state.capturedBytes,
    truncated: state.truncated,
    discardedAfterLimitBytes: state.discardedAfterLimitBytes,
    complete: state.complete && !state.truncated && state.streamError === null,
    streamError: state.streamError,
    text,
  };
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Spawn a non-interactive local process with argv fidelity and finite cleanup.
 */
export function runDetachedProcess(
  request: ProcessHostRequest,
): Promise<ProcessHostObservation> {
  return new Promise((resolve) => {
    const startedAtMs = Date.now();
    const startHr = process.hrtime.bigint();
    let finalized = false;
    let timedOut = false;
    let overflow = false;
    let terminationRequested = false;
    let terminationObserved = false;
    let exitCode: number | null = null;
    let signal: string | null = null;
    let spawnError: string | null = null;
    let pid: number | null = null;
    let closeSeen = false;
    let exitSeen = false;
    const signalsAttempted: string[] = [];
    const stdout = emptyStream();
    const stderr = emptyStream();

    let graceTimer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    let cleanupTimer: NodeJS.Timeout | undefined;
    let durationTimer: NodeJS.Timeout | undefined;

    const clearTimers = (): void => {
      if (graceTimer !== undefined) {
        clearTimeout(graceTimer);
      }
      if (killTimer !== undefined) {
        clearTimeout(killTimer);
      }
      if (cleanupTimer !== undefined) {
        clearTimeout(cleanupTimer);
      }
      if (durationTimer !== undefined) {
        clearTimeout(durationTimer);
      }
    };

    const finalize = (outcome: LocalProcessOutcome): void => {
      if (finalized) {
        return;
      }
      finalized = true;
      clearTimers();
      const finishedAtMs = Date.now();
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1_000_000;
      const terminationNotConfirmed =
        terminationRequested && !terminationObserved;
      resolve({
        outcome: terminationNotConfirmed ? "TERMINATION_NOT_CONFIRMED" : outcome,
        pid,
        exitCode,
        signal,
        timedOut,
        overflow,
        terminationRequested,
        terminationObserved,
        startedAtMs,
        finishedAtMs,
        durationMs,
        stdout: toCapture(stdout),
        stderr: toCapture(stderr),
        spawnError,
        cleanup: {
          terminationRequested,
          terminationObserved,
          terminationNotConfirmed,
          descendantMayRemainAlive: terminationNotConfirmed || !closeSeen,
          signalsAttempted: Object.freeze([...signalsAttempted]),
        },
      });
    };

    const maybeFinish = (): void => {
      if (!exitSeen || !closeSeen) {
        return;
      }
      if (overflow) {
        finalize("OUTPUT_OVERFLOW");
        return;
      }
      if (timedOut) {
        finalize(terminationObserved ? "TIMED_OUT" : "TERMINATION_NOT_CONFIRMED");
        return;
      }
      if (signal !== null) {
        finalize("SIGNALED");
        return;
      }
      finalize("EXITED");
    };

    const beginTermination = (reason: "timeout" | "overflow"): void => {
      if (terminationRequested || finalized) {
        return;
      }
      terminationRequested = true;
      if (reason === "timeout") {
        timedOut = true;
      } else {
        overflow = true;
      }
      if (pid === null) {
        return;
      }
      signalsAttempted.push("SIGTERM");
      killProcessGroup(pid, "SIGTERM");
      graceTimer = setTimeout(() => {
        if (finalized || terminationObserved) {
          return;
        }
        signalsAttempted.push("SIGKILL");
        killProcessGroup(pid!, "SIGKILL");
        cleanupTimer = setTimeout(() => {
          if (!finalized) {
            finalize("TERMINATION_NOT_CONFIRMED");
          }
        }, LOCAL_PROCESS_FINAL_CLEANUP_DEADLINE_MS);
      }, LOCAL_PROCESS_TERMINATION_GRACE_MS);
    };

    const onStreamData = (
      state: StreamState,
      chunk: Buffer,
      limit: number,
    ): void => {
      if (state.truncated) {
        state.discardedAfterLimitBytes += chunk.byteLength;
        return;
      }
      const remaining = limit - state.capturedBytes;
      if (chunk.byteLength <= remaining) {
        state.chunks.push(chunk);
        state.capturedBytes += chunk.byteLength;
        return;
      }
      if (remaining > 0) {
        state.chunks.push(chunk.subarray(0, remaining));
        state.capturedBytes += remaining;
        state.discardedAfterLimitBytes += chunk.byteLength - remaining;
      } else {
        state.discardedAfterLimitBytes += chunk.byteLength;
      }
      state.truncated = true;
      beginTermination("overflow");
    };

    let child: ChildProcess;
    try {
      child = spawn(request.executable, [...request.argv], {
        cwd: request.cwd,
        env: { ...request.env },
        argv0: request.executable,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        windowsHide: true,
      });
    } catch (error: unknown) {
      spawnError =
        error instanceof Error ? error.message : "spawn threw synchronously";
      finalize("SPAWN_FAILED");
      return;
    }

    pid = child.pid ?? null;

    child.on("error", (error) => {
      spawnError = error.message;
      if (!exitSeen) {
        exitSeen = true;
        closeSeen = true;
        finalize("SPAWN_FAILED");
      }
    });

    if (child.stdout === null || child.stderr === null) {
      spawnError = "stdio pipes were not created";
      finalize("SPAWN_FAILED");
      return;
    }

    child.stdout.on("data", (chunk: Buffer) => {
      onStreamData(stdout, chunk, request.maxStdoutBytes);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      onStreamData(stderr, chunk, request.maxStderrBytes);
    });
    child.stdout.on("error", (error) => {
      stdout.streamError = error.message;
    });
    child.stderr.on("error", (error) => {
      stderr.streamError = error.message;
    });
    child.stdout.on("end", () => {
      stdout.complete = true;
    });
    child.stderr.on("end", () => {
      stderr.complete = true;
    });

    child.on("exit", (code, sig) => {
      exitSeen = true;
      terminationObserved = true;
      exitCode = code;
      signal = sig;
      maybeFinish();
    });

    child.on("close", () => {
      closeSeen = true;
      stdout.complete = true;
      stderr.complete = true;
      maybeFinish();
    });

    durationTimer = setTimeout(() => {
      beginTermination("timeout");
    }, request.timeoutMs);
  });
}
