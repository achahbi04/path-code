#!/usr/bin/env node
/**
 * Phase 7 — authorized live acceptance on Dark Mode.
 *
 * Acceptance harness lives under docs/reports/ (NOT scripts/) so Builder
 * code-identity at 2ae7540 stays exact/clean (CODE_PATHS = scripts + package.json).
 *
 * Modes:
 *   default              — full run (2 eng turns)
 *   PATHCODE_P7_RESUME=1 — resume from existing pending candidate (no eng turn 1)
 *
 * Usage:
 *   PATHCODE_PREFERRED_ENGINE=cursor PATHCODE_BUILD_NO_OPEN=1 PATHCODE_P7_RESUME=1 \
 *     node docs/reports/PHASE_7_ACCEPTANCE/run-phase7-dark-mode-acceptance.mjs
 */
import { mkdirSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolvePathPackageRoot, resolvePathRuntimeRoot } from "../../../scripts/pathcode-cli/paths.mjs";
import { startPathBuildSurface } from "../../../scripts/pathcode-cli/build/surface/server.mjs";
import { readBuildRecord } from "../../../scripts/pathcode-cli/build/index.mjs";
import { gitHeadSha } from "../../../scripts/pathcode-cli/build/adopt.mjs";

const BUILDER_SHA = "2ae7540da76e8d311e64465958d5f6ce03a72c25";
const BUILD_ID = "351d7275-a6ea-498b-a48d-a32e91f669f4";
const ICE_ID = "dcca5ffb-f748-4778-bc91-876ac8ae0176";
const BASELINE_SHA = "a95f0e7db67412f88b9f07e5567efbffee2cb73f";
const RUN1_CANDIDATE_SHA = "fb2c9e24ea78a3246466311ee24f72ad9ea40d63";
const CREATOR_REQUEST =
  "Add a slim “What’s new” banner under the main header that announces one short product update, with a subtle dismiss control. Keep the existing dark-mode homepage, logo, polish, and CVR footer intact — do not replace the site.";
/** Alternate ASCII apostrophe form the UI/API may normalize to. */
const CREATOR_REQUEST_ASCII = CREATOR_REQUEST.replace(/[“”]/g, '"').replace(/’/g, "'");

const ENGINEER_WAIT_MS = Number(process.env.PATHCODE_P7_ENGINEER_TIMEOUT_MS || 2_100_000);
const POLL_MS = 5_000;
const RESUME = process.env.PATHCODE_P7_RESUME === "1";

/** @type {Record<string, unknown>} */
const evidence = {
  schema: "pathcode.builder.phase7.acceptance.v1",
  startedAt: new Date().toISOString(),
  builderSha: BUILDER_SHA,
  buildId: BUILD_ID,
  iceId: ICE_ID,
  creatorRequest: CREATOR_REQUEST,
  resume: RESUME,
  identityAttribution:
    "Harness lives under docs/reports/PHASE_7_ACCEPTANCE/ (outside CODE_PATHS scripts+package.json). Builder loaded identity must remain exact SHA 2ae7540 with dirty=false.",
  steps: {},
  invariants: {},
  failures: [],
  ok: false,
};

