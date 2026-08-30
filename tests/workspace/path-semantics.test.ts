import path from "node:path";

import { describe, expect, it } from "vitest";

import { isInsideRoot } from "../../src/workspace/path-semantics.js";

describe("isInsideRoot POSIX semantics", () => {
  const p = path.posix;

  it("treats root as inside", () => {
    expect(isInsideRoot("/tmp/path-code", "/tmp/path-code", p)).toBe(true);
  });

  it("treats a child as inside", () => {
    expect(isInsideRoot("/tmp/path-code", "/tmp/path-code/file.ts", p)).toBe(
      true,
    );
  });

  it("treats a deep child as inside", () => {
    expect(
      isInsideRoot("/tmp/path-code", "/tmp/path-code/a/b/c.ts", p),
    ).toBe(true);
  });

  it("rejects parent escape", () => {
    expect(isInsideRoot("/tmp/path-code", "/tmp/other", p)).toBe(false);
  });

  it("rejects multiple parent traversal", () => {
    expect(isInsideRoot("/tmp/path-code/a", "/tmp/path-code/../secret", p)).toBe(
      false,
    );
  });

  it("rejects sibling-prefix collision", () => {
    expect(
      isInsideRoot("/tmp/path-code", "/tmp/path-code-evil/file.ts", p),
    ).toBe(false);
  });
});

describe("isInsideRoot Windows semantics", () => {
  const w = path.win32;

  it("treats root as inside", () => {
    expect(isInsideRoot("C:\\proj", "C:\\proj", w)).toBe(true);
  });

  it("treats a child as inside", () => {
    expect(isInsideRoot("C:\\proj", "C:\\proj\\file.ts", w)).toBe(true);
  });

  it("treats a deep child as inside", () => {
    expect(isInsideRoot("C:\\proj", "C:\\proj\\a\\b\\c.ts", w)).toBe(true);
  });

  it("rejects parent escape", () => {
    expect(isInsideRoot("C:\\proj", "C:\\other", w)).toBe(false);
  });

  it("rejects sibling-prefix collision", () => {
    expect(isInsideRoot("C:\\proj", "C:\\proj-evil\\file.ts", w)).toBe(false);
  });

  it("rejects different drive", () => {
    expect(isInsideRoot("C:\\proj", "D:\\proj\\file.ts", w)).toBe(false);
  });

  it("accepts same-drive descendant", () => {
    expect(isInsideRoot("C:\\proj", "C:\\proj\\src\\index.ts", w)).toBe(true);
  });
});
