/**
 * Phase 5F-H3 — post-edit validation admission + check-order proofs (H3-A..L).
 * No network. No credentials. No live OpenAI.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetAuthorizationRegistryForTests } from "../../src/editing/internal/registry.js";
import { resetEngineeringRunRegistryForTests } from "../../src/engineering-run/internal/registry.js";
import { resetLocalProcessRegistryForTests } from "../../src/execution/internal/registry.js";
import { resetExecutionEvidenceRegistryForTests } from "../../src/reasoning/gate2/registry.js";
import { resetRunEvidenceRegistryForTests } from "../../src/run-evidence/internal/registry.js";
import { resetValidationRegistryForTests } from "../../src/validation/internal/registry.js";
import {
  CHECKOUT_ROOT,
  FIXED_CALCULATOR_SOURCE,
  TEST_CREDENTIAL,
  TEST_MODEL,
  TYPECHECK_FAIL_CALCULATOR_SOURCE,
  cleanupTrackedTrialRoots,
  completedResponsesBody,
  getRecordedFetchCalls,
  importHost,
  installFetch,
  nativeEditEnvelopeJson,
  proposalJson,
  queueFetchResponse,
  queueSuccessfulTrialFetches,
  trackTrialRoot,
  uninstallFetch,
} from "./helpers.js";

afterEach(async () => {
  uninstallFetch();
  resetAuthorizationRegistryForTests();
  resetExecutionEvidenceRegistryForTests();
  resetEngineeringRunRegistryForTests();
  resetRunEvidenceRegistryForTests();
  resetValidationRegistryForTests();
  resetLocalProcessRegistryForTests();
  await cleanupTrackedTrialRoots();
});

beforeEach(() => {
  installFetch();
});

function extractFromBody(bodyText: string) {
  let targetId: string | null = null;
  let contentHandle: string | null = null;
  try {
    const body = JSON.parse(bodyText) as {
      input?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const text = body.input?.[0]?.content?.[0]?.text;
    if (typeof text === "string") {
      const payload = JSON.parse(text) as {
        context?: {
          references?: Array<{
            handle?: string;
            evidenceKind?: string;
            relativePath?: string;
          }>;
          blocks?: Array<{ blockId?: string; text?: string }>;
        };
      };
      const ref = payload.context?.references?.find(
        (r) =>
          r.evidenceKind === "CONTENT" && r.relativePath === "src/calculator.ts",
      );
      if (ref?.handle) contentHandle = ref.handle;
      const block = payload.context?.blocks?.find(
        (b) => b.blockId === "permitted-targets",
      );
      if (block?.text) {
        const parsed = JSON.parse(block.text) as {
          permittedTargets?: Array<{ targetId?: string }>;
        };
        const tid = parsed.permittedTargets?.[0]?.targetId;
        if (typeof tid === "string") targetId = tid;
      }
    }
  } catch {
    // ignore
  }
  return { targetId, contentHandle };
}

function queueEditThenPostEditClaims(
  afterText: string,
  postEditClaims: ReadonlyArray<Record<string, unknown>>,
): void {
  queueFetchResponse(async (call) => {
    const bodyText = call.init?.body ? String(call.init.body) : "";
    const { targetId, contentHandle } = extractFromBody(bodyText);
    const reasoning = {
      schemaVersion: 1,
      proposalId: "pre-edit",
      requestedOutcome: "evidence",
      claims: [
        {
          claimId: "source-1",
          kind: "CONTENT",
          statement: "source",
          proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
          proposedCitations: [],
        },
      ],
      hypotheses: [],
    };
    return new Response(
      completedResponsesBody(
        nativeEditEnvelopeJson({
          reasoningProposal: reasoning,
          changes: [
            {
              changeId: "e1",
              kind: "REPLACE_TEXT",
              targetId: targetId ?? "missing",
              supportingClaimIds: ["source-1"],
              afterText,
            },
          ],
        }),
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  queueFetchResponse(async (call) => {
    const bodyText = call.init?.body ? String(call.init.body) : "";
    const { contentHandle } = extractFromBody(bodyText);
    const claims = postEditClaims.map((claim) => {
      const subject = claim.proposedSubject as
        | { kind?: string; id?: string }
        | undefined;
      if (subject?.kind === "EVIDENCE_ID" && subject.id === undefined) {
        return {
          ...claim,
          proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
        };
      }
      if (subject?.id === "AUTO") {
        return {
          ...claim,
          proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
        };
      }
      return {
        ...claim,
        proposedSubject: claim.proposedSubject ?? {
          kind: "EVIDENCE_ID",
          id: contentHandle,
        },
      };
    });
    return new Response(
      completedResponsesBody(
        proposalJson({
          schemaVersion: 1,
          proposalId: "post-edit",
          requestedOutcome: "evidence",
          claims,
          hypotheses: [],
        }),
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

async function runFullTrial(opts?: {
  afterText?: string;
  postEditClaims?: ReadonlyArray<Record<string, unknown>>;
  captureOutput?: boolean;
}) {
  const trial = await importHost("trial.mjs");
  if (opts?.postEditClaims) {
    queueEditThenPostEditClaims(
      opts.afterText ?? FIXED_CALCULATOR_SOURCE,
      opts.postEditClaims,
    );
  } else {
    queueSuccessfulTrialFetches({
      afterText: opts?.afterText ?? FIXED_CALCULATOR_SOURCE,
    });
  }
  const s = "h3start";
  const a = "h3apply";
  const c = "h3check";
  let i = 0;
  const answers = [`START ${s}`, `APPLY ${a}`, `CHECK ${c}`];
  const out: string[] = [];
  const result = await trial.runMultiply01Trial(
    {
      write: (t: string) => {
        if (opts?.captureOutput) out.push(t);
      },
      writeErr: (t: string) => {
        if (opts?.captureOutput) out.push(t);
      },
      askLine: async () => answers[i++] ?? null,
      askHiddenCredential: async () => ({ ok: false, code: "X" }),
      isStopped: () => false,
      close: () => undefined,
    },
    {
      streams: { stdin: { isTTY: true }, stdout: { isTTY: true } },
      allowNonTty: true,
      modelId: TEST_MODEL,
      credential: TEST_CREDENTIAL,
      checkoutRoot: CHECKOUT_ROOT,
      startChallenge: s,
      applyChallenge: a,
      checkChallenge: c,
    },
  );
  trackTrialRoot(result.workspaceRoot);
  return { result, out: out.join("") };
}

function cycleOf(result: {
  validationOutcome?: {
    artifacts?: {
      cycle?: {
        record?: {
          terminalState?: string;
          originCode?: string;
          validationDisposition?: string;
          attempts?: Array<{ gate1Outcome?: { kind?: string } }>;
        };
        artifacts?: {
          engineeringRun?: {
            engineeringRunId?: string;
            validationResult?: {
              checkResults?: Array<{
                checkId?: string;
                kind?: string;
                verdict?: string;
                processResult?: { exitCode?: number } | null;
              }>;
            };
            workspaceRoot?: string;
          } | null;
          assessment?: { engineeringRunId?: string } | null;
        };
      };
    };
  };
}) {
  return result.validationOutcome?.artifacts?.cycle;
}

const LIVE_EQUIVALENT_CLAIMS = [
  {
    claimId: "defines-multiply-01",
    kind: "DEFINES",
    statement: "multiply is defined",
    symbolName: "multiply",
    proposedSubject: { kind: "EVIDENCE_ID", id: "AUTO" },
    proposedCitations: [],
  },
  {
    claimId: "behaves-multiply-01",
    kind: "BEHAVES",
    statement: "multiply returns the product",
    scenarioDescription: "product of numeric arguments",
    proposedSubject: { kind: "EVIDENCE_ID", id: "AUTO" },
    proposedCitations: [],
  },
] as const;

describe("Phase 5F-H3 validation admission correction", () => {
  it(
    "H3-A/C/D/E/F/G/H: live-equivalent DEFINES+BEHAVES reaches strong success with ordered checks",
    async () => {
      const { result } = await runFullTrial({
        postEditClaims: [...LIVE_EQUIVALENT_CLAIMS],
      });
      expect(result.exitCode).toBe(0);
      expect(result.outcome).toBe(
        "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
      );
      expect(
        readFileSync(join(result.workspaceRoot!, "src/calculator.ts"), "utf8"),
      ).toBe(FIXED_CALCULATOR_SOURCE);

      const cycle = cycleOf(result);
      const record = cycle?.record;
      expect(record?.attempts?.some((a) => a.gate1Outcome?.kind === "BOUND")).toBe(
        true,
      );
      expect(record?.terminalState).toBe("SUBSTANTIATED");
      expect(record?.originCode).not.toBe("GATE2_PREPARE_FAILED");
      expect(record?.validationDisposition).toBe("SETTLED");

      const eng = cycle?.artifacts?.engineeringRun;
      expect(eng).toBeTruthy();
      const checks = eng?.validationResult?.checkResults ?? [];
      expect(checks.length).toBe(2);
      expect(checks[0]?.kind).toBe("TYPECHECK");
      expect(checks[0]?.verdict).toBe("PASS");
      expect(checks[0]?.processResult?.exitCode).toBe(0);
      expect(checks[1]?.kind).toBe("TARGETED_TEST");
      expect(checks[1]?.verdict).toBe("PASS");
      expect(checks[1]?.processResult?.exitCode).toBe(0);

      expect(
        existsSync(join(result.workspaceRoot!, ".trial-build/calculator.js")),
      ).toBe(true);

      const assessment = cycle?.artifacts?.assessment;
      expect(assessment?.engineeringRunId).toBe(eng?.engineeringRunId);
    },
    60_000,
  );

  it(
    "H3-B/I: unassigned extra EXECUTION claim and missing DEFINES still fail closed before checks",
    async () => {
      // H3-B: live-shaped DEFINES+BEHAVES plus unassigned extra BEHAVES → prepare fails
      const extra = await runFullTrial({
        postEditClaims: [
          ...LIVE_EQUIVALENT_CLAIMS,
          {
            claimId: "behaves-extra-unassigned",
            kind: "BEHAVES",
            statement: "extra",
            scenarioDescription: "extra scenario",
            proposedSubject: { kind: "EVIDENCE_ID", id: "AUTO" },
            proposedCitations: [],
          },
        ],
        captureOutput: true,
      });
      expect(extra.result.exitCode).not.toBe(0);
      expect(extra.result.outcome).toBe(
        "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED",
      );
      const extraCycle = cycleOf(extra.result);
      expect(extraCycle?.record?.originCode).toBe("GATE2_PREPARE_FAILED");
      expect(extraCycle?.record?.validationDisposition).toBe(
        "NOT_DISPATCHED_FAILED",
      );
      expect(extraCycle?.artifacts?.engineeringRun).toBeNull();
      expect(extraCycle?.record?.attempts?.some((a) => a.gate1Outcome?.kind === "BOUND")).toBe(
        true,
      );
      expect(extra.out).toContain("Validation stopped before execution");
      expect(extra.out).toContain("PREPARING_EXECUTION_EVIDENCE");
      expect(extra.out).toContain("GATE2_PREPARE_FAILED");
      expect(extra.out).toMatch(/Typecheck:\s+not run/);
      expect(extra.out).toMatch(/Regression:\s+not run/);

      // H3-I: BEHAVES-only (missing required DEFINES) fails closed
      uninstallFetch();
      installFetch();
      const missing = await runFullTrial({
        postEditClaims: [LIVE_EQUIVALENT_CLAIMS[1]!],
      });
      expect(missing.result.exitCode).not.toBe(0);
      expect(cycleOf(missing.result)?.record?.originCode).toBe(
        "GATE2_PREPARE_FAILED",
      );
      expect(cycleOf(missing.result)?.artifacts?.engineeringRun).toBeNull();
    },
    90_000,
  );

  it(
    "H3-J: TYPECHECK FAIL blocks TARGETED_TEST; terminal distinguishes honestly",
    async () => {
      const { result, out } = await runFullTrial({
        afterText: TYPECHECK_FAIL_CALCULATOR_SOURCE,
        postEditClaims: [...LIVE_EQUIVALENT_CLAIMS],
        captureOutput: true,
      });
      expect(result.exitCode).not.toBe(0);
      const checks =
        cycleOf(result)?.artifacts?.engineeringRun?.validationResult
          ?.checkResults ?? [];
      expect(checks[0]?.kind).toBe("TYPECHECK");
      expect(checks[0]?.verdict).toBe("FAIL");
      expect(checks[1]?.kind).toBe("TARGETED_TEST");
      expect(checks[1]?.verdict).toBe("NOT_ATTEMPTED");
      expect(checks[1]?.processResult).toBeNull();
      expect(out).toMatch(/Typecheck:\s+FAIL/);
      expect(out).toContain("not run (blocked by prior TYPECHECK)");
    },
    60_000,
  );

  it(
    "H3-K/L: host authorizes validation; Gate 2 uses authentic EngineeringRun only",
    async () => {
      const { result } = await runFullTrial({
        postEditClaims: [...LIVE_EQUIVALENT_CLAIMS],
      });
      expect(result.exitCode).toBe(0);
      const eng = cycleOf(result)?.artifacts?.engineeringRun;
      expect(eng).toBeTruthy();
      expect(eng?.workspaceRoot ?? result.workspaceRoot).toBe(
        result.workspaceRoot,
      );
      // Manual retained-workspace path must not appear as trusted evidence input.
      const calls = getRecordedFetchCalls();
      for (const call of calls) {
        expect(call.bodyText ?? "").not.toContain("pathcode-trial-01-dZyAuQ");
        expect(call.bodyText ?? "").not.toContain("MUTATION_APPLIED_VALIDATION");
      }
      // Brain/model path does not mint ValidationAuthorization — host CHECK still required
      // (proven by three consent answers and settled disposition only after CHECK).
      expect(cycleOf(result)?.record?.validationDisposition).toBe("SETTLED");
    },
    60_000,
  );

  it(
    "H3 packet: post-edit Brain request carries provider-neutral claim requirements",
    async () => {
      await runFullTrial({ postEditClaims: [...LIVE_EQUIVALENT_CLAIMS] });
      const calls = getRecordedFetchCalls();
      expect(calls.length).toBe(2);
      const postBody = calls[1]?.bodyText ?? "";
      expect(postBody).toContain("POST_EDIT_EXECUTION_CLAIM_REQUIREMENTS");
      expect(postBody).toContain("defines-multiply-01");
      expect(postBody).toContain("behaves-multiply-01");
      expect(postBody).toContain("TYPECHECK");
      expect(postBody).toContain("TARGETED_TEST");
    },
    60_000,
  );
});