function fail(code, detail) {
  evidence.failures.push({ code, detail, at: new Date().toISOString() });
  evidence.ok = false;
  console.error("PHASE7_FAIL", code, typeof detail === "string" ? detail : JSON.stringify(detail));
  throw new Error(`${code}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

function note(step, detail) {
  evidence.steps[step] = { ok: true, at: new Date().toISOString(), ...(detail || {}) };
  console.log("PHASE7", step, detail ? JSON.stringify(detail).slice(0, 600) : "");
}

function markInvariant(id, ok, detail) {
  evidence.invariants[id] = { ok, detail, at: new Date().toISOString() };
  if (!ok) fail(`INVARIANT_${id}`, detail);
}

/**
 * Distinguish anti-greenfield instructions (ALLOWED) from positive greenfield
 * rebuild mandates (PROHIBITED).
 * @param {string} objective
 */
function hasProhibitedGreenfieldMandate(objective) {
  const text = String(objective || "");
  // Strip known ALLOWED anti-greenfield / preserve-product instructions first.
  const withoutAnti = text
    .replace(
      /do not treat this turn as a greenfield rebuild(?: or as completion of the whole historical product)?\.?/gi,
      "",
    )
    .replace(/\bdo not\b[^.!\n]{0,120}\bgreenfield\b[^.!\n]{0,80}[.!]?/gi, "")
    .replace(/\bnever\b[^.!\n]{0,80}\bgreenfield\b[^.!\n]{0,80}[.!]?/gi, "")
    .replace(/\bnot (?:a |an )?(?:greenfield|from-scratch|from scratch)\b[^.!\n]{0,80}[.!]?/gi, "")
    // Creator constraints that forbid replacement (ALLOWED).
    .replace(/\bdo not replace the (?:entire |whole )?(?:site|website|product|app|homepage)\b[^.!\n]{0,40}/gi, "")
    .replace(/\bdon'?t replace the (?:entire |whole )?(?:site|website|product|app|homepage)\b[^.!\n]{0,40}/gi, "")
    .replace(/\bkeep the existing\b[^.!\n]{0,120}/gi, "")
    .replace(/\bpreserve existing\b[^.!\n]{0,80}/gi, "");

  const prohibited = [
    /\b(?:treat (?:this|it) as|this is|as a) (?:a )?greenfield\b/i,
    /\bgreenfield (?:rebuild|rewrite|recreate|from[ -]?scratch)\b/i,
    /\brebuild (?:the )?(?:site|website|product|app|homepage) from[ -]?scratch\b/i,
    /\bcreate (?:a |an )?(?:new )?(?:website|homepage|site|app) from[ -]?scratch\b/i,
    /\bstart over(?: and rebuild)?\b/i,
    /\breplace the (?:entire |whole )(?:site|website|product|app|homepage)\b/i,
  ];
  return prohibited.some((re) => re.test(withoutAnti));
}

function objectivePreservesRequest(objective, pendingText) {
  const obj = String(objective || "");
  const pending = String(pendingText || "");
  return (
    obj.includes(CREATOR_REQUEST) ||
    obj.includes(CREATOR_REQUEST_ASCII) ||
    pending.includes(CREATOR_REQUEST) ||
    pending.includes(CREATOR_REQUEST_ASCII) ||
    ((obj.includes("What’s new") || obj.includes("What's new")) &&
      (obj.includes("do not replace the site") ||
        pending.includes("do not replace the site")))
  );
}

function hasPathAuthoredRepair(objective) {
  const obj = String(objective || "");
  // PATH inventing a repair turn beyond the creator request.
  return (
    /\bPATH(?:-authored)? repair\b/i.test(obj) ||
    /\bafter (?:the )?(?:result|failure),?\s*(?:automatically )?(?:repair|re-?engineer|try again)\b/i.test(
      obj,
    ) ||
    /\byou must (?:now )?fix (?:the )?(?:previous|failed) (?:result|turn)\b/i.test(obj)
  );
}

async function waitFor(pred, { timeoutMs, label }) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await pred();
    if (last?.ok) return last;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return { ok: false, timeout: true, label, last };
}

function engineerChildren(record) {
  return (record?.children || []).filter((c) => c?.kind === "engineer" && !c.orphanAbandoned);
}

function evaluateChildren(record) {
  return (record?.children || []).filter(
    (c) => (c?.kind === "evaluate" || c?.kind === "challenge") && !c.orphanAbandoned,
  );
}

function git(projectRoot, args) {
  const r = spawnSync("git", ["-C", projectRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: r.status,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
}

function remotesPushEvidence(projectRoot) {
  const remotes = git(projectRoot, ["remote", "-v"]);
  const status = git(projectRoot, ["status", "--porcelain", "-b"]);
  return {
    remotes: remotes.stdout,
    branchStatus: status.stdout.split("\n")[0] || "",
    hasRemote: Boolean(remotes.stdout.trim()),
    porcelain: status.stdout,
  };
}

async function getView(surface, buildId) {
  const res = await fetch(new URL(`/api/builds/${buildId}`, surface.url));
  if (!res.ok) return null;
  return res.json();
}

async function post(surface, path, body) {
  const res = await fetch(new URL(path, surface.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, body: json };
}

function verifyCandidateInvariants({
  label,
  build,
  view,
  eng,
  engBefore,
  evalBefore,
  expectedAuth,
  expectSourceSha,
}) {
  const objective = String(eng?.objective || "");
  const engineers = engineerChildren(build);
  const newEngineers = engineers.length - engBefore;
  markInvariant(`${label}_one_engineer_turn`, newEngineers === 1 || (label === "run1" && RESUME && newEngineers === 0), {
    newEngineers,
    taskId: eng?.taskId,
    provider: eng?.provider,
    resume: RESUME,
  });
  // For resume, the existing turn already ran — engineer delta from this process is 0,
  // but total Phase 7 eng for run1 remains the last engineer.
  if (label === "run1" && RESUME) {
    markInvariant("run1_existing_engineer", eng?.taskId === "1f7db2f5-ed2e-49a2-af2e-268a1601e5d8", {
      taskId: eng?.taskId,
    });
  }
  markInvariant(`${label}_objective_preserves_request`, objectivePreservesRequest(objective, build.pendingCandidate?.requestText), {
    requestInPending: String(build.pendingCandidate?.requestText || "").slice(0, 220),
    objectiveHasRequest: objectivePreservesRequest(objective, ""),
  });
  markInvariant(`${label}_no_greenfield_mandate`, !hasProhibitedGreenfieldMandate(objective), {
    prohibited: hasProhibitedGreenfieldMandate(objective),
    antiGreenfieldPresent: /do not treat this turn as a greenfield rebuild/i.test(objective),
    objectiveSlice: objective.slice(0, 450),
  });
  markInvariant(`${label}_no_path_authored_repair`, !hasPathAuthoredRepair(objective), {
    objectiveSlice: objective.slice(0, 400),
  });
  markInvariant(
    `${label}_candidate_until_apply`,
    build.pendingCandidate?.status === "pending" && build.authoritativeSha === expectedAuth,
    {
      pending: build.pendingCandidate?.status,
      authoritativeSha: build.authoritativeSha,
      sourceSha: build.pendingCandidate?.sourceSha,
    },
  );
  if (expectSourceSha) {
    markInvariant(
      `${label}_expected_source_sha`,
      build.pendingCandidate?.sourceSha === expectSourceSha,
      {
        expected: expectSourceSha,
        actual: build.pendingCandidate?.sourceSha,
      },
    );
  }
  markInvariant(
    `${label}_no_evaluate_challenge`,
    evaluateChildren(build).length === evalBefore,
    { evaluateChildren: evaluateChildren(build).length, evalBefore },
  );
  markInvariant(`${label}_provenance`, Boolean(eng?.provider || eng?.engine), {
    provider: eng?.provider || eng?.engine || null,
  });
  markInvariant(
    `${label}_candidate_controls`,
    Boolean(view?.canApply && view?.canDiscard) && view?.canResume !== true,
    {
      canApply: view?.canApply,
      canDiscard: view?.canDiscard,
      canResume: view?.canResume,
      canPause: view?.canPause,
      canStop: view?.canStop,
      loopStatus: build.loop?.status,
    },
  );
  const files = Array.isArray(build.pendingCandidate?.files) ? build.pendingCandidate.files : [];
  const onlyScaffold =
    files.length > 0 &&
    files.every((f) =>
      /^(index\.html|style\.css|styles?\.css|script\.js|package\.json)$/i.test(
        String(f).split("/").pop() || "",
      ),
    );
  // Evolved signal: edits to existing files (index/styles) for a banner is OK;
  // failure is a pure scaffold-only replace with no banner-related change language.
  const evolved =
    files.some((f) => /banner|whats|what-s-new|header|index\.html|styles?\.css/i.test(String(f))) &&
    !(onlyScaffold && files.length >= 4);
  markInvariant(`${label}_evolved_not_replaced`, evolved || files.includes("index.html"), {
    files: files.slice(0, 40),
  });
}

async function main() {
  if (
    process.env.PATHCODE_BUILD_FAKE === "1" ||
    process.env.PATHCODE_GATEWAY_FAKE_ENGINE === "1"
  ) {
    fail("FAKE_MODE", "fake fabric env is set — Phase 7 refuses");
  }

  const packageRoot = resolvePathPackageRoot();
  const runtimeRoot = resolvePathRuntimeRoot({ packageRoot });
  const outDir = join(packageRoot, "docs/reports/PHASE_7_ACCEPTANCE");
  mkdirSync(outDir, { recursive: true });
  const writeEvidence = () => {
    evidence.endedAt = new Date().toISOString();
    writeFileSync(join(outDir, "acceptance.json"), JSON.stringify(evidence, null, 2) + "\n");
  };
  process.on("uncaughtException", (err) => {
    evidence.uncaught = String(err?.stack || err);
    writeEvidence();
  });

  const head = spawnSync("git", ["-C", packageRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).stdout.trim();
  if (head !== BUILDER_SHA) fail("WRONG_CHECKOUT_HEAD", { head, expected: BUILDER_SHA });

  const scriptsPorcelain = spawnSync(
    "git",
    ["-C", packageRoot, "status", "--porcelain", "--", "scripts", "package.json"],
    { encoding: "utf8" },
  ).stdout.trim();
  if (scriptsPorcelain) {
    fail("DIRTY_CODE_PATHS", {
      porcelain: scriptsPorcelain,
      note: "Builder CODE_PATHS must be clean for exact identity at 2ae7540",
    });
  }
  note("checkout_head", { head, scriptsPorcelain: scriptsPorcelain || "(clean)", resume: RESUME });

  const prior = readBuildRecord(runtimeRoot, BUILD_ID);
  if (!prior) fail("BUILD_NOT_FOUND", BUILD_ID);
  const projectRoot = prior.projectBindings?.[0]?.projectRoot;
  if (!projectRoot || !existsSync(projectRoot)) fail("PROJECT_ROOT_MISSING", projectRoot);
  const icePrior = readBuildRecord(runtimeRoot, ICE_ID);
  const priorEngineersAtScriptStart = engineerChildren(prior).length;
  // Phase 7 budget: baseline before any Phase 7 eng was 2; after run1 should be 3.
  const phase7BaselineEngineers = RESUME ? priorEngineersAtScriptStart - 1 : priorEngineersAtScriptStart;
  if (prior.authoritativeSha !== BASELINE_SHA) {
    fail("UNEXPECTED_BASELINE_SHA", { priorAuth: prior.authoritativeSha, expected: BASELINE_SHA });
  }
  if (RESUME) {
    if (prior.pendingCandidate?.status !== "pending") {
      fail("RESUME_NO_PENDING", prior.pendingCandidate || null);
    }
    if (prior.pendingCandidate?.sourceSha !== RUN1_CANDIDATE_SHA) {
      fail("RESUME_WRONG_CANDIDATE", {
        expected: RUN1_CANDIDATE_SHA,
        actual: prior.pendingCandidate?.sourceSha,
      });
    }
  }
  note("baseline", {
    priorAuth: prior.authoritativeSha,
    priorEngineers: priorEngineersAtScriptStart,
    phase7BaselineEngineers,
    projectRoot,
    pending: prior.pendingCandidate?.sourceSha || null,
    iceAuth: icePrior?.authoritativeSha || null,
  });

  console.log("Starting PATH Build surface for Phase 7…");
  const surface = await startPathBuildSurface({
    packageRoot,
    runtimeRoot,
    openBrowser: process.env.PATHCODE_BUILD_NO_OPEN !== "1",
    preferredEngine: process.env.PATHCODE_PREFERRED_ENGINE || "cursor",
    fakeMode: false,
    autoLoop: true,
    port: Number(process.env.PATHCODE_BUILD_PORT || 0) || 0,
  });
  evidence.surfaceUrl = surface.url;
  note("surface_started", { url: surface.url });

  try {
    const identity = await surface.identity();
    evidence.servingIdentity = identity;
    const processShas = (identity.processes || []).map((p) => ({
      role: p.role,
      sha: p.sha,
      stale: p.stale,
      exact: p.exact,
      dirty: p.dirty,
    }));
    const allExact =
      identity.sha === BUILDER_SHA &&
      identity.exact === true &&
      identity.stale !== true &&
      (identity.processes || []).every(
        (p) => p.sha === BUILDER_SHA && !p.stale && p.exact === true && p.dirty === false,
      );
    markInvariant("identity_exact", allExact, { sha: identity.sha, processShas });
    note("preflight_identity", { sha: identity.sha, processShas });

    await post(surface, `/api/builds/${BUILD_ID}/recover`, null);
    const previewReady = await waitFor(
      async () => {
        await post(surface, `/api/builds/${BUILD_ID}/runtime/start`, null);
        const view = await getView(surface, BUILD_ID);
        if (view?.preview?.status === "ready" && (view.preview?.url || view.preview?.embedPath)) {
          return { ok: true, view };
        }
        // In awaiting_review, authoritative preview should still be ready.
        if (view?.authoritativeSha === BASELINE_SHA && view?.pendingCandidate) {
          if (view.preview?.status === "ready" || view.preview?.embedPath || view.previewUrl) {
            return { ok: true, view };
          }
        }
        return { ok: false, view };
      },
      { timeoutMs: 180_000, label: "preview_ready" },
    );
    if (!previewReady.ok) fail("PREVIEW_NOT_READY", previewReady.last);
    note("preflight_dark_mode", {
      authoritativeSha: previewReady.view.authoritativeSha,
      previewStatus: previewReady.view.preview?.status,
      pending: previewReady.view.pendingCandidate?.sourceSha || null,
    });

    const iceView = await getView(surface, ICE_ID);
    evidence.iceReadOnly = {
      authoritativeSha: iceView?.authoritativeSha || icePrior?.authoritativeSha || null,
      previewStatus: iceView?.preview?.status || null,
      loopStatus: iceView?.loop?.status || icePrior?.loop?.status || null,
      engineCallsAuthorized: false,
    };
    note("preflight_ice_readonly", evidence.iceReadOnly);

    // ── RUN 1: existing candidate (resume) or fresh engineer ─────────────
    let engBefore1 = engineerChildren(readBuildRecord(runtimeRoot, BUILD_ID)).length;
    let evalBefore1 = evaluateChildren(readBuildRecord(runtimeRoot, BUILD_ID)).length;
    /** @type {any} */
    let b1;
    /** @type {any} */
    let v1;
    /** @type {any} */
    let eng1;

    if (RESUME) {
      // Do not re-run engineer turn 1.
      engBefore1 = priorEngineersAtScriptStart; // delta 0 expected for this process
      b1 = readBuildRecord(runtimeRoot, BUILD_ID);
      v1 = await getView(surface, BUILD_ID);
      eng1 = engineerChildren(b1).find((c) => c.taskId === b1.pendingCandidate?.taskId) ||
        engineerChildren(b1).slice(-1)[0];
      note("run1_resume_existing_candidate", {
        taskId: eng1?.taskId,
        sourceSha: b1.pendingCandidate?.sourceSha,
        files: b1.pendingCandidate?.files,
      });
      verifyCandidateInvariants({
        label: "run1",
        build: b1,
        view: v1,
        eng: eng1,
        engBefore: engBefore1,
        evalBefore: evalBefore1,
        expectedAuth: BASELINE_SHA,
        expectSourceSha: RUN1_CANDIDATE_SHA,
      });
    } else {
      const msg1 = await post(surface, `/api/builds/${BUILD_ID}/message`, {
        message: CREATOR_REQUEST,
      });
      if (!msg1.ok || msg1.body?.ok === false) fail("MESSAGE_1_FAILED", msg1.body);
      note("run1_message", { status: msg1.status });

      const candidate1 = await waitFor(
        async () => {
          const build = readBuildRecord(runtimeRoot, BUILD_ID);
          const view = await getView(surface, BUILD_ID);
          const pending = build?.pendingCandidate?.status === "pending";
          const engineers = engineerChildren(build);
          const newEngineers = engineers.length - engBefore1;
          const evals = evaluateChildren(build).length - evalBefore1;
          if (evals > 0) return { ok: true, fail: "EVALUATE_OR_CHALLENGE_SPAWNED", build, view, newEngineers };
          if (newEngineers > 1) return { ok: true, fail: "MORE_THAN_ONE_ENGINEER", build, view, newEngineers };
          if (build?.authoritativeSha && build.authoritativeSha !== BASELINE_SHA) {
            return { ok: true, fail: "AUTH_SHA_MOVED_BEFORE_APPLY", build, view, newEngineers };
          }
          if (pending && newEngineers === 1) return { ok: true, build, view, newEngineers };
          return { ok: false, loop: build?.loop?.status, pending: build?.pendingCandidate || null, newEngineers };
        },
        { timeoutMs: ENGINEER_WAIT_MS, label: "candidate1" },
      );
      if (candidate1.fail) fail(candidate1.fail, candidate1);
      if (!candidate1.ok) fail("CANDIDATE_1_TIMEOUT", candidate1.last);
      b1 = candidate1.build;
      v1 = candidate1.view;
      eng1 = engineerChildren(b1).slice(-1)[0];
      note("run1_candidate", {
        taskId: eng1?.taskId,
        provider: eng1?.provider,
        sourceSha: b1.pendingCandidate?.sourceSha,
        files: b1.pendingCandidate?.files,
      });
      verifyCandidateInvariants({
        label: "run1",
        build: b1,
        view: v1,
        eng: eng1,
        engBefore: engBefore1,
        evalBefore: evalBefore1,
        expectedAuth: BASELINE_SHA,
        expectSourceSha: null,
      });
    }

    // Candidate-pending pause/resume truth (0 eng)
    const engBeforePause = engineerChildren(readBuildRecord(runtimeRoot, BUILD_ID)).length;
    const pauseProbe = await post(surface, `/api/builds/${BUILD_ID}/pause`, null);
    const afterPause = readBuildRecord(runtimeRoot, BUILD_ID);
    markInvariant(
      "pause_while_candidate",
      afterPause?.pendingCandidate?.status === "pending" &&
        engineerChildren(afterPause).length === engBeforePause &&
        afterPause.authoritativeSha === BASELINE_SHA,
      {
        pauseOk: pauseProbe.ok,
        loopStatus: afterPause?.loop?.status,
        engineers: engineerChildren(afterPause).length,
      },
    );
    const resumeProbe = await post(surface, `/api/builds/${BUILD_ID}/resume`, null);
    const afterResume = readBuildRecord(runtimeRoot, BUILD_ID);
    markInvariant(
      "resume_while_candidate",
      resumeProbe.body?.awaitingReview === true ||
        afterResume?.pendingCandidate?.status === "pending",
      {
        resumeBody: {
          ok: resumeProbe.body?.ok,
          awaitingReview: resumeProbe.body?.awaitingReview,
        },
        pending: afterResume?.pendingCandidate?.status,
        engineers: engineerChildren(afterResume).length,
      },
    );

    // DISCARD — 0 engine calls
    const engBeforeDiscard = engineerChildren(readBuildRecord(runtimeRoot, BUILD_ID)).length;
    const evalBeforeDiscard = evaluateChildren(readBuildRecord(runtimeRoot, BUILD_ID)).length;
    const discard = await post(surface, `/api/builds/${BUILD_ID}/discard`, null);
    if (!discard.ok || discard.body?.ok === false) fail("DISCARD_FAILED", discard.body);
    const afterDiscard = readBuildRecord(runtimeRoot, BUILD_ID);
    const headAfterDiscard = gitHeadSha(projectRoot);
    markInvariant(
      "discard_no_engine",
      engineerChildren(afterDiscard).length === engBeforeDiscard &&
        evaluateChildren(afterDiscard).length === evalBeforeDiscard,
      {
        engBefore: engBeforeDiscard,
        engAfter: engineerChildren(afterDiscard).length,
        evalBefore: evalBeforeDiscard,
        evalAfter: evaluateChildren(afterDiscard).length,
      },
    );
    markInvariant(
      "discard_restores_auth",
      afterDiscard.authoritativeSha === BASELINE_SHA &&
        !afterDiscard.pendingCandidate &&
        String(headAfterDiscard) === BASELINE_SHA,
      {
        authoritativeSha: afterDiscard.authoritativeSha,
        head: headAfterDiscard,
        pending: afterDiscard.pendingCandidate || null,
        lastDiscarded: afterDiscard.lastDiscardedCandidate || null,
      },
    );
    note("run1_discard", {
      authoritativeSha: afterDiscard.authoritativeSha,
      head: headAfterDiscard,
      lastDiscardedTaskId: afterDiscard.lastDiscardedCandidate?.taskId,
    });

    await post(surface, `/api/builds/${BUILD_ID}/runtime/restart`, null);
    const afterDiscardPreview = await waitFor(
      async () => {
        const view = await getView(surface, BUILD_ID);
        if (view?.preview?.status === "ready") return { ok: true, view };
        return { ok: false, view };
      },
      { timeoutMs: 120_000, label: "preview_after_discard" },
    );
    markInvariant("preview_safe_after_discard", afterDiscardPreview.ok === true, {
      preview: afterDiscardPreview.view?.preview?.status,
      authoritativeSha: afterDiscardPreview.view?.authoritativeSha,
    });

    // ── RUN 2: final authorized engineer turn ────────────────────────────
    const engBefore2 = engineerChildren(readBuildRecord(runtimeRoot, BUILD_ID)).length;
    const evalBefore2 = evaluateChildren(readBuildRecord(runtimeRoot, BUILD_ID)).length;
    const adoptionsBefore2 = (readBuildRecord(runtimeRoot, BUILD_ID)?.adoptionHistory || []).length;
    const pushBefore2 = remotesPushEvidence(projectRoot);

    const msg2 = await post(surface, `/api/builds/${BUILD_ID}/message`, {
      message: CREATOR_REQUEST,
    });
    if (!msg2.ok || msg2.body?.ok === false) fail("MESSAGE_2_FAILED", msg2.body);
    note("run2_message", {
      status: msg2.status,
      outcomeRevision: msg2.body?.build?.intent?.outcomeRevision,
    });

    const candidate2 = await waitFor(
      async () => {
        const build = readBuildRecord(runtimeRoot, BUILD_ID);
        const view = await getView(surface, BUILD_ID);
        const pending = build?.pendingCandidate?.status === "pending";
        const engineers = engineerChildren(build);
        const newEngineers = engineers.length - engBefore2;
        const evals = evaluateChildren(build).length - evalBefore2;
        if (evals > 0) return { ok: true, fail: "EVALUATE_OR_CHALLENGE_SPAWNED_2", build, view, newEngineers };
        if (newEngineers > 1) return { ok: true, fail: "MORE_THAN_ONE_ENGINEER_2", build, view, newEngineers };
        if (build?.authoritativeSha && build.authoritativeSha !== BASELINE_SHA) {
          return { ok: true, fail: "AUTH_SHA_MOVED_BEFORE_APPLY_2", build, view, newEngineers };
        }
        if (pending && newEngineers === 1) return { ok: true, build, view, newEngineers };
        return {
          ok: false,
          loop: build?.loop?.status,
          children: engineers.slice(-3).map((c) => ({
            taskId: c.taskId,
            dispatchState: c.dispatchState,
            classification: c.classification,
            provider: c.provider,
          })),
          pending: build?.pendingCandidate || null,
          newEngineers,
        };
      },
      { timeoutMs: ENGINEER_WAIT_MS, label: "candidate2" },
    );
    if (candidate2.fail) fail(candidate2.fail, candidate2);
    if (!candidate2.ok) fail("CANDIDATE_2_TIMEOUT", candidate2.last);

    const b2 = candidate2.build;
    const v2 = candidate2.view;
    const eng2 = engineerChildren(b2).slice(-1)[0];
    note("run2_candidate", {
      taskId: eng2?.taskId,
      provider: eng2?.provider,
      sourceSha: b2.pendingCandidate?.sourceSha,
      files: b2.pendingCandidate?.files,
      diffSummary: b2.pendingCandidate?.diffSummary,
    });
    verifyCandidateInvariants({
      label: "run2",
      build: b2,
      view: v2,
      eng: eng2,
      engBefore: engBefore2,
      evalBefore: evalBefore2,
      expectedAuth: BASELINE_SHA,
      expectSourceSha: null,
    });

    // Candidate preview should be addressable while auth remains baseline
    markInvariant(
      "run2_candidate_preview_signal",
      Boolean(v2?.candidatePreview || v2?.pendingCandidate || b2.pendingCandidate?.sourceSha),
      {
        candidatePreview: Boolean(v2?.candidatePreview),
        pendingSource: b2.pendingCandidate?.sourceSha,
        authPreview: v2?.preview?.status,
      },
    );

    const candidateSha = b2.pendingCandidate?.sourceSha;
    const apply = await post(surface, `/api/builds/${BUILD_ID}/apply`, null);
    if (!apply.ok || apply.body?.ok === false) fail("APPLY_FAILED", apply.body);
    const afterApply = readBuildRecord(runtimeRoot, BUILD_ID);
    const headAfterApply = gitHeadSha(projectRoot);
    markInvariant(
      "apply_once",
      !afterApply.pendingCandidate &&
        afterApply.authoritativeSha === candidateSha &&
        headAfterApply === candidateSha &&
        afterApply.lastAppliedCandidate?.taskId === eng2?.taskId,
      {
        authoritativeSha: afterApply.authoritativeSha,
        candidateSha,
        head: headAfterApply,
        lastApplied: afterApply.lastAppliedCandidate,
      },
    );
    const adoptionsAfter = afterApply.adoptionHistory || [];
    markInvariant(
      "apply_adoption_count_one",
      adoptionsAfter.length === adoptionsBefore2 + 1 &&
        adoptionsAfter[adoptionsAfter.length - 1]?.taskId === eng2?.taskId &&
        adoptionsAfter[adoptionsAfter.length - 1]?.adoptedSha === candidateSha,
      {
        before: adoptionsBefore2,
        after: adoptionsAfter.length,
        last: adoptionsAfter[adoptionsAfter.length - 1],
      },
    );

    // No automatic engineering after Apply (brief settle window)
    await new Promise((r) => setTimeout(r, 8_000));
    const settle = readBuildRecord(runtimeRoot, BUILD_ID);
    markInvariant(
      "no_auto_eng_after_apply",
      engineerChildren(settle).length === engineerChildren(afterApply).length &&
        evaluateChildren(settle).length === evaluateChildren(afterApply).length &&
        !settle.pendingCandidate,
      {
        eng: engineerChildren(settle).length,
        eval: evaluateChildren(settle).length,
        pending: settle.pendingCandidate || null,
        loop: settle.loop?.status,
      },
    );

    await post(surface, `/api/builds/${BUILD_ID}/runtime/restart`, null);
    const afterApplyPreview = await waitFor(
      async () => {
        const view = await getView(surface, BUILD_ID);
        if (view?.preview?.status === "ready" && view?.authoritativeSha === candidateSha) {
          return { ok: true, view };
        }
        return { ok: false, view };
      },
      { timeoutMs: 180_000, label: "preview_after_apply" },
    );
    markInvariant("preview_after_apply_durable", afterApplyPreview.ok === true, {
      preview: afterApplyPreview.view?.preview?.status,
      authoritativeSha: afterApplyPreview.view?.authoritativeSha,
    });

    const pushAfter = remotesPushEvidence(projectRoot);
    markInvariant(
      "no_remote_push",
      !pushAfter.hasRemote || pushAfter.branchStatus === pushBefore2.branchStatus,
      { before: pushBefore2, after: pushAfter },
    );

    const iceAfter = readBuildRecord(runtimeRoot, ICE_ID);
    markInvariant(
      "ice_untouched",
      (iceAfter?.authoritativeSha || null) === (icePrior?.authoritativeSha || null) &&
        engineerChildren(iceAfter).length === engineerChildren(icePrior).length,
      {
        before: icePrior?.authoritativeSha,
        after: iceAfter?.authoritativeSha,
        iceEngineersBefore: engineerChildren(icePrior).length,
        iceEngineersAfter: engineerChildren(iceAfter).length,
      },
    );

    const finalEng = engineerChildren(settle).length;
    markInvariant("max_two_engineer_turns", finalEng === phase7BaselineEngineers + 2, {
      phase7BaselineEngineers,
      finalEng,
      delta: finalEng - phase7BaselineEngineers,
    });

    evidence.final = {
      authoritativeSha: settle.authoritativeSha,
      head: headAfterApply,
      provider1: eng1?.provider,
      provider2: eng2?.provider,
      run1CandidateSha: RUN1_CANDIDATE_SHA,
      run2CandidateSha: candidateSha,
      adoptionCountDelta: adoptionsAfter.length - adoptionsBefore2,
    };
    evidence.ok = evidence.failures.length === 0;
    note("phase7_live_scenario_complete", evidence.final);
    writeEvidence();
    console.log("PHASE7_LIVE_OK", settle.authoritativeSha);
  } finally {
    writeEvidence();
    try {
      await surface.stop({ teardownOwned: true });
    } catch (error) {
      console.error("surface stop error", error);
    }
  }

  if (!evidence.ok) {
    process.exitCode = 1;
    return;
  }

  // ── Closeout: cold check → pack → audit → isolated install ─────────────
  // These do not change Builder CODE_PATHS loaded identity of the live run
  // (already completed). They prove the same tip packages cleanly.
  note("closeout_begin", { builderSha: BUILDER_SHA });

  const check = spawnSync("npm", ["run", "check"], {
    cwd: packageRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(join(outDir, "cold-check.log"), (check.stdout || "") + (check.stderr || ""));
  if (check.status !== 0) fail("COLD_CHECK_FAILED", { status: check.status, tail: (check.stdout || "").slice(-800) });
  note("cold_check", { status: 0 });

  const packDir = join(outDir, "pack");
  mkdirSync(packDir, { recursive: true });
  const pack = spawnSync("npm", ["pack", "--pack-destination", packDir], {
    cwd: packageRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (pack.status !== 0) fail("PACK_FAILED", pack.stderr || pack.stdout);
  const tgz = readdirSync(packDir).find((n) => n.endsWith(".tgz"));
  if (!tgz) fail("PACK_NO_TGZ", readdirSync(packDir));
  const tgzPath = join(packDir, tgz);
  note("pack", { tgz: tgzPath });

  const audit = spawnSync("node", ["scripts/audit-release.mjs", "--tarball", tgzPath], {
    cwd: packageRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  writeFileSync(join(outDir, "audit-release.log"), (audit.stdout || "") + (audit.stderr || ""));
  if (audit.status !== 0) fail("AUDIT_FAILED", { status: audit.status, tail: (audit.stdout || audit.stderr || "").slice(-800) });
  note("audit_release", { status: 0 });

  const installRoot = mkdtempSync(join(tmpdir(), "path-p7-isolated-"));
  try {
    const install = spawnSync("npm", ["install", "--prefix", installRoot, tgzPath], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    writeFileSync(join(outDir, "isolated-install.log"), (install.stdout || "") + (install.stderr || ""));
    if (install.status !== 0) fail("ISOLATED_INSTALL_FAILED", { status: install.status, tail: (install.stderr || "").slice(-800) });
    const installedPkg = join(installRoot, "node_modules", "path-code", "package.json");
    if (!existsSync(installedPkg)) fail("ISOLATED_INSTALL_MISSING_PKG", installedPkg);
    const bin = join(installRoot, "node_modules", ".bin", "path-build");
    const help = spawnSync(bin, ["--help"], { encoding: "utf8" });
    markInvariant(
      "isolated_install",
      help.status === 0 && /PATH Build/i.test(help.stdout || ""),
      {
        installRoot,
        helpStatus: help.status,
        helpHead: (help.stdout || "").slice(0, 200),
        packageRootIsCheckout: resolve(installRoot) === resolve(packageRoot),
      },
    );
    note("isolated_install", { installRoot, binExists: existsSync(bin) });
  } finally {
    try {
      rmSync(installRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  evidence.ok = evidence.failures.length === 0;
  note("phase7_closeout_complete", { ok: evidence.ok });
  writeEvidence();
  console.log(evidence.ok ? "PHASE7_ACCEPTANCE_OK" : "PHASE7_ACCEPTANCE_FAIL");
  if (!evidence.ok) process.exitCode = 1;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    try {
      const packageRoot = resolvePathPackageRoot();
      const outDir = join(packageRoot, "docs/reports/PHASE_7_ACCEPTANCE");
      mkdirSync(outDir, { recursive: true });
      evidence.endedAt = new Date().toISOString();
      evidence.fatal = String(error?.stack || error);
      writeFileSync(join(outDir, "acceptance.json"), JSON.stringify(evidence, null, 2) + "\n");
    } catch {
      /* ignore */
    }
    process.exitCode = 1;
  });
}
