/**
 * Phase 5E1 — ONLY production network owner for the OpenAI Responses adapter.
 * Platform fetch; fixed endpoint; no redirects; bounded incremental body read.
 */

import {
  OPENAI_RESPONSES_URL,
  type OpenAITransportOutcome,
} from "./types.js";

export type PlatformFetch = typeof globalThis.fetch;

/** Capture platform fetch with normal receiver semantics. */
export function capturePlatformFetch(): PlatformFetch {
  const f = globalThis.fetch;
  if (typeof f !== "function") {
    throw new Error("platform fetch unavailable");
  }
  return f.bind(globalThis);
}

export type OpenAITransportRequest = {
  readonly bodyBytes: Uint8Array;
  readonly credential: string;
  readonly signal: AbortSignal;
  readonly maxResponseEnvelopeBytes: number;
  readonly fetchImpl: PlatformFetch;
};

/**
 * Assert effective destination is exactly the owned HTTPS Responses URL.
 * Exported for P3 destination-guard falsification against this private path.
 */
export function assertAllowedOpenAIDestination(url: string): true | string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "DESTINATION_UNPARSEABLE";
  }
  if (parsed.protocol !== "https:") return "DESTINATION_SCHEME";
  if (parsed.username !== "" || parsed.password !== "") {
    return "DESTINATION_USERINFO";
  }
  if (parsed.hostname !== "api.openai.com") return "DESTINATION_HOST";
  if (parsed.port !== "" && parsed.port !== "443") return "DESTINATION_PORT";
  if (parsed.pathname !== "/v1/responses") return "DESTINATION_PATH";
  if (parsed.search !== "") return "DESTINATION_QUERY";
  if (parsed.hash !== "") return "DESTINATION_FRAGMENT";
  // Reconstruct exact form — reject unexpected serialization differences.
  if (url !== OPENAI_RESPONSES_URL) {
    // Allow exact constant only (no trailing slash variants).
    return "DESTINATION_NOT_EXACT";
  }
  return true;
}

function isJsonMediaType(contentType: string | null): boolean {
  if (contentType === null) return false;
  const base = contentType.split(";", 1)[0]!.trim().toLowerCase();
  return base === "application/json";
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "OVERFLOW" | "ABORT" | "READ_ERROR" | "INVALID_UTF8_CHUNK" }
> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isSafeInteger(n) && n > maxBytes) {
      try {
        await response.body?.cancel();
      } catch {
        // ignore cancel settlement
      }
      return { ok: false, reason: "OVERFLOW" };
    }
  }

  if (response.body === null) {
    return { ok: true, bytes: new Uint8Array() };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        return { ok: false, reason: "ABORT" };
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        return { ok: false, reason: "OVERFLOW" };
      }
      chunks.push(value);
    }
  } catch (err) {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    if (signal.aborted) return { ok: false, reason: "ABORT" };
    void err;
    return { ok: false, reason: "READ_ERROR" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released / cancelled
    }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, bytes: out };
}

/**
 * One admitted attempt → at most one fetch. No retries.
 * Authorization attached only after destination assertion.
 */
export async function sendOpenAIResponsesRequest(
  request: OpenAITransportRequest,
  destinationUrl: string = OPENAI_RESPONSES_URL,
): Promise<OpenAITransportOutcome> {
  const dest = assertAllowedOpenAIDestination(destinationUrl);
  if (dest !== true) {
    return {
      kind: "DESTINATION_REJECTED",
      safeReason: dest,
      fetchStarted: false,
    };
  }

  if (request.signal.aborted) {
    return { kind: "ABORT", fetchStarted: false };
  }

  let response: Response;
  try {
    response = await request.fetchImpl(destinationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${request.credential}`,
      },
      body: Buffer.from(request.bodyBytes),
      signal: request.signal,
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (err) {
    if (request.signal.aborted) {
      return { kind: "ABORT", fetchStarted: true };
    }
    // Never echo hostname/stack/key.
    void err;
    return {
      kind: "TRANSPORT_ERROR",
      safeReason: "FETCH_REJECTED",
      fetchStarted: true,
    };
  }

  if (response.status >= 300 && response.status < 400) {
    try {
      await response.body?.cancel();
    } catch {
      // ignore
    }
    return {
      kind: "REDIRECT_REJECTED",
      status: response.status,
      fetchStarted: true,
    };
  }

  const contentType = response.headers.get("content-type");
  // Successful envelopes require JSON media type; error statuses may proceed with bounded body.
  if (
    response.status >= 200 &&
    response.status < 300 &&
    !isJsonMediaType(contentType)
  ) {
    try {
      await response.body?.cancel();
    } catch {
      // ignore
    }
    return {
      kind: "INVALID_CONTENT_TYPE",
      status: response.status,
      fetchStarted: true,
    };
  }

  const read = await readBoundedBody(
    response,
    request.maxResponseEnvelopeBytes,
    request.signal,
  );
  if (!read.ok) {
    if (read.reason === "OVERFLOW") {
      return { kind: "BODY_OVERFLOW", fetchStarted: true };
    }
    if (read.reason === "ABORT") {
      return { kind: "ABORT", fetchStarted: true };
    }
    return {
      kind: "TRANSPORT_ERROR",
      safeReason: "BODY_READ_FAILED",
      fetchStarted: true,
    };
  }

  // Strict UTF-8 validation for retained body.
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(read.bytes);
  } catch {
    return { kind: "INVALID_UTF8", fetchStarted: true };
  }

  return {
    kind: "HTTP",
    status: response.status,
    contentType,
    bodyBytes: read.bytes,
    retryAfterHeader: response.headers.get("retry-after"),
    fetchStarted: true,
  };
}
