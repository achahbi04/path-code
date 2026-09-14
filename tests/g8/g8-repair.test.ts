/**
 * G8 focused proofs — same-session repair prompt + attempt bounds.
 */

import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const REPAIR = join(CHECKOUT_ROOT, "scripts/pathcode-cli/ag8/repair.mjs");

async function load(path: string) {
  return import(`${pathToFileURL(path).href}?g8=${randomUUID()}`);
}

describe("G8 repair — buildValidationRepairPrompt", () => {
  it("includes failed check id, category, command, and bounded stderr", async () => {
    const { buildValidationRepairPrompt, AG8_REPAIR_STDERR_BOUND } =
      await load(REPAIR);
    const longStderr = `noise\n${"x".repeat(AG8_REPAIR_STDERR_BOUND + 500)}\nFAIL: expected true`;
    const text = buildValidationRepairPrompt({
      classification: "FAILED",
      reason: "Configured final checks failed.",
      checks: [
        {
          id: "unit-tests",
          kind: "TARGETED_TEST",
          command: "npm test -- --run",
          ok: false,
          exitCode: 1,
          stderrTail: longStderr,
        },
        {
          id: "typecheck",
          kind: "TYPECHECK",
          command: "tsc -p .",
          ok: true,
          exitCode: 0,
          stderrTail: "",
        },
      ],
    });

    expect(text).toContain("Failed check id: unit-tests");
    expect(text).toContain("Category: TARGETED_TEST");
    expect(text).toContain("Command: npm test -- --run");
    expect(text).toContain("FAIL: expected true");
    expect(text).not.toContain("Failed check id: typecheck");
    // Bound applied from the end of stderr.
    expect(text.length).toBeLessThan(longStderr.length + 2_000);
    const stderrSection = text.split("Stderr (bounded):")[1] || "";
    expect(stderrSection.length).toBeLessThanOrEqual(
      AG8_REPAIR_STDERR_BOUND + 200,
    );
  });

  it("appends specialist advisory without branding when provided", async () => {
    const { buildValidationRepairPrompt } = await load(REPAIR);
    const text = buildValidationRepairPrompt(
      {
        classification: "FAILED",
        checks: [
          {
            id: "tsc",
            kind: "TYPECHECK",
            command: "tsc -p .",
            ok: false,
            stderrTail: "error TS2304: Cannot find name 'Foo'",
          },
        ],
      },
      { advisoryText: "Check whether Foo is exported from src/types.ts" },
    );
    expect(text).toContain("Fallback specialist notes:");
    expect(text).toContain("Check whether Foo is exported from src/types.ts");
    expect(text).not.toMatch(/Copilot|Antigravity/i);
  });
});

describe("G8 repair — shouldAttemptSameSessionRepair", () => {
  it("allows FAILED/PARTIALLY_VERIFIED within attempt and wall budget", async () => {
    const { shouldAttemptSameSessionRepair, AG8_MAX_REPAIR_ATTEMPTS } =
      await load(REPAIR);
    expect(
      shouldAttemptSameSessionRepair({
        classification: "FAILED",
        attempts: 0,
        maxAttempts: AG8_MAX_REPAIR_ATTEMPTS,
        aborted: false,
        wallBudgetRemainingMs: 120_000,
      }),
    ).toBe(true);
    expect(
      shouldAttemptSameSessionRepair({
        classification: "PARTIALLY_VERIFIED",
        attempts: 1,
        maxAttempts: 2,
        aborted: false,
        wallBudgetRemainingMs: 60_000,
      }),
    ).toBe(true);
  });

  it("stops when attempts exhausted, aborted, or wall budget too low", async () => {
    const { shouldAttemptSameSessionRepair } = await load(REPAIR);
    expect(
      shouldAttemptSameSessionRepair({
        classification: "FAILED",
        attempts: 2,
        maxAttempts: 2,
        aborted: false,
      }),
    ).toBe(false);
    expect(
      shouldAttemptSameSessionRepair({
        classification: "FAILED",
        attempts: 0,
        aborted: true,
      }),
    ).toBe(false);
    expect(
      shouldAttemptSameSessionRepair({
        classification: "FAILED",
        attempts: 0,
        wallBudgetRemainingMs: 10_000,
      }),
    ).toBe(false);
    expect(
      shouldAttemptSameSessionRepair({
        classification: "VERIFIED",
        attempts: 0,
      }),
    ).toBe(false);
  });

  it("allows repair when hasFailingChecks even if classification odd", async () => {
    const { shouldAttemptSameSessionRepair } = await load(REPAIR);
    expect(
      shouldAttemptSameSessionRepair({
        classification: "NOT_VERIFIED",
        attempts: 0,
        hasFailingChecks: true,
        wallBudgetRemainingMs: 90_000,
      }),
    ).toBe(true);
  });
});
