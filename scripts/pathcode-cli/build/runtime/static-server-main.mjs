#!/usr/bin/env node

/**
 * Dedicated Build static-preview process.
 *
 * Static authority must live in its own S4-trackable process just like a
 * framework dev server. The coordinator owns and reconstructs this process
 * through the shared process registry.
 */

import { startStaticPreviewServer } from "./static-serve.mjs";

const root = process.argv[2];
const port = Number(process.argv[3]);

if (!root || !Number.isInteger(port) || port <= 0) {
  console.error("usage: static-server-main.mjs <root> <port>");
  process.exit(2);
}

const handle = await startStaticPreviewServer(root, port);
console.log(`PATH Build static preview listening on ${handle.url}`);

const stop = async () => {
  try {
    await handle.stop();
  } finally {
    process.exit(0);
  }
};

process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
