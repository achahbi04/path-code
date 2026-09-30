/**
 * G9 — full collaborative Copilot engineering engine (not advisory-only).
 *
 * Runs GitHub Copilot CLI non-interactively with write/shell tools allowed
 * inside the task worktree. Denies push/deploy. Uses PATH-owned COPILOT_HOME.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { detectCopilotCli, parseCopilotHelpFlags } from "../ag8/copilot.mjs";
import {
  reclaimTtyForeground,
  reassertPathTitle,
} from "../terminal-title.mjs";
import { registerProcess } from "../process-registry.mjs";
import { resolvePathRuntimeRoot } from "../paths.mjs";

/** Tools / patterns that must never be granted for PATH collaborative turns. */
const DENIED_TOOL_SPECS = Object.freeze([
  "shell(git push)",
  "shell(git push *)",
  "shell(gh pr *)",
  "shell(gh release *)",
  "shell(*deploy*)",
]);

/**
 * Build argv for a full engineering Copilot turn from probed help flags.
 * Exported for unit tests.
 *
 * @param {{
 *   helpText: string,
 *   prompt: string,
 *   cwd: string,
 *   modelId?: string | null,
 * }} input
 * @returns {{ ok: boolean, args: string[], reason?: string }}
 */
export function buildCopilotEngineeringArgs({ helpText, prompt, cwd, modelId }) {
  const flags = parseCopilotHelpFlags(helpText);
  if (!flags.promptFlag) {
    return {
      ok: false,
      args: [],
      reason: "copilot help lacks a prompt flag",
    };
  }

  /** @type {string[]} */
  const args = [flags.promptFlag, prompt];
  if (modelId) {
    if (!/(?:^|\s)--model(?:[\s=,]|$)/m.test(helpText)) {
      return { ok: false, args: [], reason: "copilot help lacks a model flag" };
    }
    args.push("--model", modelId);
  }

  // Prefer --silent when present.
  if (flags.silentFlags.includes("--silent")) args.push("--silent");
  else if (flags.silentFlags.includes("-s")) args.push("-s");
  else {
    for (const f of flags.silentFlags) {
      if (!args.includes(f)) args.push(f);
    }
  }

  // Working directory confinement.
  if (/(?:^|\s)-C(?:\s|=|$)/m.test(helpText) || /Change working directory/i.test(helpText)) {
    args.push("-C", cwd);
  }
  if (/--add-dir\b/.test(helpText)) {
    args.push("--add-dir", cwd);
  }

  // Full tools for collaborative engineering (non-interactive).
  if (/--allow-all-tools\b/.test(helpText)) {
    args.push("--allow-all-tools");
  } else if (flags.allowToolsFlag) {
    for (const tool of ["write", "edit", "shell", "read"]) {
      args.push(flags.allowToolsFlag, tool);
    }
  } else {
    return {
      ok: false,
      args: [],
      reason: "copilot cannot enable tools non-interactively",
    };
  }

  if (flags.denyToolsFlag || /--deny-tool\b/.test(helpText)) {
    const denyFlag = flags.denyToolsFlag || "--deny-tool";
    for (const spec of DENIED_TOOL_SPECS) {
      args.push(denyFlag, spec);
    }
  }

  return { ok: true, args };
}

/**
 * Collect changed files relative to worktree (git status --porcelain).
 * @param {string} cwd
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
function listChangedFiles(cwd, env) {
  const r = spawnSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
    timeout: 15_000,
    cwd,
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) return [];
  return String(r.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\?\?\s+/, "").replace(/^[ MADRCU?]{1,2}\s+/, ""))
    .filter(Boolean)
    .slice(0, 40);
}

/**
 * Run one full Copilot engineering turn against the task worktree.
 *
 * @param {{
 *   prompt: string,
 *   cwd: string,
 *   toolEnv?: Record<string, string>,
 *   timeoutMs?: number,
 *   executable?: string | null,
 *   modelId?: string | null,
 * }} input
 * @returns {Promise<{
 *   ok: boolean,
 *   text: string,
 *   code: number | null,
 *   value: 'helped'|'no_value'|'unavailable'|'error',
 *   changedFiles: string[],
 *   detail: string,
 * }>}
 */
