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
import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "../paths.mjs";
import { buildNoninteractiveEngineeringEnv } from "./noninteractive-env.mjs";
import { sanitizeEngineEnvForPublication } from "../ag4/credential-isolation.mjs";
import { sanitizeProjectCommandEnv } from "../ag5/project-env.mjs";
import { registerProcess } from "../process-registry.mjs";
import { reclaimTtyForeground } from "../terminal-title.mjs";

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
 *   defaultCwd?: string,
 *   mcpServers?: object[],
 *   capabilityBrief?: string,
 *   toolEnv?: Record<string, string>,
 * }} StartTaskInput
 */

/**
 * @typedef {{
 *   onEvent?: (msg: Record<string, unknown>) => void,
 *   onDiagnostic?: (kind: string, text: string) => void,
 *   checkoutRoot?: string,
 *   runtimeRoot?: string,
 *   pythonPath?: string,
 *   bridgeScript?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} AgentOptions
 */

/**
 * Build child env for the Antigravity bridge process.
 * Uses absolute interpreter (caller); strips private Python markers that would
 * otherwise leak into SDK-spawned project commands via limited_env PATH inheritance.
 * @param {NodeJS.ProcessEnv | undefined} override
 */
export function buildBridgeChildEnv(override) {
  const base = override ? { ...override } : { ...process.env };
  const noninteractive = buildNoninteractiveEngineeringEnv(base);
  const publicationSafe = sanitizeEngineEnvForPublication(noninteractive);
  // Keep auth/locale for the bridge; strip venv activation markers so project
  // commands do not inherit PATH's private Antigravity Python environment.
  return sanitizeProjectCommandEnv(publicationSafe);
}

/**
 * @param {AgentOptions} [options]
 */
