#!/usr/bin/env node
/**
 * Path Studio — separate READ-ONLY process (Phase PS1).
 *
 * Reads the NDJSON sink written by pathcode (`--events ndjson --events-out`).
 * Does not drive, mint, approve, or execute. No write-back channel to the CLI.
 * No credentials. No authority. Future interactive drive-mode (NOT in PS1)
 * may only send the exact challenge string over the CLI's existing stdin gate.
 *
 * Usage:
 *   node scripts/path-studio/path-studio.mjs --events-in <path> [--session <id>]
 *   node scripts/path-studio/path-studio.mjs --events-in <path> --once
 */

import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { parseSessionEventNdjson } from "../pathcode-cli/session-events.mjs";
import {
  applyStudioEvent,
  assertNoFabricatedProgress,
  createEmptyStudioState,
  renderStudioText,
} from "./state.mjs";

/**
 * @param {readonly string[]} argv
 */
export function parseStudioArgs(argv) {
  /** @type {{ eventsIn: string | null, sessionId: string | null, once: boolean, help: boolean }} */
  const out = {
    eventsIn: null,
    sessionId: null,
    once: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (a === "--once") {
      out.once = true;
      continue;
    }
    if (a === "--events-in") {
      const next = argv[i + 1];
      if (typeof next !== "string" || next.trim() === "" || next.startsWith("-")) {
        return { ok: false, message: "Usage: path-studio --events-in <path>" };
      }
      out.eventsIn = next.trim();
      i += 1;
      continue;
    }
    if (a === "--session") {
      const next = argv[i + 1];
      if (typeof next !== "string" || next.trim() === "" || next.startsWith("-")) {
        return { ok: false, message: "Usage: path-studio --session <sessionId>" };
      }
      out.sessionId = next.trim();
      i += 1;
      continue;
    }
    return { ok: false, message: `Unknown argument: ${a}` };
  }
  return { ok: true, value: out };
}

/**
 * Follow a sink file from offset, invoking onLine for each complete NDJSON line.
 * @param {string} filePath
 * @param {{
 *   onLine: (line: string) => void,
 *   onEnd?: () => void,
 *   pollMs?: number,
 *   signal?: { stopped: boolean },
 *   maxIdleMs?: number,
 * }} options
 */
export async function followEventsIn(filePath, options) {
  const pollMs = options.pollMs ?? 50;
  const maxIdleMs = options.maxIdleMs ?? 2_000;
  let offset = 0;
  let buffer = "";
  let idleMs = 0;
  const signal = options.signal ?? { stopped: false };

  while (!signal.stopped) {
    if (!existsSync(filePath)) {
      await sleep(pollMs);
      idleMs += pollMs;
      if (idleMs >= maxIdleMs && options.onEnd) {
        options.onEnd();
        return;
      }
      continue;
    }
    const st = statSync(filePath);
    if (st.size < offset) {
      // Truncated (fresh sink) — reset.
      offset = 0;
      buffer = "";
    }
    if (st.size > offset) {
      const fd = openSync(filePath, "r");
      try {
        const length = st.size - offset;
        const buf = Buffer.alloc(length);
        readSync(fd, buf, 0, length, offset);
        offset = st.size;
        buffer += buf.toString("utf8");
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.trim() !== "") options.onLine(line);
        }
        idleMs = 0;
      } finally {
        closeSync(fd);
      }
    } else {
      await sleep(pollMs);
      idleMs += pollMs;
      if (idleMs >= maxIdleMs && options.onEnd) {
        options.onEnd();
        return;
      }
    }
  }
}

/**
 * Reduce a complete NDJSON text blob (fixture / --once).
 * @param {string} text
 * @param {{ sessionId?: string | null }} [opts]
 */
export function studioFromNdjsonText(text, opts = {}) {
  const events = parseSessionEventNdjson(text);
  const state = createEmptyStudioState();
  for (const event of events) {
    applyStudioEvent(state, event, opts);
  }
  state.sinkEnded = true;
  return state;
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {readonly string[]} argv
 * @param {{ stdout?: { write: (s: string) => void }, stderr?: { write: (s: string) => void } }} [io]
 */
export async function runPathStudioMain(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const parsed = parseStudioArgs(argv);
  if (!parsed.ok) {
    stderr.write(`${parsed.message}\n`);
    return 2;
  }
  const args = parsed.value;
  if (args.help) {
    stdout.write(
      [
        "Path Studio — read-only NDJSON session mirror",
        "",
        "  --events-in <path>   NDJSON sink from pathcode --events-out",
        "  --session <id>       Bind to one session id (ignore others)",
        "  --once               Render current sink contents and exit",
        "  --help               Show help",
        "",
        "No input path to the CLI. No authority. No credentials.",
        "",
      ].join("\n"),
    );
    return 0;
  }
  if (!args.eventsIn) {
    stderr.write("Usage: path-studio --events-in <path> [--session <id>] [--once]\n");
    return 2;
  }

  const state = createEmptyStudioState();
  const applyOpts = args.sessionId ? { sessionId: args.sessionId } : {};

  const redraw = () => {
    const text = renderStudioText(state);
    assertNoFabricatedProgress(text);
    stdout.write(`\n${text}`);
  };

  if (args.once) {
    if (!existsSync(args.eventsIn)) {
      stderr.write(`No sink yet: ${args.eventsIn}\n`);
      return 1;
    }
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(args.eventsIn, "utf8");
    const events = parseSessionEventNdjson(text);
    for (const event of events) {
      applyStudioEvent(state, event, applyOpts);
    }
    state.sinkEnded = true;
    redraw();
    return 0;
  }

  // Live follow — separate process; killing this does not affect the CLI.
  await followEventsIn(args.eventsIn, {
    onLine: (line) => {
      const events = parseSessionEventNdjson(line);
      for (const event of events) {
        applyStudioEvent(state, event, applyOpts);
      }
      redraw();
    },
    onEnd: () => {
      state.sinkEnded = true;
      redraw();
    },
    maxIdleMs: 3_000,
  });
  return 0;
}

// Detect write-back channel absence for proofs (no exports that write to CLI).
export const PATH_STUDIO_WRITE_BACK = Object.freeze({
  hasWriteBack: false,
  authorityMint: false,
  autoApprove: false,
  stdinBridge: false,
});

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("path-studio.mjs")) {
  // Direct entry (also via realpath-tolerant check below).
}

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

function isDirectStudioEntry(argv1 = process.argv[1]) {
  if (!argv1) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(argv1) === realpathSync(modulePath);
  } catch {
    return argv1.endsWith("path-studio.mjs");
  }
}

if (isDirectStudioEntry()) {
  runPathStudioMain(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(
        `path-studio failed: ${err && err.message ? err.message : "unknown"}\n`,
      );
      process.exitCode = 1;
    });
}
