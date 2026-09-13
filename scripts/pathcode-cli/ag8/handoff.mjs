/**
 * G8 — extract a short factual engineering handoff from a session summary.
 * No chain-of-thought; light scrub of provider names.
 */

const PROVIDER_SCRUB = [
  /\b(openai|anthropic|claude|gpt-4[o0]?|gpt-5|gemini|google\s*ai|google-antigravity|antigravity|copilot|cursor)\b/gi,
];

const COT_MARKERS = [
  /^\s*(thought|thinking|reasoning|chain[- ]of[- ]thought|internal monologue)\s*:/i,
  /^\s*(let me think|I need to reason|step[- ]by[- ]step)\b/i,
];

/**
 * @param {string} summaryText
 * @returns {{ summary: string, bullets: string[] }}
 */
export function extractEngineeringHandoff(summaryText) {
  const raw = typeof summaryText === "string" ? summaryText : "";
  if (!raw.trim()) {
    return { summary: "", bullets: [] };
  }

  let text = raw.replace(/\r\n/g, "\n").trim();

  const lines = text.split("\n").filter((line) => {
    if (COT_MARKERS.some((re) => re.test(line))) return false;
    if (/^\s{0,3}>\s*(thought|thinking)/i.test(line)) return false;
    // Strip policy/hook denial noise from engine text streams.
    if (/denied by (policy|pre-tool hook)/i.test(line)) return false;
    if (/^Denied by policy/i.test(line.trim())) return false;
    return true;
  });
  text = lines.join("\n");
  text = text
    .replace(/Denied by policy[^.]*\./gi, " ")
    .replace(/\(?"?denied by pre-tool hook:[^)]*\)?/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  for (const re of PROVIDER_SCRUB) {
    text = text.replace(re, "engine");
  }
  text = text.replace(/\bengine(\s+engine)+\b/gi, "engine");

  /** @type {string[]} */
  const bullets = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[-*•]\s+(.+)$/);
    if (m) {
      const b = scrubInline(m[1]).slice(0, 160).trim();
      if (b) bullets.push(b);
    }
    if (bullets.length >= 8) break;
  }

  const prose = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  let summary = scrubInline(prose).slice(0, 400).trim();
  if (summary.length === 400) {
    const cut = summary.lastIndexOf(" ");
    if (cut > 280) summary = summary.slice(0, cut).trim();
    if (!/[.!?]$/.test(summary)) summary = `${summary}…`;
  }

  return { summary, bullets };
}

/**
 * @param {string} s
 */
function scrubInline(s) {
  let out = s;
  for (const re of PROVIDER_SCRUB) {
    out = out.replace(re, "engine");
  }
  return out.replace(/\bengine(\s+engine)+\b/gi, "engine").trim();
}
