/**
 * G9 — Self-Provisioning Polyglot Engineering Runtime public surface.
 */

export {
  resolveAg9RuntimeDirs,
  ensureAg9RuntimeDirs,
} from "./layout.mjs";

export {
  SUPPORTED_PLATFORM_IDS,
  detectPlatform,
  isPlatformSupported,
  platformBackend,
  miseAssetPlatform,
} from "./backends.mjs";

export { withToolLock } from "./locks.mjs";

export { appendProvenance } from "./provenance.mjs";

export { resolveToolVersion } from "./versions.mjs";

export {
  MISE_PINNED_VERSION,
  miseBinaryPath,
  miseEnv,
  miseDownloadUrl,
  ensureMise,
  miseInstall,
  miseWhich,
} from "./mise.mjs";

export {
  resolveCapabilityRequirements,
  classifyRequirement,
} from "./resolve.mjs";

export {
  requirementToMiseSpec,
  provisionRequirements,
} from "./provision.mjs";

export { buildEngineeringToolEnv } from "./envelope.mjs";

export { toSeamDescriptors } from "./seam.mjs";

export {
  LSP_SERVERS,
  healthCheckLsp,
  provisionLanguageServers,
} from "./lsp.mjs";

export {
  prepareCopilotLspHome,
  probeCopilotLspReady,
  resolveCopilotHome,
} from "./copilot-lsp.mjs";

export {
  resolveCollabPaths,
  appendCollabJournal,
  readCollabJournal,
  formatCollabHandoff,
  withCollabTurn,
  chooseCollabEngine,
} from "./collaborate.mjs";

export {
  buildCopilotEngineeringArgs,
  runCopilotEngineeringTurn,
  isCopilotEngineeringReady,
} from "./copilot-engine.mjs";

export {
  shouldBuildScipIndex,
  scipFingerprint,
  ensureScipIndex,
  queryScipIndex,
} from "./scip.mjs";

export {
  SCIP_MCP_READ_ONLY_TOOLS,
  resolveScipMcpServerScript,
  createScipMcpServerConfig,
} from "./scip-mcp.mjs";

export { discoverAffectedChecks } from "./affected.mjs";

export {
  detectProjectServices,
  startDisposableServices,
  stopDisposableServices,
} from "./services.mjs";

export { prepareEngineeringEnvironment } from "./prepare.mjs";
