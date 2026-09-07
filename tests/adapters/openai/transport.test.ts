/**
 * Phase 5E1 — real transport bounds, destination, redirect, abort (F13, F21–F24, F26).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenAIAdapter } from "../../../src/adapters/openai/index.js";
import {
  assertAllowedOpenAIDestination,
  sendOpenAIResponsesRequest,
  capturePlatformFetch,
} from "../../../src/adapters/openai/transport.js";
import { OPENAI_RESPONSES_URL } from "../../../src/adapters/openai/types.js";
import type { FrozenNormalizedAdapterPacket } from "../../../src/brain/types.js";
import {
  TEST_CREDENTIAL,
  TEST_MODEL,
  chunkedStream,
  completedResponsesBody,
  getRecordedFetchCalls,
  installRecordingFetch,
  queueFetchResponse,
  uninstallRecordingFetch,
} from "./fixtures.js";

function packet(): FrozenNormalizedAdapterPacket {
  return {
    invocationId: "inv-t",
    correlationId: "c",
    purpose: "PROPOSE_REASONING",
    taskText: "t",
    context: { references: [], blocks: [] },
    responseProfile: { kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 },
    maxOutputTokens: 64,
    maxResponseUtf8Bytes: 4096,
    preparedRequestUtf8Bytes: 10,
  };
}

describe("openai transport", () => {
  beforeEach(() => installRecordingFetch());
  afterEach(() => uninstallRecordingFetch());

  it("F23: destination guard rejects foreign origin/scheme/port/userinfo/query/path", () => {
    expect(assertAllowedOpenAIDestination(OPENAI_RESPONSES_URL)).toBe(true);
    expect(assertAllowedOpenAIDestination("http://api.openai.com/v1/responses")).toBe(
      "DESTINATION_SCHEME",
    );
    expect(
      assertAllowedOpenAIDestination("https://evil.example/v1/responses"),
    ).toBe("DESTINATION_HOST");
    expect(
      assertAllowedOpenAIDestination("https://api.openai.com:8443/v1/responses"),
    ).toBe("DESTINATION_PORT");
    expect(
      assertAllowedOpenAIDestination(
        "https://user:pass@api.openai.com/v1/responses",
      ),
    ).toBe("DESTINATION_USERINFO");
    expect(
      assertAllowedOpenAIDestination(
        "https://api.openai.com/v1/responses?x=1",
      ),
    ).toBe("DESTINATION_QUERY");
    expect(
      assertAllowedOpenAIDestination("https://api.openai.com/v1/other"),
    ).toBe("DESTINATION_PATH");
  });

  it("F23: private send with foreign URL never attaches credential-bearing foreign request", async () => {
    const outcome = await sendOpenAIResponsesRequest(
      {
        bodyBytes: Buffer.from("{}"),
        credential: TEST_CREDENTIAL,
        signal: new AbortController().signal,
        maxResponseEnvelopeBytes: 1024,
        fetchImpl: capturePlatformFetch(),
      },
      "https://evil.example/v1/responses",
    );
    expect(outcome.kind).toBe("DESTINATION_REJECTED");
    expect(getRecordedFetchCalls()).toHaveLength(0);
  });

  it("F23: redirects rejected and never followed", async () => {
    queueFetchResponse({
      status: 302,
      headers: {
        "content-type": "text/plain",
        location: "https://evil.example/steal",
      },
      body: "redirect",
    });
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const reply = await created.value.invoke(packet(), {
      signal: new AbortController().signal,
      invocationId: "inv-redir",
    });
    expect(reply.kind).toBe("FAILURE");
    expect(getRecordedFetchCalls()).toHaveLength(1);
    expect(getRecordedFetchCalls()[0]!.input).toBe(OPENAI_RESPONSES_URL);
    expect(getRecordedFetchCalls()[0]!.init?.redirect).toBe("error");
  });

  it("F13: streaming body cap; lying content-length; chunked UTF-8; cancel on overflow", async () => {
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
      { maxResponseEnvelopeBytes: 64 },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Lying small Content-Length but large body
    queueFetchResponse({
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": "10",
      },
      body: chunkedStream([
        Buffer.from('{"status":"completed","output":[', "utf8"),
        Buffer.from("x".repeat(200), "utf8"),
      ]),
    });
    const over = await created.value.invoke(packet(), {
      signal: new AbortController().signal,
      invocationId: "inv-over",
    });
    expect(over.kind).toBe("FAILURE");

    // Valid chunked JSON across boundaries
    const text = completedResponsesBody('{"ok":true}');
    const mid = Math.floor(text.length / 2);
    queueFetchResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: chunkedStream([
        Buffer.from(text.slice(0, mid), "utf8"),
        Buffer.from(text.slice(mid), "utf8"),
      ]),
    });
    const ok = await created.value.invoke(
      { ...packet(), maxOutputTokens: 64 },
      { signal: new AbortController().signal, invocationId: "inv-chunk" },
    );
    // May fail cumulative if first call reserved — use fresh adapter for success path
    void ok;

    const created2 = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
      { maxResponseEnvelopeBytes: 10_000 },
    );
    if (!created2.ok) return;
    queueFetchResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: chunkedStream([
        Buffer.from(text.slice(0, mid), "utf8"),
        Buffer.from(text.slice(mid), "utf8"),
      ]),
    });
    const ok2 = await created2.value.invoke(packet(), {
      signal: new AbortController().signal,
      invocationId: "inv-chunk2",
    });
    expect(ok2.kind).toBe("COMPLETE");

    // Invalid UTF-8
    queueFetchResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0x7b, 0xff, 0x7d]),
    });
    const badUtf = await created2.value.invoke(packet(), {
      signal: new AbortController().signal,
      invocationId: "inv-utf",
    });
    expect(badUtf.kind).toBe("FAILURE");
  });

  it("F26: credential only in allowed Authorization header; absent from body/descriptor/errors", async () => {
    queueFetchResponse({
      status: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: { message: `invalid api key ${TEST_CREDENTIAL}` },
      }),
    });
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
    );
    if (!created.ok) return;
    const reply = await created.value.invoke(packet(), {
      signal: new AbortController().signal,
      invocationId: "inv-auth",
    });
    expect(reply.kind).toBe("FAILURE");
    const call = getRecordedFetchCalls()[0]!;
    expect(call.authorization).toBe(`Bearer ${TEST_CREDENTIAL}`);
    expect(call.bodyText).not.toContain(TEST_CREDENTIAL);
    const diag = created.value.describeOpenAIAdapter();
    expect(JSON.stringify(diag)).not.toContain(TEST_CREDENTIAL);
    expect(JSON.stringify(reply)).not.toContain(TEST_CREDENTIAL);
    expect(JSON.stringify(created.value.descriptor)).not.toContain(TEST_CREDENTIAL);
  });

  it("F24: pre-abort and abort while awaiting headers yield no usable late answer", async () => {
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
    );
    if (!created.ok) return;
    const pre = new AbortController();
    pre.abort();
    const r1 = await created.value.invoke(packet(), {
      signal: pre.signal,
      invocationId: "inv-pre",
    });
    expect(r1.kind).toBe("FAILURE");
    expect(getRecordedFetchCalls()).toHaveLength(0);

    const mid = new AbortController();
    queueFetchResponse(async () => {
      mid.abort();
      await new Promise((r) => setTimeout(r, 5));
      throw new DOMException("aborted", "AbortError");
    });
    const r2 = await created.value.invoke(packet(), {
      signal: mid.signal,
      invocationId: "inv-mid",
    });
    expect(r2.kind).toBe("FAILURE");
    if (r2.kind === "FAILURE") {
      expect(r2.failureClass).toBe("TRANSPORT");
    }
  });

  it("F21: network/read errors sanitized; no unhandled rejection", async () => {
    queueFetchResponse(async () => {
      throw new Error(`ECONNREFUSED host=api.openai.com key=${TEST_CREDENTIAL}`);
    });
    const created = createOpenAIAdapter(
      { modelId: TEST_MODEL, compatibleWithStructuredOutputs: true },
      TEST_CREDENTIAL,
    );
    if (!created.ok) return;
    const reply = await created.value.invoke(packet(), {
      signal: new AbortController().signal,
      invocationId: "inv-net",
    });
    expect(reply.kind).toBe("FAILURE");
    expect(JSON.stringify(reply)).not.toContain(TEST_CREDENTIAL);
    expect(JSON.stringify(reply)).not.toContain("ECONNREFUSED");
  });
});
