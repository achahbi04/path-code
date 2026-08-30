import { describe, expect, it } from "vitest";

import {
  MINIMUM_SUPPORTED_NODE_MAJOR,
  evaluateNodeVersion,
  isNodeVersionSupported,
  parseNodeVersion,
} from "../src/core/runtime.js";

describe("runtime compatibility contract", () => {
  it("exposes the minimum supported Node major version", () => {
    expect(MINIMUM_SUPPORTED_NODE_MAJOR).toBe(22);
  });

  it("accepts the exact minimum supported version", () => {
    expect(parseNodeVersion("v22.0.0")).toEqual({
      major: 22,
      minor: 0,
      patch: 0,
    });
    expect(isNodeVersionSupported("v22.0.0")).toBe(true);
    expect(evaluateNodeVersion("22.0.0")).toEqual({
      ok: true,
      version: { major: 22, minor: 0, patch: 0 },
      supported: true,
    });
  });

  it("accepts versions above the minimum", () => {
    expect(isNodeVersionSupported("v26.5.0")).toBe(true);
    expect(evaluateNodeVersion("23.11.1")).toMatchObject({
      ok: true,
      supported: true,
    });
  });

  it("rejects versions below the minimum without terminating the process", () => {
    expect(isNodeVersionSupported("v20.19.0")).toBe(false);
    expect(isNodeVersionSupported("18.20.4")).toBe(false);

    const evaluation = evaluateNodeVersion("v21.7.3");
    expect(evaluation).toEqual({
      ok: true,
      version: { major: 21, minor: 7, patch: 3 },
      supported: false,
    });
  });

  it("handles malformed or unexpected version input predictably", () => {
    expect(parseNodeVersion("")).toBeNull();
    expect(parseNodeVersion("   ")).toBeNull();
    expect(parseNodeVersion("not-a-version")).toBeNull();
    expect(parseNodeVersion("v22")).toBeNull();
    expect(parseNodeVersion("22.0")).toBeNull();

    expect(isNodeVersionSupported("")).toBe(false);
    expect(isNodeVersionSupported("garbage")).toBe(false);

    expect(evaluateNodeVersion("22")).toEqual({
      ok: false,
      reason: "malformed Node version string",
    });
  });

  it("parses prerelease Node version prefixes without treating them as malformed", () => {
    expect(parseNodeVersion("v22.1.0-nightly20240101")).toEqual({
      major: 22,
      minor: 1,
      patch: 0,
    });
    expect(isNodeVersionSupported("v22.1.0-nightly20240101")).toBe(true);
  });
});
