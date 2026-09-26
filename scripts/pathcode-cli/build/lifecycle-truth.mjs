/**
 * Creator/product lifecycle truth helpers.
 * Separated from record.mjs so surface projection can share without cycles.
 */

/**
 * Mark meaningful creator/product lifecycle activity.
 * Does not replace writeBuildRecord's generic `updatedAt` persistence clock.
 *
 * @param {import('./types.mjs').BuildRecord | object} record
 * @param {string} [at]
 */
export function touchLifecycleActivity(record, at = new Date().toISOString()) {
  if (!record || typeof record !== "object") return record;
  record.lifecycleActivityAt = at;
  return record;
}

/**
 * Persist last-known-good applied product preview identity.
 * Candidate previews must never write this.
 *
 * @param {import('./types.mjs').BuildRecord | object} record
 * @param {{ sha: string, at?: string, embedPath?: string }} input
 */
export function setLastGoodPreview(record, input) {
  if (!record || typeof record !== "object") return record;
  const sha = typeof input?.sha === "string" ? input.sha.trim() : "";
  if (!sha || !record.buildId) return record;
  const embedPath =
    typeof input.embedPath === "string" && input.embedPath.trim()
      ? input.embedPath.trim()
      : `/preview/${record.buildId}/`;
  record.lastGoodPreview = {
    embedPath,
    sha,
    at: typeof input.at === "string" && input.at ? input.at : new Date().toISOString(),
  };
  return record;
}

/**
 * Durable last-good preview projection. Empty stage only when no applied
 * product revision has ever been established.
 *
 * @param {import('./types.mjs').BuildRecord | object | null | undefined} build
 */
export function projectLastGoodPreview(build) {
  if (!build || typeof build !== "object" || !build.buildId) return null;
  const stored = build.lastGoodPreview;
  if (
    stored &&
    typeof stored === "object" &&
    typeof stored.sha === "string" &&
    stored.sha.trim() &&
    typeof stored.embedPath === "string" &&
    stored.embedPath.trim()
  ) {
    return {
      embedPath: stored.embedPath.trim(),
      sha: stored.sha.trim(),
      at: typeof stored.at === "string" ? stored.at : null,
    };
  }
  const appliedSha =
    typeof build.lastAppliedCandidate?.adoptedSha === "string"
      ? build.lastAppliedCandidate.adoptedSha.trim()
      : "";
  if (appliedSha) {
    return {
      embedPath: `/preview/${build.buildId}/`,
      sha: appliedSha,
      at:
        typeof build.lastAppliedCandidate?.at === "string"
          ? build.lastAppliedCandidate.at
          : null,
    };
  }
  const auth =
    typeof build.authoritativeSha === "string" ? build.authoritativeSha.trim() : "";
  if (!auth) return null;
  const history = Array.isArray(build.adoptionHistory) ? build.adoptionHistory : [];
  const kids = Array.isArray(build.children) ? build.children : [];
  const hadAdoption =
    history.some((entry) => entry?.adoptedSha) ||
    kids.some((child) => child?.adoptedSha);
  if (!hadAdoption) return null;
  return {
    embedPath: `/preview/${build.buildId}/`,
    sha: auth,
    at:
      typeof build.lifecycleActivityAt === "string"
        ? build.lifecycleActivityAt
        : null,
  };
}

/**
 * Creator/product activity time for the project rail.
 * Never falls back to `updatedAt` — recover/reconcile rewrite that field.
 *
 * @param {import('./types.mjs').BuildRecord | object | null | undefined} build
 */
export function lifecycleActivityAtFor(build) {
  if (!build || typeof build !== "object") return null;
  if (
    typeof build.lifecycleActivityAt === "string" &&
    build.lifecycleActivityAt.trim()
  ) {
    return build.lifecycleActivityAt;
  }
  const status = build.loop?.status;
  if (
    (status === "paused" || status === "blocked") &&
    typeof build.loop?.pausedAt === "string" &&
    build.loop.pausedAt
  ) {
    return build.loop.pausedAt;
  }
  if (typeof build.lastAppliedCandidate?.at === "string" && build.lastAppliedCandidate.at) {
    return build.lastAppliedCandidate.at;
  }
  if (
    typeof build.lastDiscardedCandidate?.at === "string" &&
    build.lastDiscardedCandidate.at
  ) {
    return build.lastDiscardedCandidate.at;
  }
  const pendingAt =
    build.pendingCandidate?.readyAt || build.pendingCandidate?.at || null;
  if (typeof pendingAt === "string" && pendingAt) return pendingAt;
  if (typeof build.loop?.resumedAt === "string" && build.loop.resumedAt) {
    return build.loop.resumedAt;
  }
  const conversation = Array.isArray(build.conversation) ? build.conversation : [];
  const lastUser = [...conversation]
    .reverse()
    .find((message) => message?.role === "user" && typeof message?.at === "string");
  if (lastUser?.at) return lastUser.at;
  return typeof build.createdAt === "string" ? build.createdAt : null;
}
