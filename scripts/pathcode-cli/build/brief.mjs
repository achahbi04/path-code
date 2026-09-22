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
    acceptanceCriteria.push("Visual hierarchy supports the stated product — not a generic keyword page");
    acceptanceCriteria.push("The rendered product has no blocking runtime or browser errors");
    if (/polished|professional|modern|trust|urgent|emergency|ice|medical|safety/i.test(text)) {
      acceptanceCriteria.push("Product identity is immediately clear in the first screen");
      acceptanceCriteria.push("Hero communicates urgency, trust, and why the product matters");
      acceptanceCriteria.push("Usage flow is understandable without reading a wall of text");
      acceptanceCriteria.push("Primary call-to-action is meaningful for an emergency or safety product");
      acceptanceCriteria.push("Page is responsive across desktop and mobile viewports");
    }
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
    version: 1,
    buildId: opts.buildId || null,
    intentRevision: Number(opts.intentRevision) || 1,
    revision: Number(opts.revision) || 0,
    source: "mechanical",
    outcome: text,
    productKind,
    summary: text.slice(0, 1_000),
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
      evidenceKinds:
        i === 0 ? ["check", "runtime"] : ["evaluation", "challenge"],
    })),
    assumptions: [],
    openQuestions: [],
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

const BRIEF_FENCE = /```(?:json|path-build-product-brief)?\s*([\s\S]*?)```/gi;
const PRODUCT_KINDS = new Set([
  "web",
  "api",
  "cli",
  "desktop",
  "mobile",
  "service",
  "multi_service",
  "unknown",
]);

function stringList(value, limit = 40) {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item.statement === "string"
          ? item.statement
          : "",
    )
    .filter((item) => item.trim())
    .map((item) => item.trim().slice(0, 1_000))
    .slice(0, limit);
}

/**
 * Validate and normalize a cognitive ProductBrief envelope.
 */
export function validateProductBriefEnvelope(value, expected = {}) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["envelope_required"], brief: null };
  }
  if (Number(value.version) !== 1) errors.push("version_invalid");
  if (typeof value.buildId !== "string" || !value.buildId.trim()) {
    errors.push("buildId_required");
  } else if (expected.buildId && value.buildId !== expected.buildId) {
    errors.push("buildId_mismatch");
  }
  if (!Number.isSafeInteger(value.intentRevision) || value.intentRevision < 1) {
    errors.push("intentRevision_invalid");
  } else if (
    Number.isSafeInteger(expected.intentRevision) &&
    value.intentRevision !== expected.intentRevision
  ) {
    errors.push("intentRevision_mismatch");
  }
  if (!PRODUCT_KINDS.has(value.productKind)) errors.push("productKind_invalid");
  if (typeof value.summary !== "string" || !value.summary.trim()) {
    errors.push("summary_required");
  }
  const functionalRequirements = stringList(value.functionalRequirements);
  const visualRequirements = stringList(value.visualRequirements);
  const nonFunctionalRequirements = stringList(value.nonFunctionalRequirements);
  const constraints = stringList(value.constraints);
  const assumptions = stringList(value.assumptions);
  const openQuestions = stringList(value.openQuestions);
  if (!functionalRequirements) errors.push("functionalRequirements_invalid");
  if (!visualRequirements) errors.push("visualRequirements_invalid");
  if (!nonFunctionalRequirements) errors.push("nonFunctionalRequirements_invalid");
  if (!constraints) errors.push("constraints_invalid");
  if (!assumptions) errors.push("assumptions_invalid");
  if (!openQuestions) errors.push("openQuestions_invalid");
  if (!Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.length === 0) {
    errors.push("acceptanceCriteria_required");
  }
  const acceptanceCriteria = [];
  const ids = new Set();
  for (const [index, criterion] of (value.acceptanceCriteria || []).entries()) {
    const statement =
      typeof criterion?.statement === "string" ? criterion.statement.trim() : "";
    const evidenceKinds = stringList(criterion?.evidenceKinds, 12);
    const id =
      typeof criterion?.id === "string" && criterion.id.trim()
        ? criterion.id.trim().slice(0, 120)
        : slugId(statement);
    if (!statement || !evidenceKinds?.length || ids.has(id)) {
      errors.push(`acceptanceCriteria_${index}_invalid`);
      continue;
    }
    ids.add(id);
    acceptanceCriteria.push({
      id,
      statement: statement.slice(0, 2_000),
      required: criterion.required !== false,
      evidenceKinds,
      source: "cognitive",
    });
  }
  if (errors.length) return { ok: false, errors, brief: null };
  return {
    ok: true,
    errors: [],
    brief: {
      version: 1,
      buildId: value.buildId,
      intentRevision: value.intentRevision,
      revision: Number.isSafeInteger(value.revision)
        ? value.revision
        : Number(expected.revision) || 1,
      source: "cognitive",
      productKind: value.productKind,
      summary: value.summary.trim().slice(0, 2_000),
      functionalRequirements,
      visualRequirements,
      nonFunctionalRequirements,
      constraints,
      acceptanceCriteria,
      assumptions,
      openQuestions,
      derivedAt: new Date().toISOString(),
    },
  };
}

