/**
 * Display-only escaping for untrusted paths/text/IDs/errors/output.
 * Never apply to bytes passed into approval/application.
 */

const BIDI_AND_INVISIBLE = new Set([
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d,
  0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff,
]);

/**
 * @param {string} text
 * @returns {string}
 */
export function escapeForTerminalDisplay(text) {
  if (typeof text !== "string") {
    return String(text);
  }
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x09) {
      out += "\\t";
      continue;
    }
    if (cp === 0x0a) {
      out += "\n";
      continue;
    }
    if (cp === 0x0d) {
      out += "\\r";
      continue;
    }
    if (cp === 0x1b) {
      out += "\\u001b";
      continue;
    }
    if (cp === 0x7f) {
      out += "\\u007f";
      continue;
    }
    if (cp < 0x20 || (cp >= 0x80 && cp < 0xa0) || BIDI_AND_INVISIBLE.has(cp)) {
      out += `\\u${cp.toString(16).padStart(4, "0")}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Prefix every logical line so untrusted content cannot forge host prompts.
 * @param {string} text
 * @param {string} [prefix]
 */
export function prefixUntrustedLines(text, prefix = "| ") {
  const escaped = escapeForTerminalDisplay(text);
  if (escaped.length === 0) {
    return `${prefix}(empty)`;
  }
  return escaped
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

export const ESCAPE_LEGEND =
  "Legend: controls shown as \\uXXXX; tabs as \\t; CR as \\r; ESC as \\u001b.";
