/**
 * S3.1 — Cursor SDK executor detection / classification (mechanical).
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CURSOR = join(CHECKOUT, "scripts/pathcode-cli/ag10/cursor-sdk.mjs");

async function load() {
  return import(`${pathToFileURL(CURSOR).href}?s3c=${randomUUID()}`);
}

describe("S3.1 cursor executor", () => {
  it("loadCursorSdk returns ok when @cursor/sdk is installed", async () => {
    const { loadCursorSdk } = await load();
    const loaded = await loadCursorSdk();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.sdk?.Agent).toBeTruthy();
    }
  });

  it("detectCursorEngine without key → auth_required / unavailable", async () => {
    const { detectCursorEngine } = await load();
    const env = { ...process.env };
    delete env.CURSOR_API_KEY;
    delete env.PATHCODE_CURSOR_API_KEY;
    const detected = await detectCursorEngine({ env });
    expect(detected.ready).toBe(false);
    expect(detected.reason).toBe("auth_required");
    expect(["unavailable", "auth_required"]).toContain(detected.status);
  });

  it("classifyCursorFailure marks auth errors", async () => {
    const { classifyCursorFailure } = await load();
    const auth = classifyCursorFailure(new Error("API key unauthorized 401"));
    expect(auth.code).toBe("AUTH_REQUIRED");
    const net = classifyCursorFailure(new Error("ENOTFOUND api.cursor.com"));
    expect(net.code).toBe("SDK_CONNECTION");
  });
});
