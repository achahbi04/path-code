/**
 * Phase 5G — provider-neutral scope profile (§A).
 *
 * 5G-A  the brain admits PROPOSE_SCOPE + ENGINEERING_SCOPE_PLAN_JSON and
 *       refuses an unsupported schema version
 * 5G-B  the OpenAI adapter transports the scope profile: owned instructions,
 *       owned schema, structured output, no semantics of its own
 * 5G-C  the parser refuses malformed, unknown-field, accessor-bearing,
 *       duplicated and out-of-bounds plans instead of repairing them
 * 5G-D  admission binds every path to trusted inventory, refuses sensitive
 *       paths and refuses candidate ids the host never minted
 * 5G-E  scope semantics live in core, not in the adapter, and are not part of
 *       the package's public surface
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildOpenAIResponsesRequest } from "../../src/adapters/openai/request.js";
import {
  ENGINEERING_SCOPE_PLAN_NATIVE_SCHEMA,
  SCOPE_PROFILE_INSTRUCTIONS,
} from "../../src/adapters/openai/profiles.js";
import { createEngineeringBrain } from "../../src/brain/index.js";
import type { FrozenNormalizedAdapterPacket } from "../../src/brain/types.js";
import {
  MAX_SCOPE_EDITABLE_TARGETS,
  admitScopePlan,
  classifyScopePathSensitivity,
  parseEngineeringScopePlan,
} from "../../src/scope/index.js";
import { CHECKOUT_ROOT } from "./helpers.js";

const VALID_PLAN = {
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
  validationCandidateIds: ["npm-test"],
  assumptions: [],
  limitations: [],
};

function planText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...VALID_PLAN, ...overrides });
}

/** A minimal adapter that records the packet and returns a fixed plan. */
function recordingAdapter(state: { packets: FrozenNormalizedAdapterPacket[] }) {
  return {
    descriptor: {
      providerId: "scope-contract-test",
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
        maxOutputTokens: 4096,
      },
    },
    async invoke(packet: FrozenNormalizedAdapterPacket, control: { invocationId: string }) {
      state.packets.push(packet);
      return {
        kind: "COMPLETE" as const,
        invocationId: control.invocationId,
        text: planText(),
        usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
      };
    },
  };
}

const scopeRequest = {
  correlationId: "scope-contract",
  purpose: "PROPOSE_SCOPE" as const,
  taskText: "Make answer() return 42.",
  context: { references: [], blocks: [] },
  responseProfile: { kind: "ENGINEERING_SCOPE_PLAN_JSON" as const, schemaVersion: 1 },
  maxOutputTokens: 4096,
  timeoutMs: 30_000,
};

describe("5G-A: the brain owns the scope purpose and profile", () => {
  it("5G-A: normalizes PROPOSE_SCOPE with ENGINEERING_SCOPE_PLAN_JSON", async () => {
    const state = { packets: [] as FrozenNormalizedAdapterPacket[] };
    const brain = createEngineeringBrain(recordingAdapter(state) as never, {
      maxDispatches: 2,
    });
    expect(brain.ok).toBe(true);
    if (!brain.ok) return;

    const invoked = await brain.value.invoke(scopeRequest as never);
    expect(invoked.ok).toBe(true);
    if (!invoked.ok) return;

    expect(state.packets).toHaveLength(1);
    expect(state.packets[0]!.purpose).toBe("PROPOSE_SCOPE");
    expect(state.packets[0]!.responseProfile).toEqual({
      kind: "ENGINEERING_SCOPE_PLAN_JSON",
      schemaVersion: 1,
    });
    expect(Object.isFrozen(state.packets[0]!)).toBe(true);
    expect(invoked.value.response.text).toBe(planText());
    brain.value.dispose();
  });

  it("5G-A: refuses an unsupported scope schema version without dispatching", async () => {
    const state = { packets: [] as FrozenNormalizedAdapterPacket[] };
    const brain = createEngineeringBrain(recordingAdapter(state) as never, {
      maxDispatches: 2,
    });
    expect(brain.ok).toBe(true);
    if (!brain.ok) return;

    const invoked = await brain.value.invoke({
      ...scopeRequest,
      responseProfile: { kind: "ENGINEERING_SCOPE_PLAN_JSON", schemaVersion: 2 },
    } as never);
    expect(invoked.ok).toBe(false);
    if (invoked.ok) return;
    expect(invoked.error.code).toBe("UNSUPPORTED_CAPABILITY");
    expect(state.packets).toHaveLength(0);
    brain.value.dispose();
  });
});

