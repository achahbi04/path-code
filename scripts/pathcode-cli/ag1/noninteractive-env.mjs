/**
 * AG3 — noninteractive engineering environment for autonomous child processes.
 * Does NOT globally inject CI=true.
 */

/**
 * @param {NodeJS.ProcessEnv} [base]
 * @returns {NodeJS.ProcessEnv}
 */
export function buildNoninteractiveEngineeringEnv(base = process.env) {
  const env = { ...base };
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_ASKPASS = env.GIT_ASKPASS || "echo";
  env.GCM_INTERACTIVE = "never";
  // Hint for PATH-owned wrappers / diagnostics — not a project CI mode.
  env.PATHCODE_NONINTERACTIVE = "1";
  // Never attach a controlling TTY to autonomous engineering children.
  delete env.FORCE_COLOR;
  // Do not invent global CI mode.
  // Callers that need project-defined CI should set it explicitly per command.
  return env;
}

/**
 * Detect commands that are known to require interactive stdin indefinitely.
 * Prefer blocking early over hanging PATH.
 *
 * @param {string} commandLine
 * @returns {{ blocked: true, code: string, message: string } | { blocked: false }}
 */
export function detectInteractiveCommandBlock(commandLine) {
  const cmd = String(commandLine || "").trim();
  if (!cmd) return { blocked: false };

  const patterns = [
    /\bpython3?\s+-i\b/i,
    /\bnode\s+(?:--interactive|-i)\b/i,
    /\birb\b/i,
    /\bprisma\s+studio\b/i,
    /\bvim\b|\bnvim\b|\bnano\b|\bless\b|\bmore\b/i,
    /\bgit\s+add\s+-p\b/i,
    /\bgit\s+rebase\s+-i\b/i,
    /\bread\s+-p\b/,
  ];
  for (const re of patterns) {
    if (re.test(cmd)) {
      return {
        blocked: true,
        code: "INTERACTIVE_COMMAND_BLOCKED",
        message:
          "Interactive command blocked for autonomous engineering. Use a noninteractive flag when available.",
      };
    }
  }
  return { blocked: false };
}
