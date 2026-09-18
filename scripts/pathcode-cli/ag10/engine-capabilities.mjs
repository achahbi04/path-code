/**
 * S3.2 — Adapter-owned engine capability declarations.
 *
 * Traits describe what the *current integration* can honestly do.
 * They are not permanent provider stereotypes. When an adapter gains or
 * loses a capability, update the matching declare* function here (and
 * re-export from the adapter). Routing consumes traits via
 * engine-contract.mjs — it does not hard-code "Copilot = LSP" etc.
 *
 * Kept in this module (not inside cursor-sdk.mjs) to avoid import cycles
 * with withEngineProvenance. Adapters re-export the declare* helpers as
 * their public capability contract surface.
 */

/**
 * @typedef {import('./engine-contract.mjs').EngineCapability} EngineCapability
 */

/**
 * Antigravity — PATH bridge / hooks / native continue.
 * Backed by ag-session.mjs + collaborate bridge (not a peer SDK).
 * @returns {EngineCapability}
 */
export function declareAntigravityEngineCapability() {
  return {
    id: "antigravity",
    role: "engineering_collaborator",
    status: "available",
    native: [
      "bridge",
      "tools",
      "mcp",
      "continue",
      "repair",
      "cancel",
      "hooks",
      "streaming",
    ],
    traits: [
      "bridge",
      "tools",
      "mcp",
      "shell",
      "hooks",
      "streaming",
      "repair",
      "continue",
      "boundary_steer",
    ],
    steering: "boundary",
    cancel: "native",
    resume: "native",
    note: "Bridge-backed engineering with native continue / cancel / hooks",
  };
}

/**
 * Copilot — @github/copilot-sdk / CLI harness.
 * LSP / language-aware repair is claimed because the current Copilot
 * integration surfaces language-server style repair; drop `lsp` if that
 * adapter path goes away.
 * @returns {EngineCapability}
 */
export function declareCopilotEngineCapability() {
  return {
    id: "copilot",
    role: "engineering_collaborator",
    status: "available",
    native: [
      "sdk",
      "cli_fallback",
      "tools",
      "lsp",
      "mcp",
      "continue",
      "repair",
      "stable_cli_path",
    ],
    traits: [
      "sdk",
      "cli_fallback",
      "tools",
      "lsp",
      "mcp",
      "shell",
      "repair",
      "continue",
      "boundary_steer",
    ],
    // Mid-turn steer is not wired on the Copilot adapter today.
    steering: "boundary",
    cancel: "abort_registry",
    resume: "session_id",
    note: "Copilot SDK / CLI with LSP and language-aware repair",
  };
}

/**
 * Cursor — official @cursor/sdk local executor (cursor-sdk.mjs).
 * `inflight_steer` is claimed because Agent.steer is wired; drop it if
 * the SDK path loses mid-run steer.
 * @returns {EngineCapability}
 */
export function declareCursorEngineCapability() {
  return {
    id: "cursor",
    role: "engineering_collaborator",
    status: "unavailable",
    native: [
      "sdk",
      "local_cwd",
      "tools",
      "streaming",
      "steer_inflight",
      "cancel",
      "resume",
      "multi_turn",
    ],
    traits: [
      "sdk",
      "local_cwd",
      "tools",
      "shell",
      "streaming",
      "inflight_steer",
      "repair",
      "continue",
    ],
    steering: "immediate",
    cancel: "native",
    resume: "native",
    note: "Official @cursor/sdk local executor against the PATH task worktree",
  };
}

/**
 * Snapshot of current adapter declarations (frozen copies).
 * @returns {{ antigravity: EngineCapability, copilot: EngineCapability, cursor: EngineCapability }}
 */
export function snapshotDeclaredEngineCapabilities() {
  return {
    antigravity: declareAntigravityEngineCapability(),
    copilot: declareCopilotEngineCapability(),
    cursor: declareCursorEngineCapability(),
  };
}
