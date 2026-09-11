/**
 * Phase GC1-c — transport capability conformance (mock ↔ production parity).
 *
 * Fail closed locally before billable GCP acquire when possible.
 */

import {
  assertTransportRuntimeDeliveryCapability,
  GC1_RUNTIME_DELIVERY_ERROR,
} from "./runtime-delivery.mjs";

/**
 * @param {object} transport
 */
export function assertGc1cTransportConformance(transport) {
  if (!transport || typeof transport !== "object") {
    const err = new Error(
      "GC1-c transport conformance: transport object required",
    );
    err.code = GC1_RUNTIME_DELIVERY_ERROR.CAPABILITY_MISSING;
    throw err;
  }
  assertTransportRuntimeDeliveryCapability(transport);
  if (typeof transport.executeCommand !== "function") {
    const err = new Error(
      "GC1-c transport conformance: executeCommand required",
    );
    err.code = GC1_RUNTIME_DELIVERY_ERROR.CAPABILITY_MISSING;
    throw err;
  }
  return true;
}
