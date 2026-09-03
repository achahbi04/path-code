#!/usr/bin/env node
/**
 * ledger:verify — canonical ledger integrity verifier (read-only tooling).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  deriveAllCapabilityObservations,
  getCanonicalCapabilityLedger,
  getCanonicalGapLedger,
} from "../src/selfobs/index.js";
import { verifyLedgers } from "./lib/ledger-verifier.js";
import { checkPhaseAuditEvidenceShapeConsistency } from "./lib/phase-audit-shape.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const capabilityLedger = getCanonicalCapabilityLedger();
  const gapLedger = getCanonicalGapLedger();

  const result = await verifyLedgers(repoRoot, capabilityLedger, gapLedger);

  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`[${failure.code}] ${failure.message}`);
    }
    process.exit(1);
  }

  if (result.verification) {
    const observations = deriveAllCapabilityObservations(
      capabilityLedger,
      gapLedger,
      result.verification,
    );
    const shapeFailures = checkPhaseAuditEvidenceShapeConsistency(
      capabilityLedger,
      observations,
    );
    if (shapeFailures.length > 0) {
      for (const failure of shapeFailures) {
        console.error(
          `[DERIVATION] ${failure.capabilityId}: ${failure.message}`,
        );
      }
      process.exit(1);
    }
  }

  console.log(`ledger:verify PASS at ${result.verifiedAtHead}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
