import test from "node:test";
import assert from "node:assert/strict";
import { authHeader } from "./index.ts";
test("authHeader uses correct token prefix", () => {
  assert.equal(authHeader("alice"), "tok:alice");
});
