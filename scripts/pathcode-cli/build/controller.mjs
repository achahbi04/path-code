/**
 * S5 — PATH Build controller (Option A′ durable product-level loop).
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readTaskCheckpoint } from "../ag10/task-checkpoint.mjs";
import { resolvePathRuntimeRoot } from "../paths.mjs";
import {
  engineeringReportExists,
  resolveEngineeringReportPath,
} from "../engineering-report.mjs";
import {
  createBuildRecordSkeleton,
  makeBuildActionId,
  readBuildRecord,
  writeBuildRecord,
  findLatestActiveBuild,
  scrubBuildTempFiles,
  drainPendingConversations,
} from "./record.mjs";
import { ensureBuildOrigin, isBindableProject } from "./origin.mjs";
import { isEmptyProductTree } from "./adopt.mjs";
import {
  captureBindingReality,
  makeEvidenceRef,
} from "./evidence.mjs";
import {
  realityRefreshDepthA,
  parseStatusDirectives,
  readReportText,
} from "./reinspect.mjs";
import {
  decideChildReconciliation,
  loadChildTruth,
  extractProviderProvenance,
} from "./reconcile.mjs";
import {
  parseBuildCognitiveResult,
  cognitiveResultToDirectives,
} from "./cognitive-result.mjs";
import {
  frameEngineerObjective,
  frameEvaluateObjective,
  frameChallengeObjective,
  completenessClaim,
} from "./objectives.mjs";
import { decideEngineerProductAdoption } from "./result-evidence.mjs";
import { writeResultLifecycle } from "../result-lifecycle.mjs";
import {
  makePendingCandidate,
  restoreAuthoritativeCheckout,
} from "./candidate.mjs";
import { resolveMutatingEngineAttempt, resolvePreferredEngine } from "../ag10/engine-contract.mjs";
import { formatBuildStatus } from "./format.mjs";
import { detectBuildArtifact } from "./runtime/artifact.mjs";
import { appendBuildEvent } from "./events.mjs";
import { mechanicalProbeBinding } from "./mechanical-probe.mjs";
import {
  briefToOutcomeCriteria,
  deriveProductBrief,
  inferProductKind,
  parseProductBriefResult,
  productBriefObjective,
} from "./brief.mjs";

/**
 * Bind conversation rows to the intent revision and the child that is actually
 * carrying that revision. Applied only after an engineer adoption for that
 * revision. Failed when that revision's children have ended without adoption
 * and nothing is still running.
 *
 * @param {import('./types.mjs').BuildRecord} record
 */
function syncConversationLifecycle(record) {
  if (!Array.isArray(record?.conversation)) return;
  const kids = Array.isArray(record.children) ? record.children : [];
  /** @type {Set<number>} */
  const revisions = new Set();
  for (const msg of record.conversation) {
    if (msg && Number.isFinite(msg.intentRevision)) revisions.add(msg.intentRevision);
  }
  for (const rev of revisions) {
    const revKids = kids.filter(
      (child) => child.intentRevision === rev && !child.orphanAbandoned,
    );
    const engineers = revKids.filter((child) => child.kind === "engineer");
    const latestEngineer = engineers.length ? engineers[engineers.length - 1] : null;
    const latestAdopted = Boolean(latestEngineer?.adoptedSha);
    const awaitingCandidate =
      record.pendingCandidate?.status === "pending" &&
      (record.pendingCandidate.intentRevision == null ||
        record.pendingCandidate.intentRevision === rev);
    const discardedThisRevision =
      !awaitingCandidate &&
      !latestAdopted &&
      Boolean(latestEngineer?.taskId) &&
      record.lastDiscardedCandidate?.taskId === latestEngineer.taskId;
    const live = (kind) =>
      revKids.some(
        (child) =>
          child.kind === kind &&
          (child.dispatchState === "dispatched" ||
            child.dispatchState === "selected" ||
            child.dispatchState === "terminal_seen"),
      );
    const latestFailed =
      latestEngineer &&
      latestEngineer.dispatchState === "consumed" &&
      !latestEngineer.adoptedSha &&
      !awaitingCandidate &&
      !discardedThisRevision &&
      /FAIL|CANCEL|NOT_VERIFIED|BLOCKED/i.test(String(latestEngineer.classification || ""));
    let status = "queued";
    if (awaitingCandidate) status = "review";
    else if (discardedThisRevision) status = "discarded";
    else if (live("engineer")) status = "applying";
    else if (latestAdopted) status = "applied";
    else if (latestFailed) status = "failed";
    else if (live("brief") || live("evaluate") || live("challenge")) status = "preparing";
    else if (
      !awaitingCandidate &&
      !discardedThisRevision &&
      revKids.some((child) => child.dispatchState === "consumed")
    ) {
      status = "failed";
    }
    for (const msg of record.conversation) {
      if (!msg || msg.intentRevision !== rev) continue;
      // Terminal creator decisions and superseded orphans are sticky.
      if (msg.status === "superseded") continue;
      if (msg.status === "applied" && status !== "applied") continue;
      if (msg.status === "discarded" && status !== "discarded" && !awaitingCandidate) {
        continue;
      }
      msg.status = status;
    }
  }
  supersedeOrphanedCreatorRequests(record);
}

/**
 * One creator request → one visible card. When a later revision reaches a real
 * creator outcome (or simply advances past an unfinished earlier request),
 * orphaned earlier queued/preparing cards must not remain as a second QUEUED.
 *
 * @param {import('./types.mjs').BuildRecord} record
 */
function supersedeOrphanedCreatorRequests(record) {
  if (!Array.isArray(record?.conversation)) return;
  const kids = Array.isArray(record.children) ? record.children : [];
  const currentRev = Number(record.intent?.outcomeRevision);
  if (!Number.isFinite(currentRev)) return;
  for (const msg of record.conversation) {
    if (!msg || msg.role !== "user") continue;
    if (
      msg.status === "applied" ||
      msg.status === "discarded" ||
      msg.status === "superseded"
    ) {
      continue;
    }
    const rev = msg.intentRevision;
    if (!Number.isFinite(rev) || rev >= currentRev) continue;
    const engineers = kids.filter(
      (child) =>
        child.kind === "engineer" &&
        child.intentRevision === rev &&
        !child.orphanAbandoned,
    );
    const adopted = engineers.some((child) => Boolean(child.adoptedSha));
    const discarded = engineers.some(
      (child) => child.taskId && child.taskId === record.lastDiscardedCandidate?.taskId,
    );
    // No creator decision on this older revision — newer request replaced it.
    if (!adopted && !discarded) {
      msg.status = "superseded";
    }
  }
}

function fabricStepsRemaining(record) {
  const steps = record?.loop?.fabricSteps;
  if (!Array.isArray(steps)) return [];
  return steps
    .filter((step) => typeof step === "string" && step.trim())
    .map((step) => step.trim());
}

/**
 * Creator Discard is a completed decision for that engineer result.
 * Resume/tick must not treat it as an unresolved engineering failure.
 * @param {import('./types.mjs').BuildRecord} record
 */
function revisionDiscardedWithoutAdoption(record) {
  if (!record || record.pendingCandidate?.status === "pending") return false;
  const discardedTaskId = record.lastDiscardedCandidate?.taskId;
  if (!discardedTaskId) return false;
  const rev = record.intent?.outcomeRevision;
  const engineers = (record.children || []).filter(
    (child) =>
      child.kind === "engineer" &&
      !child.orphanAbandoned &&
      (rev == null || child.intentRevision === rev),
  );
  const latest = engineers.length ? engineers[engineers.length - 1] : null;
  if (!latest?.taskId) return false;
  if (latest.adoptedSha) return false;
  return latest.taskId === discardedTaskId;
}

function adoptedEngineerForRevision(record) {
  const rev = record?.intent?.outcomeRevision;
  const engineers = (record?.children || []).filter(
    (child) =>
      child.kind === "engineer" &&
      child.intentRevision === rev &&
      !child.orphanAbandoned &&
      child.dispatchState === "consumed" &&
      child.adoptedSha &&
      /VERIFIED|SUCCESS/i.test(String(child.classification || "")),
  );
  return engineers.length ? engineers[engineers.length - 1] : null;
}

function normalizeSelectedElement(value) {
  if (!value || typeof value !== "object") return null;
  const text = (key, limit) =>
    typeof value[key] === "string" && value[key].trim()
      ? value[key].trim().slice(0, limit)
      : null;
  const rect =
    value.rect && typeof value.rect === "object"
      ? Object.fromEntries(
          ["x", "y", "width", "height"]
            .filter((key) => Number.isFinite(value.rect[key]))
            .map((key) => [key, Number(value.rect[key])]),
        )
      : null;
  const dataAttrs =
    value.dataAttrs && typeof value.dataAttrs === "object"
      ? Object.fromEntries(
          Object.entries(value.dataAttrs)
            .filter(
              ([key, item]) =>
                /^data-[\w:-]+$/.test(key) && typeof item === "string",
            )
            .slice(0, 20)
            .map(([key, item]) => [key, item.slice(0, 300)]),
        )
      : null;
  const element = {
    buildId: text("buildId", 120),
    tag: text("tag", 80),
    id: text("id", 200),
    className: text("className", 500),
    text: text("text", 1_000),
    selector: text("selector", 1_000),
    path: text("path", 1_000),
    ...(rect && Object.keys(rect).length ? { rect } : {}),
    ...(dataAttrs && Object.keys(dataAttrs).length ? { dataAttrs } : {}),
  };
  return Object.fromEntries(
    Object.entries(element).filter(([, item]) => item !== null),
  );
}

/**
 * @typedef {{
 *   bindProject: (cwd: string) => Promise<object>,
 *   startTask: (objective: string, extra?: object) => Promise<object>,
 *   resumeTask?: (taskId: string, extra?: object) => Promise<object>,
 *   awaitTask: (taskId: string, timeoutMs?: number) => Promise<object>,
 *   snapshotTask?: (taskId: string) => Promise<object>,
 *   steerTask?: (taskId: string, text: string) => Promise<object>,
 *   cancelTask?: (taskId: string) => Promise<object> | object,
 *   getResult?: (taskId: string) => Promise<object>,
 * }} BuildGatewayPort
 */

/**
 * @param {{
 *   runtimeRoot: string,
 *   gateway: BuildGatewayPort,
 *   fakeMode?: boolean,
 *   preferredEngine?: string | null,
 *   dispatchIdentity?: () => object,
 * }} opts
 */
