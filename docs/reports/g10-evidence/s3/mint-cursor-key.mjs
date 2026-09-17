#!/usr/bin/env node
/**
 * Mint a Cursor SDK user API key via browser login and store it in:
 *   - ~/.cursor/sdk/auth.json (SDK default)
 *   - macOS Keychain service PATH_CURSOR_API_KEY
 *
 * Usage: node docs/reports/g10-evidence/s3/mint-cursor-key.mjs
 */
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checkout = join(here, "../../../..");
const require = createRequire(join(checkout, "package.json"));
const entry = require.resolve("@cursor/sdk");
const esm = entry.includes("/dist/cjs/")
  ? entry.replace("/dist/cjs/", "/dist/esm/")
  : entry;
const sdk = await import(pathToFileURL(esm).href);
const Cursor = sdk.Cursor;
if (!Cursor?.auth?.login) {
  console.error(JSON.stringify({ ok: false, reason: "Cursor.auth.login missing" }));
  process.exit(2);
}

const { storeMacOsKeychainPassword } = await import(
  pathToFileURL(
    join(checkout, "scripts/pathcode-cli/ag10/cursor-sdk.mjs"),
  ).href
);

console.error("[s31] Opening Cursor browser login to mint SDK API key…");
const result = await Cursor.auth.login({
  openBrowser: true,
  apiKeyName: "path-code-s31",
  onLoginUrl: (url) => {
    console.error(`[s31] Login URL: ${url}`);
  },
});

const key = typeof result?.apiKey === "string" ? result.apiKey.trim() : "";
if (!key) {
  console.error(JSON.stringify({ ok: false, reason: "login_returned_no_key" }));
  process.exit(1);
}

const stored = storeMacOsKeychainPassword(key, {
  service: "PATH_CURSOR_API_KEY",
  account: process.env.USER || "achahbi",
});

console.log(
  JSON.stringify({
    ok: true,
    email: result.email || null,
    apiKeyExpiresAtMs: result.apiKeyExpiresAtMs || null,
    keyPrefix: key.slice(0, 10),
    keyLen: key.length,
    keychain: stored,
    authFile: "~/.cursor/sdk/auth.json",
  }),
);
