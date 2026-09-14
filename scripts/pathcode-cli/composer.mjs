/**
 * PATH-owned TUI composer buffer + bracketed-paste parser.
 * No stdout echo — the living renderer paints the buffer.
 */

export const ENABLE_BRACKETED_PASTE = "\u001b[?2004h";
export const DISABLE_BRACKETED_PASTE = "\u001b[?2004l";
export const PASTE_START = "\u001b[200~";
export const PASTE_END = "\u001b[201~";
/** Private OSC: idle REPL composer is armed and listening (not mid-cycle steering). */
export const IDLE_COMPOSER_READY = "\u001b]7878;path-idle-composer\u0007";

/** Max visible composer rows before internal scroll. */
export const COMPOSER_MAX_ROWS = 6;
/** Soft cap for prompt length (chars). */
export const COMPOSER_MAX_CHARS = 16_000;

/**
 * @typedef {{
 *   text: string,
 *   cursor: number,
 *   pasteActive: boolean,
 *   scroll: number,
 * }} ComposerState
 */

/**
 * @returns {ComposerState}
 */
export function createComposerState() {
  return { text: "", cursor: 0, pasteActive: false, scroll: 0 };
}

/**
 * Wrap composer text into display rows for a given inner width.
 * @param {string} text
 * @param {number} width
 * @returns {string[]}
 */
export function wrapComposerLines(text, width) {
  const w = Math.max(8, Math.floor(width));
  const raw = typeof text === "string" ? text : "";
  if (raw.length === 0) return [""];
  /** @type {string[]} */
  const lines = [];
  const parts = raw.split("\n");
  for (let pi = 0; pi < parts.length; pi += 1) {
    const part = parts[pi];
    if (part.length === 0) {
      lines.push("");
      continue;
    }
    for (let i = 0; i < part.length; i += w) {
      lines.push(part.slice(i, i + w));
    }
  }
  return lines.length > 0 ? lines : [""];
}

/**
 * Visible composer window (bounded rows + scroll).
 * @param {ComposerState} state
 * @param {number} width
 * @param {number} [maxRows]
 */
export function composerVisibleLines(state, width, maxRows = COMPOSER_MAX_ROWS) {
  const all = wrapComposerLines(state.text, width);
  const max = Math.max(1, maxRows);
  if (all.length <= max) {
    return { lines: all, scroll: 0, total: all.length };
  }
  const scroll = Math.min(
    Math.max(0, state.scroll),
    Math.max(0, all.length - max),
  );
  return {
    lines: all.slice(scroll, scroll + max),
    scroll,
    total: all.length,
  };
}

/**
 * Parse raw stdin bytes into composer mutations.
 * @param {ComposerState} state
 * @param {Buffer|string} chunk
 * @returns {{
 *   state: ComposerState,
 *   submit: string | null,
 *   cancel: boolean,
 *   eof: boolean,
 * }}
 */
export function applyComposerInput(state, chunk) {
  let text = state.text;
  let cursor = Math.max(0, Math.min(state.cursor, text.length));
  let pasteActive = state.pasteActive;
  let scroll = state.scroll;
  /** @type {string | null} */
  let submit = null;
  let cancel = false;
  let eof = false;

  const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
  let s = data.toString("utf8");

  // Peel bracketed-paste markers (may span chunks if truncated — handle common case).
  while (s.length > 0 && submit == null && !cancel && !eof) {
    if (!pasteActive) {
      const startIdx = s.indexOf(PASTE_START);
      if (startIdx === 0) {
        pasteActive = true;
        s = s.slice(PASTE_START.length);
        continue;
      }
      if (startIdx > 0) {
        // Process bytes before paste start first.
        const before = s.slice(0, startIdx);
        s = s.slice(startIdx);
        const r = applyPlainKeys(text, cursor, before, { pasteActive: false });
        text = r.text;
        cursor = r.cursor;
        if (r.submit != null) {
          submit = r.submit;
          break;
        }
        if (r.cancel) {
          cancel = true;
          break;
        }
        if (r.eof) {
          eof = true;
          break;
        }
        continue;
      }
    } else {
      const endIdx = s.indexOf(PASTE_END);
      if (endIdx >= 0) {
        const pasted = s.slice(0, endIdx);
        // Paste never submits — newlines stay in buffer.
        const next = insertAt(text, cursor, pasted);
        text = next.text.slice(0, COMPOSER_MAX_CHARS);
        cursor = Math.min(next.cursor, text.length);
        pasteActive = false;
        s = s.slice(endIdx + PASTE_END.length);
        continue;
      }
      // Entire remainder is paste body (end marker not yet seen).
      const next = insertAt(text, cursor, s);
      text = next.text.slice(0, COMPOSER_MAX_CHARS);
      cursor = Math.min(next.cursor, text.length);
      s = "";
      break;
    }

    // No paste marker — plain keys for whole string.
    const r = applyPlainKeys(text, cursor, s, { pasteActive: false });
    text = r.text;
    cursor = r.cursor;
    submit = r.submit;
    cancel = r.cancel;
    eof = r.eof;
    s = "";
  }

  // Keep scroll near end when editing.
  const lines = wrapComposerLines(text, 80);
  if (lines.length > COMPOSER_MAX_ROWS) {
    scroll = Math.max(0, lines.length - COMPOSER_MAX_ROWS);
  } else {
    scroll = 0;
  }

  return {
    state: { text, cursor, pasteActive, scroll },
    submit,
    cancel,
    eof,
  };
}