describe("5G-B: OpenAI transports the scope profile and nothing more", () => {
  it("5G-B: emits the owned schema, owned instructions and strict structured output", () => {
    const packet: FrozenNormalizedAdapterPacket = {
      invocationId: "inv-scope-1",
      correlationId: "corr-scope-1",
      purpose: "PROPOSE_SCOPE",
      taskText: "Make answer() return 42.",
      context: {
        references: [],
        blocks: [
          {
            blockId: "repository-inventory",
            role: "REFERENCE_MATERIAL",
            text: "file src/answer.ts (72 bytes)",
            referenceHandles: [],
          },
        ],
      },
      responseProfile: { kind: "ENGINEERING_SCOPE_PLAN_JSON", schemaVersion: 1 },
      maxOutputTokens: 4096,
      maxResponseUtf8Bytes: 65_536,
      preparedRequestUtf8Bytes: 512,
    } as FrozenNormalizedAdapterPacket;

    const built = buildOpenAIResponsesRequest(packet, {
      modelId: "gpt-test-fixture-model",
      maxOutputTokensCeiling: 8192,
      reasoningEffort: null,
    });
    expect("bodyObject" in built).toBe(true);
    if (!("bodyObject" in built)) return;

    expect(built.profileKind).toBe("ENGINEERING_SCOPE_PLAN_JSON");
    expect(built.bodyObject.instructions).toBe(SCOPE_PROFILE_INSTRUCTIONS);
    const format = (built.bodyObject.text as { format: Record<string, unknown> })
      .format;
    expect(format.type).toBe("json_schema");
    expect(format.strict).toBe(true);
    expect(format.schema).toBe(ENGINEERING_SCOPE_PLAN_NATIVE_SCHEMA);
    expect(built.bodyObject.store).toBe(false);
    expect(built.bodyObject.tools).toEqual([]);
    expect(built.bodyObject.tool_choice).toBe("none");
    // The purpose travels as data in the owned payload, never as a control field.
    expect(built.bodyUtf8).toContain("PROPOSE_SCOPE");
  });

  it("5G-B: refuses a scope packet whose output request exceeds the ceiling", () => {
    const built = buildOpenAIResponsesRequest(
      {
        invocationId: "inv-scope-2",
        correlationId: "corr-scope-2",
        purpose: "PROPOSE_SCOPE",
        taskText: "task",
        context: { references: [], blocks: [] },
        responseProfile: { kind: "ENGINEERING_SCOPE_PLAN_JSON", schemaVersion: 1 },
        maxOutputTokens: 99_999,
        maxResponseUtf8Bytes: 65_536,
        preparedRequestUtf8Bytes: 128,
      } as FrozenNormalizedAdapterPacket,
      {
        modelId: "gpt-test-fixture-model",
        maxOutputTokensCeiling: 8192,
        reasoningEffort: null,
      },
    );
    expect("code" in built && built.code).toBe("INVALID_OUTPUT_LIMIT");
  });
});

