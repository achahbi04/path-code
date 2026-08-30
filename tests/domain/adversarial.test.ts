import { describe, expect, it } from "vitest";

import type { CanonicalPath } from "../../src/domain/workspace.js";

describe("CanonicalPath adversarial limitation", () => {
  it("documents that deliberate casts can bypass the type brand at runtime", () => {
    const raw = "/outside/workspace";

    // Hostile bypass: TypeScript branding is erased at runtime.
    // This proves the brand is a compile-time guard, not a security boundary.
    const forged = raw as unknown as CanonicalPath;

    expect(typeof forged).toBe("string");
    expect(forged).toBe(raw);
    expect(forged === raw).toBe(true);
  });
});
