/**
 * Recording fetch fixture for Phase 5E1 OpenAI adapter tests.
 * Install BEFORE createOpenAIAdapter. Errors on every unscripted call.
 * No route to real network.
 */

export type RecordedFetchCall = {
  readonly input: string;
  readonly init: RequestInit | undefined;
  readonly authorization: string | null;
  readonly bodyText: string | null;
};

export type ScriptedFetchResponse =
  | {
      readonly status: number;
      readonly headers?: Record<string, string>;
      readonly body: string | Uint8Array | ReadableStream<Uint8Array>;
      readonly delayMs?: number;
    }
  | ((call: {
      input: string;
      init: RequestInit | undefined;
    }) => Promise<Response> | Response);

let installed = false;
let originalFetch: typeof globalThis.fetch | undefined;
const calls: RecordedFetchCall[] = [];
let scripts: ScriptedFetchResponse[] = [];
let defaultHandler: ScriptedFetchResponse | undefined;

export function getRecordedFetchCalls(): readonly RecordedFetchCall[] {
  return calls;
}

export function resetRecordingFetch(): void {
  calls.length = 0;
  scripts = [];
  defaultHandler = undefined;
}

export function queueFetchResponse(...responses: ScriptedFetchResponse[]): void {
  scripts.push(...responses);
}

export function setDefaultFetchResponse(response: ScriptedFetchResponse): void {
  defaultHandler = response;
}

async function toResponse(script: ScriptedFetchResponse, call: {
  input: string;
  init: RequestInit | undefined;
}): Promise<Response> {
  if (typeof script === "function") {
    return await script(call);
  }
  if (script.delayMs !== undefined && script.delayMs > 0) {
    await new Promise((r) => setTimeout(r, script.delayMs));
  }
  const headers = new Headers(script.headers ?? { "content-type": "application/json" });
  return new Response(script.body, { status: script.status, headers });
}

export function installRecordingFetch(): void {
  if (installed) {
    resetRecordingFetch();
    return;
  }
  originalFetch = globalThis.fetch;
  installed = true;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    let bodyText: string | null = null;
    if (init?.body !== undefined && init.body !== null) {
      if (typeof init.body === "string") bodyText = init.body;
      else if (init.body instanceof Uint8Array) {
        bodyText = Buffer.from(init.body).toString("utf8");
      } else if (Buffer.isBuffer(init.body)) {
        bodyText = init.body.toString("utf8");
      } else if (init.body instanceof ArrayBuffer) {
        bodyText = Buffer.from(init.body).toString("utf8");
      }
    }
    const headers = init?.headers;
    let authorization: string | null = null;
    if (headers instanceof Headers) {
      authorization = headers.get("authorization");
    } else if (Array.isArray(headers)) {
      const hit = headers.find(([k]) => k.toLowerCase() === "authorization");
      authorization = hit?.[1] ?? null;
    } else if (headers && typeof headers === "object") {
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === "authorization") {
          authorization = String(v);
          break;
        }
      }
    }
    const recorded: RecordedFetchCall = {
      input: url,
      init,
      authorization,
      bodyText,
    };
    calls.push(recorded);

    const next = scripts.shift() ?? defaultHandler;
    if (next === undefined) {
      throw new Error(`UNSCRIPTED_FETCH:${url}`);
    }
    return await toResponse(next, { input: url, init });
  }) as typeof globalThis.fetch;
}

export function uninstallRecordingFetch(): void {
  if (!installed) return;
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch;
  }
  originalFetch = undefined;
  installed = false;
  resetRecordingFetch();
}

export function completedResponsesBody(text: string, extras?: {
  readonly id?: string;
  readonly usage?: Record<string, unknown>;
  readonly prependReasoning?: boolean;
  readonly textParts?: string[];
}): string {
  const content =
    extras?.textParts !== undefined
      ? extras.textParts.map((t) => ({ type: "output_text", text: t }))
      : [{ type: "output_text", text }];
  const output: unknown[] = [];
  if (extras?.prependReasoning) {
    output.push({ type: "reasoning", summary: [] });
  }
  output.push({
    type: "message",
    role: "assistant",
    status: "completed",
    content,
  });
  return JSON.stringify({
    id: extras?.id ?? "resp_test_1",
    status: "completed",
    output,
    usage: extras?.usage ?? {
      input_tokens: 10,
      output_tokens: 5,
    },
  });
}

export function chunkedStream(
  parts: readonly Uint8Array[],
): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= parts.length) {
        controller.close();
        return;
      }
      controller.enqueue(parts[i]!);
      i += 1;
    },
  });
}

export const TEST_CREDENTIAL = "sk-test-CANARY_KEY_DO_NOT_LEAK_9f3a";
export const TEST_MODEL = "gpt-test-fixture-model";
