/**
 * S5 — PATH Build controller (Option A′ durable product-level loop).
 */

import { createHash, randomUUID } from "node:crypto";
import { readTaskCheckpoint } from "../ag10/task-checkpoint.mjs";
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
} from "./record.mjs";
import { ensureBuildOrigin, isBindableProject } from "./origin.mjs";
import {
  captureBindingReality,
  makeEvidenceRef,
} from "./evidence.mjs";
import {
  realityRefreshDepthA,
  buildTargetedRevalidationObjective,
  parseStatusDirectives,
  readReportText,
} from "./reinspect.mjs";
import {
  frameEngineerObjective,
  frameEvaluateObjective,
  frameChallengeObjective,
  completenessClaim,
} from "./objectives.mjs";
import { formatBuildStatus } from "./format.mjs";
import { mechanicalProbeBinding } from "./mechanical-probe.mjs";

/**
 * @typedef {{
 *   bindProject: (cwd: string) => Promise<object>,
 *   startTask: (objective: string, extra?: object) => Promise<object>,
 *   resumeTask?: (taskId: string, extra?: object) => Promise<object>,
 *   awaitTask: (taskId: string, timeoutMs?: number) => Promise<object>,
 *   snapshotTask?: (taskId: string) => Promise<object>,
 *   steerTask?: (taskId: string, text: string) => Promise<object>,
 *   getResult?: (taskId: string) => Promise<object>,
 * }} BuildGatewayPort
 */

/**
 * @param {{
 *   runtimeRoot: string,
 *   gateway: BuildGatewayPort,
 *   fakeMode?: boolean,
 *   preferredEngine?: string | null,
 * }} opts
 */
