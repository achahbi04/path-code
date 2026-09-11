/**
 * AG1 — TypeScript AntigravityEngineeringAgent boundary.
 * One local Python child: stdin JSONL commands, stdout JSONL protocol.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertAg1VenvReady,
  resolveAg1BridgeScript,
  resolveAg1PythonExecutable,
} from "./venv-guard.mjs";
import {
  createJsonlParser,
  isRecognizedBridgeMessage,
} from "./jsonl-parser.mjs";
import { resolveCheckoutRoot } from "../paths.mjs";

/**
 * @typedef {{
 *   taskId: string,
 *   workspace: string,
 *   task: string,
 *   budget?: {
 *     maxModelCalls?: number,
 *     maxToolCalls?: number,
 *     wallClockMs?: number,
 *     commandTimeoutSeconds?: number,
 *   },
 *   allowShell?: boolean,
 * }} StartTaskInput
 */

/**
 * @typedef {{
 *   onEvent?: (msg: Record<string, unknown>) => void,
 *   onDiagnostic?: (kind: string, text: string) => void,
 *   checkoutRoot?: string,
 *   pythonPath?: string,
 *   bridgeScript?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} AgentOptions
 */

/**
 * Build child env: inherit process.env (including GEMINI_API_KEY) unless overridden.
 * Never strip auth keys. Optionally strip nothing by default.
 * @param {NodeJS.ProcessEnv | undefined} override
 */
export function buildBridgeChildEnv(override) {
  if (override) return { ...override };
  // Explicit shallow copy of process.env — Node spawn inherits by default when
  // env is omitted; we pass a copy so diagnostics can assert key presence
  // without printing values.
  return { ...process.env };
}

/**
 * @param {AgentOptions} [options]
 */
