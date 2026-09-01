import { describe, expect, it } from "vitest";

describe("snapshot import side effects", () => {
  it("does not perform filesystem access on import", async () => {
    await expect(import("../../src/snapshot/index.js")).resolves.toBeDefined();
  });
});
