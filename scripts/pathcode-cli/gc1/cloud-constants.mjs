/**
 * Phase GC1-c — pinned cloud application constants.
 * Reuses GC1-b config/image pins; cost fences unchanged.
 */

import { GC1_COST_FENCES } from "./constants.mjs";
import { IMAGE_DIGEST_HISTORY, DEFAULT_IMAGE_TAG } from "./engineering-image.mjs";

/** Workstation config pin reused from GC1-b (operator-verified). */
export const GC1C_CONFIG = "pathcode-gc1b-config-v4";

/** Live authorization: at most six workstation sessions for this dispatch. */
export const GC1C_SESSION_BUDGET = 6;

/** Digest pin for the Engineering Image (gc1b-v4). */
export const GC1C_IMAGE_DIGEST = IMAGE_DIGEST_HISTORY[DEFAULT_IMAGE_TAG];

/** Alias — cost fences must remain identical to GC1-a/b. */
export const GC1C_COST_FENCES = GC1_COST_FENCES;

export const GC1C_ERROR = Object.freeze({
  CLEANUP_PENDING: "GC1C_CLEANUP_PENDING",
  SNAPSHOT_DRIFT: "GC1C_SNAPSHOT_DRIFT",
  HYDRATION_INCOMPLETE: "GC1C_HYDRATION_INCOMPLETE",
  PRIMARY_WRITE_REFUSED: "GC1C_PRIMARY_WRITE_REFUSED",
  MODEL_INJECTION: "GC1C_MODEL_INJECTION",
  REMOTE_PUBLISH_FAILED: "GC1C_REMOTE_PUBLISH_FAILED",
  WORKER_PROTOCOL: "GC1C_WORKER_PROTOCOL",
  SESSION_BUDGET_EXHAUSTED: "GC1C_SESSION_BUDGET_EXHAUSTED",
});
