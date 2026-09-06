/**
 * Phase 5B parser / schema / limit proofs (B02, B03, B12 partial).
 */

import { afterEach, describe, expect, it } from "vitest";

import { parseReasoningProposalJson } from "../../src/reasoning/parse.js";
import {
  MAX_PROPOSAL_JSON_UTF8_BYTES,
} from "../../src/reasoning/bounds.js";
import { cleanupReasoningFixtures, proposalJson } from "./helpers.js";

afterEach(async () => {
  await cleanupReasoningFixtures();
});

function baseProposal(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: 1,
    proposalId: "p1",
    requestedOutcome: "observe hello",
    claims: [
      {
        claimId: "c1",
        kind: "EXISTS",
        statement: "hello.ts exists",
        proposedSubject: {
          kind: "REPOSITORY_RELATIVE_PATH",
          relativePath: "src/hello.ts",
        },
        proposedCitations: [],
      },
    ],
    hypotheses: [],
    ...overrides,
  };
}

describe("reasoning proposal parser", () => {
  it("B02: valid Phase 5A JSON parses without silently changing fields", () => {
    const json = proposalJson(
      baseProposal({
        hypotheses: [
          {
            hypothesisId: "h1",
            epistemic: "INFERRED",
            statement: "maybe used",
            supportingClaimIds: ["c1"],
          },
          {
            hypothesisId: "h2",
            epistemic: "UNVERIFIED",
            statement: "unknown",
          },
        ],
      }),
    );
    const parsed = parseReasoningProposalJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.schemaVersion).toBe(1);
    expect(parsed.value.proposalId).toBe("p1");
    expect(parsed.value.claims).toHaveLength(1);
    expect(parsed.value.claims[0]?.kind).toBe("EXISTS");
    expect(parsed.value.hypotheses).toHaveLength(2);
    expect(parsed.value.hypotheses[0]?.epistemic).toBe("INFERRED");
    expect(parsed.value.hypotheses[1]?.epistemic).toBe("UNVERIFIED");
  });

  it.each([
    ["non-string", 123 as unknown],
    ["invalid json", "{"],
    ["wrong top-level", "[1]"],
    ["wrong version", proposalJson(baseProposal({ schemaVersion: 2 }))],
    [
      "unknown field",
      proposalJson(baseProposal({ extra: true })),
    ],
    [
      "forbidden proto",
      '{"schemaVersion":1,"proposalId":"p1","requestedOutcome":"x","claims":[{"claimId":"c1","kind":"EXISTS","statement":"s","proposedSubject":{"kind":"REPOSITORY_RELATIVE_PATH","relativePath":"a.ts"},"proposedCitations":[]}],"hypotheses":[],"__proto__":{"x":1}}',
    ],
    [
      "authority field",
      proposalJson(baseProposal({ authorization: {} })),
    ],
  ])("B02: refuses malformed input (%s)", (_label, input) => {
    const parsed = parseReasoningProposalJson(input as never);
    expect(parsed.ok).toBe(false);
  });

  it("B03: size ceiling rejects before unbounded work", () => {
    const huge = "x".repeat(MAX_PROPOSAL_JSON_UTF8_BYTES + 1);
    const parsed = parseReasoningProposalJson(huge);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("LIMIT_EXCEEDED");
    }
  });

  it("B03: claim count ceiling rejects", () => {
    const claims = Array.from({ length: 33 }, (_, i) => ({
      claimId: `c${i}`,
      kind: "EXISTS",
      statement: "s",
      proposedSubject: {
        kind: "REPOSITORY_RELATIVE_PATH",
        relativePath: "a.ts",
      },
      proposedCitations: [],
    }));
    const parsed = parseReasoningProposalJson(
      proposalJson(baseProposal({ claims })),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("LIMIT_EXCEEDED");
    }
  });

  it("B12: duplicate claim IDs and dangling inference bases refuse", () => {
    const dup = parseReasoningProposalJson(
      proposalJson(
        baseProposal({
          claims: [
            {
              claimId: "c1",
              kind: "EXISTS",
              statement: "a",
              proposedSubject: {
                kind: "REPOSITORY_RELATIVE_PATH",
                relativePath: "a.ts",
              },
              proposedCitations: [],
            },
            {
              claimId: "c1",
              kind: "EXISTS",
              statement: "b",
              proposedSubject: {
                kind: "REPOSITORY_RELATIVE_PATH",
                relativePath: "b.ts",
              },
              proposedCitations: [],
            },
          ],
        }),
      ),
    );
    expect(dup.ok).toBe(false);
    if (!dup.ok) {
      expect(dup.error.code).toBe("DUPLICATE_CLAIM_ID");
    }

    const dangling = parseReasoningProposalJson(
      proposalJson(
        baseProposal({
          hypotheses: [
            {
              hypothesisId: "h1",
              epistemic: "INFERRED",
              statement: "x",
              supportingClaimIds: ["missing"],
            },
          ],
        }),
      ),
    );
    expect(dangling.ok).toBe(false);
    if (!dangling.ok) {
      expect(dangling.error.code).toBe("DANGLING_INFERENCE_BASIS");
    }
  });
});
