#!/usr/bin/env node
/**
 * Path Code Phase 6A — opt-in offline recovery floor smoke.
 *
 * Runs a protected mutation (recoveryProtection: "REQUIRED") against a
 * disposable workspace, then performs a human-authorized recovery and proves
 * the pre-mutation bytes came back exactly.
 *
 * No network. No credentials. No Git. Nothing outside two temp directories:
 * one disposable workspace, one recovery store root that lives OUTSIDE it.
 * Not part of `npm run check`.
 *
 * Prerequisite: npm run build   (this script reads dist/, never src/)
 *
 * Usage:
 *   npm run recovery:smoke
 *   npm run recovery:smoke -- --keep     # retain both temp roots for inspection
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KEEP = process.argv.includes("--keep");
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(repoRoot, "dist");

const BEFORE_TEXT =
  "export function hello(): number {\n\treturn 1;\n}\n// caf\u00e9 \u2014 \u00fcnicode\r\n";
const AFTER_TEXT = "export function hello(): number {\n  return 42;\n}\n";
const CREATED_TEXT = "export const expectHello = 42;\n";

function fail(step, detail) {
  process.stdout.write(
    `${JSON.stringify({ RECOVERY_SMOKE: "FAILED", step, detail }, null, 2)}\n`,
  );
  process.exit(1);
}

function dist(relative) {
  return pathToFileURL(join(distRoot, relative)).href;
}

function must(step, result) {
  if (result === undefined || result.ok !== true) {
    fail(step, result?.error ?? "missing result");
  }
  return result.value;
}

if (!existsSync(join(distRoot, "recovery/index.js"))) {
  fail("PREREQUISITE", "dist/ is missing or stale — run `npm run build` first");
}

const [
  workspaceMod,
  configMod,
  inventoryMod,
  metadataMod,
  readerMod,
  searchMod,
  snapshotMod,
  catalogMod,
  brainMod,
  mutationMod,
  editingMod,
  recoveryMod,
] = await Promise.all([
  import(dist("workspace/index.js")),
  import(dist("config/index.js")),
  import(dist("inventory/index.js")),
  import(dist("metadata/index.js")),
  import(dist("reader/index.js")),
  import(dist("search/corpus.js")),
  import(dist("snapshot/index.js")),
  import(dist("reasoning/catalog.js")),
  import(dist("brain/index.js")),
  import(dist("orchestrator/mutation/index.js")),
  import(dist("editing/index.js")),
  import(dist("recovery/index.js")),
]);

/** Disposable roots. The store root is a sibling of the workspace, never inside it. */
const workspaceRoot = await realpath(
  await mkdtemp(join(tmpdir(), "pathcode-6a-workspace-")),
);
const storeRoot = await realpath(
  await mkdtemp(join(tmpdir(), "pathcode-6a-store-")),
);

async function cleanup() {
  if (KEEP) {
    return;
  }
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(storeRoot, { recursive: true, force: true });
}

