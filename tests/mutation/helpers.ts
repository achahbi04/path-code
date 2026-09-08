/**
 * Shared helpers for Phase 5D3 authorized mutation tests.
 */

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect } from "vitest";

import { createEngineeringBrain } from "../../src/brain/index.js";
import type { EngineeringBrain } from "../../src/brain/types.js";
import {
  authorizePreparedChange,
  explicitEditApproval,
} from "../../src/editing/index.js";
import type { PreparedChange } from "../../src/editing/types.js";
import type { RepositoryEntry } from "../../src/inventory/types.js";
import type { ContentObservation } from "../../src/reader/types.js";
import {
  createReferenceCatalog,
  describeReferenceCatalog,
  type ReferenceCatalog,
  type ReferenceDescriptor,
} from "../../src/reasoning/catalog.js";
import { authorizeValidationPlan } from "../../src/validation/index.js";
import { explicitLocalProcessApproval } from "../../src/execution/index.js";
import type { PreparedValidationPlan } from "../../src/validation/types.js";
import {
  createDeterministicAdapter,
  type ScriptedReply,
} from "../brain/fixtures.js";
import {
  cleanupReasoningFixtures,
  createCanonicalTempRoot,
  proposalJson,
  snapshotAt,
  writeRelative,
} from "../reasoning/helpers.js";
import type { SnapshotFixture } from "../snapshot/helpers.js";
import type { MutationReview } from "../../src/orchestrator/mutation/types.js";

export { cleanupReasoningFixtures, proposalJson };

const require = createRequire(import.meta.url);

export function tscExecutable(): { executable: string; argvPrefix: string[] } {
  const tscJs = require.resolve("typescript/lib/tsc.js");
  return { executable: process.execPath, argvPrefix: [tscJs] };
}

export function nodeRequest(root: string, scriptPath: string) {
  return {
    executable: process.execPath,
    argv: [scriptPath],
    cwd: root,
  };
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

export function handleFor(
  descriptors: readonly ReferenceDescriptor[],
  kind: "ENTRY" | "CONTENT" | "MANIFEST",
  relativePath: string,
): string {
  const match = descriptors.find(
    (d) => d.evidenceKind === kind && d.relativePath === relativePath,
  );
  if (!match) {
    throw new Error(`missing ${kind} handle for ${relativePath}`);
  }
  return match.handle;
}

export function directoryEntryAt(
  fixture: SnapshotFixture,
  relativePath: string,
): RepositoryEntry {
  const observation = fixture.inventory.observations.find(
    (item) =>
      (item.disposition === "ADMITTED" || item.disposition === "DESCENDED") &&
      item.relativePath === relativePath &&
      "entry" in item &&
      item.entry.physicalKind === "DIRECTORY",
  );
  if (
    !observation ||
    (observation.disposition !== "ADMITTED" &&
      observation.disposition !== "DESCENDED")
  ) {
    throw new Error(`missing directory ${relativePath}`);
  }
  return observation.entry;
}

export async function mutationFixture(options?: {
  source?: string;
  extraFiles?: ReadonlyArray<{ path: string; content: string }>;
  /** Runs after the files exist and before the snapshot is taken. */
  beforeSnapshot?: (root: string) => Promise<void>;
}): Promise<{
  root: string;
  fixture: SnapshotFixture;
  sourceEntry: RepositoryEntry;
  sourceObservation: ContentObservation;
  srcDir: RepositoryEntry;
  catalog: ReferenceCatalog;
  descriptors: readonly ReferenceDescriptor[];
}> {
  const root = await createCanonicalTempRoot("phase5d3-");
  const source = options?.source ?? "export function hello() { return 1; }\n";
  await writeRelative(root, "src/hello.ts", source);
  for (const extra of options?.extraFiles ?? []) {
    await writeRelative(root, extra.path, extra.content);
  }
  // Minimal tsconfig for real tsc runs in disposable workspace
  await writeRelative(
    root,
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["src/**/*.ts", "tests/**/*.ts"],
      },
      null,
      2,
    ) + "\n",
  );

  if (options?.beforeSnapshot !== undefined) {
    await options.beforeSnapshot(root);
  }

  const fixture = await snapshotAt(root, {
    extraContentPaths: [
      "src/hello.ts",
      ...(options?.extraFiles?.map((f) => f.path) ?? []),
    ],
  });
  const sourceEntry = fixture.inventory.observations.find(
    (o) => o.disposition === "ADMITTED" && o.relativePath === "src/hello.ts",
  );
  if (sourceEntry?.disposition !== "ADMITTED") {
    throw new Error("missing src/hello.ts");
  }
  const sourceObservation =
    fixture.snapshot.contentObservationByEntry.get(sourceEntry.entry);
  expect(sourceObservation).toBeDefined();
  const srcDir = directoryEntryAt(fixture, "src");

  const catalogResult = createReferenceCatalog({
    workspace: fixture.workspace,
    snapshot: fixture.snapshot,
    selection: {
      entries: [srcDir, sourceEntry.entry],
      contentObservations: [sourceObservation!],
    },
  });
  expect(catalogResult.ok).toBe(true);
  if (!catalogResult.ok) {
    throw new Error(catalogResult.error.message);
  }
  const described = describeReferenceCatalog(catalogResult.value);
  expect(described.ok).toBe(true);
  if (!described.ok) {
    throw new Error(described.error.message);
  }

  return {
    root,
    fixture,
    sourceEntry: sourceEntry.entry,
    sourceObservation: sourceObservation!,
    srcDir,
    catalog: catalogResult.value,
    descriptors: described.value,
  };
}

