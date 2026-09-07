/**
 * Phase 5E1 — response translation matrix (F09–F12, F14).
 */

import { describe, expect, it } from "vitest";

import { translateOpenAITransportResult } from "../../../src/adapters/openai/response.js";

const CTX = {
  invocationId: "inv-xyz",
  maxProposalTextUtf8Bytes: 65_536,
};

function httpJson(status: number, body: unknown, headers?: { retryAfter?: string }) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    kind: "HTTP" as const,
    status,
    contentType: "application/json",
    bodyBytes: Buffer.from(text, "utf8"),
    retryAfterHeader: headers?.retryAfter ?? null,
    fetchStarted: true as const,
  };
}

describe("openai response translation", () => {
  it("F09/F10: completed single message; reasoning item ignored; text parts joined exactly", () => {
    const body = {
      id: "resp_1",
      status: "completed",
      output: [
        { type: "reasoning", summary: [] },
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            { type: "output_text", text: "\uFEFF{" },
            { type: "output_text", text: '"a":1}\n' },
          ],
        },
      ],
      usage: { input_tokens: 3, output_tokens: 2 },
    };
    const r = translateOpenAITransportResult(httpJson(200, body), CTX);
    expect(r.reply.kind).toBe("COMPLETE");
    if (r.reply.kind !== "COMPLETE") return;
    expect(r.reply.invocationId).toBe("inv-xyz");
    expect(r.reply.text).toBe('\uFEFF{"a":1}\n');
    expect(r.reply.usage?.inputTokens).toBe(3);
  });

  it("F11: text plus tool/function output refuses", () => {
    const body = {
      status: "completed",
      output: [
        {
          type: "message",
          status: "completed",
          content: [{ type: "output_text", text: '{"ok":true}' }],
        },
        { type: "function_call", name: "run", arguments: "{}" },
      ],
    };
    const r = translateOpenAITransportResult(httpJson(200, body), CTX);
    expect(r.reply.kind).toBe("FAILURE");
    expect(r.diag.safeReasonCode).toBe("UNSUPPORTED_TOOL_OUTPUT");
  });

  it("F12: missing/multiple messages, refusal mixture, pending, root error cannot COMPLETE", () => {
    const missing = translateOpenAITransportResult(
      httpJson(200, { status: "completed", output: [] }),
      CTX,
    );
    expect(missing.reply.kind).toBe("FAILURE");

    const multi = translateOpenAITransportResult(
      httpJson(200, {
        status: "completed",
        output: [
          {
            type: "message",
            status: "completed",
            content: [{ type: "output_text", text: "a" }],
          },
          {
            type: "message",
            status: "completed",
            content: [{ type: "output_text", text: "b" }],
          },
        ],
      }),
      CTX,
    );
    expect(multi.reply.kind).toBe("FAILURE");

    const refusalMix = translateOpenAITransportResult(
      httpJson(200, {
        status: "completed",
        output: [
          {
            type: "message",
            status: "completed",
            content: [
              { type: "output_text", text: "hello" },
              { type: "refusal", refusal: "nope" },
            ],
          },
        ],
      }),
      CTX,
    );
    expect(refusalMix.reply.kind).toBe("REFUSAL");

    const pending = translateOpenAITransportResult(
      httpJson(200, { status: "in_progress", output: [] }),
      CTX,
    );
    expect(pending.reply.kind).toBe("INCOMPLETE");

    const failed = translateOpenAITransportResult(
      httpJson(200, { status: "failed", error: { code: "x" }, output: [] }),
      CTX,
    );
    expect(failed.reply.kind).toBe("FAILURE");

    const incomplete = translateOpenAITransportResult(
      httpJson(200, {
        status: "incomplete",
        output: [
          {
            type: "message",
            status: "completed",
            content: [{ type: "output_text", text: '{"partial":true}' }],
          },
        ],
      }),
      CTX,
    );
    expect(incomplete.reply.kind).toBe("INCOMPLETE");

    const unknown = translateOpenAITransportResult(
      httpJson(200, {
        status: "completed",
        output: [{ type: "weird_control_item" }],
      }),
      CTX,
    );
    expect(unknown.reply.kind).toBe("FAILURE");
    expect(unknown.reply.invocationId).toBe("inv-xyz");
  });

  it("F14: usage maps without double counting; missing/invalid/zero distinguished", () => {
    const missing = translateOpenAITransportResult(
      httpJson(200, {
        status: "completed",
        output: [
          {
            type: "message",
            status: "completed",
            content: [{ type: "output_text", text: "x" }],
          },
        ],
      }),
      CTX,
    );
    expect(missing.reply.kind).toBe("COMPLETE");
    if (missing.reply.kind === "COMPLETE") {
      expect(missing.reply.usage).toBeUndefined();
    }

    const zero = translateOpenAITransportResult(
      httpJson(200, {
        status: "completed",
        output: [
          {
            type: "message",
            status: "completed",
            content: [{ type: "output_text", text: "x" }],
          },
        ],
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
      CTX,
    );
    expect(zero.reply.kind).toBe("COMPLETE");
    if (zero.reply.kind === "COMPLETE") {
      expect(zero.reply.usage?.inputTokens).toBe(0);
      expect(zero.reply.usage?.outputTokens).toBe(0);
    }

    const cached = translateOpenAITransportResult(
      httpJson(200, {
        status: "completed",
        output: [
          {
            type: "message",
            status: "completed",
            content: [{ type: "output_text", text: "x" }],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 4,
          input_tokens_details: { cached_tokens: 3 },
          output_tokens_details: { reasoning_tokens: 2 },
        },
      }),
      CTX,
    );
    expect(cached.reply.kind).toBe("COMPLETE");
    if (cached.reply.kind === "COMPLETE") {
      expect(cached.reply.usage?.inputTokens).toBe(10);
      expect(cached.reply.usage?.outputTokens).toBe(4);
      expect(cached.reply.usage?.cacheTokens).toBe(3);
      // reasoning tokens are NOT added into outputTokens
    }
  });

  it("F09 http status branches: 401/403/429 quota vs rate/5xx/3xx/400", () => {
    expect(
      translateOpenAITransportResult(httpJson(401, { error: {} }), CTX).reply,
    ).toMatchObject({ kind: "FAILURE", failureClass: "AUTHENTICATION" });
    expect(
      translateOpenAITransportResult(httpJson(403, { error: {} }), CTX).diag
        .safeReasonCode,
    ).toBe("HTTP_403_PERMISSION");
    expect(
      translateOpenAITransportResult(
        httpJson(429, { error: { code: "insufficient_quota" } }),
        CTX,
      ).diag.safeReasonCode,
    ).toBe("HTTP_429_QUOTA");
    const rate = translateOpenAITransportResult(
      httpJson(429, { error: { code: "rate_limit_exceeded" } }, { retryAfter: "2" }),
      CTX,
    );
    expect(rate.reply).toMatchObject({
      kind: "FAILURE",
      failureClass: "RATE_LIMIT",
      retryAfterMs: 2000,
    });
    expect(
      translateOpenAITransportResult(httpJson(503, {}), CTX).reply,
    ).toMatchObject({ failureClass: "UNAVAILABLE" });
    expect(
      translateOpenAITransportResult(httpJson(302, {}), CTX).diag.safeReasonCode,
    ).toBe("REDIRECT_REJECTED");
    expect(
      translateOpenAITransportResult(httpJson(400, { error: {} }), CTX).diag
        .safeReasonCode,
    ).toBe("HTTP_400_REQUEST_REJECTED");
  });
});
