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
