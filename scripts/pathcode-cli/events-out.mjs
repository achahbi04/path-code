/**
 * Phase PS1 — NDJSON event-file sink (CLI shell only).
 *
 * Fresh on launch (truncate), append-only thereafter, flush each line so a
 * separate Studio process can read events as they occur — never a delayed burst.
 * No network listener. File/pipe handle only.
 */

import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";

/**
 * Open `--events-out` exclusively for this session: truncate existing content
 * so prior-run events cannot contaminate a fresh Studio view.
 *
 * @param {string} filePath
 */
export function openEventsOutSink(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new Error("events-out path required");
  }
  const path = filePath.trim();
  // 'w' truncates / creates — FRESH SINK ON LAUNCH (PS1-M).
  const fd = openSync(path, "w");

  /**
   * Write one NDJSON line and flush immediately (PS1-L).
   * @param {string} line
   */
  function writeLine(line) {
    writeSync(fd, line);
    try {
      fsyncSync(fd);
    } catch {
      // Some destinations (e.g. certain pipes) reject fsync; the writeSync
      // already delivered the bytes to the kernel buffer for the reader.
    }
  }

  function close() {
    try {
      closeSync(fd);
    } catch {
      // already closed
    }
  }

  return {
    path,
    fd,
    writeLine,
    close,
  };
}
