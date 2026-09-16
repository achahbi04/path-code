/**
 * Extract user-facing engineering narration from engine summary text.
 * Strips chain-of-thought markers and provider names; keeps real explanations.
 */

import { extractEngineeringHandoff } from "./handoff.mjs";

const COT_LINE =
  /^\s*(thought|thinking|reasoning|chain[- ]of[- ]thought|internal monologue)\s*:/i;

/**
 * @param {string} summaryText
 * @param {{ maxChars?: number }} [opts]
 * @returns {{ text: string, paragraphs: string[] }}
 */
export function extractEngineeringNarration(summaryText, opts = {}) {
  const maxChars =
    typeof opts.maxChars === "number" && opts.maxChars > 200
      ? opts.maxChars
      : 1_800;
  const raw = typeof summaryText === "string" ? summaryText : "";
  if (!raw.trim()) return { text: "", paragraphs: [] };

  let text = raw.replace(/\r\n/g, "\n").trim();
  const lines = text.split("\n").filter((line) => {
    if (COT_LINE.test(line)) return false;
    if (/^\s{0,3}>\s*(thought|thinking)/i.test(line)) return false;
    if (/denied by (policy|pre-tool hook)/i.test(line)) return false;
    if (/^Denied by policy/i.test(line.trim())) return false;
    return true;
  });
  text = lines
    .join("\n")
    .replace(/Denied by policy[^.]*\./gi, " ")
    .replace(/\(?"?denied by pre-tool hook:[^)]*\)?/gi, " ")
    .replace(
      /\b(openai|anthropic|claude|gpt-4[o0]?|gpt-5|gemini|google\s*ai|google-antigravity|antigravity|copilot)\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  /** @type {string[]} */
  const paragraphs = [];
  for (const block of text.split(/\n\s*\n/)) {
    const p = block
      .split("\n")
      .map((l) => l.replace(/^\s*[-*•]\s+/, "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (p.length < 12) continue;
    // Skip pure tool-id dumps.
    if (/^(run_command|view_file|edit_file|bash|sh)\b/i.test(p)) continue;
    paragraphs.push(p.slice(0, 600));
    if (paragraphs.length >= 6) break;
  }

  let joined = paragraphs.join("\n\n");
  if (!joined) {
    // Fall back to compact handoff prose.
    const handoff = extractEngineeringHandoff(raw);
    joined = handoff.summary || "";
  }
  if (joined.length > maxChars) {
    const cut = joined.lastIndexOf(" ", maxChars - 1);
    joined = `${joined.slice(0, cut > maxChars * 0.6 ? cut : maxChars).trim()}…`;
  }
  return {
    text: joined,
    paragraphs: joined ? joined.split("\n\n").filter(Boolean) : [],
  };
}

/**
 * True when operator text is a question / request for explanation rather than
 * a pure directional steer ("don't modify that file").
 * @param {string} text
 */
export function isOperatorQuestion(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\?\s*$/.test(t)) return true;
  return /^(what|why|how|where|which|who|show|explain|tell me|can you|could you|did you|do you)\b/i.test(
    t,
  );
}

/**
 * Build the continue-turn prompt that carries operator guidance into the
 * active engine session.
 * @param {string} steerText
 */
export function buildSteeringContinuePrompt(steerText) {
  const text = String(steerText || "").trim();
  if (isOperatorQuestion(text)) {
    return [
      "The PATH operator asked a question about the active engineering work:",
      text,
      "",
      "Answer substantively in this same session using the real files, commands,",
      "and findings already observed. Cite concrete paths and evidence.",
      "Then continue only if further engineering is still required.",
    ].join("\n");
  }
  return [
    "Operator guidance for this PATH session — apply now:",
    text,
    "",
    "Continue engineering in this workspace with that guidance.",
  ].join("\n");
}

/**
 * Human busy label from a real command / activity detail.
 * @param {string} detail
 * @param {string} [fallback]
 */
export function busyLabelFromDetail(detail, fallback = "Working") {
  const d = typeof detail === "string" ? detail.trim() : "";
  if (!d) return fallback;
  if (/npm\s+(test|run\s+test)|vitest|jest|pytest|go test|cargo test/i.test(d)) {
    return "Running tests";
  }
  if (/tsc|typecheck|mypy/i.test(d)) return "Checking TypeScript";
  if (/eslint|lint|clippy/i.test(d)) return "Linting";
  if (/npm\s+i(nstall)?|pnpm\s+i|yarn\s+|pip\s+install|bundle\s+install/i.test(d)) {
    return "Installing dependencies";
  }
  if (/build|compile|vite\s+build|cargo\s+build|mvn\s|dotnet\s+build/i.test(d)) {
    return "Building";
  }
  if (/^git\s+/i.test(d)) return "Git";
  if (d.length > 8 && !/^(bash|sh|zsh|run_command|view_file)$/i.test(d)) {
    return "Running command";
  }
  return fallback;
}