export function createBuildController(opts) {
  const runtimeRoot = opts.runtimeRoot;
  const gateway = opts.gateway;
  const fakeMode = opts.fakeMode === true;
  const controllerPreferredEngine =
    typeof opts.preferredEngine === "string" && opts.preferredEngine.trim()
      ? opts.preferredEngine.trim()
      : typeof process.env.PATHCODE_PREFERRED_ENGINE === "string" &&
          process.env.PATHCODE_PREFERRED_ENGINE.trim()
        ? process.env.PATHCODE_PREFERRED_ENGINE.trim()
        : null;

  /**
   * @param {import('./types.mjs').BuildTaskKind} kind
   * @param {{ preferEngine?: string|null, preferredEngine?: string|null }} [extra]
   * @returns {string|undefined}
   */
  function resolveDispatchPreferredEngine(kind, extra = {}) {
    if (kind === "challenge") return undefined;
    const fromExtra =
      (typeof extra.preferredEngine === "string" && extra.preferredEngine) ||
      (typeof extra.preferEngine === "string" && extra.preferEngine) ||
      null;
    if (extra.preferEngine === null || extra.preferredEngine === null) {
      return undefined;
    }
    const resolved = fromExtra || controllerPreferredEngine;
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

    if (Array.isArray(options.initialCriteria)) {
      record.outcomeCriteria = options.initialCriteria.map((c, i) => ({
        id: c.id || `c-${i + 1}`,
        statement: String(c.statement || "").slice(0, 2_000),
        required: c.required !== false,
        status: /** @type {const} */ ("UNKNOWN"),
        evidence: [],
        updatedAt: new Date().toISOString(),
      }));
    }

    let projectRoot = options.targetDir;
    if (!isBindableProject(projectRoot)) {
      const origin = ensureBuildOrigin({ targetDir: projectRoot });
      if (!origin.ok) return origin;
      record.projectBindings.push(origin.binding);
      projectRoot = origin.binding.projectRoot;
    } else {
      const { resolveTargetProjectRoot } = await import("../paths.mjs");
      const discovered = resolveTargetProjectRoot(projectRoot);
      if (!discovered.ok) {
        return {
          ok: false,
          code: discovered.code,
          message: discovered.message,
        };
      }
      record.projectBindings.push({
        bindingId: `bind-${randomUUID().slice(0, 8)}`,
        projectRoot: discovered.projectRoot,
        originGitInit: false,
      });
      projectRoot = discovered.projectRoot;
    }

    const bound = await gateway.bindProject(projectRoot);
    if (bound && bound.ok === false) return bound;

    record.hypotheses.proposedNextAction =
      "Establish the software architecture, manifests, and runnable structure required by the outcome.";
    record.hypotheses.gapPlan = [
      "origin established — first engineer establishes architecture",
    ];
    record.loop.pendingReinspect = false;

    writeBuildRecord(runtimeRoot, record);
    return { ok: true, build: record, projectRoot };
  }

  /**
   * @param {string} buildId
   */
  function load(buildId) {
    return readBuildRecord(runtimeRoot, buildId);
  }

  /**
   * Recover Build + children; idempotent consume; pending reinspect.
   * @param {string} buildId
   */
  async function recover(buildId) {
    scrubBuildTempFiles(runtimeRoot);
    let record = readBuildRecord(runtimeRoot, buildId);
    if (!record) {
      return { ok: false, code: "BUILD_NOT_FOUND", message: `no build ${buildId}` };
    }

    // Repair selected→dispatched if task checkpoint exists
    for (const child of record.children) {
      if (child.dispatchState === "selected") {
        const cp = readTaskCheckpoint(runtimeRoot, child.taskId);
        if (cp) {
          child.dispatchState = "dispatched";
          child.dispatchedAt = child.dispatchedAt || new Date().toISOString();
        }
      }
      if (
        child.dispatchState === "dispatched" ||
        child.dispatchState === "terminal_seen"
      ) {
        const cp = readTaskCheckpoint(runtimeRoot, child.taskId);
        const terminal =
          cp &&
          (cp.finalState === "completed" ||
            cp.finalState === "failed" ||
            cp.finalState === "interrupted" ||
            cp.finalState === "abandoned" ||
            (cp.validation && cp.validation.classification));
        if (terminal && child.dispatchState !== "consumed") {
          child.dispatchState = "terminal_seen";
          child.terminalAt = child.terminalAt || new Date().toISOString();
          child.classification =
            (cp.validation && cp.validation.classification) ||
            cp.finalState ||
            child.classification;
        }
      }
    }

    writeBuildRecord(runtimeRoot, record);

    // Consume terminal_seen children once
    for (const child of [...record.children]) {
      if (child.dispatchState === "terminal_seen") {
        await consumeChildResult(buildId, child.taskId);
        record = readBuildRecord(runtimeRoot, buildId) || record;
      }
    }

    record = readBuildRecord(runtimeRoot, buildId) || record;
    if (record.loop.pendingReinspect) {
      await runDepthA(buildId);
      record = readBuildRecord(runtimeRoot, buildId) || record;
    }

    return { ok: true, build: record };
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
    return {
      ok: true,
      delta: refresh.delta,
      recommendedNext: refresh.recommendedNext,
      needsTargetedRevalidation: refresh.needsTargetedRevalidation,
      build: record,
    };
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
      const cp = readTaskCheckpoint(runtimeRoot, taskId);
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
    if (child) {
      child.dispatchState = "dispatched";
      child.dispatchedAt = new Date().toISOString();
      child.taskId = started?.taskId || taskId;
    }
    if (kind === "evaluate") record.loop.lastEvaluateTaskId = child?.taskId || taskId;
    if (kind === "challenge") record.loop.lastChallengeTaskId = child?.taskId || taskId;
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

    if (input.kind === "engineer") {
      // Create a tiny marker file to simulate engineering progress
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { join } = await import("node:path");
      mkdirSync(join(input.binding.projectRoot, "src"), { recursive: true });
      writeFileSync(
        join(input.binding.projectRoot, "src", "path-build-marker.txt"),
        `build=${input.buildId}\nkind=engineer\n`,
        "utf8",
      );
      writeFileSync(
        join(input.binding.projectRoot, "package.json"),
        `${JSON.stringify({ name: "path-build-proof", private: true, type: "module", scripts: { test: "node -e \"console.log('ok')\"" } }, null, 2)}\n`,
        "utf8",
      );
      reportBody += "Created src/path-build-marker.txt and package.json\n";
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
        headSha: reality.headSha,
        diffFingerprint: reality.dirtyFingerprint,
        finalState: "completed",
        validation: { classification },
        changedFiles: reality.changedFiles,
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

    const cp = readTaskCheckpoint(runtimeRoot, taskId);
    const reportPath = engineeringReportExists(taskId, runtimeRoot)
      ? resolveEngineeringReportPath(taskId, runtimeRoot)
      : null;
    const reportText = reportPath ? readReportText(reportPath) : "";
    const binding = record.projectBindings.find((b) => b.bindingId === child.bindingId);
    const reality = binding
      ? captureBindingReality(binding.projectRoot)
      : null;

    const resultFingerprint = createHash("sha256")
      .update(
        `${taskId}:${cp?.finalState || ""}:${cp?.sha || ""}:${cp?.diffFingerprint || ""}:${reportText.slice(0, 500)}`,
      )
      .digest("hex")
      .slice(0, 24);

    // Apply assessment directives from engineering reports
    if (
      child.kind === "evaluate" ||
      child.kind === "challenge" ||
      child.kind === "engineer"
    ) {
      applyAssessmentToRecord(record, reportText, {
        taskId,
        bindingId: child.bindingId,
        reality,
        kind: child.kind,
      });
    }

    // Engineer progress / no-progress
    const classification = String(
      (cp?.validation && cp.validation.classification) ||
        cp?.finalState ||
        "",
    );
    const failed =
      cp?.finalState === "failed" ||
      /FAIL|NOT_VERIFIED|BLOCKED/i.test(classification);
    const noValidationCandidates = /no discoverable project validation/i.test(
      String(
        (cp?.validation && cp.validation.reason) || reportText || "",
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
    child.classification =
      (cp?.validation && cp.validation.classification) ||
      cp?.finalState ||
      child.classification;
    child.terminalAt = child.terminalAt || new Date().toISOString();
    record.loop.lastConsumedActionId = child.actionId;
    record.loop.pendingReinspect = true;

    writeBuildRecord(runtimeRoot, record);

    // Depth A immediately after consume
    const depthA = await runDepthA(buildId, child.bindingId, taskId);

    // Mechanical FS/check probe — updates criteria from authoritative reality
    let probe = null;
    try {
      const rec2 = readBuildRecord(runtimeRoot, buildId);
      if (rec2) {
        probe = mechanicalProbeBinding({
          record: rec2,
          bindingId: child.bindingId,
          taskId,
          changedFiles: cp?.changedFiles || reality?.changedFiles || [],
        });
        if (probe.ok && Array.isArray(probe.updates) && probe.updates.length) {
          writeBuildRecord(runtimeRoot, rec2);
        }
      }
    } catch {
      probe = null;
    }

    return {
      ok: true,
      build: readBuildRecord(runtimeRoot, buildId),
      depthA,
      probe,
      reportPath,
    };
  }

  /**
   * @param {import('./types.mjs').BuildRecord} record
   * @param {string} reportText
   * @param {{ taskId: string, bindingId: string, reality: ReturnType<typeof captureBindingReality>|null, kind: string }} ctx
   */
  function applyAssessmentToRecord(record, reportText, ctx) {
    const directives = parseStatusDirectives(reportText);
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
  }

  /**
   * @param {string} buildId
   */
  function assessCompletion(buildId) {
    const record = readBuildRecord(runtimeRoot, buildId);
    if (!record) {
      return { ok: false, code: "BUILD_NOT_FOUND" };
    }
    if (record.loop.pendingReinspect) {
      return {
        ok: true,
        complete: false,
        reason: "pendingReinspect",
        build: record,
      };
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
      /VERIFIED/i.test(String(child.classification || ""));
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
    const recovered = await recover(buildId);
    if (!recovered.ok) return recovered;
    let record = /** @type {import('./types.mjs').BuildRecord} */ (recovered.build);

    if (record.loop.status === "complete") {
      return { ok: true, done: true, build: record, action: "already_complete" };
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

    const bindingForProbe = primaryBinding(record);
    if (bindingForProbe) {
      try {
        const reality = captureBindingReality(bindingForProbe.projectRoot);
        const probe = mechanicalProbeBinding({
          record,
          bindingId: bindingForProbe.bindingId,
          changedFiles: reality?.changedFiles || [],
        });
        if (probe.ok && Array.isArray(probe.updates) && probe.updates.length) {
          writeBuildRecord(runtimeRoot, record);
          record = readBuildRecord(runtimeRoot, buildId) || record;
        }
      } catch {
        // best-effort mechanical refresh
      }
    }

    const completion = assessCompletion(buildId);
    if (completion.complete) {
      const marked = markComplete(buildId);
      return { ok: true, done: true, build: marked.build, action: "complete" };
    }

    // Decide next kind
    const engineers = record.children.filter((c) => c.kind === "engineer");
    const evaluates = record.children.filter((c) => c.kind === "evaluate");
    const challenges = record.children.filter((c) => c.kind === "challenge");
    const demoted =
      (record.loop.lastRealityDelta &&
        Array.isArray(record.loop.lastRealityDelta.demotedIds) &&
        record.loop.lastRealityDelta.demotedIds) ||
      [];

    /** @type {import('./types.mjs').BuildTaskKind} */
    let kind = "engineer";
    let objective = "";

    if (engineers.length === 0) {
      kind = "engineer";
      objective = frameEngineerObjective(
        record,
        record.hypotheses.proposedNextAction || "",
      );
    } else if (completion.reason === "requirements_unsatisfied") {
      kind = "engineer";
      const openReqs = (record.intent.explicitRequirements || []).filter(
        (r) => r.required !== false && r.status !== "SATISFIED",
      );
      const gap =
        openReqs.map((r) => `[${r.id}] ${r.statement}`).join(" · ") ||
        "Close remaining explicit operator requirements.";
      objective = frameEngineerObjective(record, gap);
    } else if (
      demoted.length > 0 &&
      completion.reason === "criteria_unproven"
    ) {
      kind = "evaluate";
      objective = buildTargetedRevalidationObjective(record, demoted);
    } else if (evaluates.length === 0 || (engineers.length > evaluates.length && engineers.length % 2 === 0)) {
      kind = "evaluate";
      objective = frameEvaluateObjective(record);
    } else if (
      completion.reason === "challenge_required" ||
      (evaluates.length > 0 &&
        challenges.length === 0 &&
        (record.outcomeCriteria || []).some((c) => c.status === "PROVEN"))
    ) {
      kind = "challenge";
      const claim =
        (record.outcomeCriteria || []).find((c) => c.status === "PROVEN")
          ?.statement || completenessClaim(record);
      objective = frameChallengeObjective(record, claim, {
        preferPeerHint: true,
      });
    } else if (completion.reason === "evaluate_required") {
      kind = "evaluate";
      objective = frameEvaluateObjective(record);
    } else {
      kind = "engineer";
      objective = frameEngineerObjective(
        record,
        record.hypotheses.proposedNextAction ||
          "Advance the highest-value remaining gap toward the Build outcome.",
      );
    }

    // No-progress: force evaluate
    if ((record.loop.noProgressCount || 0) >= 2 && kind === "engineer") {
      kind = "evaluate";
      objective = frameEvaluateObjective(record);
    }

    const dispatched = await dispatchChild(buildId, kind, objective, {
      ...(kind === "challenge"
        ? { preferEngine: null, preferredEngine: null }
        : {}),
    });
    if (!dispatched.ok) return dispatched;

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

  /**
   * Run until complete, blocked, or maxSteps.
   * @param {string} buildId
   * @param {{ maxSteps?: number }} [options]
   */
  async function runUntilDone(buildId, options = {}) {
    const maxSteps = typeof options.maxSteps === "number" ? options.maxSteps : 12;
    /** @type {object[]} */
    const steps = [];
    for (let i = 0; i < maxSteps; i += 1) {
      const step = await tick(buildId);
      steps.push({
        i,
        action: step.action,
        kind: step.kind,
        taskId: step.taskId,
        done: step.done,
        blocked: step.blocked,
        reason: step.reason || step.completionReason,
      });
      if (!step.ok) return { ok: false, steps, error: step };
      if (step.done || step.blocked) {
        return {
          ok: true,
          done: Boolean(step.done),
          blocked: Boolean(step.blocked),
          steps,
          build: readBuildRecord(runtimeRoot, buildId),
        };
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
   * Product-level steering — revise intent.
   * @param {string} buildId
   * @param {{
   *   outcome?: string,
   *   addRequirements?: Array<{ statement: string, id?: string }>,
   *   note?: string,
   * }} revision
   */
  async function reviseIntent(buildId, revision) {
    const record = readBuildRecord(runtimeRoot, buildId);
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
    // Invalidate hypotheses + demote criteria/requirements to UNKNOWN
    record.hypotheses.proposedNextAction = "";
    record.hypotheses.architectureNotes = [
      record.hypotheses.architectureNotes || "",
      revision.note ? `Steer: ${revision.note}` : "",
      `Intent revised to r${record.intent.outcomeRevision}`,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4_000);
    record.hypotheses.updatedAt = now;
    for (const c of record.outcomeCriteria || []) {
      if (c.status === "PROVEN") {
        c.status = "UNKNOWN";
        c.updatedAt = now;
      }
    }
    for (const r of record.intent.explicitRequirements || []) {
      if (r.status === "SATISFIED") r.status = "UNKNOWN";
    }
    record.loop.pendingReinspect = true;
    record.loop.lastEvaluateTaskId = undefined;
    record.loop.lastChallengeTaskId = undefined;
    if (record.loop.status === "complete") {
      record.loop.status = "running";
    }
    writeBuildRecord(runtimeRoot, record);

    // Steer active dispatched child if any
    const active = [...record.children]
      .reverse()
      .find((c) => c.dispatchState === "dispatched");
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

  return {
    startBuild,
    load,
    recover,
    runDepthA,
    dispatchChild,
    awaitAndConsume,
    consumeChildResult,
    assessCompletion,
    markComplete,
    tick,
    runUntilDone,
    reviseIntent,
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

export { formatBuildStatus, readBuildRecord, findLatestActiveBuild };
