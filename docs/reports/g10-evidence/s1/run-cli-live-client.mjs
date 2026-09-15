#!/usr/bin/env node
/**
 * S1 helper — drive scripts/pathcode.mjs (runPathcodeMain) with a fake TTY
 * against PATHCODE_GATEWAY_EXTERNAL=1 so the process is a presentation client.
 */
import { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const checkout = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const objective = process.env.PATHCODE_S1_OBJECTIVE || "Fix failing add tests";
const eventsOut = process.env.PATHCODE_S1_EVENTS_OUT || "";

function createReplTty(lines) {
  const queue = [...lines];
  const stdin = new Readable({ read() {} });
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = function setRawMode(mode) {
    this.isRaw = mode;
    return this;
  };

  let fedArmed = true;
  const feedNext = () => {
    const next = queue.shift();
    if (next === undefined) return;
    setImmediate(() => stdin.push(`${next}\n`));
  };

  const stdout = new Writable({
    write(chunk, _enc, cb) {
      const text = String(chunk);
      process.stderr.write(text);
      if (text.includes("\u001b[?2004l")) fedArmed = true;
      if (
        fedArmed &&
        (text.includes("\u001b]7878;path-idle-composer\u0007") ||
          text.endsWith("> ") ||
          text.includes("\n> "))
      ) {
        fedArmed = false;
        setImmediate(() => feedNext());
      }
      cb();
    },
  });
  stdout.isTTY = true;
  stdout.columns = 100;

  const stderr = new Writable({
    write(chunk, _enc, cb) {
      process.stderr.write(chunk);
      cb();
    },
  });

  // Safety: if idle OSC never arrives, still feed first line.
  setTimeout(() => {
    if (queue.length === lines.length) feedNext();
  }, 6_000);

  return { stdin, stdout, stderr };
}

const { runPathcodeMain } = await import(
  `${pathToFileURL(join(checkout, "scripts/pathcode.mjs")).href}?s1cli=${Date.now()}`
);

const tty = createReplTty([objective, "/exit"]);
const argv = ["--execution", "local"];
if (eventsOut) {
  argv.push("--events", "ndjson", "--events-out", eventsOut);
}

const code = await runPathcodeMain(argv, {
  stdin: tty.stdin,
  stdout: tty.stdout,
  stderr: tty.stderr,
});
process.exit(code ?? 0);
