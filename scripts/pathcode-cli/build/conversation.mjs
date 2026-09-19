/**
 * Conversation-first steering for PATH Build.
 * Maps free-text messages onto reviseIntent / requirements / change context.
 */

/**
 * @param {string} message
 * @param {{ hasSelection?: boolean }} [ctx]
 * @returns {{
 *   kind: 'change'|'requirement'|'revise_outcome'|'continuation'|'correction',
 *   outcomePatch?: string | null,
 *   requirement?: string | null,
 *   steerNote: string,
 *   engineerObjectiveHint: string,
 * }}
 */
export function classifyConversationMessage(message, ctx = {}) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();

  if (!text) {
    return {
      kind: "continuation",
      outcomePatch: null,
      requirement: null,
      steerNote: "",
      engineerObjectiveHint: "Continue engineering toward the current outcome.",
    };
  }

  // Explicit requirement language
  if (
    /\b(must|required|requirement|always|never|need to|has to)\b/i.test(text) &&
    /\b(include|support|have|provide|show|contain)\b/i.test(text)
  ) {
    return {
      kind: "requirement",
      outcomePatch: null,
      requirement: text.slice(0, 2_000),
      steerNote: `Operator requirement: ${text}`,
      engineerObjectiveHint: `Satisfy this hard requirement in the product: ${text}`,
    };
  }

  // Whole-product rewrite
  if (
    /\b(rebuild|start over|change the product to|instead build|new outcome)\b/i.test(
      lower,
    )
  ) {
    return {
      kind: "revise_outcome",
      outcomePatch: text.slice(0, 8_000),
      requirement: null,
      steerNote: `Revised product outcome: ${text}`,
      engineerObjectiveHint: `Re-align the product to this revised outcome: ${text}`,
    };
  }

  // Correction
  if (/\b(fix|bug|broken|wrong|incorrect|doesn't work|does not work)\b/i.test(lower)) {
    return {
      kind: "correction",
      outcomePatch: null,
      requirement: null,
      steerNote: `Correction: ${text}`,
      engineerObjectiveHint: `Fix this product defect: ${text}`,
    };
  }

  // Visual / content change (default for builder conversation)
  const selectionNote = ctx.hasSelection
    ? " Operator selected a specific preview element — prioritize that target."
    : "";
  return {
    kind: "change",
    outcomePatch: null,
    requirement: null,
    steerNote: `Product change request: ${text}${selectionNote}`,
    engineerObjectiveHint: `Apply this product/design change to the real project and keep the app runnable: ${text}${selectionNote}`,
  };
}
