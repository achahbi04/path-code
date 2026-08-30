import { describe, expect, it } from "vitest";

import { failure, success, type Result } from "../../src/domain/result.js";
import {
  requiresReRead,
  type KnowledgeRecord,
} from "../../src/domain/knowledge.js";
import { isJsonValue } from "../../src/domain/json.js";
import type { PolicyActionContext, PolicyContract } from "../../src/domain/policy.js";

describe("Result contract", () => {
  it("produces a deterministic success shape", () => {
    const result: Result<number> = success(42);
    expect(result).toEqual({ ok: true, value: 42 });
    expect(result.ok).toBe(true);
  });

  it("produces a deterministic failure shape", () => {
    const result: Result<number, string> = failure("boom");
    expect(result).toEqual({ ok: false, error: "boom" });
    expect(result.ok).toBe(false);
  });

  it("discriminates success and failure at runtime", () => {
    const okResult = success("a");
    const errResult = failure("b");

    if (okResult.ok) {
      expect(okResult.value).toBe("a");
    } else {
      expect.unreachable("success branch required");
    }

    if (!errResult.ok) {
      expect(errResult.error).toBe("b");
    } else {
      expect.unreachable("failure branch required");
    }
  });
});

describe("Knowledge requiresReRead", () => {
  const base = {
    subject: "src/index.ts",
    provenance: "PRE_EXISTING" as const,
    observation: { note: "inspection" },
  };

  it("returns true for STALE", () => {
    const record: KnowledgeRecord = { ...base, state: "STALE" };
    expect(requiresReRead(record)).toBe(true);
  });

  it("returns true for RE_READ_REQUIRED", () => {
    const record: KnowledgeRecord = { ...base, state: "RE_READ_REQUIRED" };
    expect(requiresReRead(record)).toBe(true);
  });

  it("returns false for non-stale knowledge states", () => {
    const states = [
      "KNOWN",
      "UNKNOWN",
      "INSPECTED",
      "CHANGED",
      "VERIFIED",
      "FAILED",
      "PARTIALLY_VERIFIED",
    ] as const;

    for (const state of states) {
      const record: KnowledgeRecord = { ...base, state };
      expect(requiresReRead(record)).toBe(false);
    }
  });
});

describe("JSON-safe guard", () => {
  it("accepts primitives", () => {
    expect(isJsonValue("x")).toBe(true);
    expect(isJsonValue(1)).toBe(true);
    expect(isJsonValue(true)).toBe(true);
    expect(isJsonValue(null)).toBe(true);
  });

  it("accepts nested arrays and objects", () => {
    expect(isJsonValue({ a: [1, { b: false }] })).toBe(true);
  });

  it("rejects undefined, functions, and Date", () => {
    expect(isJsonValue(undefined)).toBe(false);
    expect(isJsonValue(() => undefined)).toBe(false);
    expect(isJsonValue(new Date("2026-08-30T00:00:00.000Z"))).toBe(false);
  });
});

describe("Policy contract fixture", () => {
  it("returns a deterministic deny-by-default decision shape", () => {
    const denyByDefault: PolicyContract = {
      decide(_context: PolicyActionContext) {
        return "DENY";
      },
    };

    const decision = denyByDefault.decide({
      actionClass: "EDIT",
      risk: { level: "MEDIUM", actionClass: "EDIT" },
    });

    expect(decision).toBe("DENY");
  });
});
