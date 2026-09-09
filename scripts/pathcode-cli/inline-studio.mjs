/**
 * Phase PS1-INLINE — in-process Path Studio cards on the primary CLI TTY.
 *
 * Synchronous stdout writes only. No timers, sockets, servers, or file
 * watchers. Cards update in place from real session.* events (R2-O).
 *
 * Terminal-rendering safety (mandatory):
 *   1a viewport clamp  1b ANSI-aware width  1c atomic single-write
 *   1d collision re-anchor  1e resize teardown  1f cursor restore  1g erase-below
 */

import {
  applyStudioEvent,
  assertNoFabricatedProgress,
  createEmptyStudioState,
  STUDIO_CARD_ORDER,
} from "../path-studio/state.mjs";
import { escapeForTerminalDisplay } from "./escape.mjs";
import { renderSessionEventHuman } from "./session-events.mjs";

const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b./g;

const HIDE_CURSOR = "\u001b[?25l";
const SHOW_CURSOR = "\u001b[?25h";
const ERASE_LINE = "\u001b[2K";
const ERASE_BELOW = "\u001b[J";
const CR = "\r";

/**
 * Visible width with ANSI escape sequences stripped (1b).
 * @param {string} text
 */
export function visibleWidth(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  const stripped = text.replace(ANSI_RE, "");
  // Count code points roughly as columns (BMP/emoji treated as 1 — good enough
  // for path truncation; never under-estimate by counting escapes).
  return Array.from(stripped).length;
}

/**
 * Truncate to a maximum VISIBLE width; never leave a partial escape.
 * @param {string} text
 * @param {number} maxCols
 */
export function truncateVisible(text, maxCols) {
  if (typeof text !== "string") return "";
  if (!(maxCols > 0)) return "";
  if (visibleWidth(text) <= maxCols) return text;
  const ellipsis = "…";
  const budget = Math.max(1, maxCols - visibleWidth(ellipsis));
  let out = "";
  let width = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\u001b") {
      ANSI_RE.lastIndex = i;
      const m = ANSI_RE.exec(text);
      if (m && m.index === i) {
        out += m[0];
        i += m[0].length;
        continue;
      }
    }
    const cp = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    const step = cp > 0xffff ? 2 : 1;
    if (width + 1 > budget) break;
    out += ch;
    width += 1;
    i += step;
  }
  return `${out}${ellipsis}`;
}

/**
 * @param {string} text
 * @param {number} columns
 */
export function fitLine(text, columns) {
  const cols =
    typeof columns === "number" && columns > 0 ? Math.floor(columns) : 80;
  const sanitized = escapeForTerminalDisplay(text).replace(/\r?\n/g, " ");
  return truncateVisible(sanitized, cols);
}

/**
 * @param {ReturnType<typeof createEmptyStudioState>} state
 */
function activeCardId(state) {
  for (const id of STUDIO_CARD_ORDER) {
    if (state.cards[id]?.status === "active") return id;
  }
  // Prefer terminal when arrived; else last arrived non-pending.
  if (state.cards.terminal?.arrived) return "terminal";
  for (let i = STUDIO_CARD_ORDER.length - 1; i >= 0; i -= 1) {
    const id = STUDIO_CARD_ORDER[i];
    if (state.cards[id]?.arrived) return id;
  }
  return null;
}

/**
 * @param {{ id: string, title: string, status: string, detail: string, arrived: boolean }} card
 * @param {boolean} compact
 * @param {number} columns
 */
function formatCardLine(card, compact, columns) {
  const mark =
    card.status === "pending"
      ? "[ ]"
      : card.status === "skipped"
        ? "[~]"
        : card.status === "refused"
          ? "[x]"
          : card.status === "active"
            ? "[>]"
            : "[*]";
  if (compact) {
    return fitLine(`${mark} ${card.title}`, columns);
  }
  return fitLine(`${mark} ${card.title}: ${card.detail}`, columns);
}

/**
 * Build the visible card block, clamped to rows-2 (1a).
 * Non-active stages collapse to single-line summaries when needed.
 *
 * @param {ReturnType<typeof createEmptyStudioState>} state
 * @param {{ rows: number, columns: number }} viewport
 * @returns {string[]}
 */
