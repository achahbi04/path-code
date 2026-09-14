/**
 * AG1 — PATH engineering session host.
 * Isolated worktree → Antigravity bridge → independent PATH validation.
 */

import { randomUUID } from "node:crypto";
import { resolve, basename } from "node:path";

import { createAntigravityEngineeringAgent } from "./bridge-client.mjs";
import { assertAg1VenvReady } from "./venv-guard.mjs";
import { ensureAg1Runtime } from "./runtime-bootstrap.mjs";
import { proveLocalSandboxConfinement } from "./sandbox-proof.mjs";
import { detectAg1Auth } from "./auth-detect.mjs";
import { hydrateAg1CloudEnv } from "./cloud-env.mjs";
import { admitPrimaryCheckout } from "./admission.mjs";
import { commitTaskWorktree } from "./task-commit.mjs";
import {
  capturePrimaryFingerprint,
  collectWorktreeResult,
  createTaskWorktree,
  primaryUntouched,
  removeTaskWorktree,
  reopenTaskWorktree,
} from "./task-worktree.mjs";
import {
  classifyAg1Result,
  runIndependentFinalValidation,
  setFinalValidationProgressHook,
} from "./final-validation.mjs";
import { resolveEngineeringCwd, resolvePathRuntimeRoot } from "../paths.mjs";
import {
  buildBoundedDiffPreview,
  buildFullResultInspectCommand,
} from "../ag7/diff-preview.mjs";
import {
  AG8_MAX_REPAIR_ATTEMPTS,
  buildValidationRepairPrompt,
  discoverCapabilityPlane,
  discoverProjectMcpConfigs,
  applyMcpTrustPolicy,
  toAntigravityMcpServers,
  extractEngineeringHandoff,
  shouldAttemptSameSessionRepair,
  runCopilotAdvisory,
} from "../ag8/index.mjs";

/** Default wall clock — finite, not a 5-call micro-budget. */
export const AG1_DEFAULT_WALL_CLOCK_MS = 1_200_000;
export const AG1_DEFAULT_MAX_MODEL_CALLS = 48;
export const AG1_DEFAULT_MAX_TOOL_CALLS = 200;

const ACTIVITY_LABELS = Object.freeze({
  understanding: "Understanding",
  inspecting: "Inspecting",
  editing: "Implementing",
  implementing: "Implementing",
  running_command: "Running command",
  testing: "Testing",
  diagnosing: "Diagnosing",
  correcting: "Correcting",
  verifying: "Verifying",
  repairing: "Repairing",
  mcp: "MCP",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
});

/**
 * Compact capability matrix for session events (no secrets / no env values).
 * @param {any} plane
 */
function compactCapabilityMatrix(plane) {
  if (!plane || typeof plane !== "object") {
    return { languages: [], toolchains: [], languageIntelligence: [] };
  }
  const mapStatus = (arr) =>
    Array.isArray(arr)
      ? arr.map((x) => ({
          id: typeof x?.id === "string" ? x.id : "",
          status: typeof x?.status === "string" ? x.status : "unavailable",
        }))
      : [];
  return {
    languages: mapStatus(plane.languages),
    toolchains: mapStatus(plane.toolchains),
    languageIntelligence: mapStatus(plane.languageIntelligence),
    specialist: {
      copilot: {
        status:
          typeof plane.specialist?.copilot?.status === "string"
            ? plane.specialist.copilot.status
            : "unavailable",
      },
    },
  };
}

/**
 * @param {any} validation
 */
async function runSessionValidation(emit, worktree, engineeringCwd, projectRoot, signal) {
  emit("session.engineering.activity", {
    activity: "verifying",
    label: "Verifying",
  });
  emit("session.validation.plan", {
    summary: "independent final validation",
  });
  setFinalValidationProgressHook((check) => {
    emit("session.validation.running", {
      id: check.id,
      kind: check.kind,
      check: check.id,
    });
  });
  try {
    const validation = await runIndependentFinalValidation({
      worktreePath: worktree.worktreePath,
      engineeringCwd,
      primaryRoot: projectRoot,
      signal,
    });
    for (const check of validation.checks) {
      emit("session.validation.result", {
        id: check.id,
        check: check.id,
        kind: check.kind,
        ok: check.ok,
        status: check.ok ? "PASSED" : "FAILED",
        exitCode: check.exitCode,
      });
    }
    return validation;
  } finally {
    setFinalValidationProgressHook(null);
  }
}

/**
 * @param {string} activity
 */
function labelActivity(activity) {
  return ACTIVITY_LABELS[activity] ?? activity;
}

/**
 * Strip engine identity from product-facing strings.
 * @param {string} text
 */
export function scrubEngineIdentity(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\bgoogle-antigravity\b/gi, "engine")
    .replace(/\bGoogle Antigravity\b/gi, "PATH")
    .replace(/\bAntigravity\b/gi, "PATH")
    .replace(/\bGemini\b/gi, "model");
}

/**
 * Run one AG1 engineering task against projectRoot (primary checkout).
 *
 * @param {any} prompt
 * @param {{
 *   streams?: any,
 *   taskText: string,
 *   projectRoot: string,
 *   checkoutRoot?: string,
 *   workingSubdir?: string,
 *   sessionEventEmit?: (type: string, fields?: Record<string, unknown>) => void,
 *   signal?: AbortSignal,
 *   wallClockMs?: number,
 *   cardsOwnProgress?: boolean,
 *   unicode?: boolean,
 *   sessionBaseCommit?: string | null,
 * }} options
 */