export async function buildDualProfileBrain(
  script: ScriptedReply,
  limits?: { maxDispatches?: number },
): Promise<EngineeringBrain> {
  const adapter = createDeterministicAdapter({
    providerId: "test",
    modelId: "deterministic",
    descriptor: {
      capabilities: {
        textInput: true,
        textOutput: true,
        acceptedResponseProfiles: [
          { kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 },
          { kind: "ENGINEERING_EDIT_PROPOSAL_JSON", schemaVersion: 1 },
        ],
        honorsOutputTokenLimit: true,
        cancellationDeclared: true,
      },
    },
    script,
  });
  const brain = createEngineeringBrain(adapter, limits);
  expect(brain.ok).toBe(true);
  if (!brain.ok) {
    throw new Error(brain.error.message);
  }
  return brain.value;
}

export function editEnvelope(input: {
  proposalId?: string;
  reasoningProposalJson: string;
  changes: ReadonlyArray<{
    changeId: string;
    kind: "REPLACE_TEXT" | "CREATE_TEXT";
    targetId: string;
    supportingClaimIds: readonly string[];
    afterText: string;
  }>;
}): string {
  return JSON.stringify({
    schemaVersion: 1,
    proposalId: input.proposalId ?? "change-1",
    reasoningProposalJson: input.reasoningProposalJson,
    changes: input.changes,
  });
}

export function replaceReasoning(contentHandle: string): string {
  return proposalJson({
    schemaVersion: 1,
    proposalId: "pre-edit",
    requestedOutcome: "evidence",
    claims: [
      {
        claimId: "source-1",
        kind: "CONTENT",
        statement: "source text observed",
        proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
        proposedCitations: [],
      },
    ],
    hypotheses: [],
  });
}

export function createReasoning(dirHandle: string): string {
  return proposalJson({
    schemaVersion: 1,
    proposalId: "pre-edit-create",
    requestedOutcome: "evidence",
    claims: [
      {
        claimId: "parent-1",
        kind: "EXISTS",
        statement: "parent directory exists",
        proposedSubject: { kind: "EVIDENCE_ID", id: dirHandle },
        proposedCitations: [],
      },
    ],
    hypotheses: [],
  });
}

export function mixedReasoning(
  contentHandle: string,
  dirHandle: string,
): string {
  return proposalJson({
    schemaVersion: 1,
    proposalId: "pre-edit-mixed",
    requestedOutcome: "evidence",
    claims: [
      {
        claimId: "source-1",
        kind: "CONTENT",
        statement: "source text observed",
        proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
        proposedCitations: [],
      },
      {
        claimId: "parent-1",
        kind: "EXISTS",
        statement: "parent directory exists",
        proposedSubject: { kind: "EVIDENCE_ID", id: dirHandle },
        proposedCitations: [],
      },
    ],
    hypotheses: [],
  });
}

export function postEditDefinesBehaves(contentHandle: string): string {
  return proposalJson({
    schemaVersion: 1,
    proposalId: "post-edit",
    requestedOutcome: "evidence",
    claims: [
      {
        claimId: "defines-1",
        kind: "DEFINES",
        statement: "defines hello",
        symbolName: "hello",
        proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
        proposedCitations: [],
      },
      {
        claimId: "behaves-1",
        kind: "BEHAVES",
        statement: "behaves",
        scenarioDescription: "hello returns expected",
        proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
        proposedCitations: [],
      },
    ],
    hypotheses: [],
  });
}

export async function authorizePairs(
  review: MutationReview,
): Promise<
  {
    prepared: PreparedChange;
    authorization: import("../../src/editing/types.js").EditAuthorization;
  }[]
> {
  const pairs: {
    prepared: PreparedChange;
    authorization: import("../../src/editing/types.js").EditAuthorization;
  }[] = [];
  for (const item of review.view.order) {
    const auth = await authorizePreparedChange(
      item.prepared,
      explicitEditApproval(),
      item.prepared.config,
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) {
      throw new Error(auth.error.message);
    }
    pairs.push({ prepared: item.prepared, authorization: auth.value });
  }
  return pairs;
}

export async function authorizePlan(
  plan: PreparedValidationPlan,
): Promise<
  Awaited<ReturnType<typeof authorizeValidationPlan>> extends {
    ok: true;
    value: infer A;
  }
    ? A
    : never
> {
  const map = new Map();
  for (const check of plan.checks) {
    map.set(check.id, explicitLocalProcessApproval());
  }
  const auth = await authorizeValidationPlan(plan, map);
  expect(auth.ok).toBe(true);
  if (!auth.ok) {
    throw new Error(auth.error.message);
  }
  return auth.value as Awaited<
    ReturnType<typeof authorizeValidationPlan>
  > extends { ok: true; value: infer A }
    ? A
    : never;
}