export function buildInlineCardLines(state, viewport) {
  const rows =
    typeof viewport.rows === "number" && viewport.rows > 0
      ? Math.floor(viewport.rows)
      : 24;
  const columns =
    typeof viewport.columns === "number" && viewport.columns > 0
      ? Math.floor(viewport.columns)
      : 80;
  const maxHeight = Math.max(3, rows - 2);
  const activeId = activeCardId(state);

  /** @type {string[]} */
  const header = [];
  header.push(fitLine("PATH STUDIO — live", columns));
  header.push(
    fitLine(
      state.sessionId
        ? `session: ${state.sessionId}`
        : "session: (waiting for first event)",
      columns,
    ),
  );

  /** @type {Array<{ id: string, full: string, compact: string, keepFull: boolean }>} */
  const body = [];
  for (const id of STUDIO_CARD_ORDER) {
    const card = state.cards[id];
    if (!card) continue;
    const keepFull =
      id === activeId ||
      id === "terminal" ||
      card.status === "active" ||
      card.status === "refused" ||
      (id === "validationSkipped" && card.arrived);
    body.push({
      id,
      full: formatCardLine(card, false, columns),
      compact: formatCardLine(card, true, columns),
      keepFull,
    });
  }

  /** @type {string[]} */
  const footer = [];
  if (state.heartbeat) {
    const sec = Math.floor(state.heartbeat.elapsedMs / 1000);
    footer.push(
      fitLine(`liveness: working on ${state.heartbeat.stage} — ${sec}s`, columns),
    );
  }

  const assemble = (compactNonKeep) => {
    /** @type {string[]} */
    const lines = [...header, ""];
    for (const row of body) {
      lines.push(compactNonKeep && !row.keepFull ? row.compact : row.full);
    }
    if (footer.length > 0) {
      lines.push("");
      lines.push(...footer);
    }
    return lines;
  };

  let lines = assemble(false);
  if (lines.length <= maxHeight) {
    for (const line of lines) {
      if (visibleWidth(line) > columns) {
        throw new Error("inline card line exceeded columns after fit");
      }
    }
    return lines;
  }

  // Collapse non-kept stages first.
  lines = assemble(true);
  if (lines.length <= maxHeight) return lines;

  // Drop pending (not-yet) cards from the visible block, keep arrived + active.
  const arrivedOnly = body.filter(
    (row) => state.cards[row.id]?.arrived === true || row.keepFull,
  );
  lines = [...header, ""];
  for (const row of arrivedOnly) {
    lines.push(row.keepFull ? row.full : row.compact);
  }
  if (footer.length > 0) {
    lines.push("");
    lines.push(...footer);
  }
  if (lines.length <= maxHeight) return lines;

  // Hard trim from the top of the body, preserving header + active/terminal.
  const essential = new Set(
    [activeId, "terminal"].filter((x) => typeof x === "string"),
  );
  const kept = arrivedOnly.filter((row) => essential.has(row.id) || row.keepFull);
  const optional = arrivedOnly.filter((row) => !essential.has(row.id) && !row.keepFull);
  lines = [...header, ""];
  const room = maxHeight - lines.length - footer.length - (footer.length > 0 ? 1 : 0);
  const optionalBudget = Math.max(0, room - kept.length);
  const shownOptional = optional.slice(-optionalBudget);
  for (const row of [...shownOptional, ...kept]) {
    lines.push(row.keepFull ? row.full : row.compact);
  }
  if (footer.length > 0) {
    lines.push("");
    lines.push(...footer);
  }
  while (lines.length > maxHeight) {
    // Drop from just after header blank.
    if (lines.length <= header.length + 2) break;
    lines.splice(header.length + 1, 1);
  }
  return lines.slice(0, maxHeight);
}

/**
 * Assemble one ANSI frame for in-place redraw (1c, 1g).
 *
 * Cursor ends one row below the block. Next non-reanchor redraw moves up
 * `lines.length` rows to the first card line. `\u001b[J` runs from that
 * below-block row so a shorter frame erases phantom leftovers.
 *
 * @param {string[]} lines
 * @param {{ prevHeight: number, reanchor: boolean, hideCursor: boolean }} opts
 */
export function assembleAnsiFrame(lines, opts) {
  const prevHeight = opts.prevHeight > 0 ? opts.prevHeight : 0;
  const reanchor = opts.reanchor === true;
  const hideCursor = opts.hideCursor !== false;
  /** @type {string[]} */
  const parts = [];
  if (hideCursor) parts.push(HIDE_CURSOR);
  if (!reanchor && prevHeight > 0) {
    parts.push(`\u001b[${prevHeight}A`);
  } else if (reanchor) {
    // External write may have left the cursor elsewhere; start a fresh block.
    parts.push("\n");
  }
  for (let i = 0; i < lines.length; i += 1) {
    parts.push(CR);
    parts.push(ERASE_LINE);
    parts.push(lines[i] ?? "");
    parts.push("\n");
  }
  // Cursor is now one row below the block — erase any taller prior frame (1g).
  parts.push(ERASE_BELOW);
  return parts.join("");
}

/**
 * @param {{
 *   stdout?: NodeJS.WritableStream & {
 *     isTTY?: boolean,
 *     rows?: number,
 *     columns?: number,
 *     on?: Function,
 *     off?: Function,
 *     write?: Function,
 *   },
 *   enabled?: boolean,
 *   writePlain?: (text: string) => void,
 *   decorateGate2Accepted?: boolean,
 * }} [options]
 */