describe("5G-C: the scope plan parser refuses rather than repairs", () => {
  it("5G-C: accepts a well-formed plan and freezes it", () => {
    const parsed = parseEngineeringScopePlan(planText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.taskSummary).toBe(VALID_PLAN.taskSummary);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.editableTargets)).toBe(true);
    expect(Object.isFrozen(parsed.value.editableTargets[0])).toBe(true);
  });

  it("5G-C: refuses each malformed shape with a distinct code", () => {
    const cases: Array<[string, string]> = [
      ["not json at all", "SCOPE_PLAN_MALFORMED_JSON"],
      ["[]", "SCOPE_PLAN_NOT_OBJECT"],
      [planText({ schemaVersion: 2 }), "SCOPE_PLAN_UNSUPPORTED_VERSION"],
      [
        JSON.stringify({ ...VALID_PLAN, surprise: true }),
        "SCOPE_PLAN_UNKNOWN_FIELD",
      ],
      [
        JSON.stringify({
          ...VALID_PLAN,
          editableTargets: [
            { ...VALID_PLAN.editableTargets[0], extra: 1 },
          ],
        }),
        "SCOPE_PLAN_UNKNOWN_FIELD",
      ],
      [planText({ taskSummary: "" }), "SCOPE_PLAN_INVALID_FIELD"],
      [planText({ editableTargets: [] }), "SCOPE_NO_EDITABLE_TARGET"],
      [
        planText({
          editableTargets: [
            VALID_PLAN.editableTargets[0],
            VALID_PLAN.editableTargets[0],
          ],
        }),
        "SCOPE_PLAN_DUPLICATE_PATH",
      ],
      [
        planText({
          editableTargets: [
            { relativePath: "src/a.ts", changeKind: "DELETE", reason: "no" },
          ],
        }),
        "SCOPE_PLAN_INVALID_FIELD",
      ],
      [
        planText({ validationCandidateIds: ["NOT A CANDIDATE"] }),
        "SCOPE_PLAN_INVALID_FIELD",
      ],
      [
        planText({
          editableTargets: Array.from(
            { length: MAX_SCOPE_EDITABLE_TARGETS + 1 },
            (_unused, index) => ({
              relativePath: `src/f${index}.ts`,
              changeKind: "REPLACE_TEXT",
              reason: "r",
            }),
          ),
        }),
        "SCOPE_PLAN_BOUNDS_EXCEEDED",
      ],
    ];
    for (const [text, expectedCode] of cases) {
      const parsed = parseEngineeringScopePlan(text);
      expect(parsed.ok, `expected refusal for ${text.slice(0, 60)}`).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.error.code).toBe(expectedCode);
    }
  });

  it("5G-C: refuses a missing field and an oversized plan", () => {
    const { limitations: _dropped, ...withoutLimitations } = VALID_PLAN;
    const missing = parseEngineeringScopePlan(JSON.stringify(withoutLimitations));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("SCOPE_PLAN_MISSING_FIELD");

    const huge = parseEngineeringScopePlan(
      planText({ taskSummary: "x".repeat(200_000) }),
    );
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error.code).toBe("SCOPE_PLAN_TOO_LARGE");
  });

  it("5G-C: refuses a prototype-bearing or accessor-bearing target", () => {
    const polluted = parseEngineeringScopePlan(
      `{"schemaVersion":1,"taskSummary":"t","editableTargets":[{"relativePath":"a.ts","changeKind":"REPLACE_TEXT","reason":"r","__proto__":{"x":1}}],"contextPaths":[],"validationCandidateIds":[],"assumptions":[],"limitations":[]}`,
    );
    // JSON.parse leaves "__proto__" as an own key on the literal, so the
    // unknown-field rule catches it; either way the plan does not survive.
    expect(polluted.ok).toBe(false);
  });
});

/** A hand-built inventory good enough to exercise admission. */
function fakeInventory() {
  const entry = (relativePath: string, physicalKind: "FILE" | "DIRECTORY") => ({
    relativePath,
    physicalKind,
    lexicalKind: physicalKind,
    canonicalPath: `/tmp/fake/${relativePath}`,
    size: physicalKind === "FILE" ? 10 : 0,
  });
  return {
    observations: [
      { disposition: "DESCENDED", relativePath: ".", entry: entry(".", "DIRECTORY") },
      { disposition: "DESCENDED", relativePath: "src", entry: entry("src", "DIRECTORY") },
      {
        disposition: "ADMITTED",
        relativePath: "src/answer.ts",
        entry: entry("src/answer.ts", "FILE"),
      },
      {
        disposition: "ADMITTED",
        relativePath: "package.json",
        entry: entry("package.json", "FILE"),
      },
    ],
  } as never;
}

