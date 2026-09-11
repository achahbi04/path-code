#!/usr/bin/env node
/**
 * GC1-c FINAL LIVE CLOSURE harness.
 *
 * Real provider/Brain + real GCP under existing budgets.
 * Host APIs supply bounded RUN consent only — never fabricate Gate 2 /
 * EngineeringRun / capabilities.
 *
 * Requires:
 *   OPENAI_API_KEY in env (never printed)
 *   GC1_LIVE_SMOKE=1 --confirm-cloud
 *
 * Seeds PATHCODE_GC1C_SECRET_CANARY for remote boundary proof (never printed).
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKOUT = join(HERE, "..");
const FIXTURE_SRC = join(CHECKOUT, "fixtures/gc1c-live");
const ARTIFACT_ROOT = join(
  tmpdir(),
  `gc1c-live-closure-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);

function href(...parts) {
  return pathToFileURL(join(...parts)).href;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function captureLocal(projectRoot, paths) {
  /** @type {Record<string, string>} */
  const hashes = {};
  for (const rel of paths) {
    const abs = join(projectRoot, rel);
    if (existsSync(abs)) hashes[rel] = sha256File(abs);
  }
  const st = spawnSync("git", ["status", "--porcelain"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  return {
    hashes,
    porcelain: (st.stdout || "").trim(),
    head: (head.stdout || "").trim() || null,
    atMs: Date.now(),
  };
}

function assertUnchanged(before, after, label) {
  const keys = new Set([
    ...Object.keys(before.hashes),
    ...Object.keys(after.hashes),
  ]);
  for (const k of keys) {
    if (before.hashes[k] !== after.hashes[k]) {
      const err = new Error(
        `DIRECTIONALITY_FAIL ${label}: ${k} changed`,
      );
      err.code = "DIRECTIONALITY_FAIL";
      throw err;
    }
  }
  if (before.porcelain !== after.porcelain) {
    const err = new Error(`DIRECTIONALITY_FAIL ${label}: git status changed`);
    err.code = "DIRECTIONALITY_FAIL";
    throw err;
  }
}

function makePrompt(answers) {
  const chunks = [];
  const asked = [];
  return {
    asked,
    output: () => chunks.join(""),
    write(text) {
      chunks.push(String(text));
    },
    isStopped() {
      return false;
    },
    async askLine(promptId) {
      asked.push(promptId);
      const a = answers[promptId];
      if (typeof a === "function") return a();
      if (a === undefined) {
        throw new Error(`no scripted answer for prompt ${promptId}`);
      }
      return a;
    },
    async askHiddenCredential() {
      return { ok: false, code: "NO_TTY" };
    },
  };
}

async function main() {
  if (
    process.env.GC1_LIVE_SMOKE !== "1" ||
    !process.argv.includes("--confirm-cloud")
  ) {
    console.log("REFUSED: need GC1_LIVE_SMOKE=1 and --confirm-cloud");
    process.exit(2);
  }
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.length < 8) {
    console.log("BLOCKED: OPENAI_API_KEY absent (value never printed)");
    process.exit(2);
  }

  const canary = `gc1c-canary-${randomBytes(16).toString("hex")}`;
  process.env.PATHCODE_GC1C_SECRET_CANARY = canary;
  const modelId =
    process.env.PATHCODE_OPENAI_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4.1-mini";

  mkdirSync(ARTIFACT_ROOT, { recursive: true });
  const projectRoot = join(ARTIFACT_ROOT, "fixture");
  cpSync(FIXTURE_SRC, projectRoot, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: projectRoot });
  spawnSync("git", ["config", "user.email", "gc1c@test.local"], {
    cwd: projectRoot,
  });
  spawnSync("git", ["config", "user.name", "gc1c"], { cwd: projectRoot });
  spawnSync("git", ["add", "-A"], { cwd: projectRoot });
  spawnSync("git", ["commit", "-qm", "fixture"], { cwd: projectRoot });

  const trackedPaths = [
    "src/greet.ts",
    "src/greet.test.ts",
    "package.json",
    "tsconfig.json",
    "vitest.config.ts",
  ];
  const journalRoot = join(ARTIFACT_ROOT, "journal");
  const eventsPath = join(ARTIFACT_ROOT, "events.ndjson");
  /** @type {object[]} */
  const events = [];
  const sessionId = randomUUID();

  const build = spawnSync("npm", ["run", "build"], {
    cwd: CHECKOUT,
    encoding: "utf8",
    env: process.env,
  });
  if (build.status !== 0) {
    console.log("BLOCKED: build failed");
    writeFileSync(
      join(ARTIFACT_ROOT, "build.err"),
      build.stderr || build.stdout || "",
    );
    process.exit(2);
  }

  const { loadTrialOwners } = await import(
    href(CHECKOUT, "scripts/pathcode-cli/owners.mjs")
  );
  const {
    runGeneralEngineeringSession,
    GENERAL_SESSION_MAX_PROVIDER_INVOCATIONS,
  } = await import(href(CHECKOUT, "scripts/pathcode-cli/general-session.mjs"));

  const owners = await loadTrialOwners(CHECKOUT);
  if (!owners.ok) {
    console.log("BLOCKED: owners unavailable", owners.code);
    process.exit(2);
  }

  /** @type {Record<string, unknown>} */
  const report = {
    sessionId,
    artifactRoot: ARTIFACT_ROOT,
    modelId,
    providerInvocationsMax: GENERAL_SESSION_MAX_PROVIDER_INVOCATIONS,
    canarySeeded: true,
    credentialPath: "environment:OPENAI_API_KEY",
    tasks: [],
    cancel: null,
    budget: { maxSessions: 6, used: 0 },
  };

  async function runTask(taskText, runChallengeValue, label) {
    const before = captureLocal(projectRoot, trackedPaths);
    writeFileSync(
      join(ARTIFACT_ROOT, `${label}-LOCAL_BEFORE.json`),
      JSON.stringify(before, null, 2),
    );
    const prompt = makePrompt({
      "run-consent": `RUN ${runChallengeValue}`,
    });
    const t0 = Date.now();
    const result = await runGeneralEngineeringSession(prompt, {
      taskText,
      projectRoot,
      checkoutRoot: CHECKOUT,
      owners,
      allowNonTty: true,
      autonomyMode: "bounded",
      modelId,
      runChallenge: runChallengeValue,
      executionMode: "cloud",
      skipLiveGcp: false,
      journalRoot,
      sessionEventEmit: (type, fields = {}) => {
        const ev = { type, ts: Date.now(), sessionId, ...fields };
        events.push(ev);
        writeFileSync(eventsPath, `${JSON.stringify(ev)}\n`, { flag: "a" });
      },
    });
    report.budget.used += 1;
    const after = captureLocal(projectRoot, trackedPaths);
    writeFileSync(
      join(ARTIFACT_ROOT, `${label}-LOCAL_AFTER.json`),
      JSON.stringify(after, null, 2),
    );
    assertUnchanged(before, after, label);
    const taskRecord = {
      label,
      taskText,
      durationMs: Date.now() - t0,
      outcome: result?.outcome ?? null,
      exitCode: result?.exitCode ?? null,
      strongLabel: result?.label ?? null,
      checkpointId: result?.checkpointId ?? null,
      modelCalls: result?.modelCalls ?? null,
      asked: prompt.asked,
      localUnchanged: true,
      localBefore: before,
      localAfter: after,
      eventTypes: events.map((e) => e.type),
      transcriptTail: prompt.output().slice(-8000),
    };
    report.tasks.push(taskRecord);
    writeFileSync(
      join(ARTIFACT_ROOT, `${label}-result.json`),
      JSON.stringify(taskRecord, null, 2),
    );
    return result;
  }

  try {
    console.log(
      JSON.stringify(
        {
          phase: "GC1-c live closure begin",
          artifactRoot: ARTIFACT_ROOT,
          modelId,
          sessionId,
          canarySeeded: true,
        },
        null,
        2,
      ),
    );

    const r1 = await runTask(
      "Change greet so it returns hello with an exclamation mark after the name (example: hello, pathcode!). Keep the public function signature. Do not edit test files.",
      "LIVE1",
      "task1-accept",
    );
    const r2 = await runTask(
      "Change greet to return a farewell that starts with bye instead of hello. Keep the public function signature. Do not modify any test files.",
      "LIVE2",
      "task2-fail",
    );

    const cancel = spawnSync(
      process.execPath,
      [join(CHECKOUT, "scripts/gc1c-live-cancel-probe.mjs"), "--confirm-cloud"],
      {
        cwd: CHECKOUT,
        encoding: "utf8",
        env: { ...process.env, GC1_LIVE_SMOKE: "1" },
        timeout: 900_000,
      },
    );
    report.cancel = {
      exitCode: cancel.status,
      stdoutTail: (cancel.stdout || "").slice(-3000),
      stderrTail: (cancel.stderr || "").slice(-1500),
    };
    report.budget.used += 1;
    writeFileSync(join(ARTIFACT_ROOT, "cancel-stdout.txt"), cancel.stdout || "");

    const surfaces = [
      existsSync(eventsPath) ? readFileSync(eventsPath, "utf8") : "",
      JSON.stringify(report.tasks),
      cancel.stdout || "",
      cancel.stderr || "",
    ];
    for (const s of surfaces) {
      if (s.includes(canary)) {
        throw Object.assign(
          new Error("CREDENTIAL_CANARY_LEAKED_INTO_ARTIFACT"),
          { code: "CREDENTIAL_CANARY_LEAK" },
        );
      }
    }

    report.finishedAt = new Date().toISOString();
    writeFileSync(
      join(ARTIFACT_ROOT, "closure-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log("ARTIFACT_ROOT", ARTIFACT_ROOT);

    const okAccept =
      r1?.outcome === "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED" ||
      r1?.label === "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED";
    const okFail =
      r2?.outcome === "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED" ||
      r2?.label === "MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED" ||
      (r2?.exitCode !== 0 &&
        /VALIDATION_NOT_ESTABLISHED|NOT_ACCEPTED|FAILED|NOT_ESTABLISHED/i.test(
          String(r2?.outcome || r2?.label || ""),
        ));
    const okCancel = cancel.status === 0;
    console.log(
      JSON.stringify(
        {
          task1: {
            outcome: r1?.outcome,
            exit: r1?.exitCode,
            modelCalls: r1?.modelCalls,
          },
          task2: {
            outcome: r2?.outcome,
            exit: r2?.exitCode,
            modelCalls: r2?.modelCalls,
          },
          cancelExit: cancel.status,
          budgetUsed: report.budget.used,
          okAccept,
          okFail,
          okCancel,
        },
        null,
        2,
      ),
    );
    if (!okAccept || !okFail || !okCancel) {
      console.log("CLOSURE_PARTIAL");
      process.exit(1);
    }
    console.log("CLOSURE_LIVE_GATES_PASS");
  } catch (e) {
    report.error = { message: e.message, code: e.code || null };
    writeFileSync(
      join(ARTIFACT_ROOT, "closure-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.error("CLOSURE_ERROR", e.code || "", e.message);
    console.log("ARTIFACT_ROOT", ARTIFACT_ROOT);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