export function createBuildController(opts) {
  const runtimeRoot = opts.runtimeRoot;
  const gateway = opts.gateway;
  const fakeMode = opts.fakeMode === true;
  const dispatchIdentity =
    typeof opts.dispatchIdentity === "function" ? opts.dispatchIdentity : null;
  const controllerPreferredEngine =
    typeof opts.preferredEngine === "string" && opts.preferredEngine.trim()
      ? opts.preferredEngine.trim()
      : typeof process.env.PATHCODE_PREFERRED_ENGINE === "string" &&
          process.env.PATHCODE_PREFERRED_ENGINE.trim()
        ? process.env.PATHCODE_PREFERRED_ENGINE.trim()
        : null;

  /**
   * @param {string} taskId
   */
  function resolveTaskCheckpoint(taskId) {
    const local = readTaskCheckpoint(runtimeRoot, taskId);
    if (local) return local;
    try {
      const fallback = resolvePathRuntimeRoot();
      if (fallback && fallback !== runtimeRoot) {
        return readTaskCheckpoint(fallback, taskId);
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * @param {string} taskId
   */
  function gatewayProbeHints(taskId) {
    if (typeof gateway.snapshotTask !== "function") return null;
    try {
      return gateway.snapshotTask(taskId);
    } catch {
      return null;
    }
  }

  /**
   * Browser evidence is only meaningful after real product engineering exists.
   * Fresh empty Build roots must NOT be treated as stale — that blocked first dispatch.
   * @param {import('./types.mjs').BuildRecord} record
   */
  function browserEvidenceStale(record) {
    if (!record?.authoritativeSha) return false;
    const binding = primaryBinding(record);
    const hasAdoptedProduct = (record.children || []).some(
      (c) =>
        c.kind === "engineer" &&
        c.dispatchState === "consumed" &&
        !c.orphanAbandoned &&
        Boolean(c.adoptedSha),
    );
    if (!hasAdoptedProduct) return false;
    if (binding?.projectRoot && isEmptyProductTree(binding.projectRoot)) {
      return false;
    }
    if (binding?.projectRoot) {
      const artifact = detectBuildArtifact(binding.projectRoot, {
        outcomeHint: record.intent?.outcome,
      });
      if (artifact?.preview?.capability !== "web") return false;
    }
    const fresh = Array.isArray(record.browserEvidence)
      ? record.browserEvidence.filter((e) => e && e.ok).slice(-1)[0]
      : null;
    if (!fresh) return true;
    if (
      fresh.authoritativeSha &&
      fresh.authoritativeSha !== record.authoritativeSha
    ) {
      return true;
    }
    return false;
  }

  /**
   * @param {import('./types.mjs').BuildRecord} record
   * @param {string} bindingId
   * @param {{
   *   taskId?: string,
   *   changedFiles?: string[],
   *   worktreePath?: string,
   *   taskBranch?: string,
   *   taskSha?: string,
   * }} ctx
   */
  function buildProbeInput(record, bindingId, ctx = {}) {
    const binding = (record.projectBindings || []).find(
      (b) => b.bindingId === bindingId,
    );
    const bindingWorktree =
      binding?.activeWorktreePath && existsSync(binding.activeWorktreePath)
        ? binding.activeWorktreePath
        : undefined;
    return {
      record,
      bindingId,
      taskId: ctx.taskId,
      changedFiles: ctx.changedFiles || [],
      worktreePath: ctx.worktreePath || bindingWorktree,
      taskBranch: ctx.taskBranch || binding?.activeTaskBranch,
      taskSha: ctx.taskSha,
    };
  }

  /**
   * @param {ReturnType<typeof resolveTaskCheckpoint>} cp
   * @param {ReturnType<typeof gatewayProbeHints>} snap
   * @param {ReturnType<typeof captureBindingReality>|null} reality
   */
  function probeContextFromChild(cp, snap, reality) {
    const changedFiles =
      (Array.isArray(cp?.changedFiles) && cp.changedFiles) ||
      (Array.isArray(snap?.result?.changedFiles) && snap.result.changedFiles) ||
      reality?.changedFiles ||
      [];
    const worktreePath =
      (typeof cp?.worktreePath === "string" && cp.worktreePath) ||
      (typeof snap?.worktreePath === "string" && snap.worktreePath) ||
      undefined;
    const taskBranch =
      (typeof cp?.branch === "string" && cp.branch) ||
      (typeof snap?.taskBranch === "string" && snap.taskBranch) ||
      undefined;
    const taskSha =
      (typeof cp?.sha === "string" && cp.sha) ||
      (typeof snap?.commitSha === "string" && snap.commitSha) ||
      undefined;
    return { changedFiles, worktreePath, taskBranch, taskSha };
  }

  /**
   * @param {import('./types.mjs').BuildRecord} record
   * @param {import('./types.mjs').BuildChild} child
   * @param {ReturnType<typeof resolveTaskCheckpoint>} cp
   * @param {ReturnType<typeof gatewayProbeHints>} snap
   * @param {string} classification
   */
  function noteEngineerProductRoots(record, child, cp, snap, classification) {
    if (child.kind !== "engineer" || !/VERIFIED/i.test(classification)) return;
    const binding = (record.projectBindings || []).find(
      (b) => b.bindingId === child.bindingId,
    );
    if (!binding) return;
    const wt =
      (typeof cp?.worktreePath === "string" && cp.worktreePath) ||
      (typeof snap?.worktreePath === "string" && snap.worktreePath) ||
      null;
    const branch =
      (typeof cp?.branch === "string" && cp.branch) ||
      (typeof snap?.taskBranch === "string" && snap.taskBranch) ||
      null;
    if (wt && wt !== binding.projectRoot && existsSync(wt)) {
      binding.activeWorktreePath = wt;
    } else if (
      binding.activeWorktreePath &&
      !existsSync(binding.activeWorktreePath)
    ) {
      delete binding.activeWorktreePath;
    }
    if (branch) binding.activeTaskBranch = branch;
  }

  /**
   * @param {import('./types.mjs').BuildTaskKind} kind
   * @param {{ preferEngine?: string|null, preferredEngine?: string|null }} [extra]
   * @returns {string|undefined}
   */
  function resolveDispatchPreferredEngine(kind, extra = {}) {
    if (kind === "challenge") return undefined;
    if (extra.preferEngine === null || extra.preferredEngine === null) {
      return undefined;
    }
    const fromExtra =
      (typeof extra.preferredEngine === "string" && extra.preferredEngine) ||
      (typeof extra.preferEngine === "string" && extra.preferEngine) ||
      null;
    const resolved = resolvePreferredEngine({
      prefer: fromExtra || controllerPreferredEngine || null,
    });
    return resolved || undefined;
  }

  /**
   * @param {string} outcome
   * @param {{
   *   targetDir: string,
   *   explicitRequirements?: Array<{ statement: string, id?: string }>,
   *   initialCriteria?: Array<{ id?: string, statement: string, required?: boolean }>,
   * }} options
   */
  async function startBuild(outcome, options) {
    scrubBuildTempFiles(runtimeRoot);
    const record = createBuildRecordSkeleton({
      outcome,
      explicitRequirements: options.explicitRequirements || [],
    });

    const originKind =
      options.originKind === "existing-project"
        ? "existing-project"
        : "build-created";
    record.originKind = originKind;

    // Product brief → concrete acceptance criteria (not only c-runnable/c-outcome).
    const brief = deriveProductBrief(String(outcome || ""), {
      buildId: record.buildId,
      intentRevision: record.intent.outcomeRevision,
    });
    record.productBrief = brief;

    if (Array.isArray(options.initialCriteria) && options.initialCriteria.length) {
      record.criteriaAuthority = "caller";
      // Caller-supplied criteria are authoritative (tests / harnesses).
      const now = new Date().toISOString();
      record.outcomeCriteria = options.initialCriteria.map((c, i) => ({
        id: c.id || `c-${i + 1}`,
        statement: String(c.statement || "").slice(0, 2_000),
        required: c.required !== false,
        status: /** @type {const} */ ("UNKNOWN"),
        evidence: [],
        updatedAt: now,
        source: "caller",
      }));
    } else {
      record.outcomeCriteria = briefToOutcomeCriteria(brief);
    }

    record.conversation = [
      {
        id: `msg-${randomUUID().slice(0, 8)}`,
        role: "user",
        text: String(outcome || "").trim(),
        at: new Date().toISOString(),
        kind: "outcome",
        status: "queued",
        intentRevision: record.intent.outcomeRevision,
      },
    ];

    let projectRoot = options.targetDir;
    if (originKind === "build-created") {
      // Exact-root Build origin — never upward-discover $HOME.
      const origin = ensureBuildOrigin({
        targetDir: projectRoot,
        exactRoot: true,
      });
      if (!origin.ok) return origin;
      record.projectBindings.push(origin.binding);
      projectRoot = origin.binding.projectRoot;
    } else if (!isBindableProject(projectRoot)) {
      const origin = ensureBuildOrigin({
        targetDir: projectRoot,
        exactRoot: false,
      });
      if (!origin.ok) return origin;
      record.projectBindings.push(origin.binding);
      projectRoot = origin.binding.projectRoot;
    } else {
      const { resolveTargetProjectRoot, assertAllowedProjectRoot } = await import(
        "../paths.mjs"
      );
      const discovered = resolveTargetProjectRoot(projectRoot);
      if (!discovered.ok) {
        return {
          ok: false,
          code: discovered.code,
          message: discovered.message,
        };
      }
      const allowed = assertAllowedProjectRoot(discovered.projectRoot);
      if (!allowed.ok) {
        return {
          ok: false,
          code: allowed.code,
          message: allowed.message,
        };
      }
      record.projectBindings.push({
        bindingId: `bind-${randomUUID().slice(0, 8)}`,
        projectRoot: discovered.projectRoot,
        originGitInit: false,
        originKind: "existing-project",
      });
      projectRoot = discovered.projectRoot;
    }

    {
      const { assertAllowedProjectRoot } = await import("../paths.mjs");
      const allowed = assertAllowedProjectRoot(projectRoot);
      if (!allowed.ok) {
        return {
          ok: false,
          code: allowed.code,
          message: allowed.message,
        };
      }
    }

    const bound = await gateway.bindProject(projectRoot);
    if (bound && bound.ok === false) return bound;

    record.hypotheses.proposedNextAction =
      "Establish the software architecture, manifests, and runnable structure required by the outcome.";
    record.hypotheses.gapPlan = [
      "origin established — first engineer establishes architecture",
    ];
    record.loop.pendingReinspect = false;
    record.productBranch = `path-build/${record.buildId.slice(0, 8)}`;
    record.adoptionHistory = [];
    record.browserEvidence = [];

    // Seed product branch so subsequent task worktrees can merge back.
    try {
      const { ensureBuildProductBranch } = await import("./adopt.mjs");
      const seeded = ensureBuildProductBranch({
        projectRoot,
        productBranch: record.productBranch,
      });
      if (seeded.ok) {
        record.authoritativeSha = seeded.authoritativeSha;
      }
    } catch {
      /* non-fatal — first engineer may still establish commits */
    }

    writeBuildRecord(runtimeRoot, record);
    return { ok: true, build: record, projectRoot, originKind };
  }

  /**
   * @param {string} buildId
   */
  function load(buildId) {
    return readBuildRecord(runtimeRoot, buildId);
  }

  /**
   * Reconcile all Build children against PATH task truth; consume terminals once.
   * @param {string} buildId
   */
  async function reconcileBuildChildren(buildId) {
    scrubBuildTempFiles(runtimeRoot);
    let record = readBuildRecord(runtimeRoot, buildId);
    if (!record) {
      return { ok: false, code: "BUILD_NOT_FOUND", message: `no build ${buildId}` };
    }

    /** @type {object[]} */
    const decisions = [];
    for (const child of record.children) {
      if (child.dispatchState === "consumed") continue;
      const truth = await loadChildTruth(runtimeRoot, child.taskId, gateway);
      const decision = decideChildReconciliation({
        child,
        cp: truth.cp,
        snap: truth.snap,
        reportText: truth.reportText,
        traceLines: truth.traceLines,
      });
      decisions.push({ taskId: child.taskId, ...decision });

      if (decision.action === "mark_dispatched") {
        child.dispatchState = "dispatched";
        child.dispatchedAt = child.dispatchedAt || new Date().toISOString();
      }
      if (decision.action === "mark_terminal_and_consume") {
        child.dispatchState = "terminal_seen";
        child.terminalAt = child.terminalAt || new Date().toISOString();
        child.classification = decision.classification || child.classification;
        if (decision.provider) child.provider = decision.provider;
        if (decision.engineMode) child.engineMode = decision.engineMode;
        if (decision.orphan) {
          child.orphanAbandoned = true;
        }
      }
    }

    writeBuildRecord(runtimeRoot, record);

    for (const child of [...(readBuildRecord(runtimeRoot, buildId)?.children || [])]) {
      if (child.dispatchState === "terminal_seen") {
        await consumeChildResult(buildId, child.taskId);
      }
    }

    record = readBuildRecord(runtimeRoot, buildId) || record;
    if (record.loop.pendingReinspect) {
      await runDepthA(buildId);
      record = readBuildRecord(runtimeRoot, buildId) || record;
    }

    // Heal conversation truth on recover/reconcile so orphan QUEUED cards
    // left by corrected re-sends become superseded and stay that way.
    syncConversationLifecycle(record);
    writeBuildRecord(runtimeRoot, record);
    record = readBuildRecord(runtimeRoot, buildId) || record;

    return { ok: true, build: record, decisions };
  }

  /**
   * Recover Build + children; idempotent consume; pending reinspect.
   * @param {string} buildId
   */
  async function recover(buildId) {
    return reconcileBuildChildren(buildId);
  }

  async function stopBuild(buildId) {
    const record = readBuildRecord(runtimeRoot, buildId);
    if (!record) return { ok: false, code: "BUILD_NOT_FOUND" };
    const active = [...(record.children || [])]
      .reverse()
      .find(
        (child) =>
          child.dispatchState === "selected" ||
          child.dispatchState === "dispatched",
      );
    if (active && typeof gateway.cancelTask === "function") {
      try {
        await gateway.cancelTask(active.taskId);
      } catch (error) {
        record.loop.lastControlError = {
          operation: "stop",
          message: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        };
      }
    }
    if (record.pendingCandidate?.status === "pending") {
      record.loop.status = "awaiting_review";
    } else {
      record.loop.status = "paused";
      record.loop.pausedAt = new Date().toISOString();
    }
    record.loop.pausedTaskId = active?.taskId || null;
    record.loop.pauseRequested = false;
    writeBuildRecord(runtimeRoot, record);
    return { ok: true, build: readBuildRecord(runtimeRoot, buildId) };
  }

  /**
   * Finish the current safe engineering boundary, then dispatch nothing else.
   * Does not cancel the in-flight provider call.
   * @param {string} buildId
   */
  async function pauseBuild(buildId) {
    const record = readBuildRecord(runtimeRoot, buildId);
    if (!record) return { ok: false, code: "BUILD_NOT_FOUND" };
    if (record.loop.status === "complete") {
      return { ok: true, alreadyComplete: true, build: record };
    }
    const active = [...(record.children || [])]
      .reverse()
      .find(
        (child) =>
          child.dispatchState === "selected" ||
          child.dispatchState === "dispatched" ||
          child.dispatchState === "terminal_seen",
      );
    record.loop.pauseRequested = true;
    record.loop.pauseRequestedAt = new Date().toISOString();
    if (record.pendingCandidate?.status === "pending") {
      record.loop.status = "awaiting_review";
      record.loop.pauseRequested = false;
    } else if (!active) {
      record.loop.status = "paused";
      record.loop.pausedAt = record.loop.pauseRequestedAt;
      record.loop.pauseRequested = false;
    }
    writeBuildRecord(runtimeRoot, record);
    return { ok: true, build: readBuildRecord(runtimeRoot, buildId) };
  }

  async function resumeBuild(buildId) {
    let record = readBuildRecord(runtimeRoot, buildId);
    if (!record) return { ok: false, code: "BUILD_NOT_FOUND" };
    if (record.loop.status === "complete") {
      return { ok: true, alreadyComplete: true, build: record, decisions: [] };
    }
    const reconciled = await reconcileBuildChildren(buildId);
    record = readBuildRecord(runtimeRoot, buildId) || record;
    record.loop.resumedAt = new Date().toISOString();
    record.loop.blockedReason = undefined;
    record.loop.pauseRequested = false;
    if (record.pendingCandidate?.status === "pending") {
      record.loop.status = "awaiting_review";
      writeBuildRecord(runtimeRoot, record);
      return {
        ok: reconciled.ok !== false,
        awaitingReview: true,
        build: readBuildRecord(runtimeRoot, buildId),
        decisions: reconciled.decisions || [],
      };
    }
    // Discarded candidate is terminal for that result — idle usable state,
    // composer enabled, no auto-engine, authoritative SHA unchanged.
    if (revisionDiscardedWithoutAdoption(record)) {
      record.loop.status = "paused";
      record.loop.pausedAt = record.loop.pausedAt || new Date().toISOString();
      syncConversationLifecycle(record);
      writeBuildRecord(runtimeRoot, record);
      return {
        ok: reconciled.ok !== false,
        awaitCreator: true,
        build: readBuildRecord(runtimeRoot, buildId),
        decisions: reconciled.decisions || [],
      };
    }
    record.loop.status = "running";
    writeBuildRecord(runtimeRoot, record);
    return {
      ok: reconciled.ok !== false,
      build: readBuildRecord(runtimeRoot, buildId),
      decisions: reconciled.decisions || [],
    };
  }

  /**
   * Cancel + consume active evaluate/challenge so product steers can engineer next.
   * Never steer a cognitive child into product mutation.
   * @param {string} buildId
   * @param {string} [reason]
   */
  async function supersedeActiveCognitiveChildren(buildId, reason = "SUPERSEDED_BY_STEER") {
    let record = readBuildRecord(runtimeRoot, buildId);
    if (!record) return { ok: false, code: "BUILD_NOT_FOUND" };
    const active = (record.children || []).filter(
      (c) =>
        (c.kind === "evaluate" || c.kind === "challenge") &&
        (c.dispatchState === "dispatched" ||
          c.dispatchState === "selected" ||
          c.dispatchState === "terminal_seen"),
    );
    /** @type {string[]} */
    const superseded = [];
    for (const child of active) {
      if (typeof gateway.cancelTask === "function") {
        try {
          await gateway.cancelTask(child.taskId);
        } catch {
          /* best-effort */
        }
      }
      child.dispatchState = "terminal_seen";
      child.terminalAt = child.terminalAt || new Date().toISOString();
      child.classification = reason;
      child.orphanAbandoned = true;
      superseded.push(child.taskId);
    }
    if (superseded.length) {
      writeBuildRecord(runtimeRoot, record);
      for (const taskId of superseded) {
        await consumeChildResult(buildId, taskId);
      }
    }
    return {
      ok: true,
      superseded,
      build: readBuildRecord(runtimeRoot, buildId),
    };
  }

  /**
   * @param {string} buildId
   * @param {string} [bindingId]
   * @param {string} [childTaskId]
   */
  async function runDepthA(buildId, bindingId, childTaskId) {
    const record = readBuildRecord(runtimeRoot, buildId);
    if (!record) {
      return { ok: false, code: "BUILD_NOT_FOUND" };
    }
    const binding =
      (bindingId &&
        record.projectBindings.find((b) => b.bindingId === bindingId)) ||
      record.projectBindings[0];
    if (!binding) {
      return { ok: false, code: "NO_BINDING" };
    }

    const refresh = realityRefreshDepthA({
      runtimeRoot,
      record,
      bindingId: binding.bindingId,
      childTaskId,
    });
    if (!refresh.ok) return refresh;

    record.loop.lastRealityDelta = refresh.delta;
    record.loop.pendingReinspect = false;
    writeBuildRecord(runtimeRoot, record);

    if (!fakeMode) {
      try {
        const cp = childTaskId ? resolveTaskCheckpoint(childTaskId) : null;
        const snap = childTaskId ? gatewayProbeHints(childTaskId) : null;
        const ctx = probeContextFromChild(cp, snap, null);
        const probe = mechanicalProbeBinding(
          buildProbeInput(record, binding.bindingId, {
            taskId: childTaskId,
            changedFiles:
              refresh.delta?.changedFiles?.length
                ? refresh.delta.changedFiles
                : ctx.changedFiles,
            worktreePath: ctx.worktreePath,
            taskBranch: ctx.taskBranch,
            taskSha: ctx.taskSha,
          }),
        );
        if (probe.ok && Array.isArray(probe.updates) && probe.updates.length) {
          writeBuildRecord(runtimeRoot, record);
        }
      } catch {
        // best-effort mechanical refresh after Depth A
      }
    }

    return {
      ok: true,
      delta: refresh.delta,
      recommendedNext: refresh.recommendedNext,
      needsTargetedRevalidation: refresh.needsTargetedRevalidation,
      build: readBuildRecord(runtimeRoot, buildId) || record,
    };
  }

  /**
   * @param {import('./types.mjs').BuildChildRecord} child
   */
  function childVerificationClass(child) {
    if (!child?.taskId) return "";
    let cls = String(child.classification || "");
    if (/VERIFIED/i.test(cls)) return cls;
    const cp = resolveTaskCheckpoint(child.taskId);
    cls = String(
      cls ||
        (cp?.validation && cp.validation.classification) ||
        cp?.finalState ||
        "",
    );
    if (/VERIFIED/i.test(cls)) return cls;
    if (
      typeof gateway.snapshotTask === "function" &&
      (child.kind === "evaluate" || child.kind === "challenge")
    ) {
      try {
        const snap = gateway.snapshotTask(child.taskId);
        if (snap && typeof snap.then === "function") {
          void snap.catch(() => {});
        } else {
          const fromSnap = snap && snap.classification ? String(snap.classification) : "";
          if (/VERIFIED/i.test(fromSnap)) return fromSnap;
        }
      } catch {
        // best-effort
      }
    }
    return cls;
  }

  /**
   * @param {import('./types.mjs').BuildRecord} record
   */
  function primaryBinding(record) {
    return record.projectBindings[0] || null;
  }

  /**
   * @param {string} buildId
   * @param {import('./types.mjs').BuildTaskKind} kind
   * @param {string} objective
   * @param {{ bindingId?: string, preferEngine?: string|null, preferredEngine?: string|null }} [extra]
   */
  async function dispatchChild(buildId, kind, objective, extra = {}) {
    let record = readBuildRecord(runtimeRoot, buildId);
    if (!record) {
      return { ok: false, code: "BUILD_NOT_FOUND" };
    }
    if (record.loop.pendingReinspect) {
      return {
        ok: false,
        code: "REINSPECT_PENDING",
        message: "Complete reality re-inspection before dispatching the next child.",
      };
    }
    if (record.loop.status === "complete") {
      return { ok: false, code: "BUILD_COMPLETE", message: "Build already complete." };
    }

    const binding =
      (extra.bindingId &&
        record.projectBindings.find((b) => b.bindingId === extra.bindingId)) ||
      primaryBinding(record);
    if (!binding) {
      return { ok: false, code: "NO_BINDING" };
    }

    const actionId = makeBuildActionId(
      kind,
      `${buildId}:${record.children.length}:${objective.slice(0, 200)}:${record.intent.outcomeRevision}`,
    );

    // Idempotent: existing child with same actionId
    const existing = record.children.find((c) => c.actionId === actionId);
    if (existing) {
      if (existing.dispatchState === "consumed") {
        return {
          ok: true,
          deduped: true,
          taskId: existing.taskId,
          actionId,
          build: record,
        };
      }
      if (
        existing.dispatchState === "dispatched" ||
        existing.dispatchState === "terminal_seen"
      ) {
        return {
          ok: true,
          resumed: true,
          taskId: existing.taskId,
          actionId,
          build: record,
        };
      }
    }

    const taskId = existing?.taskId || randomUUID();
    const now = new Date().toISOString();
    if (!existing) {
      record.children.push({
        taskId,
        bindingId: binding.bindingId,
        kind,
        actionId,
        dispatchState: "selected",
        objective: objective.slice(0, 4_000),
        intentRevision: record.intent.outcomeRevision,
        authoritativeSha: record.authoritativeSha || null,
        selectedAt: now,
      });
      writeBuildRecord(runtimeRoot, record);
    }

    const bound = await gateway.bindProject(binding.projectRoot);
    if (bound && bound.ok === false) return bound;

    const preferredEngine = resolveDispatchPreferredEngine(kind, extra);
    const startExtra = {
      taskId,
      cwd: binding.projectRoot,
      ...(preferredEngine ? { preferredEngine } : {}),
    };

    let started;
    if (fakeMode) {
      started = await runFakeChild({
        runtimeRoot,
        taskId,
        binding,
        kind,
        objective,
        buildId,
      });
    } else {
      const cp = resolveTaskCheckpoint(taskId);
      if (cp && (cp.finalState === "interrupted" || !cp.finalState)) {
        started = gateway.resumeTask
          ? await gateway.resumeTask(taskId, startExtra)
          : await gateway.startTask(objective, startExtra);
      } else {
        started = await gateway.startTask(objective, startExtra);
        if (started && started.code === "TASK_EXISTS" && gateway.resumeTask) {
          started = await gateway.resumeTask(taskId, startExtra);
        }
      }
    }

    record = readBuildRecord(runtimeRoot, buildId) || record;
    const child = record.children.find((c) => c.actionId === actionId);
    if (!fakeMode && (!started || started.ok === false)) {
      const message =
        (started && (started.message || started.code)) || "Engine failed to start";
      if (child) {
        child.dispatchState = "consumed";
        child.consumedAt = new Date().toISOString();
        child.terminalAt = child.consumedAt;
        child.classification = "FAILED";
        child.taskId = started?.taskId || taskId;
      }
      record.loop.status = "blocked";
      record.loop.blockedReason = String(message).slice(0, 500);
      syncConversationLifecycle(record);
      writeBuildRecord(runtimeRoot, record);
      appendBuildEvent(runtimeRoot, buildId, `${kind}.failed`, {
        taskId: child?.taskId || taskId,
        actionId,
        message: String(message).slice(0, 500),
        code: started?.code || "ENGINE_START_FAILED",
      });
      return {
        ok: false,
        code: started?.code || "ENGINE_START_FAILED",
        message: String(message),
        taskId: child?.taskId || taskId,
        actionId,
        build: record,
      };
    }
    if (child) {
      child.dispatchState = "dispatched";
      child.dispatchedAt = new Date().toISOString();
      child.taskId = started?.taskId || taskId;
      if (dispatchIdentity) child.dispatchedBy = dispatchIdentity();
    }
    if (kind === "evaluate") record.loop.lastEvaluateTaskId = child?.taskId || taskId;
    if (kind === "challenge") record.loop.lastChallengeTaskId = child?.taskId || taskId;
    syncConversationLifecycle(record);
    writeBuildRecord(runtimeRoot, record);

    return {
      ok: true,
      taskId: child?.taskId || taskId,
      actionId,
      kind,
      bindingId: binding.bindingId,
      started,
      build: record,
    };
  }

  /**
   * Fake-engine path for mechanical proofs (no live model).
   * Writes a minimal checkpoint + synthetic report directives into checkpoint validation notes.
   */
  async function runFakeChild(input) {
    const { writeTaskCheckpoint, createCheckpointSkeleton } =
      await import("../ag10/task-checkpoint.mjs");
    const { writeEngineeringReportFile } = await import(
      "../engineering-report.mjs"
    );
    const reality = captureBindingReality(input.binding.projectRoot);
    const classification = "VERIFIED";
    let reportBody = `PATH Build fake ${input.kind} result\n`;

    /** @type {Record<string, unknown>} */
    let sealed = {};
    if (input.kind === "engineer") {
      // Create a tiny marker file to simulate engineering progress
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { spawnSync } = await import("node:child_process");
      const root = input.binding.projectRoot;
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "path-build-marker.txt"),
        `build=${input.buildId}\nkind=engineer\n`,
        "utf8",
      );
      writeFileSync(
        join(root, "package.json"),
        `${JSON.stringify({ name: "path-build-proof", private: true, type: "module", scripts: { test: "node -e \"console.log('ok')\"" } }, null, 2)}\n`,
        "utf8",
      );
      writeFileSync(
        join(root, "index.html"),
        "<!doctype html><p><a class=\"btn-secondary\" href=\"#how-to-use\">Learn how ICE works</a></p>\n",
        "utf8",
      );
      const gitEnv = {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_AUTHOR_NAME: "PATH Build",
        GIT_AUTHOR_EMAIL: "path-build@localhost",
        GIT_COMMITTER_NAME: "PATH Build",
        GIT_COMMITTER_EMAIL: "path-build@localhost",
      };
      const git = (args) =>
        spawnSync("git", args, { cwd: root, encoding: "utf8", env: gitEnv });
      const branch = `path/task-${input.taskId}`;
      git(["checkout", "-B", branch]);
      git(["add", "-A"]);
      git(["commit", "-m", "PATH Build engineer result"]);
      const sha = String(git(["rev-parse", "HEAD"]).stdout || "").trim();
      const baseline = String(git(["rev-parse", "HEAD~1"]).stdout || "").trim();
      sealed = {
        sha,
        baseline,
        branch,
        changedFiles: ["index.html", "package.json", "src/path-build-marker.txt"],
        worktreePath: root,
      };
      reportBody += "Created src/path-build-marker.txt, package.json, and index.html\n";
    }

    if (input.kind === "brief") {
      const rec = readBuildRecord(runtimeRoot, input.buildId);
      const bootstrap = rec?.productBrief || {};
      reportBody += [
        "```path-build-product-brief",
        JSON.stringify(
          {
            version: 1,
            buildId: input.buildId,
            intentRevision: rec?.intent?.outcomeRevision || 1,
            revision: (Number(bootstrap.revision) || 0) + 1,
            productKind: bootstrap.productKind || "unknown",
            summary: bootstrap.summary || rec?.intent?.outcome || "Product",
            functionalRequirements: bootstrap.functionalRequirements || [],
            visualRequirements: bootstrap.visualRequirements || [],
            nonFunctionalRequirements: bootstrap.nonFunctionalRequirements || [],
            constraints: bootstrap.constraints || [],
            acceptanceCriteria: bootstrap.acceptanceCriteria || [],
            assumptions: bootstrap.assumptions || [],
            openQuestions: bootstrap.openQuestions || [],
          },
          null,
          2,
        ),
        "```",
      ].join("\n");
    }

    if (input.kind === "evaluate" || input.kind === "challenge") {
      const rec = readBuildRecord(runtimeRoot, input.buildId);
      if (rec) {
        for (const c of rec.outcomeCriteria || []) {
          reportBody += `CRITERION ${c.id}: PROVEN — fake evidence for mechanical proof\n`;
        }
        for (const r of rec.intent.explicitRequirements || []) {
          reportBody += `REQUIREMENT ${r.id}: SATISFIED — fake evidence for mechanical proof\n`;
        }
        reportBody += "NEXT: refine tests and runnable API surface\n";
        reportBody += "HYPOTHESIS: single-package Node service + marker client surface\n";
        if (input.kind === "challenge") {
          reportBody += "CLAIM STANDS — marker and package.json present\n";
        }
      }
    }

    writeTaskCheckpoint(
      runtimeRoot,
      createCheckpointSkeleton({
        taskId: input.taskId,
        sessionId: `path-${input.taskId}`,
        repoRoot: input.binding.projectRoot,
        worktreePath: input.binding.projectRoot,
        objective: input.objective.slice(0, 4_000),
        headSha: sealed.sha || reality.headSha,
        diffFingerprint: reality.dirtyFingerprint,
        finalState: input.kind === "engineer" ? "VERIFIED" : "completed",
        validation: { classification },
        changedFiles: sealed.changedFiles || reality.changedFiles,
        sha: sealed.sha,
        baseline: sealed.baseline,
        branch: sealed.branch,
        worktreePath: sealed.worktreePath || input.binding.projectRoot,
      }),
    );
    writeEngineeringReportFile(input.taskId, reportBody, runtimeRoot);
    return { ok: true, taskId: input.taskId, mode: "fake" };
  }

  /**
   * @param {string} buildId
   * @param {string} taskId
   */
  async function awaitAndConsume(buildId, taskId, timeoutMs = 1_800_000) {
    if (!fakeMode) {
      await gateway.awaitTask(taskId, timeoutMs);
    }
    return consumeChildResult(buildId, taskId);
  }

  /**
   * Idempotent consume of a terminal child.
   * @param {string} buildId
   * @param {string} taskId
   */
  async function consumeChildResult(buildId, taskId) {
    let record = readBuildRecord(runtimeRoot, buildId);
    if (!record) {
      return { ok: false, code: "BUILD_NOT_FOUND" };
    }
    const child = record.children.find((c) => c.taskId === taskId);
    if (!child) {
      return { ok: false, code: "CHILD_NOT_FOUND" };
    }
    if (child.dispatchState === "consumed") {
      return { ok: true, deduped: true, build: record };
    }

    const cp = resolveTaskCheckpoint(taskId);
    let snap = gatewayProbeHints(taskId);
    const reportPath = engineeringReportExists(taskId, runtimeRoot)
      ? resolveEngineeringReportPath(taskId, runtimeRoot)
      : null;
    const reportText = reportPath ? readReportText(reportPath) : "";
    let engineResultText = "";
    if (!fakeMode && typeof gateway.getResult === "function") {
      try {
        const gatewayResult = await gateway.getResult(taskId);
        snap = gatewayResult?.snapshot || snap;
        engineResultText = String(
          gatewayResult?.result?.engineResultText ||
            gatewayResult?.snapshot?.result?.engineResultText ||
            "",
        );
      } catch {
        // The durable engineering report remains the recovery fallback.
      }
    }
    const cognitiveText = [engineResultText, reportText]
      .filter((value) => value && value.trim())
      .join("\n\n");
    const binding = record.projectBindings.find((b) => b.bindingId === child.bindingId);
    const reality = binding
      ? captureBindingReality(binding.projectRoot)
      : null;
    const probeCtx = probeContextFromChild(cp, snap, reality);

    const resultFingerprint = createHash("sha256")
      .update(
        `${taskId}:${cp?.finalState || ""}:${cp?.sha || ""}:${cp?.diffFingerprint || ""}:${cognitiveText.slice(0, 500)}`,
      )
      .digest("hex")
      .slice(0, 24);

    if (!child.orphanAbandoned && child.kind === "brief") {
      const parsedBrief = parseProductBriefResult(cognitiveText, {
        buildId: record.buildId,
        intentRevision: record.intent.outcomeRevision,
        revision: (Number(record.productBrief?.revision) || 0) + 1,
      });
      if (parsedBrief.ok) {
        const hint = inferProductKind(
          [
            record.intent?.outcome,
            record.productBrief?.revisionContext,
            record.productBrief?.outcome,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        if (parsedBrief.brief.productKind === "unknown" && hint !== "unknown") {
          parsedBrief.brief.productKind = hint;
        }
        parsedBrief.brief.stale = false;
        record.productBrief = parsedBrief.brief;
        record.productBriefError = undefined;
        if (record.criteriaAuthority !== "caller") {
          record.outcomeCriteria = briefToOutcomeCriteria(parsedBrief.brief);
        }
      } else {
        const repeated = Boolean(record.productBriefError);
        record.productBriefError = {
          errors: parsedBrief.errors,
          taskId,
          at: new Date().toISOString(),
        };
        if (repeated) {
          record.loop.status = "blocked";
          record.loop.blockedReason =
            "PRODUCT_BRIEF_UNREADABLE: the engineering engine did not return a usable product brief. PATH did not start another brief.";
          record.loop.forceNextKind = undefined;
        } else {
          record.loop.forceNextKind = "brief";
        }
      }
    }

    // Apply assessment directives from engineering reports
    if (
      !child.orphanAbandoned &&
      (child.kind === "evaluate" ||
        child.kind === "challenge" ||
        child.kind === "engineer")
    ) {
      const assessment = applyAssessmentToRecord(record, cognitiveText, {
        taskId,
        bindingId: child.bindingId,
        reality,
        kind: child.kind,
      });
      if (child.kind === "evaluate" || child.kind === "challenge") {
        child.semanticProofAccepted = assessment.structuredAccepted;
      }
    }

    // Engineer progress / no-progress
    let classification = String(
      (cp?.validation && cp.validation.classification) ||
        cp?.finalState ||
        "",
    );
    if (!classification && snap?.classification) {
      classification = String(snap.classification);
    }
    const failed =
      cp?.finalState === "failed" ||
      /FAIL|NOT_VERIFIED|BLOCKED/i.test(classification);
    const noValidationCandidates = /no discoverable project validation/i.test(
      String(
        (cp?.validation && cp.validation.reason) || cognitiveText || "",
      ),
    );
    if (failed && !(noValidationCandidates && child.kind === "engineer")) {
      const fp = resultFingerprint;
      if (record.loop.lastFailureFingerprint === fp) {
        record.loop.noProgressCount = (record.loop.noProgressCount || 0) + 1;
      } else {
        record.loop.lastFailureFingerprint = fp;
        record.loop.noProgressCount = 1;
      }
      if ((record.loop.noProgressCount || 0) >= 3) {
        record.loop.status = "blocked";
        record.loop.blockedReason =
          "NO_PROGRESS: repeated equivalent failures without new evidence — re-evaluate or change approach.";
      }
    } else {
      record.loop.noProgressCount = 0;
      record.loop.lastFailureFingerprint = null;
      if (
        record.loop.status === "blocked" &&
        record.loop.blockedReason?.startsWith("NO_PROGRESS")
      ) {
        record.loop.status = "running";
        record.loop.blockedReason = undefined;
      }
    }

    child.dispatchState = "consumed";
    child.consumedAt = new Date().toISOString();
    child.resultFingerprint = resultFingerprint;
    child.classification = childVerificationClass(child) || child.classification;
    child.terminalAt = child.terminalAt || new Date().toISOString();
    {
      const provenance = extractProviderProvenance(cp, snap, cognitiveText);
      if (provenance.provider) child.provider = provenance.provider;
      if (provenance.engineMode) child.engineMode = provenance.engineMode;
      if (provenance.model) child.engineModel = provenance.model;
      else if (provenance.provider) child.engineModel = null;
      if (provenance.sessionId) child.engineSessionId = provenance.sessionId;
      if (provenance.executionProvider) {
        child.executionProvider = provenance.executionProvider;
      }
      if (Array.isArray(provenance.turns) && provenance.turns.length) {
        child.engineTurns = provenance.turns;
      }
      if (child.kind === "engineer" && cp?.engineSelection?.selected) {
        const sel = cp.engineSelection;
        appendBuildEvent(runtimeRoot, buildId, "engine.decision", {
          actionId: child.actionId,
          taskId,
          intentRevision: child.intentRevision || record.intent.outcomeRevision,
          preferred: sel.preferred || null,
          ready: Array.isArray(sel.ready) ? sel.ready : [],
          fit: Array.isArray(sel.fit) ? sel.fit : [],
          selected: sel.selected,
          reason: sel.reason || "",
          preferredHonored: sel.preferredHonored === true,
          phase: "engineer",
          executed: provenance.provider || null,
        });
      }
    }
    record.loop.lastConsumedActionId = child.actionId;
    record.loop.pendingReinspect = true;

    noteEngineerProductRoots(record, child, cp, snap, classification);

    if (
      child.kind === "engineer" &&
      Array.isArray(cp?.fabricPlan?.remaining)
    ) {
      record.loop.fabricSteps = cp.fabricPlan.remaining
        .filter((step) => typeof step === "string" && step.trim())
        .map((step) => step.trim());
    }

    // Stage a creator-review candidate. Authoritative product SHA moves only on Apply.
    /** @type {object | null} */
    let adoption = null;
    if (child.kind === "engineer") {
      const decision = decideEngineerProductAdoption({
        record,
        child,
        checkpoint: cp,
        projectRoot: binding?.projectRoot || "",
        classification,
        reportText,
      });
      if (!decision.adopt && decision.code === "NON_WEB") {
        child.classification = "NOT_VERIFIED";
        child.failureReason = decision.reason;
        record.loop.forceNextKind = "engineer";
        record.loop.pendingRuntimeRefresh = false;
        record.hypotheses.proposedNextAction =
          "The previous result was not a previewable website for the current intent. Build that website in this project. Do not replace it with a CLI or sample program.";
        appendBuildEvent(runtimeRoot, buildId, "engineer.intent_rejected", {
          taskId,
          actionId: child.actionId,
          intentRevision: child.intentRevision || record.intent.outcomeRevision,
          capability: decision.capability,
          capabilitySource: decision.capabilitySource,
        });
      } else if (!decision.adopt) {
        child.failureReason = decision.reason;
        record.loop.pendingRuntimeRefresh = false;
        appendBuildEvent(runtimeRoot, buildId, "engineer.adoption_rejected", {
          taskId,
          actionId: child.actionId,
          intentRevision: child.intentRevision || record.intent.outcomeRevision,
          code: decision.code,
          capability: decision.capability,
          capabilitySource: decision.capabilitySource,
        });
      } else if (decision.adopt) {
        const productBranch =
          record.productBranch || `path-build/${record.buildId.slice(0, 8)}`;
        record.productBranch = productBranch;
        if (decision.recoveredProviderClose || decision.recoveredEmptyDiscovery) {
          child.classification = "VERIFIED";
          child.recoveredProviderClose = decision.recoveredProviderClose === true;
          child.recoveredEmptyDiscovery = decision.recoveredEmptyDiscovery === true;
          child.failureReason = undefined;
        }
        child.sourceSha = decision.sourceSha || cp?.sha || child.sourceSha || null;
        record.pendingCandidate = makePendingCandidate({
          record,
          child,
          checkpoint: cp,
          decision,
          projectRoot: binding?.projectRoot || "",
        });
        record.loop.status = "awaiting_review";
        record.loop.forceNextKind = undefined;
        record.loop.pendingRuntimeRefresh = false;
        record.loop.lastAdoptionError = undefined;
        if (binding?.projectRoot) {
          restoreAuthoritativeCheckout({
            projectRoot: binding.projectRoot,
            productBranch,
            authoritativeSha: record.authoritativeSha || null,
            worktreePath:
              typeof cp?.worktreePath === "string" ? cp.worktreePath : null,
          });
        }
        appendBuildEvent(runtimeRoot, buildId, "candidate.ready", {
          taskId,
          actionId: child.actionId,
          intentRevision: child.intentRevision || record.intent.outcomeRevision,
          sourceSha: record.pendingCandidate.sourceSha,
          taskBranch: record.pendingCandidate.taskBranch,
          files: record.pendingCandidate.files,
        });
      }
    }

    if (
      child.kind === "engineer" &&
      !child.adoptedSha &&
      !record.pendingCandidate &&
      cp?.preferredEngine === "cursor" &&
      cp?.cursorMode &&
      cp.cursorMode !== "none" &&
      cp.cursorMode !== "native_sdk"
    ) {
      const decision = resolveMutatingEngineAttempt({
        preferred: "cursor",
        cursorMode: cp.cursorMode,
        fallback: process.env.PATHCODE_ENGINE_FALLBACK,
      });
      const reason = String(
        cp.cursorUnavailableReason || child.failureReason || decision.reason,
      ).slice(0, 300);
      child.failureReason = reason;
      appendBuildEvent(runtimeRoot, buildId, "engine.decision", {
        actionId: child.actionId,
        taskId,
        intentRevision: child.intentRevision || record.intent.outcomeRevision,
        preferred: "cursor",
        selected: decision.selected,
        reason: decision.fallback
          ? `${decision.reason} ${reason}`
          : reason,
        fallback: decision.fallback === true,
        phase: "engineer",
        newTask: decision.newTask,
      });
      if (decision.fallback && decision.selected) {
        record.loop.preferredEngineOverride = decision.selected;
        record.loop.forceNextKind = "engineer";
        record.loop.status = "running";
        record.loop.blockedReason = undefined;
      } else if (decision.blocked) {
        record.loop.forceNextKind = undefined;
        record.loop.status = "blocked";
        record.loop.blockedReason = reason;
      }
    }

    syncConversationLifecycle(record);
    writeBuildRecord(runtimeRoot, record);

    // Depth A immediately after consume
    const depthA = await runDepthA(buildId, child.bindingId, taskId);

    // Mechanical FS/check probe — updates criteria from authoritative reality
    let probe = null;
    if (!fakeMode) {
      try {
        const rec2 = readBuildRecord(runtimeRoot, buildId);
        if (rec2) {
          probe = mechanicalProbeBinding(
            buildProbeInput(rec2, child.bindingId, {
              taskId,
              ...probeCtx,
            }),
          );
          if (probe.ok && Array.isArray(probe.updates) && probe.updates.length) {
            writeBuildRecord(runtimeRoot, rec2);
          }
        }
      } catch {
        probe = null;
      }
    }

    return {
      ok: true,
      build: readBuildRecord(runtimeRoot, buildId),
      depthA,
      probe,
      reportPath,
      adoption,
      candidate: readBuildRecord(runtimeRoot, buildId)?.pendingCandidate || null,
    };
  }

  /**
   * Creator Apply — the only path that may move the authoritative product SHA.
   * @param {string} buildId
   */
  async function applyCandidate(buildId) {
    const record = readBuildRecord(runtimeRoot, buildId);
    if (!record) return { ok: false, code: "BUILD_NOT_FOUND" };
    const pending = record.pendingCandidate;
    if (!pending || pending.status !== "pending") {
      if (record.lastAppliedCandidate) {
        return { ok: true, deduped: true, build: record };
      }
      return { ok: false, code: "NO_PENDING_CANDIDATE" };
    }
    const child = (record.children || []).find((row) => row.taskId === pending.taskId);
    if (child?.adoptedSha) {
      record.lastAppliedCandidate = {
        taskId: pending.taskId,
        adoptedSha: child.adoptedSha,
        at: new Date().toISOString(),
      };
      delete record.pendingCandidate;
      record.loop.status = "running";
      writeBuildRecord(runtimeRoot, record);
      return { ok: true, deduped: true, build: readBuildRecord(runtimeRoot, buildId) };
    }
    const binding = primaryBinding(record);
    if (!binding?.projectRoot) {
      return { ok: false, code: "NO_PROJECT_ROOT", build: record };
    }
    const { adoptEngineerResultIntoBuild } = await import("./adopt.mjs");
    const productBranch =
      record.productBranch || `path-build/${record.buildId.slice(0, 8)}`;
    record.productBranch = productBranch;
    const adoption = adoptEngineerResultIntoBuild({
      runtimeRoot,
      buildId,
      projectRoot: binding.projectRoot,
      productBranch,
      taskId: pending.taskId,
      taskBranch: pending.taskBranch || binding.activeTaskBranch || null,
      sourceSha: pending.sourceSha,
      worktreePath:
        pending.worktreePath &&
        resolveWorktreeIfSeparate(pending.worktreePath, binding.projectRoot),
    });
    if (!adoption?.ok) {
      record.loop.lastAdoptionError = {
        code: adoption?.code,
        message: adoption?.message,
        at: new Date().toISOString(),
        taskId: pending.taskId,
      };
      if (child) {
        child.adoptionError = {
          code: adoption?.code,
          message: adoption?.message,
        };
      }
      writeBuildRecord(runtimeRoot, record);
      return { ok: false, ...adoption, build: readBuildRecord(runtimeRoot, buildId) };
    }
    if (!Array.isArray(record.adoptionHistory)) record.adoptionHistory = [];
    record.adoptionHistory.push({
      buildId,
      taskId: pending.taskId,
      actionId: pending.actionId || child?.actionId,
      intentRevision: pending.intentRevision || record.intent.outcomeRevision,
      engine: child?.provider || null,
      resultId: pending.resultFingerprint || adoption.sourceSha,
      parentSha: record.authoritativeSha || null,
      sourceSha: adoption.sourceSha,
      adoptedSha: adoption.adoptedSha,
      projectRoot: adoption.projectRoot,
      productBranch: adoption.productBranch,
      files: Array.isArray(pending.files) ? pending.files.slice(0, 40) : [],
      mode: adoption.mode,
      adoptedAt: adoption.adoptedAt,
      capability: pending.capability,
      capabilitySource: pending.capabilitySource,
      resultFingerprint: pending.resultFingerprint,
    });
    record.authoritativeSha = adoption.adoptedSha;
    record.lastAppliedCandidate = {
      taskId: pending.taskId,
      adoptedSha: adoption.adoptedSha,
      at: adoption.adoptedAt,
    };
    delete record.pendingCandidate;
    record.loop.lastAdoptionError = undefined;
    record.loop.forceNextKind = undefined;
    record.loop.pendingRuntimeRefresh = !fakeMode;
    record.loop.status = "running";
    if (fakeMode) {
      record.runtimeHealth = "ok";
      record.previewUrl = record.previewUrl || "http://127.0.0.1:0/fake";
    }
    delete binding.activeWorktreePath;
    if (child) {
      child.adoptedSha = adoption.adoptedSha;
      child.sourceSha = adoption.sourceSha;
    }
    if (isEmptyProductTree(binding.projectRoot)) {
      if (child) {
        child.classification = "NOT_VERIFIED";
        child.adoptionEmpty = true;
      }
      record.loop.forceNextKind = "engineer";
      record.loop.pendingRuntimeRefresh = false;
      record.hypotheses.proposedNextAction =
        "Previous engineer claimed success but left an empty Build folder. Establish real product files (index.html or package + start) in this binding — do NOT run git init (the folder is already a git repo).";
    }
    appendBuildEvent(runtimeRoot, buildId, "candidate.applied", {
      taskId: pending.taskId,
      sourceSha: adoption.sourceSha,
      adoptedSha: adoption.adoptedSha,
      mode: adoption.mode,
    });
    syncConversationLifecycle(record);
    writeBuildRecord(runtimeRoot, record);
    return {
      ok: true,
      build: readBuildRecord(runtimeRoot, buildId),
      adoption,
    };
  }

  /**
   * Creator Discard — S2 DISCARDED, keep report and task branch, restore product.
   * @param {string} buildId
   */
  async function discardCandidate(buildId) {
    const record = readBuildRecord(runtimeRoot, buildId);
    if (!record) return { ok: false, code: "BUILD_NOT_FOUND" };
    const pending = record.pendingCandidate;
    if (!pending || pending.status !== "pending") {
      if (record.lastDiscardedCandidate) {
        return { ok: true, deduped: true, build: record };
      }
      return { ok: false, code: "NO_PENDING_CANDIDATE" };
    }
    const binding = primaryBinding(record);
    const now = new Date().toISOString();
    writeResultLifecycle({
      runtimeRoot,
      taskId: pending.taskId,
      projectRoot: binding?.projectRoot || null,
      entry: {
        taskId: pending.taskId,
        worktreePath: pending.worktreePath,
        branch: pending.taskBranch,
      },
      patch: {
        status: "DISCARDED",
        discardedAt: now,
      },
    });
    if (binding?.projectRoot) {
      restoreAuthoritativeCheckout({
        projectRoot: binding.projectRoot,
        productBranch: record.productBranch || null,
        authoritativeSha: record.authoritativeSha || null,
        worktreePath: pending.worktreePath,
      });
    }
    record.lastDiscardedCandidate = {
      taskId: pending.taskId,
      sourceSha: pending.sourceSha,
      at: now,
    };
    delete record.pendingCandidate;
    const adoptedThisRevision = adoptedEngineerForRevision(record);
    record.loop.status = adoptedThisRevision && record.authoritativeSha ? "running" : "paused";
    record.loop.pauseRequested = false;
    if (record.loop.status === "paused") {
      record.loop.pausedAt = now;
    }
    // Restore authoritative preview immediately when a product exists; otherwise
    // park on truthful empty/no-product state (never leave candidate preview).
    if (binding?.projectRoot && !fakeMode) {
      const { detectBuildArtifact } = await import("./runtime/artifact.mjs");
      const artifact = detectBuildArtifact(binding.projectRoot, {
        outcomeHint: record.intent?.outcome,
      });
      const emptyTree = (artifact.signals || []).includes("empty_tree");
      const webReady =
        artifact.preview?.capability === "web" &&
        !emptyTree &&
        artifact.preview?.mode !== "none";
      if (webReady) {
        record.loop.pendingRuntimeRefresh = true;
      } else {
        record.previewUrl = null;
        record.runtimeHealth = emptyTree ? "awaiting_product" : "n/a";
        record.loop.pendingRuntimeRefresh = false;
      }
    } else {
      record.loop.pendingRuntimeRefresh = false;
    }
    appendBuildEvent(runtimeRoot, buildId, "candidate.discarded", {
      taskId: pending.taskId,
      sourceSha: pending.sourceSha,
      reportRetained: true,
      taskBranchRetained: pending.taskBranch || null,
    });
    syncConversationLifecycle(record);
    writeBuildRecord(runtimeRoot, record);
    return { ok: true, build: readBuildRecord(runtimeRoot, buildId) };
  }

  function resolveWorktreeIfSeparate(worktreePath, projectRoot) {
    if (!worktreePath || !existsSync(worktreePath)) return null;
    return resolve(worktreePath) === resolve(projectRoot) ? null : worktreePath;
  }

  /**
   * @param {import('./types.mjs').BuildRecord} record
   * @param {string} reportText
   * @param {{ taskId: string, bindingId: string, reality: ReturnType<typeof captureBindingReality>|null, kind: string }} ctx
   */
  function applyAssessmentToRecord(record, reportText, ctx) {
    const parsed = parseBuildCognitiveResult(reportText, {
      expectedBuildId: record.buildId,
      expectedIntentRevision: record.intent?.outcomeRevision,
      expectedAuthoritativeRevision: record.authoritativeSha || null,
    });
    if (parsed.malformedStructured && parsed.errors.length) {
      record.loop.lastCognitiveParseError = {
        errors: parsed.errors,
        at: new Date().toISOString(),
        taskId: ctx.taskId,
        kind: ctx.kind,
      };
      // Do not mutate real semantic truth from a mismatched envelope. Legacy
      // prose directives remain available only to deterministic fake fixtures.
    }
    const directives = cognitiveResultToDirectives(parsed).filter(
      (directive) => fakeMode || directive.source.startsWith("structured"),
    );
    const now = new Date().toISOString();
    const reality = ctx.reality;

    for (const d of directives) {
      const ev = reality
        ? [
            makeEvidenceRef(
              {
                kind: "report",
                ref: `task:${ctx.taskId}`,
                bindingId: ctx.bindingId,
                taskId: ctx.taskId,
                scope: [d.id],
              },
              reality,
            ),
          ]
        : [];

      const criterion = (record.outcomeCriteria || []).find((c) => c.id === d.id);
      if (criterion && /PROVEN|UNMET|UNKNOWN/.test(d.status)) {
        criterion.status = /** @type {any} */ (d.status);
        criterion.evidence = ev;
        criterion.updatedAt = now;
        if (ctx.kind === "challenge") criterion.challengedByTaskId = ctx.taskId;
        continue;
      }
      const req = (record.intent.explicitRequirements || []).find(
        (r) => r.id === d.id,
      );
      if (req && /SATISFIED|VIOLATED|UNKNOWN/.test(d.status)) {
        req.status = /** @type {any} */ (d.status);
        req.evidence = ev;
      }
    }

    if (parsed.structured?.proposedNextAction) {
      record.hypotheses.proposedNextAction = String(
        parsed.structured.proposedNextAction,
      ).slice(0, 2_000);
      record.hypotheses.updatedAt = now;
      record.hypotheses.revisedByTaskId = ctx.taskId;
    }

    const nextMatch = reportText.match(/^\s*NEXT:\s*(.+)$/im);
    if (nextMatch) {
      record.hypotheses.proposedNextAction = nextMatch[1].trim().slice(0, 2_000);
      record.hypotheses.updatedAt = now;
      record.hypotheses.revisedByTaskId = ctx.taskId;
    }
    const hypMatch = reportText.match(/^\s*HYPOTHESIS:\s*(.+)$/im);
    if (hypMatch) {
      record.hypotheses.architectureNotes = hypMatch[1].trim().slice(0, 4_000);
      record.hypotheses.updatedAt = now;
      record.hypotheses.revisedByTaskId = ctx.taskId;
    }

    if (ctx.kind === "challenge") {
      if (/\bCLAIM STANDS\b/i.test(reportText)) {
        for (const c of record.outcomeCriteria || []) {
          if (c.status === "UNKNOWN" && c.required) {
            // Do not auto-PROVEN from CLAIM STANDS alone without CRITERION line —
            // leave UNKNOWN unless directives already set.
          }
        }
      }
      if (/\bCLAIM FALSIFIED\b/i.test(reportText)) {
        for (const c of record.outcomeCriteria || []) {
          if (c.challengedByTaskId === ctx.taskId || c.status === "PROVEN") {
            // If challenge targeted completeness and falsified, demote proven required
          }
        }
        const proven = (record.outcomeCriteria || []).filter(
          (c) => c.required && c.status === "PROVEN",
        );
        if (proven.length && !directives.some((d) => d.status === "UNMET")) {
          // Prefer explicit CRITERION lines; if none, demote last proven
          const target = proven[proven.length - 1];
          target.status = "UNMET";
          target.updatedAt = now;
          target.challengedByTaskId = ctx.taskId;
        }
      }
    }

    // Seed criteria from evaluate if empty
    if (
      ctx.kind === "evaluate" &&
      (!record.outcomeCriteria || record.outcomeCriteria.length === 0)
    ) {
      record.outcomeCriteria = [
        {
          id: "c-runnable",
          statement: "Core software surface is runnable with project-native checks",
          required: true,
          status: "UNKNOWN",
          evidence: [],
          updatedAt: now,
        },
        {
          id: "c-outcome",
          statement: `Product reflects outcome: ${record.intent.outcome.slice(0, 200)}`,
          required: true,
          status: "UNKNOWN",
          evidence: [],
          updatedAt: now,
        },
      ];
    }
    return { structuredAccepted: Boolean(parsed.structured) };
  }

  /**
   * @param {string} buildId
   */
  function assessCompletion(buildId) {
    const record = readBuildRecord(runtimeRoot, buildId);
    if (!record) {
      return { ok: false, code: "BUILD_NOT_FOUND" };
    }
    if (record.pendingCandidate?.status === "pending" || record.loop.status === "awaiting_review") {
      return {
        ok: true,
        complete: false,
        reason: "awaiting_review",
        build: record,
      };
    }
    if (record.loop.pendingReinspect) {
      return {
        ok: true,
        complete: false,
        reason: "pendingReinspect",
        build: record,
      };
    }
    if (record.loop.pendingRuntimeRefresh) {
      const hasConsumedEngineer = (record.children || []).some(
        (c) =>
          c.kind === "engineer" &&
          c.dispatchState === "consumed" &&
          !c.orphanAbandoned,
      );
      if (hasConsumedEngineer) {
        return {
          ok: true,
          complete: false,
          reason: "pending_runtime_refresh",
          build: record,
        };
      }
      // No product yet — do not block completion assessment / next dispatch.
      record.loop.pendingRuntimeRefresh = false;
    }
    const remainingFabric = fabricStepsRemaining(record);
    if (remainingFabric.length) {
      return {
        ok: true,
        complete: false,
        reason: "fabric_plan_remaining",
        build: record,
      };
    }
    const adoptedEngineer = adoptedEngineerForRevision(record);
    if (adoptedEngineer && record.authoritativeSha) {
      const productKind =
        record.productBrief?.productKind || record.artifactKind || "unknown";
      const isVisual =
        !fakeMode &&
        (productKind === "web" ||
          /website|web\s*app|landing/i.test(record.intent?.outcome || ""));
      if (
        isVisual &&
        (!record.previewUrl ||
          (record.runtimeHealth && record.runtimeHealth !== "ok"))
      ) {
        return {
          ok: true,
          complete: false,
          reason: "preview_pending",
          build: record,
        };
      }
      return { ok: true, complete: true, reason: "ready", build: record };
    }
    if (record.loop.lastAdoptionError) {
      const recovered =
        Boolean(record.authoritativeSha) &&
        (record.children || []).some(
          (c) =>
            c.kind === "engineer" &&
            c.dispatchState === "consumed" &&
            c.adoptedSha &&
            !c.orphanAbandoned,
        );
      if (!recovered) {
        return {
          ok: true,
          complete: false,
          reason: "adoption_failed",
          build: record,
        };
      }
    }
    const requiredCriteria = (record.outcomeCriteria || []).filter((c) => c.required);
    const requiredReqs = (record.intent.explicitRequirements || []).filter(
      (r) => r.required,
    );
    if (requiredCriteria.length === 0) {
      return {
        ok: true,
        complete: false,
        reason: "no_required_criteria",
        build: record,
      };
    }
    // Derived criteria must exist beyond the two legacy generics for visual/web Builds.
    const derivedRequired = requiredCriteria.filter(
      (c) => c.id !== "c-runnable" && c.id !== "c-outcome",
    );
    const productKindHint =
      record.productBrief?.productKind ||
      record.artifactKind ||
      "unknown";
    const needsDerived =
      productKindHint === "web" ||
      /website|web\s*app|landing/i.test(record.intent?.outcome || "");
    if (
      needsDerived &&
      derivedRequired.length === 0 &&
      (record.productBrief?.acceptanceCriteria || []).length > 2
    ) {
      return {
        ok: true,
        complete: false,
        reason: "derived_criteria_missing",
        build: record,
      };
    }
    const critOk = requiredCriteria.every((c) => c.status === "PROVEN");
    const reqOk = requiredReqs.every((r) => r.status === "SATISFIED");
    const consumedSinceRevision = (record.children || []).filter(
      (c) =>
        c.dispatchState === "consumed" &&
        (c.selectedAt >= record.intent.revisedAt ||
          record.intent.outcomeRevision <= 1),
    );
    const lastEvaluate = [...consumedSinceRevision]
      .reverse()
      .find((c) => c.kind === "evaluate");
    const lastChallenge = [...consumedSinceRevision]
      .reverse()
      .find((c) => c.kind === "challenge");
    const assessVerified = (child) =>
      child &&
      /VERIFIED/i.test(childVerificationClass(child)) &&
      (fakeMode ||
        (child.semanticProofAccepted === true &&
          child.intentRevision === record.intent.outcomeRevision &&
          (child.authoritativeSha || null) ===
            (record.authoritativeSha || null)));
    const hasEvaluate = assessVerified(lastEvaluate);
    const hasChallenge = assessVerified(lastChallenge);
    if (!critOk || !reqOk) {
      return {
        ok: true,
        complete: false,
        reason: !critOk ? "criteria_unproven" : "requirements_unsatisfied",
        build: record,
      };
    }
    if (!hasEvaluate || !hasChallenge) {
      return {
        ok: true,
        complete: false,
        reason: !hasEvaluate ? "evaluate_required" : "challenge_required",
        build: record,
      };
    }

    const productKind =
      record.productBrief?.productKind ||
      record.artifactKind ||
      "unknown";
    const isVisual =
      !fakeMode &&
      (productKind === "web" ||
        /website|web\s*app|landing/i.test(record.intent?.outcome || ""));
    if (isVisual) {
      if (!record.authoritativeSha) {
        return {
          ok: true,
          complete: false,
          reason: "no_authoritative_revision",
          build: record,
        };
      }
      const evidence = Array.isArray(record.browserEvidence)
        ? record.browserEvidence
        : [];
      const fresh = evidence
        .filter((e) => e && e.ok)
        .slice(-1)[0];
      if (!fresh) {
        return {
          ok: true,
          complete: false,
          reason: "browser_evidence_required",
          build: record,
        };
      }
      if (
        fresh.authoritativeSha &&
        record.authoritativeSha &&
        fresh.authoritativeSha !== record.authoritativeSha
      ) {
        return {
          ok: true,
          complete: false,
          reason: "browser_evidence_stale_revision",
          build: record,
        };
      }
      if (record.runtimeHealth && record.runtimeHealth !== "ok") {
        return {
          ok: true,
          complete: false,
          reason: "runtime_unhealthy",
          build: record,
        };
      }
      if (!record.previewUrl) {
        return {
          ok: true,
          complete: false,
          reason: "preview_unreachable",
          build: record,
        };
      }
    }

    return { ok: true, complete: true, reason: "ready", build: record };
  }

  /**
   * Mark BUILD COMPLETE when assessCompletion allows.
   * @param {string} buildId
   */
  function markComplete(buildId) {
    const assessment = assessCompletion(buildId);
    if (!assessment.ok) return assessment;
    if (!assessment.complete) {
      return {
        ok: false,
        code: "NOT_COMPLETE",
        reason: assessment.reason,
        build: assessment.build,
      };
    }
    const record = /** @type {import('./types.mjs').BuildRecord} */ (assessment.build);
    record.loop.status = "complete";
    writeBuildRecord(runtimeRoot, record);
    return { ok: true, build: record };
  }

  /**
   * One autonomous loop step: recover → maybe complete → dispatch next.
   * @param {string} buildId
   */
  async function tick(buildId) {
    const recovered = await reconcileBuildChildren(buildId);
    if (!recovered.ok) return recovered;
    let record = /** @type {import('./types.mjs').BuildRecord} */ (recovered.build);

    if (record.loop.status === "complete") {
      return { ok: true, done: true, build: record, action: "already_complete" };
    }
    if (record.loop.status === "paused") {
      return {
        ok: true,
        done: false,
        paused: true,
        build: record,
        action: "paused",
      };
    }
    if (record.loop.status === "blocked") {
      return {
        ok: true,
        done: false,
        blocked: true,
        build: record,
        action: "blocked",
        reason: record.loop.blockedReason,
      };
    }
    if (
      record.pendingCandidate?.status === "pending" ||
      record.loop.status === "awaiting_review"
    ) {
      if (record.loop.status !== "awaiting_review") {
        record.loop.status = "awaiting_review";
        writeBuildRecord(runtimeRoot, record);
      }
      return {
        ok: true,
        done: false,
        awaitingReview: true,
        action: "awaiting_review",
        build: readBuildRecord(runtimeRoot, buildId),
      };
    }

    // One active child at a time — await / reconcile rather than dispatching another.
    const active = [...(record.children || [])]
      .reverse()
      .find(
        (c) =>
          c.dispatchState === "dispatched" ||
          c.dispatchState === "selected" ||
          c.dispatchState === "terminal_seen",
      );
    if (active) {
      if (active.dispatchState === "terminal_seen") {
        await consumeChildResult(buildId, active.taskId);
        const after = readBuildRecord(runtimeRoot, buildId);
        const review = after?.pendingCandidate?.status === "pending";
        return {
          ok: true,
          done: false,
          awaitingReview: review,
          action: review ? "awaiting_review" : "consumed_active",
          taskId: active.taskId,
          build: after,
        };
      }
      if (!fakeMode) {
        // Do not hold the coordinator mutation gate across Gateway waits.
        // Conversation / stop / resume must persist while the child runs.
        await reconcileBuildChildren(buildId);
        const after = readBuildRecord(runtimeRoot, buildId);
        const still = after?.children?.find((c) => c.taskId === active.taskId);
        if (still && still.dispatchState !== "consumed") {
          return {
            ok: true,
            done: false,
            action: "await_active_child",
            taskId: active.taskId,
            kind: active.kind,
            build: after,
          };
        }
        return {
          ok: true,
          done: false,
          action: "child_finished",
          taskId: active.taskId,
          kind: active.kind,
          build: after,
        };
      }
      // fakeMode: force-consume active so the loop can progress
      await consumeChildResult(buildId, active.taskId);
      const afterFake = readBuildRecord(runtimeRoot, buildId);
      const reviewFake = afterFake?.pendingCandidate?.status === "pending";
      return {
        ok: true,
        done: false,
        awaitingReview: reviewFake,
        action: reviewFake ? "awaiting_review" : "fake_consumed_active",
        taskId: active.taskId,
        build: afterFake,
      };
    }

    const bindingForProbe = primaryBinding(record);
    if (bindingForProbe && !fakeMode) {
      try {
        const reality = captureBindingReality(bindingForProbe.projectRoot);
        const probe = mechanicalProbeBinding(
          buildProbeInput(record, bindingForProbe.bindingId, {
            changedFiles: reality?.changedFiles || [],
          }),
        );
        if (probe.ok && Array.isArray(probe.updates) && probe.updates.length) {
          writeBuildRecord(runtimeRoot, record);
          record = readBuildRecord(runtimeRoot, buildId) || record;
        }
      } catch {
        // best-effort mechanical refresh
      }
    }

    // Runtime/browser evidence must follow the latest authoritative revision
    // before more engineering or COMPLETE (real mode only) — but only once a
    // product exists to capture. Never block the first engineer on empty roots.
    const previewBindingRoot =
      record.projectBindings?.[0]?.projectRoot ||
      record.projectBindings?.[0]?.path ||
      "";
    if (
      !fakeMode &&
      (record.loop.pendingRuntimeRefresh || browserEvidenceStale(record)) &&
      (record.children || []).some(
        (c) =>
          c.kind === "engineer" &&
          c.dispatchState === "consumed" &&
          !c.orphanAbandoned &&
          Boolean(c.adoptedSha),
      ) &&
      previewBindingRoot &&
      !isEmptyProductTree(previewBindingRoot)
    ) {
      record.loop.pendingRuntimeRefresh = true;
      writeBuildRecord(runtimeRoot, record);
      return {
        ok: true,
        done: false,
        action: "await_runtime_refresh",
        build: record,
        reason: record.loop.pendingRuntimeRefresh
          ? "pending_runtime_refresh"
          : "browser_evidence_stale",
      };
    }
    // Clear stale refresh flags when no product exists yet so the loop can engineer.
    if (
      record.loop.pendingRuntimeRefresh &&
      (!(record.children || []).some(
        (c) =>
          c.kind === "engineer" &&
          c.dispatchState === "consumed" &&
          !c.orphanAbandoned &&
          Boolean(c.adoptedSha),
      ) ||
        (previewBindingRoot && isEmptyProductTree(previewBindingRoot)))
    ) {
      record.loop.pendingRuntimeRefresh = false;
      writeBuildRecord(runtimeRoot, record);
    }

    if (record.loop.pauseRequested) {
      record.loop.status = "paused";
      record.loop.pausedAt = new Date().toISOString();
      record.loop.pauseRequested = false;
      writeBuildRecord(runtimeRoot, record);
      return {
        ok: true,
        done: false,
        paused: true,
        build: readBuildRecord(runtimeRoot, buildId),
        action: "paused",
      };
    }

    const completion = assessCompletion(buildId);
    if (completion.complete) {
      const marked = markComplete(buildId);
      return { ok: true, done: true, build: marked.build, action: "complete" };
    }

    // Decide next kind
    // Action sequencing is revision-local. Historical children from a prior
    // completed product iteration must not bias the new engineer → evaluate →
    // challenge cycle.
    const currentRevision = record.intent.outcomeRevision;
    const revisionChildren = record.children.filter(
      (c) => c.intentRevision === currentRevision && !c.orphanAbandoned,
    );
    const engineers = revisionChildren.filter((c) => c.kind === "engineer");
    const bindingRoot =
      record.projectBindings?.[0]?.projectRoot ||
      record.projectBindings?.[0]?.path ||
      "";
    const productStillEmpty =
      Boolean(bindingRoot) && isEmptyProductTree(bindingRoot);
    const plannedSteps = fabricStepsRemaining(record);
    const forceEngineer =
      record.loop.forceNextKind === "engineer" ||
      Boolean(record.loop.pendingConversationSteer) ||
      (productStillEmpty && engineers.length === 0 && plannedSteps.length === 0);

    /** @type {import('./types.mjs').BuildTaskKind} */
    let kind = "engineer";
    let objective = "";

    const briefCurrent =
      fakeMode ||
      (record.productBrief?.source === "cognitive" &&
        record.productBrief?.intentRevision === record.intent.outcomeRevision);

    if (!briefCurrent || record.loop.forceNextKind === "brief") {
      kind = "brief";
      objective = productBriefObjective(record);
      record.loop.forceNextKind = undefined;
      writeBuildRecord(runtimeRoot, record);
    } else if (forceEngineer) {
      kind = "engineer";
      objective = frameEngineerObjective(
        record,
        productStillEmpty
          ? record.hypotheses.proposedNextAction ||
              "Establish the previewable website named by the current intent in this Build folder. A CLI or unrelated sample is not the product. Do not run git init — the repository already exists."
          : record.hypotheses.proposedNextAction || "",
      );
      record.loop.forceNextKind = undefined;
      record.loop.pendingConversationSteer = false;
      writeBuildRecord(runtimeRoot, record);
    } else if (fabricStepsRemaining(record).length) {
      kind = "engineer";
      objective = frameEngineerObjective(record, fabricStepsRemaining(record)[0]);
      record.loop.fabricSteps = fabricStepsRemaining(record).slice(1);
      writeBuildRecord(runtimeRoot, record);
    } else if (engineers.length === 0) {
      kind = "engineer";
      objective = frameEngineerObjective(
        record,
        record.hypotheses.proposedNextAction || "",
      );
    } else if (record.loop.forceNextKind === "evaluate") {
      kind = "evaluate";
      objective = frameEvaluateObjective(record, {
        evidencePackage: buildEvidencePackage(record),
      });
      record.loop.forceNextKind = undefined;
      writeBuildRecord(runtimeRoot, record);
    } else if (record.loop.forceNextKind === "challenge") {
      kind = "challenge";
      const claim =
        (record.outcomeCriteria || []).find((c) => c.status === "PROVEN")
          ?.statement || completenessClaim(record);
      objective = frameChallengeObjective(record, claim, {
        preferPeerHint: true,
        evidencePackage: buildEvidencePackage(record),
      });
      record.loop.forceNextKind = undefined;
      writeBuildRecord(runtimeRoot, record);
    } else if (engineers[engineers.length - 1]?.adoptedSha) {
      return {
        ok: true,
        done: false,
        action: "await_runtime_refresh",
        reason: "preview_pending",
        build: record,
      };
    } else if (revisionDiscardedWithoutAdoption(record)) {
      record.loop.status = "paused";
      record.loop.blockedReason = undefined;
      record.loop.pausedAt = record.loop.pausedAt || new Date().toISOString();
      syncConversationLifecycle(record);
      writeBuildRecord(runtimeRoot, record);
      return {
        ok: true,
        done: false,
        paused: true,
        awaitCreator: true,
        action: "await_creator_after_discard",
        build: readBuildRecord(runtimeRoot, buildId),
      };
    } else {
      record.loop.status = "blocked";
      record.loop.blockedReason =
        engineers[engineers.length - 1]?.failureReason ||
        "Engineering did not return a verified durable result.";
      syncConversationLifecycle(record);
      writeBuildRecord(runtimeRoot, record);
      return {
        ok: true,
        done: false,
        blocked: true,
        action: "blocked",
        reason: record.loop.blockedReason,
        build: readBuildRecord(runtimeRoot, buildId),
      };
    }

    const engineOverride = record.loop.preferredEngineOverride || null;
    if (engineOverride) {
      record.loop.preferredEngineOverride = undefined;
      writeBuildRecord(runtimeRoot, record);
    }
    const dispatched = await dispatchChild(buildId, kind, objective, {
      ...(kind === "challenge"
        ? { preferEngine: null, preferredEngine: null }
        : engineOverride
          ? { preferredEngine: engineOverride }
          : {}),
    });
    if (!dispatched.ok) return dispatched;
    if (kind === "engineer" && record.loop.pendingSelectedElement) {
      const latest = readBuildRecord(runtimeRoot, buildId);
      if (latest) {
        latest.loop.pendingSelectedElement = null;
        writeBuildRecord(runtimeRoot, latest);
      }
    }

    if (fakeMode) {
      const consumed = await awaitAndConsume(buildId, dispatched.taskId);
      record = readBuildRecord(runtimeRoot, buildId);
      const after = assessCompletion(buildId);
      if (after.complete) {
        markComplete(buildId);
        return {
          ok: true,
          done: true,
          action: "complete",
          kind,
          taskId: dispatched.taskId,
          build: readBuildRecord(runtimeRoot, buildId),
        };
      }
      return {
        ok: true,
        done: false,
        action: "child_finished",
        kind,
        taskId: dispatched.taskId,
        build: record,
        completionReason: after.reason,
      };
    }

    return {
      ok: true,
      done: false,
      action: dispatched.deduped ? "deduped_child" : "dispatched",
      kind,
      taskId: dispatched.taskId,
      build: readBuildRecord(runtimeRoot, buildId),
    };
  }

  /**
   * Run until complete, blocked, or maxSteps.
   * @param {string} buildId
   * @param {{ maxSteps?: number }} [options]
   */
  async function runUntilDone(buildId, options = {}) {
    const maxSteps = typeof options.maxSteps === "number" ? options.maxSteps : 12;
    const syncRuntime =
      typeof options.syncRuntime === "function" ? options.syncRuntime : null;
    /** @type {object[]} */
    const steps = [];
    for (let i = 0; i < maxSteps; i += 1) {
      // After adoption, refresh preview + browser evidence before more dispatch.
      const before = readBuildRecord(runtimeRoot, buildId);
      if (
        syncRuntime &&
        before &&
        (before.loop?.pendingRuntimeRefresh ||
          browserEvidenceStale(before))
      ) {
        try {
          await syncRuntime(buildId);
          await runDepthA(buildId);
        } catch {
          /* best-effort */
        }
      }

      const step = await tick(buildId);
      steps.push({
        i,
        action: step.action,
        kind: step.kind,
        taskId: step.taskId,
        done: step.done,
        blocked: step.blocked,
        paused: step.paused,
        reason: step.reason || step.completionReason,
      });
      if (!step.ok) return { ok: false, steps, error: step };
      if (step.done || step.blocked || step.paused || step.awaitingReview) {
        return {
          ok: true,
          done: Boolean(step.done),
          blocked: Boolean(step.blocked),
          paused: Boolean(step.paused),
          awaitingReview: Boolean(step.awaitingReview),
          steps,
          build: readBuildRecord(runtimeRoot, buildId),
        };
      }
      if (step.action === "await_runtime_refresh" && syncRuntime) {
        try {
          await syncRuntime(buildId);
          await runDepthA(buildId);
        } catch {
          /* best-effort */
        }
        continue;
      }
    }
    return {
      ok: true,
      done: false,
      steps,
      build: readBuildRecord(runtimeRoot, buildId),
      reason: "max_steps",
    };
  }

  /**
   * Conversation-first product control — classifies free text into Build semantics.
   * @param {string} buildId
   * @param {{
   *   message: string,
   *   element?: object | null,
   * }} input
   */
  async function applyConversation(buildId, input) {
    const { classifyConversationMessage } = await import("./conversation.mjs");
    const record = readBuildRecord(runtimeRoot, buildId);
    if (!record) return { ok: false, code: "BUILD_NOT_FOUND" };
    const text = String(input.message || "").trim();
    if (!text) return { ok: false, code: "MESSAGE_REQUIRED" };
    if (
      record.pendingCandidate?.status === "pending" ||
      record.loop.status === "awaiting_review"
    ) {
      if (!Array.isArray(record.conversation)) record.conversation = [];
      const already = record.conversation.some(
        (msg) => msg.role === "user" && String(msg.text || "").trim() === text,
      );
      if (!already) {
        record.conversation.push({
          id: `msg-${randomUUID().slice(0, 8)}`,
          role: "user",
          text,
          at: new Date().toISOString(),
          kind: "queued_during_review",
          status: "queued",
        });
      }
      record.loop.status = "awaiting_review";
      writeBuildRecord(runtimeRoot, record);
      return {
        ok: true,
        queued: true,
        awaitingReview: true,
        build: readBuildRecord(runtimeRoot, buildId),
      };
    }
    const selectedElement = normalizeSelectedElement(input.element);

    const classified = classifyConversationMessage(text, {
      hasSelection: Boolean(selectedElement),
    });
    if (!Array.isArray(record.conversation)) record.conversation = [];
    const pending = drainPendingConversations(runtimeRoot, buildId);
    const activeChild = [...(record.children || [])].reverse().find(
      (child) =>
        child.dispatchState === "selected" ||
        child.dispatchState === "dispatched",
    );
    const known = new Set(
      record.conversation.map((msg) => String(msg.id || "")).filter(Boolean),
    );
    for (const queued of pending) {
      const id = String(queued.id || "");
      if (id && known.has(id)) continue;
      if (
        queued.role === "user" &&
        String(queued.text || "").trim() === text &&
        record.conversation.some(
          (msg) => msg.role === "user" && String(msg.text || "").trim() === text,
        )
      ) {
        continue;
      }
      record.conversation.push({
        ...queued,
        status: queued.status || (activeChild ? "queued" : "incorporated"),
      });
      if (id) known.add(id);
    }
    const already = record.conversation.some(
      (msg) => msg.role === "user" && String(msg.text || "").trim() === text,
    );
    if (!already) {
      record.conversation.push({
        id: `msg-${randomUUID().slice(0, 8)}`,
        role: "user",
        text,
        at: new Date().toISOString(),
        kind: classified.kind,
        element: selectedElement || undefined,
        status: activeChild ? "queued" : "incorporated",
      });
    } else {
      // Same creator text already on the current revision after Discard/pause:
      // re-arm only — do not mint another intent revision or duplicate messages.
      const existing = (record.conversation || []).find(
        (msg) => msg.role === "user" && String(msg.text || "").trim() === text,
      );
      const onCurrentRevision =
        existing &&
        Number.isFinite(existing.intentRevision) &&
        existing.intentRevision === record.intent?.outcomeRevision;
      if (
        onCurrentRevision &&
        (record.loop.status === "paused" ||
          record.loop.status === "blocked" ||
          record.loop.pendingConversationSteer)
      ) {
        record.loop.status = "running";
        record.loop.blockedReason = undefined;
        record.loop.pauseRequested = false;
        if (!record.loop.forceNextKind) {
          record.loop.forceNextKind = fakeMode ? "engineer" : "brief";
        }
        record.loop.pendingConversationSteer = true;
        record.hypotheses.proposedNextAction =
          classified.engineerObjectiveHint ||
          record.hypotheses.proposedNextAction;
        if (existing.status === "discarded") existing.status = "queued";
        syncConversationLifecycle(record);
        writeBuildRecord(runtimeRoot, record);
        return {
          ok: true,
          rearmed: true,
          build: readBuildRecord(runtimeRoot, buildId),
        };
      }
    }
    if (selectedElement) {
      record.loop.pendingSelectedElement = selectedElement;
    }
    record.hypotheses.proposedNextAction = classified.engineerObjectiveHint;
    writeBuildRecord(runtimeRoot, record);

    /** @type {{ outcome?: string, addRequirements?: Array<{ statement: string }>, note?: string, demoteAll?: boolean }} */
    const revision = {
      note: [
        classified.steerNote,
        selectedElement
          ? `Selected element: ${JSON.stringify(selectedElement)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      demoteAll: true,
    };
    if (classified.kind === "revise_outcome" && classified.outcomePatch) {
      revision.outcome = classified.outcomePatch;
    }
    if (classified.kind === "requirement" && classified.requirement) {
      revision.addRequirements = [{ statement: classified.requirement }];
    }

    const revised = await reviseIntent(buildId, revision);
    if (!revised.ok) return revised;

    const after = readBuildRecord(runtimeRoot, buildId);
    if (after) {
      if (!Array.isArray(after.conversation)) after.conversation = [];
      const rev = after.intent.outcomeRevision;
      for (const msg of after.conversation) {
        if (
          msg.role === "user" &&
          !msg.intentRevision &&
          msg.kind &&
          msg.kind !== "outcome"
        ) {
          msg.intentRevision = rev;
        }
      }
      syncConversationLifecycle(after);
      after.hypotheses.proposedNextAction = classified.engineerObjectiveHint;
      writeBuildRecord(runtimeRoot, after);
    }

    return {
      ok: true,
      classified,
      build: readBuildRecord(runtimeRoot, buildId),
    };
  }

  /**
   * Product-level steering — revise intent.
   * @param {string} buildId
   * @param {{
   *   outcome?: string,
   *   addRequirements?: Array<{ statement: string, id?: string }>,
   *   note?: string,
   *   demoteAll?: boolean,
   * }} revision
   */
  async function reviseIntent(buildId, revision) {
    let record = readBuildRecord(runtimeRoot, buildId);
    if (!record) {
      return { ok: false, code: "BUILD_NOT_FOUND" };
    }
    const now = new Date().toISOString();
    record.intent.outcomeRevision += 1;
    record.intent.revisedAt = now;
    if (typeof revision.outcome === "string" && revision.outcome.trim()) {
      record.intent.outcome = revision.outcome.trim().slice(0, 8_000);
    }
    if (Array.isArray(revision.addRequirements)) {
      for (const r of revision.addRequirements) {
        record.intent.explicitRequirements.push({
          id: r.id || `req-${record.intent.explicitRequirements.length + 1}`,
          statement: String(r.statement || "").slice(0, 2_000),
          required: true,
          status: "UNKNOWN",
          evidence: [],
        });
      }
    }
    const priorBrief = record.productBrief || {};
    const steerBlob = [
      record.intent.outcome,
      revision.note || "",
      typeof revision.outcome === "string" ? revision.outcome : "",
    ]
      .filter(Boolean)
      .join("\n");
    const inferredKind = inferProductKind(steerBlob);
    const priorKind =
      priorBrief.productKind && priorBrief.productKind !== "unknown"
        ? priorBrief.productKind
        : null;
    const productKind =
      inferredKind !== "unknown" ? inferredKind : priorKind || "unknown";
    const nextBriefRevision = (Number(priorBrief.revision) || 0) + 1;
    if (inferredKind === "web" && record.criteriaAuthority !== "caller") {
      const derived = deriveProductBrief(steerBlob, {
        buildId: record.buildId,
        intentRevision: record.intent.outcomeRevision,
        revision: nextBriefRevision,
        productKind: "web",
      });
      record.productBrief = {
        ...derived,
        source: "mechanical-revision",
        stale: true,
        productKind: "web",
        intentRevision: record.intent.outcomeRevision,
        revision: nextBriefRevision,
        revisionContext: String(revision.note || "").slice(0, 2_000),
      };
      record.outcomeCriteria = briefToOutcomeCriteria(record.productBrief);
    } else {
      record.productBrief = {
        ...priorBrief,
        buildId: record.buildId,
        intentRevision: record.intent.outcomeRevision,
        revision: nextBriefRevision,
        source: "mechanical-revision",
        outcome: record.intent.outcome,
        productKind,
        stale: true,
        revisionContext: String(revision.note || "").slice(0, 2_000),
        derivedAt: now,
      };
    }
    // Hypotheses are disposable; force next engineering toward new requirements.
    const newReqGap = (revision.addRequirements || [])
      .map((r) => String(r.statement || "").trim())
      .filter(Boolean)
      .map((s) => `MUST satisfy now: ${s}`)
      .join("\n");
    record.hypotheses.proposedNextAction =
      newReqGap ||
      (typeof revision.outcome === "string" && revision.outcome.trim()
        ? `Re-align product with revised outcome: ${revision.outcome.trim().slice(0, 500)}`
        : record.hypotheses.proposedNextAction || "");
    record.hypotheses.architectureNotes = [
      record.hypotheses.architectureNotes || "",
      revision.note ? `Steer: ${revision.note}` : "",
      `Intent revised to r${record.intent.outcomeRevision}`,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4_000);
    record.hypotheses.updatedAt = now;

    // Outcome text change OR demoteAll (conversation change) → demote criteria.
    if (
      revision.demoteAll ||
      (revision.addRequirements || []).length > 0 ||
      (typeof revision.outcome === "string" && revision.outcome.trim())
    ) {
      for (const c of record.outcomeCriteria || []) {
        if (c.status === "PROVEN") {
          c.status = "UNKNOWN";
          c.updatedAt = now;
        }
      }
    }
    record.loop.pendingReinspect = true;
    // Product steers must engineer before re-evaluate. Real mode first renews
    // the revision-bound S3 ProductBrief, then the brief lifecycle selects the
    // engineer; fake mode can select the engineer directly.
    if (revision.demoteAll || revision.note || revision.outcome) {
      record.loop.forceNextKind = "engineer";
      record.loop.pendingConversationSteer = true;
    }
    // Require fresh evaluate/challenge for this revision before COMPLETE.
    record.loop.lastEvaluateTaskId = undefined;
    record.loop.lastChallengeTaskId = undefined;
    if (!fakeMode) record.loop.forceNextKind = "brief";
    // A NEW creator request after pause/Discard/block must re-arm the loop.
    // Discard correctly left paused+autoRun false; this message starts Request N+1 only.
    if (
      record.loop.status === "complete" ||
      record.loop.status === "paused" ||
      record.loop.status === "blocked"
    ) {
      record.loop.status = "running";
      record.loop.blockedReason = undefined;
      record.loop.pauseRequested = false;
    }
    writeBuildRecord(runtimeRoot, record);

    // Supersede active evaluate/challenge — do not steer them into product edits.
    await supersedeActiveCognitiveChildren(buildId, "ABANDONED_SUPERSEDED_BY_STEER");
    record = readBuildRecord(runtimeRoot, buildId) || record;

    // Steer only an active engineer child (product mutation is intentional there).
    const active = [...(record.children || [])]
      .reverse()
      .find(
        (c) =>
          c.kind === "engineer" &&
          (c.dispatchState === "dispatched" || c.dispatchState === "selected"),
      );
    if (active && gateway.steerTask) {
      const text = [
        `PATH Build product-level intent revision r${record.intent.outcomeRevision}.`,
        `Updated outcome: ${record.intent.outcome}`,
        ...(revision.addRequirements || []).map(
          (r) => `New requirement: ${r.statement}`,
        ),
        revision.note || "",
        "Respect explicit requirements; do not silently weaken them.",
      ]
        .filter(Boolean)
        .join("\n");
      try {
        await gateway.steerTask(active.taskId, text);
      } catch {
        // best-effort
      }
    }

    await runDepthA(buildId);
    return { ok: true, build: readBuildRecord(runtimeRoot, buildId) };
  }

  /**
   * Compact evidence package for evaluate/challenge objectives.
   * @param {import('./types.mjs').BuildRecord} record
   */
  function buildEvidencePackage(record) {
    const lastBrowser = Array.isArray(record.browserEvidence)
      ? record.browserEvidence.slice(-1)[0]
      : null;
    const brief = record.productBrief;
    const binding = (record.projectBindings || [])[0];
    return [
      `authoritativeSha: ${record.authoritativeSha || "(none)"}`,
      `productBranch: ${record.productBranch || "(none)"}`,
      `projectRoot: ${binding?.projectRoot || "(none)"}`,
      `previewUrl: ${record.previewUrl || "(none)"}`,
      `runtimeHealth: ${record.runtimeHealth || "(unknown)"}`,
      `productKind: ${brief?.productKind || "(unknown)"}`,
      `productBrief: ${(brief?.summary || brief?.title || "(none)").toString().slice(0, 400)}`,
      `acceptanceCriteria: ${(brief?.acceptanceCriteria || [])
        .map((c) => c.statement || c.id)
        .slice(0, 12)
        .join(" | ")}`,
      lastBrowser
        ? [
            `browserEvidence: ok=${lastBrowser.ok} sha=${lastBrowser.authoritativeSha || "?"} title=${lastBrowser.title || ""}`,
            `  html=${lastBrowser.htmlPath || ""} shot=${lastBrowser.screenshotPath || ""}`,
            `  textSample=${String(lastBrowser.textSample || "").slice(0, 4_000)}`,
            `  consoleErrors=${(lastBrowser.consoleErrors || []).slice(0, 5).join("; ")}`,
          ].join("\n")
        : "browserEvidence: (none)",
      `adoptionHistory: ${(record.adoptionHistory || [])
        .slice(-4)
        .map((a) => `${a.taskId}:${a.sourceSha}->${a.adoptedSha}`)
        .join(", ") || "(none)"}`,
      `criteria: ${(record.outcomeCriteria || [])
        .map((c) => `${c.id}=${c.status}`)
        .join(", ")}`,
      "Challenge/evaluate MUST use this evidence (DOM/screenshot/SHA/runtime) — do not trust engineer narrative alone.",
    ].join("\n");
  }

  /**
   * Attach runtime/preview health onto the Build record (called by surface).
   * @param {string} buildId
   * @param {{
   *   previewUrl?: string | null,
   *   runtimeHealth?: string | null,
   *   authoritativeSha?: string | null,
   *   browserEvidence?: object | null,
   *   clearRuntimeRefresh?: boolean,
   * }} patch
   */
  function patchRuntimeState(buildId, patch) {
    const record = readBuildRecord(runtimeRoot, buildId);
    if (!record) return { ok: false, code: "BUILD_NOT_FOUND" };
    if (typeof patch.previewUrl === "string" || patch.previewUrl === null) {
      record.previewUrl = patch.previewUrl;
    }
    if (typeof patch.runtimeHealth === "string" || patch.runtimeHealth === null) {
      record.runtimeHealth = patch.runtimeHealth;
    }
    if (typeof patch.authoritativeSha === "string" && patch.authoritativeSha) {
      record.authoritativeSha = patch.authoritativeSha;
    }
    if (patch.browserEvidence && typeof patch.browserEvidence === "object") {
      if (!Array.isArray(record.browserEvidence)) record.browserEvidence = [];
      record.browserEvidence.push({
        ...patch.browserEvidence,
        authoritativeSha:
          patch.browserEvidence.authoritativeSha || record.authoritativeSha,
        observedAt: new Date().toISOString(),
      });
      // Keep last 8
      record.browserEvidence = record.browserEvidence.slice(-8);
    }
    if (patch.clearRuntimeRefresh) {
      record.loop.pendingRuntimeRefresh = false;
    }
    writeBuildRecord(runtimeRoot, record);
    return { ok: true, build: record };
  }

  return {
    startBuild,
    applyConversation,
    load,
    recover,
    stopBuild,
    pauseBuild,
    resumeBuild,
    reconcileBuildChildren,
    runDepthA,
    dispatchChild,
    awaitAndConsume,
    consumeChildResult,
    assessCompletion,
    markComplete,
    tick,
    runUntilDone,
    applyCandidate,
    discardCandidate,
    reviseIntent,
    patchRuntimeState,
    formatStatus: (buildId) => {
      const b = readBuildRecord(runtimeRoot, buildId);
      return b ? formatBuildStatus(b) : "Build not found.";
    },
    findLatestActive: () => findLatestActiveBuild(runtimeRoot),
    frameEngineerObjective,
    frameEvaluateObjective,
    frameChallengeObjective,
  };
}

export {
  formatBuildStatus,
  readBuildRecord,
  findLatestActiveBuild,
  syncConversationLifecycle,
};
