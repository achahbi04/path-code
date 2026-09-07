/**
 * Shared helpers for Phase 5D2 orchestrator tests.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect } from "vitest";

import { createEngineeringBrain } from "../../src/brain/index.js";
import type { EngineeringBrain } from "../../src/brain/types.js";
import {
  createDeterministicAdapter,
  type ScriptedReply,
} from "../brain/fixtures.js";
import { explicitLocalProcessApproval } from "../../src/execution/index.js";
import {
  authorizeValidationPlan,
  prepareValidationPlan,
} from "../../src/validation/index.js";
import type {
  PreparedValidationPlan,
  ValidationAuthorization,
  ValidationCheckSpec,
} from "../../src/validation/types.js";
import {
  cleanupReasoningFixtures,
  fixtureWithSourceAndManifest,
  handleFor,
  proposalJson,
} from "../reasoning/helpers.js";

export { cleanupReasoningFixtures, fixtureWithSourceAndManifest, handleFor, proposalJson };

export function nodeRequest(root: string, scriptPath: string) {
  return {
    executable: process.execPath,
    argv: [scriptPath],
    cwd: root,
  };
}

export function approvalsFor(checks: readonly { id: string }[]) {
  const map = new Map<string, ReturnType<typeof explicitLocalProcessApproval>>();
  for (const check of checks) {
    map.set(check.id, explicitLocalProcessApproval());
  }
  return map;
}

export async function writeScript(
  root: string,
  name: string,
  source: string,
): Promise<string> {
  const path = join(root, name);
  writeFileSync(path, source, "utf8");
  return path;
}

export function definesBehavesProposal(contentHandle: string, options?: {
  includeContains?: boolean;
  unbound?: boolean;
}): string {
  const claims: unknown[] = [];
  if (options?.includeContains) {
    claims.push({
      claimId: "contains-1",
      kind: "CONTAINS",
      statement: "has hello",
      needle: "hello",
      proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
      proposedCitations: [],
    });
  }
  claims.push(
    {
      claimId: "defines-1",
      kind: "DEFINES",
      statement: "defines hello",
      symbolName: "hello",
      proposedSubject: options?.unbound
        ? { kind: "EVIDENCE_ID", id: "fabricated-handle-xyz" }
        : { kind: "EVIDENCE_ID", id: contentHandle },
      proposedCitations: [],
    },
    {
      claimId: "behaves-1",
      kind: "BEHAVES",
      statement: "behaves",
      scenarioDescription: "hello returns 1",
      proposedSubject: options?.unbound
        ? { kind: "EVIDENCE_ID", id: "fabricated-handle-xyz" }
        : { kind: "EVIDENCE_ID", id: contentHandle },
      proposedCitations: [],
    },
  );
  return proposalJson({
    schemaVersion: 1,
    proposalId: "p-orch",
    requestedOutcome: "evidence",
    claims,
    hypotheses: [
      {
        hypothesisId: "h1",
        epistemic: "INFERRED",
        statement: "maybe",
        supportingClaimIds: ["defines-1"],
      },
    ],
  });
}

export function existsOnlyProposal(entryHandle: string): string {
  return proposalJson({
    schemaVersion: 1,
    proposalId: "p-exists",
    requestedOutcome: "evidence",
    claims: [
      {
        claimId: "exists-1",
        kind: "EXISTS",
        statement: "source exists",
        proposedSubject: { kind: "EVIDENCE_ID", id: entryHandle },
        proposedCitations: [],
      },
    ],
    hypotheses: [],
  });
}

export async function buildBrain(
  script: ScriptedReply,
  limits?: { maxDispatches?: number },
): Promise<EngineeringBrain> {
  const adapter = createDeterministicAdapter({
    providerId: "test",
    modelId: "deterministic",
    script,
  });
  const brain = createEngineeringBrain(adapter, limits);
  expect(brain.ok).toBe(true);
  if (!brain.ok) {
    throw new Error(brain.error.message);
  }
  return brain.value;
}

export async function prepareAuthorizedPlan(input: {
  root: string;
  snapshot: PreparedValidationPlan["snapshot"];
  workspace: PreparedValidationPlan["workspace"];
  config: PreparedValidationPlan["config"];
  declaredObservations: PreparedValidationPlan["declaredObservations"];
  checks: ValidationCheckSpec[];
}): Promise<{
  plan: PreparedValidationPlan;
  authorization: ValidationAuthorization;
}> {
  const prepared = await prepareValidationPlan(
    input.checks,
    {
      snapshot: input.snapshot,
      declaredObservations: input.declaredObservations,
    },
    input.workspace,
    input.config,
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error(prepared.error.message);
  }
  const auth = await authorizeValidationPlan(
    prepared.value,
    approvalsFor(input.checks),
  );
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error(auth.error.message);
  }
  return { plan: prepared.value, authorization: auth.value };
}

export function descriptorsToBrainRefs(
  descriptors: readonly { handle: string; evidenceKind: "ENTRY" | "CONTENT" | "MANIFEST"; relativePath?: string }[],
) {
  return descriptors.map((d) =>
    Object.freeze({
      handle: d.handle,
      evidenceKind: d.evidenceKind,
      ...(d.relativePath !== undefined ? { relativePath: d.relativePath } : {}),
    }),
  );
}
