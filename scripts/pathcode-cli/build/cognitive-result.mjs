/**
 * S5 — structured Build evaluate/challenge result envelopes.
 * Prefer JSON blocks; fall back to CRITERION/REQUIREMENT prose lines.
 */

import { parseStatusDirectives } from "./reinspect.mjs";

const EVAL_FENCE = /```(?:json|path-build-evaluation)?\s*([\s\S]*?)```/gi;
const CHALLENGE_FENCE = /```(?:json|path-build-challenge)?\s*([\s\S]*?)```/gi;

/**
 * @param {string} text
 * @param {'evaluation'|'challenge'} kind
 */
function extractJsonBlocks(text, kind) {
  const re = kind === "challenge" ? CHALLENGE_FENCE : EVAL_FENCE;
  /** @type {object[]} */
  const out = [];
  let m;
  const src = String(text || "");
  while ((m = re.exec(src))) {
    const raw = String(m[1] || "").trim();
    if (!raw.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") out.push(parsed);
    } catch {
      /* ignore malformed fence */
    }
  }
  // Also try a bare trailing JSON object marked by version+criteria
  const bare = src.match(/\{[\s\S]*"version"\s*:\s*1[\s\S]*\}/);
  if (bare) {
    try {
      const parsed = JSON.parse(bare[0]);
      if (parsed && typeof parsed === "object") out.push(parsed);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * @param {any} obj
 */
export function isBuildEvaluationResult(obj) {
  return (
    obj &&
    Number(obj.version) === 1 &&
    (Array.isArray(obj.criteria) || Array.isArray(obj.requirements))
  );
}

/**
 * @param {any} obj
 */
export function isBuildChallengeResult(obj) {
  return (
    obj &&
    Number(obj.version) === 1 &&
    Array.isArray(obj.claims)
  );
}

/**
 * @param {string} reportText
 * @param {{
 *   expectedBuildId?: string,
 *   expectedIntentRevision?: number,
 *   expectedAuthoritativeRevision?: string | null,
 * }} [opts]
 */
export function parseBuildCognitiveResult(reportText, opts = {}) {
  const evaluationBlocks = extractJsonBlocks(reportText, "evaluation").filter(
    isBuildEvaluationResult,
  );
  const challengeBlocks = extractJsonBlocks(reportText, "challenge").filter(
    isBuildChallengeResult,
  );
  const prose = parseStatusDirectives(reportText);

  /** @type {any} */
  let structured = evaluationBlocks[0] || challengeBlocks[0] || null;
  /** @type {string[]} */
  const errors = [];

  if (structured) {
    if (
      opts.expectedBuildId &&
      structured.buildId &&
      structured.buildId !== opts.expectedBuildId
    ) {
      errors.push("buildId_mismatch");
      structured = null;
    }
    if (
      typeof opts.expectedIntentRevision === "number" &&
      typeof structured?.intentRevision === "number" &&
      structured.intentRevision !== opts.expectedIntentRevision
    ) {
      errors.push("intentRevision_mismatch");
      structured = null;
    }
    if (
      opts.expectedAuthoritativeRevision &&
      structured?.authoritativeRevision &&
      structured.authoritativeRevision !== opts.expectedAuthoritativeRevision
    ) {
      errors.push("authoritativeRevision_mismatch");
      structured = null;
    }
  }

  return {
    ok: Boolean(structured) || prose.length > 0,
    structured,
    prose,
    malformedStructured: Boolean(evaluationBlocks.length + challengeBlocks.length) && !structured,
    errors,
  };
}

/**
 * Convert structured + prose into normalized directive rows.
 * @param {ReturnType<typeof parseBuildCognitiveResult>} parsed
 */
export function cognitiveResultToDirectives(parsed) {
  /** @type {Array<{ id: string, status: string, note: string, source: string }>} */
  const rows = [];
  const s = parsed.structured;
  if (s && Array.isArray(s.criteria)) {
    for (const c of s.criteria) {
      const id = String(c.criterionId || c.id || "").trim();
      const status = String(c.status || "").toUpperCase();
      if (!id || !/^(PROVEN|UNMET|UNKNOWN)$/.test(status)) continue;
      rows.push({
        id,
        status,
        note: String(c.reason || "").slice(0, 500),
        source: "structured",
      });
    }
  }
  if (s && Array.isArray(s.requirements)) {
    for (const r of s.requirements) {
      const id = String(r.requirementId || r.id || "").trim();
      const status = String(r.status || "").toUpperCase();
      if (!id || !/^(SATISFIED|VIOLATED|UNKNOWN)$/.test(status)) continue;
      rows.push({
        id,
        status,
        note: String(r.reason || "").slice(0, 500),
        source: "structured",
      });
    }
  }
  if (s && Array.isArray(s.claims)) {
    for (const claim of s.claims) {
      const id = String(claim.criterionId || claim.requirementId || claim.id || "").trim();
      if (!id) continue;
      const result = String(claim.result || "").toUpperCase();
      let status = "UNKNOWN";
      if (result === "STANDS") status = claim.requirementId ? "SATISFIED" : "PROVEN";
      if (result === "FALSIFIED") status = claim.requirementId ? "VIOLATED" : "UNMET";
      if (result === "INSUFFICIENT_EVIDENCE") status = "UNKNOWN";
      rows.push({
        id,
        status,
        note: String(claim.reason || "").slice(0, 500),
        source: "structured_challenge",
      });
    }
  }
  for (const d of parsed.prose || []) {
    rows.push({
      id: d.id,
      status: d.status,
      note: d.note || "",
      source: "prose",
    });
  }
  return rows;
}

/**
 * Objective appendix requiring the structured envelope.
 * @param {'evaluate'|'challenge'} kind
 * @param {import('./types.mjs').BuildRecord} record
 */
export function structuredResultContractBlock(kind, record) {
  const ids = (record.outcomeCriteria || [])
    .map((c) => c.id)
    .filter(Boolean)
    .join(", ");
  if (kind === "evaluate") {
    return [
      "",
      "REQUIRED machine-readable result (emit exactly one fenced JSON block):",
      "```path-build-evaluation",
      JSON.stringify(
        {
          version: 1,
          buildId: record.buildId,
          intentRevision: record.intent?.outcomeRevision,
          authoritativeRevision: record.authoritativeSha || null,
          criteria: (record.outcomeCriteria || []).map((c) => ({
            criterionId: c.id,
            status: "UNKNOWN",
            evidenceRefs: [],
            reason: "replace with evidence-backed status",
          })),
          requirements: (record.intent?.explicitRequirements || []).map((r) => ({
            requirementId: r.id,
            status: "UNKNOWN",
            evidenceRefs: [],
            reason: "",
          })),
          discoveredGaps: [],
          proposedNextAction: "",
          completionCandidate: false,
        },
        null,
        2,
      ),
      "```",
      `You MUST include every criterion id: ${ids || "(none)"}`,
      "Also emit CRITERION lines for compatibility.",
    ].join("\n");
  }
  return [
    "",
    "REQUIRED machine-readable result (emit exactly one fenced JSON block):",
    "```path-build-challenge",
    JSON.stringify(
      {
        version: 1,
        buildId: record.buildId,
        intentRevision: record.intent?.outcomeRevision,
        authoritativeRevision: record.authoritativeSha || null,
        challengedClaims: [],
        claims: (record.outcomeCriteria || [])
          .filter((c) => c.status === "PROVEN")
          .map((c) => ({
            criterionId: c.id,
            result: "STANDS",
            evidenceRefs: [],
            reason: "",
          })),
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}
