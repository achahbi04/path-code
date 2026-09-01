#!/usr/bin/env node
/**
 * ledger:verify — canonical ledger integrity verifier (read-only tooling).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  deriveAllCapabilityObservations,
  findCapabilityObservation,
  getCanonicalCapabilityLedger,
  getCanonicalGapLedger,
} from "../src/selfobs/index.js";
import { verifyLedgers } from "./lib/ledger-verifier.js";

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
    const safeEditing = findCapabilityObservation(observations, "safe-editing");
    const repositoryIntelligence = findCapabilityObservation(
      observations,
      "repository-intelligence",
    );
    const foundationKernel = findCapabilityObservation(
      observations,
      "foundation-kernel",
    );

    if (safeEditing?.kind !== "VERIFIED_CAPABILITY_STATE" || safeEditing.state !== "DECLARED") {
      console.error(
        "[DERIVATION] safe-editing must derive VERIFIED DECLARED with verification",
      );
      process.exit(1);
    }
    if (
      repositoryIntelligence?.kind !== "VERIFIED_CAPABILITY_STATE" ||
      repositoryIntelligence.state !== "PHASE_VERIFIED"
    ) {
      console.error(
        "[DERIVATION] repository-intelligence must derive VERIFIED PHASE_VERIFIED",
      );
      process.exit(1);
    }
    if (
      foundationKernel?.kind !== "VERIFIED_CAPABILITY_STATE" ||
      foundationKernel.state !== "PHASE_VERIFIED"
    ) {
      console.error(
        "[DERIVATION] foundation-kernel must derive VERIFIED PHASE_VERIFIED",
      );
      process.exit(1);
    }
  }

  console.log(`ledger:verify PASS at ${result.verifiedAtHead}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
