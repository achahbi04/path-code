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
 * Accept the next view for the active Build. Revision order is per Build —
 * switching projects must not let an unrelated older counter suppress the
 * newly selected Build's first projection.
 *
 * @param {{
 *   previousBuildId?: string | null,
 *   nextBuildId?: string | null,
 *   previousRevision?: number,
 *   nextRevision?: number,
 * }} input
 */
export function shouldAcceptBuildView(input) {
  const previousBuildId = input.previousBuildId || null;
  const nextBuildId = input.nextBuildId || null;
  const previousRevision =
    previousBuildId && nextBuildId && previousBuildId !== nextBuildId
      ? -1
      : input.previousRevision;
  return shouldAcceptViewRevision(previousRevision, input.nextRevision);
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

function isCandidatePreviewSrc(src) {
  return typeof src === "string" && src.includes("/preview-candidate/");
}

/**
 * Last-known-good preview. A preparing or failed revision must not replace
 * a visible preview with an empty stage. The first product still uses the
 * empty state, because nothing good exists yet.
 *
 * A discarded/applied candidate URL is never held — candidate preview is only
 * valid while the Build still has a pending candidate.
 *
 * @param {{
 *   heldSrc?: string | null,
 *   nextReady?: boolean,
 *   nextSrc?: string | null,
 *   nextFailed?: boolean,
 *   preparing?: boolean,
 *   allowCandidateHold?: boolean,
 * }} input
 */
export function previewTransition(input) {
  const heldRaw = typeof input.heldSrc === "string" && input.heldSrc ? input.heldSrc : "";
  const next = typeof input.nextSrc === "string" && input.nextSrc ? input.nextSrc : "";
  const held =
    isCandidatePreviewSrc(heldRaw) && input.allowCandidateHold === false
      ? ""
      : heldRaw;
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

/**
 * Whether the iframe must navigate (or first-paint) for this decision.
 * `keep`/`hold` with an unloaded frame still requires commit — otherwise a
 * restart that seeds the same last-good URL never paints and stays blank.
 *
 * @param {{ action?: string, src?: string }} decision
 * @param {string | null | undefined} currentSrc
 */
export function previewNeedsCommit(decision, currentSrc) {
  const src = typeof decision?.src === "string" ? decision.src : "";
  if (!src || decision?.action === "empty") return false;
  const current = typeof currentSrc === "string" ? currentSrc : "";
  if (!current) return true;
  if (decision.action === "swap") return current !== src;
  // keep/hold: already painted this src — do not reload.
  return false;
}
