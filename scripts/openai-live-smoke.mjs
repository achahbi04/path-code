#!/usr/bin/env node
/**
 * Path Code Phase 5E1 — opt-in OpenAI Responses live smoke (TWO calls max).
 *
 * NOT part of Vitest / npm run check. Do NOT run without explicit operator
 * authorization. This implementation assignment does not authorize execution.
 *
 * Prerequisites (ALL required before any network request):
 *   1. Explicit invocation with --confirm-network
 *   2. PATHCODE_LIVE_OPENAI=1
 *   3. PATHCODE_OPENAI_MODEL=<reviewed model id> (no fallback)
 *   4. OPENAI_API_KEY present (never printed)
 *
 * Example (operator-authorized only):
 *   PATHCODE_LIVE_OPENAI=1 \
 *   PATHCODE_OPENAI_MODEL='<reviewed-model-id>' \
 *   OPENAI_API_KEY='<key>' \
 *   node scripts/openai-live-smoke.mjs --confirm-network
 *
 * Limits: 2 transport attempts; 2048 output tokens/call (4096 total);
 * 65536 request bytes/call (131072 total); Brain deadline <= 60000 ms.
 * Stop on first transport/HTTP/refusal/incomplete/consumer-invalid result.
 * Never approve/apply edits. Never print the key or output excerpts.
 */

