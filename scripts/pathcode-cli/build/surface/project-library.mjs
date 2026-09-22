/**
 * Creator-facing project titles and library rows.
 * Projection over the existing Build record. Not a second project store.
 */

import { homedir, tmpdir } from "node:os";
import { resolve, sep } from "node:path";

const UNDERSTANDING_CARD =
  /^Understanding that request before engineering/i;

/**
 * @param {string | null | undefined} outcome
 * @param {{ summary?: string } | null | undefined} [brief]
 */
export function deriveDisplayTitle(outcome, brief) {
  const source = String(outcome || brief?.summary || "").replace(/\s+/g, " ").trim();
  if (!source) return "Untitled project";
  const fromBrief = String(brief?.summary || "").replace(/\s+/g, " ").trim();
  if (fromBrief && fromBrief.length <= 56 && !/^build\b/i.test(fromBrief)) {
    return fromBrief;
  }
  let title = source
    .replace(
      /^(please\s+)?(can you\s+)?(build|create|make|design)\s+(me\s+)?(an|the|a)?\s*/i,
      "",
    )
    .replace(/\s+that\b[\s\S]*$/i, "")
    .replace(/[.?!].*$/, "")
    .trim();
  if (!title) title = source;
  const words = title.split(/\s+/).slice(0, 8).join(" ");
  const clipped = words.length > 56 ? `${words.slice(0, 53).trim()}…` : words;
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

/**
 * Normal creator library. Temp runs and a Build rooted at $HOME stay on disk.
 * @param {string | null | undefined} projectRoot
 */
export function isCreatorProjectRoot(projectRoot) {
  if (!projectRoot || typeof projectRoot !== "string") return false;
  const root = resolve(projectRoot);
  const home = resolve(homedir());
  if (root === home) return false;
  const temps = [resolve(tmpdir()), "/tmp", "/private/tmp"];
  if (temps.some((dir) => root === dir || root.startsWith(`${dir}${sep}`) || root.startsWith(`${dir}/`))) {
    return false;
  }
  const builds = resolve(home, "PATH Builds");
  return root === builds || root.startsWith(`${builds}${sep}`) || root.startsWith(`${builds}/`);
}

/**
 * @param {object | null | undefined} build
 */
export function isCreatorProject(build) {
  const root = build?.projectBindings?.[0]?.projectRoot || build?.projectRoot || null;
  return isCreatorProjectRoot(root);
}

/**
 * @param {Array<{ status?: string, required?: boolean }> | null | undefined} criteria
 */
export function criteriaSummary(criteria) {
  const list = Array.isArray(criteria) ? criteria : [];
  const required = list.filter((item) => item?.required === true);
  const pool = required.length ? required : list;
  let met = 0;
  let pending = 0;
  let failed = 0;
  for (const item of pool) {
    const status = String(item?.status || "UNKNOWN").toUpperCase();
    if (status === "PROVEN" || status === "SATISFIED" || status === "MET" || status === "PASS") met += 1;
    else if (status === "UNMET" || status === "VIOLATED" || status === "FAILED" || status === "FAIL") failed += 1;
    else pending += 1;
  }
  return { met, failed, pending, total: pool.length };
}

export function displayTitleFor(build) {
  const explicit = typeof build?.displayTitle === "string" ? build.displayTitle.trim() : "";
  if (explicit) return explicit.slice(0, 80);
  return deriveDisplayTitle(build?.intent?.outcome, build?.productBrief);
}

/**
 * @param {object | null | undefined} build
 */
export function creatorStatusLabel(build) {
  const status = build?.loop?.status;
  if (status === "running") return "Building";
  if (status === "paused") return "Paused";
  if (status === "blocked") return "Needs attention";
  return "Ready";
}

/**
 * @param {object | null | undefined} build
 */
export function creatorPhase(build) {
  const kids = Array.isArray(build?.children) ? build.children : [];
  const live = [...kids]
    .reverse()
    .find((child) =>
      ["selected", "dispatched", "terminal_seen"].includes(child?.dispatchState),
    );
  if (live?.kind === "brief") return "understanding";
  if (live?.kind === "engineer") return "engineering";
  if (live?.kind === "evaluate") return "verifying";
  if (live?.kind === "challenge") return "reviewing";
  const status = build?.loop?.status;
  if (status === "complete") return "ready";
  if (status === "paused") return "paused";
  if (status === "blocked") return "attention";
  const conversation = Array.isArray(build?.conversation) ? build.conversation : [];
  const lastUser = [...conversation].reverse().find((message) => message?.role === "user");
  if (
    status === "running" &&
    lastUser &&
    ["queued", "preparing", "incorporated"].includes(lastUser.status)
  ) {
    return "understanding";
  }
  if (status === "running") return "engineering";
  return "ready";
}

/**
 * @param {object | null | undefined} build
 */
export function hasActiveEngineering(build) {
  const kids = Array.isArray(build?.children) ? build.children : [];
  return (
    build?.loop?.status === "running" &&
    kids.some(
      (child) =>
        child?.kind === "engineer" &&
        ["selected", "dispatched"].includes(child.dispatchState),
    )
  );
}

/**
 * @param {object | null | undefined} build
 */
export function libraryRow(build) {
  const repo = build?.repository && typeof build.repository === "object" ? build.repository : {};
  return {
    buildId: build?.buildId || null,
    displayTitle: displayTitleFor(build),
    status: creatorStatusLabel(build),
    phase: creatorPhase(build),
    updatedAt: build?.updatedAt || build?.createdAt || null,
    repository:
      repo.validated && repo.kind === "github"
        ? "github"
        : repo.validated
          ? "connected"
          : "local",
    authoritativeSha: build?.authoritativeSha || null,
  };
}

/**
 * Hide the persisted understanding placeholder from the creator conversation.
 * The user request stays. The live phase indicator replaces the card.
 *
 * @param {Array<{ role?: string, text?: string }> | null | undefined} conversation
 */
export function creatorConversation(conversation) {
  return (Array.isArray(conversation) ? conversation : []).filter(
    (message) =>
      !(
        message?.role === "assistant" &&
        UNDERSTANDING_CARD.test(String(message.text || ""))
      ),
  );
}

export function isUnderstandingPlaceholder(text) {
  return UNDERSTANDING_CARD.test(String(text || ""));
}
