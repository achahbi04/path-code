#!/usr/bin/env node
/**
 * Path Code Phase 5G — opt-in offline General Engineering Session smoke.
 *
 * Composes the real session end to end against a disposable Git repository:
 * preflight, scope call, scope approval, approved-path reading, edit call,
 * edit approval, final currentness, recovery checkpoint, write, command
 * disclosure, check approval, post-edit evidence call and Gate 2 — then, in a
 * SEPARATE PROCESS, `/recover <checkpoint-id>` restores the pre-edit bytes.
 *
 * No network and no credential: the provider seam is a scripted adapter behind
 * the real Engineering Brain, so normalization, profile admission and budgets
 * are all genuinely exercised. Git is used only to create the fixture and is
 * never invoked by the session except through Path Code's read-only owners.
 *
 * Prerequisite: npm run build   (this script reads dist/, never src/)
 *
 * Usage:
 *   npm run general-session:smoke
 *   npm run general-session:smoke -- --keep
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTrialOwners } from "./pathcode-cli/owners.mjs";
import { runGeneralEngineeringSession } from "./pathcode-cli/general-session.mjs";
import { runRecoverCommand } from "./pathcode-cli/recover.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKOUT_ROOT = join(HERE, "..");
const KEEP = process.argv.includes("--keep");

const BEFORE_TEXT = `export function add(a: number, b: number): number {
  return a + b;
}

export function answer(): number {
  return 0;
}
`;

const AFTER_TEXT = `export function add(a: number, b: number): number {
  return a + b;
}

export function answer(): number {
  return 42;
}
`;

const TASK_TEXT = "Make answer() return 42 without changing the exported API.";

function fail(step, detail) {
  process.stdout.write(
    `${JSON.stringify({ GENERAL_SESSION_SMOKE: "FAILED", step, detail }, null, 2)}\n`,
  );
  process.exit(1);
}

/**
 * A prompt double. It only ever answers with the exact challenge phrase the
 * session asked for, which is the same grammar a human must type.
 */
function scriptedPrompt(answers, transcript) {
  return {
    write: (text) => transcript.push(text),
    writeErr: (text) => transcript.push(text),
    askLine: async (promptId) => {
      if (!Object.prototype.hasOwnProperty.call(answers, promptId)) {
        fail("PROMPT", `unexpected prompt '${promptId}'`);
      }
      return answers[promptId];
    },
    askHiddenCredential: async () => {
      fail("PROMPT", "the smoke must never be asked for a credential");
      return { ok: false, code: "NO" };
    },
    isStopped: () => false,
    close: () => undefined,
  };
}

