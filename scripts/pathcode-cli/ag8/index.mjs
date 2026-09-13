/**
 * G8 — Native Capability Gateway public surface.
 */

export { whichBinary, discoverCapabilityPlane } from "./discover.mjs";

export {
  MCP_ENV_ALLOWLIST,
  sanitizeMcpName,
  sanitizeMcpEnv,
  classifyMcpToolTrust,
  discoverProjectMcpConfigs,
  normalizeMcpServers,
  applyMcpTrustPolicy,
  toAntigravityMcpServers,
} from "./mcp.mjs";

export {
  detectCopilotCli,
  shouldTriggerAdvisory,
  runCopilotAdvisory,
  parseCopilotHelpFlags,
  ADVISORY_REASONS,
} from "./copilot.mjs";

export { extractEngineeringHandoff } from "./handoff.mjs";

export {
  AG8_MAX_REPAIR_ATTEMPTS,
  AG8_REPAIR_STDERR_BOUND,
  buildValidationRepairPrompt,
  shouldAttemptSameSessionRepair,
} from "./repair.mjs";
