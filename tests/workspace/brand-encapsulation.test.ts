import { describe, expect, it } from "vitest";

describe("CanonicalPath brand encapsulation", () => {
  it("does not export a raw-string brand helper from compiled workspace modules", async () => {
    const canonicalPath = await import("../../src/workspace/canonical-path.js");
    const workspace = await import("../../src/workspace/index.js");
    const root = await import("../../src/index.js");
    const boundary = await import("../../src/workspace/boundary.js");

    for (const [label, mod] of [
      ["canonical-path", canonicalPath],
      ["workspace/index", workspace],
      ["package index", root],
      ["boundary", boundary],
    ] as const) {
      expect(
        Object.prototype.hasOwnProperty.call(mod, "brandCanonicalPath"),
        `${label} must not export brandCanonicalPath`,
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(mod, "unsafeCanonicalPath"),
        `${label} must not export unsafeCanonicalPath`,
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(mod, "asCanonicalPath"),
        `${label} must not export asCanonicalPath`,
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(mod, "castCanonicalPath"),
        `${label} must not export castCanonicalPath`,
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(mod, "fromString"),
        `${label} must not export fromString`,
      ).toBe(false);
    }

    expect(Object.keys(canonicalPath).sort()).toEqual(["physicalRealpath"]);
  });
});