function writeRelative(relativePath, content) {
  const absolute = join(workspaceRoot, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

// ── 1. Disposable workspace ────────────────────────────────────────────────
writeRelative("src/hello.ts", BEFORE_TEXT);
writeRelative(
  "tsconfig.json",
  `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["src/**/*.ts"],
    },
    null,
    2,
  )}\n`,
);
writeRelative("check.mjs", "process.exit(0);\n");

const helloPath = join(workspaceRoot, "src/hello.ts");
const createdPath = join(workspaceRoot, "src/regression.ts");
const beforeBytes = readFileSync(helloPath);

// ── 2. Earn Phase 2 observations ───────────────────────────────────────────
const workspace = must(
  "WORKSPACE",
  await workspaceMod.createWorkspaceBoundary(workspaceRoot),
);
const config = must("CONFIG", await configMod.loadProjectConfig(workspace));
const inv = must(
  "INVENTORY",
  await inventoryMod.inventory(workspace, config),
);
const repositoryMap = must(
  "METADATA",
  await metadataMod.buildRepositoryMap(workspace, inv, config),
);
const searchCorpus = must(
  "SEARCH",
  searchMod.buildRepositorySearchCorpus(inv, repositoryMap),
);

function admitted(relativePath) {
  const found = inv.observations.find(
    (item) =>
      item.relativePath === relativePath &&
      (item.disposition === "ADMITTED" || item.disposition === "DESCENDED"),
  );
  if (found === undefined) {
    fail("INVENTORY", `missing admitted entry ${relativePath}`);
  }
  return found.entry;
}

const sourceEntry = admitted("src/hello.ts");
const srcDirectory = admitted("src");

const contentObservations = [];
for (const item of repositoryMap.manifestObservations) {
  if ("observation" in item) {
    contentObservations.push(item.observation);
  }
}
const sourceRead = must(
  "READER",
  await readerMod.readRepositoryContent(sourceEntry, workspace, config),
);
if (sourceRead.status !== "READ") {
  fail("READER", `expected READ for src/hello.ts, got ${sourceRead.status}`);
}
const sourceObservation = sourceRead.observation;
if (!contentObservations.some((o) => o.entry === sourceObservation.entry)) {
  contentObservations.push(sourceObservation);
}

const entryStatIdentities = new Map();
for (const item of inv.observations) {
  if (item.disposition !== "ADMITTED") {
    continue;
  }
  const stats = await lstat(item.entry.canonicalPath);
  entryStatIdentities.set(item.entry, { dev: stats.dev, ino: stats.ino });
}

const snapshot = must(
  "SNAPSHOT",
  snapshotMod.buildRepositorySnapshot({
    workspace,
    config,
    inventory: inv,
    repositoryMap,
    searchCorpus,
    contentObservations,
    entryStatIdentities,
  }),
);

const catalog = must(
  "CATALOG",
  catalogMod.createReferenceCatalog({
    workspace,
    snapshot,
    selection: {
      entries: [srcDirectory, sourceEntry],
      contentObservations: [sourceObservation],
    },
  }),
);
const descriptors = must("CATALOG", catalogMod.describeReferenceCatalog(catalog));
function handleFor(kind, relativePath) {
  const match = descriptors.find(
    (d) => d.evidenceKind === kind && d.relativePath === relativePath,
  );
  if (match === undefined) {
    fail("CATALOG", `missing ${kind} handle for ${relativePath}`);
  }
  return match.handle;
}
const contentHandle = handleFor("CONTENT", "src/hello.ts");
const directoryHandle = handleFor("ENTRY", "src");

// ── 3. Deterministic offline Brain (no adapter, no network) ────────────────
function scriptedAdapter(script) {
  return {
    descriptor: {
      providerId: "recovery-smoke",
      modelId: "deterministic",
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
    async invoke(packet, control) {
      return script(packet, control);
    },
  };
}

const brain = must(
  "BRAIN",
  brainMod.createEngineeringBrain(
    scriptedAdapter((packet, control) => {
      const usage = {
        provenance: "TEST_FIXTURE",
        inputTokens: 1,
        outputTokens: 1,
      };
      if (packet.responseProfile.kind === "ENGINEERING_EDIT_PROPOSAL_JSON") {
        const block = packet.context.blocks.find(
          (b) => b.blockId === "permitted-targets",
        );
        const permitted = JSON.parse(block.text).permittedTargets;
        const replaceTarget = permitted.find((t) => t.kind === "REPLACE_TEXT");
        const createTarget = permitted.find((t) => t.kind === "CREATE_TEXT");
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: JSON.stringify({
            schemaVersion: 1,
            proposalId: "recovery-smoke-1",
            reasoningProposalJson: JSON.stringify({
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
                {
                  claimId: "parent-1",
                  kind: "EXISTS",
                  statement: "parent directory exists",
                  proposedSubject: { kind: "EVIDENCE_ID", id: directoryHandle },
                  proposedCitations: [],
                },
              ],
              hypotheses: [],
            }),
            changes: [
              {
                changeId: "e1",
                kind: "REPLACE_TEXT",
                targetId: replaceTarget.targetId,
                supportingClaimIds: ["source-1"],
                afterText: AFTER_TEXT,
              },
              {
                changeId: "e2",
                kind: "CREATE_TEXT",
                targetId: createTarget.targetId,
                supportingClaimIds: ["parent-1"],
                afterText: CREATED_TEXT,
              },
            ],
          }),
          usage,
        };
      }
      const postHandle =
        packet.context.references.find(
          (r) =>
            r.evidenceKind === "CONTENT" && r.relativePath === "src/hello.ts",
        )?.handle ?? contentHandle;
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: JSON.stringify({
          schemaVersion: 1,
          proposalId: "post-edit",
          requestedOutcome: "evidence",
          claims: [
            {
              claimId: "defines-1",
              kind: "DEFINES",
              statement: "defines hello",
              symbolName: "hello",
              proposedSubject: { kind: "EVIDENCE_ID", id: postHandle },
              proposedCitations: [],
            },
            {
              claimId: "behaves-1",
              kind: "BEHAVES",
              statement: "behaves",
              scenarioDescription: "hello returns expected",
              proposedSubject: { kind: "EVIDENCE_ID", id: postHandle },
              proposedCitations: [],
            },
          ],
          hypotheses: [],
        }),
        usage,
      };
    }),
  ),
);

// ── 4. Recovery store, OUTSIDE the workspace ───────────────────────────────
const store = must(
  "STORE",
  recoveryMod.createRecoveryStore({ rootDirectory: storeRoot }),
);
const storeDescriptor = store.describe();
if (storeDescriptor.usesGit !== false || storeDescriptor.encryptsAtRest !== false) {
  fail("STORE", "store descriptor must declare no Git and no encryption");
}

