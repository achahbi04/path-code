/**
 * Creator-facing project titles and library rows.
 * Projection over the existing Build record. Not a second project store.
 */

import { homedir, tmpdir } from "node:os";
import { resolve, sep } from "node:path";

const UNDERSTANDING_CARD =
  /^Understanding that request before engineering/i;

const GENERIC_NOUN =
  /^(website|site|webpage|page|app|application|homepage|product)$/i;

/**
 * A product name already written in the text, such as "ICE (In Case of Emergency)"
 * or "ICE — In Case of Emergency". This is not a title hammer: lowercase phrasing
 * stays an outcome phrase.
 * @param {string} text
 */
function namedProduct(text) {
  const source = String(text || "");
  const paren = source.match(/\b([A-Z][A-Z0-9]{1,8})\s*\(([^)]{3,48})\)/);
  if (paren) return clipTitle(`${paren[1]} — ${paren[2].replace(/\s+/g, " ").trim()}`);
  const dash = source.match(/\b([A-Z][A-Z0-9]{1,8})\s*[—–-]\s*(In Case of Emergency)\b/);
  if (dash) return `${dash[1]} — ${dash[2]}`;
  return "";
}

/**
 * @param {string} title
 */
function clipTitle(title) {
  const clean = String(title || "").replace(/\s+/g, " ").trim();
  if (!clean) return "Untitled project";
  const words = clean.split(/\s+/).slice(0, 8).join(" ");
  const clipped = words.length > 56 ? `${words.slice(0, 53).trim()}…` : words;
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

/**
 * @param {string | null | undefined} outcome
 * @param {{ summary?: string } | null | undefined} [brief]
 */
export function deriveDisplayTitle(outcome, brief) {
  const named = namedProduct(brief?.summary) || namedProduct(outcome);
  if (named) return named;
  const source = String(outcome || brief?.summary || "").replace(/\s+/g, " ").trim();
  if (!source) return "Untitled project";
  let title = source
    .replace(
      /^(please\s+)?(can you\s+)?(build|create|make|design)\s+(me\s+)?(an|the|a)?\s*/i,
      "",
    )
    .replace(/[.?!].*$/, "")
    .trim();
  const homepage = title.match(/^homepage\s+for\s+(.+)$/i);
  if (homepage) {
    const subject = homepage[1].replace(/\s+that\b[\s\S]*$/i, "").trim();
    return clipTitle(subject ? `${subject} homepage` : "Homepage");
  }
  const genericThat = title.match(
    /^(website|site|page|app|application|homepage|product)\s+that\s+(.+)$/i,
  );
  if (genericThat) {
    const rest = genericThat[2]
      .replace(/^(?:tells|explains|describes|shows)\s+(?:me\s+)?(?:about\s+)?/i, "")
      .replace(/\s+and how to use\b[\s\S]*$/i, "")
      .trim();
    title = rest || title;
  } else {
    const head = title.split(/\s+that\b/i)[0].trim();
    const headWords = head.split(/\s+/).filter(Boolean);
    if (head && !(headWords.length === 1 && GENERIC_NOUN.test(headWords[0]))) title = head;
  }
  return clipTitle(title);
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

/**
 * Proven criteria stay the project outcome. While a request is live, open
 * criteria are the current request. Same outcomeCriteria array; no second store.
 *
 * @param {Array<{ status?: string, required?: boolean, statement?: string }> | null | undefined} criteria
 * @param {{ live?: boolean }} [options]
 */
export function criteriaProjection(criteria, options = {}) {
  const list = Array.isArray(criteria) ? criteria : [];
  const project = criteriaSummary(list);
  const proven = list.filter((item) => {
    const status = String(item?.status || "").toUpperCase();
    return status === "PROVEN" || status === "SATISFIED" || status === "MET" || status === "PASS";
  });
  const open = list.filter((item) => !proven.includes(item));
  if (options.live && proven.length && open.length) {
    return {
      split: true,
      project: { met: proven.length, failed: 0, pending: 0, total: proven.length },
      request: criteriaSummary(open),
    };
  }
  return { split: false, project, request: null };
}

/**
 * @param {object | null | undefined} build
 */
export function isArchived(build) {
  return typeof build?.archivedAt === "string" && build.archivedAt.length > 0;
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
  if (status === "awaiting_review") return "Review";
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
  if (status === "awaiting_review") return "reviewing";
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
    archived: isArchived(build),
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
      ) &&
      // Superseded orphan requests are durable history, not a second creator card.
      message?.status !== "superseded",
  );
}

export function isUnderstandingPlaceholder(text) {
  return UNDERSTANDING_CARD.test(String(text || ""));
}