export async function runAntigravityEngineeringSession(prompt, options = {}) {
  const emit =
    typeof options.sessionEventEmit === "function"
      ? options.sessionEventEmit
      : () => {};
  const write = (text) => {
    if (options.cardsOwnProgress) return;
    try {
      prompt.write(text);
    } catch {
      // ignore
    }
  };

  const taskText =
    typeof options.taskText === "string" ? options.taskText.trim() : "";
  const projectRoot = resolve(options.projectRoot || process.cwd());
  const resumeTaskId =
    typeof options.resumeTaskId === "string" && options.resumeTaskId.trim()
      ? options.resumeTaskId.trim()
      : "";
  const taskId = resumeTaskId || randomUUID();
  const startedAt = Date.now();
  const isResume = Boolean(resumeTaskId);

  if (taskText.length === 0 && !isResume) {
    emit("session.terminal", {
      disposition: "EMPTY_TASK",
      summary: "empty task text",
    });
    return {
      exitCode: 2,
      outcome: "EMPTY_TASK",
      classification: "NOT_VERIFIED",
      engineActivityCount: 0,
    };
  }

  emit("session.task.received", {
    taskId,
    preview: taskText.slice(0, 200),
    mode: "ag1",
  });

  const boot = await ensureAg1Runtime({
    ...(options.checkoutRoot ? { packageRoot: options.checkoutRoot } : {}),
  });
  if (!boot.ok) {
    write(`${boot.message}\n`);
    emit("session.terminal", {
      disposition: boot.code,
      summary: scrubEngineIdentity(boot.message),
    });
    return {
      exitCode: 2,
      outcome: boot.code,
      classification: "NOT_VERIFIED",
    };
  }

  const venv = assertAg1VenvReady({
    ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
    ...(boot.runtimeRoot ? { runtimeRoot: boot.runtimeRoot } : {}),
    ...(boot.pythonPath ? { pythonPath: boot.pythonPath } : {}),
  });
  if (!venv.ok) {
    write(`${venv.message}\n`);
    emit("session.terminal", {
      disposition: venv.code,
      summary: scrubEngineIdentity(venv.message),
    });
    return {
      exitCode: 2,
      outcome: venv.code,
      classification: "NOT_VERIFIED",
    };
  }

  hydrateAg1CloudEnv(process.env);
  const auth = detectAg1Auth(process.env);
  if (!auth.ok) {
    write(`${auth.message}\n`);
    emit("session.terminal", {
      disposition: "AG1_AUTH_REQUIRED",
      summary: auth.message,
    });
    return {
      exitCode: 2,
      outcome: "AG1_AUTH_REQUIRED",
      classification: "NOT_VERIFIED",
      blocked: true,
      blocker: auth.message,
    };
  }

  const admission = admitPrimaryCheckout(projectRoot);
  if (!admission.ok) {
    write(`${admission.message}\n`);
    emit("session.terminal", {
      disposition: admission.code,
      summary: admission.message,
    });
    return {
      exitCode: 2,
      outcome: admission.code,
      classification: "NOT_VERIFIED",
      blocked: true,
      blocker: admission.message,
      engineActivityCount: 0,
    };
  }

  const sessionBaseCommit =
    typeof options.sessionBaseCommit === "string" &&
    options.sessionBaseCommit.trim() !== ""
      ? options.sessionBaseCommit.trim()
      : admission.head;

  const primaryBefore = capturePrimaryFingerprint(projectRoot);
  emit("session.preflight", {
    branch: admission.branch,
    head: admission.head,
    sessionBaseCommit,
    dirtySummary: "clean",
    projectName: basename(projectRoot),
  });

  const worktree = isResume
    ? reopenTaskWorktree({
        primaryRoot: projectRoot,
        taskId,
        ...(typeof options.resumeWorktreePath === "string"
          ? { worktreePath: options.resumeWorktreePath }
          : {}),
        ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
      })
    : createTaskWorktree({
        primaryRoot: projectRoot,
        taskId,
        baselineCommit: sessionBaseCommit,
        ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
      });
  if (!worktree.ok) {
    write(`${worktree.message}\n`);
    emit("session.terminal", {
      disposition: worktree.code,
      summary: worktree.message,
    });
    return {
      exitCode: 2,
      outcome: worktree.code,
      classification: "NOT_VERIFIED",
      engineActivityCount: 0,
    };
  }

  if (isResume) {
    emit("session.hydration", {
      stage: "task_resume",
      detail: `resuming task ${worktree.taskId}`,
      mode: "PATH_RESUME",
    });
  }

  emit("session.engineering.workspace", {
    taskId: worktree.taskId,
    taskBranch: worktree.taskBranch,
    workspace: worktree.worktreePath,
    workingSubdir:
      typeof options.workingSubdir === "string" ? options.workingSubdir : "",
    engineeringCwd: resolveEngineeringCwd(
      worktree.worktreePath,
      typeof options.workingSubdir === "string" ? options.workingSubdir : "",
    ),
    baselineHead: worktree.baseline.head,
    status: "ready",
  });
  emit("session.recovery.checkpoint", {
    id: `ag1-baseline:${worktree.baseline.head}`,
    kind: "task-worktree-baseline",
  });

  const capabilityPlane = discoverCapabilityPlane(worktree.worktreePath, {
    toolRoots: [worktree.worktreePath, projectRoot],
    primaryRoot: projectRoot,
  });
  emit("session.capability.discovered", {
    matrix: compactCapabilityMatrix(capabilityPlane),
  });

  const discoveredMcp = discoverProjectMcpConfigs(worktree.worktreePath);
  const policyMcp = (Array.isArray(discoveredMcp) ? discoveredMcp : []).map(
    (server) => applyMcpTrustPolicy(server),
  );
  const enabledMcp = policyMcp.filter((s) => s && s.enabled === true);
  const deniedMcp = policyMcp.filter((s) => !s || s.enabled !== true);
  let mcpServers = toAntigravityMcpServers(enabledMcp);
  emit("session.capability.mcp", {
    enabled: enabledMcp.length,
    denied: deniedMcp.length,
    servers: enabledMcp.map((s) => ({
      name: typeof s?.name === "string" ? s.name : "",
      type: typeof s?.type === "string" ? s.type : "stdio",
      trustClass: typeof s?.trustClass === "string" ? s.trustClass : "",
    })),
  });

  const runtimeRoot = resolvePathRuntimeRoot({
    ...(options.checkoutRoot ? { packageRoot: options.checkoutRoot } : {}),
  });
  /** @type {any} */
  let preparedEnv = null;
  /** @type {typeof import("../ag9/prepare.mjs") | null} */
  let ag9Prepare = null;
  /** @type {typeof import("../ag9/services.mjs") | null} */
  let ag9Services = null;
  /** @type {typeof import("../ag9/collaborate.mjs") | null} */
  let ag9Collab = null;
  /** @type {typeof import("../ag9/copilot-engine.mjs") | null} */
  let ag9CopilotEngine = null;
  /** @type {Awaited<ReturnType<typeof import("../ag10/index.mjs").createG10Fabric>> | null} */
  let g10Fabric = null;
  try {
    ag9Prepare = await import("../ag9/prepare.mjs");
    ag9Services = await import("../ag9/services.mjs");
    ag9Collab = await import("../ag9/collaborate.mjs");
    ag9CopilotEngine = await import("../ag9/copilot-engine.mjs");
    preparedEnv = await ag9Prepare.prepareEngineeringEnvironment({
      projectRoot,
      worktreePath: worktree.worktreePath,
      runtimeRoot,
      plane: capabilityPlane,
      taskText,
      signal: options.signal,
      startServices: true,
      emit: (event) => {
        if (event && typeof event.type === "string") {
          emit(event.type, event);
        }
      },
    });
  } catch (err) {
    emit("session.capability.preparing", {
      detail: "environment preparation failed; continuing with discovery-only",
      error: scrubEngineIdentity(
        err && typeof err === "object" && "message" in err
          ? String(/** @type {{ message?: unknown }} */ (err).message)
          : String(err),
      ).slice(0, 160),
    });
  }

  try {
    const ag10 = await import("../ag10/index.mjs");
    const resumeObjective =
      taskText ||
      (isResume
        ? ag10.readTaskCheckpoint(runtimeRoot, worktree.taskId)?.objective || ""
        : "");
    g10Fabric = await ag10.createG10Fabric({
      runtimeRoot,
      taskId: worktree.taskId,
      sessionId: worktree.taskId,
      worktreePath: worktree.worktreePath,
      repoRoot: projectRoot,
      objective: resumeObjective || taskText,
      wallClockMs: options.wallClockMs ?? AG1_DEFAULT_WALL_CLOCK_MS,
      toolEnv:
        preparedEnv?.toolEnv && typeof preparedEnv.toolEnv === "object"
          ? /** @type {Record<string, string>} */ (preparedEnv.toolEnv)
          : undefined,
      preferCopilotSdk: options.preferCopilotSdk !== false,
      emit: (event) => {
        if (event && typeof event.type === "string") {
          emit(event.type, event);
        }
      },
    });
    if (isResume) {
      const reconciled = g10Fabric.reconcileResume();
      emit("session.hydration", {
        stage: "reality_reconcile",
        detail: reconciled.status,
        mode: reconciled.agSessionMode,
      });
    }
    // Best-effort Copilot SDK attach (falls back to CLI without failing the task).
    try {
      await g10Fabric.attachCopilot();
    } catch {
      /* optional peer */
    }
  } catch {
    g10Fabric = null;
  }

  const g8Brief =
    typeof capabilityPlane?.briefForEngine === "string"
      ? capabilityPlane.briefForEngine
      : "";
  const capabilityBrief = [
    g8Brief,
    preparedEnv?.capabilityBrief ? String(preparedEnv.capabilityBrief) : "",
    preparedEnv?.mcpServersExtra?.length
      ? "PATH code intelligence MCP (path-scip) is available: use code_search_symbol / code_definition / code_references for cross-package navigation before editing."
      : "",
  ]
    .filter((s) => s.trim())
    .join("\n\n")
    .slice(0, 8000);

  if (preparedEnv && Array.isArray(preparedEnv.mcpServersExtra)) {
    /** @type {object[]} */
    const pathOwnedEnabled = [];
    for (const extra of preparedEnv.mcpServersExtra) {
      const trusted = applyMcpTrustPolicy({
        ...extra,
        tools: Array.isArray(extra?.enabled_tools)
          ? extra.enabled_tools.map((name) => ({
              name,
              description: "read-only code intelligence",
            }))
          : [{ name: "code_search_symbol", description: "read-only symbol search" }],
      });
      if (trusted.enabled) {
        pathOwnedEnabled.push(trusted);
        mcpServers = [
          ...mcpServers,
          ...toAntigravityMcpServers([trusted]),
        ];
      }
    }
    if (pathOwnedEnabled.length > 0) {
      emit("session.capability.mcp", {
        enabled: pathOwnedEnabled.length,
        denied: 0,
        source: "path_runtime",
        servers: pathOwnedEnabled.map((s) => ({
          name: typeof s?.name === "string" ? s.name : "",
          type: typeof s?.type === "string" ? s.type : "stdio",
          trustClass: typeof s?.trustClass === "string" ? s.trustClass : "",
        })),
      });
    }
  }

  /** @type {Record<string, string> | null} */
  const toolEnv =
    preparedEnv?.toolEnv && typeof preparedEnv.toolEnv === "object"
      ? /** @type {Record<string, string>} */ (preparedEnv.toolEnv)
      : null;

  const sandbox = proveLocalSandboxConfinement({
    ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
  });
  const allowShell = sandbox.allowShell === true;
  if (!allowShell) {
    write(
      "Local command sandbox not proven — autonomous shell disabled (fail closed).\n",
    );
    emit("session.engineering.activity", {
      activity: "diagnosing",
      label: "Diagnosing",
      detail: "shell confinement unavailable",
    });
  }

  const ac = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) ac.abort();
    else {
      options.signal.addEventListener("abort", () => ac.abort(), { once: true });
    }
  }

  const pollCancel = setInterval(() => {
    if (typeof prompt?.isStopped === "function" && prompt.isStopped()) {
      ac.abort();
      return;
    }
    if (
      typeof prompt?.isCycleCancelRequested === "function" &&
      prompt.isCycleCancelRequested()
    ) {
      ac.abort();
    }
  }, 250);
  if (typeof pollCancel.unref === "function") pollCancel.unref();

  let agentFinished = false;
  let agentFailed = false;
  let agentCancelled = false;
  let lastActivity = "understanding";
  let engineActivityCount = 0;
  /** @type {(value: Record<string, unknown>) => void} */
  let resolveTerminal = () => {};
  /** @type {Promise<Record<string, unknown>>} */
  let waitForTerminal = new Promise((resolveWait) => {
    resolveTerminal = resolveWait;
  });
  function armTerminalWait() {
    agentFinished = false;
    waitForTerminal = new Promise((resolveWait) => {
      resolveTerminal = resolveWait;
    });
    return waitForTerminal;
  }

  const wallMs = options.wallClockMs ?? AG1_DEFAULT_WALL_CLOCK_MS;
  const wallTimer = setTimeout(() => {
    agent.cancel();
    resolveTerminal({ type: "failed", code: "BUDGET_WALL_CLOCK" });
  }, wallMs);
  if (typeof wallTimer.unref === "function") wallTimer.unref();

  const agent = createAntigravityEngineeringAgent({
    ...(options.checkoutRoot ? { checkoutRoot: options.checkoutRoot } : {}),
    onEvent: (msg) => {
      try {
        g10Fabric?.onAntigravityBridgeEvent?.(msg);
      } catch {
        /* ignore */
      }
      const type = msg.type;
      if (type === "started") {
        emit("session.engineering.bridge", {
          stage: "sdk_session",
          detail: "engineering session started",
        });
        engineActivityCount += 1;
        emit("session.engineering.activity", {
          activity: "understanding",
          label: labelActivity("understanding"),
        });
      } else if (type === "activity") {
        const activity =
          typeof msg.activity === "string" ? msg.activity : "inspecting";
        lastActivity = activity;
        engineActivityCount += 1;
        emit("session.engineering.activity", {
          activity,
          label: labelActivity(activity),
          tool: typeof msg.tool === "string" ? msg.tool : undefined,
          detail:
            typeof msg.detail === "string"
              ? msg.detail
              : typeof msg.tool === "string"
                ? msg.tool
                : undefined,
        });
        if (activity === "editing") {
          emit("session.applying", { summary: "editing in task workspace" });
        } else if (activity === "inspecting") {
          emit("session.reading", { files: [] });
        }
      } else if (type === "tool") {
        engineActivityCount += 1;
        emit("session.engineering.tool", {
          kind: msg.kind,
          tool: msg.tool,
          summary: scrubEngineIdentity(String(msg.summary ?? "")),
        });
        if (msg.kind === "file_edit") {
          emit("session.edit.summary", {
            path: String(msg.summary ?? "").slice(0, 120),
            kind: "edit",
          });
        }
      } else if (type === "finished") {
        agentFinished = true;
        emit("session.engineering.activity", {
          activity: "complete",
          label: "Finishing",
        });
        resolveTerminal(msg);
      } else if (type === "failed") {
        agentFailed = true;
        emit("session.engineering.activity", {
          activity: "failed",
          label: "Failed",
          detail: scrubEngineIdentity(String(msg.message ?? msg.code ?? "")),
        });
        resolveTerminal(msg);
      } else if (type === "cancelled") {
        agentCancelled = true;
        emit("session.cancelled", { reason: "operator_or_bridge" });
        resolveTerminal(msg);
      }
    },
    onDiagnostic: (kind, text) => {
      // Development evidence file only — never living UI / never secrets.
      if (kind === "stderr" || kind === "bridge_exit" || kind === "spawn_error") {
        emit("session.engineering.bridge", {
          stage: kind,
          detail: scrubEngineIdentity(String(text).slice(0, 120)),
        });
      }
    },
  });

  const agBind = g10Fabric?.attachAntigravity?.(agent) || null;

  ac.signal.addEventListener(
    "abort",
    () => {
      agentCancelled = true;
      agent.cancel();
      resolveTerminal({ type: "cancelled" });
    },
    { once: true },
  );

  write("PATH Engineering Session · bounded autonomy\n");
  emit("session.engineering.activity", {
    activity: "understanding",
    label: "Understanding",
  });
  engineActivityCount += 1;

  emit("session.engineering.bridge", {
    stage: "spawn",
    detail: "starting engineering bridge",
  });

  const engineeringCwd = resolveEngineeringCwd(
    worktree.worktreePath,
    typeof options.workingSubdir === "string" ? options.workingSubdir : "",
  );

  const effectiveTaskText =
    (typeof taskText === "string" && taskText.trim()) ||
    g10Fabric?.getCheckpoint?.()?.objective ||
    "Continue PATH engineering from current task reality.";

  const startPayload = {
    taskId,
    workspace: worktree.worktreePath,
    defaultCwd: engineeringCwd,
    task: effectiveTaskText,
    allowShell,
    budget: {
      maxModelCalls: AG1_DEFAULT_MAX_MODEL_CALLS,
      maxToolCalls: AG1_DEFAULT_MAX_TOOL_CALLS,
      wallClockMs: wallMs,
    },
    ...(mcpServers.length > 0 ? { mcpServers } : {}),
    ...(capabilityBrief ? { capabilityBrief } : {}),
    ...(toolEnv ? { toolEnv } : {}),
  };

  const startEnvelope = agBind
    ? await agBind.startOrRehydrate({
        workspace: startPayload.workspace,
        defaultCwd: startPayload.defaultCwd,
        task: startPayload.task,
        allowShell: startPayload.allowShell,
        budget: startPayload.budget,
        mcpServers: startPayload.mcpServers,
        capabilityBrief: startPayload.capabilityBrief,
        toolEnv: startPayload.toolEnv,
        resumeFromCheckpoint: isResume,
        resumeBrief: isResume
          ? g10Fabric?.reconcileResume?.()?.resumeBrief
          : undefined,
      })
    : null;
  const startResult = startEnvelope
    ? startEnvelope.result || {
        ok: false,
        code: "AG_START_FAILED",
        message: startEnvelope.detail || "Antigravity start failed",
      }
    : await agent.startTask(startPayload);
  if (!startResult.ok) {
    clearTimeout(wallTimer);
    clearInterval(pollCancel);
    const diagHint =
      typeof agent.getDiagFile === "function" ? agent.getDiagFile() : "";
    emit("session.engineering.bridge", {
      stage: "spawn_failed",
      detail: scrubEngineIdentity(startResult.message || startResult.code || ""),
    });
    emit("session.terminal", {
      disposition: startResult.code,
      summary: scrubEngineIdentity(
        `${startResult.message || "bridge start failed"}${diagHint ? ` (diag: ${diagHint})` : ""}`,
      ),
    });
    try {
      await agent.close();
    } catch {
      // ignore
    }
    return {
      exitCode: 2,
      outcome: startResult.code,
      classification: "NOT_VERIFIED",
      engineActivityCount,
    };
  }

  emit("session.engineering.bridge", {
    stage: "start_written",
    detail: `pid=${startResult.pid ?? "?"} python=ok`,
  });

  let terminalMsg = await waitForTerminal;

  if (terminalMsg?.type === "cancelled" || ac.signal.aborted) {
    agentCancelled = true;
  }

  /** @type {Awaited<ReturnType<typeof runIndependentFinalValidation>> | null} */
  let validation = null;
  /** @type {string} */
  let engineeringHandoffSummary = "";
  let repairAttempts = 0;

  while (
    !agentCancelled &&
    !agentFailed &&
    (agentFinished || terminalMsg?.type === "finished")
  ) {
    const finishedSummary =
      typeof terminalMsg?.summary === "string" ? terminalMsg.summary : "";
    if (finishedSummary) {
      const handoff = extractEngineeringHandoff(finishedSummary);
      if (handoff?.summary) {
        engineeringHandoffSummary = handoff.summary;
        emit("session.engineering.handoff", {
          summary: engineeringHandoffSummary,
        });
      }
    }

    validation = await runSessionValidation(
      emit,
      worktree,
      engineeringCwd,
      projectRoot,
      ac.signal,
    );

    const hasFailingChecks =
      Array.isArray(validation?.checks) &&
      validation.checks.some((c) => c && c.ok !== true);
    const wallBudgetRemainingMs = wallMs - (Date.now() - startedAt);

    // G10: drain mid-cycle operator steering into the fabric queue.
    if (g10Fabric && typeof prompt?.drainSteering === "function") {
      for (const line of prompt.drainSteering()) {
        g10Fabric.acceptSteering(line);
      }
      g10Fabric.applySteeringBoundary();
    }
    try {
      g10Fabric?.persist?.({
        latestEngineTurn: "validation",
        validation: {
          classification: validation?.classification,
          failing:
            Array.isArray(validation?.checks)
              ? validation.checks.filter((c) => c && c.ok !== true).length
              : 0,
        },
      });
    } catch {
      /* ignore */
    }
    const attemptRepair = shouldAttemptSameSessionRepair({
      classification: validation?.classification,
      attempts: repairAttempts,
      maxAttempts: AG8_MAX_REPAIR_ATTEMPTS,
      aborted: ac.signal.aborted || agentCancelled,
      hasFailingChecks,
      wallBudgetRemainingMs,
    });

    if (!attemptRepair) {
      break;
    }

    emit("session.engineering.activity", {
      activity: "repairing",
      label: "Repairing",
      detail: "final validation failure",
    });

    const copilotReady = Boolean(
      g10Fabric?.getCopilot?.()?.getMode?.() === "native_sdk" ||
        g10Fabric?.getCopilot?.()?.getMode?.() === "cli_fallback" ||
        ag9CopilotEngine?.isCopilotEngineeringReady?.(),
    );
    const engineChoice =
      ag9Collab?.chooseCollabEngine?.({
        attempt: repairAttempts,
        copilotReady,
      }) || "antigravity";
    const journalEntries =
      ag9Collab?.readCollabJournal?.({
        runtimeRoot,
        taskId: worktree.taskId,
      }) || [];
    const collabHandoff = ag9Collab?.formatCollabHandoff?.(journalEntries) || "";
    const baseRepairPrompt = buildValidationRepairPrompt(validation, {
      ...(collabHandoff ? { collabHandoff } : {}),
    });

    /** @type {string | null} */
    let peerNotes = null;

    if (engineChoice === "copilot") {
      emit("session.capability.collaborate", {
        engine: "copilot",
        phase: "turn",
        label: "Collaborative engineering",
        detail: "Copilot engineering turn",
      });
      /** @type {boolean} */
      let copilotTurnOk = false;
      try {
        const turnBudgetMs = Math.min(
          180_000,
          Math.max(45_000, wallBudgetRemainingMs - 20_000),
        );
        const repairPrompt = [
          "You are a full collaborating engineering engine in this PATH task worktree.",
          "You may inspect, edit, build, test, and repair code inside this workspace.",
          "Do not push, open PRs, deploy, or leave the worktree.",
          "Fix the independent validation failures below, then stop.",
          "",
          baseRepairPrompt,
        ].join("\n");

        const turn = g10Fabric
          ? await g10Fabric.runCopilotCollabTurn({
              prompt: repairPrompt,
              timeoutMs: turnBudgetMs,
            })
          : await (ag9Collab?.withCollabTurn
              ? ag9Collab.withCollabTurn(
                  {
                    runtimeRoot,
                    taskId: worktree.taskId,
                    engine: "copilot",
                    timeoutMs: turnBudgetMs + 30_000,
                  },
                  async () =>
                    ag9CopilotEngine.runCopilotEngineeringTurn({
                      prompt: repairPrompt,
                      cwd: engineeringCwd,
                      toolEnv: preparedEnv?.toolEnv || undefined,
                      timeoutMs: turnBudgetMs,
                    }),
                )
              : ag9CopilotEngine?.runCopilotEngineeringTurn?.({
                  prompt: repairPrompt,
                  cwd: engineeringCwd,
                  toolEnv: preparedEnv?.toolEnv || undefined,
                  timeoutMs: turnBudgetMs,
                }));
        if (turn?.ok) {
          copilotTurnOk = true;
          peerNotes =
            typeof turn.text === "string" && turn.text.trim()
              ? turn.text.trim().slice(0, 2_000)
              : turn.detail || "Copilot turn completed";
          emit("session.capability.collaborate", {
            engine: "copilot",
            phase: "done",
            label: "Collaborative engineering",
            detail:
              turn.mode === "cli_fallback"
                ? "Copilot CLI harness turn done (SDK fallback)"
                : turn.detail || "Copilot turn done",
            mode: turn.mode || undefined,
          });
          if (turn.breaker?.action === "stop_auto_bounce") {
            emit("session.terminal", {
              disposition: "NEEDS_DIRECTION",
              summary: "NO_PROGRESS_COLLABORATION",
            });
            break;
          }
        } else if (turn?.code === "AUTH_REQUIRED") {
          emit("session.terminal", {
            disposition: "AUTH_REQUIRED",
            summary: "Copilot authentication required; task preserved",
          });
          try {
            g10Fabric?.persist?.({
              copilotMode: "auth_required",
              finalState: undefined,
            });
          } catch {
            /* ignore */
          }
          // Do not destroy task; fall through to Antigravity peer.
        } else {
          emit("session.capability.collaborate", {
            engine: "copilot",
            phase: "fallback",
            label: "Collaborative engineering",
            detail: turn?.detail || "Copilot unavailable; continuing with peer",
          });
          try {
            const advisory = await runCopilotAdvisory({
              question: [
                "Provide concise engineering notes for a collaborating peer (plain text).",
                "Focus on the concrete fix for the validation failures.",
                "",
                baseRepairPrompt.slice(0, 2_000),
              ].join("\n"),
              cwd: engineeringCwd,
              timeoutMs: 60_000,
            });
            if (advisory?.ok && advisory.text?.trim()) {
              peerNotes = advisory.text.trim();
            }
          } catch {
            /* optional */
          }
        }
      } catch {
        emit("session.capability.collaborate", {
          engine: "copilot",
          phase: "error",
          label: "Collaborative engineering",
          detail: "Copilot turn error; Antigravity continues",
        });
      }

      if (copilotTurnOk) {
        // Re-validate after Copilot mutated the shared worktree.
        repairAttempts += 1;
        continue;
      }
      // Fall through to Antigravity with any peer notes.
    }

    // Antigravity collaborative repair turn (lease + continueTask).
    emit("session.capability.collaborate", {
      engine: "antigravity",
      phase: "turn",
      label: "Collaborative engineering",
      detail: "Antigravity engineering turn",
    });
    const steeringText = g10Fabric?.applySteeringBoundary?.()?.combinedText || "";
    const mergedPeerNotes = [peerNotes, steeringText].filter(Boolean).join("\n") || null;
    const feedback = buildValidationRepairPrompt(validation, {
      ...(mergedPeerNotes ? { peerNotes: mergedPeerNotes } : {}),
      ...(collabHandoff ? { collabHandoff } : {}),
    });
    try {
      const runAntigravityTurn = async () => {
        armTerminalWait();
        if (agBind?.isLive?.()) {
          const cont = agBind.continueNative({ text: feedback });
          if (!cont.ok) {
            await agBind.resumeOrRehydrate({
              text: feedback,
              rehydrate: {
                workspace: worktree.worktreePath,
                defaultCwd: engineeringCwd,
                task: effectiveTaskText,
                allowShell,
                budget: {
                  maxModelCalls: AG1_DEFAULT_MAX_MODEL_CALLS,
                  maxToolCalls: AG1_DEFAULT_MAX_TOOL_CALLS,
                  wallClockMs: wallBudgetRemainingMs,
                },
                ...(mcpServers.length > 0 ? { mcpServers } : {}),
                ...(capabilityBrief ? { capabilityBrief } : {}),
                ...(toolEnv ? { toolEnv } : {}),
                resumeBrief: g10Fabric?.reconcileResume?.()?.resumeBrief,
              },
            });
          }
        } else {
          agent.continueTask({ text: feedback });
        }
        terminalMsg = await waitForTerminal;
        return {
          detail: String(terminalMsg?.type || "finished"),
          changedFiles: [],
        };
      };
      if (g10Fabric?.runAntigravityCollabTurn) {
        const leased = await g10Fabric.runAntigravityCollabTurn({
          runTurn: runAntigravityTurn,
          timeoutMs: Math.min(wallBudgetRemainingMs, 240_000),
        });
        if (leased?.breaker?.action === "stop_auto_bounce") {
          emit("session.terminal", {
            disposition: "NEEDS_DIRECTION",
            summary: "NO_PROGRESS_COLLABORATION",
          });
          break;
        }
      } else if (ag9Collab?.withCollabTurn) {
        await ag9Collab.withCollabTurn(
          {
            runtimeRoot,
            taskId: worktree.taskId,
            engine: "antigravity",
            timeoutMs: Math.min(wallBudgetRemainingMs, 240_000),
          },
          runAntigravityTurn,
        );
      } else {
        await runAntigravityTurn();
      }
    } catch {
      armTerminalWait();
      agent.continueTask({ text: feedback });
      terminalMsg = await waitForTerminal;
    }
    emit("session.capability.collaborate", {
      engine: "antigravity",
      phase: "done",
      label: "Collaborative engineering",
      detail: String(terminalMsg?.type || "done"),
    });
    repairAttempts += 1;

    if (terminalMsg?.type === "cancelled" || ac.signal.aborted) {
      agentCancelled = true;
      break;
    }
    if (terminalMsg?.type === "failed") {
      agentFailed = true;
      break;
    }
    if (!(agentFinished || terminalMsg?.type === "finished")) {
      break;
    }
  }

  try {
    agent.signalDone();
  } catch {
    // ignore
  }

  clearTimeout(wallTimer);
  clearInterval(pollCancel);

  if (agentCancelled) {
    emit("session.validation.skipped", { reason: "cancelled" });
  } else if (agentFailed && !validation) {
    emit("session.validation.skipped", {
      reason: String(terminalMsg?.code ?? "engine_failed"),
    });
  }

  const gitResult = collectWorktreeResult(
    worktree.worktreePath,
    worktree.baseline.head,
  );
  const primaryAfter = capturePrimaryFingerprint(projectRoot);
  const untouched = primaryUntouched(primaryBefore, primaryAfter);

  /** @type {string} */
  let classification;
  /** @type {string} */
  let terminalDisposition;
  /** @type {string} */
  let terminalSummary;

  if (agentCancelled) {
    classification = "NOT_VERIFIED";
    terminalDisposition = "CANCELLED";
    terminalSummary = "cancelled";
  } else if (agentFailed || terminalMsg?.type === "failed") {
    classification = "FAILED";
    terminalDisposition = String(terminalMsg?.code || "AG1_ENGINE_FAILED");
    terminalSummary = scrubEngineIdentity(
      String(terminalMsg?.message || terminalMsg?.code || "engineering failed"),
    );
  } else {
    classification = classifyAg1Result({
      agentFinished: agentFinished || terminalMsg?.type === "finished",
      validation,
    });
    terminalDisposition = classification;
    terminalSummary =
      validation?.reason ?? String(terminalMsg?.type ?? lastActivity);
  }

  if (
    (agentFinished || terminalMsg?.type === "finished") &&
    !validation &&
    classification === "VERIFIED"
  ) {
    throw new Error("AG1 invariant violated: finished implied VERIFIED");
  }

  const hasChanges = gitResult.changedFiles.length > 0;
  /** @type {string | null} */
  let commitSha = null;
  /** @type {string | null} */
  let commitStatus = null;
  /** @type {string | null} */
  let preservedPath = null;
  let advancesSession = false;

  if (classification === "VERIFIED") {
    if (hasChanges) {
      const committed = commitTaskWorktree({
        worktreePath: worktree.worktreePath,
        message: `PATH: verified task ${worktree.taskId}`,
      });
      if (!committed.ok) {
        if (committed.code === "GIT_IDENTITY_REQUIRED") {
          terminalDisposition = "GIT_IDENTITY_REQUIRED";
          terminalSummary = committed.message;
          preservedPath = worktree.worktreePath;
          commitStatus = "IDENTITY_BLOCKED";
        } else {
          terminalDisposition = String(committed.code || "GIT_COMMIT_FAILED");
          terminalSummary = String(committed.message || "commit failed");
          preservedPath = worktree.worktreePath;
          commitStatus = "COMMIT_FAILED";
        }
      } else if (!committed.skipped && committed.commitSha) {
        commitSha = committed.commitSha;
        commitStatus = "VERIFIED";
        advancesSession = true;
      } else {
        // Verified with no file changes — still a truthful terminal, no commit.
        commitStatus = "NO_CHANGES";
        advancesSession = true;
        commitSha = worktree.baseline.head;
      }
    } else {
      commitStatus = "NO_CHANGES";
      advancesSession = true;
      commitSha = worktree.baseline.head;
    }
  } else if (
    hasChanges &&
    (classification === "PARTIALLY_VERIFIED" ||
      classification === "FAILED" ||
      terminalDisposition === "CANCELLED" ||
      classification === "NOT_VERIFIED")
  ) {
    const label =
      classification === "PARTIALLY_VERIFIED"
        ? "PARTIALLY VERIFIED"
        : "UNVERIFIED";
    const committed = commitTaskWorktree({
      worktreePath: worktree.worktreePath,
      message: `PATH WIP: preserve ${label.toLowerCase()} task ${worktree.taskId}`,
    });
    if (!committed.ok) {
      if (committed.code === "GIT_IDENTITY_REQUIRED") {
        preservedPath = worktree.worktreePath;
        commitStatus = "IDENTITY_BLOCKED";
        write(`${committed.message}\n`);
      } else {
        preservedPath = worktree.worktreePath;
        commitStatus = "COMMIT_FAILED";
      }
    } else if (!committed.skipped && committed.commitSha) {
      commitSha = committed.commitSha;
      commitStatus = label;
    }
  }

  /** @type {{ ok: boolean, code?: string } | null} */
  let cleanup = null;
  if (preservedPath) {
    cleanup = {
      ok: false,
      code: "CLEANUP_DEFERRED",
    };
  } else {
    cleanup = removeTaskWorktree(projectRoot, worktree.worktreePath);
    if (!cleanup.ok) {
      emit("session.engineering.cleanup", {
        status: "CLEANUP_INCOMPLETE",
        worktreePath: worktree.worktreePath,
        taskBranch: worktree.taskBranch,
        commitSha,
      });
    }
  }

  const checkSummaries = Array.isArray(validation?.checks)
    ? validation.checks.map((c) => ({
        id: c.id,
        kind: c.kind,
        ok: c.ok,
        exitCode: c.exitCode,
        command: c.command,
      }))
    : [];

  const baselineSha = worktree.baseline.head;
  const inspectCommand = buildFullResultInspectCommand({
    baselineSha,
    resultSha: commitSha,
  });
  const preview = buildBoundedDiffPreview(gitResult.diff || "", {
    changedFiles: gitResult.changedFiles,
  });

  emit("session.engineering.result", {
    classification:
      terminalDisposition === "GIT_IDENTITY_REQUIRED"
        ? classification
        : classification,
    changedFiles: gitResult.changedFiles,
    primaryUntouched: untouched,
    durationMs: Date.now() - startedAt,
    allowShell,
    sandbox: sandbox.code,
    taskBranch: worktree.taskBranch,
    commitSha,
    baselineSha,
    commitStatus,
    advancesSession,
    checks: checkSummaries,
    inspectCommand,
    preservedArtifact: preservedPath || null,
    diffPreviewLines: preview.lines,
    diffPreviewTruncated: preview.truncated,
    diffPreviewShownFiles: preview.shownFiles,
  });

  const durableSummary = formatAg2ResultBanner({
    classification:
      terminalDisposition === "CANCELLED"
        ? "CANCELLED"
        : terminalDisposition === "GIT_IDENTITY_REQUIRED"
          ? "GIT_IDENTITY_REQUIRED"
          : classification,
    changedFiles: gitResult.changedFiles,
    validation,
    taskBranch: worktree.taskBranch,
    commitSha,
    baselineSha,
    commitStatus,
    primaryUntouched: untouched,
    preservedPath,
    cleanup,
    inspectCommand,
    diffPreview: preview,
    engineeringHandoff: engineeringHandoffSummary,
  });
  // When the living TUI owns stdout, defer the durable summary until after
  // alternate-screen exit (pathcode prints durableSummary).
  if (!options.cardsOwnProgress) {
    write(`\n${durableSummary}`);
  }

  emit("session.terminal", {
    disposition:
      terminalDisposition === "CANCELLED"
        ? "CANCELLED"
        : terminalDisposition === "GIT_IDENTITY_REQUIRED"
          ? "GIT_IDENTITY_REQUIRED"
          : classification,
    summary: terminalSummary,
    taskBranch: worktree.taskBranch,
    commitSha,
  });

  try {
    if (preparedEnv?.services?.projectKey && ag9Services?.stopDisposableServices) {
      ag9Services.stopDisposableServices({
        runtimeRoot,
        projectKey: String(preparedEnv.services.projectKey),
        projectRoot: worktree.worktreePath,
      });
    }
  } catch {
    // Service cleanup must not crash the session.
  }

  try {
    const finalState =
      classification === "VERIFIED"
        ? "VERIFIED"
        : agentCancelled
          ? "CANCELLED"
          : terminalDisposition === "NEEDS_DIRECTION" ||
              terminalDisposition === "AUTH_REQUIRED"
            ? "BLOCKED"
            : "FAILED";
    g10Fabric?.markFinal?.(finalState, {
      validation: {
        classification,
        disposition: terminalDisposition,
      },
      agSessionMode: agBind?.getMode?.() || undefined,
      copilotMode: g10Fabric?.getCopilot?.()?.getMode?.() || undefined,
    });
    await g10Fabric?.shutdown?.();
  } catch {
    /* ignore */
  }

  try {
    await agent.close();
  } catch {
    // Cancellation/close races must not crash the REPL.
  }

  const exitCode = agentCancelled
    ? 130
    : terminalDisposition === "GIT_IDENTITY_REQUIRED"
      ? 2
      : classification === "VERIFIED" || classification === "PARTIALLY_VERIFIED"
        ? 0
        : 1;

  return {
    exitCode,
    outcome:
      terminalDisposition === "CANCELLED"
        ? "CANCELLED"
        : terminalDisposition === "GIT_IDENTITY_REQUIRED"
          ? "GIT_IDENTITY_REQUIRED"
          : classification,
    classification:
      terminalDisposition === "CANCELLED" ? "NOT_VERIFIED" : classification,
    taskId: worktree.taskId,
    taskBranch: worktree.taskBranch,
    commitSha,
    commitStatus,
    advancesSession,
    durableSummary,
    sessionBaseCommit: advancesSession
      ? commitSha || worktree.baseline.head
      : null,
    baselineCommit: worktree.baseline.head,
    worktreePath: preservedPath || (cleanup?.ok ? null : worktree.worktreePath),
    cleanup,
    changedFiles: gitResult.changedFiles,
    diff: gitResult.diff,
    validation,
    primaryUntouched: untouched,
    allowShell,
    durationMs: Date.now() - startedAt,
    engineActivityCount,
    modelCalls: 0,
    diagFile: typeof agent.getDiagFile === "function" ? agent.getDiagFile() : null,
  };
}

