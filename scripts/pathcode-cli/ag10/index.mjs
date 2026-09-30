/**
 * G10 — collaborative engine fabric façade over G9 + engines + guards.
 */

import {
  createCheckpointSkeleton,
  patchTaskCheckpoint,
  readTaskCheckpoint,
  findLatestResumableCheckpoint,
  writeTaskCheckpoint,
  markTaskInterrupted,
  markIncompleteCheckpointsInterrupted,
  clearTaskInterrupted,
} from "./task-checkpoint.mjs";
import { reconcileTaskProcesses } from "../task-processes.mjs";
import {
  captureTaskReality,
  reconcileTaskReality,
  detectProgress,
} from "./task-reality.mjs";
import {
  normalizeG10Event,
  toSessionEvent,
  mapAntigravityBridgeEvent,
} from "./events.mjs";
import {
  EventIdempotencyGuard,
  NoProgressCircuitBreaker,
  ResourceCircuitBreaker,
  StaleIntelligenceGuard,
  ExternalActionRegistry,
  withMutationLease,
} from "./guards.mjs";
import { SteeringQueue } from "./steering.mjs";
import { createCopilotEngine } from "./copilot-sdk.mjs";
import { createCursorEngine, resolveCursorApiKey } from "./cursor-sdk.mjs";
import { buildModelExecutionFromResolution } from "../model-plane/execution-provenance.mjs";
import { resolveAg1BridgeConfiguration, resolveAg1ExecutionIdentity } from "../ag1/cloud-env.mjs";
import { resolveProductionEngineModel } from "../model-plane/production-context.mjs";
import {
  selectEngineForTurn,
  resolvePreferredEngine,
  explainEngineSelection,
  inferTurnNeeds,
  buildEngineCapabilityList,
  buildFabricHandoff,
  formatFabricHandoff,
} from "./engine-contract.mjs";
import { bindAntigravitySession } from "./ag-session.mjs";
import {
  withCollabTurn,
  formatCollabHandoff,
  readCollabJournal,
  chooseCollabEngine as chooseCollabEngineBase,
} from "../ag9/collaborate.mjs";

/**
 * @param {{
 *   runtimeRoot: string,
 *   taskId: string,
 *   sessionId?: string,
 *   worktreePath: string,
 *   repoRoot?: string,
 *   objective?: string,
 *   emit?: (event: object) => void,
 *   wallClockMs?: number,
 *   preferCopilotSdk?: boolean,
 *   toolEnv?: Record<string, string>,
 *   agModelResolution?: object,
 *   copilotConfigDirectory?: string,
 * }} options
 */
