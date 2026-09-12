/**
 * Pure AG4 publication key → decision (first recognized wins at caller).
 * @param {number} byte
 * @returns {"approve"|"decline"|"cancel"|null}
 */
export function classifyPublicationKey(byte) {
  if (byte === 0x03) return "cancel";
  if (byte === 0x1b || byte === 0x0d || byte === 0x0a) return "decline";
  const ch = String.fromCharCode(byte);
  if (ch === "y" || ch === "Y") return "approve";
  if (ch === "n" || ch === "N") return "decline";
  return null;
}