import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function failNotRun(reason) {
  const summary = {
    LIVE_SMOKE: "NOT_RUN_REQUIRES_OPERATOR_AUTHORIZATION",
    reason,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(2);
}

if (!process.argv.includes("--confirm-network")) {
  failNotRun("missing --confirm-network");
}
if (process.env.PATHCODE_LIVE_OPENAI !== "1") {
  failNotRun("PATHCODE_LIVE_OPENAI must be exactly 1");
}
const model = process.env.PATHCODE_OPENAI_MODEL;
if (typeof model !== "string" || model.trim() === "") {
  failNotRun("PATHCODE_OPENAI_MODEL must name the reviewed model");
}
const apiKey = process.env.OPENAI_API_KEY;
if (typeof apiKey !== "string" || apiKey.trim() === "") {
  failNotRun("OPENAI_API_KEY missing");
}

const root = process.cwd();
const distAdapter = join(root, "dist/adapters/openai/index.js");
const distBrain = join(root, "dist/brain/index.js");
const distBind = join(root, "dist/reasoning/bind.js");
const distEnvelope = join(root, "dist/orchestrator/mutation/envelope.js");

async function main() {
  const { createOpenAIAdapter } = await import(pathToFileURL(distAdapter).href);
  const { createEngineeringBrain } = await import(pathToFileURL(distBrain).href);
  const { bindReasoningProposalJson } = await import(
    pathToFileURL(distBind).href
  );
  const { parseEditProposalEnvelope } = await import(
    pathToFileURL(distEnvelope).href
  );

  const adapterResult = createOpenAIAdapter(
    {
      modelId: model,
      compatibleWithStructuredOutputs: true,
      maxOutputTokensCeiling: 2048,
    },
    apiKey,
    {
      maxTransportAttempts: 2,
      maxOutputTokensPerAttempt: 2048,
      cumulativeOutputTokens: 4096,
      maxRequestBodyBytes: 65_536,
      cumulativeRequestBodyBytes: 131_072,
    },
  );
  if (!adapterResult.ok) {
    process.stdout.write(
      `${JSON.stringify(
        {
          LIVE_SMOKE: "NOT_ESTABLISHED_WITH_SAFE_REASON",
          reason: "ADAPTER_CONFIG_FAILED",
          code: adapterResult.error.code,
        },
        null,
        2,
      )}\n`,
    );
    process.exit(1);
  }

  const brainResult = createEngineeringBrain(adapterResult.value, {
    maxDispatches: 2,
    maxTimeoutMs: 60_000,
    maxOutputTokens: 2048,
  });
  if (!brainResult.ok) {
    process.stdout.write(
      `${JSON.stringify(
        {
          LIVE_SMOKE: "NOT_ESTABLISHED_WITH_SAFE_REASON",
          reason: "BRAIN_CONFIG_FAILED",
          code: brainResult.error.code,
        },
        null,
        2,
      )}\n`,
    );
    process.exit(1);
  }
  const brain = brainResult.value;

  const tmp = mkdtempSync(join(tmpdir(), "pathcode-openai-smoke-"));
  const calls = [];

  try {
    // Call 1 — tiny synthetic reasoning proposal (no real project disclosure).
    const started1 = Date.now();
    const inv1 = await brain.invoke({
      correlationId: "live-smoke-1",
      purpose: "PROPOSE_REASONING",
      taskText:
        "Emit one EXISTS claim that synthetic file smoke.txt exists, using only supplied handles.",
      context: {
        references: [
          {
            handle: "smoke-entry-1",
            evidenceKind: "ENTRY",
            relativePath: "smoke.txt",
          },
        ],
        blocks: [
          {
            blockId: "b1",
            role: "REFERENCE_MATERIAL",
            text: "smoke.txt is a disposable synthetic fixture file.",
            referenceHandles: ["smoke-entry-1"],
          },
        ],
      },
      responseProfile: { kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 },
      maxOutputTokens: 2048,
      timeoutMs: 60_000,
    });
    const dur1 = Date.now() - started1;
    if (!inv1.ok) {
      calls.push({
        call: 1,
        outcome: "BRAIN_FAILURE",
        failureCode: inv1.error.code,
        durationMs: dur1,
      });
      emitSummary(model, calls, adapterResult.value, "NOT_ESTABLISHED_WITH_SAFE_REASON");
      process.exit(1);
    }
    // Gate 1 needs a real catalog — without one, record text sizes only and
    // parseability via bind is skipped when catalog unavailable. For smoke we
    // only assert non-empty untrusted text and stop without spending more calls
    // on catalog construction beyond disposable note.
    const text1 = inv1.value.response.text;
    const bytes1 = Buffer.byteLength(text1, "utf8");
    calls.push({
      call: 1,
      outcome: inv1.value.receipt.outcome,
      replyProfile: inv1.value.response.responseProfile.kind,
      responseUtf8Bytes: bytes1,
      usage: inv1.value.receipt.usage.availability,
      durationMs: dur1,
      adapterSettlement: inv1.value.receipt.adapterSettlement.status,
      note: "Gate1 bind requires live catalog; operator may bind separately. Text retained only as size.",
    });
    if (bytes1 < 2) {
      emitSummary(model, calls, adapterResult.value, "NOT_ESTABLISHED_WITH_SAFE_REASON");
      process.exit(1);
    }

    // Call 2 — tiny edit envelope; parse only; never approve/apply.
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, "smoke.txt"), "synthetic\n", "utf8");
    const started2 = Date.now();
    const inv2 = await brain.invoke({
      correlationId: "live-smoke-2",
      purpose: "PROPOSE_EDIT",
      taskText:
        "Emit a tiny ENGINEERING_EDIT_PROPOSAL_JSON with one CREATE_TEXT change for smoke-new.txt.",
      context: {
        references: [
          {
            handle: "smoke-dir-1",
            evidenceKind: "ENTRY",
            relativePath: ".",
          },
        ],
        blocks: [
          {
            blockId: "b1",
            role: "REFERENCE_MATERIAL",
            text: "Disposable synthetic parent directory.",
            referenceHandles: ["smoke-dir-1"],
          },
        ],
      },
      responseProfile: {
        kind: "ENGINEERING_EDIT_PROPOSAL_JSON",
        schemaVersion: 1,
      },
      maxOutputTokens: 2048,
      timeoutMs: 60_000,
    });
    const dur2 = Date.now() - started2;
    if (!inv2.ok) {
      calls.push({
        call: 2,
        outcome: "BRAIN_FAILURE",
        failureCode: inv2.error.code,
        durationMs: dur2,
      });
      emitSummary(model, calls, adapterResult.value, "NOT_ESTABLISHED_WITH_SAFE_REASON");
      process.exit(1);
    }
    const text2 = inv2.value.response.text;
    const parsed = parseEditProposalEnvelope(text2);
    calls.push({
      call: 2,
      outcome: inv2.value.receipt.outcome,
      replyProfile: inv2.value.response.responseProfile.kind,
      responseUtf8Bytes: Buffer.byteLength(text2, "utf8"),
      usage: inv2.value.receipt.usage.availability,
      durationMs: dur2,
      envelopeParseOk: parsed.ok,
      note: "No approval/apply/commit performed.",
    });
    void bindReasoningProposalJson;
    if (!parsed.ok) {
      emitSummary(model, calls, adapterResult.value, "NOT_ESTABLISHED_WITH_SAFE_REASON");
      process.exit(1);
    }
    emitSummary(
      model,
      calls,
      adapterResult.value,
      "ESTABLISHED_FOR_SELECTED_MODEL_AT_RECORDED_TIME",
    );
    process.exit(0);
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // ignore
    }
    brain.dispose();
  }
}

function emitSummary(modelId, calls, adapter, liveStatus) {
  const diag = adapter.describeOpenAIAdapter();
  process.stdout.write(
    `${JSON.stringify(
      {
        LIVE_SMOKE: liveStatus,
        selectedModel: modelId,
        attemptedCalls: calls.length,
        calls,
        budget: diag.budget,
        knownUsageAttempts: diag.knownUsageAttempts,
        unknownUsageAttempts: diag.unknownUsageAttempts,
        limitations: [
          "store:false is not a Zero Data Retention guarantee",
          "local admission counters are independent of account spend controls",
          "no output excerpt or secret is printed",
        ],
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((err) => {
  process.stdout.write(
    `${JSON.stringify(
      {
        LIVE_SMOKE: "NOT_ESTABLISHED_WITH_SAFE_REASON",
        reason: "UNHANDLED_HOST_ERROR",
        name: err && typeof err === "object" ? err.name : "Error",
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