export function createAntigravityEngineeringAgent(options = {}) {
  const checkoutRoot = options.checkoutRoot ?? resolveCheckoutRoot();
  /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
  let child = null;
  /** @type {ReturnType<typeof createJsonlParser> | null} */
  let parser = null;
  const diagnostics = [];
  const MAX_DIAG = 400;
  const diagDir = join(checkoutRoot, ".path-code-tmp", "ag1-diag");
  try {
    mkdirSync(diagDir, { recursive: true });
  } catch {
    // ignore
  }
  let diagFile = join(diagDir, `bridge-${Date.now()}.log`);

  /**
   * @param {string} kind
   * @param {string} text
   */
  function noteDiagnostic(kind, text) {
    const entry = { kind, text, ts: Date.now() };
    diagnostics.push(entry);
    if (diagnostics.length > MAX_DIAG) diagnostics.shift();
    try {
      appendFileSync(diagFile, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      // ignore
    }
    if (typeof options.onDiagnostic === "function") {
      try {
        options.onDiagnostic(kind, text);
      } catch {
        // never throw into product loop
      }
    }
  }

  /**
   * @param {Record<string, unknown>} msg
   */
  function emitEvent(msg) {
    if (typeof options.onEvent === "function") {
      try {
        options.onEvent(msg);
      } catch (err) {
        noteDiagnostic(
          "on_event_error",
          err && /** @type {any} */ (err).message
            ? String(err.message)
            : "onEvent failed",
        );
      }
    }
  }

  function ensureStarted() {
    if (child) return { ok: true, pythonPath: options.pythonPath, reused: true };

    const guard = assertAg1VenvReady({
      checkoutRoot,
      ...(options.pythonPath ? { pythonPath: options.pythonPath } : {}),
    });
    if (!guard.ok) {
      noteDiagnostic("venv_guard_failed", guard.message);
      return guard;
    }

    const pythonPath = options.pythonPath ?? guard.pythonPath;
    const bridgeScript = options.bridgeScript ?? resolveAg1BridgeScript(checkoutRoot);

    if (
      pythonPath === "python" ||
      pythonPath === "python3" ||
      pythonPath === "py"
    ) {
      return {
        ok: false,
        code: "AG1_VENV_BARE_INTERPRETER",
        message: "Refusing bare interpreter; absolute venv path required.",
      };
    }

    const childEnv = buildBridgeChildEnv(options.env);
    const authPresent =
      (typeof childEnv.GEMINI_API_KEY === "string" &&
        childEnv.GEMINI_API_KEY.trim() !== "") ||
      (typeof childEnv.GOOGLE_API_KEY === "string" &&
        childEnv.GOOGLE_API_KEY.trim() !== "");
    noteDiagnostic(
      "spawn_prepare",
      JSON.stringify({
        pythonPath,
        bridgeScript,
        authKeyPresent: authPresent,
        // presence only — never values
      }),
    );

    parser = createJsonlParser({
      onMessage: (msg) => {
        if (!isRecognizedBridgeMessage(msg)) {
          noteDiagnostic("unrecognized_protocol", JSON.stringify(msg).slice(0, 500));
          return;
        }
        if (msg.type === "started") {
          noteDiagnostic("bridge_started_ack", JSON.stringify({ taskId: msg.taskId }));
        }
        emitEvent(msg);
      },
      onDiagnostic: noteDiagnostic,
    });

    try {
      child = spawn(pythonPath, [bridgeScript], {
        stdio: ["pipe", "pipe", "pipe"],
        env: childEnv,
      });
    } catch (err) {
      const message = err && /** @type {any} */ (err).message ? String(err.message) : "spawn threw";
      noteDiagnostic("spawn_throw", message);
      return { ok: false, code: "BRIDGE_SPAWN_ERROR", message };
    }

    noteDiagnostic(
      "spawn_ok",
      JSON.stringify({ pid: child.pid ?? null, pythonPath, bridgeScript }),
    );

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      parser?.push(String(chunk));
    });

    const stderrRl = createInterface({ input: child.stderr });
    stderrRl.on("line", (line) => {
      noteDiagnostic("stderr", line.slice(0, 2_000));
    });

    child.on("error", (err) => {
      noteDiagnostic("spawn_error", err.message);
      emitEvent({
        type: "failed",
        code: "BRIDGE_SPAWN_ERROR",
        message: err.message,
      });
    });

    child.on("close", (code, signal) => {
      parser?.flush();
      noteDiagnostic(
        "bridge_exit",
        `code=${code ?? "null"} signal=${signal ?? "null"}`,
      );
      child = null;
    });

    return { ok: true, pythonPath, bridgeScript, pid: child.pid ?? null };
  }

  /**
   * @param {StartTaskInput} input
   */
  async function startTask(input) {
    diagFile = join(diagDir, `bridge-${input.taskId}.log`);
    const started = ensureStarted();
    if (!started.ok) {
      emitEvent({
        type: "failed",
        taskId: input.taskId,
        code: started.code,
        message: started.message,
      });
      return started;
    }
    const cmd = {
      type: "start",
      taskId: input.taskId,
      workspace: input.workspace,
      task: input.task,
      budget: input.budget ?? {},
      allowShell: input.allowShell !== false,
    };
    noteDiagnostic("stdin_start", JSON.stringify({ taskId: input.taskId, workspace: input.workspace }));
    writeCommand(cmd);
    return {
      ok: true,
      pythonPath: started.pythonPath,
      bridgeScript: started.bridgeScript,
      pid: child?.pid ?? started.pid ?? null,
      diagFile,
    };
  }

  function cancel() {
    writeCommand({ type: "cancel" });
    if (child && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }

  async function close() {
    writeCommand({ type: "close" });
    const proc = child;
    if (!proc) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve(undefined);
      }, 3_000);
      proc.once("close", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });
    child = null;
  }

  /**
   * @param {Record<string, unknown>} cmd
   */
  function writeCommand(cmd) {
    if (!child || !child.stdin || child.stdin.destroyed) {
      noteDiagnostic("stdin_unavailable", JSON.stringify(cmd.type ?? "unknown"));
      return;
    }
    try {
      child.stdin.write(`${JSON.stringify(cmd)}\n`);
    } catch (err) {
      noteDiagnostic(
        "stdin_write_error",
        err && /** @type {any} */ (err).message
          ? String(err.message)
          : "write failed",
      );
    }
  }

  return {
    startTask,
    cancel,
    close,
    getDiagnostics: () => diagnostics.slice(),
    getDiagFile: () => diagFile,
    /** @returns {number | null} */
    getPid: () => (child && child.pid ? child.pid : null),
    resolvePython: () => resolveAg1PythonExecutable(checkoutRoot),
  };
}
