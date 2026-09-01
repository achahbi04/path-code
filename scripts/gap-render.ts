#!/usr/bin/env node
/**
 * gap:render — regenerate docs/GAP_LEDGER.md from machine-readable source.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getCanonicalGapLedger,
  renderGapLedgerMarkdown,
} from "../src/selfobs/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(repoRoot, "docs/GAP_LEDGER.md");

const markdown = renderGapLedgerMarkdown(getCanonicalGapLedger());
writeFileSync(outputPath, markdown, "utf8");
console.log(`Rendered ${outputPath}`);
