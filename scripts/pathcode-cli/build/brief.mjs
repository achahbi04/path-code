/**
 * S5 — derive a durable product brief + acceptance criteria from an outcome.
 * Prompt text informs requirements; FS/runtime reality still wins later.
 */

import { createHash } from "node:crypto";

/**
 * @param {string} text
 */
function slugId(text) {
  return (
    "c-" +
    createHash("sha256")
      .update(String(text || "").toLowerCase().trim())
      .digest("hex")
      .slice(0, 10)
  );
}

/**
 * @param {string} outcome
 * @returns {'web'|'api'|'cli'|'desktop'|'mobile'|'service'|'multi_service'|'unknown'}
 */
export function inferProductKind(outcome) {
  const t = String(outcome || "").toLowerCase();
  if (/\b(ios|android|react\s*native|flutter|mobile\s*app)\b/.test(t)) {
    return "mobile";
  }
  if (/\b(desktop|electron|tauri|macos\s*app|windows\s*app)\b/.test(t)) {
    return "desktop";
  }
  if (/\b(cli|command[\s-]?line|terminal\s*tool)\b/.test(t) && !/\bweb|website|ui\b/.test(t)) {
    return "cli";
  }
  if (/\b(api|rest|graphql|backend\s*service|microservice)\b/.test(t) && !/\b(website|web\s*app|ui|frontend)\b/.test(t)) {
    return "api";
  }
  if (/\b(docker\s*compose|multi[\s-]?service|microservices)\b/.test(t)) {
    return "multi_service";
  }
  if (/\b(website|web\s*app|landing\s*page|frontend|ui|react|next\.?js|vite|astro|html)\b/.test(t)) {
    return "web";
  }
  if (/\b(site|page|homepage|landing)\b/.test(t)) return "web";
  return "unknown";
}

/**
 * Extract capability-ish phrases from free text (lightweight, not LLM).
 * @param {string} outcome
 * @returns {string[]}
 */
function extractCapabilityPhrases(outcome) {
  const text = String(outcome || "").trim();
  if (!text) return [];
  /** @type {string[]} */
  const out = [];
  const sentences = text
    .split(/[.!?\n;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  for (const s of sentences) {
    out.push(s.slice(0, 240));
  }

  // Bullet / "with X, Y, and Z" lists
  const withMatch = text.match(/\bwith\s+([^.!?\n]+)/i);
  if (withMatch) {
    const parts = withMatch[1]
      .split(/,|\band\b/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 2 && p.length < 120);
    for (const p of parts) out.push(`Supports: ${p}`);
  }

  // Dedupe
  const seen = new Set();
  return out.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12);
}

/**
 * @param {string} outcome
 * @param {{ productKind?: string }} [opts]
 */
export function deriveProductBrief(outcome, opts = {}) {
  const text = String(outcome || "").trim().slice(0, 8_000);
  const productKind = opts.productKind || inferProductKind(text);
  const capabilities = extractCapabilityPhrases(text);

  /** @type {string[]} */
  const acceptanceCriteria = [];

  // Always keep runnable + outcome summary, but they are not the only gates.
  acceptanceCriteria.push("Core software is runnable with project-native checks");
  acceptanceCriteria.push("Software advances the stated outcome");

  if (productKind === "web" || /website|web|landing|page|site/i.test(text)) {
    acceptanceCriteria.push("A recognizable product landing page or primary web surface exists");
    acceptanceCriteria.push("Primary hero or introduction clearly explains the product purpose");
    acceptanceCriteria.push("At least one primary call-to-action is present");
    acceptanceCriteria.push("The web surface renders successfully in a local preview");
  }

  if (productKind === "api") {
    acceptanceCriteria.push("An HTTP or RPC entrypoint exists and responds to a health or sample request");
  }

  if (productKind === "cli") {
    acceptanceCriteria.push("A CLI entrypoint runs and prints usable help or result output");
  }

  for (const cap of capabilities.slice(0, 8)) {
    if (/runnable|advances the stated/i.test(cap)) continue;
    acceptanceCriteria.push(cap);
  }

  // Dedupe criteria statements
  const seen = new Set();
  const unique = acceptanceCriteria.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    outcome: text,
    productKind,
    capabilities,
    visualRequirements: unique.filter((s) =>
      /hero|landing|render|visual|page|cta|call-to-action|design/i.test(s),
    ),
    functionalRequirements: unique.filter(
      (s) => !/hero|landing|render|visual|page|cta|call-to-action|design/i.test(s),
    ),
    nonFunctionalRequirements: [],
    constraints: [],
    acceptanceCriteria: unique.map((statement, i) => ({
      id: i < 2 ? (i === 0 ? "c-runnable" : "c-outcome") : slugId(statement),
      statement,
      required: true,
      source: i < 2 ? "default" : "derived",
    })),
    derivedAt: new Date().toISOString(),
  };
}

/**
 * @param {ReturnType<typeof deriveProductBrief>} brief
 * @returns {import('./types.mjs').OutcomeCriterion[]}
 */
export function briefToOutcomeCriteria(brief) {
  const now = new Date().toISOString();
  return (brief.acceptanceCriteria || []).map((c) => ({
    id: c.id,
    statement: c.statement,
    required: c.required !== false,
    status: /** @type {const} */ ("UNKNOWN"),
    evidence: [],
    updatedAt: now,
    source: c.source || "derived",
  }));
}