/**
 * Product-facing result banner (no engine branding).
 * @param {Record<string, any>} r
 */
function formatAg2ResultBanner(r) {
  const lines = [];
  const label =
    r.classification === "VERIFIED"
      ? "✓ VERIFIED"
      : r.classification === "PARTIALLY_VERIFIED"
        ? "◐ PARTIALLY VERIFIED"
        : r.classification === "CANCELLED"
          ? "— CANCELLED"
          : r.classification === "GIT_IDENTITY_REQUIRED"
            ? "✕ GIT IDENTITY REQUIRED"
            : r.classification === "FAILED"
              ? "✕ FAILED"
              : "— NOT VERIFIED";
  lines.push(`Result: ${label}`);
  lines.push(`Files changed: ${r.changedFiles?.length ?? 0}`);
  const handoff =
    typeof r.engineeringHandoff === "string" ? r.engineeringHandoff.trim() : "";
  if (handoff) {
    lines.push("");
    lines.push("Engineering handoff:");
    lines.push(handoff);
  }
  if (Array.isArray(r.validation?.checks)) {
    if (handoff) lines.push("");
    lines.push("Evidence:");
    for (const c of r.validation.checks) {
      const mark = c.ok ? "✓" : "✕";
      const kind =
        c.kind === "TYPECHECK"
          ? "Typecheck"
          : c.kind === "TARGETED_TEST" || /test/i.test(String(c.id))
            ? "Tests"
            : c.kind === "BUILD" || /build/i.test(String(c.id))
              ? "Build"
              : String(c.id || c.kind || "Check");
      lines.push(`${kind}: ${mark}`);
    }
  }
  if (r.taskBranch) lines.push(`Task branch: ${r.taskBranch}`);
  if (r.baselineSha) lines.push(`Baseline: ${r.baselineSha}`);
  if (r.commitSha) lines.push(`Commit: ${r.commitSha}`);
  if (r.commitStatus && r.commitStatus !== "VERIFIED" && r.commitStatus !== "NO_CHANGES") {
    lines.push(`Status: ${r.commitStatus}`);
  }
  lines.push(
    `Primary checkout untouched: ${r.primaryUntouched ? "yes" : "NO"}`,
  );
  if (r.inspectCommand) {
    lines.push("");
    lines.push("Inspect full result:");
    lines.push(r.inspectCommand);
  } else if (r.preservedPath) {
    lines.push("");
    lines.push(`Preserved task artifact: ${r.preservedPath}`);
  }
  if (r.classification === "VERIFIED" && r.taskBranch && r.commitSha) {
    lines.push("");
    lines.push("To merge this work:");
    lines.push(`git merge ${r.taskBranch}`);
  }
  if (r.preservedPath) {
    lines.push(`Preserved worktree: ${r.preservedPath}`);
  }
  if (r.cleanup && r.cleanup.ok === false && r.cleanup.code === "CLEANUP_INCOMPLETE") {
    lines.push("Cleanup: CLEANUP_INCOMPLETE");
  }
  const files = Array.isArray(r.changedFiles) ? r.changedFiles : [];
  if (files.length) {
    lines.push("");
    lines.push("Changed files:");
    for (const f of files.slice(0, 5)) {
      lines.push(`  - ${f}`);
    }
    if (files.length > 5) {
      lines.push(`  (${5} of ${files.length} changed files shown)`);
    }
  }
  const preview = r.diffPreview;
  if (preview && Array.isArray(preview.lines) && preview.lines.length > 0) {
    lines.push("");
    lines.push("Diff preview:");
    for (const line of preview.lines) {
      lines.push(line);
    }
    if (preview.truncated) {
      lines.push("Diff preview truncated");
      if (preview.fileTruncated) {
        lines.push(
          `${preview.shownFiles} of ${preview.totalFiles} changed files shown`,
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
