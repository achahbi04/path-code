/**
 * Shared helpers for Phase 5G General Engineering Session host tests.
 *
 * Every fixture here is a disposable Git repository under the system temp area
 * plus a recovery store root that is a sibling of it, never a descendant.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export const SEED_SOURCE = `export function add(a: number, b: number): number {
  return a + b;
}

export function answer(): number {
  return 0;
}
`;

export const FIXED_SOURCE = `export function add(a: number, b: number): number {
  return a + b;
}

export function answer(): number {
  return 42;
}
`;

export const TASK_TEXT = "Make answer() return 42 without changing the exported API.";

const tracked: string[] = [];

export function trackRoot(root: string): string {
  tracked.push(root);
  return root;
}

export function cleanupTrackedRoots(): void {
  while (tracked.length > 0) {
    const root = tracked.pop();
    if (root === undefined) continue;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}

export async function importHost(moduleName: string) {
  return import(
    pathToFileURL(join(CHECKOUT_ROOT, "scripts", "pathcode-cli", moduleName)).href
  );
}

export function writeFile(root: string, relativePath: string, content: string): void {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

export function git(root: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Path Code Test",
      GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Path Code Test",
      GIT_COMMITTER_EMAIL: "test@example.invalid",
    },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

export type Fixture = {
  readonly projectRoot: string;
  readonly storeRoot: string;
  readonly env: Record<string, string | undefined>;
};

/**
 * A disposable project: one editable source file, a typecheck stand-in, and an
 * npm test script with a pre-hook so lifecycle disclosure is exercised.
 */
