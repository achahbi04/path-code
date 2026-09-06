/**
 * Phase 5D1 Engineering Brain proofs D01–D24.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createEngineeringBrain,
  readMonotonicMs,
  summarizeBrainInvocation,
  utf8ByteLength,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS,
  HARD_MAX_OUTPUT_TOKENS,
  HARD_MAX_TIMEOUT_MS,
  MAX_RESPONSE_UTF8_BYTES,
  type EngineeringBrain,
  type EngineeringBrainAdapter,
} from "../../src/brain/index.js";
import { bindReasoningProposalJson } from "../../src/reasoning/bind.js";
import {
  cleanupReasoningFixtures,
  fixtureWithSourceAndManifest,
  handleFor,
  proposalJson,
} from "../reasoning/helpers.js";
import {
  createDeterministicAdapter,
  validRequest,
} from "./fixtures.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const controllerPath = join(repoRoot, "src/brain/controller.ts");

const brains: EngineeringBrain[] = [];

function track(
  result: ReturnType<typeof createEngineeringBrain>,
): EngineeringBrain {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  brains.push(result.value);
  return result.value;
}

afterEach(async () => {
  for (const b of brains.splice(0)) {
    b.dispose();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  await cleanupReasoningFixtures();
});

describe("Phase 5D1 engineering brain", () => {
  it("D01/D20: foundation mapping; two named adapters; unsupported capability refuses", async () => {
    const a = track(
      createEngineeringBrain(
        createDeterministicAdapter({ providerId: "det-a", modelId: "m1" }),
      ),
    );
    const b = track(
      createEngineeringBrain(
        createDeterministicAdapter({ providerId: "det-b", modelId: "m2" }),
      ),
    );
    expect(a.describe().providerId).toBe("det-a");
    expect(b.describe().providerId).toBe("det-b");
    const okA = await a.invoke(validRequest());
    expect(okA.ok).toBe(true);
    const okB = await b.invoke(validRequest({ correlationId: "corr-b" }));
    expect(okB.ok).toBe(true);

    const unsupported = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "det-c",
          modelId: "m3",
          descriptor: {
            capabilities: {
              textInput: true,
              textOutput: true,
              acceptedResponseProfiles: [
                { kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 },
              ],
              honorsOutputTokenLimit: false,
              cancellationDeclared: true,
            },
          },
        }),
      ),
    );
    const refused = await unsupported.invoke(validRequest());
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("UNSUPPORTED_CAPABILITY");
      expect(refused.error.receipt.adapterDispatched).toBe(false);
      expect(refused.error.receipt.budgetConsumed).toBe(0);
    }
  });

  it("D02/D03: data-only validation, control fields refuse, mutation isolation", async () => {
    const adapter = createDeterministicAdapter({
      providerId: "det",
      modelId: "m",
    });
    const brain = track(createEngineeringBrain(adapter));
    const context = {
      references: [
        { handle: "h1", evidenceKind: "CONTENT" as const, relativePath: "a.ts" },
      ],
      blocks: [
        {
          blockId: "b1",
          role: "REFERENCE_MATERIAL" as const,
          text: '{"execute":true,"approved":true}',
          referenceHandles: ["h1"],
        },
      ],
    };
    const req = validRequest({ context });
    const ok = await brain.invoke(req);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(adapter.calls[0]?.packet.context.blocks[0]?.text).toContain(
        "execute",
      );
    }

    const control = await brain.invoke(
      validRequest({
        correlationId: "c2",
        execute: true,
      }) as never,
    );
    expect(control.ok).toBe(false);

    const dangling = await brain.invoke(
      validRequest({
        correlationId: "c3",
        context: {
          references: [],
          blocks: [
            {
              blockId: "b",
              role: "DIAGNOSTIC",
              text: "x",
              referenceHandles: ["missing"],
            },
          ],
        },
      }),
    );
    expect(dangling.ok).toBe(false);

    const dup = await brain.invoke(
      validRequest({
        correlationId: "c4",
        context: {
          references: [
            { handle: "h", evidenceKind: "ENTRY" },
            { handle: "h", evidenceKind: "CONTENT" },
          ],
          blocks: [],
        },
      }),
    );
    expect(dup.ok).toBe(false);

    // Accessor must refuse without treating getter as a feature channel.
    let getterHits = 0;
    const hostile = {
      correlationId: "c5",
      purpose: "PROPOSE_REASONING",
      taskText: "t",
      context: { references: [], blocks: [] },
      get tools() {
        getterHits += 1;
        return [];
      },
    };
    const accessor = await brain.invoke(hostile as never);
    expect(accessor.ok).toBe(false);
    expect(getterHits).toBe(0);

    // Mutation isolation via deferred adapter (no fake-timer coupling).
    let capturedTask = "";
    let resolveDelay!: (v: {
      kind: "COMPLETE";
      invocationId: string;
      text: string;
    }) => void;
    let delayInvocationId = "";
    const delayAdapter: EngineeringBrainAdapter = {
      descriptor: createDeterministicAdapter({
        providerId: "det-delay",
        modelId: "m",
      }).descriptor,
      invoke(packet, control) {
        capturedTask = packet.taskText;
        delayInvocationId = control.invocationId;
        return new Promise((resolve) => {
          resolveDelay = resolve;
        });
      },
    };
    const brain2 = track(createEngineeringBrain(delayAdapter));
    const mutable = validRequest({
      correlationId: "mut",
      taskText: "original-task-text",
    });
    const pending = brain2.invoke(mutable);
    (mutable as { taskText: string }).taskText = "mutated-after-dispatch";
    resolveDelay({
      kind: "COMPLETE",
      invocationId: delayInvocationId,
      text: capturedTask,
    });
    const mutResult = await pending;
    expect(mutResult.ok).toBe(true);
    if (mutResult.ok) {
      expect(mutResult.value.response.text).toBe("original-task-text");
    }
    Object.defineProperty(delayAdapter, "invoke", {
      value: async () => {
        throw new Error("replaced");
      },
      writable: true,
      configurable: true,
    });
    const pending2 = brain2.invoke(
      validRequest({ correlationId: "mut2", taskText: "second" }),
    );
    resolveDelay({
      kind: "COMPLETE",
      invocationId: delayInvocationId,
      text: "still-using-captured-method",
    });
    const again = await pending2;
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.response.text).toBe("still-using-captured-method");
    }
  });

  it("D04: UTF-8 bounds, defaults vs ceilings, no silent clamp", async () => {
    const brain = track(
      createEngineeringBrain(
        createDeterministicAdapter({ providerId: "det", modelId: "m" }),
        { maxOutputTokens: 100, maxTimeoutMs: 5_000 },
      ),
    );
    const overDefaultOk = await brain.invoke(
      validRequest({
        correlationId: "ceil-ok",
        maxOutputTokens: 50,
        timeoutMs: 2_000,
      }),
    );
    expect(overDefaultOk.ok).toBe(true);

    const overCeiling = await brain.invoke(
      validRequest({
        correlationId: "ceil-bad",
        maxOutputTokens: 101,
      }),
    );
    expect(overCeiling.ok).toBe(false);
    if (!overCeiling.ok) {
      expect(overCeiling.error.code).toBe("LIMIT_EXCEEDED");
      expect(overCeiling.error.receipt.adapterDispatched).toBe(false);
    }

    // Default exceeds smaller ceiling → refuse, require explicit value.
    const tiny = track(
      createEngineeringBrain(
        createDeterministicAdapter({ providerId: "tiny", modelId: "m" }),
        { maxOutputTokens: 10 },
      ),
    );
    const defaultRefuse = await tiny.invoke(validRequest({ correlationId: "def" }));
    expect(defaultRefuse.ok).toBe(false);
    const explicit = await tiny.invoke(
      validRequest({ correlationId: "exp", maxOutputTokens: 10 }),
    );
    expect(explicit.ok).toBe(true);

    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(HARD_MAX_OUTPUT_TOKENS);
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(HARD_MAX_TIMEOUT_MS);
    expect(MAX_RESPONSE_UTF8_BYTES).toBe(65_536);

    const emptyTask = await brain.invoke(
      validRequest({ correlationId: "empty", taskText: "" }),
    );
    expect(emptyTask.ok).toBe(false);
  });

  it("D05/D06: pre-abort/disposed zero dispatch; single call; no retry", async () => {
    const adapter = createDeterministicAdapter({
      providerId: "det",
      modelId: "m",
      script: (_p, c) => ({
        kind: "FAILURE",
        invocationId: c.invocationId,
        failureClass: "RATE_LIMIT",
        retryAfterMs: 1000,
      }),
    });
    const brain = track(createEngineeringBrain(adapter));
    const ac = new AbortController();
    ac.abort();
    const pre = await brain.invoke(validRequest(), { signal: ac.signal });
    expect(pre.ok).toBe(false);
    if (!pre.ok) {
      expect(pre.error.code).toBe("CANCELLED");
      expect(pre.error.receipt.attemptCount).toBe(0);
      expect(pre.error.receipt.adapterSettlement.status).toBe("NOT_DISPATCHED");
    }
    expect(adapter.calls.length).toBe(0);

    const failOnce = await brain.invoke(validRequest({ correlationId: "f1" }));
    expect(failOnce.ok).toBe(false);
    expect(adapter.calls.length).toBe(1);
    if (!failOnce.ok) {
      expect(failOnce.error.code).toBe("RATE_LIMITED");
      expect(failOnce.error.retryAfterMs).toBe(1000);
    }
    // No automatic retry.
    expect(adapter.calls.length).toBe(1);

    brain.dispose();
    const after = await brain.invoke(validRequest({ correlationId: "f2" }));
    expect(after.ok).toBe(false);
    if (!after.ok) {
      expect(after.error.code).toBe("DISPOSED");
      expect(after.error.receipt.budgetConsumed).toBe(0);
    }
    expect(adapter.calls.length).toBe(1);
  });

  it("D07/D08/D09: complete text untrusted; correlation; refusal/incomplete/tools/empty/oversize", async () => {
    const text = "exact-untrusted-output";
    const brain = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "det",
          modelId: "m",
          script: (_p, c) => ({
            kind: "COMPLETE",
            invocationId: c.invocationId,
            text,
            providerReportedModelId: "provider-label-not-authority",
          }),
        }),
      ),
    );
    const ok = await brain.invoke(validRequest());
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.response.meaning).toBe("UNTRUSTED_RESPONSE_TEXT");
      expect(ok.value.response.text).toBe(text);
      expect(ok.value.receipt.providerReportedModelId).toBe(
        "provider-label-not-authority",
      );
    }

    const foreignAdapter: EngineeringBrainAdapter = {
      descriptor: createDeterministicAdapter({
        providerId: "f",
        modelId: "m",
      }).descriptor,
      async invoke(_packet, control) {
        return {
          kind: "COMPLETE",
          invocationId: "not-" + control.invocationId,
          text: "x",
        };
      },
    };
    const brainForeign = track(createEngineeringBrain(foreignAdapter));
    const badCorr = await brainForeign.invoke(validRequest({ correlationId: "fx" }));
    expect(badCorr.ok).toBe(false);
    if (!badCorr.ok) {
      expect(badCorr.error.code).toBe("MALFORMED_ADAPTER_RESPONSE");
    }

    for (const [script, code] of [
      [
        { kind: "REFUSAL", invocationId: "x" },
        "PROVIDER_REFUSAL",
      ],
      [
        { kind: "INCOMPLETE", invocationId: "x", partialText: '{"schemaVersion"' },
        "INCOMPLETE_OUTPUT",
      ],
      [
        {
          kind: "COMPLETE",
          invocationId: "x",
          text: "has-tools",
          toolCalls: [{ id: "1", toolName: "exec", input: {} }],
        },
        "UNEXPECTED_TOOL_CALLS",
      ],
      [
        { kind: "COMPLETE", invocationId: "x", text: "" },
        "EMPTY_RESPONSE",
      ],
    ] as const) {
      const b = track(
        createEngineeringBrain(
          createDeterministicAdapter({
            providerId: `p-${code}`,
            modelId: "m",
            script: script as never,
          }),
        ),
      );
      const r = await b.invoke(validRequest({ correlationId: code }));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe(code);
      }
    }

    const oversize = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "big",
          modelId: "m",
          script: (_p, c) => ({
            kind: "COMPLETE",
            invocationId: c.invocationId,
            text: "x".repeat(MAX_RESPONSE_UTF8_BYTES + 1),
          }),
        }),
      ),
    );
    const tooBig = await oversize.invoke(validRequest({ correlationId: "big" }));
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) {
      expect(tooBig.error.code).toBe("RESPONSE_TOO_LARGE");
    }
  });

  it("D10/D19: sync throw / reject sanitized; secrets absent from receipt/summary", async () => {
    const secret = "SECRET_TOKEN_LEAK_VALUE";
    const brain = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "det",
          modelId: "m",
          syncThrow: true,
        }),
      ),
    );
    const sync = await brain.invoke(
      validRequest({ correlationId: "sync", taskText: `task ${secret}` }),
    );
    expect(sync.ok).toBe(false);
    if (!sync.ok) {
      expect(sync.error.code).toBe("ADAPTER_EXCEPTION");
      const json = JSON.stringify(sync.error.receipt);
      expect(json).not.toContain(secret);
      expect(json).not.toContain("SECRET_ADAPTER_SYNC_THROW");
      const summary = summarizeBrainInvocation(sync.error.receipt);
      expect(JSON.stringify(summary)).not.toContain(secret);
    }

    const rejectBrain = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "rej",
          modelId: "m",
          rejectWith: new Error(`boom ${secret}`),
        }),
      ),
    );
    const rejected = await rejectBrain.invoke(
      validRequest({
        correlationId: "rej",
        context: {
          references: [],
          blocks: [
            {
              blockId: "d",
              role: "DIAGNOSTIC",
              text: secret,
              referenceHandles: [],
            },
          ],
        },
      }),
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(JSON.stringify(rejected.error.receipt)).not.toContain(secret);
    }
  });

  it("D11: concurrent + synchronous re-entry start at most one call", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    let nestedBusyCode: string | undefined;
    const adapter = createDeterministicAdapter({
      providerId: "sf",
      modelId: "m",
      delayMs: 50,
    });

    // Custom adapter for true sync re-entry on the same brain.
    let brainRef: EngineeringBrain | undefined;
    let callCount = 0;
    const reenterAdapter: EngineeringBrainAdapter = {
      descriptor: createDeterministicAdapter({
        providerId: "re",
        modelId: "m",
      }).descriptor,
      async invoke(packet, control) {
        callCount += 1;
        if (callCount === 1 && brainRef) {
          const nested = brainRef.invoke(
            validRequest({ correlationId: "nested" }),
          );
          // nested is a Promise; settle microtask without awaiting adapter work
          const nestedResult = await nested;
          if (!nestedResult.ok) {
            nestedBusyCode = nestedResult.error.code;
            expect(nestedResult.error.receipt.budgetConsumed).toBe(0);
          }
        }
        await new Promise<void>((r) => setTimeout(r, 20));
        return {
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: packet.taskText,
        };
      },
    };
    brainRef = track(
      createEngineeringBrain(reenterAdapter, { maxDispatches: 4 }),
    );
    const p1 = brainRef.invoke(validRequest({ correlationId: "outer" }));
    const p2 = brainRef.invoke(validRequest({ correlationId: "concurrent" }));
    const early = await p2;
    expect(early.ok).toBe(false);
    if (!early.ok) {
      expect(early.error.code).toBe("BUSY");
      expect(early.error.receipt.budgetConsumed).toBe(0);
    }
    await vi.advanceTimersByTimeAsync(20);
    const outer = await p1;
    expect(outer.ok).toBe(true);
    expect(nestedBusyCode).toBe("BUSY");
    expect(callCount).toBe(1);
    void adapter;
  });

  it("D12: per-instance dispatch budget; failures consume; identical IDs still count", async () => {
    const adapter = createDeterministicAdapter({
      providerId: "budget",
      modelId: "m",
      script: (_p, c) => ({
        kind: "FAILURE",
        invocationId: c.invocationId,
        failureClass: "TRANSPORT",
      }),
    });
    const brain = track(
      createEngineeringBrain(adapter, { maxDispatches: 1 }),
    );
    const first = await brain.invoke(validRequest({ correlationId: "same" }));
    expect(first.ok).toBe(false);
    expect(adapter.calls.length).toBe(1);
    const second = await brain.invoke(validRequest({ correlationId: "same" }));
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("BUDGET_EXHAUSTED");
      expect(second.error.receipt.budgetConsumed).toBe(0);
    }
    expect(adapter.calls.length).toBe(1);
  });

  it("D13: scheduled timeout and completion-after-deadline with held callback", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const timeoutMs = 5_000;

    // Path A: scheduled timeout
    const pendingAdapter = createDeterministicAdapter({
      providerId: "t-a",
      modelId: "m",
      ignoreAbort: true,
    });
    const brainA = track(
      createEngineeringBrain(pendingAdapter, { maxTimeoutMs: timeoutMs }),
    );
    const monoBefore = readMonotonicMs();
    const pA = brainA.invoke(
      validRequest({ correlationId: "toa", timeoutMs }),
    );
    await vi.advanceTimersByTimeAsync(timeoutMs);
    const monoAfter = readMonotonicMs();
    expect(monoAfter - monoBefore).toBeGreaterThanOrEqual(timeoutMs);
    const timed = await pA;
    expect(timed.ok).toBe(false);
    if (!timed.ok) {
      expect(timed.error.code).toBe("TIMED_OUT");
      expect(timed.error.receipt.abortRequested).toBe(true);
      expect(timed.error.receipt.adapterSettlement.status).toBe("PENDING");
      expect(timed.error.receipt.elapsedMs).toBeGreaterThanOrEqual(timeoutMs);
    }
    // Settle ignored abort adapter to release slot / avoid leaks.
    pendingAdapter.settleIgnored?.();
    await Promise.resolve();
    await Promise.resolve();

    // Path B: hold deadline callback; advance monotonic; resolve complete text.
    const fakeSetTimeout = globalThis.setTimeout;
    let heldDeadline: (() => void) | undefined;
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((
        fn: (...args: unknown[]) => void,
        ms?: number | undefined,
        ...args: unknown[]
      ) => {
        if (typeof fn === "function" && Number(ms) === timeoutMs) {
          heldDeadline = () => {
            fn(...args);
          };
          return fakeSetTimeout(() => {
            /* held */
          }, ms);
        }
        return fakeSetTimeout(
          fn as never,
          ms as never,
          ...(args as never[]),
        );
      }) as typeof setTimeout);

    let resolveAdapter!: (v: {
      kind: "COMPLETE";
      invocationId: string;
      text: string;
    }) => void;
    let savedInvocationId = "";
    const heldAdapter: EngineeringBrainAdapter = {
      descriptor: createDeterministicAdapter({
        providerId: "t-b",
        modelId: "m",
      }).descriptor,
      invoke(_packet, control) {
        savedInvocationId = control.invocationId;
        return new Promise((resolve) => {
          resolveAdapter = resolve;
        });
      },
    };
    const brainB = track(
      createEngineeringBrain(heldAdapter, { maxTimeoutMs: timeoutMs }),
    );

    // Before-deadline success control
    const brainC = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "t-c",
          modelId: "m",
          script: (_p, c) => ({
            kind: "COMPLETE",
            invocationId: c.invocationId,
            text: "before-deadline",
          }),
        }),
        { maxTimeoutMs: timeoutMs },
      ),
    );
    const before = await brainC.invoke(
      validRequest({ correlationId: "before", timeoutMs }),
    );
    expect(before.ok).toBe(true);

    const pB = brainB.invoke(
      validRequest({ correlationId: "held", timeoutMs }),
    );
    expect(heldDeadline).toBeTypeOf("function");
    // Advance fake time to exact deadline without invoking held callback.
    await vi.advanceTimersByTimeAsync(timeoutMs);
    expect(readMonotonicMs()).toBeGreaterThanOrEqual(timeoutMs);
    resolveAdapter({
      kind: "COMPLETE",
      invocationId: savedInvocationId,
      text: "should-not-succeed",
    });
    await Promise.resolve();
    await Promise.resolve();
    const afterDeadline = await pB;
    expect(afterDeadline.ok).toBe(false);
    if (!afterDeadline.ok) {
      expect(afterDeadline.error.code).toBe("TIMED_OUT");
    }
    // Single finalization: invoking held callback later must not rewrite.
    const receiptSnapshot = !afterDeadline.ok
      ? JSON.stringify(afterDeadline.error.receipt)
      : "";
    heldDeadline?.();
    await Promise.resolve();
    expect(!afterDeadline.ok && JSON.stringify(afterDeadline.error.receipt)).toBe(
      receiptSnapshot,
    );
    setTimeoutSpy.mockRestore();
  });

  it("D13b: real-time abort smoke", async () => {
    const adapter = createDeterministicAdapter({
      providerId: "real",
      modelId: "m",
      ignoreAbort: true,
    });
    const brain = track(createEngineeringBrain(adapter));
    const ac = new AbortController();
    const pending = brain.invoke(validRequest({ correlationId: "real-abort", timeoutMs: 60_000 }), {
      signal: ac.signal,
    });
    ac.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANCELLED");
      expect(result.error.receipt.abortRequested).toBe(true);
    }
    adapter.settleIgnored?.();
    await Promise.resolve();
    await Promise.resolve();
  }, 10_000);

  it("D14/D16/D17: cancel signal, cleanup on success, dispose races", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    let sawAbort = false;
    const adapter = createDeterministicAdapter({
      providerId: "cancel",
      modelId: "m",
      delayMs: 100,
      script: (_p, c) => {
        sawAbort = c.signal.aborted;
        return {
          kind: "COMPLETE",
          invocationId: c.invocationId,
          text: "x",
        };
      },
    });
    const brain = track(createEngineeringBrain(adapter));
    const ac = new AbortController();
    const pending = brain.invoke(validRequest({ correlationId: "cxl" }), {
      signal: ac.signal,
    });
    ac.abort();
    await vi.advanceTimersByTimeAsync(0);
    const cancelled = await pending;
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) {
      expect(cancelled.error.code).toBe("CANCELLED");
    }
    // Parent signal reason is not copied; abort was requested.
    expect(ac.signal.aborted).toBe(true);

    // Normal completion cleans listeners/timers (no leak asserted via second call).
    const okAdapter = createDeterministicAdapter({
      providerId: "ok",
      modelId: "m",
    });
    const brain2 = track(createEngineeringBrain(okAdapter, { maxDispatches: 3 }));
    const ok = await brain2.invoke(validRequest({ correlationId: "ok1" }));
    expect(ok.ok).toBe(true);
    brain2.dispose();
    brain2.dispose(); // idempotent
    const afterDispose = await brain2.invoke(validRequest({ correlationId: "ok2" }));
    expect(afterDispose.ok).toBe(false);
    if (!afterDispose.ok) {
      expect(afterDispose.error.code).toBe("DISPOSED");
    }
    void sawAbort;
  });

  it("D15: ignored abort keeps BUSY until original Promise settles; late discard", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    let resolveIgnored: ((value: {
      kind: "COMPLETE";
      invocationId: string;
      text: string;
    }) => void) | undefined;
    let calls = 0;
    const adapter: EngineeringBrainAdapter = {
      descriptor: createDeterministicAdapter({
        providerId: "ign",
        modelId: "m",
      }).descriptor,
      invoke(_packet, control) {
        calls += 1;
        if (calls === 1) {
          return new Promise((resolve) => {
            resolveIgnored = resolve;
          });
        }
        return Promise.resolve({
          kind: "COMPLETE",
          invocationId: control.invocationId,
          text: "after-release",
        });
      },
    };
    const brain = track(
      createEngineeringBrain(adapter, { maxDispatches: 3, maxTimeoutMs: 1000 }),
    );
    const first = brain.invoke(
      validRequest({ correlationId: "ign1", timeoutMs: 1000 }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    const timed = await first;
    expect(timed.ok).toBe(false);
    if (!timed.ok) {
      expect(timed.error.code).toBe("TIMED_OUT");
      expect(timed.error.receipt.adapterSettlement.status).toBe("PENDING");
    }
    const busy = await brain.invoke(validRequest({ correlationId: "ign2", timeoutMs: 1000 }));
    expect(busy.ok).toBe(false);
    if (!busy.ok) {
      expect(busy.error.code).toBe("BUSY");
    }
    resolveIgnored?.({
      kind: "COMPLETE",
      invocationId: "late",
      text: "late-ignored-abort-text",
    });
    await Promise.resolve();
    await Promise.resolve();
    const after = await brain.invoke(
      validRequest({ correlationId: "ign3", timeoutMs: 1000 }),
    );
    expect(after.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("D18: usage unknown vs zero; settlement discriminators", async () => {
    const unknownBrain = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "u",
          modelId: "m",
          script: (_p, c) => ({
            kind: "COMPLETE",
            invocationId: c.invocationId,
            text: "hello",
          }),
        }),
      ),
    );
    const u = await unknownBrain.invoke(validRequest({ correlationId: "u" }));
    expect(u.ok).toBe(true);
    if (u.ok) {
      expect(u.value.receipt.usage.availability).toBe("UNKNOWN");
    }

    const zeroBrain = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "z",
          modelId: "m",
          script: (_p, c) => ({
            kind: "COMPLETE",
            invocationId: c.invocationId,
            text: "hello",
            usage: {
              provenance: "TEST_FIXTURE",
              inputTokens: 0,
              outputTokens: 0,
            },
          }),
        }),
      ),
    );
    const z = await zeroBrain.invoke(validRequest({ correlationId: "z" }));
    expect(z.ok).toBe(true);
    if (z.ok) {
      expect(z.value.receipt.usage.availability).toBe("REPORTED");
      if (z.value.receipt.usage.availability === "REPORTED") {
        expect(z.value.receipt.usage.inputTokens).toBe(0);
        expect(z.value.receipt.usage.provenance).toBe("TEST_FIXTURE");
      }
    }

    const invalidBrain = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "inv",
          modelId: "m",
          script: (_p, c) => ({
            kind: "COMPLETE",
            invocationId: c.invocationId,
            text: "hello",
            usage: {
              provenance: "TEST_FIXTURE",
              inputTokens: Number.NaN,
            },
          }),
        }),
      ),
    );
    const inv = await invalidBrain.invoke(validRequest({ correlationId: "inv" }));
    expect(inv.ok).toBe(true);
    if (inv.ok) {
      expect(inv.value.receipt.usage.availability).toBe("INVALID");
    }
  });

  it("D21: real Gate 1 handoff without Git; malformed not repaired", async () => {
    const fx = await fixtureWithSourceAndManifest();
    const contentHandle = handleFor(fx.descriptors, "CONTENT", "src/hello.ts");
    const entryHandle = handleFor(fx.descriptors, "ENTRY", "src/hello.ts");

    const goodJson = proposalJson({
      schemaVersion: 1,
      proposalId: "brain-p1",
      requestedOutcome: "document hello",
      claims: [
        {
          claimId: "c1",
          kind: "EXISTS",
          statement: "hello.ts exists",
          proposedSubject: { kind: "EVIDENCE_ID", id: entryHandle },
          proposedCitations: [],
        },
      ],
      hypotheses: [],
    });

    const adapter = createDeterministicAdapter({
      providerId: "gate1",
      modelId: "fixture",
      script: (_p, c) => ({
        kind: "COMPLETE",
        invocationId: c.invocationId,
        text: goodJson,
        usage: { provenance: "TEST_FIXTURE", outputTokens: 10 },
      }),
    });
    const brain = track(createEngineeringBrain(adapter));
    const descriptors = fx.descriptors.map((d) => ({
      handle: d.handle,
      evidenceKind: d.evidenceKind,
      ...(d.relativePath !== undefined
        ? { relativePath: d.relativePath }
        : {}),
    }));
    const invoked = await brain.invoke({
      correlationId: "gate1-handoff",
      purpose: "PROPOSE_REASONING",
      taskText: "Propose CONTENT claim for hello.ts",
      context: {
        references: descriptors,
        blocks: [
          {
            blockId: "ref-1",
            role: "REFERENCE_MATERIAL",
            text: "src/hello.ts",
            referenceHandles: [contentHandle, entryHandle],
          },
        ],
      },
    });
    expect(invoked.ok).toBe(true);
    if (!invoked.ok) {
      throw new Error(invoked.error.message);
    }
    expect(invoked.value.response.meaning).toBe("UNTRUSTED_RESPONSE_TEXT");

    const bound = await bindReasoningProposalJson(
      invoked.value.response.text,
      fx.catalog,
    );
    expect(bound.ok).toBe(true);
    if (bound.ok) {
      expect(bound.value.reasoning.claims.length).toBeGreaterThan(0);
      expect(
        bound.value.reasoning.claims.every(
          (c) => c.bindingStage === "REFERENCES_ONLY",
        ),
      ).toBe(true);
    }

    // Fabricated handle — brain still returns text; Gate 1 refuses.
    const fakeJson = proposalJson({
      schemaVersion: 1,
      proposalId: "brain-fake",
      requestedOutcome: "x",
      claims: [
        {
          claimId: "c1",
          kind: "CONTENT",
          statement: "s",
          proposedSubject: {
            kind: "EVIDENCE_ID",
            id: "00000000-0000-4000-8000-000000000000",
          },
          proposedCitations: [],
        },
      ],
      hypotheses: [],
    });
    const fakeBrain = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "fake",
          modelId: "m",
          script: (_p, c) => ({
            kind: "COMPLETE",
            invocationId: c.invocationId,
            text: fakeJson,
          }),
        }),
      ),
    );
    const fakeInv = await fakeBrain.invoke(
      validRequest({ correlationId: "fake" }),
    );
    expect(fakeInv.ok).toBe(true);
    if (fakeInv.ok) {
      const refused = await bindReasoningProposalJson(
        fakeInv.value.response.text,
        fx.catalog,
      );
      expect(refused.ok).toBe(false);
    }

    // Malformed JSON delivered as untrusted text; brain does not repair.
    const malformedBrain = track(
      createEngineeringBrain(
        createDeterministicAdapter({
          providerId: "mal",
          modelId: "m",
          script: (_p, c) => ({
            kind: "COMPLETE",
            invocationId: c.invocationId,
            text: "{not-json",
          }),
        }),
      ),
    );
    const mal = await malformedBrain.invoke(
      validRequest({ correlationId: "mal" }),
    );
    expect(mal.ok).toBe(true);
    if (mal.ok) {
      expect(mal.value.response.text).toBe("{not-json");
      const parseRefuse = await bindReasoningProposalJson(
        mal.value.response.text,
        fx.catalog,
      );
      expect(parseRefuse.ok).toBe(false);
    }
  }, 30_000);

  it("D22: production brain sources have no fs/net/process/sdk imports", () => {
    const brainDir = join(repoRoot, "src/brain");
    const files = [
      "bounds.ts",
      "clock.ts",
      "controller.ts",
      "failures.ts",
      "index.ts",
      "normalize.ts",
      "receipt.ts",
      "types.ts",
    ];
    for (const f of files) {
      const src = readFileSync(join(brainDir, f), "utf8");
      expect(src).not.toMatch(
        /from ["']node:(fs|path|child_process|worker_threads|http|https|net|dns)["']/,
      );
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/openai|@google\/generative-ai|anthropic/i);
      expect(src).not.toMatch(/from ["'].*reasoning\/(bind|gate2)/);
    }
    const root = readFileSync(join(repoRoot, "src/index.ts"), "utf8");
    expect(root).not.toMatch(/from ["']\.\/brain/);
  });
});

describe("Phase 5D1 bounded falsification probes", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("budget-cap bypass opens D12 then exact restore", () => {
    const original = readFileSync(controllerPath, "utf8");
    const originalHash = createHash("sha256").update(original).digest("hex");
    const weakened = original.replace(
      "if (state.dispatchedCount >= state.maxDispatches)",
      "if (false && state.dispatchedCount >= state.maxDispatches)",
    );
    expect(weakened).not.toBe(original);
    writeFileSync(controllerPath, weakened);
    try {
      const dir = mkdtempSync(join(tmpdir(), "brain-bypass-budget-"));
      const probe = join(dir, "probe.mts");
      writeFileSync(
        probe,
        `
import { createEngineeringBrain } from ${JSON.stringify(join(repoRoot, "src/brain/index.ts"))};

const adapter = {
  descriptor: {
    providerId: "probe",
    modelId: "m",
    capabilities: {
      textInput: true,
      textOutput: true,
      acceptedResponseProfiles: [{ kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 }],
      honorsOutputTokenLimit: true,
      cancellationDeclared: true,
    },
  },
  calls: 0,
  async invoke(_packet, control) {
    this.calls += 1;
    return { kind: "COMPLETE", invocationId: control.invocationId, text: "ok" };
  },
};
const created = createEngineeringBrain(adapter, { maxDispatches: 1 });
if (!created.ok) throw new Error("create failed");
const brain = created.value;
const first = await brain.invoke({
  correlationId: "a",
  purpose: "PROPOSE_REASONING",
  taskText: "one",
  context: { references: [], blocks: [] },
});
if (!first.ok) throw new Error("first should succeed under bypass probe");
const second = await brain.invoke({
  correlationId: "a",
  purpose: "PROPOSE_REASONING",
  taskText: "two",
  context: { references: [], blocks: [] },
});
if (!second.ok && second.error.code === "BUDGET_EXHAUSTED") {
  console.error("expected bypass to allow second dispatch");
  process.exit(2);
}
if (!second.ok) {
  console.error("unexpected second failure", second.error.code);
  process.exit(3);
}
if (adapter.calls !== 2) {
  console.error("expected two adapter calls, got", adapter.calls);
  process.exit(4);
}
console.log("BUDGET_BYPASS_OPEN");
`,
      );
      const result = spawnSync(
        join(repoRoot, "node_modules/.bin/vite-node"),
        [probe],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("BUDGET_BYPASS_OPEN");
    } finally {
      writeFileSync(controllerPath, original);
    }
    const restoredHash = createHash("sha256")
      .update(readFileSync(controllerPath))
      .digest("hex");
    expect(restoredHash).toBe(originalHash);

    const dir = mkdtempSync(join(tmpdir(), "brain-bypass-budget-restore-"));
    const probe = join(dir, "probe.mts");
    writeFileSync(
      probe,
      `
import { createEngineeringBrain } from ${JSON.stringify(join(repoRoot, "src/brain/index.ts"))};
const adapter = {
  descriptor: {
    providerId: "probe",
    modelId: "m",
    capabilities: {
      textInput: true,
      textOutput: true,
      acceptedResponseProfiles: [{ kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 }],
      honorsOutputTokenLimit: true,
      cancellationDeclared: true,
    },
  },
  calls: 0,
  async invoke(_packet, control) {
    this.calls += 1;
    return { kind: "COMPLETE", invocationId: control.invocationId, text: "ok" };
  },
};
const created = createEngineeringBrain(adapter, { maxDispatches: 1 });
if (!created.ok) throw new Error("create failed");
await created.value.invoke({
  correlationId: "a", purpose: "PROPOSE_REASONING", taskText: "one",
  context: { references: [], blocks: [] },
});
const second = await created.value.invoke({
  correlationId: "a", purpose: "PROPOSE_REASONING", taskText: "two",
  context: { references: [], blocks: [] },
});
if (second.ok || second.error.code !== "BUDGET_EXHAUSTED" || adapter.calls !== 1) {
  console.error("restored budget cap failed", second);
  process.exit(2);
}
console.log("BUDGET_BYPASS_RESTORED");
`,
    );
    const restored = spawnSync(
      join(repoRoot, "node_modules/.bin/vite-node"),
      [probe],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(restored.status).toBe(0);
    expect(restored.stdout).toContain("BUDGET_BYPASS_RESTORED");
  });

  it("single-flight reservation reorder opens D11 then exact restore", () => {
    const original = readFileSync(controllerPath, "utf8");
    const originalHash = createHash("sha256").update(original).digest("hex");
    expect(original).toContain("reserveInFlightSlot(state, op);");
    let weakened = original.replace(
      "      // Synchronous single-flight reservation BEFORE first await and BEFORE adapter.\n      reserveInFlightSlot(state, op);\n",
      "      // Synchronous single-flight reservation BEFORE first await and BEFORE adapter.\n      // probe: reservation deferred\n",
    );
    weakened = weakened.replace(
      "        adapterPromise = state.invokeAdapter(packet, {\n          signal: childController.signal,\n          invocationId,\n        });",
      "        adapterPromise = state.invokeAdapter(packet, {\n          signal: childController.signal,\n          invocationId,\n        });\n        reserveInFlightSlot(state, op);",
    );
    expect(weakened).not.toBe(original);
    writeFileSync(controllerPath, weakened);
    try {
      const dir = mkdtempSync(join(tmpdir(), "brain-bypass-sf-"));
      const probe = join(dir, "probe.mts");
      writeFileSync(
        probe,
        `
import { createEngineeringBrain } from ${JSON.stringify(join(repoRoot, "src/brain/index.ts"))};

let brain;
let calls = 0;
const adapter = {
  descriptor: {
    providerId: "sf",
    modelId: "m",
    capabilities: {
      textInput: true,
      textOutput: true,
      acceptedResponseProfiles: [{ kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 }],
      honorsOutputTokenLimit: true,
      cancellationDeclared: true,
    },
  },
  async invoke(_packet, control) {
    calls += 1;
    if (calls === 1) {
      const nested = await brain.invoke({
        correlationId: "nested",
        purpose: "PROPOSE_REASONING",
        taskText: "nested",
        context: { references: [], blocks: [] },
      });
      if (!nested.ok && nested.error.code === "BUSY") {
        console.error("expected weakened reservation to allow nested dispatch");
        process.exit(2);
      }
    }
    return { kind: "COMPLETE", invocationId: control.invocationId, text: "ok" };
  },
};
const created = createEngineeringBrain(adapter, { maxDispatches: 4 });
if (!created.ok) throw new Error("create failed");
brain = created.value;
const outer = await brain.invoke({
  correlationId: "outer",
  purpose: "PROPOSE_REASONING",
  taskText: "outer",
  context: { references: [], blocks: [] },
});
if (!outer.ok) {
  console.error("outer failed", outer.error.code);
  process.exit(3);
}
if (calls < 2) {
  console.error("expected nested call to reach adapter, calls=", calls);
  process.exit(4);
}
console.log("SINGLE_FLIGHT_BYPASS_OPEN");
`,
      );
      const result = spawnSync(
        join(repoRoot, "node_modules/.bin/vite-node"),
        [probe],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("SINGLE_FLIGHT_BYPASS_OPEN");
    } finally {
      writeFileSync(controllerPath, original);
    }
    const restoredHash = createHash("sha256")
      .update(readFileSync(controllerPath))
      .digest("hex");
    expect(restoredHash).toBe(originalHash);

    const dir = mkdtempSync(join(tmpdir(), "brain-bypass-sf-restore-"));
    const probe = join(dir, "probe.mts");
    writeFileSync(
      probe,
      `
import { createEngineeringBrain } from ${JSON.stringify(join(repoRoot, "src/brain/index.ts"))};
let brain;
let calls = 0;
const adapter = {
  descriptor: {
    providerId: "sf",
    modelId: "m",
    capabilities: {
      textInput: true,
      textOutput: true,
      acceptedResponseProfiles: [{ kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 }],
      honorsOutputTokenLimit: true,
      cancellationDeclared: true,
    },
  },
  async invoke(_packet, control) {
    calls += 1;
    if (calls === 1) {
      const nested = await brain.invoke({
        correlationId: "nested",
        purpose: "PROPOSE_REASONING",
        taskText: "nested",
        context: { references: [], blocks: [] },
      });
      if (nested.ok || nested.error.code !== "BUSY") {
        console.error("expected restored reservation to refuse nested", nested);
        process.exit(2);
      }
    }
    return { kind: "COMPLETE", invocationId: control.invocationId, text: "ok" };
  },
};
const created = createEngineeringBrain(adapter, { maxDispatches: 4 });
if (!created.ok) throw new Error("create failed");
brain = created.value;
const outer = await brain.invoke({
  correlationId: "outer",
  purpose: "PROPOSE_REASONING",
  taskText: "outer",
  context: { references: [], blocks: [] },
});
if (!outer.ok || calls !== 1) {
  console.error("restored single-flight failed", { outer, calls });
  process.exit(3);
}
console.log("SINGLE_FLIGHT_BYPASS_RESTORED");
`,
    );
    const restored = spawnSync(
      join(repoRoot, "node_modules/.bin/vite-node"),
      [probe],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(restored.status).toBe(0);
    expect(restored.stdout).toContain("SINGLE_FLIGHT_BYPASS_RESTORED");
  });
});

describe("Phase 5D1 runtime malformed shapes", () => {
  it("D23 runtime: ordinary malformed request shapes refuse", async () => {
    const brain = track(
      createEngineeringBrain(
        createDeterministicAdapter({ providerId: "mal", modelId: "m" }),
      ),
    );
    const r = await brain.invoke({
      correlationId: "x",
      purpose: "PROPOSE_REASONING",
      taskText: "t",
      context: null,
    } as never);
    expect(r.ok).toBe(false);
    expect(utf8ByteLength("a")).toBe(1);
  });
});