describe("5G-D: admission binds a plan to trusted inventory", () => {
  const input = {
    inventory: fakeInventory(),
    admittedValidationCandidateIds: ["npm-test"],
  };

  it("5G-D: admits paths inventory already admitted, and binds real entries", () => {
    const parsed = parseEngineeringScopePlan(planText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const admitted = admitScopePlan(parsed.value, input);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const target = admitted.value.editableTargets[0]!;
    expect(target.relativePath).toBe("src/answer.ts");
    expect(target.changeKind).toBe("REPLACE_TEXT");
    if (target.changeKind !== "REPLACE_TEXT") return;
    expect(target.entry.canonicalPath).toBe("/tmp/fake/src/answer.ts");
    expect(admitted.value.contextPaths.map((c) => c.relativePath)).toEqual([
      "package.json",
    ]);
    expect(Object.isFrozen(admitted.value)).toBe(true);
  });

  it("5G-D: refuses unknown paths, kind mismatches and existing create targets", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [
        {
          editableTargets: [
            { relativePath: "src/ghost.ts", changeKind: "REPLACE_TEXT", reason: "r" },
          ],
        },
        "SCOPE_PATH_NOT_ADMITTED",
      ],
      [
        {
          editableTargets: [
            { relativePath: "src", changeKind: "REPLACE_TEXT", reason: "r" },
          ],
        },
        "SCOPE_PATH_KIND_MISMATCH",
      ],
      [
        {
          editableTargets: [
            { relativePath: "src/answer.ts", changeKind: "CREATE_TEXT", reason: "r" },
          ],
        },
        "SCOPE_CREATE_TARGET_EXISTS",
      ],
      [
        {
          editableTargets: [
            { relativePath: "lib/deep/new.ts", changeKind: "CREATE_TEXT", reason: "r" },
          ],
        },
        "SCOPE_CREATE_PARENT_NOT_ADMITTED",
      ],
      [{ contextPaths: ["src/ghost.ts"] }, "SCOPE_PATH_NOT_ADMITTED"],
      [
        { validationCandidateIds: ["npm-deploy"] },
        "SCOPE_VALIDATION_CANDIDATE_UNKNOWN",
      ],
      [
        {
          editableTargets: [
            { relativePath: ".git/config", changeKind: "REPLACE_TEXT", reason: "r" },
          ],
        },
        "SCOPE_PATH_SENSITIVE",
      ],
      [
        {
          editableTargets: [
            { relativePath: "../outside.ts", changeKind: "REPLACE_TEXT", reason: "r" },
          ],
        },
        "SCOPE_PATH_NOT_ADMITTED",
      ],
    ];
    for (const [overrides, expectedCode] of cases) {
      const parsed = parseEngineeringScopePlan(planText(overrides));
      expect(parsed.ok, JSON.stringify(overrides)).toBe(true);
      if (!parsed.ok) continue;
      const admitted = admitScopePlan(parsed.value, input);
      expect(admitted.ok, JSON.stringify(overrides)).toBe(false);
      if (admitted.ok) continue;
      expect(admitted.error.code, JSON.stringify(overrides)).toBe(expectedCode);
    }
  });

  it("5G-D: admits a create target under an admitted directory", () => {
    const parsed = parseEngineeringScopePlan(
      planText({
        editableTargets: [
          { relativePath: "src/new.ts", changeKind: "CREATE_TEXT", reason: "r" },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const admitted = admitScopePlan(parsed.value, input);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const target = admitted.value.editableTargets[0]!;
    expect(target.changeKind).toBe("CREATE_TEXT");
    if (target.changeKind !== "CREATE_TEXT") return;
    expect(target.leafName).toBe("new.ts");
    expect(target.parentEntry.relativePath).toBe("src");
  });

  it("5G-D: a host-supplied forbidden prefix refuses the path", () => {
    const parsed = parseEngineeringScopePlan(planText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const admitted = admitScopePlan(parsed.value, {
      ...input,
      policy: { forbiddenRelativePrefixes: ["src"] },
    });
    expect(admitted.ok).toBe(false);
    if (admitted.ok) return;
    expect(admitted.error.code).toBe("SCOPE_PATH_SENSITIVE");
    expect(admitted.error.message).toContain("PATH_CODE_RUNTIME_SOURCE");
  });
});

describe("5G-E: scope semantics are core-owned and provider-neutral", () => {
  it("5G-E: no adapter source mentions the scope parser or policy", () => {
    for (const file of [
      "adapter.ts",
      "request.ts",
      "response.ts",
      "profiles.ts",
      "transport.ts",
      "budget.ts",
      "types.ts",
      "index.ts",
    ]) {
      const source = readFileSync(
        join(CHECKOUT_ROOT, "src/adapters/openai", file),
        "utf8",
      );
      expect(source, file).not.toMatch(/from "\.\.\/\.\.\/scope/);
      expect(source, file).not.toMatch(/parseEngineeringScopePlan|admitScopePlan/);
      expect(source, file).not.toMatch(/classifyScopePathSensitivity/);
    }
  });

  it("5G-E: the package root does not export scope admission", () => {
    const rootIndex = readFileSync(join(CHECKOUT_ROOT, "src/index.ts"), "utf8");
    expect(rootIndex).not.toMatch(/admitScopePlan|parseEngineeringScopePlan/);
    expect(rootIndex).not.toMatch(/from "\.\/scope/);
  });

  it("5G-E: the sensitive-path classifier is pure and touches no filesystem", () => {
    const source = readFileSync(join(CHECKOUT_ROOT, "src/scope/policy.ts"), "utf8");
    expect(source).not.toMatch(/node:fs|node:child_process|fetch\(/);
    // Same input, same verdict, no ambient state.
    const first = classifyScopePathSensitivity("src/answer.ts");
    const second = classifyScopePathSensitivity("src/answer.ts");
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
