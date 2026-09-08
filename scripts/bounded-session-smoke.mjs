#!/usr/bin/env node
/**
 * Path Code Phase 5G-R1 — opt-in offline Bounded Engineering Session smoke.
 *
 * Nordic-shaped fixture: nested editable source + root tsconfig/package.json,
 * with unrelated siblings that must never enter the approved catalog path.
 * Exactly one simulated authority: RUN. No SCOPE / APPLY / CHECK prompts.
 *
 * No network and no credential: scripted adapter behind the real Engineering
 * Brain. Recovery store is a sibling of the disposable repo, never inside it.
 *
 * Prerequisite: npm run build
 *
 * Usage:
 *   npm run bounded-session:smoke
 *   npm run bounded-session:smoke -- --keep
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTrialOwners } from "./pathcode-cli/owners.mjs";
import { runGeneralEngineeringSession } from "./pathcode-cli/general-session.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKOUT_ROOT = join(HERE, "..");
const KEEP = process.argv.includes("--keep");

const EDIT_PATH = "src/lib/answer.ts";

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
const RUN_CHALLENGE = "bounded-smoke-run";

function fail(step, detail) {
  process.stdout.write(
    `${JSON.stringify({ BOUNDED_SESSION_SMOKE: "FAILED", step, detail }, null, 2)}\n`,
  );
  process.exit(1);
}

function scriptedPrompt(answers, transcript, asked) {
  return {
    write: (text) => transcript.push(text),
    writeErr: (text) => transcript.push(text),
    askLine: async (promptId) => {
      asked.push(promptId);
      if (!Object.prototype.hasOwnProperty.call(answers, promptId)) {
        fail("PROMPT", `unexpected prompt '${promptId}' — bounded smoke allows only RUN`);
      }
      if (promptId === "scope" || promptId === "apply" || promptId === "check") {
        fail("PROMPT", `bounded smoke must never ask ${promptId}`);
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

function provisionRepository(root) {
  write(root, EDIT_PATH, BEFORE_TEXT);
  write(root, "src/lib/sibling.ts", "export const sibling = 1;\n");
  write(root, "src/lib/nested/extra.ts", "export const extra = 1;\n");
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
        name: "pathcode-bounded-session-smoke-fixture",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          pretest: "node tools/pretest.mjs",
          test: "node tools/answer.test.mjs",
        },
      },
      null,
      2,
    )}\n`,
  );
  write(root, "tools/pretest.mjs", "process.stdout.write('pretest hook ran\\n');\n");
  write(
    root,
    "tools/answer.test.mjs",
    `import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/lib/answer.ts", import.meta.url), "utf8");
if (!/return 42;/.test(source)) {
  process.stderr.write("answer() does not return 42\\n");
  process.exit(1);
}
process.stdout.write("answer() returns 42\\n");
`,
  );
  write(
    root,
    "node_modules/typescript/lib/tsc.js",
    "process.stdout.write('stub tsc: no diagnostics\\n');\n",
  );

  git(root, ["init", "--quiet", "--initial-branch=main"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "--quiet", "-m", "seed"]);
}

function scriptedAdapter(state) {
  return {
    descriptor: {
      providerId: "bounded-session-smoke",
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
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: JSON.stringify({
            schemaVersion: 1,
            taskSummary: "Change answer() to return 42.",
            editableTargets: [
              {
                relativePath: EDIT_PATH,
                changeKind: "REPLACE_TEXT",
                reason: "answer() is defined here",
              },
            ],
            contextPaths: ["tsconfig.json", "package.json"],
            validationCandidateIds: ["typecheck-local-tsc", "npm-test"],
            assumptions: [],
            limitations: ["No file body has been read yet"],
          }),
          usage,
        };
      }

      if (packet.responseProfile.kind === "ENGINEERING_EDIT_PROPOSAL_JSON") {
        const targets = JSON.parse(
          packet.context.blocks.find((b) => b.blockId === "permitted-targets").text,
        ).permittedTargets;
        const target = targets.find((t) => t.relativePath === EDIT_PATH);
        const contentHandle = packet.context.references.find(
          (r) => r.evidenceKind === "CONTENT" && r.relativePath === EDIT_PATH,
        ).handle;
        const disclosed = packet.context.references.map((r) => r.relativePath);
        state.editDisclosedPaths = [...new Set(disclosed.filter(Boolean))];
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: JSON.stringify({
            schemaVersion: 1,
            proposalId: "bounded-smoke-edit-1",
            reasoningProposalJson: JSON.stringify({
              schemaVersion: 1,
              proposalId: "pre-edit",
              requestedOutcome: "edit",
              claims: [
                {
                  claimId: "source-1",
                  kind: "CONTENT",
                  statement: `current text of ${EDIT_PATH} observed`,
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

const repoRoot = await realpath(
  await mkdtemp(join(tmpdir(), "pathcode-5g-r1-project-")),
);
const storeRoot = await realpath(
  await mkdtemp(join(tmpdir(), "pathcode-5g-r1-state-")),
);

async function cleanup() {
  if (KEEP) return;
  await rm(repoRoot, { recursive: true, force: true });
  await rm(storeRoot, { recursive: true, force: true });
}

provisionRepository(repoRoot);
const sourcePath = join(repoRoot, EDIT_PATH);
const beforeBytes = readFileSync(sourcePath);
const headBefore = git(repoRoot, ["rev-parse", "HEAD"]).trim();

const owners = await loadTrialOwners(CHECKOUT_ROOT);
if (!owners.ok) {
  fail("OWNERS", owners.message);
}

const adapterState = { invocations: [], editDisclosedPaths: [] };
const brainResult = owners.createEngineeringBrain(scriptedAdapter(adapterState), {
  maxDispatches: 3,
  maxTimeoutMs: 120_000,
  maxOutputTokens: 8_192,
});
if (!brainResult.ok) {
  fail("BRAIN", brainResult.error);
}

const transcript = [];
const asked = [];
const prompt = scriptedPrompt(
  { "run-consent": `RUN ${RUN_CHALLENGE}` },
  transcript,
  asked,
);

const sessionResult = await runGeneralEngineeringSession(prompt, {
  taskText: TASK_TEXT,
  projectRoot: repoRoot,
  checkoutRoot: CHECKOUT_ROOT,
  owners,
  brain: brainResult.value,
  allowNonTty: true,
  autonomyMode: "bounded",
  runChallenge: RUN_CHALLENGE,
  env: { ...process.env, PATHCODE_STATE_DIR: storeRoot },
});
brainResult.value.dispose();

const text = transcript.join("");

if (asked.some((id) => id === "scope" || id === "apply" || id === "check")) {
  fail("AUTHORITY", { asked, detail: "SCOPE/APPLY/CHECK must not appear in bounded mode" });
}
if (asked.length !== 1 || asked[0] !== "run-consent") {
  fail("AUTHORITY", { asked, detail: "exactly one RUN consent expected" });
}
if (sessionResult.outcome !== "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED") {
  fail("SESSION", {
    outcome: sessionResult.outcome,
    cycle: sessionResult.validationOutcome?.artifacts?.cycle?.record ?? null,
    transcript: text,
  });
}
if (sessionResult.exitCode !== 0) {
  fail("EXIT", sessionResult.exitCode);
}
if (adapterState.invocations.length !== 3) {
  fail("BUDGET", adapterState.invocations);
}
if (adapterState.scopeSawFileBodies) {
  fail("SCOPE_DISCLOSURE", "the scope call was shown file contents");
}
for (const leak of ["src/lib/sibling.ts", "src/lib/nested/extra.ts"]) {
  if ((adapterState.editDisclosedPaths ?? []).includes(leak)) {
    fail("CATALOG_LEAK", leak);
  }
}
if (!text.includes("Scope admitted by bounded policy")) {
  fail("TRANSCRIPT", "missing bounded scope progress");
}
if (!text.includes("Reading approved files")) {
  fail("TRANSCRIPT", "missing read progress");
}
if (!/Recovery checkpoint/.test(text)) {
  fail("TRANSCRIPT", "missing recovery progress");
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
  fail("MUTATION", "the nested source file was never changed");
}
if (!afterBytes.toString("utf8").includes("return 42;")) {
  fail("MUTATION", "answer() was not updated to return 42");
}
if (git(repoRoot, ["rev-parse", "HEAD"]).trim() !== headBefore) {
  fail("GIT", "bounded session must not create a commit");
}

const summary = {
  BOUNDED_SESSION_SMOKE: "PASSED",
  network: "NONE",
  credentials: "NONE",
  gitWritesByPathCode: "NONE",
  autonomyMode: "bounded",
  authoritiesAsked: asked,
  projectRoot: repoRoot,
  storeRoot,
  editPath: EDIT_PATH,
  modelInvocations: adapterState.invocations,
  checkpointId: sessionResult.checkpointId,
  outcome: sessionResult.outcome,
  temporaryRootsRemoved: !KEEP,
};

await cleanup();
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