export function parseProductBriefResult(reportText, expected = {}) {
  const candidates = [];
  let match;
  const source = String(reportText || "");
  while ((match = BRIEF_FENCE.exec(source))) {
    try {
      const parsed = JSON.parse(String(match[1] || "").trim());
      if (parsed && typeof parsed === "object") candidates.push(parsed);
    } catch {
      // validation reports malformed/missing envelope below
    }
  }
  for (const candidate of candidates) {
    const validated = validateProductBriefEnvelope(candidate, expected);
    if (validated.ok) return validated;
    if (
      validated.errors.includes("buildId_mismatch") ||
      validated.errors.includes("intentRevision_mismatch")
    ) {
      return validated;
    }
  }
  return {
    ok: false,
    errors: candidates.length ? ["brief_envelope_invalid"] : ["brief_envelope_missing"],
    brief: null,
  };
}

export function productBriefObjective(record) {
  const bootstrap = record.productBrief || {};
  return [
    "PATH Build ProductBrief task — cognitive product interpretation only.",
    "READ-ONLY. Do not edit product files.",
    "Analyze the operator intent and produce a concrete, testable product brief.",
    "This is a normal need-fit PATH fabric task; do not choose or rank providers.",
    "Do not create or save a product_brief.json file. Do not use a brain/artifact path.",
    "Your FINAL RESPONSE itself must be exactly one path-build-product-brief fenced JSON envelope.",
    "Do not summarize the brief, mention a saved file, or add prose before or after the envelope.",
    "Keep the complete envelope under 12,000 characters.",
    "Requirement, constraint, assumption, and open-question arrays must contain concise strings, not objects.",
    ...(record.productBriefError
      ? [
          `A prior cognitive attempt was rejected: ${(record.productBriefError.errors || []).join(", ")}.`,
          "Correct that schema failure in this final response.",
        ]
      : []),
    `Build ID: ${record.buildId}`,
    `Intent revision: ${record.intent?.outcomeRevision}`,
    `Outcome: ${record.intent?.outcome || ""}`,
    `Mechanical bootstrap hint: ${bootstrap.productKind || "unknown"} — ${bootstrap.summary || ""}`,
    bootstrap.revisionContext
      ? `Latest operator request: ${bootstrap.revisionContext}`
      : "",
    "If the outcome or the latest operator request asks for a website, web app, or page, productKind MUST be \"web\". Do not leave productKind unknown when the request is explicitly a website.",
    "",
    "Emit exactly one validated envelope:",
    "```path-build-product-brief",
    JSON.stringify(
      {
        version: 1,
        buildId: record.buildId,
        intentRevision: record.intent?.outcomeRevision,
        revision: (Number(bootstrap.revision) || 0) + 1,
        productKind: bootstrap.productKind || "unknown",
        summary: "Concise product definition",
        functionalRequirements: [],
        visualRequirements: [],
        nonFunctionalRequirements: [],
        constraints: [],
        acceptanceCriteria: [
          {
            id: "c-example",
            statement: "Observable acceptance condition",
            required: true,
            evidenceKinds: ["evaluation", "challenge"],
          },
        ],
        assumptions: [],
        openQuestions: [],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}
