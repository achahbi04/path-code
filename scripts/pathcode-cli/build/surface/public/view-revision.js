/**
 * Projection ordering for PATH Build views.
 * The number is derived from the durable Build event id plus the task-trace
 * length. It is not a second state authority.
 *
 * @param {number} previous
 * @param {number} next
 */
export function shouldAcceptViewRevision(previous, next) {
  if (!Number.isFinite(next)) return true;
  if (!Number.isFinite(previous) || previous < 0) return true;
  return next >= previous;
}

/**
 * Preview iframe URL. The revision query is cache-busting projection metadata
 * so a newly adopted product SHA cannot keep painting the previous document.
 *
 * @param {string} embed
 * @param {string | null | undefined} authoritativeSha
 */
export function previewFrameSrc(embed, authoritativeSha) {
  const base = embed.endsWith("/") ? embed : `${embed}/`;
  const sha = typeof authoritativeSha === "string" ? authoritativeSha.trim() : "";
  if (!sha) return base;
  return `${base}?rev=${encodeURIComponent(sha)}`;
}

/**
 * Last-known-good preview. A preparing or failed revision must not replace
 * a visible preview with an empty stage. The first product still uses the
 * empty state, because nothing good exists yet.
 *
 * @param {{
 *   heldSrc?: string | null,
 *   nextReady?: boolean,
 *   nextSrc?: string | null,
 *   nextFailed?: boolean,
 *   preparing?: boolean,
 * }} input
 */
export function previewTransition(input) {
  const held = typeof input.heldSrc === "string" && input.heldSrc ? input.heldSrc : "";
  const next = typeof input.nextSrc === "string" && input.nextSrc ? input.nextSrc : "";
  if (input.nextReady && next) {
    return { action: next === held ? "keep" : "swap", src: next, notice: "" };
  }
  if (held) {
    if (input.nextFailed) {
      return { action: "hold", src: held, notice: "Preview update failed" };
    }
    return {
      action: "hold",
      src: held,
      notice: input.preparing ? "New revision preparing…" : "Updating preview…",
    };
  }
  return { action: "empty", src: "", notice: "" };
}
