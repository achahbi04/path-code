/**
 * Phase 5E1 — admission, no-retry, Brain composition, diagnostics (F15–F20, F25, F27–F28).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOpenAIAdapter } from "../../../src/adapters/openai/index.js";
import { createEngineeringBrain } from "../../../src/brain/index.js";
import type { FrozenNormalizedAdapterPacket } from "../../../src/brain/types.js";
import {
  TEST_CREDENTIAL,
  TEST_MODEL,
  completedResponsesBody,
  getRecordedFetchCalls,
  installRecordingFetch,
  queueFetchResponse,
  uninstallRecordingFetch,
} from "./fixtures.js";

function packet(
  overrides?: Partial<FrozenNormalizedAdapterPacket>,
): FrozenNormalizedAdapterPacket {
  return {
    invocationId: "inv",
    correlationId: "c",
    purpose: "PROPOSE_REASONING",
    taskText: "task",
    context: { references: [], blocks: [] },
    responseProfile: { kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 },
    maxOutputTokens: 100,
    maxResponseUtf8Bytes: 4096,
    preparedRequestUtf8Bytes: 10,
    ...overrides,
  };
}

describe("openai adapter admission and composition", () => {
  beforeEach(() => installRecordingFetch());
  afterEach(() => {
    uninstallRecordingFetch();
    vi.useRealTimers();
  });

  it("F15/F17: cumulative output reservation refuses second send; usage never refunds", async () => {
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
      {
        maxTransportAttempts: 4,
        cumulativeOutputTokens: 150,
        maxOutputTokensPerAttempt: 100,
        maxRequestBodyBytes: 100_000,
        cumulativeRequestBodyBytes: 400_000,
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    queueFetchResponse({
      status: 200,
      body: completedResponsesBody('{"ok":1}', {
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
    });
    const r1 = await created.value.invoke(packet({ maxOutputTokens: 100 }), {
      signal: new AbortController().signal,
      invocationId: "a",
    });
    expect(r1.kind).toBe("COMPLETE");
    const before = getRecordedFetchCalls().length;
    const r2 = await created.value.invoke(packet({ maxOutputTokens: 100 }), {
      signal: new AbortController().signal,
      invocationId: "b",
    });
    expect(r2.kind).toBe("FAILURE");
    expect(getRecordedFetchCalls().length).toBe(before);
    const snap = created.value.describeOpenAIAdapter().budget;
    expect(snap.reservedOutputTokens).toBe(100);
    expect(snap.reservedAttempts).toBe(1);
  });

  it("F16: single-flight protects concurrent and re-entrant invoke; reject cannot release active slot", async () => {
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
      { maxTransportAttempts: 4 },
    );
    if (!created.ok) return;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    queueFetchResponse(async () => {
      await gate;
      return new Response(completedResponsesBody('{"a":1}'), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const p1 = created.value.invoke(packet(), {
      signal: new AbortController().signal,
      invocationId: "one",
    });
    await new Promise((r) => setTimeout(r, 5));
    const busy = await created.value.invoke(packet(), {
      signal: new AbortController().signal,
      invocationId: "two",
    });
    expect(busy.kind).toBe("FAILURE");
    expect(created.value.describeOpenAIAdapter().budget.inFlight).toBe(1);
    release();
    const done = await p1;
    expect(done.kind).toBe("COMPLETE");
    expect(created.value.describeOpenAIAdapter().budget.inFlight).toBe(0);
  });

  it("F18: HTTP error retains reservation; pre-abort before reserve charges zero", async () => {
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
      { maxTransportAttempts: 3 },
    );
    if (!created.ok) return;
    const pre = new AbortController();
    pre.abort();
    await created.value.invoke(packet(), {
      signal: pre.signal,
      invocationId: "pre",
    });
    expect(created.value.describeOpenAIAdapter().budget.reservedAttempts).toBe(0);

    queueFetchResponse({ status: 500, body: "{}" });
    await created.value.invoke(packet(), {
      signal: new AbortController().signal,
      invocationId: "err",
    });
    expect(created.value.describeOpenAIAdapter().budget.reservedAttempts).toBe(1);
  });

  it("F19: 429 never schedules another call; fetch count one", async () => {
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
    );
    if (!created.ok) return;
    queueFetchResponse({
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "5",
      },
      body: JSON.stringify({ error: { code: "rate_limit_exceeded" } }),
    });
    const reply = await created.value.invoke(packet(), {
      signal: new AbortController().signal,
      invocationId: "rl",
    });
    expect(reply.kind).toBe("FAILURE");
    if (reply.kind === "FAILURE") {
      expect(reply.failureClass).toBe("RATE_LIMIT");
      expect(reply.retryAfterMs).toBe(5000);
    }
    expect(getRecordedFetchCalls()).toHaveLength(1);
  });

  it("F20: 408/409/5xx never retry; no schema/model fallback", async () => {
    for (const status of [408, 409, 502]) {
      uninstallRecordingFetch();
      installRecordingFetch();
      const created = createOpenAIAdapter(
        { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
        TEST_CREDENTIAL,
      );
      if (!created.ok) return;
      queueFetchResponse({
        status,
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      await created.value.invoke(packet(), {
        signal: new AbortController().signal,
        invocationId: `s${status}`,
      });
      expect(getRecordedFetchCalls()).toHaveLength(1);
    }
  });

  it("F25: Brain deadline + adapter + fake fetch compose with matched monotonic clock", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    queueFetchResponse(async () => {
      await new Promise((r) => setTimeout(r, 5_000));
      return new Response(completedResponsesBody('{"ok":true}'), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
    );
    if (!created.ok) return;
    const brain = createEngineeringBrain(created.value, {
      maxTimeoutMs: 50,
      maxDispatches: 2,
    });
    expect(brain.ok).toBe(true);
    if (!brain.ok) return;
    const pending = brain.value.invoke({
      correlationId: "c1",
      purpose: "PROPOSE_REASONING",
      taskText: "hello",
      context: { references: [], blocks: [] },
      timeoutMs: 50,
      maxOutputTokens: 64,
    });
    await vi.advanceTimersByTimeAsync(60);
    const result = await pending;
    expect(result.ok).toBe(false);
    // Real-async abort fixture (separate, short)
    vi.useRealTimers();
    uninstallRecordingFetch();
    installRecordingFetch();
    const created2 = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
    );
    if (!created2.ok) return;
    const ac = new AbortController();
    queueFetchResponse(async () => {
      ac.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const brain2 = createEngineeringBrain(created2.value);
    if (!brain2.ok) return;
    const r = await brain2.value.invoke(
      {
        correlationId: "c2",
        purpose: "PROPOSE_REASONING",
        taskText: "hello",
        context: { references: [], blocks: [] },
        maxOutputTokens: 64,
      },
      { signal: ac.signal },
    );
    expect(r.ok).toBe(false);
  });

  it("F27/F28: diagnostics bounded; both profiles via Brain; no Brain source change required", async () => {
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
    );
    if (!created.ok) return;
    const diag = created.value.describeOpenAIAdapter();
    expect(diag.profiles).toEqual([
      "REASONING_PROPOSAL_JSON",
      "ENGINEERING_EDIT_PROPOSAL_JSON",
      "ENGINEERING_SCOPE_PLAN_JSON",
    ]);
    expect(JSON.stringify(diag)).not.toContain("sk-");
    expect(diag).not.toHaveProperty("credential");

    queueFetchResponse({
      status: 200,
      body: completedResponsesBody(
        '{"schemaVersion":1,"proposalId":"p","requestedOutcome":"x","claims":[{"claimId":"c1","kind":"EXISTS","statement":"s","proposedSubject":{"kind":"EVIDENCE_ID","id":"h"},"proposedCitations":[]}],"hypotheses":[]}',
      ),
    });
    const brain = createEngineeringBrain(created.value);
    if (!brain.ok) return;
    const reasoning = await brain.value.invoke({
      correlationId: "r1",
      purpose: "PROPOSE_REASONING",
      taskText: "propose",
      context: { references: [], blocks: [] },
      responseProfile: { kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 },
      maxOutputTokens: 128,
    });
    expect(reasoning.ok).toBe(true);

    queueFetchResponse({
      status: 200,
      body: completedResponsesBody(
        JSON.stringify({
          schemaVersion: 1,
          proposalId: "e1",
          reasoningProposal: {
            schemaVersion: 1,
            proposalId: "p",
            requestedOutcome: "x",
            claims: [
              {
                claimId: "c1",
                kind: "EXISTS",
                statement: "s",
                proposedSubject: { kind: "EVIDENCE_ID", id: "h" },
                proposedCitations: [],
              },
            ],
            hypotheses: [],
          },
          changes: [
            {
              changeId: "ch1",
              kind: "CREATE_TEXT",
              targetId: "h",
              supportingClaimIds: ["c1"],
              afterText: "x",
            },
          ],
        }),
      ),
    });
    const edit = await brain.value.invoke({
      correlationId: "e1",
      purpose: "PROPOSE_EDIT",
      taskText: "edit",
      context: { references: [], blocks: [] },
      responseProfile: {
        kind: "ENGINEERING_EDIT_PROPOSAL_JSON",
        schemaVersion: 1,
      },
      maxOutputTokens: 128,
    });
    expect(edit.ok).toBe(true);
    if (edit.ok) {
      const app = JSON.parse(edit.value.response.text) as {
        reasoningProposalJson: string;
        reasoningProposal?: unknown;
      };
      expect(typeof app.reasoningProposalJson).toBe("string");
      expect(app.reasoningProposal).toBeUndefined();
      expect(JSON.parse(app.reasoningProposalJson).schemaVersion).toBe(1);
    }
  });
});
