/**
 * Shared helpers for Phase 5F terminal-trial host tests.
 */

import { Readable, Writable } from "node:stream";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  completedResponsesBody,
  installRecordingFetch,
  queueFetchResponse,
  uninstallRecordingFetch,
  getRecordedFetchCalls,
  TEST_CREDENTIAL,
  TEST_MODEL,
} from "../adapters/openai/fixtures.js";
import {
  FIXED_CALCULATOR_SOURCE,
  SEED_CALCULATOR_SOURCE,
} from "../../scripts/pathcode-cli/fixture-store.mjs";

const require = createRequire(import.meta.url);
export const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export { TEST_CREDENTIAL, TEST_MODEL, getRecordedFetchCalls };
export { FIXED_CALCULATOR_SOURCE, SEED_CALCULATOR_SOURCE };

const trialRoots: string[] = [];

export function trackTrialRoot(root: string | undefined | null): void {
  if (typeof root === "string") trialRoots.push(root);
}

export async function cleanupTrackedTrialRoots(): Promise<void> {
  while (trialRoots.length > 0) {
    const root = trialRoots.pop();
    if (!root) continue;
    try {
      await rm(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

export function createFakeTty(lines: string[] = []) {
  const queue = [...lines];
  let closed = false;
  const stdin = new Readable({
    read() {
      if (closed) {
        this.push(null);
        return;
      }
      if (queue.length === 0) {
        return;
      }
      const next = queue.shift();
      this.push(`${next}\n`);
    },
  }) as Readable & {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode: (mode: boolean) => Readable;
  };
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = function setRawMode(mode: boolean) {
    this.isRaw = mode;
    return this;
  };

  const outChunks: string[] = [];
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      outChunks.push(String(chunk));
      cb();
    },
  }) as Writable & { isTTY: boolean; columns: number };
  stdout.isTTY = true;
  stdout.columns = 100;

  const errChunks: string[] = [];
  const stderr = new Writable({
    write(chunk, _enc, cb) {
      errChunks.push(String(chunk));
      cb();
    },
  });

  function feed(line: string) {
    queue.push(line);
    stdin.push(`${line}\n`);
  }

  function endInput() {
    closed = true;
    stdin.push(null);
  }

  return {
    stdin,
    stdout,
    stderr,
    outChunks,
    errChunks,
    feed,
    endInput,
    output: () => outChunks.join(""),
  };
}

export function editEnvelopeJson(input: {
  proposalId?: string;
  reasoningProposalJson: string;
  changes: unknown[];
}): string {
  return JSON.stringify({
    schemaVersion: 1,
    proposalId: input.proposalId ?? "trial-edit-1",
    reasoningProposalJson: input.reasoningProposalJson,
    changes: input.changes,
  });
}

export function proposalJson(body: unknown): string {
  return JSON.stringify(body);
}

function extractFromBody(
  bodyText: string,
  relativePath: string,
): { targetId: string | null; contentHandle: string | null } {
  let targetId: string | null = null;
  let contentHandle: string | null = null;
  try {
    const body = JSON.parse(bodyText) as {
      input?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const text = body.input?.[0]?.content?.[0]?.text;
    if (typeof text === "string") {
      const payload = JSON.parse(text) as {
        context?: {
          references?: Array<{
            handle?: string;
            evidenceKind?: string;
            relativePath?: string;
          }>;
          blocks?: Array<{ blockId?: string; text?: string }>;
        };
      };
      const ref = payload.context?.references?.find(
        (r) =>
          r.evidenceKind === "CONTENT" && r.relativePath === relativePath,
      );
      if (ref?.handle) contentHandle = ref.handle;
      const block = payload.context?.blocks?.find(
        (b) => b.blockId === "permitted-targets",
      );
      if (block?.text) {
        const parsed = JSON.parse(block.text) as {
          permittedTargets?: Array<{ targetId?: string }>;
        };
        const tid = parsed.permittedTargets?.[0]?.targetId;
        if (typeof tid === "string") targetId = tid;
      }
    }
  } catch {
    // fall through to regex
  }
  if (!targetId) {
    const targetMatch = bodyText.match(/target-\d+-[a-f0-9]+/);
    if (targetMatch) targetId = targetMatch[0];
  }
  if (!contentHandle) {
    const escaped = relativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `"handle":"([0-9a-f-]{36})"[^\\}]{0,120}"relativePath":"${escaped}"|"relativePath":"${escaped}"[^\\}]{0,120}"handle":"([0-9a-f-]{36})"`,
      "i",
    );
    const m = bodyText.match(re);
    contentHandle = m?.[1] ?? m?.[2] ?? null;
  }
  return { targetId, contentHandle };
}

export function queueSuccessfulTrialFetches(opts?: {
  afterText?: string;
  contentHandleFallback?: string;
}): void {
  const afterText = opts?.afterText ?? FIXED_CALCULATOR_SOURCE;

  queueFetchResponse(async (call) => {
    const bodyText = call.init?.body ? String(call.init.body) : "";
    const extracted = extractFromBody(bodyText, "src/calculator.ts");
    const contentHandle =
      extracted.contentHandle ?? opts?.contentHandleFallback ?? "missing-handle";
    const targetId = extracted.targetId ?? "target-1-missing";
    const reasoning = proposalJson({
      schemaVersion: 1,
      proposalId: "pre-edit",
      requestedOutcome: "evidence",
      claims: [
        {
          claimId: "source-1",
          kind: "CONTENT",
          statement: "source text observed",
          proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
          proposedCitations: [],
        },
      ],
      hypotheses: [],
    });
    const text = editEnvelopeJson({
      reasoningProposalJson: reasoning,
      changes: [
        {
          changeId: "e1",
          kind: "REPLACE_TEXT",
          targetId,
          supportingClaimIds: ["source-1"],
          afterText,
        },
      ],
    });
    return new Response(completedResponsesBody(text), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  queueFetchResponse(async (call) => {
    const bodyText = call.init?.body ? String(call.init.body) : "";
    const extracted = extractFromBody(bodyText, "src/calculator.ts");
    const contentHandle =
      extracted.contentHandle ?? opts?.contentHandleFallback ?? "missing-handle";
    const reasoning = proposalJson({
      schemaVersion: 1,
      proposalId: "post-edit",
      requestedOutcome: "evidence",
      claims: [
        {
          claimId: "behaves-multiply-01",
          kind: "BEHAVES",
          statement: "multiply returns the product",
          scenarioDescription: "product of numeric arguments",
          proposedSubject: { kind: "EVIDENCE_ID", id: contentHandle },
          proposedCitations: [],
        },
      ],
      hypotheses: [],
    });
    return new Response(completedResponsesBody(reasoning), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

export function installFetch(): void {
  installRecordingFetch();
}

export function uninstallFetch(): void {
  uninstallRecordingFetch();
}

export function tscJsPath(): string {
  return require.resolve("typescript/lib/tsc.js");
}

export async function importHost(moduleName: string) {
  const href = pathToFileURL(
    join(CHECKOUT_ROOT, "scripts", "pathcode-cli", moduleName),
  ).href;
  return import(href);
}

export async function importPathcodeMain() {
  return import(
    pathToFileURL(join(CHECKOUT_ROOT, "scripts", "pathcode.mjs")).href
  );
}

export async function importInstallHelper() {
  return import(
    pathToFileURL(join(CHECKOUT_ROOT, "scripts", "install-pathcode-local.mjs")).href
  );
}