export function createAntigravityEngineeringAgent(options = {}) {
  const checkoutRoot = options.checkoutRoot ?? resolvePathPackageRoot();
  const runtimeRoot =
    options.runtimeRoot ?? resolvePathRuntimeRoot({ packageRoot: checkoutRoot });
  /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
  let child = null;
  /** @type {ReturnType<typeof createJsonlParser> | null} */
  let parser = null;
  const diagnostics = [];
  const MAX_DIAG = 400;
  const diagDir = join(runtimeRoot, "diag");
  try {
    mkdirSync(diagDir, { recursive: true });
  } catch {
    // ignore
  }
  let diagFile = join(diagDir, `bridge-${Date.now()}.log`);
  /** @type {boolean} */
  let sawTerminalEvent = false;

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
    if (
      msg &&
      (msg.type === "finished" ||
        msg.type === "failed" ||
        msg.type === "cancelled")
    ) {
      sawTerminalEvent = true;
    }
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

    // Explicit interpreter + script pair (tests / fakes): skip AG1 SDK venv probe.
    const customBridge =
      typeof options.pythonPath === "string" &&
      options.pythonPath.trim() !== "" &&
      typeof options.bridgeScript === "string" &&
      options.bridgeScript.trim() !== "";

    /** @type {string} */
    let pythonPath;
    /** @type {string} */
    let bridgeScript;

    if (customBridge) {
      pythonPath = options.pythonPath;
      bridgeScript = options.bridgeScript;
    } else {
      const guard = assertAg1VenvReady({
        checkoutRoot,
        ...(options.pythonPath ? { pythonPath: options.pythonPath } : {}),
      });
      if (!guard.ok) {
        noteDiagnostic("venv_guard_failed", guard.message);
        return guard;
      }
      pythonPath = options.pythonPath ?? guard.pythonPath;
      bridgeScript = options.bridgeScript ?? resolveAg1BridgeScript(checkoutRoot);
    }

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
        // New process group so the bridge cannot become Terminal.app's
        // foreground tty process (avoids "Python" / argv / TMPDIR title leak).
        detached: process.platform !== "win32",
      });
      try {
        registerProcess({
          taskId: input.taskId,
          kind: "antigravity_bridge",
          command: `${pythonPath} ${bridgeScript}`,
          child,
          runtimeRoot,
        });
      } catch {
        // ignore registry failures
      }
    } catch (err) {
      const message = err && /** @type {any} */ (err).message ? String(err.message) : "spawn threw";
      noteDiagnostic("spawn_throw", message);
      return { ok: false, code: "BRIDGE_SPAWN_ERROR", message };
    }

    noteDiagnostic(
      "spawn_ok",
      JSON.stringify({ pid: child.pid ?? null, pythonPath, bridgeScript }),
    );

    try {
      reclaimTtyForeground();
    } catch {
      // Title reclaim is best-effort; bridge must still run.
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    if (child.stdin) {
      child.stdin.on("error", (err) => {
        noteDiagnostic(
          "stdin_error",
          err && err.message ? String(err.message) : "stdin error",
        );
      });
    }

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
      // S4.2: unexpected process death must not leave the session hung until
      // wall-clock budget. Emit a terminal failed/interrupted event.
      if (!sawTerminalEvent) {
        sawTerminalEvent = true;
        emitEvent({
          type: "failed",
          code: "BRIDGE_EXIT",
          message: `Antigravity bridge exited (code=${code ?? "null"} signal=${signal ?? "null"})`,
          interrupted: true,
        });
      }
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
      ...(typeof input.defaultCwd === "string" && input.defaultCwd.trim()
        ? { defaultCwd: input.defaultCwd.trim() }
        : {}),
      ...(Array.isArray(input.mcpServers) && input.mcpServers.length > 0
        ? { mcpServers: input.mcpServers }
        : {}),
      ...(typeof input.capabilityBrief === "string" &&
      input.capabilityBrief.trim()
        ? { capabilityBrief: input.capabilityBrief.trim() }
        : {}),
      ...(input.toolEnv &&
      typeof input.toolEnv === "object" &&
      !Array.isArray(input.toolEnv)
        ? { toolEnv: input.toolEnv }
        : {}),
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

  /**
   * Feed repair/advisory text into the SAME Antigravity conversation.
   * Does not kill or respawn the bridge process.
   * @param {{ text: string }} input
   */
  function continueTask(input) {
    const text =
      input && typeof input.text === "string" ? input.text : String(input?.text ?? "");
    noteDiagnostic("stdin_continue", JSON.stringify({ chars: text.length }));
    writeCommand({ type: "continue", text });
    return { ok: true };
  }

  /**
   * Tell the bridge no further continues are needed (validation done / exhausted).
   */
  function signalDone() {
    noteDiagnostic("stdin_done", "ack");
    writeCommand({ type: "done" });
    return { ok: true };
  }

  function cancel() {
    sawTerminalEvent = true;
    try {
      writeCommand({ type: "cancel" });
    } catch {
      // ignore
    }
    const proc = child;
    if (proc && !proc.killed) {
      try {
        if (proc.stdin && !proc.stdin.destroyed) {
          try {
            proc.stdin.end();
          } catch {
            // ignore
          }
        }
        // Detached spawn → kill the whole process group when possible.
        if (typeof proc.pid === "number" && process.platform !== "win32") {
          try {
            process.kill(-proc.pid, "SIGTERM");
          } catch {
            proc.kill("SIGTERM");
          }
        } else {
          proc.kill("SIGTERM");
        }
      } catch {
        // ignore
      }
    }
  }

  async function close() {
    const proc = child;
    if (!proc) return;
    try {
      writeCommand({ type: "close" });
    } catch {
      // ignore
    }
    try {
      if (proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.end();
      }
    } catch {
      // ignore
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          if (typeof proc.pid === "number" && process.platform !== "win32") {
            try {
              process.kill(-proc.pid, "SIGKILL");
            } catch {
              proc.kill("SIGKILL");
            }
          } else {
            proc.kill("SIGKILL");
          }
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
    if (!child || !child.stdin || child.stdin.destroyed || child.killed) {
      noteDiagnostic("stdin_unavailable", JSON.stringify(cmd.type ?? "unknown"));
      return;
    }
    try {
      child.stdin.write(`${JSON.stringify(cmd)}\n`, (err) => {
        if (err) {
          noteDiagnostic(
            "stdin_write_error",
            err && err.message ? String(err.message) : "write failed",
          );
        }
      });
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
    continueTask,
    signalDone,
    cancel,
    close,
    getDiagnostics: () => diagnostics.slice(),
    getDiagFile: () => diagFile,
    /** @returns {number | null} */
    getPid: () => (child && child.pid ? child.pid : null),
    resolvePython: () => resolveAg1PythonExecutable(checkoutRoot),
  };
}
