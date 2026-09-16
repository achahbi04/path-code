/**
 * Canonical text normalization for PATH objectives and paste.
 * Persist LF-only newlines; never store literal CR escape sequences.
 */

/**
 * Normalize CRLF / lone CR to LF. Does not trim.
 * @param {unknown} input
 * @returns {string}
 */
export function normalizeNewlines(input) {
  if (typeof input !== "string") return "";
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Normalize an engineering objective / task text for durable storage and UI.
 * @param {unknown} input
 * @param {{ maxChars?: number }} [opts]
 * @returns {string}
 */
export function normalizeObjectiveText(input, opts = {}) {
  const max =
    typeof opts.maxChars === "number" && opts.maxChars > 0
      ? Math.floor(opts.maxChars)
      : 16_000;
  let text = normalizeNewlines(input);
  // Collapse runs of 3+ blank lines to a single blank line.
  text = text.replace(/\n{3,}/g, "\n\n");
  // Strip trailing whitespace on each line; keep intentional blank lines.
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
  text = text.replace(/^\n+/, "").replace(/\n+$/, "");
  if (text.length > max) text = text.slice(0, max);
  return text;
}

/**
 * True if text still contains CR (should be false after normalize).
 * @param {unknown} input
 */
export function containsCarriageReturn(input) {
  return typeof input === "string" && input.includes("\r");
}