function git(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Path Code Smoke",
      GIT_AUTHOR_EMAIL: "smoke@example.invalid",
      GIT_COMMITTER_NAME: "Path Code Smoke",
      GIT_COMMITTER_EMAIL: "smoke@example.invalid",
    },
  });
  if (result.status !== 0) {
    fail("GIT_FIXTURE", `git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function write(root, relativePath, content) {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

/** Build the disposable repository. */
function provisionRepository(root) {
  write(root, "src/answer.ts", BEFORE_TEXT);
  write(
    root,
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
  write(
    root,
    "package.json",
    `${JSON.stringify(
      {
        name: "pathcode-general-session-smoke-fixture",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          pretest: "node tools/pretest.mjs",
          test: "node tools/answer.test.mjs",
          "test:unit": "npm run test",
          // Admitted by name but refused on inspection: proves the host reads
          // the body, not just the script name.
          "test:install": "npm install && node tools/answer.test.mjs",
          "test:dynamic": "node $TARGET",
          deploy: "echo never",
        },
      },
      null,
      2,
    )}\n`,
  );
  write(
    root,
    "tools/pretest.mjs",
    "process.stdout.write('pretest hook ran\\n');\n",
  );
  write(
    root,
    "tools/answer.test.mjs",
    `import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/answer.ts", import.meta.url), "utf8");
if (!/return 42;/.test(source)) {
  process.stderr.write("answer() does not return 42\\n");
  process.exit(1);
}
process.stdout.write("answer() returns 42\\n");
`,
  );
  // A stand-in for a project-local compiler. The smoke proves the discovery and
  // execution path; it does not claim to have type-checked anything.
  write(
    root,
    "node_modules/typescript/lib/tsc.js",
    "process.stdout.write('stub tsc: no diagnostics\\n');\n",
  );

  git(root, ["init", "--quiet", "--initial-branch=main"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "--quiet", "-m", "seed"]);
}

/** Deterministic adapter behind the REAL brain. */
function scriptedAdapter(state) {
  return {
    descriptor: {
      providerId: "general-session-smoke",
      modelId: "deterministic",
      capabilities: {
        textInput: true,
        textOutput: true,
        acceptedResponseProfiles: [
          { kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 },
          { kind: "ENGINEERING_EDIT_PROPOSAL_JSON", schemaVersion: 1 },
          { kind: "ENGINEERING_SCOPE_PLAN_JSON", schemaVersion: 1 },
        ],
        honorsOutputTokenLimit: true,
        cancellationDeclared: true,
        maxOutputTokens: 8_192,
      },
    },
    async invoke(packet, control) {
      state.invocations.push({
        purpose: packet.purpose,
        profile: packet.responseProfile.kind,
        maxOutputTokens: packet.maxOutputTokens,
      });
      const usage = { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 };

      if (packet.responseProfile.kind === "ENGINEERING_SCOPE_PLAN_JSON") {
        const inventoryBlock = packet.context.blocks.find(
          (b) => b.blockId === "repository-inventory",
        );
        state.scopeSawFileBodies = /return 0;/.test(inventoryBlock?.text ?? "");
        state.scopeSawNodeModules = /node_modules/.test(inventoryBlock?.text ?? "");
        const candidatesBlock = packet.context.blocks.find(
          (b) => b.blockId === "validation-candidates",
        );
        state.candidateBlockText = candidatesBlock?.text ?? "";
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: JSON.stringify({
            schemaVersion: 1,
            taskSummary: "Change answer() to return 42.",
            editableTargets: [
              {
                relativePath: "src/answer.ts",
                changeKind: "REPLACE_TEXT",
                reason: "answer() is defined here",
              },
            ],
            contextPaths: ["package.json"],
            validationCandidateIds: ["typecheck-local-tsc", "npm-test"],
            assumptions: ["answer() has no other callers in this repository"],
            limitations: ["No file body has been read yet"],
          }),
          usage,
        };
      }

      if (packet.responseProfile.kind === "ENGINEERING_EDIT_PROPOSAL_JSON") {
        const targets = JSON.parse(
          packet.context.blocks.find((b) => b.blockId === "permitted-targets").text,
        ).permittedTargets;
        const target = targets.find((t) => t.relativePath === "src/answer.ts");
        const contentHandle = packet.context.references.find(
          (r) => r.evidenceKind === "CONTENT" && r.relativePath === "src/answer.ts",
        ).handle;
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: JSON.stringify({
            schemaVersion: 1,
            proposalId: "smoke-edit-1",
            reasoningProposalJson: JSON.stringify({
              schemaVersion: 1,
              proposalId: "pre-edit",
              requestedOutcome: "edit",
              claims: [
                {
                  claimId: "source-1",
                  kind: "CONTENT",
                  statement: "current text of src/answer.ts observed",
                  proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
                  proposedCitations: [],
                },
              ],
              hypotheses: [],
            }),
            changes: [
              {
                changeId: "c1",
                kind: "REPLACE_TEXT",
                targetId: target.targetId,
                supportingClaimIds: ["source-1"],
                afterText: AFTER_TEXT,
              },
            ],
          }),
          usage,
        };
      }

      const requirements = JSON.parse(
        packet.context.blocks.find(
          (b) => b.blockId === "post-edit-execution-claim-requirements",
        ).text,
      );
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: JSON.stringify({
          schemaVersion: 1,
          proposalId: "post-edit",
          requestedOutcome: "evidence",
          claims: requirements.requiredClaims.map((required) =>
            required.requiredClaimKind === "DEFINES"
              ? {
                  claimId: required.claimId,
                  kind: "DEFINES",
                  statement: "defines answer",
                  symbolName: "answer",
                  proposedSubject: {
                    kind: "EVIDENCE_ID",
                    id: required.requiredEvidenceReference,
                  },
                  proposedCitations: [],
                }
              : {
                  claimId: required.claimId,
                  kind: "BEHAVES",
                  statement: "answer returns 42",
                  scenarioDescription: "answer() returns 42",
                  proposedSubject: {
                    kind: "EVIDENCE_ID",
                    id: required.requiredEvidenceReference,
                  },
                  proposedCitations: [],
                },
          ),
          hypotheses: [],
        }),
        usage,
      };
    },
  };
}

/* ────────────────────────── recovery restart phase ───────────────────────── */

const recoverIndex = process.argv.indexOf("--recover-phase");
if (recoverIndex !== -1) {
  const checkpointId = process.argv[recoverIndex + 1];
  const repoRoot = process.argv[recoverIndex + 2];
  const transcript = [];
  const prompt = scriptedPrompt({ restore: "RESTORE recover-smoke" }, transcript);
  const result = await runRecoverCommand(prompt, {
    checkpointId,
    projectRoot: repoRoot,
    checkoutRoot: CHECKOUT_ROOT,
    restoreChallenge: "recover-smoke",
  });
  process.stdout.write(
    `${JSON.stringify({ phase: "RECOVER", ...result, transcript: transcript.join("") })}\n`,
  );
  process.exit(result.exitCode === 0 ? 0 : 1);
}

/* ────────────────────────────── main flow ────────────────────────────────── */

const repoRoot = await realpath(
  await mkdtemp(join(tmpdir(), "pathcode-5g-project-")),
);
const storeRoot = await realpath(
  await mkdtemp(join(tmpdir(), "pathcode-5g-state-")),
);

async function cleanup() {
  if (KEEP) return;
  await rm(repoRoot, { recursive: true, force: true });
  await rm(storeRoot, { recursive: true, force: true });
}

provisionRepository(repoRoot);
const sourcePath = join(repoRoot, "src/answer.ts");
const beforeBytes = readFileSync(sourcePath);

const owners = await loadTrialOwners(CHECKOUT_ROOT);
if (!owners.ok) {
  fail("OWNERS", owners.message);
}

const adapterState = { invocations: [] };
const brainResult = owners.createEngineeringBrain(scriptedAdapter(adapterState), {
  maxDispatches: 3,
  maxTimeoutMs: 120_000,
  maxOutputTokens: 8_192,
});
if (!brainResult.ok) {
  fail("BRAIN", brainResult.error);
}

const transcript = [];
const prompt = scriptedPrompt(
  {
    "start-consent": "START smoke-start",
    scope: "SCOPE smoke-scope",
    apply: "APPLY smoke-apply",
    check: "CHECK smoke-check",
  },
  transcript,
);

const sessionResult = await runGeneralEngineeringSession(prompt, {
  taskText: TASK_TEXT,
  projectRoot: repoRoot,
  checkoutRoot: CHECKOUT_ROOT,
  owners,
  brain: brainResult.value,
  allowNonTty: true,
  env: { ...process.env, PATHCODE_STATE_DIR: storeRoot },
  startChallenge: "smoke-start",
  scopeChallenge: "smoke-scope",
  applyChallenge: "smoke-apply",
  checkChallenge: "smoke-check",
});
brainResult.value.dispose();

const text = transcript.join("");

if (sessionResult.outcome !== "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED") {
  fail("SESSION", {
    outcome: sessionResult.outcome,
    cycle: sessionResult.validationOutcome?.artifacts?.cycle?.record ?? null,
    transcript: text,
  });
}
if (adapterState.invocations.length !== 3) {
  fail("BUDGET", adapterState.invocations);
}
if (adapterState.scopeSawFileBodies) {
  fail("SCOPE_DISCLOSURE", "the scope call was shown file contents");
}
if (adapterState.scopeSawNodeModules) {
  fail("SCOPE_DISCLOSURE", "the scope call was shown a sensitive path");
}
if (!/npm-test:[\s\S]*pretest/.test(adapterState.candidateBlockText) &&
    !/pretest/.test(adapterState.candidateBlockText)) {
  fail("CANDIDATE_DISCLOSURE", adapterState.candidateBlockText);
}
if (!text.includes("pretest hook") && !text.includes("pretest")) {
  fail("CHECK_DISCLOSURE", "the CHECK review did not disclose the pretest hook");
}
if (text.includes("npm-test:install") || text.includes("npm install")) {
  fail("CANDIDATE_ADMISSION", "an install-bearing script reached the plan");
}
if (typeof sessionResult.checkpointId !== "string") {
  fail("CHECKPOINT", "no checkpoint id was reported");
}
for (const snapshot of sessionResult.preparedEnvSnapshots ?? []) {
  for (const key of Object.keys(snapshot)) {
    if (/^OPENAI_|_API_KEY$|^AWS_/.test(key)) {
      fail("ENV_SCRUB", key);
    }
  }
}

const afterBytes = readFileSync(sourcePath);
if (afterBytes.equals(beforeBytes)) {
  fail("MUTATION", "the file was never changed");
}

// ── Separate process: /recover restores the pre-edit bytes. ────────────────
const recovered = spawnSync(
  process.execPath,
  [
    join(HERE, "general-session-smoke.mjs"),
    "--recover-phase",
    sessionResult.checkpointId,
    repoRoot,
  ],
  {
    encoding: "utf8",
    env: { ...process.env, PATHCODE_STATE_DIR: storeRoot },
    cwd: repoRoot,
  },
);
if (recovered.status !== 0) {
  fail("RECOVER_RESTART", { stdout: recovered.stdout, stderr: recovered.stderr });
}

const restoredBytes = readFileSync(sourcePath);
if (!restoredBytes.equals(beforeBytes)) {
  fail("BYTE_PROOF", "recovery did not restore the pre-edit bytes exactly");
}
if (!existsSync(join(repoRoot, ".git"))) {
  fail("GIT", "the fixture repository lost its .git directory");
}

const summary = {
  GENERAL_SESSION_SMOKE: "PASSED",
  network: "NONE",
  credentials: "NONE",
  gitWritesByPathCode: "NONE",
  projectRoot: repoRoot,
  storeRoot,
  modelInvocations: adapterState.invocations,
  checkpointId: sessionResult.checkpointId,
  outcome: sessionResult.outcome,
  recoveryRanInSeparateProcess: true,
  restoredPreEditBytes: true,
  temporaryRootsRemoved: !KEEP,
};

await cleanup();
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
