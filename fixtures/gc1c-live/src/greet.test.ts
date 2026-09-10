import { describe, expect, it } from "vitest";
import { greet } from "./greet.js";

describe("greet (synthetic gc1c-live fixture)", () => {
  it("returns a greeting", () => {
    expect(greet("pathcode")).toBe("hello, pathcode");
  });
});
