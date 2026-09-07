/**
 * Phase 5F positive integration through real adapter/Brain/mutation/conductor
 * with recording fetch. No live network.
 */

import { readFileSync } from "node:fs";
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
  cleanupTrackedTrialRoots,
  getRecordedFetchCalls,
  importHost,
  installFetch,
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

describe("Trial 1 owner composition integration", () => {
  it(
    "T08-T25: mocked provider fixes source through Gate 2; declined paths; env proof",
    async () => {
      const trial = await importHost("trial.mjs");
      const store = await importHost("fixture-store.mjs");

      // --- Positive path ---
      queueSuccessfulTrialFetches({ afterText: FIXED_CALCULATOR_SOURCE });

      const startChallenge = "aa11bb";
      const applyChallenge = "cc22dd";
      const checkChallenge = "ee33ff";
      const answers = [
        `START ${startChallenge}`,
        `APPLY ${applyChallenge}`,
        `CHECK ${checkChallenge}`,
      ];
      let ai = 0;
      const out: string[] = [];
      const prompt = {
        write: (t: string) => {
          out.push(t);
        },
        writeErr: (t: string) => {
          out.push(t);
        },
        askLine: async () => answers[ai++] ?? null,
        askHiddenCredential: async () => ({ ok: false, code: "UNUSED" }),
        isStopped: () => false,
        close: () => undefined,
      };

      const positive = await trial.runMultiply01Trial(prompt, {
        streams: { stdin: { isTTY: true }, stdout: { isTTY: true } },
        allowNonTty: true,
        modelId: TEST_MODEL,
        credential: TEST_CREDENTIAL,
        checkoutRoot: CHECKOUT_ROOT,
        startChallenge,
        applyChallenge,
        checkChallenge,
      });
      trackTrialRoot(positive.workspaceRoot);

      expect(positive.exitCode).toBe(0);
      expect(positive.outcome).toBe(
        "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
      );
      expect(readFileSync(join(positive.workspaceRoot!, "src/calculator.ts"), "utf8")).toBe(
        FIXED_CALCULATOR_SOURCE,
      );

      const calls = getRecordedFetchCalls();
      expect(calls.length).toBe(2);
      for (const call of calls) {
        expect(call.bodyText ?? "").not.toContain(TEST_CREDENTIAL);
        expect(call.bodyText ?? "").not.toContain(CHECKOUT_ROOT);
        expect(call.bodyText ?? "").toContain("calculator");
      }

      // Actual prepared child env excludes seeded secrets
      expect(positive.childEnv?.OPENAI_API_KEY).toBeUndefined();
      expect(positive.childEnv?.NODE_OPTIONS).toBeUndefined();
      for (const snap of positive.preparedEnvSnapshots ?? []) {
        expect(snap.OPENAI_API_KEY).toBeUndefined();
        expect(snap.NODE_OPTIONS).toBeUndefined();
      }

      // --- Declined edit: zero mutation ---
      uninstallFetch();
      installFetch();
      queueSuccessfulTrialFetches({ afterText: FIXED_CALCULATOR_SOURCE });
      const s2 = "s2chall";
      const a2 = "a2chall";
      let d2 = 0;
      const answers2 = [`START ${s2}`, "nope"];
      const prompt2 = {
        write: () => undefined,
        writeErr: () => undefined,
        askLine: async () => answers2[d2++] ?? null,
        askHiddenCredential: async () => ({ ok: false, code: "UNUSED" }),
        isStopped: () => false,
        close: () => undefined,
      };
      const declined = await trial.runMultiply01Trial(prompt2, {
        streams: { stdin: { isTTY: true }, stdout: { isTTY: true } },
        allowNonTty: true,
        modelId: TEST_MODEL,
        credential: TEST_CREDENTIAL,
        checkoutRoot: CHECKOUT_ROOT,
        startChallenge: s2,
        applyChallenge: a2,
      });
      trackTrialRoot(declined.workspaceRoot);
      expect(declined.outcome).toBe("EDIT_DECLINED");
      expect(
        readFileSync(join(declined.workspaceRoot!, "src/calculator.ts"), "utf8"),
      ).toBe(store.SEED_CALCULATOR_SOURCE);

      // --- Wrong edit stays on disk; validation not accepted ---
      uninstallFetch();
      installFetch();
      const defective = `export function multiply(a: number, b: number): number {
  return a - b;
}
`;
      queueSuccessfulTrialFetches({ afterText: defective });
      const s3 = "s3chall";
      const a3 = "a3chall";
      const c3 = "c3chall";
      let d3 = 0;
      const answers3 = [`START ${s3}`, `APPLY ${a3}`, `CHECK ${c3}`];
      const prompt3 = {
        write: () => undefined,
        writeErr: () => undefined,
        askLine: async () => answers3[d3++] ?? null,
        askHiddenCredential: async () => ({ ok: false, code: "UNUSED" }),
        isStopped: () => false,
        close: () => undefined,
      };
      const wrong = await trial.runMultiply01Trial(prompt3, {
        streams: { stdin: { isTTY: true }, stdout: { isTTY: true } },
        allowNonTty: true,
        modelId: TEST_MODEL,
        credential: TEST_CREDENTIAL,
        checkoutRoot: CHECKOUT_ROOT,
        startChallenge: s3,
        applyChallenge: a3,
        checkChallenge: c3,
      });
      trackTrialRoot(wrong.workspaceRoot);
      expect(wrong.exitCode).toBe(1);
      expect(wrong.outcome).not.toBe(
        "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED",
      );
      expect(
        readFileSync(join(wrong.workspaceRoot!, "src/calculator.ts"), "utf8"),
      ).toBe(defective);

      // --- Check declined after apply ---
      uninstallFetch();
      installFetch();
      queueSuccessfulTrialFetches({ afterText: FIXED_CALCULATOR_SOURCE });
      const s4 = "s4chall";
      const a4 = "a4chall";
      const c4 = "c4chall";
      let d4 = 0;
      const answers4 = [`START ${s4}`, `APPLY ${a4}`, "no"];
      const prompt4 = {
        write: () => undefined,
        writeErr: () => undefined,
        askLine: async () => answers4[d4++] ?? null,
        askHiddenCredential: async () => ({ ok: false, code: "UNUSED" }),
        isStopped: () => false,
        close: () => undefined,
      };
      const checkDeclined = await trial.runMultiply01Trial(prompt4, {
        streams: { stdin: { isTTY: true }, stdout: { isTTY: true } },
        allowNonTty: true,
        modelId: TEST_MODEL,
        credential: TEST_CREDENTIAL,
        checkoutRoot: CHECKOUT_ROOT,
        startChallenge: s4,
        applyChallenge: a4,
        checkChallenge: c4,
      });
      trackTrialRoot(checkDeclined.workspaceRoot);
      expect(checkDeclined.outcome).toBe("CHECK_DECLINED");
      expect(getRecordedFetchCalls().length).toBe(1); // no second model call
      expect(
        readFileSync(
          join(checkDeclined.workspaceRoot!, "src/calculator.ts"),
          "utf8",
        ),
      ).toBe(FIXED_CALCULATOR_SOURCE);
    },
    45_000,
  );

  it("T05: START decline prevents credential/fixture progression when not pre-provisioned", async () => {
    const trial = await importHost("trial.mjs");
    let credentialAsked = false;
    const result = await trial.runMultiply01Trial(
      {
        write: () => undefined,
        writeErr: () => undefined,
        askLine: async () => "no",
        askHiddenCredential: async () => {
          credentialAsked = true;
          return { ok: false, code: "SHOULD_NOT_RUN" };
        },
        isStopped: () => false,
        close: () => undefined,
      },
      {
        streams: { stdin: { isTTY: true }, stdout: { isTTY: true } },
        allowNonTty: true,
        modelId: TEST_MODEL,
        startChallenge: "zz99",
      },
    );
    expect(result.outcome).toBe("START_DECLINED");
    expect(credentialAsked).toBe(false);
    expect(getRecordedFetchCalls().length).toBe(0);
    expect(result.workspaceRoot).toBeUndefined();
  });

  it("T10 model conflict diagnosed", async () => {
    const trial = await importHost("trial.mjs");
    const resolved = trial.resolveModelSelection({
      modelFlag: "a",
      envModel: "b",
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.code).toBe("MODEL_CONFLICT");
  });
});