export async function createG10Fabric(options) {
  const emitRaw = typeof options.emit === "function" ? options.emit : () => {};
  const idempotency = new EventIdempotencyGuard();
  const noProgress = new NoProgressCircuitBreaker();
  const resources = new ResourceCircuitBreaker({
    timeCeilingMs:
      typeof options.wallClockMs === "number" && options.wallClockMs > 0
        ? options.wallClockMs
        : undefined,
  });
  const steering = new SteeringQueue();
  const externalActions = new ExternalActionRegistry(
    options.runtimeRoot,
    options.taskId,
  );

  /**
   * Emit normalized G10 → session event with idempotency.
   * @param {Parameters<typeof normalizeG10Event>[0]} input
   */
  function emitG10(input) {
    const g10 = normalizeG10Event({
      ...input,
      taskId: options.taskId,
    });
    if (!g10) return null;
    if (!idempotency.accept(g10.id)) return null;
    const sessionEvent = toSessionEvent(g10);
    emitRaw(sessionEvent);
    return g10;
  }

  function emitSession(event) {
    if (event && typeof event.type === "string") emitRaw(event);
  }

  // Seed checkpoint.
  const reality0 = captureTaskReality(options.worktreePath, options.toolEnv);
  let checkpoint = readTaskCheckpoint(options.runtimeRoot, options.taskId);
  if (!checkpoint) {
    checkpoint = createCheckpointSkeleton({
      taskId: options.taskId,
      sessionId: options.sessionId || options.taskId,
      worktreePath: options.worktreePath,
      repoRoot: options.repoRoot,
      objective: options.objective,
      headSha: reality0.headSha || undefined,
      diffFingerprint: reality0.diffFingerprint,
      preparedCapabilities: [],
      copilotMode: "none",
      agSessionMode: "NONE",
    });
    writeTaskCheckpoint(options.runtimeRoot, checkpoint);
  } else {
    steering.restoreFromCheckpoint(checkpoint.pendingSteering || []);
  }

  emitG10({
    family: checkpoint.finalState ? "task.resumed" : "task.started",
    detail: options.objective?.slice(0, 120) || options.taskId,
    payload: { mode: checkpoint.agSessionMode },
  });

  /** @type {Awaited<ReturnType<typeof createCopilotEngine>> | null} */
  let copilot = null;
  /** @type {Awaited<ReturnType<typeof createCursorEngine>> | null} */
  let cursor = null;
  /** @type {ReturnType<typeof bindAntigravitySession> | null} */
  let agBind = null;

  function resolveSelectedModel(engineId, providerModelId = null) {
    return resolveProductionEngineModel({
      engineId,
      env: { ...process.env, ...(options.toolEnv || {}) },
      projectRoot: options.repoRoot || checkpoint.repoRoot,
      readUserPreferences: true,
      checkpoint,
      providerModelId,
    });
  }

  function persist(patch = {}) {
    const reality = captureTaskReality(options.worktreePath, options.toolEnv);
    checkpoint = patchTaskCheckpoint(options.runtimeRoot, options.taskId, {
      worktreePath: options.worktreePath,
      objective: options.objective,
      headSha: reality.headSha || undefined,
      diffFingerprint: reality.diffFingerprint,
      pendingSteering: steering.toCheckpoint(),
      copilotMode: copilot?.getMode?.() || checkpoint.copilotMode || "none",
      copilotSessionId:
        copilot?.getSessionId?.() || checkpoint.copilotSessionId,
      cursorMode: cursor?.getMode?.() || checkpoint.cursorMode || "none",
      cursorSessionId:
        cursor?.getSessionId?.() || checkpoint.cursorSessionId,
      agSessionMode: agBind?.getMode?.() || checkpoint.agSessionMode || "NONE",
      agTaskId: options.taskId,
      usage: resources.evaluate().metrics,
      collaboration: {
        noProgress: noProgress.consecutiveNoProgress,
        handoffs: resources.handoffs,
        breaker: noProgress.state,
      },
      ...patch,
    });
    return checkpoint;
  }

  /**
   * S4.2 — durable heartbeat before an engine turn so mid-turn death still
   * leaves authoritative task/engine/worktree facts.
   * @param {string} engine
   */
  /**
   * Record an engine turn that actually started or finished.
   * Attachment and readiness do not call this.
   * @param {{
   *   engine: string,
   *   role?: string,
   *   mode?: string | null,
   *   provider?: string | null,
   *   model?: string | null,
   *   sessionId?: string | null,
   *   state?: string,
   *   startedAt?: string,
   *   finishedAt?: string | null,
   * }} partial
   */
  function noteEngineExecution(partial) {
    const engine = String(partial?.engine || "").toLowerCase();
    if (!/^(antigravity|copilot|cursor)$/.test(engine)) return checkpoint;
    const role = /^(primary|repair|handoff)$/.test(String(partial.role || ""))
      ? String(partial.role)
      : "handoff";
    const executionRow =
      partial?.modelExecution && typeof partial.modelExecution === "object"
        ? partial.modelExecution
        : null;
    const prior = Array.isArray(checkpoint.engineTurns) ? [...checkpoint.engineTurns] : [];
    const last = prior[prior.length - 1];
    const finishing =
      last &&
      last.engine === engine &&
      last.role === role &&
      !last.finishedAt &&
      partial.state &&
      partial.state !== "started";
    if (finishing) {
      prior[prior.length - 1] = {
        ...last,
        state: String(partial.state).slice(0, 40),
        finishedAt: partial.finishedAt || new Date().toISOString(),
        model: partial.model === undefined ? last.model : partial.model,
        provider: partial.provider === undefined ? last.provider : partial.provider,
        mode: partial.mode || last.mode,
        sessionId: partial.sessionId || last.sessionId,
        ...(executionRow ? executionRow : {}),
      };
    } else {
      prior.push({
        engine,
        provider: typeof partial.provider === "string" ? partial.provider : null,
        model:
          executionRow
            ? null
            : typeof partial.model === "string" && partial.model.trim()
              ? partial.model.trim()
              : null,
        mode: typeof partial.mode === "string" ? partial.mode : null,
        sessionId: typeof partial.sessionId === "string" ? partial.sessionId : null,
        taskId: options.taskId,
        role,
        startedAt: partial.startedAt || new Date().toISOString(),
        finishedAt: null,
        state: partial.state || "started",
        ...(executionRow ? executionRow : {}),
      });
    }
    return persist({
      engineTurns: prior.slice(-16),
      latestEngineTurn: engine,
      inFlightEngine: engine,
    });
  }

  function beginEngineTurn(engine) {
    try {
      reconcileTaskProcesses(options.runtimeRoot, options.taskId);
    } catch {
      /* ignore */
    }
    const reality = captureTaskReality(options.worktreePath, options.toolEnv);
    return persist({
      latestEngineTurn: `in_flight:${engine}`,
      inFlightStartedAt: new Date().toISOString(),
      inFlightEngine: engine,
      headSha: reality.headSha || undefined,
      diffFingerprint: reality.diffFingerprint,
      changedFiles:
        Array.isArray(reality.changedFiles) && reality.changedFiles.length
          ? reality.changedFiles
          : checkpoint.changedFiles,
      preferredEngine:
        typeof options.preferredEngine === "string"
          ? options.preferredEngine
          : checkpoint.preferredEngine,
      continuityReason: `in-flight ${engine} — durable snapshot before engine turn`,
    });
  }

  /**
   * Honest engine interruption while Gateway may still be alive.
   * @param {string} engine
   * @param {string} reason
   * @param {{ nativeResumePossible?: boolean }} [extra]
   */
  function noteEngineInterrupted(engine, reason, extra = {}) {
    markTaskInterrupted(
      options.runtimeRoot,
      options.taskId,
      `${engine}: ${reason}`,
    );
    persist({
      latestEngineTurn: `interrupted:${engine}`,
      continuityDisposition: "interrupted",
      interruptedAt: new Date().toISOString(),
      continuityReason: String(reason).slice(0, 400),
    });
    emitG10({
      family: "task.interrupted",
      engine,
      detail: String(reason).slice(0, 200),
      payload: {
        nativeResumePossible: extra.nativeResumePossible === true,
        recovery: "path_durable_rehydrate_or_native_if_valid",
      },
    });
    emitSession({
      type: "session.hydration",
      stage: "engine_interrupted",
      detail: String(reason).slice(0, 200),
      mode: engine,
    });
  }

  /**
   * After a successful reconstruct/resume attach, clear interrupt markers.
   * @param {{ mode?: string, resumed?: boolean }} [info]
   */
  function noteContinuityRestored(info = {}) {
    clearTaskInterrupted(
      options.runtimeRoot,
      options.taskId,
      info.resumed
        ? "native engine session resumed — same PATH task"
        : "PATH durable rehydrate — same PATH task (not native session resume)",
    );
    persist({
      continuityDisposition: "active",
      continuityReason: info.resumed
        ? `native_resume:${info.mode || "engine"}`
        : `path_rehydrate:${info.mode || "engine"}`,
    });
  }

  async function attachCopilot(modelResolution = resolveSelectedModel("copilot")) {
    // Prefer default Copilot auth discovery (~/.copilot). Only use an explicit
    // PATH-owned configDirectory when the caller opts in — isolating config
    // without forwarding OAuth makes every turn AUTH_REQUIRED.
    const configDirectory = options.copilotConfigDirectory;
    copilot = await createCopilotEngine({
      taskId: options.taskId,
      cwd: options.worktreePath,
      sessionId: checkpoint.copilotSessionId || `path-${options.taskId}`,
      toolEnv: options.toolEnv,
      projectRoot: options.repoRoot || checkpoint.repoRoot,
      checkpoint,
      modelResolution,
      preferSdk: options.preferCopilotSdk !== false,
      runtimeRoot: options.runtimeRoot,
      ...(configDirectory ? { configDirectory } : {}),
      emit: emitSession,
    });
    const connected = await copilot.ensureConnected({
      resumeSessionId: checkpoint.copilotSessionId || undefined,
    });
    persist({
      copilotMode: copilot.getMode(),
      copilotSessionId: copilot.getSessionId() || undefined,
    });
    if (connected?.ok) {
      const wasInterrupted =
        checkpoint.continuityDisposition === "interrupted" ||
        typeof checkpoint.interruptedAt === "string";
      if (wasInterrupted) {
        noteContinuityRestored({
          mode: copilot.getMode(),
          resumed: connected.resumed === true,
        });
      }
      emitG10({
        family: "collaboration.handoff",
        engine: "copilot",
        detail:
          connected.resumed === true
            ? "Copilot native session resumed"
            : wasInterrupted
              ? "Copilot session ready (PATH rehydrate / create — not claimed as native resume)"
              : `Copilot ${copilot.getMode()} ready`,
        payload: {
          resumed: connected.resumed === true,
          mode: copilot.getMode(),
          restoredFromInterrupt: wasInterrupted,
        },
      });
    }
    if (copilot.getMode() === "cli_fallback") {
      emitG10({
        family: "degraded.mode",
        engine: "copilot",
        detail: "Copilot SDK → CLI harness fallback",
        payload: { mode: "cli_fallback" },
      });
    }
    return connected;
  }

  async function attachCursor(modelResolution = resolveSelectedModel("cursor")) {
    cursor = await createCursorEngine({
      taskId: options.taskId,
      cwd: options.worktreePath,
      sessionId: checkpoint.cursorSessionId || `path-cursor-${options.taskId}`,
      toolEnv: options.toolEnv,
      projectRoot: options.repoRoot || checkpoint.repoRoot,
      checkpoint,
      modelResolution,
      emit: emitSession,
    });
    const connected = await cursor.ensureConnected({
      resumeSessionId: checkpoint.cursorSessionId || undefined,
    });
    const apiKeyPresent = Boolean(
      resolveCursorApiKey(
        { ...process.env, ...(options.toolEnv || {}) },
        { includeStored: true },
      ),
    );
    persist({
      cursorMode: cursor.getMode(),
      cursorSessionId: cursor.getSessionId() || undefined,
      cursorUnavailableReason: connected?.ok
        ? undefined
        : String(connected?.detail || connected?.code || cursor.getDegradeReason?.() || "unavailable").slice(0, 300),
      cursorRuntime: {
        node: process.version,
        execPath: process.execPath,
        apiKeyPresent,
        sdkResolved: cursor.getMode() === "native_sdk" || connected?.code !== "SDK_FAILURE",
      },
    });
    if (connected?.ok) {
      const wasInterrupted =
        checkpoint.continuityDisposition === "interrupted" ||
        typeof checkpoint.interruptedAt === "string";
      if (wasInterrupted) {
        noteContinuityRestored({
          mode: cursor.getMode(),
          resumed: connected.resumed === true,
        });
      }
      emitG10({
        family: "collaboration.handoff",
        engine: "cursor",
        detail:
          connected.resumed === true
            ? "Cursor native session resumed"
            : wasInterrupted
              ? "Cursor session ready (PATH rehydrate / create — not claimed as native resume)"
              : `Cursor ${cursor.getMode()} ready`,
        payload: {
          resumed: connected.resumed === true,
          mode: cursor.getMode(),
          restoredFromInterrupt: wasInterrupted,
        },
      });
    }
    return connected;
  }

  /**
   * @param {object} agent createAntigravityEngineeringAgent handle
   */
  function attachAntigravity(agent) {
    agBind = bindAntigravitySession({
      taskId: options.taskId,
      agent,
      emit: emitSession,
    });
    return agBind;
  }

  /**
   * Accept operator steering immediately.
   * @param {string} text
   */
  function acceptSteering(text) {
    const item = steering.accept(text);
    if (item.status === "PENDING") {
      emitG10({
        family: "steering.pending",
        detail: item.text.slice(0, 160),
        providerEventId: item.id,
      });
      persist();
    }
    return item;
  }

  /**
   * Apply pending steering at a safe boundary.
   */
  function applySteeringBoundary() {
    const result = steering.applyAtBoundary();
    if (result.deferred) {
      return result;
    }
    for (const item of result.applied) {
      emitG10({
        family: "steering.applied",
        detail: item.text.slice(0, 160),
        providerEventId: `${item.id}:applied`,
      });
    }
    persist();
    return result;
  }

  /**
   * Collaborative Copilot turn under mutation lease.
   * @param {{ prompt: string, model?: string, timeoutMs?: number, expectedFingerprint?: string }} turn
   */
  async function runCopilotCollabTurn(turn) {
    const copilotPlane = resolveSelectedModel("copilot", typeof turn.model === "string" ? turn.model : null);
    if (!copilot) await attachCopilot(copilotPlane);
    const budget = resources.evaluate();
    if (budget.state === "hard") {
      emitG10({
        family: "guard.circuit",
        detail: budget.reason || "resource ceiling",
      });
      return {
        ok: false,
        code: budget.reason,
        detail: "resource circuit breaker",
        changedFiles: [],
      };
    }

    const steeringApply = applySteeringBoundary();
    const prompt = [
      turn.prompt,
      steeringApply.combinedText
        ? `\nOperator steering (apply):\n${steeringApply.combinedText}`
        : "",
      formatCollabHandoff(
        readCollabJournal({
          runtimeRoot: options.runtimeRoot,
          taskId: options.taskId,
          limit: 12,
        }),
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const before = captureTaskReality(options.worktreePath, options.toolEnv);
    beginEngineTurn("copilot");
    const copilotRole = /^(primary|repair|handoff)$/.test(String(turn.role || ""))
      ? String(turn.role)
      : "handoff";
    const copilotModelExecution = copilotPlane.ok
      ? buildModelExecutionFromResolution({
          resolution: copilotPlane,
          engine: "copilot",
          engineMode: copilot.getMode?.() || "none",
          provider: null,
          actualModelKnown: false,
        })
      : null;
    noteEngineExecution({
      engine: "copilot",
      role: copilotRole,
      mode: copilot.getMode?.() || "none",
      provider: null,
      sessionId: copilot.getSessionId?.() || null,
      state: "started",
      modelExecution: copilotModelExecution,
    });
    steering.setMutationActive(true);
    try {
      const leased = await withMutationLease(
        {
          withCollabTurn,
          captureTaskReality: (p) => captureTaskReality(p, options.toolEnv),
          runtimeRoot: options.runtimeRoot,
          taskId: options.taskId,
          engine: "copilot",
          worktreePath: options.worktreePath,
          timeoutMs: turn.timeoutMs,
          expectedFingerprint: turn.expectedFingerprint,
        },
        async () => {
          emitG10({
            family: "collaboration.handoff",
            engine: "copilot",
            detail: "continuing repair in the task workspace",
          });
          const result = await copilot.runEngineeringTurn({
            prompt,
            timeoutMs: turn.timeoutMs,
            modelResolution: copilotPlane,
          });
          return result;
        },
      );
      if (
        leased &&
        leased.ok === false &&
        /SDK_FAILURE|TIMEOUT|ECONN|PROCESS|EXIT|disconnect/i.test(
          `${leased.code || ""} ${leased.detail || ""}`,
        )
      ) {
        noteEngineInterrupted(
          "copilot",
          String(leased.detail || leased.code || "copilot turn failed"),
          { nativeResumePossible: Boolean(checkpoint.copilotSessionId) },
        );
      }
      const after = captureTaskReality(options.worktreePath, options.toolEnv);
      const progress = detectProgress({ before, after });
      resources.recordHandoff();
      const breaker = noProgress.recordHandoff({
        productive: progress.productive || leased?.ok === true,
      });
      if (breaker.action === "warn") {
        emitG10({
          family: "guard.circuit",
          detail: "no-progress collaboration warning",
        });
      }
      if (breaker.action === "stop_auto_bounce") {
        emitG10({
          family: "task.blocked",
          detail: "NO_PROGRESS_COLLABORATION — needs direction",
        });
      }
      noteEngineExecution({
        engine: "copilot",
        role: copilotRole,
        mode: copilot.getMode?.() || null,
        sessionId: copilot.getSessionId?.() || null,
        state: leased?.ok === true ? "finished" : "failed",
        modelExecution: copilotModelExecution,
      });
      persist({
        latestEngineTurn: "copilot",
        collaboration: {
          noProgress: noProgress.consecutiveNoProgress,
          handoffs: resources.handoffs,
          breaker: noProgress.state,
          lastProgress: progress,
        },
      });
      return {
        ...leased,
        progress,
        breaker,
        mode: copilot.getMode(),
      };
    } finally {
      steering.setMutationActive(false);
      applySteeringBoundary();
    }
  }

  /**
   * Collaborative Cursor turn under mutation lease.
   * @param {{ prompt: string, model?: string, timeoutMs?: number, expectedFingerprint?: string, signal?: AbortSignal }} turn
   */
  async function runCursorCollabTurn(turn) {
    const cursorPlane = resolveSelectedModel("cursor", typeof turn.model === "string" ? turn.model : null);
    if (!cursor) await attachCursor(cursorPlane);
    const budget = resources.evaluate();
    if (budget.state === "hard") {
      emitG10({
        family: "guard.circuit",
        detail: budget.reason || "resource ceiling",
      });
      return {
        ok: false,
        code: budget.reason,
        detail: "resource circuit breaker",
        changedFiles: [],
      };
    }

    const steeringApply = applySteeringBoundary();
    const prompt = [
      turn.prompt,
      steeringApply.combinedText
        ? `\nOperator steering (apply):\n${steeringApply.combinedText}`
        : "",
      formatCollabHandoff(
        readCollabJournal({
          runtimeRoot: options.runtimeRoot,
          taskId: options.taskId,
          limit: 12,
        }),
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const before = captureTaskReality(options.worktreePath, options.toolEnv);
    beginEngineTurn("cursor");
    const cursorRole = /^(primary|repair|handoff)$/.test(String(turn.role || ""))
      ? String(turn.role)
      : "handoff";
    const cursorModelExecution = cursorPlane.ok
      ? buildModelExecutionFromResolution({
          resolution: cursorPlane,
          engine: "cursor",
          engineMode: "native_sdk",
          provider: null,
          actualModelKnown: false,
        })
      : null;
    noteEngineExecution({
      engine: "cursor",
      role: cursorRole,
      mode: "native_sdk",
      provider: null,
      sessionId: cursor.getSessionId?.() || null,
      state: "started",
      modelExecution: cursorModelExecution,
    });
    steering.setMutationActive(true);
    try {
      const leased = await withMutationLease(
        {
          withCollabTurn,
          captureTaskReality: (p) => captureTaskReality(p, options.toolEnv),
          runtimeRoot: options.runtimeRoot,
          taskId: options.taskId,
          engine: "cursor",
          worktreePath: options.worktreePath,
          timeoutMs: turn.timeoutMs,
          expectedFingerprint: turn.expectedFingerprint,
        },
        async () => {
          emitG10({
            family: "collaboration.handoff",
            engine: "cursor",
            detail: "continuing repair in the task workspace",
          });
          const result = await cursor.runEngineeringTurn({
            prompt,
            timeoutMs: turn.timeoutMs,
            signal: turn.signal,
            modelResolution: cursorPlane,
          });
          return result;
        },
      );
      if (
        leased &&
        leased.ok === false &&
        /SDK_FAILURE|TIMEOUT|ECONN|PROCESS|EXIT|disconnect|unavailable/i.test(
          `${leased.code || ""} ${leased.detail || ""}`,
        )
      ) {
        noteEngineInterrupted(
          "cursor",
          String(leased.detail || leased.code || "cursor turn failed"),
          { nativeResumePossible: Boolean(checkpoint.cursorSessionId) },
        );
      }
      const after = captureTaskReality(options.worktreePath, options.toolEnv);
      const progress = detectProgress({ before, after });
      resources.recordHandoff();
      const breaker = noProgress.recordHandoff({
        productive: progress.productive || leased?.ok === true,
      });
      if (breaker.action === "warn") {
        emitG10({
          family: "guard.circuit",
          detail: "no-progress collaboration warning",
        });
      }
      if (breaker.action === "stop_auto_bounce") {
        emitG10({
          family: "task.blocked",
          detail: "NO_PROGRESS_COLLABORATION — needs direction",
        });
      }
      noteEngineExecution({
        engine: "cursor",
        role: cursorRole,
        mode: cursor.getMode?.() || "native_sdk",
        sessionId: cursor.getSessionId?.() || null,
        state: leased?.ok === true ? "finished" : "failed",
        modelExecution: cursorModelExecution,
      });
      persist({
        latestEngineTurn: "cursor",
        cursorMode: cursor.getMode(),
        cursorSessionId: cursor.getSessionId() || undefined,
        collaboration: {
          noProgress: noProgress.consecutiveNoProgress,
          handoffs: resources.handoffs,
          breaker: noProgress.state,
          lastProgress: progress,
        },
      });
      return {
        ...leased,
        progress,
        breaker,
        mode: cursor.getMode(),
      };
    } finally {
      steering.setMutationActive(false);
      applySteeringBoundary();
    }
  }

  /**
   * Collaborative Antigravity turn under mutation lease.
   * @param {{
   *   runTurn: () => Promise<object>|object,
   *   timeoutMs?: number,
   *   expectedFingerprint?: string,
   * }} turn
   */
  async function runAntigravityCollabTurn(turn) {
    const budget = resources.evaluate();
    if (budget.state === "hard") {
      emitG10({
        family: "guard.circuit",
        detail: budget.reason || "resource ceiling",
      });
      return { ok: false, code: budget.reason, breaker: budget };
    }
    if (noProgress.state === "stop") {
      emitG10({
        family: "task.blocked",
        detail: "NO_PROGRESS_COLLABORATION",
      });
      return {
        ok: false,
        code: "NO_PROGRESS_COLLABORATION",
        breaker: { action: "stop_auto_bounce" },
      };
    }

    applySteeringBoundary();
    const before = captureTaskReality(options.worktreePath, options.toolEnv);
    beginEngineTurn("antigravity");
    const agRole = /^(primary|repair|handoff)$/.test(String(turn.role || ""))
      ? String(turn.role)
      : "handoff";
    const agConfiguration = resolveAg1BridgeConfiguration({
      env: { ...process.env, ...(options.toolEnv || {}) },
      modelResolution: options.agModelResolution?.ok
        ? options.agModelResolution
        : resolveSelectedModel("antigravity"),
    });
    const agPlane = agConfiguration.resolution;
    const agEnv = agConfiguration.ok ? agConfiguration.env : null;
    const agIdentity = resolveAg1ExecutionIdentity(agEnv || process.env);
    const agModelExecution = agPlane.ok
      ? buildModelExecutionFromResolution({
          resolution: agPlane,
          engine: "antigravity",
          engineMode: "bridge",
          provider: agIdentity.provider,
          actualModelKnown: false,
        })
      : null;
    noteEngineExecution({
      engine: "antigravity",
      role: agRole,
      mode: "bridge",
      provider: agIdentity.provider,
      sessionId: null,
      state: "started",
      modelExecution: agModelExecution,
    });
    steering.setMutationActive(true);
    try {
      const leased = await withMutationLease(
        {
          withCollabTurn,
          captureTaskReality: (p) => captureTaskReality(p, options.toolEnv),
          runtimeRoot: options.runtimeRoot,
          taskId: options.taskId,
          engine: "antigravity",
          worktreePath: options.worktreePath,
          timeoutMs: turn.timeoutMs,
          expectedFingerprint: turn.expectedFingerprint,
        },
        async () => {
          emitG10({
            family: "collaboration.handoff",
            engine: "antigravity",
            detail: "continuing engineering in the task workspace",
          });
          return turn.runTurn({
            providerModelId: agPlane.ok ? agPlane.providerModelId : null,
            env: agEnv,
          });
        },
      );
      const after = captureTaskReality(options.worktreePath, options.toolEnv);
      const progress = detectProgress({ before, after });
      resources.recordHandoff();
      const breaker = noProgress.recordHandoff({
        productive: progress.productive,
      });
      if (breaker.action === "warn") {
        emitG10({
          family: "guard.circuit",
          detail: "no-progress collaboration warning",
        });
      }
      if (breaker.action === "stop_auto_bounce") {
        emitG10({
          family: "task.blocked",
          detail: "NO_PROGRESS_COLLABORATION — needs direction",
        });
      }
      noteEngineExecution({
        engine: "antigravity",
        role: agRole,
        mode: "bridge",
        provider: agIdentity.provider,
        state: leased?.ok === true ? "finished" : "failed",
        modelExecution: agModelExecution,
      });
      persist({
        latestEngineTurn: "antigravity",
        agSessionMode: agBind?.getMode?.() || "ACTIVE",
      });
      return { ...leased, progress, breaker };
    } finally {
      steering.setMutationActive(false);
      applySteeringBoundary();
    }
  }

  /**
   * Map AG bridge message into G10 events.
   * Skip activity/tool — AG1 session already emits the rich session.* path.
   * Remapping those produces duplicate weak labels (Inspecting / file modified).
   * @param {object} msg
   */
  function onAntigravityBridgeEvent(msg) {
    const type = typeof msg?.type === "string" ? msg.type : "";
    if (type === "activity" || type === "tool" || type === "started") {
      return;
    }
    const mapped = mapAntigravityBridgeEvent(msg);
    if (mapped && idempotency.accept(mapped.id)) {
      emitSession(toSessionEvent(mapped));
    }
  }

  /**
   * Consume background result only if fingerprint matches.
   * @param {{ fingerprint: string, kind: string, result: unknown }} recorded
   */
  function acceptBackgroundResult(recorded) {
    const current = captureTaskReality(
      options.worktreePath,
      options.toolEnv,
    ).diffFingerprint;
    const verdict = StaleIntelligenceGuard.classify(recorded, current);
    if (!verdict.ok) {
      emitG10({
        family: "background.stale",
        detail: `${recorded.kind}: ${verdict.reason}`,
      });
      return { ok: false, ...verdict };
    }
    emitG10({
      family: "background.completed",
      detail: recorded.kind,
    });
    return { ok: true, ...verdict, result: recorded.result };
  }

  function reconcileResume() {
    const cp = readTaskCheckpoint(options.runtimeRoot, options.taskId);
    return reconcileTaskReality({
      checkpoint: cp,
      worktreePath: options.worktreePath,
      env: options.toolEnv,
    });
  }

  function markFinal(state, extra = {}) {
    persist({ finalState: state, ...extra });
    if (state === "VERIFIED") {
      emitG10({ family: "task.verified", detail: state });
    } else if (state === "FAILED") {
      emitG10({ family: "task.failed", detail: state });
    } else if (state === "BLOCKED" || state === "NEEDS_DIRECTION") {
      emitG10({ family: "task.blocked", detail: state });
    }
  }

  async function shutdown() {
    persist();
    try {
      await copilot?.disconnect?.();
    } catch {
      /* ignore */
    }
    try {
      await cursor?.disconnect?.();
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {{
   *   attempt: number,
   *   copilotReady: boolean,
   *   cursorReady?: boolean,
   *   prefer?: string | null,
   *   lastEngine?: string | null,
   *   needs?: import('./engine-contract.mjs').TurnNeed[],
   * }} input
   */
  function chooseCollabEngine(input) {
    const capabilities = buildEngineCapabilityList({
      antigravity: true,
      copilot: {
        ready: Boolean(input.copilotReady),
        mode: copilot?.getMode?.() || checkpoint.copilotMode || "none",
      },
      cursor: {
        ready:
          typeof input.cursorReady === "boolean"
            ? input.cursorReady
            : cursor?.getMode?.() === "native_sdk",
        mode: cursor?.getMode?.() || checkpoint.cursorMode || "none",
      },
    });
    return chooseCollabEngineBase({
      ...input,
      cursorReady:
        typeof input.cursorReady === "boolean"
          ? input.cursorReady
          : cursor?.getMode?.() === "native_sdk",
      capabilities,
    });
  }

  /**
   * @param {Parameters<typeof explainEngineSelection>[0]} input
   */
  function explainCollabSelection(input) {
    const capabilities = buildEngineCapabilityList({
      antigravity: input.ready?.antigravity !== false,
      copilot: {
        ready: input.ready?.copilot === true,
        mode: copilot?.getMode?.() || checkpoint.copilotMode || "none",
      },
      cursor: {
        ready: input.ready?.cursor === true,
        mode: cursor?.getMode?.() || checkpoint.cursorMode || "none",
      },
    });
    return explainEngineSelection({
      ...input,
      capabilities,
    });
  }

  /**
   * Build a structured PATH fabric handoff for the next engine turn.
   * @param {{
   *   toEngine: string,
   *   fromEngine?: string | null,
   *   needs?: import('./engine-contract.mjs').TurnNeed[],
   *   reason?: string,
   *   validationSummary?: string,
   *   pendingSteering?: string,
   * }} input
   */
  function buildNextHandoff(input) {
    const reality = captureTaskReality(options.worktreePath, options.toolEnv);
    const journal = readCollabJournal({
      runtimeRoot: options.runtimeRoot,
      taskId: options.taskId,
      limit: 12,
    });
    return buildFabricHandoff({
      fromEngine: input.fromEngine || checkpoint.latestEngineTurn || null,
      toEngine: input.toEngine,
      objective: options.objective,
      needs: input.needs,
      reason: input.reason,
      journal,
      changedFiles: reality.changedFiles,
      headSha: reality.headSha,
      validationSummary: input.validationSummary,
      pendingSteering: input.pendingSteering,
    });
  }

  return {
    emitG10,
    emitSession,
    persist,
    beginEngineTurn,
    noteEngineExecution,
    noteEngineInterrupted,
    noteContinuityRestored,
    attachCopilot,
    attachCursor,
    attachAntigravity,
    acceptSteering,
    applySteeringBoundary,
    runCopilotCollabTurn,
    runCursorCollabTurn,
    runAntigravityCollabTurn,
    onAntigravityBridgeEvent,
    acceptBackgroundResult,
    reconcileResume,
    markFinal,
    shutdown,
    chooseCollabEngine,
    explainCollabSelection,
    buildNextHandoff,
    selectEngineForTurn,
    resolvePreferredEngine,
    inferTurnNeeds,
    formatFabricHandoff,
    getCheckpoint: () => checkpoint,
    getSteering: () => steering,
    getNoProgress: () => noProgress,
    getResources: () => resources,
    getExternalActions: () => externalActions,
    getCopilot: () => copilot,
    getCursor: () => cursor,
    getAgBind: () => agBind,
    resolveSelectedModel,
  };
}

export {
  findLatestResumableCheckpoint,
  readTaskCheckpoint,
  createCheckpointSkeleton,
  writeTaskCheckpoint,
  patchTaskCheckpoint,
  markTaskInterrupted,
  markIncompleteCheckpointsInterrupted,
  clearTaskInterrupted,
  captureTaskReality,
  reconcileTaskReality,
  detectProgress,
  StaleIntelligenceGuard,
  NoProgressCircuitBreaker,
  EventIdempotencyGuard,
  ResourceCircuitBreaker,
  ExternalActionRegistry,
  withMutationLease,
  SteeringQueue,
};

export {
  assessTaskContinuity,
  formatContinuityBrief,
  formatReopenNotice,
  isPidAlive,
} from "./task-continuity.mjs";

export {
  reconcileHostStartup,
  listRecoverableTasks,
} from "./host-startup.mjs";

export {
  normalizeG10Event,
  toSessionEvent,
  mapCopilotSdkEvent,
  mapCursorSdkEvent,
  mapAntigravityBridgeEvent,
  makeEventId,
  G10_EVENT_FAMILIES,
} from "./events.mjs";

export {
  classifyAgSessionContinuity,
  buildAgRehydratePrompt,
  bindAntigravitySession,
} from "./ag-session.mjs";

export {
  createCopilotEngine,
  loadCopilotSdk,
  classifyCopilotFailure,
} from "./copilot-sdk.mjs";

export {
  createCursorEngine,
  loadCursorSdk,
  detectCursorEngine,
  classifyCursorFailure,
  resolveCursorApiKey,
} from "./cursor-sdk.mjs";

export {
  selectEngineForTurn,
  explainEngineSelection,
  resolvePreferredEngine,
  normalizeEngineId,
  buildEngineCapabilityList,
  withEngineProvenance,
  inferTurnNeeds,
  engineSupportsNeed,
  engineMeetsNeeds,
  buildFabricHandoff,
  formatFabricHandoff,
  ENGINE_CAPABILITY_TEMPLATES,
  declareAntigravityEngineCapability,
  declareCopilotEngineCapability,
  declareCursorEngineCapability,
} from "./engine-contract.mjs";

export {
  probeEngineReadiness,
  probeAntigravityReadiness,
  probeCopilotReadiness,
  probeCursorReadiness,
  readinessToFabricLive,
} from "./engine-readiness.mjs";