export function createInlineStudioRenderer(options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const enabled =
    typeof options.enabled === "boolean"
      ? options.enabled
      : stdout.isTTY === true;

  /** @type {ReturnType<typeof createEmptyStudioState>} */
  let state = createEmptyStudioState();
  let active = false;
  let prevHeight = 0;
  let needsReanchor = false;
  let cursorHidden = false;
  /** @type {((this: any) => void) | null} */
  let resizeListener = null;
  let writeCount = 0;
  /** @type {string[]} */
  const frames = [];
  const decorateGate2Accepted = options.decorateGate2Accepted === true;

  function readViewport() {
    const rows =
      typeof stdout.rows === "number" && stdout.rows > 0 ? stdout.rows : 24;
    const columns =
      typeof stdout.columns === "number" && stdout.columns > 0
        ? stdout.columns
        : 80;
    return { rows, columns };
  }

  function detachResize() {
    if (resizeListener !== null && typeof stdout.off === "function") {
      try {
        stdout.off("resize", resizeListener);
      } catch {
        // best effort
      }
    }
    resizeListener = null;
  }

  function restoreCursor() {
    if (!enabled) {
      cursorHidden = false;
      return;
    }
    try {
      stdout.write(SHOW_CURSOR);
    } catch {
      // best effort
    }
    cursorHidden = false;
  }

  function emitFrame(frame) {
    writeCount += 1;
    frames.push(frame);
    stdout.write(frame);
  }

  function redraw() {
    if (!enabled || !active) return;
    const viewport = readViewport();
    const lines = buildInlineCardLines(state, viewport);
    const text = `${lines.join("\n")}\n`;
    assertNoFabricatedProgress(text);
    for (const line of lines) {
      if (visibleWidth(line) > viewport.columns) {
        throw new Error("PI-I: visible width exceeds columns");
      }
    }
    const frame = assembleAnsiFrame(lines, {
      prevHeight,
      reanchor: needsReanchor,
      hideCursor: true,
    });
    cursorHidden = true;
    emitFrame(frame);
    prevHeight = lines.length;
    needsReanchor = false;
  }

  function begin() {
    // Tear down any prior cycle handles before arming a new one (R2-K / 1e / 1f).
    detachResize();
    if (cursorHidden) restoreCursor();
    state = createEmptyStudioState();
    active = true;
    prevHeight = 0;
    needsReanchor = false;
    writeCount = 0;
    frames.length = 0;
    if (enabled && typeof stdout.on === "function") {
      resizeListener = () => {
        if (active) redraw();
      };
      stdout.on("resize", resizeListener);
    }
  }

  /**
   * End the card cycle: detach resize, restore cursor, leave final cards on screen.
   * Safe on every terminal path (completion / refusal / escalation / error / SIGINT).
   */
  function finish() {
    detachResize();
    if (cursorHidden) {
      restoreCursor();
    }
    active = false;
    prevHeight = 0;
    needsReanchor = false;
  }

  /**
   * @param {Record<string, unknown>} event
   */
  function onEvent(event) {
    if (!active) {
      // Auto-begin on first event if the host forgot begin() — still tears down.
      begin();
    }
    applyStudioEvent(state, event, { decorateGate2Accepted });

    if (!enabled) {
      // Non-TTY: plain sequential progress lines (no ANSI cursor codes).
      const plain = renderSessionEventHuman(event);
      if (!plain) return;
      if (typeof options.writePlain === "function") {
        options.writePlain(plain);
      } else {
        writeCount += 1;
        frames.push(plain);
        stdout.write(plain);
      }
      return;
    }

    redraw();
  }

  function noteExternalWrite() {
    if (!active || !enabled) return;
    // Collision guard (1d): next redraw re-anchors instead of cursor-up.
    needsReanchor = true;
    prevHeight = 0;
    if (cursorHidden) {
      restoreCursor();
    }
  }

  function isActive() {
    return active;
  }

  function getState() {
    return state;
  }

  /** Test / proof introspection. */
  function stats() {
    return {
      enabled,
      active,
      prevHeight,
      needsReanchor,
      cursorHidden,
      writeCount,
      frames: frames.slice(),
      hasResizeListener: resizeListener !== null,
    };
  }

  return {
    enabled,
    begin,
    onEvent,
    noteExternalWrite,
    finish,
    dispose: () => finish(),
    isActive,
    getState,
    stats,
    // Exported for SIGINT / cycle cleanup parity with finish.
    restoreCursor,
    detachResize,
  };
}

/**
 * Wrap a prompt.write so external session output re-anchors the card block (1d).
 * @param {{ write: (text: string) => void }} prompt
 * @param {ReturnType<typeof createInlineStudioRenderer>} renderer
 */
export function installCollisionGuard(prompt, renderer) {
  const original = prompt.write.bind(prompt);
  prompt.write = (text) => {
    if (renderer.isActive() && renderer.enabled) {
      renderer.noteExternalWrite();
    }
    return original(text);
  };
  return () => {
    prompt.write = original;
  };
}
