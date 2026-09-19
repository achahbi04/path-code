#!/usr/bin/env node
/**
 * S5 — REAL greenfield PATH Build end-to-end (no Build fake fabric, no Gateway fake engine).
 *
 * Proves: origin → real Gateway → S3 fabric → engineer/evaluate/challenge →
 * reinspect → steer → recovery → BUILD COMPLETE → PATH Code continuation.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createGatewayRuntime } from "../../../../scripts/pathcode-cli/gateway/runtime.mjs";
import {
  createBuildController,
  readBuildRecord,
  formatBuildStatus,
  captureBindingReality,
  makeEvidenceRef,
  applyStaleInvalidation,
  changesIndependentOfScope,
} from "../../../../scripts/pathcode-cli/build/index.mjs";
import { writeBuildRecord as writeRec } from "../../../../scripts/pathcode-cli/build/record.mjs";
import { resolveCursorApiKey } from "../../../../scripts/pathcode-cli/ag10/cursor-sdk.mjs";
import { resolveTargetProjectRoot } from "../../../../scripts/pathcode-cli/paths.mjs";
import { runAntigravityEngineeringSession } from "../../../../scripts/pathcode-cli/ag1/session.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "../../../..");
const OUT = join(HERE, "s5-real-e2e.json");
const STEP_TIMEOUT_MS = Number(process.env.PATHCODE_S5_STEP_MS || 420_000);

function which(bin) {
  const r = spawnSync("which", [bin], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

function gatewayPort(runtime) {
  return {
    bindProject: (cwd) => runtime.bindProject({ cwd }),
    startTask: (objective, extra) => runtime.startTask({ objective, ...extra }),
    resumeTask: (taskId, extra) => runtime.resumeTask({ taskId, ...extra }),
    awaitTask: (taskId, timeoutMs) => runtime.awaitTask(taskId, timeoutMs),
    steerTask: (taskId, text) => runtime.steerTask(taskId, text),
    snapshotTask: (taskId) => runtime.snapshotTask(taskId),
  };
}

function preferEngine() {
  if (resolveCursorApiKey(process.env)) return "cursor";
  if (which("copilot")) return "copilot";
  return null;
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, rej) => {
        timer = setTimeout(
          () => rej(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  delete process.env.PATHCODE_GATEWAY_FAKE_ENGINE;
  delete process.env.PATHCODE_BUILD_FAKE;

  const engine = preferEngine();
  /** @type {Record<string, unknown>} */
  const evidence = {
    schema: "pathcode.s5.real-e2e.v1",
    verdict: "FAILED",
    labels: {
      mechanicalControlLoop: "see s5-build-proof.json",
      gatewayDispatch: "see s5-gateway-fake-dispatch.json",
      thisRun: "REAL_ENGINE_PATH_BUILD_E2E",
    },
    preferredEngine: engine,
    fakeFabric: false,
    fakeGatewayEngine: false,
    steps: /** @type {object[]} */ ([]),
  };

  if (!engine) {
    evidence.verdict = "AUTH_REQUIRED";
    evidence.skipReason =
      "No CURSOR_API_KEY and no copilot on PATH — cannot run real-engine Build.";
    writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(2);
  }

  const base = mkdtempSync(join(tmpdir(), "path-s5-real-e2e-"));
  const runtimeRoot = join(base, "runtime");
  const projectDir = join(base, "product");
  mkdirSync(runtimeRoot, { recursive: true });
  process.env.PATHCODE_RUNTIME_ROOT = runtimeRoot;
  evidence.baseDir = base;
  evidence.runtimeRoot = runtimeRoot;
  evidence.projectDir = projectDir;

  const runtime = createGatewayRuntime({
    packageRoot: PACKAGE_ROOT,
    runtimeRoot,
  });
  /** @type {object[]} */
  const events = [];
  const off = runtime.onEvent((env) => {
    const ev = env?.event;
    if (!ev?.type) return;
    events.push({
      type: ev.type,
      engine: ev.engine || ev.preferredEngine,
      classification: ev.classification,
      detail:
        typeof ev.detail === "string"
          ? ev.detail.slice(0, 240)
          : typeof ev.summary === "string"
            ? ev.summary.slice(0, 240)
            : undefined,
      taskId: env.taskId,
    });
  });

  process.env.PATHCODE_PREFERRED_ENGINE = engine;

  const controller = createBuildController({
    runtimeRoot,
    gateway: gatewayPort(runtime),
    fakeMode: false,
    preferredEngine: engine,
  });

  const outcome = [
    "Build a small local Node.js CLI package named path-s5-proof.",
    "It must include package.json with a test script, src/main.js that writes and reads data/store.json,",
    "and npm test must exit 0. No cloud SaaS dependencies.",
  ].join(" ");

  // --- Origin + start ---
  const started = await controller.startBuild(outcome, {
    targetDir: projectDir,
    explicitRequirements: [
      {
        id: "req-offline",
        statement: "Must run fully offline / locally without cloud SaaS",
      },
    ],
    initialCriteria: [
      {
        id: "c-runnable",
        statement: "Core software is runnable with project-native checks (npm test)",
        required: true,
      },
      {
        id: "c-outcome",
        statement:
          "CLI + persistence surface advances the stated outcome (src/main.js + data/store.json)",
        required: true,
      },
    ],
  });
  evidence.steps.push({
    step: "origin_start",
    ok: started.ok === true,
    buildId: started.build?.buildId,
    git: existsSync(join(projectDir, ".git")),
    noPackageYet: !existsSync(join(projectDir, "package.json")),
  });
  if (!started.ok) {
    evidence.failReason = "startBuild failed";
    writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`);
    process.exit(1);
  }
  const buildId = started.build.buildId;
  evidence.buildId = buildId;

  /** @type {object[]} */
  const childLog = [];

  async function runTick(label) {
    const before = readBuildRecord(runtimeRoot, buildId);
    const t0 = Date.now();
    const tick = await withTimeout(
      controller.tick(buildId),
      STEP_TIMEOUT_MS,
      label,
    );
    const after = readBuildRecord(runtimeRoot, buildId);
    const child = (after?.children || []).slice(-1)[0];
    const snap = child?.taskId ? runtime.snapshotTask(child.taskId) : null;
    const row = {
      label,
      ok: tick.ok === true,
      action: tick.action,
      kind: tick.kind || child?.kind,
      taskId: tick.taskId || child?.taskId,
      actionId: child?.actionId,
      classification: child?.classification || snap?.classification,
      gatewayStatus: snap?.status,
      engineEvents: events
        .filter((e) => e.taskId === (tick.taskId || child?.taskId))
        .map((e) => ({ type: e.type, engine: e.engine }))
        .slice(-12),
      criteria: (after?.outcomeCriteria || []).map((c) => ({
        id: c.id,
        status: c.status,
      })),
      requirements: (after?.intent?.explicitRequirements || []).map((r) => ({
        id: r.id,
        status: r.status,
      })),
      elapsedMs: Date.now() - t0,
      loopStatus: after?.loop?.status,
      pendingReinspect: after?.loop?.pendingReinspect,
      packageJson: existsSync(join(projectDir, "package.json")),
      hasSrc: existsSync(join(projectDir, "src")),
    };
    childLog.push(row);
    evidence.steps.push({ step: label, ...row });
    return { tick, after, child, snap };
  }

  // Engineer (may take multiple ticks if first fails validation)
  let engineerOk = false;
  for (let i = 0; i < 3; i += 1) {
    const r = await runTick(`engineer_${i + 1}`);
    if (
      r.child?.kind === "engineer" &&
      (r.child.classification === "VERIFIED" ||
        r.snap?.classification === "VERIFIED" ||
        existsSync(join(projectDir, "package.json")))
    ) {
      engineerOk = true;
      // If package exists but not VERIFIED yet, one more engineer may still help
      if (
        r.child.classification === "VERIFIED" ||
        r.snap?.classification === "VERIFIED"
      ) {
        break;
      }
    }
    if (r.after?.loop?.status === "complete") break;
    if (r.tick?.blocked) break;
  }

  // Depth-A evidence capture
  const reality1 = captureBindingReality(projectDir);
  evidence.steps.push({
    step: "depth_a_after_engineer",
    ok: true,
    headSha: reality1.headSha,
    dirtyFingerprint: reality1.dirtyFingerprint,
    changedFiles: reality1.changedFiles?.slice(0, 30),
    packageJson: existsSync(join(projectDir, "package.json")),
  });

  // Evaluate + challenge via continued ticks
  for (let i = 0; i < 6; i += 1) {
    const rec = readBuildRecord(runtimeRoot, buildId);
    if (rec?.loop?.status === "complete") break;
    const assessment = controller.assessCompletion(buildId);
    if (assessment.complete) {
      controller.markComplete(buildId);
      evidence.steps.push({ step: "mark_complete_early", ok: true });
      break;
    }
    await runTick(`loop_${i + 1}_${assessment.reason || "next"}`);
  }

  // Steering
  const steered = await controller.reviseIntent(buildId, {
    addRequirements: [
      {
        id: "req-readme",
        statement: "Include a short README.md describing how to run tests",
      },
    ],
    note: "real-e2e steer: add README requirement",
  });
  evidence.steps.push({
    step: "steering",
    ok: steered.ok === true,
    outcomeRevision: steered.build?.intent?.outcomeRevision,
    reqReadme: steered.build?.intent?.explicitRequirements?.some(
      (r) => r.id === "req-readme",
    ),
    status: steered.build?.loop?.status,
  });

  // Continue after steer (engineer README if needed)
  for (let i = 0; i < 6; i += 1) {
    const rec = readBuildRecord(runtimeRoot, buildId);
    if (rec?.loop?.status === "complete") break;
    const a = controller.assessCompletion(buildId);
    if (a.complete) {
      controller.markComplete(buildId);
      break;
    }
    await runTick(`post_steer_${i + 1}`);
  }

  // Impact reinspect: docs-only vs src
  let rec = readBuildRecord(runtimeRoot, buildId);
  const binding = rec.projectBindings[0];
  const crit = rec.outcomeCriteria.find((c) => c.id === "c-runnable");
  if (crit && crit.status === "PROVEN") {
    const before = captureBindingReality(projectDir);
    crit.evidence = [
      makeEvidenceRef(
        {
          kind: "check",
          ref: "npm test",
          bindingId: binding.bindingId,
          scope: ["src/", "package.json"],
        },
        before,
      ),
    ];
    writeRec(runtimeRoot, rec);
    writeFileSync(join(projectDir, "NOTES.md"), "unrelated note\n");
    const afterDocs = captureBindingReality(projectDir);
    rec = readBuildRecord(runtimeRoot, buildId);
    applyStaleInvalidation(rec, {
      bindingId: binding.bindingId,
      changedFiles: ["NOTES.md"],
      reality: afterDocs,
    });
    const retained =
      rec.outcomeCriteria.find((c) => c.id === "c-runnable")?.status ===
      "PROVEN";
    writeFileSync(
      join(projectDir, "src", "main.js"),
      `${readFileSync(join(projectDir, "src", "main.js"), "utf8")}\n// touch\n`,
    );
    const afterSrc = captureBindingReality(projectDir);
    applyStaleInvalidation(rec, {
      bindingId: binding.bindingId,
      changedFiles: ["src/main.js"],
      reality: afterSrc,
    });
    const demoted =
      rec.outcomeCriteria.find((c) => c.id === "c-runnable")?.status ===
      "UNKNOWN";
    writeRec(runtimeRoot, rec);
    evidence.steps.push({
      step: "impact_reinspect",
      docsIndependent: changesIndependentOfScope(["NOTES.md"], ["src/"]),
      retainedAfterDocs: retained,
      demotedAfterSrc: demoted,
      ok: retained && demoted,
    });
    // Revalidate via tick/evaluate
    await runTick("revalidate_after_impact");
  } else {
    evidence.steps.push({
      step: "impact_reinspect",
      ok: false,
      reason: "c-runnable not PROVEN yet",
      status: crit?.status,
    });
  }

  // Durability: simulate dispatched-not-consumed recovery
  rec = readBuildRecord(runtimeRoot, buildId);
  const lastChild = [...(rec.children || [])].reverse().find(
    (c) => c.dispatchState === "consumed",
  );
  if (lastChild) {
    lastChild.dispatchState = "terminal_seen";
    rec.loop.pendingReinspect = true;
    writeRec(runtimeRoot, rec);
    const recovered = await controller.recover(buildId);
    const again = await controller.consumeChildResult(buildId, lastChild.taskId);
    evidence.steps.push({
      step: "durability_recover",
      ok:
        recovered.ok === true &&
        again.deduped === true &&
        recovered.build?.loop?.pendingReinspect === false,
      consumeDeduped: again.deduped,
      pendingCleared: recovered.build?.loop?.pendingReinspect === false,
    });
  }

  // Final completion push
  for (let i = 0; i < 4; i += 1) {
    const rec2 = readBuildRecord(runtimeRoot, buildId);
    if (rec2?.loop?.status === "complete") break;
    const a = controller.assessCompletion(buildId);
    if (a.complete) {
      controller.markComplete(buildId);
      break;
    }
    await runTick(`final_${i + 1}`);
  }

  const finalBuild = readBuildRecord(runtimeRoot, buildId);
  evidence.finalBuild = {
    status: finalBuild?.loop?.status,
    criteria: finalBuild?.outcomeCriteria,
    requirements: finalBuild?.intent?.explicitRequirements,
    children: (finalBuild?.children || []).map((c) => ({
      kind: c.kind,
      taskId: c.taskId,
      actionId: c.actionId,
      classification: c.classification,
      dispatchState: c.dispatchState,
    })),
    outcomeRevision: finalBuild?.intent?.outcomeRevision,
  };

  // PATH Code continuation — ordinary session on same binding
  let codeContinuation = { ok: false };
  try {
    const discovered = resolveTargetProjectRoot(projectDir);
    if (discovered.ok) {
      const continuationPrompt = {
        write: () => {},
        isStopped: () => false,
        isCycleCancelRequested: () => false,
        drainSteering: () => [],
      };
      const cont = await withTimeout(
        runAntigravityEngineeringSession(continuationPrompt, {
          projectRoot: discovered.projectRoot,
          taskText:
            "Add a one-line comment at the top of src/main.js: // path-code-continuation. Do not change behavior. Ensure npm test still passes.",
          preferredEngine: engine,
          checkoutRoot: PACKAGE_ROOT,
          cardsOwnProgress: true,
          wallClockMs: STEP_TIMEOUT_MS,
        }),
        STEP_TIMEOUT_MS,
        "code_continuation",
      );
      const mainTxt = existsSync(join(projectDir, "src", "main.js"))
        ? readFileSync(join(projectDir, "src", "main.js"), "utf8")
        : "";
      codeContinuation = {
        ok:
          cont.classification === "VERIFIED" ||
          /path-code-continuation/.test(mainTxt),
        classification: cont.classification,
        taskId: cont.taskId,
        markerInMain: /path-code-continuation/.test(mainTxt),
      };
    }
  } catch (err) {
    codeContinuation = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  evidence.steps.push({ step: "code_continuation", ...codeContinuation });

  off();

  const kinds = new Set(
    (finalBuild?.children || []).map((c) => c.kind).filter(Boolean),
  );
  const realComplete = finalBuild?.loop?.status === "complete";
  const hasEngineer = kinds.has("engineer");
  const hasEvaluate = kinds.has("evaluate");
  const hasChallenge = kinds.has("challenge");
  const critProven = (finalBuild?.outcomeCriteria || [])
    .filter((c) => c.required)
    .every((c) => c.status === "PROVEN");
  const reqSat = (finalBuild?.intent?.explicitRequirements || [])
    .filter((r) => r.required !== false)
    .every((r) => r.status === "SATISFIED");

  evidence.summary = {
    engineerOk,
    hasEngineer,
    hasEvaluate,
    hasChallenge,
    realComplete,
    critProven,
    reqSat,
    codeContinuationOk: codeContinuation.ok === true,
    childCount: finalBuild?.children?.length || 0,
  };

  const pass =
    realComplete &&
    hasEngineer &&
    hasEvaluate &&
    hasChallenge &&
    critProven &&
    reqSat &&
    codeContinuation.ok === true;

  evidence.verdict = pass
    ? "REAL_PATH_BUILD_END_TO_END_VERIFIED"
    : "REAL_LIVE_VERIFICATION_NOT_YET_PASSING";
  evidence.ok = pass;
  evidence.statusCard = finalBuild ? formatBuildStatus(finalBuild) : "";
  evidence.eventSample = events.slice(0, 40);

  writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`\nWrote ${OUT}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  const evidence = {
    schema: "pathcode.s5.real-e2e.v1",
    verdict: "FAILED",
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  };
  writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`);
  console.error(err);
  process.exit(1);
});
