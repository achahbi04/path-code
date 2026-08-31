#!/usr/bin/env node
/**
 * Path Code CLI process adapter.
 * Owns real process readings. Does not contain engineering-task behavior.
 */

import { evaluateStartup } from "./startup.js";
import { runCli } from "./main.js";

function writeOut(text: string): void {
  process.stdout.write(text);
}

function writeErr(text: string): void {
  process.stderr.write(text);
}

const startup = evaluateStartup(process.version, process.platform);
if (!startup.ok) {
  writeErr(`Path Code startup failed: ${startup.error.message}\n`);
  process.exitCode = 1;
} else {
  // process.argv: [node, script, ...userArgs]
  const args = process.argv.slice(2);
  process.exitCode = runCli(args, {
    writeOut,
    writeErr,
  });
}