/**
 * @param {string} text
 * @param {number} cursor
 * @param {string} insert
 */
function insertAt(text, cursor, insert) {
  const c = Math.max(0, Math.min(cursor, text.length));
  return {
    text: `${text.slice(0, c)}${insert}${text.slice(c)}`,
    cursor: c + insert.length,
  };
}

/**
 * @param {string} text
 * @param {number} cursor
 * @param {string} s
 * @param {{ pasteActive: boolean }} opts
 */
function applyPlainKeys(text, cursor, s, opts) {
  let t = text;
  let c = cursor;
  /** @type {string | null} */
  let submit = null;
  let cancel = false;
  let eof = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const code = s.charCodeAt(i);

    // ESC sequences (arrows etc.) — skip CSI
    if (code === 0x1b) {
      if (s.startsWith("\u001b[", i)) {
        let j = i + 2;
        while (j < s.length && !/[A-Za-z~]/.test(s[j])) j += 1;
        j = Math.min(s.length, j + 1);
        i = j;
        continue;
      }
      i += 1;
      continue;
    }

    if (code === 0x03) {
      // Ctrl-C
      cancel = true;
      break;
    }
    if (code === 0x04) {
      // Ctrl-D
      if (t.length === 0) eof = true;
      break;
    }
    if (code === 0x0d || code === 0x0a) {
      if (opts.pasteActive) {
        const next = insertAt(t, c, "\n");
        t = next.text.slice(0, COMPOSER_MAX_CHARS);
        c = Math.min(next.cursor, t.length);
        i += 1;
        continue;
      }
      submit = t;
      t = "";
      c = 0;
      break;
    }
    if (code === 0x7f || code === 0x08) {
      if (c > 0) {
        t = `${t.slice(0, c - 1)}${t.slice(c)}`;
        c -= 1;
      }
      i += 1;
      continue;
    }
    if (code === 0x15) {
      // Ctrl-U clear line
      t = "";
      c = 0;
      i += 1;
      continue;
    }
    if (code < 0x20) {
      i += 1;
      continue;
    }
    const next = insertAt(t, c, ch);
    t = next.text.slice(0, COMPOSER_MAX_CHARS);
    c = Math.min(next.cursor, t.length);
    i += 1;
  }
  return { text: t, cursor: c, submit, cancel, eof };
}

/**
 * Branding string pieces for tests / renderers.
 * @param {{ color?: boolean }} [opts]
 */
export function pathBrandSegments(opts = {}) {
  const color = opts.color !== false;
  if (!color) {
    return { path: "PATH", dot: "●", code: "Code", plain: "PATH ● Code" };
  }
  return {
    path: "PATH",
    dot: "●",
    code: "Code",
    plain: "PATH ● Code",
    ansiPath: "\u001b[1m\u001b[37mPATH\u001b[0m",
    ansiDot: "\u001b[33m●\u001b[0m",
    ansiCode: "\u001b[1m\u001b[37mCode\u001b[0m",
  };
}