export async function runCopilotEngineeringTurn(input) {
  const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
  const cwd =
    typeof input?.cwd === "string" && input.cwd.trim()
      ? input.cwd.trim()
      : process.cwd();
  const timeoutMs =
    typeof input?.timeoutMs === "number" && input.timeoutMs > 0
      ? Math.min(Math.floor(input.timeoutMs), 300_000)
      : 180_000;

  if (!prompt) {
    return {
      ok: false,
      text: "",
      code: null,
      value: "no_value",
      changedFiles: [],
      detail: "empty prompt",
    };
  }
  if (!existsSync(cwd)) {
    return {
      ok: false,
      text: "",
      code: null,
      value: "unavailable",
      changedFiles: [],
      detail: "cwd missing",
    };
  }

  const detected = input.executable
    ? { status: "ready", executable: input.executable, evidence: [] }
    : detectCopilotCli();
  if (detected.status !== "ready" || !detected.executable) {
    return {
      ok: false,
      text: "",
      code: null,
      value: "unavailable",
      changedFiles: [],
      detail: "copilot CLI unavailable",
    };
  }

  const exe = detected.executable;
  const help = spawnSync(exe, ["--help"], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, ...(input.toolEnv || {}) },
    cwd,
  });
  const helpText = `${help.stdout || ""}\n${help.stderr || ""}`;
  const built = buildCopilotEngineeringArgs({ helpText, prompt, cwd, modelId: input.modelId });
  if (!built.ok) {
    return {
      ok: false,
      text: built.reason || "cannot build args",
      code: null,
      value: "unavailable",
      changedFiles: [],
      detail: built.reason || "cannot build args",
    };
  }

  /** @type {Record<string, string>} */
  const env = {
    ...process.env,
    ...(input.toolEnv || {}),
    CI: "1",
    COPILOT_ALLOW_ALL: "1",
  };

  const run = await new Promise((resolve) => {
    /** @type {import('node:child_process').ChildProcess} */
    const child = spawn(exe, built.args, {
      env,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      registerProcess({
        taskId:
          typeof input.taskId === "string" && input.taskId.trim()
            ? input.taskId.trim()
            : null,
        kind: "copilot_cli",
        command: `${exe} ${built.args.slice(0, 4).join(" ")}`.slice(0, 500),
        child,
        runtimeRoot:
          typeof input.runtimeRoot === "string" && input.runtimeRoot
            ? input.runtimeRoot
            : resolvePathRuntimeRoot(),
      });
    } catch {
      /* registry is best-effort */
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      finish({
        status: null,
        error: new Error(`copilot timeout after ${timeoutMs}ms`),
        stdout,
        stderr,
        timedOut: true,
      });
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 8 * 1024 * 1024) stdout = stdout.slice(-4 * 1024 * 1024);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8 * 1024 * 1024) stderr = stderr.slice(-4 * 1024 * 1024);
    });
    child.on("error", (err) => {
      finish({ status: null, error: err, stdout, stderr });
    });
    child.on("close", (code) => {
      finish({ status: code, error: null, stdout, stderr });
    });
  });

  try {
    reclaimTtyForeground();
    reassertPathTitle();
  } catch {
    /* ignore */
  }
  const reported = listChangedFiles(cwd, env);

  const text = `${run.stdout || ""}${run.stderr || ""}`.trim();
  const code = typeof run.status === "number" ? run.status : null;

  if (run.error || code === null) {
    return {
      ok: false,
      text: text || String(run.error || "spawn failed"),
      code,
      value: "unavailable",
      changedFiles: reported,
      detail: run.timedOut ? `timeout ${timeoutMs}ms` : "spawn failed",
    };
  }
  if (code !== 0) {
    return {
      ok: false,
      text: text.slice(0, 8_000),
      code,
      value: text.length > 40 ? "error" : "unavailable",
      changedFiles: reported,
      detail: `exit ${code}`,
    };
  }

  const helped =
    reported.length > 0 || text.length >= 40 ? "helped" : "no_value";
  return {
    ok: true,
    text: text.slice(0, 8_000),
    code,
    value: helped,
    changedFiles: reported,
    detail:
      reported.length > 0
        ? `mutated ${reported.length} path(s)`
        : "completed without file changes",
  };
}

/**
 * Whether Copilot CLI is ready for a full collaborative engineering turn.
 * @returns {boolean}
 */
export function isCopilotEngineeringReady() {
  const d = detectCopilotCli();
  return d.status === "ready" && Boolean(d.executable);
}
