/**
 * G8 — Copilot CLI advisory (programmatic, read-only).
 * Probes `copilot --help` for real flags; never allows write/git/push.
 */

import { spawnSync } from "node:child_process";
import { whichBinary } from "./discover.mjs";

export const ADVISORY_REASONS = Object.freeze([
  "repeated_type_failure",
  "symbol_ambiguity",
  "operator_request",
  "final_diff_risk",
]);

/** Tool tokens that must never be enabled for advisory. */
const FORBIDDEN_TOOL_RE =
  /\b(write|edit|apply|create_file|delete|git|push|commit|pr|deploy|shell|terminal|bash)\b/i;

/**
 * @returns {{
 *   status: 'ready'|'unavailable',
 *   executable: string|null,
 *   version?: string,
 *   evidence: string[],
 * }}
 */
export function detectCopilotCli() {
  /** @type {string[]} */
  const evidence = [];
  const executable = whichBinary("copilot");
  if (!executable) {
    evidence.push("copilot not on PATH");
    return { status: "unavailable", executable: null, evidence };
  }
  evidence.push(`copilot → ${executable}`);

  const ver = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    timeout: 8_000,
    env: process.env,
  });
  /** @type {string | undefined} */
  let version;
  if (ver.status === 0) {
    version = ((ver.stdout || ver.stderr || "").trim().split("\n")[0] || "").slice(
      0,
      120,
    );
    if (version) evidence.push(`version ${version}`);
  } else {
    evidence.push("copilot --version failed (binary still present)");
  }

  return { status: "ready", executable, version, evidence };
}

/**
 * @param {{ reason?: string }} input
 * @returns {boolean}
 */
export function shouldTriggerAdvisory(input = {}) {
  const reason = typeof input?.reason === "string" ? input.reason : "";
  return ADVISORY_REASONS.includes(reason);
}

/**
 * Parse help text for safe prompt / noninteractive / tool-allowlist flags.
 * @param {string} helpText
 */
export function parseCopilotHelpFlags(helpText) {
  const text = typeof helpText === "string" ? helpText : "";
  /** @type {{ promptFlag: string|null, silentFlags: string[], allowToolsFlag: string|null, denyToolsFlag: string|null }} */
  const out = {
    promptFlag: null,
    silentFlags: [],
    allowToolsFlag: null,
    denyToolsFlag: null,
  };

  if (/(?:^|\s)-p,\s*--prompt\b/m.test(text) || /\b--prompt\b/.test(text)) {
    out.promptFlag =
      text.includes("-p,") || /(?:^|\s)-p\b/m.test(text) ? "-p" : "--prompt";
  } else if (/(?:^|\s)-p\b/m.test(text)) {
    out.promptFlag = "-p";
  }

  for (const flag of [
    "--silent",
    "--quiet",
    "-q",
    "--non-interactive",
    "--noninteractive",
    "--yes",
    "-y",
  ]) {
    const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|\\s)${escaped}\\b`, "m").test(text)) {
      out.silentFlags.push(flag);
    }
  }

  if (/\b--allow-tool\b/.test(text)) out.allowToolsFlag = "--allow-tool";
  else if (/\b--enabled-tools\b/.test(text)) out.allowToolsFlag = "--enabled-tools";
  else if (/\b--tools\b/.test(text)) out.allowToolsFlag = "--tools";

  if (/\b--deny-tool\b/.test(text)) out.denyToolsFlag = "--deny-tool";
  else if (/\b--disabled-tools\b/.test(text)) out.denyToolsFlag = "--disabled-tools";

  return out;
}

/**
 * PROGRAMMATIC read-only advisory. Probes help; never enables write/git/push.
 *
 * @param {{
 *   question: string,
 *   cwd?: string,
 *   timeoutMs?: number,
 *   executable?: string|null,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   text: string,
 *   code: number|null,
 *   value: 'helped'|'no_value'|'unavailable',
 * }}
 */
export function runCopilotAdvisory(input) {
  const question = typeof input?.question === "string" ? input.question.trim() : "";
  const cwd =
    typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const timeoutMs =
    typeof input?.timeoutMs === "number" && input.timeoutMs > 0
      ? Math.min(Math.floor(input.timeoutMs), 120_000)
      : 45_000;

  if (!question) {
    return { ok: false, text: "", code: null, value: "no_value" };
  }

  const detected = input.executable
    ? { status: "ready", executable: input.executable, evidence: [] }
    : detectCopilotCli();
  if (detected.status !== "ready" || !detected.executable) {
    return { ok: false, text: "", code: null, value: "unavailable" };
  }

  const exe = detected.executable;
  const help = spawnSync(exe, ["--help"], {
    encoding: "utf8",
    timeout: 10_000,
    env: process.env,
    cwd,
  });
  const helpText = `${help.stdout || ""}\n${help.stderr || ""}`;
  const flags = parseCopilotHelpFlags(helpText);

  if (!flags.promptFlag) {
    return {
      ok: false,
      text: "copilot help lacks a prompt flag; refusing interactive advisory",
      code: typeof help.status === "number" ? help.status : null,
      value: "unavailable",
    };
  }

  /** @type {string[]} */
  const args = [flags.promptFlag, question];
  for (const f of flags.silentFlags) {
    if (!args.includes(f)) args.push(f);
  }

  if (flags.denyToolsFlag) {
    for (const dangerous of [
      "shell",
      "write",
      "git",
      "edit",
      "push",
      "terminal",
    ]) {
      args.push(flags.denyToolsFlag, dangerous);
    }
  }
  if (flags.allowToolsFlag && /\bread\b/i.test(helpText)) {
    args.push(flags.allowToolsFlag, "read");
  }

  for (let i = 0; i < args.length; i += 1) {
    if (!/allow-tool|enabled-tools|^--tools$/i.test(args[i])) continue;
    const val = args[i + 1] || "";
    if (FORBIDDEN_TOOL_RE.test(val)) {
      return {
        ok: false,
        text: "refusing advisory argv that would enable write/git tools",
        code: null,
        value: "unavailable",
      };
    }
  }

  const run = spawnSync(exe, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    env: {
      ...process.env,
      CI: "1",
    },
    cwd,
  });

  const text = `${run.stdout || ""}${run.stderr || ""}`.trim();
  const code = typeof run.status === "number" ? run.status : null;

  if (run.error || code === null) {
    return {
      ok: false,
      text: text || String(run.error || "spawn failed"),
      code,
      value: "unavailable",
    };
  }
  if (code !== 0) {
    return {
      ok: false,
      text,
      code,
      value: text.length > 40 ? "no_value" : "unavailable",
    };
  }
  if (text.length < 24) {
    return { ok: true, text, code, value: "no_value" };
  }
  return { ok: true, text: text.slice(0, 8_000), code, value: "helped" };
}
