/**
 * Content fingerprinting for proposed edit bytes.
 */

import { createHash } from "node:crypto";

import type { ContentFingerprint } from "../reader/types.js";

export function fingerprintBytes(bytes: Uint8Array): ContentFingerprint {
  const hex = createHash("sha256").update(bytes).digest("hex");
  return {
    algorithm: "sha256",
    hex,
    byteLength: bytes.byteLength,
  };
}

export function copyBytes(source: Uint8Array | Buffer): Uint8Array {
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}
