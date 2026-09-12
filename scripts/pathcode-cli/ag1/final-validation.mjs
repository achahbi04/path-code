/**
 * AG1 — PATH independent final validation (agent "finished" ≠ VERIFIED).
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  discoverValidationCandidates,
  selectPlannedChecks,
} from "../validation-candidates.mjs";
import { discoverNativeValidationCandidates } from "../ag5/native-validation.mjs";
import { buildTrialChildEnvironment } from "../child-env.mjs";
import { sanitizeProjectCommandEnv } from "../ag5/project-env.mjs";

/**
 * @typedef {"VERIFIED" | "PARTIALLY_VERIFIED" | "FAILED" | "NOT_VERIFIED"} Ag1ResultClass
 */

/**
 * @param {{
 *   executable: string,
 *   argv: string[],
 *   cwd: string,
 *   env: Readonly<Record<string, string>>,
 *   timeoutMs: number,
 * }} request
 * @param {AbortSignal} [signal]
 */
function runPreparedRequest(request, signal) {
  return new Promise((resolve) => {
  const childEnv = sanitizeProjectCommandEnv({
    ...request.env,
    PATH: process.env.PATH ?? "",
    // Native toolchains (Go/Rust/etc.) need ordinary host identity for caches.
    ...(typeof process.env.HOME === "string" ? { HOME: process.env.HOME } : {}),
    ...(typeof process.env.USER === "string" ? { USER: process.env.USER } : {}),
    ...(typeof process.env.TMPDIR === "string"
      ? { TMPDIR: process.env.TMPDIR }
      : {}),
    ...(typeof process.env.TMP === "string" ? { TMP: process.env.TMP } : {}),
    ...(typeof process.env.TEMP === "string" ? { TEMP: process.env.TEMP } : {}),
    GIT_TERMINAL_PROMPT: "0",
    PATHCODE_NONINTERACTIVE: "1",
  });
    const child = spawn(request.executable, request.argv, {
      cwd: request.cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, request.timeoutMs);

    const onAbort = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c) => {
      stdout += c;
      if (stdout.length > 200_000) stdout = stdout.slice(-200_000);
    });
    child.stderr?.on("data", (c) => {
      stderr += c;
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });
    child.on("close", (code, sig) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        signal: sig,
        stdout,
        stderr,
        timedOut: code === null && sig === "SIGKILL",
      });
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        signal: null,
        stdout,
        stderr: `${stderr}\n${err.message}`,
        timedOut: false,
      });
    });
  });
}

/**
 * Discover and run project-defined validation against the task worktree
 * (or engineering subdirectory inside it). Never invents commands.
 *
 * @param {{
 *   worktreePath: string,
 *   engineeringCwd?: string,
 *   signal?: AbortSignal,
 * }} input
 */
export async function runIndependentFinalValidation(input) {
  const worktreePath = input.worktreePath;
  const validationRoot =
    typeof input.engineeringCwd === "string" && input.engineeringCwd.trim()
      ? input.engineeringCwd
      : worktreePath;

  const packageJsonPath = join(validationRoot, "package.json");
  const childEnv = buildTrialChildEnvironment(process.env);

  /** @type {Array<object>} */
  let candidates = [];
  /** @type {Array<object>} */
  let refused = [];

  if (existsSync(packageJsonPath)) {
    let packageJsonText = null;
    try {
      packageJsonText = readFileSync(packageJsonPath, "utf8");
    } catch {
      return {
        classification: /** @type {Ag1ResultClass} */ ("NOT_VERIFIED"),
        reason: "package.json unreadable.",
        checks: [],
      };
    }
    const discovery = discoverValidationCandidates({
      projectRoot: validationRoot,
      packageJsonText,
      childEnv,
    });
    candidates = discovery.candidates;
    refused = discovery.refused ?? [];
  }

  // AG5: when npm/tsc discovery is empty, admit native metadata-backed checks.
  if (candidates.length === 0) {
    candidates = discoverNativeValidationCandidates(validationRoot);
  }

  const selection = selectPlannedChecks(candidates);
  const checksToRun = selection.planned;

  if (!Array.isArray(checksToRun) || checksToRun.length === 0) {
    return {
      classification: /** @type {Ag1ResultClass} */ ("NOT_VERIFIED"),
      reason: existsSync(packageJsonPath)
        ? "No admissible validation candidates for final checks."
        : "No discoverable project validation (no package.json / native metadata checks).",
      checks: [],
      refused,
    };
  }

  const results = [];
  for (const check of checksToRun) {
    if (input.signal?.aborted) break;
    const request = check.request;
    if (
      !request ||
      typeof request.executable !== "string" ||
      !Array.isArray(request.argv)
    ) {
      results.push({
        id: check.id,
        name: check.id,
        kind: check.kind,
        command: check.disclosure?.command ?? "(missing request)",
        exitCode: 1,
        timedOut: false,
        durationMs: 0,
        ok: false,
        stdoutTail: "",
        stderrTail: "Candidate missing executable request.",
      });
      continue;
    }

    const started = Date.now();
    emitProgress?.(check);
    const outcome = await runPreparedRequest(
      {
        executable: request.executable,
        argv: request.argv,
        cwd: request.cwd ?? validationRoot,
        env: { ...childEnv, ...(request.env ?? {}) },
        timeoutMs:
          typeof request.timeoutMs === "number" ? request.timeoutMs : 300_000,
      },
      input.signal,
    );
    results.push({
      id: check.id,
      name: check.id,
      kind: check.kind,
      command: check.disclosure?.command ?? `${request.executable} ${request.argv.join(" ")}`,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      durationMs: Date.now() - started,
      ok: outcome.exitCode === 0 && !outcome.timedOut,
      stdoutTail: outcome.stdout.slice(-4_000),
      stderrTail: outcome.stderr.slice(-4_000),
    });
  }

  void emitProgress;

  if (results.length === 0) {
    return {
      classification: /** @type {Ag1ResultClass} */ ("NOT_VERIFIED"),
      reason: "Validation cancelled before any check ran.",
      checks: results,
    };
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  /** @type {Ag1ResultClass} */
  let classification;
  if (failed === 0 && passed === results.length) {
    classification = "VERIFIED";
  } else if (passed > 0 && failed > 0) {
    classification = "PARTIALLY_VERIFIED";
  } else if (failed > 0) {
    classification = "FAILED";
  } else {
    classification = "NOT_VERIFIED";
  }

  return {
    classification,
    reason:
      classification === "VERIFIED"
        ? "All configured final checks passed."
        : classification === "PARTIALLY_VERIFIED"
          ? "Some configured final checks passed; others failed."
          : classification === "FAILED"
            ? "Configured final checks failed."
            : "Final validation inconclusive.",
    checks: results,
  };
}

/** @type {((check: any) => void) | null} */
let emitProgress = null;

/**
 * Optional progress hook for session host.
 * @param {((check: any) => void) | null} fn
 */
export function setFinalValidationProgressHook(fn) {
  emitProgress = fn;
}

/**
 * Pure classifier helper for tests: agent finished must not imply VERIFIED.
 * @param {{ agentFinished: boolean, validation: { classification: Ag1ResultClass } | null }} input
 */
export function classifyAg1Result(input) {
  if (!input.validation) {
    return /** @type {Ag1ResultClass} */ ("NOT_VERIFIED");
  }
  return input.validation.classification;
}
