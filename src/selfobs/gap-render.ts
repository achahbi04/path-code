/**
 * Pure deterministic Gap Ledger markdown renderer.
 */

import type { GapRecord, GapLedger, ReviewedGapRecord } from "./gap-types.js";
import { isReviewedGap } from "./gap-types.js";

function renderReviewedFields(record: ReviewedGapRecord): string[] {
  const lines: string[] = [];
  if (record.proposedClass !== undefined) {
    lines.push(`**Implementer proposed class:** ${record.proposedClass}`);
    lines.push("");
  }
  lines.push(`**Review classification:** ${record.reviewClassification}`);
  lines.push("");
  lines.push(`**Lifecycle:** ${record.lifecycle}`);
  lines.push("");
  if (record.whyNonBlocking !== undefined) {
    lines.push(`**Why non-blocking:** ${record.whyNonBlocking}`);
    lines.push("");
  }
  if (record.missingEvidence !== undefined) {
    lines.push(`**Required condition to close:** ${record.missingEvidence}`);
    lines.push("");
  }
  if (record.closureCondition !== undefined && record.missingEvidence === undefined) {
    lines.push(`**Required condition to close:** ${record.closureCondition}`);
    lines.push("");
  }
  if (record.requiredCondition !== undefined) {
    lines.push(`**Assigned closure phase/environment:** ${record.requiredCondition}`);
    lines.push("");
  }
  if (record.permanentReason !== undefined) {
    lines.push(`**Required condition to close:** ${record.permanentReason}`);
    lines.push("");
  }
  if (record.closedByCommit !== undefined) {
    lines.push(`**Closed by checkpoint:** \`${record.closedByCommit}\``);
    lines.push("");
  }
  if (record.closureEvidence !== undefined) {
    lines.push(`**Evidence:** ${record.closureEvidence}`);
    lines.push("");
  }
  if (record.notes !== undefined) {
    lines.push(`**Notes:** ${record.notes}`);
    lines.push("");
  }
  return lines;
}

function renderUnreviewedFields(record: GapRecord): string[] {
  if (isReviewedGap(record)) {
    return [];
  }
  const lines = [
    `**Implementer proposed class:** ${record.proposedClass}`,
    "",
    `**Review classification:** (unreviewed)`,
    "",
    `**Lifecycle:** ${record.lifecycle}`,
    "",
  ];
  if (record.notes !== undefined) {
    lines.push(`**Notes:** ${record.notes}`);
    lines.push("");
  }
  return lines;
}

function renderGapRecord(record: GapRecord): string {
  const lines = [
    `### ${record.id} — ${record.title}`,
    "",
    `**Discovered in / source:** ${record.sourceCheckpoint}`,
    "",
    `**Description:** ${record.description}`,
    "",
  ];
  if (isReviewedGap(record)) {
    lines.push(...renderReviewedFields(record));
  } else {
    lines.push(...renderUnreviewedFields(record));
  }
  lines.push("---", "");
  return lines.join("\n");
}

export function renderGapLedgerMarkdown(ledger: GapLedger): string {
  const header = [
    "# PATH CODE — GAP LEDGER V1",
    "",
    "## Status",
    "",
    "**ACTIVE**",
    "",
    "**MACHINE-READABLE SOURCE OF TRUTH**",
    "",
    "Rendered deterministically from canonical Gap Ledger v1 data.",
    "",
    "The Gap Ledger does **not** decide correctness.",
    "",
    "**Review** classifies gaps.",
    "",
    "---",
    "",
    "## GAP RECORD FORMAT",
    "",
    "Every entry should contain:",
    "",
    "- Gap ID",
    "- Discovered in / source checkpoint",
    "- Description",
    "- Evidence / observation",
    "- Implementer proposed class, if any",
    "- Review classification",
    "- Lifecycle state",
    "- Why blocking/non-blocking",
    "- Required condition to close",
    "- Assigned closure phase/environment if one exists",
    "- Closed by checkpoint if closed",
    "- Notes",
    "",
    "---",
    "",
    "## INITIAL GAP LEDGER",
    "",
    "---",
    "",
  ].join("\n");

  const body = ledger.records.map(renderGapRecord).join("\n");

  const footer = [
    "## GAP CLOSURE CONDUCT",
    "",
    "When a later pass closes a gap:",
    "",
    "**Do NOT** delete the record.",
    "",
    "Set:",
    "",
    "**Lifecycle:** CLOSED",
    "",
    "and add:",
    "",
    "**Closed by checkpoint:** `<full SHA>`",
    "",
    "**Evidence:** `<repository evidence reference>`",
    "",
    "History remains visible.",
    "",
    "---",
    "",
    "## PHASE CLOSURE REQUIREMENT",
    "",
    "At Phase 2 closure, every still-open **NON_BLOCKING_LIMITATION** must be individually reviewed.",
    "",
    "No bulk statement such as \"remaining limitations accepted\" is sufficient.",
    "",
    "Each must be:",
    "",
    "- closed",
    "- explicitly carried",
    "- OPEN_REQUIRES_EXTERNAL_CONDITION",
    "- ACCEPTED_PERMANENT",
    "- scheduled to a later architecture",
    "",
    "Nothing silently disappears.",
    "",
  ].join("\n");

  return `${header}${body}${footer}`;
}
