/**
 * Phase GC1-a — public surface for the Cloud Workstation lifecycle engine.
 *
 * Canonical/test code should import mock + lifecycle only.
 * GcpWorkstationTransport is exported for the live-smoke entrypoint exclusively.
 */

export * from "./constants.mjs";
export { createMockWorkstationTransport } from "./mock-transport.mjs";
export { createWorkstationLifecycleManager } from "./lifecycle.mjs";
export {
  createImpersonatedControlAuth,
  assertLiveSmokeAuthorized,
  buildBearerAuthHeaders,
  headersToPlainRecord,
  hasBearerAuthorization,
} from "./auth.mjs";

/**
 * Lazy accessor — avoids loading google-auth / GCP client during canonical import.
 * Real construction still requires GC1_LIVE_SMOKE=1 inside createGcpWorkstationTransport.
 */
export async function loadGcpWorkstationTransportFactory() {
  const mod = await import("./gcp-transport.mjs");
  return mod.createGcpWorkstationTransport;
}