export function provisionProject(options?: {
  git?: boolean;
  scripts?: Record<string, string>;
  withLocalTsc?: boolean;
  extraFiles?: Record<string, string>;
}): Fixture {
  const projectRoot = realpathSync(
    trackRoot(mkdtempSync(join(tmpdir(), "pathcode-5g-project-"))),
  );
  const storeRoot = realpathSync(
    trackRoot(mkdtempSync(join(tmpdir(), "pathcode-5g-state-"))),
  );

  writeFile(projectRoot, "src/answer.ts", SEED_SOURCE);
  writeFile(
    projectRoot,
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
  writeFile(
    projectRoot,
    "package.json",
    `${JSON.stringify(
      {
        name: "pathcode-5g-fixture",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: options?.scripts ?? {
          pretest: "node tools/pretest.mjs",
          test: "node tools/answer.test.mjs",
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFile(projectRoot, "tools/pretest.mjs", "process.stdout.write('pre\\n');\n");
  writeFile(
    projectRoot,
    "tools/answer.test.mjs",
    `import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/answer.ts", import.meta.url), "utf8");
if (!/return 42;/.test(source)) {
  process.exit(1);
}
`,
  );
  if (options?.withLocalTsc !== false) {
    // Stand-in for a project-local compiler: enough to prove discovery and the
    // execution path, and honest about being a stub.
    writeFile(
      projectRoot,
      "node_modules/typescript/lib/tsc.js",
      "process.stdout.write('stub tsc\\n');\n",
    );
  }
  for (const [relativePath, content] of Object.entries(options?.extraFiles ?? {})) {
    writeFile(projectRoot, relativePath, content);
  }

  if (options?.git !== false) {
    git(projectRoot, ["init", "--quiet", "--initial-branch=main"]);
    git(projectRoot, ["add", "-A"]);
    git(projectRoot, ["commit", "--quiet", "-m", "seed"]);
  }

  return {
    projectRoot,
    storeRoot,
    env: { ...process.env, PATHCODE_STATE_DIR: storeRoot },
  };
}

export type AdapterState = {
  invocations: Array<{
    purpose: string;
    profile: string;
    maxOutputTokens: number;
    blocks: Array<{ blockId: string; text: string }>;
  }>;
  scopePlanText: string | null;
  /** Repository-relative path the scripted edit mutates (must be permitted). */
  editableRelativePath: string;
  afterText: string;
  beforeEditHook: null | (() => void | Promise<void>);
  /** Lets a test emit an edit envelope the host should refuse. */
  editEnvelopeTransform:
    | null
    | ((envelope: Record<string, any>) => Record<string, any>);
};

export function newAdapterState(overrides?: Partial<AdapterState>): AdapterState {
  return {
    invocations: [],
    scopePlanText: null,
    editableRelativePath: "src/answer.ts",
    afterText: FIXED_SOURCE,
    beforeEditHook: null,
    editEnvelopeTransform: null,
    ...overrides,
  };
}

/**
 * A scripted adapter behind the REAL Engineering Brain: normalization, profile
 * admission and budgets are genuinely exercised, but nothing leaves the machine.
 */
export function scriptedAdapter(state: AdapterState) {
  return {
    descriptor: {
      providerId: "general-session-test",
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
    async invoke(packet: any, control: { invocationId: string }) {
      state.invocations.push({
        purpose: packet.purpose,
        profile: packet.responseProfile.kind,
        maxOutputTokens: packet.maxOutputTokens,
        blocks: packet.context.blocks.map((b: any) => ({
          blockId: b.blockId,
          text: b.text,
        })),
      });
      const usage = { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 };

      if (packet.responseProfile.kind === "ENGINEERING_SCOPE_PLAN_JSON") {
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text:
            state.scopePlanText ??
            JSON.stringify({
              schemaVersion: 1,
              taskSummary: "Change answer() to return 42.",
              editableTargets: [
                {
                  relativePath: state.editableRelativePath,
                  changeKind: "REPLACE_TEXT",
                  reason: "answer() is defined here",
                },
              ],
              contextPaths: [],
              validationCandidateIds: [],
              assumptions: [],
              limitations: ["No file body has been read yet"],
            }),
          usage,
        };
      }

      if (packet.responseProfile.kind === "ENGINEERING_EDIT_PROPOSAL_JSON") {
        if (state.beforeEditHook !== null) {
          await state.beforeEditHook();
        }
        const editPath = state.editableRelativePath;
        const targets = JSON.parse(
          packet.context.blocks.find((b: any) => b.blockId === "permitted-targets")
            .text,
        ).permittedTargets;
        const target = targets.find((t: any) => t.relativePath === editPath);
        const contentHandle = packet.context.references.find(
          (r: any) => r.evidenceKind === "CONTENT" && r.relativePath === editPath,
        ).handle;
        const envelope: Record<string, any> = {
          schemaVersion: 1,
          proposalId: "test-edit-1",
          reasoningProposalJson: JSON.stringify({
            schemaVersion: 1,
            proposalId: "pre-edit",
            requestedOutcome: "edit",
            claims: [
              {
                claimId: "source-1",
                kind: "CONTENT",
                statement: "current text observed",
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
              afterText: state.afterText,
            },
          ],
        };
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: JSON.stringify(
            state.editEnvelopeTransform === null
              ? envelope
              : state.editEnvelopeTransform(envelope),
          ),
          usage,
        };
      }

      const requirements = JSON.parse(
        packet.context.blocks.find(
          (b: any) => b.blockId === "post-edit-execution-claim-requirements",
        ).text,
      );
      return {
        kind: "COMPLETE",
        invocationId: control.invocationId,
        text: JSON.stringify({
          schemaVersion: 1,
          proposalId: "post-edit",
          requestedOutcome: "evidence",
          claims: requirements.requiredClaims.map((required: any) =>
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

let ownersPromise: Promise<any> | null = null;

/** The built owners (dist/). Loaded once per test process, as the host does. */
export async function loadOwners(): Promise<any> {
  if (ownersPromise === null) {
    const { loadTrialOwners } = await importHost("owners.mjs");
    ownersPromise = loadTrialOwners(CHECKOUT_ROOT).then((result: any) => {
      if (!result.ok) {
        throw new Error(
          `owners unavailable (${result.code}): ${result.message} — run npm run build`,
        );
      }
      return result;
    });
  }
  return ownersPromise;
}

/**
 * An answer is either the literal line a human would type, or a function so a
 * test can change the world at that exact moment in the flow.
 */
export type PromptScript = Record<
  string,
  string | null | (() => string | null | Promise<string | null>)
>;

export function scriptedPrompt(answers: PromptScript) {
  const chunks: string[] = [];
  const asked: string[] = [];
  return {
    chunks,
    asked,
    output: () => chunks.join(""),
    prompt: {
      write: (text: string) => chunks.push(text),
      writeErr: (text: string) => chunks.push(text),
      askLine: async (promptId: string) => {
        asked.push(promptId);
        if (!Object.prototype.hasOwnProperty.call(answers, promptId)) {
          return null;
        }
        const answer = answers[promptId];
        return typeof answer === "function" ? await answer() : answer;
      },
      askHiddenCredential: async () => ({ ok: false as const, code: "NO_TTY" }),
      isStopped: () => false,
      close: () => undefined,
    },
  };
}

export const CHALLENGES = {
  startChallenge: "t-start",
  scopeChallenge: "t-scope",
  applyChallenge: "t-apply",
  checkChallenge: "t-check",
  restoreChallenge: "t-restore",
  runChallenge: "t-run",
} as const;

export function fullApprovalScript(): PromptScript {
  return {
    "start-consent": `START ${CHALLENGES.startChallenge}`,
    scope: `SCOPE ${CHALLENGES.scopeChallenge}`,
    apply: `APPLY ${CHALLENGES.applyChallenge}`,
    check: `CHECK ${CHALLENGES.checkChallenge}`,
    restore: `RESTORE ${CHALLENGES.restoreChallenge}`,
  };
}

/** Exactly one RUN authority — no SCOPE / APPLY / CHECK prompts. */
export function boundedApprovalScript(): PromptScript {
  return {
    "run-consent": `RUN ${CHALLENGES.runChallenge}`,
  };
}

export type SessionRun = {
  readonly result: any;
  readonly adapter: AdapterState;
  readonly transcript: string;
  readonly asked: readonly string[];
};

/**
 * Drive one full General Engineering Session against a fixture, with the real
 * brain in front of a scripted adapter. Nothing here reaches the network.
 */
export async function runSession(
  fixture: Fixture,
  options?: {
    answers?: PromptScript;
    adapterState?: AdapterState;
    taskText?: string;
    sessionOptions?: Record<string, unknown>;
  },
): Promise<SessionRun> {
  const owners = await loadOwners();
  const adapter = options?.adapterState ?? newAdapterState();
  const brain = owners.createEngineeringBrain(scriptedAdapter(adapter), {
    maxDispatches: 3,
    maxTimeoutMs: 120_000,
    maxOutputTokens: 8_192,
  });
  if (!brain.ok) throw new Error(`brain configuration failed: ${brain.error.code}`);

  const scripted = scriptedPrompt(options?.answers ?? fullApprovalScript());
  const { runGeneralEngineeringSession } = await importHost("general-session.mjs");
  try {
    const result = await runGeneralEngineeringSession(scripted.prompt, {
      taskText: options?.taskText ?? TASK_TEXT,
      projectRoot: fixture.projectRoot,
      checkoutRoot: CHECKOUT_ROOT,
      owners,
      brain: brain.value,
      allowNonTty: true,
      env: fixture.env,
      ...CHALLENGES,
      ...(options?.sessionOptions ?? {}),
    });
    return {
      result,
      adapter,
      transcript: scripted.output(),
      asked: scripted.asked,
    };
  } finally {
    brain.value.dispose();
  }
}