// ── 5. Protected mutation ──────────────────────────────────────────────────
const session = must(
  "SESSION_OPEN",
  mutationMod.openEngineeringMutationSession({
    workspace,
    snapshot,
    catalog,
    brain,
    permittedTargets: [
      {
        kind: "REPLACE_TEXT",
        contentObservation: sourceObservation,
        entry: sourceEntry,
      },
      {
        kind: "CREATE_TEXT",
        parentDirectory: srcDirectory,
        leafName: "regression.ts",
      },
    ],
    disclosedObservations: [sourceObservation],
    validationBlueprint: {
      checks: [
        {
          id: "targeted",
          kind: "TARGETED_TEST",
          request: {
            executable: process.execPath,
            argv: [join(workspaceRoot, "check.mjs")],
            cwd: workspaceRoot,
          },
        },
      ],
      claimCheckAssignments: [
        { claimId: "defines-1", selectedCheckIds: ["targeted"] },
        { claimId: "behaves-1", selectedCheckIds: ["targeted"] },
      ],
      supportingObservations: [sourceObservation],
      postEditInstructionText: "confirm the edit",
      postEditContextBlocks: [],
      maxBrainAttempts: 1,
    },
    recoveryProtection: "REQUIRED",
    recoveryStore: store,
  }),
);

const review = must(
  "PROPOSE",
  await session.propose({
    correlationId: "recovery-smoke-propose",
    instructionText: "apply the reviewed edit",
  }),
);

const pairs = [];
for (const item of review.view.order) {
  pairs.push({
    prepared: item.prepared,
    authorization: must(
      "EDIT_AUTHORIZATION",
      await editingMod.authorizePreparedChange(
        item.prepared,
        editingMod.explicitEditApproval(),
        item.prepared.config,
      ),
    ),
  });
}

const applied = must("APPLY", await session.apply(review, pairs));
catalogMod.disposeReferenceCatalog(applied.view.postEditCatalog);

const { recoveryCheckpointId, recoveryProtection } = session.describe();
if (recoveryProtection !== "REQUIRED" || typeof recoveryCheckpointId !== "string") {
  fail("CHECKPOINT", "protected apply did not establish a checkpoint");
}
session.close();
brain.dispose();

const mutatedBytes = readFileSync(helloPath);
if (mutatedBytes.equals(beforeBytes)) {
  fail("MUTATION", "the workspace was never mutated; nothing to recover");
}
if (!existsSync(createdPath)) {
  fail("MUTATION", "the created file is missing; nothing to recover");
}

// ── 6. Authorized recovery through a FRESH store instance ──────────────────
const reopenedStore = must(
  "STORE_REOPEN",
  recoveryMod.createRecoveryStore({ rootDirectory: storeRoot }),
);
const checkpoint = must(
  "CHECKPOINT_LOAD",
  await recoveryMod.loadCheckpoint(reopenedStore, recoveryCheckpointId),
);
const recoveryReview = must(
  "RECOVERY_REVIEW",
  await recoveryMod.prepareRecoveryReview(checkpoint, workspace, config),
);

const eligible = recoveryReview.view.entries.filter(
  (entry) => entry.disposition === "ELIGIBLE_RESTORE",
);
if (eligible.length !== 2) {
  fail(
    "RECOVERY_REVIEW",
    recoveryReview.view.entries.map((e) => ({
      relativePath: e.relativePath,
      disposition: e.disposition,
    })),
  );
}

const authorization = must(
  "RECOVERY_AUTHORIZATION",
  recoveryMod.authorizeRecoveryReview(
    recoveryReview,
    eligible.map((entry) => entry.entryId),
    recoveryMod.explicitRecoveryApproval(),
  ),
);
const executed = must(
  "RECOVERY_EXECUTE",
  await recoveryMod.executeRecovery(
    authorization,
    recoveryReview,
    workspace,
    config,
  ),
);
if (executed.disposition !== "RECOVERY_COMPLETE") {
  fail("RECOVERY_EXECUTE", executed);
}

// ── 7. Prove the bytes ─────────────────────────────────────────────────────
const restoredBytes = readFileSync(helloPath);
if (!restoredBytes.equals(beforeBytes)) {
  fail("BYTE_PROOF", {
    expectedSha256: recoveryMod.digestBytes(beforeBytes),
    actualSha256: recoveryMod.digestBytes(restoredBytes),
  });
}
if (existsSync(createdPath)) {
  fail("BYTE_PROOF", "the created file was not removed by recovery");
}
if (!existsSync(join(workspaceRoot, "src"))) {
  fail("BYTE_PROOF", "recovery removed a directory");
}

const summary = {
  RECOVERY_SMOKE: "PASSED",
  network: "NONE",
  credentials: "NONE",
  git: "NONE",
  workspaceRoot,
  storeRoot,
  checkpointId: recoveryCheckpointId,
  protectedMutation: {
    replaced: "src/hello.ts",
    created: "src/regression.ts",
  },
  authorizedRecovery: {
    disposition: executed.disposition,
    entries: executed.entries.map((entry) => ({
      relativePath: entry.relativePath,
      disposition: entry.disposition,
    })),
  },
  byteProof: {
    restoredSha256: recoveryMod.digestBytes(restoredBytes).hex,
    preMutationSha256: recoveryMod.digestBytes(beforeBytes).hex,
    createdFileAbsent: true,
  },
  temporaryRootsRemoved: !KEEP,
};

await cleanup();
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
