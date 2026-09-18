/**
 * S1 — PATH Gateway façade.
 */

export { GATEWAY_PROTOCOL_VERSION, GatewayMethods } from "./protocol.mjs";
export { createGatewayRuntime } from "./runtime.mjs";
export { createGatewayPromptAdapter } from "./prompt-adapter.mjs";
export {
  startGatewayServer,
  resolveGatewaySocketPath,
  resolveGatewayPidPath,
} from "./server.mjs";
export { createGatewayClient } from "./client.mjs";
export { ensureGateway, readGatewayPid, reclaimStaleGatewayOwnership } from "./ensure.mjs";
export { runHeadlessMain } from "./headless.mjs";
